import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import type { FeedComment, FeedPost, PostMediaItem } from '@/data/feed-posts';
import { getInitialsFromName } from '@/lib/map-supabase-profile';
import { mapSupabaseCommentToFeedComment, mapSupabasePostToFeedPost, type SupabaseCommentRow, type SupabaseLikeRow, type SupabasePostRow } from '@/lib/map-supabase-post';
import { mapSupabaseTripToFeedPost, type SupabaseTripLikeRow, type SupabaseTripRequestRow, type SupabaseTripRow } from '@/lib/map-supabase-trip';
import { mapSupabaseMeetupToFeedPost, type SupabaseMeetupAttendeeRow, type SupabaseMeetupLikeRow, type SupabaseMeetupRow } from '@/lib/map-supabase-meetup';
import { mapSupabaseWantedEntryToFeedPost, type SupabaseWantedEntryRow, type SupabaseWantedLikeRow } from '@/lib/map-supabase-wanted-entry';
import {
  SAVE_TABLE_BY_CATEGORY,
  type SupabaseMeetupSaveRow,
  type SupabasePostSaveRow,
  type SupabaseTripSaveRow,
  type SupabaseWantedSaveRow,
} from '@/lib/map-supabase-save';
import { getPostMediaSignedUrls, POST_MEDIA_SELECT_COLUMNS, type PostMediaRow } from '@/lib/post-media';
import { mapSaveError } from '@/lib/save-errors';
import { supabase } from '@/lib/supabase';

type AuthorDisplay = { displayName: string; initials: string; avatarUrl?: string };
const UNKNOWN_AUTHOR_DISPLAY: AuthorDisplay = { displayName: 'Unbekanntes Mitglied', initials: '?' };

/**
 * Resolves full FeedPost content for a saved id set, deliberately independent of the active club
 * (context/active-club-context.tsx) -- FeedPostsContext's own `posts` only ever holds the
 * currently active team's content, so a saved item from a different team would otherwise become
 * unreachable the moment the user browses another club (Vorgabe 20: gespeicherte Inhalte dürfen
 * nicht unzugänglich werden). RLS already allows reading any of these rows regardless of team
 * (Vorgabe 39), so a plain `.in('id', ids)` per table, scoped only by the id lists this account's
 * own saves already point to, is safe and correct.
 */
async function resolveSavedContent(
  authUserId: string,
  idsByCategory: { postIds: string[]; tripIds: string[]; meetupIds: string[]; wantedIds: string[] },
): Promise<Map<string, FeedPost>> {
  const resolved = new Map<string, FeedPost>();

  const [postRowsResult, tripRowsResult, meetupRowsResult, wantedRowsResult] = await Promise.all([
    idsByCategory.postIds.length > 0
      ? supabase.from('posts').select('id, author_id, content, category, created_at, updated_at, game_id, game_label, team_id').in('id', idsByCategory.postIds)
      : Promise.resolve({ data: [] as SupabasePostRow[], error: null }),
    idsByCategory.tripIds.length > 0
      ? supabase
          .from('trips')
          .select('id, owner_id, departure, destination, departure_time, seats_available, occasion, description, created_at, updated_at, game_id, game_label, team_id')
          .in('id', idsByCategory.tripIds)
      : Promise.resolve({ data: [] as SupabaseTripRow[], error: null }),
    idsByCategory.meetupIds.length > 0
      ? supabase
          .from('meetups')
          .select('id, organizer_id, title, description, location, starts_at, max_attendees, game_id, game_label, created_at, updated_at, team_id')
          .in('id', idsByCategory.meetupIds)
      : Promise.resolve({ data: [] as SupabaseMeetupRow[], error: null }),
    idsByCategory.wantedIds.length > 0
      ? supabase.from('wanted_entries').select('id, owner_id, description, requested_service, created_at, updated_at, game_id, game_label, team_id').in('id', idsByCategory.wantedIds)
      : Promise.resolve({ data: [] as SupabaseWantedEntryRow[], error: null }),
  ]);

  const postRows = (postRowsResult.data ?? []) as SupabasePostRow[];
  const tripRows = (tripRowsResult.data ?? []) as SupabaseTripRow[];
  const meetupRows = (meetupRowsResult.data ?? []) as SupabaseMeetupRow[];
  const wantedRows = (wantedRowsResult.data ?? []) as SupabaseWantedEntryRow[];

  const authorIds = new Set<string>();
  postRows.forEach((row) => authorIds.add(row.author_id));
  tripRows.forEach((row) => authorIds.add(row.owner_id));
  meetupRows.forEach((row) => authorIds.add(row.organizer_id));
  wantedRows.forEach((row) => authorIds.add(row.owner_id));

  const postIds = postRows.map((row) => row.id);
  const tripIds = tripRows.map((row) => row.id);
  const meetupIds = meetupRows.map((row) => row.id);
  const wantedIds = wantedRows.map((row) => row.id);

  const [commentsResult, postLikesResult, mediaResult, tripLikesResult, tripRequestsResult, meetupLikesResult, attendeesResult, wantedLikesResult] =
    await Promise.all([
      postIds.length > 0
        ? supabase.from('post_comments').select('id, post_id, author_id, content, created_at, updated_at').in('post_id', postIds).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] as SupabaseCommentRow[], error: null }),
      postIds.length > 0 ? supabase.from('post_likes').select('post_id, user_id, created_at').in('post_id', postIds) : Promise.resolve({ data: [] as SupabaseLikeRow[], error: null }),
      postIds.length > 0
        ? supabase.from('post_media').select(POST_MEDIA_SELECT_COLUMNS).in('post_id', postIds).order('position', { ascending: true })
        : Promise.resolve({ data: [] as PostMediaRow[], error: null }),
      tripIds.length > 0
        ? supabase.from('trip_likes').select('trip_id, user_id, created_at').in('trip_id', tripIds)
        : Promise.resolve({ data: [] as SupabaseTripLikeRow[], error: null }),
      tripIds.length > 0
        ? supabase.from('trip_requests').select('id, trip_id, requester_id, message, status, created_at, updated_at, responded_at').in('trip_id', tripIds)
        : Promise.resolve({ data: [] as SupabaseTripRequestRow[], error: null }),
      meetupIds.length > 0
        ? supabase.from('meetup_likes').select('meetup_id, user_id, created_at').in('meetup_id', meetupIds)
        : Promise.resolve({ data: [] as SupabaseMeetupLikeRow[], error: null }),
      meetupIds.length > 0
        ? supabase.from('meetup_attendees').select('meetup_id, user_id, joined_at').in('meetup_id', meetupIds)
        : Promise.resolve({ data: [] as SupabaseMeetupAttendeeRow[], error: null }),
      wantedIds.length > 0
        ? supabase.from('wanted_likes').select('wanted_entry_id, user_id, created_at').in('wanted_entry_id', wantedIds)
        : Promise.resolve({ data: [] as SupabaseWantedLikeRow[], error: null }),
    ]);

  const comments = (commentsResult.data ?? []) as SupabaseCommentRow[];
  comments.forEach((comment) => authorIds.add(comment.author_id));

  const { data: profileRows } = authorIds.size > 0
    ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', Array.from(authorIds))
    : { data: [] as { id: string; display_name: string | null; avatar_url: string | null }[] };

  const authorDisplayById: Record<string, AuthorDisplay> = {};
  (profileRows ?? []).forEach((row) => {
    const displayName = row.display_name?.trim() || 'Neues Mitglied';
    authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName), avatarUrl: row.avatar_url ?? undefined };
  });

  const commentsByPostId = new Map<string, FeedComment[]>();
  comments.forEach((row) => {
    const author = authorDisplayById[row.author_id] ?? UNKNOWN_AUTHOR_DISPLAY;
    const list = commentsByPostId.get(row.post_id) ?? [];
    list.push(mapSupabaseCommentToFeedComment(row, author));
    commentsByPostId.set(row.post_id, list);
  });

  const postLikeCountById = new Map<string, number>();
  const postLikedByCurrentUser = new Set<string>();
  ((postLikesResult.data ?? []) as SupabaseLikeRow[]).forEach((row) => {
    postLikeCountById.set(row.post_id, (postLikeCountById.get(row.post_id) ?? 0) + 1);
    if (row.user_id === authUserId) postLikedByCurrentUser.add(row.post_id);
  });

  const mediaRows = (mediaResult.data ?? []) as PostMediaRow[];
  const signedUrlByPath = await getPostMediaSignedUrls(mediaRows.map((row) => row.storage_path));
  const mediaByPostId = new Map<string, PostMediaItem[]>();
  mediaRows.forEach((row) => {
    const url = signedUrlByPath[row.storage_path];
    if (!url) return;
    const list = mediaByPostId.get(row.post_id) ?? [];
    list.push({ id: row.id, url, width: row.width, height: row.height });
    mediaByPostId.set(row.post_id, list);
  });

  postRows.forEach((row) => {
    resolved.set(
      row.id,
      mapSupabasePostToFeedPost(
        row,
        commentsByPostId.get(row.id) ?? [],
        postLikeCountById.get(row.id) ?? 0,
        postLikedByCurrentUser.has(row.id),
        authorDisplayById[row.author_id] ?? UNKNOWN_AUTHOR_DISPLAY,
        mediaByPostId.get(row.id) ?? [],
      ),
    );
  });

  const tripLikeCountById = new Map<string, number>();
  const tripLikedByCurrentUser = new Set<string>();
  ((tripLikesResult.data ?? []) as SupabaseTripLikeRow[]).forEach((row) => {
    tripLikeCountById.set(row.trip_id, (tripLikeCountById.get(row.trip_id) ?? 0) + 1);
    if (row.user_id === authUserId) tripLikedByCurrentUser.add(row.trip_id);
  });

  const latestOwnRequestByTripId: Record<string, SupabaseTripRequestRow> = {};
  ((tripRequestsResult.data ?? []) as SupabaseTripRequestRow[]).forEach((row) => {
    if (row.requester_id !== authUserId) return;
    const existing = latestOwnRequestByTripId[row.trip_id];
    if (!existing || new Date(row.created_at).getTime() > new Date(existing.created_at).getTime()) {
      latestOwnRequestByTripId[row.trip_id] = row;
    }
  });

  tripRows.forEach((row) => {
    resolved.set(
      row.id,
      mapSupabaseTripToFeedPost(
        row,
        tripLikeCountById.get(row.id) ?? 0,
        tripLikedByCurrentUser.has(row.id),
        latestOwnRequestByTripId[row.id],
        authorDisplayById[row.owner_id] ?? UNKNOWN_AUTHOR_DISPLAY,
      ),
    );
  });

  const meetupLikeCountById = new Map<string, number>();
  const meetupLikedByCurrentUser = new Set<string>();
  ((meetupLikesResult.data ?? []) as SupabaseMeetupLikeRow[]).forEach((row) => {
    meetupLikeCountById.set(row.meetup_id, (meetupLikeCountById.get(row.meetup_id) ?? 0) + 1);
    if (row.user_id === authUserId) meetupLikedByCurrentUser.add(row.meetup_id);
  });

  const attendeeIdsByMeetupId = new Map<string, string[]>();
  ((attendeesResult.data ?? []) as SupabaseMeetupAttendeeRow[]).forEach((row) => {
    const list = attendeeIdsByMeetupId.get(row.meetup_id) ?? [];
    list.push(row.user_id);
    attendeeIdsByMeetupId.set(row.meetup_id, list);
  });

  meetupRows.forEach((row) => {
    resolved.set(
      row.id,
      mapSupabaseMeetupToFeedPost(
        row,
        attendeeIdsByMeetupId.get(row.id) ?? [],
        meetupLikeCountById.get(row.id) ?? 0,
        meetupLikedByCurrentUser.has(row.id),
        authorDisplayById[row.organizer_id] ?? UNKNOWN_AUTHOR_DISPLAY,
      ),
    );
  });

  const wantedLikeCountById = new Map<string, number>();
  const wantedLikedByCurrentUser = new Set<string>();
  ((wantedLikesResult.data ?? []) as SupabaseWantedLikeRow[]).forEach((row) => {
    wantedLikeCountById.set(row.wanted_entry_id, (wantedLikeCountById.get(row.wanted_entry_id) ?? 0) + 1);
    if (row.user_id === authUserId) wantedLikedByCurrentUser.add(row.wanted_entry_id);
  });

  wantedRows.forEach((row) => {
    resolved.set(
      row.id,
      mapSupabaseWantedEntryToFeedPost(row, wantedLikeCountById.get(row.id) ?? 0, wantedLikedByCurrentUser.has(row.id), authorDisplayById[row.owner_id] ?? UNKNOWN_AUTHOR_DISPLAY),
    );
  });

  return resolved;
}

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
      const resolved = await resolveSavedContent(authUserId, { postIds, tripIds, meetupIds, wantedIds });
      if (!isCurrent) return;
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
