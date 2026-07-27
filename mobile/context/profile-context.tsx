import React, { createContext, useContext, useMemo, useState } from 'react';

import { currentUserSeed, sampleProfiles, type UserProfile } from '@/data/users';
import type { FeedPost } from '@/data/feed-posts';

type ProfileUpdate = {
  displayName: string;
  location: string;
  bio: string;
};

type AuthorDisplay = {
  displayName: string;
  initials: string;
};

type ProfileContextValue = {
  currentUser: UserProfile;
  updateCurrentUser: (update: ProfileUpdate) => void;
  getUserById: (id: string) => UserProfile | undefined;
  getAuthorDisplay: (post: FeedPost) => AuthorDisplay;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile>(currentUserSeed);

  const updateCurrentUser = (update: ProfileUpdate) => {
    setCurrentUser((current) => ({ ...current, ...update }));
  };

  const getUserById = (id: string): UserProfile | undefined => {
    if (id === currentUser.id) {
      return currentUser;
    }

    return sampleProfiles.find((profile) => profile.id === id);
  };

  const getAuthorDisplay = (post: FeedPost): AuthorDisplay => {
    const author = getUserById(post.userId);

    if (!author) {
      return { displayName: post.user, initials: post.initials };
    }

    return { displayName: author.displayName, initials: author.initials };
  };

  const value = useMemo(
    () => ({
      currentUser,
      updateCurrentUser,
      getUserById,
      getAuthorDisplay,
    }),
    [currentUser],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfiles() {
  const context = useContext(ProfileContext);

  if (!context) {
    throw new Error('useProfiles must be used within a ProfileProvider');
  }

  return context;
}
