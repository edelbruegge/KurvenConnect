import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import type { FeedPost } from '@/data/feed-posts';
import {
  SAVE_TABLE_BY_CATEGORY,
  type SupabaseMeetupSaveRow,
  type SupabasePostSaveRow,
  type SupabaseTripSaveRow,
  type SupabaseWantedSaveRow,
} from '@/lib/map-supabase-save';
import { resolveContentByIds } from '@/lib/resolve-content-by-ids';
import { mapSaveError } from '@/lib/save-errors';
import { supabase } from '@/lib/supabase';

// A single, unified map covering all four content types -- ids are real Supabase UUIDs from four
// separate tables (posts/trips/meetups/wanted_entries), so collisions across types are not a
// practical concern, exactly like context/feed-posts-context.tsx's own merged `posts` array
// already assumes.
type SavedEntry = { savedAtIso: string };

type SavedContextValue = {
  // True once loaded content is genuinely saved -- covers both remote (source:'supabase') and
  // local (seed) saves, so every existing call site (isSaved(post.id)) keeps working unchanged.
  isSaved: (id: string) => boolean;
  toggleSaved: (post: FeedPost) => void;
  // All currently-saved ids, most-recently-saved first (save.created_at DESC, see Requirement 17).
  savedIdsMostRecentFirst: string[];
  isSavedContentLoading: boolean;
  savedContentError: string | null;
  refreshSavedContent: () => void;
  // Resolves a saved id to its full content, independent of the currently active club -- use this
  // instead of useFeedPosts().getPostById() anywhere a saved item is rendered, so a saved item from
  // a club other than the one currently being browsed stays reachable (Vorgabe 20).
  getSavedContent: (id: string) => FeedPost | undefined;
};

const SavedContext = createContext<SavedContextValue | undefined>(undefined);

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  // Local (seed/demo) content is never a real Supabase row -- see the file header of
  // lib/map-supabase-save.ts's SAVE_TABLE_BY_CATEGORY and the same source-based branch already
  // used by toggleLike/toggleRideRequest in context/feed-posts-context.tsx. Kept as a plain,
  // non-persistent, non-account-bound Set purely so the button still responds in the demo/seed
  // content paths, exactly mirroring how local likes/ride-requests already behave; never written
  // to a table with a real foreign key (a seed id like "1" is not a valid uuid).
  const [localSavedIds, setLocalSavedIds] = useState<Set<string>>(new Set());

  const [remoteSaved, setRemoteSaved] = useState<Map<string, SavedEntry>>(new Map());
  const [resolvedContentById, setResolvedContentById] = useState<Map<string, FeedPost>>(new Map());
  const [isSavedContentLoading, setIsSavedContentLoading] = useState(false);
  const [savedContentError, setSavedContentError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const inFlightSaveIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or switched away from this account): never keep showing a previous account's
      // saves, and never keep local-only demo saves attached to a different signed-in account.
      setRemoteSaved(new Map());
      setResolvedContentById(new Map());
      setLocalSavedIds(new Set());
      setIsSavedContentLoading(false);
      setSavedContentError(null);
      return;
    }

    let isCurrent = true;
    setIsSavedContentLoading(true);
    setSavedContentError(null);

    (async () => {
      // Four bundled queries (one per content type), each scoped to this account only -- never a
      // per-card query. See Requirement 27/28.
      const [postsResult, tripsResult, meetupsResult, wantedResult] = await Promise.all([
        supabase.from('post_saves').select('post_id, user_id, created_at').eq('user_id', authUserId),
        supabase.from('trip_saves').select('trip_id, user_id, created_at').eq('user_id', authUserId),
        supabase.from('meetup_saves').select('meetup_id, user_id, created_at').eq('user_id', authUserId),
        supabase.from('wanted_saves').select('wanted_entry_id, user_id, created_at').eq('user_id', authUserId),
      ]);

      if (!isCurrent) return;

      const firstError = postsResult.error ?? tripsResult.error ?? meetupsResult.error ?? wantedResult.error;

      if (firstError) {
        setSavedContentError(mapSaveError(firstError));
        setRemoteSaved(new Map());
        setResolvedContentById(new Map());
        setIsSavedContentLoading(false);
        return;
      }

      const postIds = ((postsResult.data as SupabasePostSaveRow[] | null) ?? []).map((row) => row.post_id);
      const tripIds = ((tripsResult.data as SupabaseTripSaveRow[] | null) ?? []).map((row) => row.trip_id);
      const meetupIds = ((meetupsResult.data as SupabaseMeetupSaveRow[] | null) ?? []).map((row) => row.meetup_id);
      const wantedIds = ((wantedResult.data as SupabaseWantedSaveRow[] | null) ?? []).map((row) => row.wanted_entry_id);

      const merged = new Map<string, SavedEntry>();
      (postsResult.data as SupabasePostSaveRow[] | null)?.forEach((row) => merged.set(row.post_id, { savedAtIso: row.created_at }));
      (tripsResult.data as SupabaseTripSaveRow[] | null)?.forEach((row) => merged.set(row.trip_id, { savedAtIso: row.created_at }));
      (meetupsResult.data as SupabaseMeetupSaveRow[] | null)?.forEach((row) => merged.set(row.meetup_id, { savedAtIso: row.created_at }));
      (wantedResult.data as SupabaseWantedSaveRow[] | null)?.forEach((row) => merged.set(row.wanted_entry_id, { savedAtIso: row.created_at }));

      setRemoteSaved(merged);
      setIsSavedContentLoading(false);

      // Content resolution runs after the save ids themselves are already shown as loaded -- a
      // slower content fetch must never block the saved-ids list from appearing, it only fills in
      // the actual cards a moment later.
      const { resolved, error: resolveError } = await resolveContentByIds(authUserId, { postIds, tripIds, meetupIds, wantedIds });
      if (!isCurrent) return;

      if (resolveError) {
        // A real fetch failure on the content rows themselves -- surface it rather than silently
        // leaving the saved list looking empty, while still keeping the already-shown saved-id list
        // above (Vorgabe: Fehler nicht wie "0 gefundene Posts" behandeln).
        setSavedContentError(resolveError);
        return;
      }

      setResolvedContentById(resolved);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  const refreshSavedContent = () => {
    setReloadToken((token) => token + 1);
  };

  const isSaved = (id: string): boolean => remoteSaved.has(id) || localSavedIds.has(id);

  const toggleLocalSaved = (postId: string) => {
    setLocalSavedIds((current) => {
      const next = new Set(current);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const toggleRemoteSaved = async (post: FeedPost): Promise<void> => {
    if (!authUserId || inFlightSaveIds.current.has(post.id)) {
      return;
    }

    const { table, idColumn } = SAVE_TABLE_BY_CATEGORY[post.category];
    const wasSaved = remoteSaved.has(post.id);

    inFlightSaveIds.current.add(post.id);

    // Optimistic UI: update immediately, roll back only if the write actually fails.
    const previous = remoteSaved;
    const optimistic = new Map(remoteSaved);
    if (wasSaved) {
      optimistic.delete(post.id);
    } else {
      optimistic.set(post.id, { savedAtIso: new Date().toISOString() });
    }
    setRemoteSaved(optimistic);

    try {
      const { error } = wasSaved
        ? await supabase.from(table).delete().eq(idColumn, post.id).eq('user_id', authUserId)
        : await supabase.from(table).insert({ [idColumn]: post.id, user_id: authUserId });

      if (error) {
        setRemoteSaved(previous);
        setSavedContentError(mapSaveError(error));
        return;
      }
    } finally {
      inFlightSaveIds.current.delete(post.id);
    }
  };

  const toggleSaved = (post: FeedPost) => {
    if (post.source === 'supabase') {
      void toggleRemoteSaved(post);
      return;
    }

    toggleLocalSaved(post.id);
  };

  const savedIdsMostRecentFirst = useMemo(() => {
    const remoteEntries = [...remoteSaved.entries()].sort((a, b) => (b[1].savedAtIso < a[1].savedAtIso ? -1 : 1)).map(([id]) => id);
    // Local (seed/demo) saves have no real timestamp to sort by -- appended after remote saves,
    // in their own Set's natural (insertion) order.
    return [...remoteEntries, ...localSavedIds];
  }, [remoteSaved, localSavedIds]);

  const getSavedContent = (id: string): FeedPost | undefined => resolvedContentById.get(id);

  const value = useMemo(
    () => ({
      isSaved,
      toggleSaved,
      savedIdsMostRecentFirst,
      isSavedContentLoading,
      savedContentError,
      refreshSavedContent,
      getSavedContent,
    }),
    [remoteSaved, localSavedIds, resolvedContentById, savedIdsMostRecentFirst, isSavedContentLoading, savedContentError],
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
