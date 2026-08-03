import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { useProfiles } from '@/context/profile-context';
import { feedPosts, isMeetupFull, type FeedComment, type FeedPost, type NewFeedPost } from '@/data/feed-posts';
import { CURRENT_USER_ID } from '@/data/users';
import { getInitialsFromName } from '@/lib/map-supabase-profile';
import {
  mapSupabaseCommentToFeedComment,
  mapSupabasePostToFeedPost,
  type SupabaseCommentRow,
  type SupabaseLikeRow,
  type SupabasePostRow,
} from '@/lib/map-supabase-post';
import { mapPostError } from '@/lib/post-errors';
import { supabase } from '@/lib/supabase';

type AuthorDisplay = { displayName: string; initials: string };

type FeedPostsContextValue = {
  posts: FeedPost[];
  addPost: (post: NewFeedPost) => void;
  getPostById: (id: string) => FeedPost | undefined;
  findCommentById: (commentId: string) => { post: FeedPost; comment: FeedComment } | undefined;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => Promise<{ error: string | null }>;
  toggleRideRequest: (postId: string) => void;
  toggleMeetupAttendance: (postId: string) => void;

  // Supabase-backed "Beitrag" posts.
  remotePosts: FeedPost[];
  isRemotePostsLoading: boolean;
  remotePostsError: string | null;
  refreshRemotePosts: () => void;
  createRemotePost: (input: { content: string }) => Promise<{ error: string | null }>;
  addRemoteComment: (postId: string, text: string) => Promise<{ error: string | null }>;
  toggleRemoteLike: (postId: string) => Promise<void>;
  getRemoteAuthorDisplay: (userId: string) => AuthorDisplay;
};

const FeedPostsContext = createContext<FeedPostsContextValue | undefined>(undefined);

const POST_CONTENT_MAX_LENGTH = 2000;
const COMMENT_CONTENT_MAX_LENGTH = 500;
const REMOTE_POSTS_LIMIT = 50;

const POSTS_SELECT_COLUMNS = 'id, author_id, content, category, created_at, updated_at';
const COMMENTS_SELECT_COLUMNS = 'id, post_id, author_id, content, created_at, updated_at';
const LIKES_SELECT_COLUMNS = 'post_id, user_id, created_at';

const NOT_SIGNED_IN_ERROR = 'Bitte melde dich an, um das zu tun.';
const UNKNOWN_AUTHOR_DISPLAY: AuthorDisplay = { displayName: 'Unbekanntes Mitglied', initials: '?' };

function withLocalSource(post: FeedPost): FeedPost {
  return {
    ...post,
    source: 'local',
    comments: post.comments.map((comment) => ({ ...comment, source: 'local' })),
  };
}

export function FeedPostsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { currentUser } = useProfiles();

  const [localPosts, setLocalPosts] = useState<FeedPost[]>(() => feedPosts.map((post) => withLocalSource(post)));

  const [remotePosts, setRemotePosts] = useState<FeedPost[]>([]);
  const [remoteAuthorProfiles, setRemoteAuthorProfiles] = useState<Record<string, AuthorDisplay>>({});
  const [isRemotePostsLoading, setIsRemotePostsLoading] = useState(false);
  const [remotePostsError, setRemotePostsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const inFlightLikePostIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never keep showing stale remote content.
      setRemotePosts([]);
      setRemoteAuthorProfiles({});
      setIsRemotePostsLoading(false);
      setRemotePostsError(null);
      return;
    }

    let isCurrent = true;
    setIsRemotePostsLoading(true);
    setRemotePostsError(null);

    (async () => {
      const { data: postRows, error: postsError } = await supabase
        .from('posts')
        .select(POSTS_SELECT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(REMOTE_POSTS_LIMIT);

      if (!isCurrent) return;

      if (postsError) {
        setRemotePostsError(mapPostError(postsError));
        setRemotePosts([]);
        setIsRemotePostsLoading(false);
        return;
      }

      const posts = (postRows ?? []) as SupabasePostRow[];

      if (posts.length === 0) {
        setRemotePosts([]);
        setRemoteAuthorProfiles({});
        setIsRemotePostsLoading(false);
        return;
      }

      const postIds = posts.map((post) => post.id);

      const [commentsResult, likesResult] = await Promise.all([
        supabase.from('post_comments').select(COMMENTS_SELECT_COLUMNS).in('post_id', postIds).order('created_at', { ascending: true }),
        supabase.from('post_likes').select(LIKES_SELECT_COLUMNS).in('post_id', postIds),
      ]);

      if (!isCurrent) return;

      if (commentsResult.error) {
        setRemotePostsError(mapPostError(commentsResult.error));
        setRemotePosts([]);
        setIsRemotePostsLoading(false);
        return;
      }

      if (likesResult.error) {
        setRemotePostsError(mapPostError(likesResult.error));
        setRemotePosts([]);
        setIsRemotePostsLoading(false);
        return;
      }

      const comments = (commentsResult.data ?? []) as SupabaseCommentRow[];
      const likes = (likesResult.data ?? []) as SupabaseLikeRow[];

      const authorIds = new Set<string>();
      posts.forEach((post) => authorIds.add(post.author_id));
      comments.forEach((comment) => authorIds.add(comment.author_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemotePostsError(mapPostError(profilesError));
        setRemotePosts([]);
        setIsRemotePostsLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName) };
      });

      const commentsByPostId = new Map<string, FeedComment[]>();
      comments.forEach((row) => {
        const author = authorDisplayById[row.author_id] ?? UNKNOWN_AUTHOR_DISPLAY;
        const list = commentsByPostId.get(row.post_id) ?? [];
        list.push(mapSupabaseCommentToFeedComment(row, author));
        commentsByPostId.set(row.post_id, list);
      });

      const likeCountByPostId = new Map<string, number>();
      const likedPostIdsByCurrentUser = new Set<string>();
      likes.forEach((row) => {
        likeCountByPostId.set(row.post_id, (likeCountByPostId.get(row.post_id) ?? 0) + 1);
        if (row.user_id === authUserId) {
          likedPostIdsByCurrentUser.add(row.post_id);
        }
      });

      const mappedPosts = posts.map((row) =>
        mapSupabasePostToFeedPost(
          row,
          commentsByPostId.get(row.id) ?? [],
          likeCountByPostId.get(row.id) ?? 0,
          likedPostIdsByCurrentUser.has(row.id),
          authorDisplayById[row.author_id] ?? UNKNOWN_AUTHOR_DISPLAY,
        ),
      );

      setRemoteAuthorProfiles(authorDisplayById);
      setRemotePosts(mappedPosts);
      setIsRemotePostsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  const refreshRemotePosts = () => {
    setReloadToken((token) => token + 1);
  };

  const getOwnAuthorDisplay = (): AuthorDisplay => {
    if (authUserId && remoteAuthorProfiles[authUserId]) {
      return remoteAuthorProfiles[authUserId];
    }

    return { displayName: currentUser.displayName, initials: currentUser.initials };
  };

  const getRemoteAuthorDisplay = (userId: string): AuthorDisplay => remoteAuthorProfiles[userId] ?? UNKNOWN_AUTHOR_DISPLAY;

  const createRemotePost = async (input: { content: string }): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const trimmedContent = input.content.trim();

    if (!trimmedContent) {
      return { error: 'Bitte gib einen Text ein.' };
    }

    if (trimmedContent.length > POST_CONTENT_MAX_LENGTH) {
      return { error: `Dein Beitrag ist zu lang (max. ${POST_CONTENT_MAX_LENGTH} Zeichen).` };
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({ author_id: authUserId, content: trimmedContent, category: 'Beitrag' })
      .select(POSTS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapPostError(error) };
    }

    const newPost = mapSupabasePostToFeedPost(data as SupabasePostRow, [], 0, false, getOwnAuthorDisplay());
    setRemotePosts((current) => [newPost, ...current]);
    return { error: null };
  };

  const addRemoteComment = async (postId: string, text: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const trimmedText = text.trim();

    if (!trimmedText) {
      return { error: 'Bitte gib einen Kommentar ein.' };
    }

    if (trimmedText.length > COMMENT_CONTENT_MAX_LENGTH) {
      return { error: `Dein Kommentar ist zu lang (max. ${COMMENT_CONTENT_MAX_LENGTH} Zeichen).` };
    }

    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, author_id: authUserId, content: trimmedText })
      .select(COMMENTS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapPostError(error) };
    }

    const newComment = mapSupabaseCommentToFeedComment(data as SupabaseCommentRow, getOwnAuthorDisplay());
    setRemotePosts((current) =>
      current.map((post) => (post.id !== postId ? post : { ...post, comments: [...post.comments, newComment] })),
    );
    return { error: null };
  };

  const toggleRemoteLike = async (postId: string): Promise<void> => {
    if (!authUserId || inFlightLikePostIds.current.has(postId)) {
      return;
    }

    const post = remotePosts.find((entry) => entry.id === postId);

    if (!post) {
      return;
    }

    inFlightLikePostIds.current.add(postId);
    const wasLiked = post.likedByCurrentUser;

    try {
      const { error } = wasLiked
        ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', authUserId)
        : await supabase.from('post_likes').insert({ post_id: postId, user_id: authUserId });

      if (error) {
        // Leave UI state unchanged on error.
        return;
      }

      setRemotePosts((current) =>
        current.map((entry) => {
          if (entry.id !== postId) return entry;
          const nextLiked = !wasLiked;
          return { ...entry, likedByCurrentUser: nextLiked, likes: Math.max(0, entry.likes + (nextLiked ? 1 : -1)) };
        }),
      );
    } finally {
      inFlightLikePostIds.current.delete(postId);
    }
  };

  const addPost = (post: NewFeedPost) => {
    const newPost: FeedPost = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: CURRENT_USER_ID,
      user: 'Marco B.',
      initials: 'MB',
      time: 'gerade eben',
      likes: 0,
      likedByCurrentUser: false,
      comments: [],
      rideRequestSent: false,
      source: 'local',
      ...post,
    };

    setLocalPosts((current) => [newPost, ...current]);
  };

  // Remote posts first (already newest-first from the query), then local seed/created posts
  // in their existing order — local seed timestamps are fuzzy German relative strings ("vor
  // 12 Min.") that can't be reliably parsed for cross-source sorting.
  const posts = useMemo(() => {
    const seenIds = new Set<string>();
    const merged: FeedPost[] = [];

    for (const post of [...remotePosts, ...localPosts]) {
      if (seenIds.has(post.id)) continue;
      seenIds.add(post.id);
      merged.push(post);
    }

    return merged;
  }, [remotePosts, localPosts]);

  const getPostById = (id: string) => posts.find((post) => post.id === id);

  const findCommentById = (commentId: string) => {
    for (const post of posts) {
      const comment = post.comments.find((entry) => entry.id === commentId);

      if (comment) {
        return { post, comment };
      }
    }

    return undefined;
  };

  const toggleLike = (postId: string) => {
    const post = getPostById(postId);

    if (post?.source === 'supabase') {
      void toggleRemoteLike(postId);
      return;
    }

    setLocalPosts((currentPosts) =>
      currentPosts.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        const nextLiked = !post.likedByCurrentUser;

        return {
          ...post,
          likedByCurrentUser: nextLiked,
          likes: Math.max(0, post.likes + (nextLiked ? 1 : -1)),
        };
      }),
    );
  };

  const addComment = async (postId: string, text: string): Promise<{ error: string | null }> => {
    const post = getPostById(postId);

    if (post?.source === 'supabase') {
      return addRemoteComment(postId, text);
    }

    const trimmedText = text.trim();

    if (!trimmedText) {
      return { error: null };
    }

    const newComment: FeedComment = {
      id: `comment-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: CURRENT_USER_ID,
      username: 'Marco B.',
      initials: 'MB',
      text: trimmedText,
      timestamp: 'gerade eben',
      source: 'local',
    };

    setLocalPosts((currentPosts) =>
      currentPosts.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        return {
          ...post,
          comments: [...post.comments, newComment],
        };
      }),
    );

    return { error: null };
  };

  const toggleRideRequest = (postId: string) => {
    setLocalPosts((currentPosts) =>
      currentPosts.map((post) => {
        if (post.id !== postId || post.category !== 'Fahrt') {
          return post;
        }

        return {
          ...post,
          rideRequestSent: !post.rideRequestSent,
        };
      }),
    );
  };

  const toggleMeetupAttendance = (postId: string) => {
    setLocalPosts((currentPosts) =>
      currentPosts.map((post) => {
        if (post.id !== postId || post.category !== 'Treffpunkt' || !post.meetupDetails) {
          return post;
        }

        if (post.userId === CURRENT_USER_ID) {
          return post;
        }

        const details = post.meetupDetails;
        const isAttending = details.attendeeIds.includes(CURRENT_USER_ID);

        if (isAttending) {
          return {
            ...post,
            meetupDetails: { ...details, attendeeIds: details.attendeeIds.filter((id) => id !== CURRENT_USER_ID) },
          };
        }

        if (isMeetupFull(details)) {
          return post;
        }

        return {
          ...post,
          meetupDetails: { ...details, attendeeIds: [...details.attendeeIds, CURRENT_USER_ID] },
        };
      }),
    );
  };

  const value = useMemo(
    () => ({
      posts,
      addPost,
      getPostById,
      findCommentById,
      toggleLike,
      addComment,
      toggleRideRequest,
      toggleMeetupAttendance,
      remotePosts,
      isRemotePostsLoading,
      remotePostsError,
      refreshRemotePosts,
      createRemotePost,
      addRemoteComment,
      toggleRemoteLike,
      getRemoteAuthorDisplay,
    }),
    [posts, remotePosts, isRemotePostsLoading, remotePostsError, currentUser, authUserId],
  );

  return <FeedPostsContext.Provider value={value}>{children}</FeedPostsContext.Provider>;
}

export function useFeedPosts() {
  const context = useContext(FeedPostsContext);

  if (!context) {
    throw new Error('useFeedPosts must be used within a FeedPostsProvider');
  }

  return context;
}
