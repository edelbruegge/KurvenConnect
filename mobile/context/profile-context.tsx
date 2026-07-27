import React, { createContext, useContext, useMemo, useState } from 'react';

import { currentUserSeed, sampleProfiles, seedFollowEdges, type FollowEdge, type UserProfile } from '@/data/users';
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
  followUser: (userId: string) => void;
  unfollowUser: (userId: string) => void;
  isFollowing: (userId: string) => boolean;
  getFollowers: (userId: string) => UserProfile[];
  getFollowing: (userId: string) => UserProfile[];
  getFollowerCount: (userId: string) => number;
  getFollowingCount: (userId: string) => number;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile>(currentUserSeed);
  const [followEdges, setFollowEdges] = useState<FollowEdge[]>(seedFollowEdges);

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

  const followUser = (userId: string) => {
    if (userId === currentUser.id) {
      return;
    }

    setFollowEdges((edges) => {
      const alreadyFollowing = edges.some(
        (edge) => edge.followerId === currentUser.id && edge.followingId === userId,
      );

      if (alreadyFollowing) {
        return edges;
      }

      return [...edges, { followerId: currentUser.id, followingId: userId }];
    });
  };

  const unfollowUser = (userId: string) => {
    setFollowEdges((edges) =>
      edges.filter((edge) => !(edge.followerId === currentUser.id && edge.followingId === userId)),
    );
  };

  const isFollowing = (userId: string): boolean =>
    followEdges.some((edge) => edge.followerId === currentUser.id && edge.followingId === userId);

  const getFollowers = (userId: string): UserProfile[] =>
    followEdges
      .filter((edge) => edge.followingId === userId)
      .map((edge) => getUserById(edge.followerId))
      .filter((profile): profile is UserProfile => profile !== undefined);

  const getFollowing = (userId: string): UserProfile[] =>
    followEdges
      .filter((edge) => edge.followerId === userId)
      .map((edge) => getUserById(edge.followingId))
      .filter((profile): profile is UserProfile => profile !== undefined);

  const getFollowerCount = (userId: string): number =>
    followEdges.filter((edge) => edge.followingId === userId).length;

  const getFollowingCount = (userId: string): number =>
    followEdges.filter((edge) => edge.followerId === userId).length;

  const value = useMemo(
    () => ({
      currentUser,
      updateCurrentUser,
      getUserById,
      getAuthorDisplay,
      followUser,
      unfollowUser,
      isFollowing,
      getFollowers,
      getFollowing,
      getFollowerCount,
      getFollowingCount,
    }),
    [currentUser, followEdges],
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
