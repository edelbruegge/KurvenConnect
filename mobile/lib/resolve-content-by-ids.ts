import type { FeedComment, FeedPost, PostMediaItem } from '@/data/feed-posts';
import { getInitialsFromName } from '@/lib/map-supabase-profile';
import { mapPostError } from '@/lib/post-errors';
import { mapSupabaseCommentToFeedComment, mapSupabasePostToFeedPost, type SupabaseCommentRow, type SupabaseLikeRow, type SupabasePostRow } from '@/lib/map-supabase-post';
import { mapSupabaseTripToFeedPost, type SupabaseTripLikeRow, type SupabaseTripRequestRow, type SupabaseTripRow } from '@/lib/map-supabase-trip';
import { mapSupabaseMeetupToFeedPost, type SupabaseMeetupAttendeeRow, type SupabaseMeetupLikeRow, type SupabaseMeetupRow } from '@/lib/map-supabase-meetup';
import { mapSupabaseWantedEntryToFeedPost, type SupabaseWantedEntryRow, type SupabaseWantedLikeRow } from '@/lib/map-supabase-wanted-entry';
import { getPostMediaSignedUrls, POST_MEDIA_SELECT_COLUMNS, type PostMediaRow } from '@/lib/post-media';
import { supabase } from '@/lib/supabase';

type AuthorDisplay = { displayName: string; initials: string; avatarUrl?: string };
const UNKNOWN_AUTHOR_DISPLAY: AuthorDisplay = { displayName: 'Unbekanntes Mitglied', initials: '?' };

/**
 * Resolves full FeedPost content for an arbitrary id set, deliberately independent of the active
 * club (context/active-club-context.tsx) -- FeedPostsContext's own `posts` only ever holds the
 * currently active team's content, so content reached another way (a saved item from a different
 * team, or a profile's own post history) would otherwise become unreachable the moment the viewer
 * browses a different club. RLS already allows reading any of these rows regardless of team, so a
 * plain `.in('id', ids)` per table, scoped only by the id lists the caller already resolved, is
 * safe and correct. Shared by context/saved-context.tsx ("Gespeichert") and
 * context/feed-posts-context.tsx (a profile's own post history, see loadUserContent) so this
 * fairly involved mapping (comments/likes/media/attendees/requests) exists in exactly one place.
 */
export type ResolveContentByIdsResult = {
  resolved: Map<string, FeedPost>;
  // Set only when one of the primary content queries (posts/trips/meetups/wanted_entries) itself
  // errored -- a real Supabase/network failure, never a legitimate "0 rows". Callers must surface
  // this distinctly (retry banner) rather than treat the affected ids as silently nonexistent
  // (Vorgabe: ein echter Fehler darf nicht wie "0 gefundene Posts" behandelt werden). Errors on the
  // supplementary queries below (comments/likes/media/attendees/requests) remain fault-tolerant by
  // design, same reasoning as elsewhere in this codebase: a post is still real and worth showing
  // even if, say, its like count failed to load.
  error: string | null;
};

export async function resolveContentByIds(
  authUserId: string,
  idsByCategory: { postIds: string[]; tripIds: string[]; meetupIds: string[]; wantedIds: string[] },
): Promise<ResolveContentByIdsResult> {
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

  const primaryError = postRowsResult.error ?? tripRowsResult.error ?? meetupRowsResult.error ?? wantedRowsResult.error;
  if (primaryError) {
    return { resolved, error: mapPostError(primaryError) };
  }

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

  return { resolved, error: null };
}
