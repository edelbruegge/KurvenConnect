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
import {
  mapSupabaseTripToFeedPost,
  type SupabaseTripLikeRow,
  type SupabaseTripRequestRow,
  type SupabaseTripRow,
  type TripRequestStatus,
} from '@/lib/map-supabase-trip';
import { mapTripError } from '@/lib/trip-errors';
import { supabase } from '@/lib/supabase';

type AuthorDisplay = { displayName: string; initials: string };

type NewRemoteTripInput = {
  description: string;
  departure: string;
  destination: string;
  departureTime: string;
  freeSeats: number;
  occasion?: string;
};

type NewRemoteTripRequestInput = {
  message?: string;
};

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

  // Supabase-backed trips ("Fahrt").
  remoteTrips: FeedPost[];
  isRemoteTripsLoading: boolean;
  remoteTripsError: string | null;
  refreshRemoteTrips: () => void;
  createRemoteTrip: (input: NewRemoteTripInput) => Promise<{ error: string | null }>;
  toggleRemoteTripLike: (tripId: string) => Promise<void>;
  createRemoteTripRequest: (tripId: string, input?: NewRemoteTripRequestInput) => Promise<{ error: string | null }>;
  cancelRemoteTripRequest: (tripId: string) => Promise<{ error: string | null }>;
  updateRemoteTripRequestStatus: (requestId: string, status: TripRequestStatus) => Promise<{ error: string | null }>;
};

const FeedPostsContext = createContext<FeedPostsContextValue | undefined>(undefined);

const POST_CONTENT_MAX_LENGTH = 2000;
const COMMENT_CONTENT_MAX_LENGTH = 500;
const REMOTE_POSTS_LIMIT = 50;
const REMOTE_TRIPS_LIMIT = 50;

const POSTS_SELECT_COLUMNS = 'id, author_id, content, category, created_at, updated_at';
const COMMENTS_SELECT_COLUMNS = 'id, post_id, author_id, content, created_at, updated_at';
const LIKES_SELECT_COLUMNS = 'post_id, user_id, created_at';

const TRIPS_SELECT_COLUMNS = 'id, owner_id, departure, destination, departure_time, seats_available, occasion, description, created_at, updated_at';
const TRIP_LIKES_SELECT_COLUMNS = 'trip_id, user_id, created_at';
const TRIP_REQUESTS_SELECT_COLUMNS = 'id, trip_id, requester_id, message, status, created_at, updated_at';

const NOT_SIGNED_IN_ERROR = 'Bitte melde dich an, um das zu tun.';
const UNKNOWN_AUTHOR_DISPLAY: AuthorDisplay = { displayName: 'Unbekanntes Mitglied', initials: '?' };

function withLocalSource(post: FeedPost): FeedPost {
  return {
    ...post,
    source: 'local',
    comments: post.comments.map((comment) => ({ ...comment, source: 'local' })),
  };
}

function getCreatedAtMs(post: FeedPost): number {
  return post.createdAtIso ? new Date(post.createdAtIso).getTime() : 0;
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

  const [remoteTrips, setRemoteTrips] = useState<FeedPost[]>([]);
  const [isRemoteTripsLoading, setIsRemoteTripsLoading] = useState(false);
  const [remoteTripsError, setRemoteTripsError] = useState<string | null>(null);
  const [tripsReloadToken, setTripsReloadToken] = useState(0);
  const [ownTripRequestIdByTripId, setOwnTripRequestIdByTripId] = useState<Record<string, string>>({});
  const inFlightTripLikeIds = useRef<Set<string>>(new Set());

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

      setRemoteAuthorProfiles((current) => ({ ...current, ...authorDisplayById }));
      setRemotePosts(mappedPosts);
      setIsRemotePostsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  useEffect(() => {
    if (!authUserId) {
      setRemoteTrips([]);
      setRemoteAuthorProfiles({});
      setIsRemoteTripsLoading(false);
      setRemoteTripsError(null);
      setOwnTripRequestIdByTripId({});
      return;
    }

    let isCurrent = true;
    setIsRemoteTripsLoading(true);
    setRemoteTripsError(null);

    (async () => {
      const { data: tripRows, error: tripsError } = await supabase
        .from('trips')
        .select(TRIPS_SELECT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(REMOTE_TRIPS_LIMIT);

      if (!isCurrent) return;

      if (tripsError) {
        setRemoteTripsError(mapTripError(tripsError));
        setRemoteTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      const trips = (tripRows ?? []) as SupabaseTripRow[];

      if (trips.length === 0) {
        setRemoteTrips([]);
        setOwnTripRequestIdByTripId({});
        setIsRemoteTripsLoading(false);
        return;
      }

      const tripIds = trips.map((trip) => trip.id);

      const [likesResult, requestsResult] = await Promise.all([
        supabase.from('trip_likes').select(TRIP_LIKES_SELECT_COLUMNS).in('trip_id', tripIds),
        supabase.from('trip_requests').select(TRIP_REQUESTS_SELECT_COLUMNS).in('trip_id', tripIds),
      ]);

      if (!isCurrent) return;

      if (likesResult.error) {
        setRemoteTripsError(mapTripError(likesResult.error));
        setRemoteTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      if (requestsResult.error) {
        setRemoteTripsError(mapTripError(requestsResult.error));
        setRemoteTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      const likes = (likesResult.data ?? []) as SupabaseTripLikeRow[];
      const requests = (requestsResult.data ?? []) as SupabaseTripRequestRow[];

      const authorIds = new Set<string>(trips.map((trip) => trip.owner_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemoteTripsError(mapTripError(profilesError));
        setRemoteTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName) };
      });

      const likeCountByTripId = new Map<string, number>();
      const likedTripIdsByCurrentUser = new Set<string>();
      likes.forEach((row) => {
        likeCountByTripId.set(row.trip_id, (likeCountByTripId.get(row.trip_id) ?? 0) + 1);
        if (row.user_id === authUserId) {
          likedTripIdsByCurrentUser.add(row.trip_id);
        }
      });

      const ownPendingRequestIdByTripId: Record<string, string> = {};
      requests.forEach((row) => {
        if (row.requester_id === authUserId && row.status === 'pending') {
          ownPendingRequestIdByTripId[row.trip_id] = row.id;
        }
      });

      const mappedTrips = trips.map((row) =>
        mapSupabaseTripToFeedPost(
          row,
          likeCountByTripId.get(row.id) ?? 0,
          likedTripIdsByCurrentUser.has(row.id),
          Boolean(ownPendingRequestIdByTripId[row.id]),
          authorDisplayById[row.owner_id] ?? UNKNOWN_AUTHOR_DISPLAY,
        ),
      );

      setRemoteAuthorProfiles((current) => ({ ...current, ...authorDisplayById }));
      setRemoteTrips(mappedTrips);
      setOwnTripRequestIdByTripId(ownPendingRequestIdByTripId);
      setIsRemoteTripsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, tripsReloadToken]);

  const refreshRemotePosts = () => {
    setReloadToken((token) => token + 1);
  };

  const refreshRemoteTrips = () => {
    setTripsReloadToken((token) => token + 1);
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

  const createRemoteTrip = async (input: NewRemoteTripInput): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const trimmedDescription = input.description.trim();
    const trimmedDeparture = input.departure.trim();
    const trimmedDestination = input.destination.trim();
    const trimmedDepartureTime = input.departureTime.trim();

    if (!trimmedDescription || !trimmedDeparture || !trimmedDestination || !trimmedDepartureTime) {
      return { error: 'Bitte fülle alle Pflichtfelder aus.' };
    }

    if (trimmedDescription.length > POST_CONTENT_MAX_LENGTH) {
      return { error: `Deine Beschreibung ist zu lang (max. ${POST_CONTENT_MAX_LENGTH} Zeichen).` };
    }

    if (!Number.isFinite(input.freeSeats) || input.freeSeats < 0) {
      return { error: 'Bitte gib eine gültige Anzahl freier Plätze ein.' };
    }

    const { data, error } = await supabase
      .from('trips')
      .insert({
        owner_id: authUserId,
        departure: trimmedDeparture,
        destination: trimmedDestination,
        departure_time: trimmedDepartureTime,
        seats_available: input.freeSeats,
        occasion: input.occasion?.trim() || null,
        description: trimmedDescription,
      })
      .select(TRIPS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapTripError(error) };
    }

    const newTrip = mapSupabaseTripToFeedPost(data as SupabaseTripRow, 0, false, false, getOwnAuthorDisplay());
    setRemoteTrips((current) => [newTrip, ...current]);
    return { error: null };
  };

  const toggleRemoteTripLike = async (tripId: string): Promise<void> => {
    if (!authUserId || inFlightTripLikeIds.current.has(tripId)) {
      return;
    }

    const trip = remoteTrips.find((entry) => entry.id === tripId);

    if (!trip) {
      return;
    }

    inFlightTripLikeIds.current.add(tripId);
    const wasLiked = trip.likedByCurrentUser;

    try {
      const { error } = wasLiked
        ? await supabase.from('trip_likes').delete().eq('trip_id', tripId).eq('user_id', authUserId)
        : await supabase.from('trip_likes').insert({ trip_id: tripId, user_id: authUserId });

      if (error) {
        // Leave UI state unchanged on error.
        return;
      }

      setRemoteTrips((current) =>
        current.map((entry) => {
          if (entry.id !== tripId) return entry;
          const nextLiked = !wasLiked;
          return { ...entry, likedByCurrentUser: nextLiked, likes: Math.max(0, entry.likes + (nextLiked ? 1 : -1)) };
        }),
      );
    } finally {
      inFlightTripLikeIds.current.delete(tripId);
    }
  };

  const createRemoteTripRequest = async (
    tripId: string,
    input?: NewRemoteTripRequestInput,
  ): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const trip = remoteTrips.find((entry) => entry.id === tripId);

    if (!trip) {
      return { error: 'Diese Fahrt existiert nicht mehr.' };
    }

    if (trip.userId === authUserId) {
      return { error: 'Du kannst keine Anfrage an deine eigene Fahrt stellen.' };
    }

    if ((trip.tripDetails?.freeSeats ?? 0) <= 0) {
      return { error: 'Für diese Fahrt sind aktuell keine Plätze frei.' };
    }

    const trimmedMessage = input?.message?.trim();

    const { data, error } = await supabase
      .from('trip_requests')
      .insert({ trip_id: tripId, requester_id: authUserId, message: trimmedMessage || null })
      .select(TRIP_REQUESTS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapTripError(error) };
    }

    const newRequest = data as SupabaseTripRequestRow;
    setRemoteTrips((current) => current.map((entry) => (entry.id === tripId ? { ...entry, rideRequestSent: true } : entry)));
    setOwnTripRequestIdByTripId((current) => ({ ...current, [tripId]: newRequest.id }));
    return { error: null };
  };

  const cancelRemoteTripRequest = async (tripId: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const requestId = ownTripRequestIdByTripId[tripId];

    if (!requestId) {
      return { error: null };
    }

    const { error } = await supabase.from('trip_requests').update({ status: 'cancelled' }).eq('id', requestId);

    if (error) {
      return { error: mapTripError(error) };
    }

    setRemoteTrips((current) => current.map((entry) => (entry.id === tripId ? { ...entry, rideRequestSent: false } : entry)));
    setOwnTripRequestIdByTripId((current) => {
      const next = { ...current };
      delete next[tripId];
      return next;
    });
    return { error: null };
  };

  const toggleRemoteTripRequest = async (tripId: string): Promise<void> => {
    const trip = remoteTrips.find((entry) => entry.id === tripId);

    if (!trip) {
      return;
    }

    if (trip.rideRequestSent) {
      await cancelRemoteTripRequest(tripId);
    } else {
      await createRemoteTripRequest(tripId);
    }
  };

  // Provided so a future owner-facing accept/reject screen can reuse this without another
  // migration — RLS already allows the trip owner to update a request's status. Not wired
  // into any screen in this step (no such UI exists yet).
  const updateRemoteTripRequestStatus = async (
    requestId: string,
    status: TripRequestStatus,
  ): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const { error } = await supabase.from('trip_requests').update({ status }).eq('id', requestId);

    if (error) {
      return { error: mapTripError(error) };
    }

    return { error: null };
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

  // Remote content first (posts and trips merged and sorted by actual creation time), then
  // local seed/created posts in their existing order — local seed timestamps are fuzzy German
  // relative strings ("vor 12 Min.") that can't be reliably parsed for cross-source sorting.
  const posts = useMemo(() => {
    const remoteCombined = [...remotePosts, ...remoteTrips].sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));

    const seenIds = new Set<string>();
    const merged: FeedPost[] = [];

    for (const post of [...remoteCombined, ...localPosts]) {
      if (seenIds.has(post.id)) continue;
      seenIds.add(post.id);
      merged.push(post);
    }

    return merged;
  }, [remotePosts, remoteTrips, localPosts]);

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
      if (post.category === 'Fahrt') {
        void toggleRemoteTripLike(postId);
      } else {
        void toggleRemoteLike(postId);
      }
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

    if (post?.source === 'supabase' && post.category === 'Beitrag') {
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

    // Trip comments are not persisted in this step (in scope only for "Beitrag"): append
    // in-memory to whichever array currently holds this post — a no-op on the other one,
    // since post IDs are unique across local posts and remote trips.
    setLocalPosts((currentPosts) =>
      currentPosts.map((post) => (post.id !== postId ? post : { ...post, comments: [...post.comments, newComment] })),
    );
    setRemoteTrips((currentTrips) =>
      currentTrips.map((trip) => (trip.id !== postId ? trip : { ...trip, comments: [...trip.comments, newComment] })),
    );

    return { error: null };
  };

  const toggleRideRequest = (postId: string) => {
    const post = getPostById(postId);

    if (post?.source === 'supabase' && post.category === 'Fahrt') {
      void toggleRemoteTripRequest(postId);
      return;
    }

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
      remoteTrips,
      isRemoteTripsLoading,
      remoteTripsError,
      refreshRemoteTrips,
      createRemoteTrip,
      toggleRemoteTripLike,
      createRemoteTripRequest,
      cancelRemoteTripRequest,
      updateRemoteTripRequestStatus,
    }),
    [
      posts,
      remotePosts,
      isRemotePostsLoading,
      remotePostsError,
      remoteTrips,
      isRemoteTripsLoading,
      remoteTripsError,
      ownTripRequestIdByTripId,
      currentUser,
      authUserId,
    ],
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
