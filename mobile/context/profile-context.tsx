import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import type { FeedComment, FeedPost } from '@/data/feed-posts';
import { currentUserSeed, sampleProfiles, seedFollowEdges, CURRENT_USER_ID, type FollowEdge, type UserProfile } from '@/data/users';
import { getInitialsFromName, mapSupabaseProfileRow, type SupabaseProfile } from '@/lib/map-supabase-profile';
import { mapProfileError } from '@/lib/profile-errors';
import { supabase } from '@/lib/supabase';

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
  getUserById: (id: string) => UserProfile | undefined;
  getAuthorDisplay: (post: FeedPost) => AuthorDisplay;
  getCommentAuthorDisplay: (comment: FeedComment) => AuthorDisplay;
  followUser: (userId: string) => void;
  unfollowUser: (userId: string) => void;
  isFollowing: (userId: string) => boolean;
  getFollowers: (userId: string) => UserProfile[];
  getFollowing: (userId: string) => UserProfile[];
  getFollowerCount: (userId: string) => number;
  getFollowingCount: (userId: string) => number;

  // Supabase-backed own profile.
  ownProfile: SupabaseProfile | null;
  isOwnProfileLoading: boolean;
  ownProfileError: string | null;
  refreshOwnProfile: () => void;
  updateOwnProfile: (input: ProfileUpdate) => Promise<{ error: string | null }>;
  createMissingOwnProfile: () => Promise<{ error: string | null }>;

  // Identity bridge between the real Supabase auth user and the pre-existing local seed identity.
  authUserId: string | null;
  localCurrentUserId: string;
  isCurrentUserId: (id: string) => boolean;
  isContentOwnedByCurrentUser: (input: { source: 'local' | 'supabase' | undefined; ownerId: string }) => boolean;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

const PROFILE_SELECT_COLUMNS = 'id, display_name, club, location, bio, avatar_url, created_at, updated_at';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [followEdges, setFollowEdges] = useState<FollowEdge[]>(seedFollowEdges);
  const [ownProfile, setOwnProfile] = useState<SupabaseProfile | null>(null);
  const [isOwnProfileLoading, setIsOwnProfileLoading] = useState(false);
  const [ownProfileError, setOwnProfileError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const isCurrentUserId = (id: string) => id === CURRENT_USER_ID || (authUserId !== null && id === authUserId);

  // Source-aware ownership check for content (posts, trips, meetups, wanted entries, comments).
  // Unlike isCurrentUserId (an identity bridge for participation/self-recognition checks),
  // this never lets a 'local' seed item become "owned" by whichever real account is signed in —
  // local seed content stays tied to its fixed seed author permanently.
  const isContentOwnedByCurrentUser = (input: { source: 'local' | 'supabase' | undefined; ownerId: string }): boolean => {
    if (input.source === 'supabase') {
      return authUserId !== null && input.ownerId === authUserId;
    }

    return input.ownerId === CURRENT_USER_ID;
  };

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never keep showing a stale profile.
      setOwnProfile(null);
      setIsOwnProfileLoading(false);
      setOwnProfileError(null);
      return;
    }

    let isCurrent = true;
    setIsOwnProfileLoading(true);
    setOwnProfileError(null);

    supabase
      .from('profiles')
      .select(PROFILE_SELECT_COLUMNS)
      .eq('id', authUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isCurrent) {
          // A newer request (e.g. after an account switch) has already taken over.
          return;
        }

        if (error) {
          setOwnProfileError(mapProfileError(error));
          setOwnProfile(null);
        } else {
          setOwnProfile(data ? mapSupabaseProfileRow(data) : null);
        }

        setIsOwnProfileLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  const refreshOwnProfile = () => {
    setReloadToken((token) => token + 1);
  };

  const updateOwnProfile = async (input: ProfileUpdate): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: 'Du bist nicht angemeldet.' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: input.displayName.trim(),
        location: input.location.trim(),
        bio: input.bio.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', authUserId)
      .select(PROFILE_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapProfileError(error) };
    }

    setOwnProfile(mapSupabaseProfileRow(data));
    return { error: null };
  };

  const createMissingOwnProfile = async (): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: 'Du bist nicht angemeldet.' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({ id: authUserId, display_name: 'Neues Mitglied' })
      .select(PROFILE_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapProfileError(error) };
    }

    setOwnProfile(mapSupabaseProfileRow(data));
    return { error: null };
  };

  // The object every existing screen already consumes. Its `id` deliberately stays
  // CURRENT_USER_ID (not authUserId) so every existing `post.userId === currentUser.id`
  // style comparison across the app keeps recognizing pre-existing local content as ours.
  // Only the display fields are enriched from the Supabase profile once it has loaded.
  const currentUser: UserProfile = useMemo(() => {
    if (!ownProfile) {
      return currentUserSeed;
    }

    return {
      id: CURRENT_USER_ID,
      displayName: ownProfile.displayName,
      initials: getInitialsFromName(ownProfile.displayName),
      club: ownProfile.club || currentUserSeed.club,
      location: ownProfile.location || currentUserSeed.location,
      bio: ownProfile.bio || currentUserSeed.bio,
      memberSince: ownProfile.createdAt ? new Date(ownProfile.createdAt).getFullYear().toString() : currentUserSeed.memberSince,
      isCurrentUser: true,
      avatarUrl: ownProfile.avatarUrl ?? undefined,
    };
  }, [ownProfile]);

  const getUserById = (id: string): UserProfile | undefined => {
    // Own real Supabase account: show the enriched, currently-signed-in profile.
    if (authUserId !== null && id === authUserId) {
      return currentUser;
    }

    // The fixed local seed identity — always the original seed profile, never the identity of
    // whichever real account happens to be signed in right now.
    if (id === CURRENT_USER_ID) {
      return currentUserSeed;
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

  const getCommentAuthorDisplay = (comment: FeedComment): AuthorDisplay => {
    const author = comment.userId ? getUserById(comment.userId) : undefined;

    if (!author) {
      return { displayName: comment.username, initials: comment.initials };
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
      getUserById,
      getAuthorDisplay,
      getCommentAuthorDisplay,
      followUser,
      unfollowUser,
      isFollowing,
      getFollowers,
      getFollowing,
      getFollowerCount,
      getFollowingCount,
      ownProfile,
      isOwnProfileLoading,
      ownProfileError,
      refreshOwnProfile,
      updateOwnProfile,
      createMissingOwnProfile,
      authUserId,
      localCurrentUserId: CURRENT_USER_ID,
      isCurrentUserId,
      isContentOwnedByCurrentUser,
    }),
    [currentUser, followEdges, ownProfile, isOwnProfileLoading, ownProfileError, authUserId],
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
