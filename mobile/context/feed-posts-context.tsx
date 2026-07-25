import React, { createContext, useContext, useMemo, useState } from 'react';

import { feedPosts, type FeedPost, type NewFeedPost } from '@/data/feed-posts';

type FeedPostsContextValue = {
  posts: FeedPost[];
  addPost: (post: NewFeedPost) => void;
  getPostById: (id: string) => FeedPost | undefined;
};

const FeedPostsContext = createContext<FeedPostsContextValue | undefined>(undefined);

export function FeedPostsProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<FeedPost[]>(() => feedPosts.map((post) => ({ ...post })));

  const addPost = (post: NewFeedPost) => {
    const newPost: FeedPost = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user: 'Marco B.',
      initials: 'MB',
      time: 'gerade eben',
      likes: 0,
      comments: 0,
      ...post,
    };

    setPosts((currentPosts) => [newPost, ...currentPosts]);
  };

  const getPostById = (id: string) => posts.find((post) => post.id === id);

  const value = useMemo(
    () => ({
      posts,
      addPost,
      getPostById,
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
