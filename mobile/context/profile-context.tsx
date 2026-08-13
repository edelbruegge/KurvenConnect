import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import type { FeedComment, FeedPost } from '@/data/feed-posts';
import { currentUserSeed, sampleProfiles, seedFollowEdges, CURRENT_USER_ID, type FollowEdge, type UserProfile } from '@/data/users';
import { mapFollowError } from '@/lib/follow-errors';
import type { SupabaseFollowRow } from '@/lib/map-supabase-follow';
import { getInitialsFromName, mapSupabaseProfileRow, type SupabaseProfile, type SupabaseProfileRow } from '@/lib/map-supabase-profile';
import { mapProfileError } from '@/lib/profile-errors';
import { supabase } from '@/lib/supabase';

type ProfileUpdate = {
  displayName: string;
  location: string;
  bio: string;
  // undefined = leave the stored avatar unchanged, null = remove it, string = set a new one.
  avatarUrl?: string | null;
};

type AuthorDisplay = {
  displayName: string;
  initials: string;
  avatarUrl?: string;
};

type ConnectionCounts = { followerCount: number; followingCount: number };
type ConnectionListState = { users: UserProfile[]; isLoading: boolean; error: string | null; hasLoadedOnce: boolean };

type RealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'reconnecting' | 'error' | 'closed';

// Same minimal structural payload shape used by FeedPostsContext's own content-changes channel
// (see context/feed-posts-context.tsx) -- event:'*' covers INSERT/UPDATE/DELETE on one binding.
type RealtimeFollowChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

// Same minimal structural payload shape, reused for the profiles binding on the same channel.
type RealtimeProfileChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

const EMPTY_CONNECTION_LIST_STATE: ConnectionListState = { users: [], isLoading: false, error: null, hasLoadedOnce: false };

type ProfileContextValue = {
  currentUser: UserProfile;
  getUserById: (id: string) => UserProfile | undefined;
  getAuthorDisplay: (post: FeedPost) => AuthorDisplay;
  getCommentAuthorDisplay: (comment: FeedComment) => AuthorDisplay;

  followUser: (userId: string) => Promise<{ error: string | null }>;
  unfollowUser: (userId: string) => Promise<{ error: string | null }>;
  isFollowing: (userId: string) => boolean;
  // The current account's own real follow set (real profile UUIDs, see followingIds above in the
  // provider) -- exposed directly, not just via isFollowing(), for consumers that need to filter
  // a list by membership (e.g. the "Folge ich" feed in app/(tabs)/index.tsx) or need the count.
  followingIds: Set<string>;
  getFollowers: (userId: string) => UserProfile[];
  getFollowing: (userId: string) => UserProfile[];
  getFollowerCount: (userId: string) => number;
  getFollowingCount: (userId: string) => number;
  // Loads real, Supabase-backed connection data for a given (real) profile id -- see the file
  // header's "Connections" section for why these are on-demand, per-profile calls rather than a
  // global preload. No-ops harmlessly for local seed profile ids.
  loadConnectionCounts: (userId: string) => void;
  loadFollowerList: (userId: string) => void;
  loadFollowingList: (userId: string) => void;
  getFollowerListState: (userId: string) => ConnectionListState;
  getFollowingListState: (userId: string) => ConnectionListState;
  // Reloads the current account's own follow set (see followingIds below) -- e.g. after an
  // account switch, though that is already handled by the auth-change effect itself; exposed
  // mainly for a manual retry after a failed load.
  refreshConnections: () => void;
  isConnectionsLoading: boolean;
  connectionsError: string | null;
  // Status of the user_follows realtime channel (see the block above getFollowers/getFollowing
  // in the provider) -- 'subscribed' means other clients' follow/unfollow actions are arriving
  // live; screens can key useRefreshOnFocus off this the same way app/(tabs)/index.tsx already
  // does for contentVisibilityRealtimeStatus.
  connectionsRealtimeStatus: RealtimeStatus;

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
const FOLLOWS_SELECT_COLUMNS = 'follower_id, following_id, created_at';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  // Local (seed-to-seed) demo follow relationships -- kept exactly as before, purely local,
  // in-memory, never mixed with real accounts (see getUserById's own local/remote split below,
  // reused throughout this file to decide which path a given userId belongs to).
  const [localFollowEdges, setLocalFollowEdges] = useState<FollowEdge[]>(seedFollowEdges);

  // The signed-in account's own real follow set (which real profiles it follows), bundle-loaded
  // once per auth session -- makes isFollowing(userId) an O(1) lookup, never a per-render/
  // per-card query. Reset whenever the account changes, same pattern as every other context here.
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [isConnectionsLoading, setIsConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [connectionsReloadToken, setConnectionsReloadToken] = useState(0);
  const inFlightFollowIds = useRef<Set<string>>(new Set());

  // On-demand caches: populated per profile actually viewed (loadConnectionCounts/
  // loadFollowerList/loadFollowingList), never a global preload of the whole table -- see
  // Requirement 25 ("keine komplette globale Follow-Tabelle in den Client laden").
  const [connectionCountsByUserId, setConnectionCountsByUserId] = useState<Record<string, ConnectionCounts>>({});
  const [followerListByUserId, setFollowerListByUserId] = useState<Record<string, ConnectionListState>>({});
  const [followingListByUserId, setFollowingListByUserId] = useState<Record<string, ConnectionListState>>({});

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

  // Own real follow set -- see followingIds above. Cleared and reloaded on every account change,
  // exactly like every other Supabase-backed piece of state in this app (Konto A/B must never
  // see each other's follow state, Requirement 16/19).
  useEffect(() => {
    if (!authUserId) {
      setFollowingIds(new Set());
      setIsConnectionsLoading(false);
      setConnectionsError(null);
      setConnectionCountsByUserId({});
      setFollowerListByUserId({});
      setFollowingListByUserId({});
      inFlightFollowIds.current.clear();
      return;
    }

    let isCurrent = true;
    setIsConnectionsLoading(true);
    setConnectionsError(null);

    supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', authUserId)
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setConnectionsError(mapFollowError(error));
          setFollowingIds(new Set());
          setIsConnectionsLoading(false);
          return;
        }

        setFollowingIds(new Set((data ?? []).map((row: { following_id: string }) => row.following_id)));
        setIsConnectionsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, connectionsReloadToken]);

  const refreshConnections = () => {
    setConnectionsReloadToken((token) => token + 1);
  };

  const updateOwnProfile = async (input: ProfileUpdate): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: 'Du bist nicht angemeldet.' };
    }

    const updatePayload: Record<string, unknown> = {
      display_name: input.displayName.trim(),
      location: input.location.trim(),
      bio: input.bio.trim(),
      updated_at: new Date().toISOString(),
    };

    // Only touches avatar_url when the caller actually wants to change it -- undefined means "not
    // part of this save" (e.g. a plain text-field edit), so a normal profile save never
    // accidentally clears or overwrites the avatar.
    if (input.avatarUrl !== undefined) {
      updatePayload.avatar_url = input.avatarUrl;
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updatePayload)
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

  // Whether `id` refers to a real Supabase account (own account, or any other real profile) as
  // opposed to a fixed local seed identity -- the single place this app-wide local/remote split
  // is decided for follow purposes, mirrored from the exact same source-based branch already used
  // for likes/saves/trips throughout this codebase. A local seed profile is anything getUserById
  // resolves with no ambiguity to a fixed seed entry; anything else (including the caller's own
  // real account, and any id not present locally at all -- e.g. opened via a direct profile URL)
  // is treated as a real Supabase id.
  //
  // CURRENT_USER_ID is a special case: `currentUser` (the object the own-profile screen renders)
  // always carries id===CURRENT_USER_ID, even while signed in as a real account (see currentUser's
  // own comment above) -- so viewing *your own* profile is still a real account whenever you are
  // actually signed in, just addressed under the bridging id rather than your real uuid. Only
  // treat CURRENT_USER_ID as the fixed local seed identity when nobody is signed in at all.
  const isRealProfileId = (id: string): boolean => {
    if (authUserId !== null && id === authUserId) return true;
    if (id === CURRENT_USER_ID) return authUserId !== null;
    if (sampleProfiles.some((profile) => profile.id === id)) return false;
    return true;
  };

  // Translates the bridging CURRENT_USER_ID to the real authUserId for actual Supabase
  // queries/cache keys -- every other id (a real uuid, or a local sample id never passed to a
  // real-branch function in the first place) is already correct as-is.
  const toRealUserId = (id: string): string => (id === CURRENT_USER_ID && authUserId !== null ? authUserId : id);

  const getAuthorDisplay = (post: FeedPost): AuthorDisplay => {
    const author = getUserById(post.userId);

    if (!author) {
      return { displayName: post.user, initials: post.initials };
    }

    return { displayName: author.displayName, initials: author.initials, avatarUrl: author.avatarUrl };
  };

  const getCommentAuthorDisplay = (comment: FeedComment): AuthorDisplay => {
    const author = comment.userId ? getUserById(comment.userId) : undefined;

    if (!author) {
      return { displayName: comment.username, initials: comment.initials };
    }

    return { displayName: author.displayName, initials: author.initials, avatarUrl: author.avatarUrl };
  };

  // --- Local (seed-to-seed) follow toggle -- unchanged behaviour from before this step. ---

  const followLocalUser = (userId: string) => {
    setLocalFollowEdges((edges) => {
      const alreadyFollowing = edges.some((edge) => edge.followerId === currentUser.id && edge.followingId === userId);

      if (alreadyFollowing) {
        return edges;
      }

      return [...edges, { followerId: currentUser.id, followingId: userId }];
    });
  };

  const unfollowLocalUser = (userId: string) => {
    setLocalFollowEdges((edges) => edges.filter((edge) => !(edge.followerId === currentUser.id && edge.followingId === userId)));
  };

  // --- Real, Supabase-backed follow/unfollow. Optimistic update of followingIds, rolled back on
  // failure -- see Requirement 5/6/10. In-flight guard prevents a rapid double-tap from firing a
  // second overlapping mutation (duplicate rows are additionally impossible at the DB level via
  // the primary key, and a duplicate notification is additionally impossible via event_key). ---

  const followRemoteUser = async (userId: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: 'Bitte melde dich an, um das zu tun.' };
    }

    if (inFlightFollowIds.current.has(userId)) {
      return { error: null };
    }

    inFlightFollowIds.current.add(userId);
    const wasFollowing = followingIds.has(userId);

    if (!wasFollowing) {
      setFollowingIds((current) => new Set(current).add(userId));
    }

    try {
      if (wasFollowing) {
        return { error: null };
      }

      const { error } = await supabase.from('user_follows').insert({ follower_id: authUserId, following_id: userId });

      if (error) {
        setFollowingIds((current) => {
          const next = new Set(current);
          next.delete(userId);
          return next;
        });
        return { error: mapFollowError(error) };
      }

      // The target's follower count may already be cached (e.g. the profile currently being
      // viewed) -- keep it in sync immediately rather than waiting for a manual reload.
      setConnectionCountsByUserId((current) => {
        const existing = current[userId];
        if (!existing) return current;
        return { ...current, [userId]: { ...existing, followerCount: existing.followerCount + 1 } };
      });

      return { error: null };
    } finally {
      inFlightFollowIds.current.delete(userId);
    }
  };

  const unfollowRemoteUser = async (userId: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: 'Bitte melde dich an, um das zu tun.' };
    }

    if (inFlightFollowIds.current.has(userId)) {
      return { error: null };
    }

    inFlightFollowIds.current.add(userId);
    const wasFollowing = followingIds.has(userId);

    if (wasFollowing) {
      setFollowingIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }

    try {
      if (!wasFollowing) {
        return { error: null };
      }

      const { error } = await supabase.from('user_follows').delete().eq('follower_id', authUserId).eq('following_id', userId);

      if (error) {
        setFollowingIds((current) => new Set(current).add(userId));
        return { error: mapFollowError(error) };
      }

      setConnectionCountsByUserId((current) => {
        const existing = current[userId];
        if (!existing) return current;
        return { ...current, [userId]: { ...existing, followerCount: Math.max(0, existing.followerCount - 1) } };
      });

      return { error: null };
    } finally {
      inFlightFollowIds.current.delete(userId);
    }
  };

  const followUser = async (userId: string): Promise<{ error: string | null }> => {
    if (userId === currentUser.id || (authUserId !== null && userId === authUserId)) {
      return { error: null };
    }

    if (isRealProfileId(userId)) {
      return followRemoteUser(userId);
    }

    followLocalUser(userId);
    return { error: null };
  };

  const unfollowUser = async (userId: string): Promise<{ error: string | null }> => {
    if (isRealProfileId(userId)) {
      return unfollowRemoteUser(userId);
    }

    unfollowLocalUser(userId);
    return { error: null };
  };

  const isFollowing = (userId: string): boolean => {
    if (isRealProfileId(userId)) {
      return followingIds.has(userId);
    }

    return localFollowEdges.some((edge) => edge.followerId === currentUser.id && edge.followingId === userId);
  };

  // --- Counts: on-demand, per-profile, pure count queries (head:true -- no rows transferred),
  // never a full-table load. See Requirement 10/25. ---

  const loadConnectionCounts = (userId: string) => {
    if (!isRealProfileId(userId)) {
      return;
    }

    // Cache key is the real id throughout (see toRealUserId) -- so viewing your own profile
    // (id===CURRENT_USER_ID) and viewing it via your real uuid always resolve to the same cache
    // entry, and the query itself always targets a real profiles.id, never the bridging string.
    const dbId = toRealUserId(userId);

    Promise.all([
      supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', dbId),
      supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', dbId),
    ]).then(([followerResult, followingResult]) => {
      setConnectionCountsByUserId((current) => ({
        ...current,
        [dbId]: {
          followerCount: followerResult.count ?? 0,
          followingCount: followingResult.count ?? 0,
        },
      }));
    });
  };

  const getFollowerCount = (userId: string): number => {
    if (isRealProfileId(userId)) {
      return connectionCountsByUserId[toRealUserId(userId)]?.followerCount ?? 0;
    }

    return localFollowEdges.filter((edge) => edge.followingId === userId).length;
  };

  const getFollowingCount = (userId: string): number => {
    if (isRealProfileId(userId)) {
      return connectionCountsByUserId[toRealUserId(userId)]?.followingCount ?? 0;
    }

    return localFollowEdges.filter((edge) => edge.followerId === userId).length;
  };

  // --- Lists: on-demand, per-profile, bundled (relation ids, then one `in (...)` profiles fetch
  // -- never a query per list row). See Requirement 11/12/25. ---

  const loadFollowerList = (userId: string) => {
    if (!isRealProfileId(userId)) {
      return;
    }

    // See loadConnectionCounts's comment: cache key + query target is always the real id, so
    // your own profile resolves the same way whether opened via CURRENT_USER_ID or your real uuid.
    const dbId = toRealUserId(userId);

    setFollowerListByUserId((current) => ({
      ...current,
      [dbId]: { ...(current[dbId] ?? EMPTY_CONNECTION_LIST_STATE), isLoading: true, error: null },
    }));

    (async () => {
      const { data: followRows, error: followsError } = await supabase
        .from('user_follows')
        .select(FOLLOWS_SELECT_COLUMNS)
        .eq('following_id', dbId)
        .order('created_at', { ascending: false });

      if (followsError) {
        setFollowerListByUserId((current) => ({
          ...current,
          [dbId]: { users: [], isLoading: false, error: mapFollowError(followsError), hasLoadedOnce: true },
        }));
        return;
      }

      const rows = (followRows ?? []) as SupabaseFollowRow[];
      const orderedIds = rows.map((row) => row.follower_id);

      if (orderedIds.length === 0) {
        setFollowerListByUserId((current) => ({ ...current, [dbId]: { users: [], isLoading: false, error: null, hasLoadedOnce: true } }));
        return;
      }

      const { data: profileRows, error: profilesError } = await supabase.from('profiles').select(PROFILE_SELECT_COLUMNS).in('id', orderedIds);

      if (profilesError) {
        setFollowerListByUserId((current) => ({
          ...current,
          [dbId]: { users: [], isLoading: false, error: mapFollowError(profilesError), hasLoadedOnce: true },
        }));
        return;
      }

      const profilesById = new Map((profileRows ?? []).map((row) => [row.id as string, mapSupabaseProfileRow(row)]));
      const users: UserProfile[] = orderedIds
        .map((id) => profilesById.get(id))
        .filter((profile): profile is SupabaseProfile => profile !== undefined)
        .map((profile) => ({
          id: profile.id,
          displayName: profile.displayName,
          initials: getInitialsFromName(profile.displayName),
          club: profile.club || '',
          location: profile.location || '',
          bio: profile.bio || '',
          memberSince: profile.createdAt ? new Date(profile.createdAt).getFullYear().toString() : '',
          isCurrentUser: authUserId !== null && profile.id === authUserId,
          avatarUrl: profile.avatarUrl ?? undefined,
          source: 'supabase',
        }));

      setFollowerListByUserId((current) => ({ ...current, [dbId]: { users, isLoading: false, error: null, hasLoadedOnce: true } }));
    })();
  };

  const loadFollowingList = (userId: string) => {
    if (!isRealProfileId(userId)) {
      return;
    }

    const dbId = toRealUserId(userId);

    setFollowingListByUserId((current) => ({
      ...current,
      [dbId]: { ...(current[dbId] ?? EMPTY_CONNECTION_LIST_STATE), isLoading: true, error: null },
    }));

    (async () => {
      const { data: followRows, error: followsError } = await supabase
        .from('user_follows')
        .select(FOLLOWS_SELECT_COLUMNS)
        .eq('follower_id', dbId)
        .order('created_at', { ascending: false });

      if (followsError) {
        setFollowingListByUserId((current) => ({
          ...current,
          [dbId]: { users: [], isLoading: false, error: mapFollowError(followsError), hasLoadedOnce: true },
        }));
        return;
      }

      const rows = (followRows ?? []) as SupabaseFollowRow[];
      const orderedIds = rows.map((row) => row.following_id);

      if (orderedIds.length === 0) {
        setFollowingListByUserId((current) => ({ ...current, [dbId]: { users: [], isLoading: false, error: null, hasLoadedOnce: true } }));
        return;
      }

      const { data: profileRows, error: profilesError } = await supabase.from('profiles').select(PROFILE_SELECT_COLUMNS).in('id', orderedIds);

      if (profilesError) {
        setFollowingListByUserId((current) => ({
          ...current,
          [dbId]: { users: [], isLoading: false, error: mapFollowError(profilesError), hasLoadedOnce: true },
        }));
        return;
      }

      const profilesById = new Map((profileRows ?? []).map((row) => [row.id as string, mapSupabaseProfileRow(row)]));
      const users: UserProfile[] = orderedIds
        .map((id) => profilesById.get(id))
        .filter((profile): profile is SupabaseProfile => profile !== undefined)
        .map((profile) => ({
          id: profile.id,
          displayName: profile.displayName,
          initials: getInitialsFromName(profile.displayName),
          club: profile.club || '',
          location: profile.location || '',
          bio: profile.bio || '',
          memberSince: profile.createdAt ? new Date(profile.createdAt).getFullYear().toString() : '',
          isCurrentUser: authUserId !== null && profile.id === authUserId,
          avatarUrl: profile.avatarUrl ?? undefined,
          source: 'supabase',
        }));

      setFollowingListByUserId((current) => ({ ...current, [dbId]: { users, isLoading: false, error: null, hasLoadedOnce: true } }));
    })();
  };

  const getFollowerListState = (userId: string): ConnectionListState => {
    if (isRealProfileId(userId)) {
      return followerListByUserId[toRealUserId(userId)] ?? EMPTY_CONNECTION_LIST_STATE;
    }

    const users = localFollowEdges
      .filter((edge) => edge.followingId === userId)
      .map((edge) => getUserById(edge.followerId))
      .filter((profile): profile is UserProfile => profile !== undefined);

    return { users, isLoading: false, error: null, hasLoadedOnce: true };
  };

  const getFollowingListState = (userId: string): ConnectionListState => {
    if (isRealProfileId(userId)) {
      return followingListByUserId[toRealUserId(userId)] ?? EMPTY_CONNECTION_LIST_STATE;
    }

    const users = localFollowEdges
      .filter((edge) => edge.followerId === userId)
      .map((edge) => getUserById(edge.followingId))
      .filter((profile): profile is UserProfile => profile !== undefined);

    return { users, isLoading: false, error: null, hasLoadedOnce: true };
  };

  // Kept for any remaining direct callers expecting a plain array (no loading/error concerns) --
  // both simply read through the same state as getFollower/FollowingListState above.
  const getFollowers = (userId: string): UserProfile[] => getFollowerListState(userId).users;
  const getFollowing = (userId: string): UserProfile[] => getFollowingListState(userId).users;

  // --- Follow-changes sync: keeps this client's own follow set, and any currently-open profile's
  // counts/lists, in sync with other clients' follow/unfollow actions without a reload. Own
  // mutations from THIS client already updated local state immediately in followRemoteUser/
  // unfollowRemoteUser above and never wait for this -- the Set/cache updates below are written to
  // be idempotent no-ops when they arrive as the echo of an action already applied.
  //
  // Deliberately one unfiltered subscription (not two server-side-filtered ones for
  // follower_id=eq.authUserId / following_id=eq.authUserId) so a profile *other* than the caller's
  // own can also refresh live while it happens to be open (Requirement: "Follower-/Following-Liste
  // bei bereits geöffneten relevanten Screens konsistent"). This is not a new information exposure
  // -- user_follows' own SELECT policy is already `using (true)` (follow relationships are public,
  // same visibility model as post_likes), so any authenticated client could already read every row
  // via a normal query; Realtime here only pushes what a plain select would already return.
  const [followsRealtimeStatus, setFollowsRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [followsReconnectToken, setFollowsReconnectToken] = useState(0);
  const followsRealtimeStatusRef = useRef<RealtimeStatus>('idle');

  useEffect(() => {
    followsRealtimeStatusRef.current = followsRealtimeStatus;
  }, [followsRealtimeStatus]);

  const handleUserFollowsChange = (payload: RealtimeFollowChangePayload) => {
    const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as {
      follower_id?: string;
      following_id?: string;
    };
    const followerId = row?.follower_id;
    const followingId = row?.following_id;

    if (!followerId || !followingId) {
      return;
    }

    if (followerId === authUserId) {
      setFollowingIds((current) => {
        const alreadyHasIt = current.has(followingId);
        if (payload.eventType === 'INSERT' && !alreadyHasIt) {
          return new Set(current).add(followingId);
        }
        if (payload.eventType === 'DELETE' && alreadyHasIt) {
          const next = new Set(current);
          next.delete(followingId);
          return next;
        }
        return current;
      });
    }

    // Targeted, cheap re-fetch (never incremental math -- see loadConnectionCounts) for any
    // profile whose counts/lists a screen already has open. Skipped entirely for a profile
    // nothing currently has cached, so this never grows into a full-table sync.
    if (connectionCountsByUserId[followerId] !== undefined) loadConnectionCounts(followerId);
    if (connectionCountsByUserId[followingId] !== undefined) loadConnectionCounts(followingId);
    if (followerListByUserId[followingId] !== undefined) loadFollowerList(followingId);
    if (followingListByUserId[followerId] !== undefined) loadFollowingList(followerId);
  };

  // Own-account (another device/tab of the same user) or another user's row changing while a
  // screen already has their profile cached -- own-mutation avatar/text saves from THIS client
  // already update local state directly in updateOwnProfile above and never wait for this. Reuses
  // the same channel as the follow-sync handler above (Vorgabe: "keine zweite Subscription nur
  // für Avatare") -- just one more table binding on it, not a new channel.
  const handleProfileRowChange = (payload: RealtimeProfileChangePayload) => {
    if (payload.eventType === 'DELETE') return; // profiles are never hard-deleted by this app
    const row = payload.new as unknown as SupabaseProfileRow;
    if (!row?.id) return;

    if (row.id === authUserId) {
      setOwnProfile(mapSupabaseProfileRow(row));
      return;
    }

    const mapped = mapSupabaseProfileRow(row);
    const patchUser = (user: UserProfile): UserProfile =>
      user.id === row.id ? { ...user, displayName: mapped.displayName, initials: getInitialsFromName(mapped.displayName), avatarUrl: mapped.avatarUrl ?? undefined } : user;

    const patchAllLists = (map: Record<string, ConnectionListState>): Record<string, ConnectionListState> => {
      let changed = false;
      const next: Record<string, ConnectionListState> = {};
      for (const [key, state] of Object.entries(map)) {
        if (!state.users.some((user) => user.id === row.id)) {
          next[key] = state;
          continue;
        }
        changed = true;
        next[key] = { ...state, users: state.users.map(patchUser) };
      }
      return changed ? next : map;
    };

    setFollowerListByUserId(patchAllLists);
    setFollowingListByUserId(patchAllLists);
  };

  // Ref indirection so the long-lived channel subscription always calls the latest closure
  // (fresh authUserId/caches) without reconnecting the channel every render -- same pattern as
  // FeedPostsContext's handleContentVisibilityEventRef.
  const handleUserFollowsChangeRef = useRef(handleUserFollowsChange);
  handleUserFollowsChangeRef.current = handleUserFollowsChange;
  const handleProfileRowChangeRef = useRef(handleProfileRowChange);
  handleProfileRowChangeRef.current = handleProfileRowChange;

  useEffect(() => {
    if (!authUserId) {
      setFollowsRealtimeStatus('idle');
      return;
    }

    let isCurrent = true;
    setFollowsRealtimeStatus((current) => (current === 'error' || current === 'closed' ? 'reconnecting' : 'connecting'));

    const channel = supabase
      .channel(`user-follows:${authUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows' }, (payload) => {
        if (!isCurrent) return;
        handleUserFollowsChangeRef.current(payload as unknown as RealtimeFollowChangePayload);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        if (!isCurrent) return;
        handleProfileRowChangeRef.current(payload as unknown as RealtimeProfileChangePayload);
      })
      .subscribe((status) => {
        if (!isCurrent) return;

        if (status === 'SUBSCRIBED') {
          setFollowsRealtimeStatus('subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (__DEV__) {
            console.error('[profile:realtime] user-follows channel error/timeout', status);
          }
          setFollowsRealtimeStatus('error');
        } else if (status === 'CLOSED') {
          setFollowsRealtimeStatus((current) => (current === 'error' ? current : 'closed'));
        }
      });

    return () => {
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [authUserId, followsReconnectToken]);

  // Foreground refresh: same AppState pattern already used in FeedPostsContext -- nudges a
  // reconnect if the channel isn't healthy, and re-syncs the own follow set as a safety net.
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = /inactive|background/.test(appStateRef.current) && nextState === 'active';
      appStateRef.current = nextState;

      if (!cameToForeground || !authUserId) {
        return;
      }

      if (followsRealtimeStatusRef.current !== 'subscribed') {
        setFollowsReconnectToken((token) => token + 1);
      }

      refreshConnections();
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  const value = useMemo(
    () => ({
      currentUser,
      getUserById,
      getAuthorDisplay,
      getCommentAuthorDisplay,
      followUser,
      unfollowUser,
      isFollowing,
      followingIds,
      getFollowers,
      getFollowing,
      getFollowerCount,
      getFollowingCount,
      loadConnectionCounts,
      loadFollowerList,
      loadFollowingList,
      getFollowerListState,
      getFollowingListState,
      refreshConnections,
      isConnectionsLoading,
      connectionsError,
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
      connectionsRealtimeStatus: followsRealtimeStatus,
    }),
    [
      currentUser,
      localFollowEdges,
      followingIds,
      connectionCountsByUserId,
      followerListByUserId,
      followingListByUserId,
      isConnectionsLoading,
      connectionsError,
      ownProfile,
      isOwnProfileLoading,
      ownProfileError,
      authUserId,
      followsRealtimeStatus,
    ],
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
