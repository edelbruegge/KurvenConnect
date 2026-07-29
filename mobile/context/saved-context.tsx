import React, { createContext, useContext, useMemo, useState } from 'react';

import type { FeedPost, FeedPostCategory } from '@/data/feed-posts';
import { seedSavedItems, type SavedItemReference, type SavedItemType } from '@/data/saved';

type SavedContextValue = {
  savedItems: SavedItemReference[];
  isSaved: (postId: string) => boolean;
  toggleSaved: (post: FeedPost) => void;
};

const SavedContext = createContext<SavedContextValue | undefined>(undefined);

const categoryToSavedType: Record<FeedPostCategory, SavedItemType> = {
  Beitrag: 'post',
  Fahrt: 'trip',
  Treffpunkt: 'meetup',
  Gesuch: 'request',
};

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [savedItems, setSavedItems] = useState<SavedItemReference[]>(seedSavedItems);

  const isSaved = (postId: string) => savedItems.some((item) => item.id === postId);

  const toggleSaved = (post: FeedPost) => {
    setSavedItems((current) => {
      const alreadySaved = current.some((item) => item.id === post.id);

      if (alreadySaved) {
        return current.filter((item) => item.id !== post.id);
      }

      const newItem: SavedItemReference = {
        type: categoryToSavedType[post.category],
        id: post.id,
        savedAt: 'gerade eben',
      };

      return [newItem, ...current];
    });
  };

  const value = useMemo(
    () => ({
      savedItems,
      isSaved,
      toggleSaved,
    }),
    [savedItems],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  const context = useContext(SavedContext);

  if (!context) {
    throw new Error('useSaved must be used within a SavedProvider');
  }

  return context;
}
