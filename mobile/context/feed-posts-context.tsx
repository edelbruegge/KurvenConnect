import React, { createContext, useContext, useMemo, useState } from 'react';

import { feedPosts, type FeedComment, type FeedPost, type NewFeedPost } from '@/data/feed-posts';

type FeedPostsContextValue = {
  posts: FeedPost[];
  addPost: (post: NewFeedPost) => void;
  getPostById: (id: string) => FeedPost | undefined;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => void;
  toggleRideRequest: (postId: string) => void;
};

const FeedPostsContext = createContext<FeedPostsContextValue | undefined>(undefined);

export function FeedPostsProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<FeedPost[]>(() => feedPosts.map((post) => ({ ...post, comments: [...post.comments] })));

  const addPost = (post: NewFeedPost) => {
    const newPost: FeedPost = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user: 'Marco B.',
      initials: 'MB',
      time: 'gerade eben',
      likes: 0,
      likedByCurrentUser: false,
      comments: [],
      rideRequestSent: false,
      ...post,
    };

    setPosts((currentPosts) => [newPost, ...currentPosts]);
  };

  const getPostById = (id: string) => posts.find((post) => post.id === id);

  const toggleLike = (postId: string) => {
    setPosts((currentPosts) =>
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

  const addComment = (postId: string, text: string) => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      return;
    }

    const newComment: FeedComment = {
      id: `comment-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      username: 'Marco B.',
      initials: 'MB',
      text: trimmedText,
      timestamp: 'gerade eben',
    };

    setPosts((currentPosts) =>
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
  };

  const toggleRideRequest = (postId: string) => {
    setPosts((currentPosts) =>
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

  const value = useMemo(
    () => ({
      posts,
      addPost,
      getPostById,
      toggleLike,
      addComment,
      toggleRideRequest,
    }),
    [posts],
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
