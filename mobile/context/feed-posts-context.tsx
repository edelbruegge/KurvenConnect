import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useActiveClub } from '@/context/active-club-context';
import { useAuth } from '@/context/auth-context';
import { useProfiles } from '@/context/profile-context';
import { feedPosts, isMeetupFull, type FeedComment, type FeedPost, type NewFeedPost, type PostMediaItem } from '@/data/feed-posts';
import { getReportTargetKey, type ReportTargetType } from '@/data/reports';
import { CURRENT_USER_ID } from '@/data/users';
import { getInitialsFromName } from '@/lib/map-supabase-profile';
import {
  mapSupabaseCommentToFeedComment,
  mapSupabasePostToFeedPost,
  type SupabaseCommentRow,
  type SupabaseLikeRow,
  type SupabasePostRow,
} from '@/lib/map-supabase-post';
import { mapPostError } from '@/lib/post-errors';
import {
  mapSupabaseTripToFeedPost,
  type SupabaseTripLikeRow,
  type SupabaseTripRequestRow,
  type SupabaseTripRow,
} from '@/lib/map-supabase-trip';
import { mapTripError } from '@/lib/trip-errors';
import {
  mapSupabaseMeetupToFeedPost,
  parseGermanDateAndTimeToIso,
  type SupabaseMeetupAttendeeRow,
  type SupabaseMeetupLikeRow,
  type SupabaseMeetupRow,
} from '@/lib/map-supabase-meetup';
import { mapMeetupError } from '@/lib/meetup-errors';
import {
  mapSupabaseWantedEntryToFeedPost,
  type SupabaseWantedEntryRow,
  type SupabaseWantedLikeRow,
} from '@/lib/map-supabase-wanted-entry';
import { mapWantedEntryError } from '@/lib/wanted-entry-errors';
import { getPostMediaSignedUrl, getPostMediaSignedUrls, POST_MEDIA_SELECT_COLUMNS, type PostMediaRow } from '@/lib/post-media';
import { resolveContentByIds } from '@/lib/resolve-content-by-ids';
import { supabase } from '@/lib/supabase';

type AuthorDisplay = { displayName: string; initials: string; avatarUrl?: string };

type RealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'reconnecting' | 'error' | 'closed';

// One profile's own content (see loadUserContent) -- posts, sorted newest first, across all four
// content types, independent of activeTeamId.
type UserContentState = { posts: FeedPost[]; isLoading: boolean; error: string | null; hasLoadedOnce: boolean };
const EMPTY_USER_CONTENT_STATE: UserContentState = { posts: [], isLoading: false, error: null, hasLoadedOnce: false };
const USER_CONTENT_LIMIT = 50;

// A minimal structural view of the postgres_changes INSERT payload for
// public.content_visibility_events — only the fields this handler actually reads, same approach
// as NotificationsContext's RealtimeNotificationInsertPayload/ModerationContext's
// RealtimeChangePayload.
type ContentVisibilityEventPayload = {
  new: Record<string, unknown>;
};

// A minimal structural view of a postgres_changes payload subscribed with event:'*' — covers
// INSERT/UPDATE/DELETE on one binding instead of three, same fields Supabase Realtime actually
// sends (`old` only ever carries the replica-identity columns, the primary key by default — see
// 20260816100000_complete_realtime_publication.sql's own header comment on why REPLICA IDENTITY
// FULL is deliberately not needed here).
type RealtimeChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type NewRemoteTripInput = {
  description: string;
  departure: string;
  destination: string;
  departureTime: string;
  freeSeats: number;
  occasion?: string;
  // Optional matchday reference — set when the trip is created from a game-scoped context (e.g.
  // Stadion -> Spiel auswählen -> Plus). See data/games.ts/getPostGameId.
  gameId?: string;
  gameLabel?: string;
};

type NewRemoteTripRequestInput = {
  message?: string;
};

type NewRemoteMeetupInput = {
  description: string;
  title: string;
  location: string;
  date: string;
  eventTime: string;
  maxAttendees?: number;
  gameId: string;
  gameLabel: string;
};

type NewRemoteWantedEntryInput = {
  description: string;
  requestedService: string;
  gameId?: string;
  gameLabel?: string;
};

type FeedPostsContextValue = {
  posts: FeedPost[];
  addPost: (post: NewFeedPost) => void;
  getPostById: (id: string) => FeedPost | undefined;
  findCommentById: (commentId: string) => { post: FeedPost; comment: FeedComment } | undefined;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => Promise<{ error: string | null }>;
  toggleRideRequest: (postId: string) => void;
  toggleMeetupAttendance: (postId: string) => void;

  // Supabase-backed "Beitrag" posts.
  remotePosts: FeedPost[];
  isRemotePostsLoading: boolean;
  remotePostsError: string | null;
  refreshRemotePosts: () => void;
  createRemotePost: (input: { content: string; gameId?: string; gameLabel?: string }) => Promise<{ error: string | null; postId?: string }>;
  // Attaches one already-uploaded image to a post's local state right after upload succeeds (see
  // lib/post-media.ts's uploadPostImage) -- own-mutation path, does not wait for realtime.
  appendRemotePostMedia: (postId: string, media: PostMediaItem) => void;
  addRemoteComment: (postId: string, text: string) => Promise<{ error: string | null }>;
  toggleRemoteLike: (postId: string) => Promise<void>;
  getRemoteAuthorDisplay: (userId: string) => AuthorDisplay;

  // Supabase-backed trips ("Fahrt").
  remoteTrips: FeedPost[];
  isRemoteTripsLoading: boolean;
  remoteTripsError: string | null;
  refreshRemoteTrips: () => void;
  createRemoteTrip: (input: NewRemoteTripInput) => Promise<{ error: string | null }>;
  toggleRemoteTripLike: (tripId: string) => Promise<void>;
  createRemoteTripRequest: (tripId: string, input?: NewRemoteTripRequestInput) => Promise<{ error: string | null }>;
  cancelRemoteTripRequest: (requestId: string) => Promise<{ error: string | null }>;
  respondToRemoteTripRequest: (requestId: string, decision: 'accepted' | 'rejected') => Promise<{ error: string | null }>;
  requestsForOwnedTrips: SupabaseTripRequestRow[];
  getRequestsForTrip: (tripId: string) => SupabaseTripRequestRow[];
  refreshRequestsForTrip: (tripId: string) => Promise<void>;
  refreshOwnTripRequestForTrip: (tripId: string) => Promise<void>;
  pendingRequestCountForTrip: (tripId: string) => number;

  // Supabase-backed meetups ("Treffpunkt").
  remoteMeetups: FeedPost[];
  isRemoteMeetupsLoading: boolean;
  remoteMeetupsError: string | null;
  refreshRemoteMeetups: () => void;
  createRemoteMeetup: (input: NewRemoteMeetupInput) => Promise<{ error: string | null }>;
  toggleRemoteMeetupLike: (meetupId: string) => Promise<void>;
  joinRemoteMeetup: (meetupId: string) => Promise<{ error: string | null }>;
  leaveRemoteMeetup: (meetupId: string) => Promise<{ error: string | null }>;
  getRemoteMeetupAttendees: (meetupId: string) => string[];
  isCurrentUserAttendingMeetup: (meetupId: string) => boolean;

  // Supabase-backed wanted entries ("Gesuch").
  remoteWantedEntries: FeedPost[];
  isRemoteWantedEntriesLoading: boolean;
  remoteWantedEntriesError: string | null;
  refreshRemoteWantedEntries: () => void;
  createRemoteWantedEntry: (input: NewRemoteWantedEntryInput) => Promise<{ error: string | null }>;
  toggleRemoteWantedLike: (wantedEntryId: string) => Promise<void>;

  // Realtime status of the shared content-visibility channel (hidden/restored moderation
  // events) — exposed so a screen can decide whether a focus-triggered refresh is actually
  // needed (only when this is not 'subscribed').
  contentVisibilityRealtimeStatus: RealtimeStatus;
  // True once a moderator has hidden this exact target (via the same content-visibility channel
  // above) and it hasn't been restored since -- checked by app/post/[id].tsx for both locally-held
  // and fetchPostById-fallback-loaded content, so an already-open detail screen (or one reached via
  // the independent-fetch fallback, which bypasses the remotePosts/remoteTrips/etc. list pruning
  // entirely) stops rendering hidden content instead of leaving it visible indefinitely.
  isContentHidden: (targetType: ReportTargetType, targetId: string) => boolean;
  // Realtime status of the content-changes channel (new/updated/deleted posts, comments, likes,
  // trips, meetups, attendees, wanted entries from other clients) — same purpose as above, for
  // hooks/use-refresh-on-focus.ts's isRealtimeHealthy input.
  contentChangesRealtimeStatus: RealtimeStatus;

  // A profile's own post/trip/meetup/wanted-entry history, independent of the viewer's
  // activeTeamId — the main `posts` array above only ever holds the currently active club's
  // content, so a profile screen must not derive "this user's posts" from it (a profile would
  // otherwise appear to lose all history the moment a different club becomes active). See
  // components/profile/profile-view.tsx.
  loadUserContent: (userId: string) => void;
  getUserContentState: (userId: string) => UserContentState;

  // "Stadion → Beiträge": full, independent overview of an active club's real posts (ALL of them,
  // regardless of game_id), never derived from the "Für dich" feed's remotePosts (Vorgabe: kein
  // personalizedPosts.filter/rankedPosts.filter). See loadStadionBeitraege in the provider.
  stadionBeitraegePosts: FeedPost[];
  isStadionBeitraegeLoading: boolean;
  stadionBeitraegeError: string | null;
  // Which team stadionBeitraegePosts currently holds data for -- lets a screen avoid rendering a
  // single stale frame of the previous club's posts right after a club switch, before the reload
  // effect has had a chance to flip isStadionBeitraegeLoading to true.
  stadionBeitraegeTeamId: string | null;
  loadStadionBeitraege: (teamId: string) => void;

  // "Spiel → Beiträge": full, independent overview of one game's real posts, not team_id-filtered
  // (Vorgabe: fetchPostsByGame lädt ALLE Posts mit game_id = X, unabhängig von team_id) and never
  // derived from the "Für dich" feed. See loadPostsByGame in the provider.
  gameBeitraegePosts: FeedPost[];
  isGameBeitraegeLoading: boolean;
  gameBeitraegeError: string | null;
  gameBeitraegeGameId: string | null;
  loadPostsByGame: (gameId: string) => void;

  // "Spiel → Fahrten/Treffen/Gesucht": same reasoning/shape as gameBeitraegePosts above, for the
  // other three content tables -- full, independent, game_id-only overviews, never derived from
  // the team-scoped/capped "Für dich" working set (same rule loadPostsByGame already enforces for
  // Beiträge, previously left unapplied here).
  gameTripsPosts: FeedPost[];
  isGameTripsLoading: boolean;
  gameTripsError: string | null;
  gameTripsGameId: string | null;
  loadTripsByGame: (gameId: string) => void;

  gameMeetupsPosts: FeedPost[];
  isGameMeetupsLoading: boolean;
  gameMeetupsError: string | null;
  gameMeetupsGameId: string | null;
  loadMeetupsByGame: (gameId: string) => void;

  gameWantedPosts: FeedPost[];
  isGameWantedLoading: boolean;
  gameWantedError: string | null;
  gameWantedGameId: string | null;
  loadWantedByGame: (gameId: string) => void;

  // Post Detail fallback: fetches a single post by id directly from public.posts when it isn't
  // already part of the loaded local state (Vorgabe: Für-dich-Ranking ist niemals Source of Truth
  // für Post Detail). Returns { post: null, error: null } for a genuine "not found".
  fetchPostById: (postId: string) => Promise<{ post: FeedPost | null; error: string | null }>;
};

const FeedPostsContext = createContext<FeedPostsContextValue | undefined>(undefined);

const POST_CONTENT_MAX_LENGTH = 2000;
const COMMENT_CONTENT_MAX_LENGTH = 500;
const MEETUP_TITLE_MAX_LENGTH = 200;
const WANTED_SERVICE_MAX_LENGTH = 200;
const REMOTE_POSTS_LIMIT = 50;
const REMOTE_TRIPS_LIMIT = 50;
const REMOTE_MEETUPS_LIMIT = 50;
const REMOTE_WANTED_ENTRIES_LIMIT = 50;
// "Stadion → Beiträge" (see loadStadionBeitraege below) is a full, independent content overview,
// deliberately NOT derived from `remotePosts` above -- that state exists to feed the "Für dich"
// feed and is capped at REMOTE_POSTS_LIMIT for that purpose. A club-wide "all posts" overview must
// not inherit a limit that was only ever meant to bound the Feed's own working set. This is a
// generous safety cap on the query itself (not a UI page size / not pagination), high enough that
// no real club's post history is silently truncated for the foreseeable future.
const STADION_BEITRAEGE_LIMIT = 500;

const POSTS_SELECT_COLUMNS = 'id, author_id, content, category, created_at, updated_at, game_id, game_label, team_id';
const COMMENTS_SELECT_COLUMNS = 'id, post_id, author_id, content, created_at, updated_at';
const LIKES_SELECT_COLUMNS = 'post_id, user_id, created_at';

const TRIPS_SELECT_COLUMNS =
  'id, owner_id, departure, destination, departure_time, seats_available, occasion, description, created_at, updated_at, game_id, game_label, team_id';
const TRIP_LIKES_SELECT_COLUMNS = 'trip_id, user_id, created_at';
const TRIP_REQUESTS_SELECT_COLUMNS = 'id, trip_id, requester_id, message, status, created_at, updated_at';

const MEETUPS_SELECT_COLUMNS =
  'id, organizer_id, title, description, location, starts_at, max_attendees, game_id, game_label, created_at, updated_at, team_id';
const MEETUP_LIKES_SELECT_COLUMNS = 'meetup_id, user_id, created_at';
const MEETUP_ATTENDEES_SELECT_COLUMNS = 'meetup_id, user_id, joined_at';

const WANTED_ENTRIES_SELECT_COLUMNS = 'id, owner_id, description, requested_service, created_at, updated_at, game_id, game_label, team_id';
const WANTED_LIKES_SELECT_COLUMNS = 'wanted_entry_id, user_id, created_at';

const NOT_SIGNED_IN_ERROR = 'Bitte melde dich an, um das zu tun.';
const UNKNOWN_AUTHOR_DISPLAY: AuthorDisplay = { displayName: 'Unbekanntes Mitglied', initials: '?' };

function withLocalSource(post: FeedPost): FeedPost {
  return {
    ...post,
    source: 'local',
    comments: post.comments.map((comment) => ({ ...comment, source: 'local' })),
  };
}

function getCreatedAtMs(post: FeedPost): number {
  return post.createdAtIso ? new Date(post.createdAtIso).getTime() : 0;
}

export function FeedPostsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { currentUser } = useProfiles();
  const { activeTeamId } = useActiveClub();

  const [localPosts, setLocalPosts] = useState<FeedPost[]>(() => feedPosts.map((post) => withLocalSource(post)));

  // A profile's own content, loaded on demand per profile actually viewed -- see loadUserContent
  // below. Reset on account switch so account B never inherits account A's cached profile pages.
  const [userContentByUserId, setUserContentByUserId] = useState<Record<string, UserContentState>>({});

  useEffect(() => {
    if (!authUserId) {
      setUserContentByUserId({});
    }
  }, [authUserId]);

  // "Stadion → Beiträge" full club overview -- independent of `remotePosts`/the "Für dich" feed on
  // purpose (see STADION_BEITRAEGE_LIMIT above and loadStadionBeitraege below). Keyed by team id so
  // a stale previous club's list is never shown as if it were the new club's (Vorgabe: kein
  // Team-B-Datenrest bei Team A).
  const [stadionBeitraegePosts, setStadionBeitraegePosts] = useState<FeedPost[]>([]);
  const [isStadionBeitraegeLoading, setIsStadionBeitraegeLoading] = useState(false);
  const [stadionBeitraegeError, setStadionBeitraegeError] = useState<string | null>(null);
  const [stadionBeitraegeTeamId, setStadionBeitraegeTeamId] = useState<string | null>(null);

  // "Spiel → Beiträge": every post for one specific game, deliberately NOT team_id-filtered (a
  // shared real-world match can have posts from both clubs' fans, and some legacy posts carry
  // game_id with team_id = NULL -- see loadPostsByGame below) and independent of the "Für dich"
  // feed's team-scoped, capped remotePosts.
  const [gameBeitraegePosts, setGameBeitraegePosts] = useState<FeedPost[]>([]);
  const [isGameBeitraegeLoading, setIsGameBeitraegeLoading] = useState(false);
  const [gameBeitraegeError, setGameBeitraegeError] = useState<string | null>(null);
  const [gameBeitraegeGameId, setGameBeitraegeGameId] = useState<string | null>(null);

  // "Spiel → Fahrten/Treffen/Gesucht": same reasoning as gameBeitraegePosts above, one independent
  // state slice per table.
  const [gameTripsPosts, setGameTripsPosts] = useState<FeedPost[]>([]);
  const [isGameTripsLoading, setIsGameTripsLoading] = useState(false);
  const [gameTripsError, setGameTripsError] = useState<string | null>(null);
  const [gameTripsGameId, setGameTripsGameId] = useState<string | null>(null);

  const [gameMeetupsPosts, setGameMeetupsPosts] = useState<FeedPost[]>([]);
  const [isGameMeetupsLoading, setIsGameMeetupsLoading] = useState(false);
  const [gameMeetupsError, setGameMeetupsError] = useState<string | null>(null);
  const [gameMeetupsGameId, setGameMeetupsGameId] = useState<string | null>(null);

  const [gameWantedPosts, setGameWantedPosts] = useState<FeedPost[]>([]);
  const [isGameWantedLoading, setIsGameWantedLoading] = useState(false);
  const [gameWantedError, setGameWantedError] = useState<string | null>(null);
  const [gameWantedGameId, setGameWantedGameId] = useState<string | null>(null);

  const [remotePosts, setRemotePosts] = useState<FeedPost[]>([]);
  const [remoteAuthorProfiles, setRemoteAuthorProfiles] = useState<Record<string, AuthorDisplay>>({});
  const [isRemotePostsLoading, setIsRemotePostsLoading] = useState(false);
  const [remotePostsError, setRemotePostsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const inFlightLikePostIds = useRef<Set<string>>(new Set());

  const [remoteTrips, setRemoteTrips] = useState<FeedPost[]>([]);
  const [isRemoteTripsLoading, setIsRemoteTripsLoading] = useState(false);
  const [remoteTripsError, setRemoteTripsError] = useState<string | null>(null);
  const [tripsReloadToken, setTripsReloadToken] = useState(0);
  const [ownTripRequestByTripId, setOwnTripRequestByTripId] = useState<Record<string, SupabaseTripRequestRow>>({});
  const [requestsForOwnedTrips, setRequestsForOwnedTrips] = useState<SupabaseTripRequestRow[]>([]);
  const inFlightTripLikeIds = useRef<Set<string>>(new Set());

  const [remoteMeetups, setRemoteMeetups] = useState<FeedPost[]>([]);
  const [isRemoteMeetupsLoading, setIsRemoteMeetupsLoading] = useState(false);
  const [remoteMeetupsError, setRemoteMeetupsError] = useState<string | null>(null);
  const [meetupsReloadToken, setMeetupsReloadToken] = useState(0);
  const inFlightMeetupLikeIds = useRef<Set<string>>(new Set());
  const inFlightMeetupAttendanceIds = useRef<Set<string>>(new Set());

  const [remoteWantedEntries, setRemoteWantedEntries] = useState<FeedPost[]>([]);
  const [isRemoteWantedEntriesLoading, setIsRemoteWantedEntriesLoading] = useState(false);
  const [remoteWantedEntriesError, setRemoteWantedEntriesError] = useState<string | null>(null);
  const [wantedEntriesReloadToken, setWantedEntriesReloadToken] = useState(0);
  const inFlightWantedLikeIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never keep showing stale remote content.
      setRemotePosts([]);
      setRemoteAuthorProfiles({});
      setIsRemotePostsLoading(false);
      setRemotePostsError(null);
      return;
    }

    if (!activeTeamId) {
      // Signed in, but the active club hasn't been initialized yet (brief startup window) --
      // keep the loading state rather than flashing an empty feed (Vorgabe 23).
      setRemotePosts([]);
      setIsRemotePostsLoading(true);
      setRemotePostsError(null);
      return;
    }

    let isCurrent = true;
    setIsRemotePostsLoading(true);
    setRemotePostsError(null);

    (async () => {
      const { data: postRows, error: postsError } = await supabase
        .from('posts')
        .select(POSTS_SELECT_COLUMNS)
        .eq('team_id', activeTeamId)
        .order('created_at', { ascending: false })
        .limit(REMOTE_POSTS_LIMIT);

      if (!isCurrent) return;

      if (postsError) {
        // A transient reload error (e.g. the foreground-refresh safety net hitting a network blip)
        // must never erase already-displayed real posts -- only the initial load has nothing yet to
        // preserve. The existing error banner + "Erneut versuchen" already surfaces this; wiping
        // remotePosts here would make already-visible Supabase content disappear for a reason that
        // isn't a legitimate visibility rule (falscher Verein/Moderation/Blockierung).
        setRemotePostsError(mapPostError(postsError));
        setIsRemotePostsLoading(false);
        return;
      }

      const posts = (postRows ?? []) as SupabasePostRow[];

      if (posts.length === 0) {
        setRemotePosts([]);
        setIsRemotePostsLoading(false);
        return;
      }

      const postIds = posts.map((post) => post.id);

      const [commentsResult, likesResult, mediaResult, savesResult] = await Promise.all([
        supabase.from('post_comments').select(COMMENTS_SELECT_COLUMNS).in('post_id', postIds).order('created_at', { ascending: true }),
        supabase.from('post_likes').select(LIKES_SELECT_COLUMNS).in('post_id', postIds),
        supabase.from('post_media').select(POST_MEDIA_SELECT_COLUMNS).in('post_id', postIds).order('position', { ascending: true }),
        // Bundled alongside the other per-page queries above -- no extra round trip. Save counts
        // are only ever an engagement *signal* for "Für dich" ranking (lib/for-you-ranking.ts), so
        // a failure here is deliberately fault-tolerant, same reasoning as media below.
        supabase.rpc('get_post_save_counts', { p_ids: postIds }),
      ]);

      if (!isCurrent) return;

      if (commentsResult.error) {
        // Same reasoning as postsError above: preserve whatever was already loaded and visible.
        setRemotePostsError(mapPostError(commentsResult.error));
        setIsRemotePostsLoading(false);
        return;
      }

      if (likesResult.error) {
        setRemotePostsError(mapPostError(likesResult.error));
        setIsRemotePostsLoading(false);
        return;
      }

      // Deliberately fault-tolerant, unlike comments/likes above: images are a supplementary
      // enhancement to a post, not its core content (Vorgabe: Textpost-Verhalten bleibt
      // unverändert). A media-fetch problem must never take down the entire feed -- posts simply
      // render without images rather than not rendering at all.
      const comments = (commentsResult.data ?? []) as SupabaseCommentRow[];
      const likes = (likesResult.data ?? []) as SupabaseLikeRow[];
      const mediaRows = mediaResult.error ? [] : ((mediaResult.data ?? []) as PostMediaRow[]);
      const saveCountRows = savesResult.error ? [] : ((savesResult.data ?? []) as { id: string; save_count: number }[]);
      const saveCountByPostId = new Map(saveCountRows.map((row) => [row.id, row.save_count]));

      const authorIds = new Set<string>();
      posts.forEach((post) => authorIds.add(post.author_id));
      comments.forEach((comment) => authorIds.add(comment.author_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemotePostsError(mapPostError(profilesError));
        setIsRemotePostsLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null; avatar_url: string | null }) => {
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

      const likeCountByPostId = new Map<string, number>();
      const likedPostIdsByCurrentUser = new Set<string>();
      likes.forEach((row) => {
        likeCountByPostId.set(row.post_id, (likeCountByPostId.get(row.post_id) ?? 0) + 1);
        if (row.user_id === authUserId) {
          likedPostIdsByCurrentUser.add(row.post_id);
        }
      });

      // One batched Storage call for every image across every visible post, regardless of count
      // -- never one createSignedUrl() call per post/image (no N+1).
      const signedUrlByPath = await getPostMediaSignedUrls(mediaRows.map((row) => row.storage_path));

      if (!isCurrent) return;

      const mediaByPostId = new Map<string, PostMediaItem[]>();
      mediaRows.forEach((row) => {
        const url = signedUrlByPath[row.storage_path];
        if (!url) return; // Signing failed for this one object -- skip it rather than show a broken image.
        const list = mediaByPostId.get(row.post_id) ?? [];
        list.push({ id: row.id, url, width: row.width, height: row.height });
        mediaByPostId.set(row.post_id, list);
      });

      const mappedPosts = posts.map((row) =>
        mapSupabasePostToFeedPost(
          row,
          commentsByPostId.get(row.id) ?? [],
          likeCountByPostId.get(row.id) ?? 0,
          likedPostIdsByCurrentUser.has(row.id),
          authorDisplayById[row.author_id] ?? UNKNOWN_AUTHOR_DISPLAY,
          mediaByPostId.get(row.id) ?? [],
          saveCountByPostId.get(row.id) ?? 0,
        ),
      );

      setRemoteAuthorProfiles((current) => ({ ...current, ...authorDisplayById }));
      setRemotePosts(mappedPosts);
      setIsRemotePostsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, activeTeamId, reloadToken]);

  useEffect(() => {
    if (!authUserId) {
      setRemoteTrips([]);
      setRemoteAuthorProfiles({});
      setIsRemoteTripsLoading(false);
      setRemoteTripsError(null);
      setOwnTripRequestByTripId({});
      setRequestsForOwnedTrips([]);
      return;
    }

    if (!activeTeamId) {
      setRemoteTrips([]);
      setIsRemoteTripsLoading(true);
      setRemoteTripsError(null);
      return;
    }

    let isCurrent = true;
    setIsRemoteTripsLoading(true);
    setRemoteTripsError(null);

    (async () => {
      const { data: tripRows, error: tripsError } = await supabase
        .from('trips')
        .select(TRIPS_SELECT_COLUMNS)
        .eq('team_id', activeTeamId)
        .order('created_at', { ascending: false })
        .limit(REMOTE_TRIPS_LIMIT);

      if (!isCurrent) return;

      if (tripsError) {
        setRemoteTripsError(mapTripError(tripsError));
        setRemoteTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      const trips = (tripRows ?? []) as SupabaseTripRow[];

      if (trips.length === 0) {
        setRemoteTrips([]);
        setOwnTripRequestByTripId({});
        setRequestsForOwnedTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      const tripIds = trips.map((trip) => trip.id);

      const [likesResult, requestsResult, savesResult] = await Promise.all([
        supabase.from('trip_likes').select(TRIP_LIKES_SELECT_COLUMNS).in('trip_id', tripIds),
        supabase.from('trip_requests').select(TRIP_REQUESTS_SELECT_COLUMNS).in('trip_id', tripIds),
        supabase.rpc('get_trip_save_counts', { p_ids: tripIds }),
      ]);

      if (!isCurrent) return;

      if (likesResult.error) {
        setRemoteTripsError(mapTripError(likesResult.error));
        setRemoteTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      if (requestsResult.error) {
        setRemoteTripsError(mapTripError(requestsResult.error));
        setRemoteTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      const likes = (likesResult.data ?? []) as SupabaseTripLikeRow[];
      const requests = (requestsResult.data ?? []) as SupabaseTripRequestRow[];
      const saveCountRows = savesResult.error ? [] : ((savesResult.data ?? []) as { id: string; save_count: number }[]);
      const saveCountByTripId = new Map(saveCountRows.map((row) => [row.id, row.save_count]));

      const authorIds = new Set<string>(trips.map((trip) => trip.owner_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemoteTripsError(mapTripError(profilesError));
        setRemoteTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null; avatar_url: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName), avatarUrl: row.avatar_url ?? undefined };
      });

      const likeCountByTripId = new Map<string, number>();
      const likedTripIdsByCurrentUser = new Set<string>();
      likes.forEach((row) => {
        likeCountByTripId.set(row.trip_id, (likeCountByTripId.get(row.trip_id) ?? 0) + 1);
        if (row.user_id === authUserId) {
          likedTripIdsByCurrentUser.add(row.trip_id);
        }
      });

      // RLS on trip_requests already scopes `requests` to exactly what this user is allowed to
      // see: their own requests (any trip) plus all requests on trips they own. That single
      // fetch is reused for both derivations below — no extra query needed.
      const ownedTripIds = new Set(trips.filter((trip) => trip.owner_id === authUserId).map((trip) => trip.id));

      const latestOwnRequestByTripId: Record<string, SupabaseTripRequestRow> = {};
      const ownedTripRequests: SupabaseTripRequestRow[] = [];

      requests.forEach((row) => {
        if (row.requester_id === authUserId) {
          const existing = latestOwnRequestByTripId[row.trip_id];
          if (!existing || new Date(row.created_at).getTime() > new Date(existing.created_at).getTime()) {
            latestOwnRequestByTripId[row.trip_id] = row;
          }
        }

        if (ownedTripIds.has(row.trip_id)) {
          ownedTripRequests.push(row);
        }
      });

      const mappedTrips = trips.map((row) =>
        mapSupabaseTripToFeedPost(
          row,
          likeCountByTripId.get(row.id) ?? 0,
          likedTripIdsByCurrentUser.has(row.id),
          latestOwnRequestByTripId[row.id],
          authorDisplayById[row.owner_id] ?? UNKNOWN_AUTHOR_DISPLAY,
          saveCountByTripId.get(row.id) ?? 0,
        ),
      );

      setRemoteAuthorProfiles((current) => ({ ...current, ...authorDisplayById }));
      setRemoteTrips(mappedTrips);
      setOwnTripRequestByTripId(latestOwnRequestByTripId);
      setRequestsForOwnedTrips(ownedTripRequests);
      setIsRemoteTripsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, activeTeamId, tripsReloadToken]);

  useEffect(() => {
    if (!authUserId) {
      setRemoteMeetups([]);
      setRemoteAuthorProfiles({});
      setIsRemoteMeetupsLoading(false);
      setRemoteMeetupsError(null);
      return;
    }

    if (!activeTeamId) {
      setRemoteMeetups([]);
      setIsRemoteMeetupsLoading(true);
      setRemoteMeetupsError(null);
      return;
    }

    let isCurrent = true;
    setIsRemoteMeetupsLoading(true);
    setRemoteMeetupsError(null);

    (async () => {
      const { data: meetupRows, error: meetupsError } = await supabase
        .from('meetups')
        .select(MEETUPS_SELECT_COLUMNS)
        .eq('team_id', activeTeamId)
        .order('starts_at', { ascending: true })
        .limit(REMOTE_MEETUPS_LIMIT);

      if (!isCurrent) return;

      if (meetupsError) {
        setRemoteMeetupsError(mapMeetupError(meetupsError));
        setRemoteMeetups([]);
        setIsRemoteMeetupsLoading(false);
        return;
      }

      const meetups = (meetupRows ?? []) as SupabaseMeetupRow[];

      if (meetups.length === 0) {
        setRemoteMeetups([]);
        setIsRemoteMeetupsLoading(false);
        return;
      }

      const meetupIds = meetups.map((meetup) => meetup.id);

      const [likesResult, attendeesResult, savesResult] = await Promise.all([
        supabase.from('meetup_likes').select(MEETUP_LIKES_SELECT_COLUMNS).in('meetup_id', meetupIds),
        supabase.from('meetup_attendees').select(MEETUP_ATTENDEES_SELECT_COLUMNS).in('meetup_id', meetupIds),
        supabase.rpc('get_meetup_save_counts', { p_ids: meetupIds }),
      ]);

      if (!isCurrent) return;

      if (likesResult.error) {
        setRemoteMeetupsError(mapMeetupError(likesResult.error));
        setRemoteMeetups([]);
        setIsRemoteMeetupsLoading(false);
        return;
      }

      if (attendeesResult.error) {
        setRemoteMeetupsError(mapMeetupError(attendeesResult.error));
        setRemoteMeetups([]);
        setIsRemoteMeetupsLoading(false);
        return;
      }

      const likes = (likesResult.data ?? []) as SupabaseMeetupLikeRow[];
      const attendeeRows = (attendeesResult.data ?? []) as SupabaseMeetupAttendeeRow[];
      const saveCountRows = savesResult.error ? [] : ((savesResult.data ?? []) as { id: string; save_count: number }[]);
      const saveCountByMeetupId = new Map(saveCountRows.map((row) => [row.id, row.save_count]));

      const authorIds = new Set<string>(meetups.map((meetup) => meetup.organizer_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemoteMeetupsError(mapMeetupError(profilesError));
        setRemoteMeetups([]);
        setIsRemoteMeetupsLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null; avatar_url: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName), avatarUrl: row.avatar_url ?? undefined };
      });

      const likeCountByMeetupId = new Map<string, number>();
      const likedMeetupIdsByCurrentUser = new Set<string>();
      likes.forEach((row) => {
        likeCountByMeetupId.set(row.meetup_id, (likeCountByMeetupId.get(row.meetup_id) ?? 0) + 1);
        if (row.user_id === authUserId) {
          likedMeetupIdsByCurrentUser.add(row.meetup_id);
        }
      });

      const attendeeIdsByMeetupId = new Map<string, string[]>();
      attendeeRows.forEach((row) => {
        const list = attendeeIdsByMeetupId.get(row.meetup_id) ?? [];
        list.push(row.user_id);
        attendeeIdsByMeetupId.set(row.meetup_id, list);
      });

      const mappedMeetups = meetups.map((row) =>
        mapSupabaseMeetupToFeedPost(
          row,
          attendeeIdsByMeetupId.get(row.id) ?? [],
          likeCountByMeetupId.get(row.id) ?? 0,
          likedMeetupIdsByCurrentUser.has(row.id),
          authorDisplayById[row.organizer_id] ?? UNKNOWN_AUTHOR_DISPLAY,
          saveCountByMeetupId.get(row.id) ?? 0,
        ),
      );

      setRemoteAuthorProfiles((current) => ({ ...current, ...authorDisplayById }));
      setRemoteMeetups(mappedMeetups);
      setIsRemoteMeetupsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, activeTeamId, meetupsReloadToken]);

  useEffect(() => {
    if (!authUserId) {
      setRemoteWantedEntries([]);
      setRemoteAuthorProfiles({});
      setIsRemoteWantedEntriesLoading(false);
      setRemoteWantedEntriesError(null);
      return;
    }

    if (!activeTeamId) {
      setRemoteWantedEntries([]);
      setIsRemoteWantedEntriesLoading(true);
      setRemoteWantedEntriesError(null);
      return;
    }

    let isCurrent = true;
    setIsRemoteWantedEntriesLoading(true);
    setRemoteWantedEntriesError(null);

    (async () => {
      const { data: wantedRows, error: wantedError } = await supabase
        .from('wanted_entries')
        .select(WANTED_ENTRIES_SELECT_COLUMNS)
        .eq('team_id', activeTeamId)
        .order('created_at', { ascending: false })
        .limit(REMOTE_WANTED_ENTRIES_LIMIT);

      if (!isCurrent) return;

      if (wantedError) {
        setRemoteWantedEntriesError(mapWantedEntryError(wantedError));
        setRemoteWantedEntries([]);
        setIsRemoteWantedEntriesLoading(false);
        return;
      }

      const wantedEntries = (wantedRows ?? []) as SupabaseWantedEntryRow[];

      if (wantedEntries.length === 0) {
        setRemoteWantedEntries([]);
        setIsRemoteWantedEntriesLoading(false);
        return;
      }

      const wantedEntryIds = wantedEntries.map((entry) => entry.id);

      const [likesResult, savesResult] = await Promise.all([
        supabase.from('wanted_likes').select(WANTED_LIKES_SELECT_COLUMNS).in('wanted_entry_id', wantedEntryIds),
        supabase.rpc('get_wanted_save_counts', { p_ids: wantedEntryIds }),
      ]);

      if (!isCurrent) return;

      if (likesResult.error) {
        setRemoteWantedEntriesError(mapWantedEntryError(likesResult.error));
        setRemoteWantedEntries([]);
        setIsRemoteWantedEntriesLoading(false);
        return;
      }

      const likes = (likesResult.data ?? []) as SupabaseWantedLikeRow[];
      const saveCountRows = savesResult.error ? [] : ((savesResult.data ?? []) as { id: string; save_count: number }[]);
      const saveCountByWantedEntryId = new Map(saveCountRows.map((row) => [row.id, row.save_count]));

      const authorIds = new Set<string>(wantedEntries.map((entry) => entry.owner_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemoteWantedEntriesError(mapWantedEntryError(profilesError));
        setRemoteWantedEntries([]);
        setIsRemoteWantedEntriesLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null; avatar_url: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName), avatarUrl: row.avatar_url ?? undefined };
      });

      const likeCountByWantedEntryId = new Map<string, number>();
      const likedWantedEntryIdsByCurrentUser = new Set<string>();
      likes.forEach((row) => {
        likeCountByWantedEntryId.set(row.wanted_entry_id, (likeCountByWantedEntryId.get(row.wanted_entry_id) ?? 0) + 1);
        if (row.user_id === authUserId) {
          likedWantedEntryIdsByCurrentUser.add(row.wanted_entry_id);
        }
      });

      const mappedWantedEntries = wantedEntries.map((row) =>
        mapSupabaseWantedEntryToFeedPost(
          row,
          likeCountByWantedEntryId.get(row.id) ?? 0,
          likedWantedEntryIdsByCurrentUser.has(row.id),
          authorDisplayById[row.owner_id] ?? UNKNOWN_AUTHOR_DISPLAY,
          saveCountByWantedEntryId.get(row.id) ?? 0,
        ),
      );

      setRemoteAuthorProfiles((current) => ({ ...current, ...authorDisplayById }));
      setRemoteWantedEntries(mappedWantedEntries);
      setIsRemoteWantedEntriesLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, activeTeamId, wantedEntriesReloadToken]);

  const refreshRemotePosts = () => {
    setReloadToken((token) => token + 1);
  };

  const refreshRemoteTrips = () => {
    setTripsReloadToken((token) => token + 1);
  };

  const refreshRemoteMeetups = () => {
    setMeetupsReloadToken((token) => token + 1);
  };

  const refreshRemoteWantedEntries = () => {
    setWantedEntriesReloadToken((token) => token + 1);
  };

  // --- Content visibility sync: a single, statically-named realtime channel shared by every
  // signed-in user (not moderator-only — everyone needs to learn when something they can already
  // see gets hidden/restored). content_restrictions itself stays moderator-only; this channel
  // only ever carries {target_type, target_id, action}, written exclusively by
  // apply_report_action/restore_restricted_content on actual success (see
  // 20260809120000_fix_content_visibility_realtime_sync.sql). ---
  const [contentVisibilityRealtimeStatus, setContentVisibilityRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [contentVisibilityReconnectToken, setContentVisibilityReconnectToken] = useState(0);
  const contentVisibilityRealtimeStatusRef = useRef<RealtimeStatus>('idle');

  // `${targetType}:${targetId}` keys for content a moderator has currently hidden. Unlike the
  // remotePosts/remoteTrips/etc. pruning below (which only removes an item from the shared list
  // caches), this is checked directly by app/post/[id].tsx so a detail screen already open on that
  // exact content -- or one reached moments later via the independent fetchPostById fallback,
  // which queries the content tables directly and is therefore not affected by the list pruning at
  // all -- also stops rendering it, instead of a moderator's hide action leaving that one screen
  // showing (or briefly re-showing) removed content indefinitely.
  const [hiddenContentKeys, setHiddenContentKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    contentVisibilityRealtimeStatusRef.current = contentVisibilityRealtimeStatus;
  }, [contentVisibilityRealtimeStatus]);

  const handleContentVisibilityEvent = (payload: ContentVisibilityEventPayload) => {
    const row = payload.new;
    const isValidRow =
      row && typeof row.target_type === 'string' && typeof row.target_id === 'string' && typeof row.action === 'string';

    if (!isValidRow) {
      return;
    }

    const targetType = row.target_type as string;
    const targetId = row.target_id as string;
    const action = row.action as string;

    if (action === 'hidden') {
      if (targetType === 'post' || targetType === 'trip' || targetType === 'meetup' || targetType === 'wanted_entry') {
        // Client vocabulary calls a Gesucht/wanted_entry target 'request' (see
        // lib/map-supabase-content-restriction.ts) -- translated here so isContentHidden below can
        // be called with the same ReportTargetType every other safety check already uses.
        const clientTargetType: ReportTargetType = targetType === 'wanted_entry' ? 'request' : targetType;
        setHiddenContentKeys((current) => {
          const next = new Set(current);
          next.add(getReportTargetKey(clientTargetType, targetId));
          return next;
        });
      }

      if (targetType === 'post') {
        setRemotePosts((current) => current.filter((post) => post.id !== targetId));
      } else if (targetType === 'trip') {
        setRemoteTrips((current) => current.filter((trip) => trip.id !== targetId));
      } else if (targetType === 'meetup') {
        setRemoteMeetups((current) => current.filter((meetup) => meetup.id !== targetId));
      } else if (targetType === 'wanted_entry') {
        setRemoteWantedEntries((current) => current.filter((entry) => entry.id !== targetId));
      } else if (targetType === 'comment') {
        // Comments only ever persist on public.posts ("Beitrag") in the current data model — the
        // post itself is untouched, only the hidden comment is removed from it.
        setRemotePosts((current) =>
          current.map((post) =>
            post.comments.some((comment) => comment.id === targetId)
              ? { ...post, comments: post.comments.filter((comment) => comment.id !== targetId) }
              : post,
          ),
        );
      }
      return;
    }

    if (action === 'restored') {
      if (targetType === 'post' || targetType === 'trip' || targetType === 'meetup' || targetType === 'wanted_entry') {
        const clientTargetType: ReportTargetType = targetType === 'wanted_entry' ? 'request' : targetType;
        setHiddenContentKeys((current) => {
          if (!current.has(getReportTargetKey(clientTargetType, targetId))) return current;
          const next = new Set(current);
          next.delete(getReportTargetKey(clientTargetType, targetId));
          return next;
        });
      }

      if (targetType === 'post' || targetType === 'comment') {
        refreshRemotePosts();
      } else if (targetType === 'trip') {
        refreshRemoteTrips();
      } else if (targetType === 'meetup') {
        refreshRemoteMeetups();
      } else if (targetType === 'wanted_entry') {
        refreshRemoteWantedEntries();
      }
    }
  };

  // Ref indirection so the long-lived channel subscription below always calls the latest
  // closure without needing to reconnect the channel on every state change — same pattern
  // already used in NotificationsContext/ModerationContext.
  const handleContentVisibilityEventRef = useRef(handleContentVisibilityEvent);
  handleContentVisibilityEventRef.current = handleContentVisibilityEvent;

  useEffect(() => {
    if (!authUserId) {
      setContentVisibilityRealtimeStatus('idle');
      setHiddenContentKeys(new Set());
      return;
    }

    let isCurrent = true;
    setContentVisibilityRealtimeStatus((current) => (current === 'error' || current === 'closed' ? 'reconnecting' : 'connecting'));

    const channel = supabase
      .channel('content-visibility')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'content_visibility_events' },
        (payload) => {
          if (!isCurrent) return;
          handleContentVisibilityEventRef.current(payload as unknown as ContentVisibilityEventPayload);
        },
      )
      .subscribe((status) => {
        if (!isCurrent) return;

        if (status === 'SUBSCRIBED') {
          setContentVisibilityRealtimeStatus('subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setContentVisibilityRealtimeStatus('error');
        } else if (status === 'CLOSED') {
          setContentVisibilityRealtimeStatus((current) => (current === 'error' ? current : 'closed'));
        }
      });

    return () => {
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [authUserId, contentVisibilityReconnectToken]);

  // --- Content-changes sync: a single consolidated channel (not ten separate ones) for the
  // tables added to supabase_realtime in 20260816100000_complete_realtime_publication.sql —
  // posts/trips/meetups/wanted_entries plus their comments/likes/attendees. This is what makes
  // another signed-in client's new post/like/comment/attendance show up here without a reload;
  // own mutations already update local state immediately and never wait for this (see
  // createRemotePost/toggleRemoteLike/addRemoteComment/joinRemoteMeetup etc. above) — every INSERT
  // handler below is a no-op for a row that's already present (by id), and every *_likes handler
  // skips rows whose user_id is this account's own (already applied optimistically), so an own
  // mutation's realtime echo can never double-apply. Existing block/moderation filtering
  // (useVisiblePosts, applied at render time in every screen) is untouched and keeps working
  // exactly as before on this now-richer raw state — moderative hiding itself continues to run
  // entirely through the separate content-visibility channel above, not through this one. ---
  const [contentChangesRealtimeStatus, setContentChangesRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [contentChangesReconnectToken, setContentChangesReconnectToken] = useState(0);
  const contentChangesRealtimeStatusRef = useRef<RealtimeStatus>('idle');

  useEffect(() => {
    contentChangesRealtimeStatusRef.current = contentChangesRealtimeStatus;
  }, [contentChangesRealtimeStatus]);

  // Fetches and caches a single profile's display info on demand — same shape as the bulk
  // authorDisplayById lookups above, just for one id instead of a batch. FeedPostCard/PostDetail
  // resolve a supabase post's author via getRemoteAuthorDisplay(post.userId) at render time (never
  // trusting the name baked into the post object for source:'supabase' content), so updating this
  // cache alone is enough for the correct name to appear as soon as it resolves — no need to touch
  // the post/trip/meetup/wanted-entry row itself afterwards.
  const ensureAuthorProfileCached = (userId: string | null | undefined) => {
    if (!userId || remoteAuthorProfiles[userId]) {
      return;
    }

    supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const displayName = data.display_name?.trim() || 'Neues Mitglied';
        setRemoteAuthorProfiles((current) =>
          current[userId]
            ? current
            : { ...current, [userId]: { displayName, initials: getInitialsFromName(displayName), avatarUrl: data.avatar_url ?? undefined } },
        );
      });
  };

  const handlePostsChange = (payload: RealtimeChangePayload) => {
    // Also keeps stadionBeitraegePosts (the "Stadion → Beiträge" full club overview, see
    // loadStadionBeitraege above) and gameBeitraegePosts ("Spiel → Beiträge", see loadPostsByGame
    // above) live off this same already-team-filtered channel -- no second subscription. Every
    // branch below only ever merges/dedupes/removes by id, never replaces the list wholesale
    // (Vorgabe: kein `setPosts([newPost])`). Note: INSERT/UPDATE on this channel are filtered
    // server-side to team_id = activeTeamId, so a cross-team post sharing the same game_id (rare,
    // see report) only appears in gameBeitraegePosts after the next loadPostsByGame call, not
    // instantly -- DELETE has no such filter and always removes by id regardless of team.
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabasePostRow;
      if (!row?.id) return;
      ensureAuthorProfileCached(row.author_id);
      const newPost = () => mapSupabasePostToFeedPost(row, [], 0, false, UNKNOWN_AUTHOR_DISPLAY);
      setRemotePosts((current) => (current.some((post) => post.id === row.id) ? current : [newPost(), ...current]));
      setStadionBeitraegePosts((current) => (current.some((post) => post.id === row.id) ? current : [newPost(), ...current]));
      if (row.game_id && row.game_id === gameBeitraegeGameId) {
        setGameBeitraegePosts((current) => (current.some((post) => post.id === row.id) ? current : [newPost(), ...current]));
      }
      return;
    }

    if (payload.eventType === 'UPDATE') {
      const row = payload.new as unknown as SupabasePostRow;
      if (!row?.id) return;
      const applyUpdate = (post: FeedPost) => (post.id === row.id ? { ...post, description: row.content } : post);
      setRemotePosts((current) => current.map(applyUpdate));
      setStadionBeitraegePosts((current) => current.map(applyUpdate));
      setGameBeitraegePosts((current) => current.map(applyUpdate));
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldId = payload.old?.id as string | undefined;
      if (!oldId) return;
      setRemotePosts((current) => current.filter((post) => post.id !== oldId));
      setStadionBeitraegePosts((current) => current.filter((post) => post.id !== oldId));
      setGameBeitraegePosts((current) => current.filter((post) => post.id !== oldId));
    }
  };

  const handlePostCommentsChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabaseCommentRow;
      if (!row?.id || !row?.post_id) return;
      ensureAuthorProfileCached(row.author_id);
      setRemotePosts((current) =>
        current.map((post) => {
          if (post.id !== row.post_id || post.comments.some((comment) => comment.id === row.id)) return post;
          const author = remoteAuthorProfiles[row.author_id] ?? UNKNOWN_AUTHOR_DISPLAY;
          return { ...post, comments: [...post.comments, mapSupabaseCommentToFeedComment(row, author)] };
        }),
      );
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldId = payload.old?.id as string | undefined;
      if (!oldId) return;
      setRemotePosts((current) =>
        current.map((post) =>
          post.comments.some((comment) => comment.id === oldId)
            ? { ...post, comments: post.comments.filter((comment) => comment.id !== oldId) }
            : post,
        ),
      );
    }
  };

  // Covers both "someone else uploaded an image to a post I can see" and, harmlessly (deduped by
  // id in appendRemotePostMedia), a delayed echo of the current user's own upload -- the uploader
  // itself never waits on this, see appendRemotePostMedia's own doc comment. Reuses the single
  // existing content-changes channel below (one more table binding, not a new subscription).
  const handlePostMediaChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as PostMediaRow;
      if (!row?.id || !row?.post_id || !row?.storage_path) return;
      getPostMediaSignedUrl(row.storage_path).then((url) => {
        if (!url) return;
        appendRemotePostMedia(row.post_id, { id: row.id, url, width: row.width, height: row.height });
      });
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldId = payload.old?.id as string | undefined;
      if (!oldId) return;
      setRemotePosts((current) =>
        current.map((post) =>
          post.media?.some((item) => item.id === oldId) ? { ...post, media: post.media.filter((item) => item.id !== oldId) } : post,
        ),
      );
    }
  };

  const handlePostLikesChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabaseLikeRow;
      if (!row?.post_id || !row?.user_id || row.user_id === authUserId) return;
      setRemotePosts((current) => current.map((post) => (post.id === row.post_id ? { ...post, likes: post.likes + 1 } : post)));
      return;
    }

    if (payload.eventType === 'DELETE') {
      const row = payload.old as unknown as SupabaseLikeRow;
      if (!row?.post_id || !row?.user_id || row.user_id === authUserId) return;
      setRemotePosts((current) =>
        current.map((post) => (post.id === row.post_id ? { ...post, likes: Math.max(0, post.likes - 1) } : post)),
      );
    }
  };

  const handleTripsChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabaseTripRow;
      if (!row?.id) return;
      ensureAuthorProfileCached(row.owner_id);
      setRemoteTrips((current) =>
        current.some((trip) => trip.id === row.id) ? current : [mapSupabaseTripToFeedPost(row, 0, false, undefined, UNKNOWN_AUTHOR_DISPLAY), ...current],
      );
      return;
    }

    if (payload.eventType === 'UPDATE') {
      const row = payload.new as unknown as SupabaseTripRow;
      if (!row?.id) return;
      setRemoteTrips((current) =>
        current.map((trip) =>
          trip.id === row.id
            ? {
                ...trip,
                description: row.description,
                tripDetails: trip.tripDetails
                  ? {
                      ...trip.tripDetails,
                      departure: row.departure,
                      destination: row.destination,
                      departureTime: row.departure_time,
                      freeSeats: row.seats_available,
                      occasion: row.occasion ?? undefined,
                    }
                  : trip.tripDetails,
              }
            : trip,
        ),
      );
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldId = payload.old?.id as string | undefined;
      if (!oldId) return;
      setRemoteTrips((current) => current.filter((trip) => trip.id !== oldId));
    }
  };

  const handleTripLikesChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabaseTripLikeRow;
      if (!row?.trip_id || !row?.user_id || row.user_id === authUserId) return;
      setRemoteTrips((current) => current.map((trip) => (trip.id === row.trip_id ? { ...trip, likes: trip.likes + 1 } : trip)));
      return;
    }

    if (payload.eventType === 'DELETE') {
      const row = payload.old as unknown as SupabaseTripLikeRow;
      if (!row?.trip_id || !row?.user_id || row.user_id === authUserId) return;
      setRemoteTrips((current) =>
        current.map((trip) => (trip.id === row.trip_id ? { ...trip, likes: Math.max(0, trip.likes - 1) } : trip)),
      );
    }
  };

  const handleMeetupsChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabaseMeetupRow;
      if (!row?.id) return;
      ensureAuthorProfileCached(row.organizer_id);
      setRemoteMeetups((current) =>
        current.some((meetup) => meetup.id === row.id)
          ? current
          : [mapSupabaseMeetupToFeedPost(row, [], 0, false, UNKNOWN_AUTHOR_DISPLAY), ...current],
      );
      return;
    }

    if (payload.eventType === 'UPDATE') {
      const row = payload.new as unknown as SupabaseMeetupRow;
      if (!row?.id) return;
      setRemoteMeetups((current) =>
        current.map((meetup) =>
          meetup.id === row.id
            ? {
                ...meetup,
                description: row.description,
                meetupDetails: meetup.meetupDetails
                  ? { ...meetup.meetupDetails, title: row.title, location: row.location, maxAttendees: row.max_attendees ?? undefined }
                  : meetup.meetupDetails,
              }
            : meetup,
        ),
      );
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldId = payload.old?.id as string | undefined;
      if (!oldId) return;
      setRemoteMeetups((current) => current.filter((meetup) => meetup.id !== oldId));
    }
  };

  const handleMeetupLikesChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabaseMeetupLikeRow;
      if (!row?.meetup_id || !row?.user_id || row.user_id === authUserId) return;
      setRemoteMeetups((current) => current.map((meetup) => (meetup.id === row.meetup_id ? { ...meetup, likes: meetup.likes + 1 } : meetup)));
      return;
    }

    if (payload.eventType === 'DELETE') {
      const row = payload.old as unknown as SupabaseMeetupLikeRow;
      if (!row?.meetup_id || !row?.user_id || row.user_id === authUserId) return;
      setRemoteMeetups((current) =>
        current.map((meetup) => (meetup.id === row.meetup_id ? { ...meetup, likes: Math.max(0, meetup.likes - 1) } : meetup)),
      );
    }
  };

  const handleMeetupAttendeesChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabaseMeetupAttendeeRow;
      if (!row?.meetup_id || !row?.user_id) return;
      setRemoteMeetups((current) =>
        current.map((meetup) =>
          meetup.id === row.meetup_id && meetup.meetupDetails && !meetup.meetupDetails.attendeeIds.includes(row.user_id)
            ? { ...meetup, meetupDetails: { ...meetup.meetupDetails, attendeeIds: [...meetup.meetupDetails.attendeeIds, row.user_id] } }
            : meetup,
        ),
      );
      return;
    }

    if (payload.eventType === 'DELETE') {
      const row = payload.old as unknown as SupabaseMeetupAttendeeRow;
      if (!row?.meetup_id || !row?.user_id) return;
      setRemoteMeetups((current) =>
        current.map((meetup) =>
          meetup.id === row.meetup_id && meetup.meetupDetails
            ? { ...meetup, meetupDetails: { ...meetup.meetupDetails, attendeeIds: meetup.meetupDetails.attendeeIds.filter((id) => id !== row.user_id) } }
            : meetup,
        ),
      );
    }
  };

  const handleWantedEntriesChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabaseWantedEntryRow;
      if (!row?.id) return;
      ensureAuthorProfileCached(row.owner_id);
      setRemoteWantedEntries((current) =>
        current.some((entry) => entry.id === row.id) ? current : [mapSupabaseWantedEntryToFeedPost(row, 0, false, UNKNOWN_AUTHOR_DISPLAY), ...current],
      );
      return;
    }

    if (payload.eventType === 'UPDATE') {
      const row = payload.new as unknown as SupabaseWantedEntryRow;
      if (!row?.id) return;
      setRemoteWantedEntries((current) =>
        current.map((entry) =>
          entry.id === row.id
            ? {
                ...entry,
                description: row.description,
                requestDetails: entry.requestDetails ? { ...entry.requestDetails, requestedService: row.requested_service } : entry.requestDetails,
              }
            : entry,
        ),
      );
      return;
    }

    if (payload.eventType === 'DELETE') {
      const oldId = payload.old?.id as string | undefined;
      if (!oldId) return;
      setRemoteWantedEntries((current) => current.filter((entry) => entry.id !== oldId));
    }
  };

  const handleWantedLikesChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'INSERT') {
      const row = payload.new as unknown as SupabaseWantedLikeRow;
      if (!row?.wanted_entry_id || !row?.user_id || row.user_id === authUserId) return;
      setRemoteWantedEntries((current) =>
        current.map((entry) => (entry.id === row.wanted_entry_id ? { ...entry, likes: entry.likes + 1 } : entry)),
      );
      return;
    }

    if (payload.eventType === 'DELETE') {
      const row = payload.old as unknown as SupabaseWantedLikeRow;
      if (!row?.wanted_entry_id || !row?.user_id || row.user_id === authUserId) return;
      setRemoteWantedEntries((current) =>
        current.map((entry) => (entry.id === row.wanted_entry_id ? { ...entry, likes: Math.max(0, entry.likes - 1) } : entry)),
      );
    }
  };

  // Own-account or another cached author's row changing (most relevantly: avatar_url) -- only
  // patches an author already present in remoteAuthorProfiles (i.e. someone with visible content
  // in the currently-loaded feed); an author nobody has loaded yet is left alone rather than
  // growing this cache into a full-table sync. Reuses this already-existing content-changes
  // channel (one more table binding), not a new subscription.
  const handleProfileRowChange = (payload: RealtimeChangePayload) => {
    if (payload.eventType === 'DELETE') return; // profiles are never hard-deleted by this app
    const row = payload.new as unknown as { id?: string; display_name?: string | null; avatar_url?: string | null };
    if (!row?.id) return;

    setRemoteAuthorProfiles((current) => {
      if (!current[row.id as string]) return current;
      const displayName = row.display_name?.trim() || 'Neues Mitglied';
      return {
        ...current,
        [row.id as string]: { displayName, initials: getInitialsFromName(displayName), avatarUrl: row.avatar_url ?? undefined },
      };
    });
  };

  // Ref indirection so the long-lived channel subscription below always calls each latest closure
  // (fresh authUserId/remoteAuthorProfiles) without needing to reconnect the channel every render
  // — same pattern as handleContentVisibilityEventRef above.
  const contentChangeHandlersRef = useRef({
    posts: handlePostsChange,
    comments: handlePostCommentsChange,
    postMedia: handlePostMediaChange,
    postLikes: handlePostLikesChange,
    profile: handleProfileRowChange,
    trips: handleTripsChange,
    tripLikes: handleTripLikesChange,
    meetups: handleMeetupsChange,
    meetupLikes: handleMeetupLikesChange,
    meetupAttendees: handleMeetupAttendeesChange,
    wantedEntries: handleWantedEntriesChange,
    wantedLikes: handleWantedLikesChange,
  });
  contentChangeHandlersRef.current = {
    posts: handlePostsChange,
    comments: handlePostCommentsChange,
    postMedia: handlePostMediaChange,
    postLikes: handlePostLikesChange,
    profile: handleProfileRowChange,
    trips: handleTripsChange,
    tripLikes: handleTripLikesChange,
    meetups: handleMeetupsChange,
    meetupLikes: handleMeetupLikesChange,
    meetupAttendees: handleMeetupAttendeesChange,
    wantedEntries: handleWantedEntriesChange,
    wantedLikes: handleWantedLikesChange,
  };

  useEffect(() => {
    if (!authUserId || !activeTeamId) {
      // No club to scope the channel to yet -- same "no channel" state as signed-out, avoids
      // opening a channel with an undefined filter (Vorgabe 21).
      setContentChangesRealtimeStatus('idle');
      return;
    }

    let isCurrent = true;
    setContentChangesRealtimeStatus((current) => (current === 'error' || current === 'closed' ? 'reconnecting' : 'connecting'));

    const guard = <T,>(fn: (payload: T) => void) => (payload: T) => {
      if (!isCurrent) return;
      fn(payload);
    };

    // posts/trips/meetups/wanted_entries are filtered server-side by team_id on INSERT/UPDATE -- a
    // club switch tears this whole channel down and reopens it (activeTeamId is a dependency
    // below), so a new/changed row for a different club can never reach this client's state
    // (Vorgabe 21, bevorzugt serverseitige Filterung). DELETE is deliberately left unfiltered and
    // bound separately: Supabase Realtime's postgres_changes filter can only evaluate against a
    // row's replica identity, which for these tables (see 20260816100000_complete_realtime_
    // publication.sql) is the default (primary key only) -- a DELETE's old record never carries
    // team_id, so a team_id filter on DELETE risks the event never being delivered at all, not
    // just filtered out. Removing an id from state is always safe regardless of team (a no-op if
    // that id was never loaded), so no filter is needed for correctness there. The remaining
    // bindings (comments/likes/attendees/profiles) have no team_id of their own (Vorgabe 11) and
    // stay unfiltered -- their handlers only ever patch a parent row already present in the
    // (already team-scoped) state.
    const teamFilter = `team_id=eq.${activeTeamId}`;

    const channel = supabase
      .channel(`content-changes:${authUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: teamFilter }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.posts(p)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts', filter: teamFilter }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.posts(p)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.posts(p)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.comments(p)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_media' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.postMedia(p)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.postLikes(p)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.profile(p)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trips', filter: teamFilter }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.trips(p)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: teamFilter }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.trips(p)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'trips' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.trips(p)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_likes' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.tripLikes(p)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetups', filter: teamFilter }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.meetups(p)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meetups', filter: teamFilter }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.meetups(p)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meetups' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.meetups(p)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetup_likes' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.meetupLikes(p)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetup_attendees' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.meetupAttendees(p)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wanted_entries', filter: teamFilter }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.wantedEntries(p)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wanted_entries', filter: teamFilter }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.wantedEntries(p)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'wanted_entries' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.wantedEntries(p)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wanted_likes' }, guard((p: RealtimeChangePayload) => contentChangeHandlersRef.current.wantedLikes(p)))
      .subscribe((status) => {
        if (!isCurrent) return;

        if (status === 'SUBSCRIBED') {
          setContentChangesRealtimeStatus('subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (__DEV__) {
            console.error('[feed-posts:realtime] content-changes channel error/timeout', status);
          }
          setContentChangesRealtimeStatus('error');
        } else if (status === 'CLOSED') {
          setContentChangesRealtimeStatus((current) => (current === 'error' ? current : 'closed'));
        }
      });

    return () => {
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [authUserId, activeTeamId, contentChangesReconnectToken]);

  // --- Foreground refresh: one AppState listener (react-native-web maps this to
  // document.visibilitychange), no polling. Also nudges a realtime reconnect if either channel
  // isn't healthy, mirroring ModerationContext's established behavior. ---
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = /inactive|background/.test(appStateRef.current) && nextState === 'active';
      appStateRef.current = nextState;

      if (!cameToForeground || !authUserId) {
        return;
      }

      if (contentVisibilityRealtimeStatusRef.current !== 'subscribed') {
        setContentVisibilityReconnectToken((token) => token + 1);
      }

      if (contentChangesRealtimeStatusRef.current !== 'subscribed') {
        setContentChangesReconnectToken((token) => token + 1);
      }

      refreshRemotePosts();
      refreshRemoteTrips();
      refreshRemoteMeetups();
      refreshRemoteWantedEntries();
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  const getOwnAuthorDisplay = (): AuthorDisplay => {
    if (authUserId && remoteAuthorProfiles[authUserId]) {
      return remoteAuthorProfiles[authUserId];
    }

    return { displayName: currentUser.displayName, initials: currentUser.initials };
  };

  const getRemoteAuthorDisplay = (userId: string): AuthorDisplay => remoteAuthorProfiles[userId] ?? UNKNOWN_AUTHOR_DISPLAY;

  const createRemotePost = async (input: {
    content: string;
    gameId?: string;
    gameLabel?: string;
  }): Promise<{ error: string | null; postId?: string }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    if (!activeTeamId) {
      return { error: 'Bitte wähle zuerst einen Verein aus.' };
    }

    const trimmedContent = input.content.trim();

    if (!trimmedContent) {
      return { error: 'Bitte gib einen Text ein.' };
    }

    if (trimmedContent.length > POST_CONTENT_MAX_LENGTH) {
      return { error: `Dein Beitrag ist zu lang (max. ${POST_CONTENT_MAX_LENGTH} Zeichen).` };
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: authUserId,
        content: trimmedContent,
        category: 'Beitrag',
        game_id: input.gameId ?? null,
        game_label: input.gameLabel ?? null,
        team_id: activeTeamId,
      })
      .select(POSTS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapPostError(error) };
    }

    const newPost = mapSupabasePostToFeedPost(data as SupabasePostRow, [], 0, false, getOwnAuthorDisplay());
    setRemotePosts((current) => [newPost, ...current]);
    return { error: null, postId: newPost.id };
  };

  // Own-mutation path for post images: called right after each successful uploadPostImage() (see
  // lib/post-media.ts) so the uploader sees their own image immediately, without waiting for the
  // post_media realtime echo below -- same "don't wait for realtime on your own action" rule
  // already applied to posts/likes/comments/follows. Idempotent by id, so a later realtime INSERT
  // for the same row (own or, once shared, anyone else's) is a harmless no-op.
  const appendRemotePostMedia = (postId: string, media: PostMediaItem) => {
    setRemotePosts((current) =>
      current.map((post) => {
        if (post.id !== postId) return post;
        const existing = post.media ?? [];
        if (existing.some((item) => item.id === media.id)) return post;
        return { ...post, media: [...existing, media] };
      }),
    );
  };

  const addRemoteComment = async (postId: string, text: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const trimmedText = text.trim();

    if (!trimmedText) {
      return { error: 'Bitte gib einen Kommentar ein.' };
    }

    if (trimmedText.length > COMMENT_CONTENT_MAX_LENGTH) {
      return { error: `Dein Kommentar ist zu lang (max. ${COMMENT_CONTENT_MAX_LENGTH} Zeichen).` };
    }

    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, author_id: authUserId, content: trimmedText })
      .select(COMMENTS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapPostError(error) };
    }

    const newComment = mapSupabaseCommentToFeedComment(data as SupabaseCommentRow, getOwnAuthorDisplay());
    setRemotePosts((current) =>
      current.map((post) => (post.id !== postId ? post : { ...post, comments: [...post.comments, newComment] })),
    );
    return { error: null };
  };

  const toggleRemoteLike = async (postId: string): Promise<void> => {
    if (!authUserId || inFlightLikePostIds.current.has(postId)) {
      return;
    }

    const post = remotePosts.find((entry) => entry.id === postId);

    if (!post) {
      return;
    }

    inFlightLikePostIds.current.add(postId);
    const wasLiked = post.likedByCurrentUser;

    try {
      const { error } = wasLiked
        ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', authUserId)
        : await supabase.from('post_likes').insert({ post_id: postId, user_id: authUserId });

      if (error) {
        // Leave UI state unchanged on error.
        return;
      }

      setRemotePosts((current) =>
        current.map((entry) => {
          if (entry.id !== postId) return entry;
          const nextLiked = !wasLiked;
          return { ...entry, likedByCurrentUser: nextLiked, likes: Math.max(0, entry.likes + (nextLiked ? 1 : -1)) };
        }),
      );
    } finally {
      inFlightLikePostIds.current.delete(postId);
    }
  };

  const createRemoteTrip = async (input: NewRemoteTripInput): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    if (!activeTeamId) {
      return { error: 'Bitte wähle zuerst einen Verein aus.' };
    }

    const trimmedDescription = input.description.trim();
    const trimmedDeparture = input.departure.trim();
    const trimmedDestination = input.destination.trim();
    const trimmedDepartureTime = input.departureTime.trim();

    if (!trimmedDescription || !trimmedDeparture || !trimmedDestination || !trimmedDepartureTime) {
      return { error: 'Bitte fülle alle Pflichtfelder aus.' };
    }

    if (trimmedDescription.length > POST_CONTENT_MAX_LENGTH) {
      return { error: `Deine Beschreibung ist zu lang (max. ${POST_CONTENT_MAX_LENGTH} Zeichen).` };
    }

    if (!Number.isFinite(input.freeSeats) || input.freeSeats < 0) {
      return { error: 'Bitte gib eine gültige Anzahl freier Plätze ein.' };
    }

    const { data, error } = await supabase
      .from('trips')
      .insert({
        owner_id: authUserId,
        departure: trimmedDeparture,
        destination: trimmedDestination,
        departure_time: trimmedDepartureTime,
        seats_available: input.freeSeats,
        occasion: input.occasion?.trim() || null,
        description: trimmedDescription,
        game_id: input.gameId ?? null,
        game_label: input.gameLabel ?? null,
        team_id: activeTeamId,
      })
      .select(TRIPS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapTripError(error) };
    }

    const newTrip = mapSupabaseTripToFeedPost(data as SupabaseTripRow, 0, false, undefined, getOwnAuthorDisplay());
    setRemoteTrips((current) => [newTrip, ...current]);
    return { error: null };
  };

  const toggleRemoteTripLike = async (tripId: string): Promise<void> => {
    if (!authUserId || inFlightTripLikeIds.current.has(tripId)) {
      return;
    }

    const trip = remoteTrips.find((entry) => entry.id === tripId);

    if (!trip) {
      return;
    }

    inFlightTripLikeIds.current.add(tripId);
    const wasLiked = trip.likedByCurrentUser;

    try {
      const { error } = wasLiked
        ? await supabase.from('trip_likes').delete().eq('trip_id', tripId).eq('user_id', authUserId)
        : await supabase.from('trip_likes').insert({ trip_id: tripId, user_id: authUserId });

      if (error) {
        // Leave UI state unchanged on error.
        return;
      }

      setRemoteTrips((current) =>
        current.map((entry) => {
          if (entry.id !== tripId) return entry;
          const nextLiked = !wasLiked;
          return { ...entry, likedByCurrentUser: nextLiked, likes: Math.max(0, entry.likes + (nextLiked ? 1 : -1)) };
        }),
      );
    } finally {
      inFlightTripLikeIds.current.delete(tripId);
    }
  };

  const createRemoteTripRequest = async (
    tripId: string,
    input?: NewRemoteTripRequestInput,
  ): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const trip = remoteTrips.find((entry) => entry.id === tripId);

    if (!trip) {
      return { error: 'Diese Fahrt existiert nicht mehr.' };
    }

    if (trip.userId === authUserId) {
      return { error: 'Du kannst keine Anfrage an deine eigene Fahrt stellen.' };
    }

    if ((trip.tripDetails?.freeSeats ?? 0) <= 0) {
      return { error: 'Für diese Fahrt sind aktuell keine Plätze frei.' };
    }

    const trimmedMessage = input?.message?.trim();

    const { data, error } = await supabase
      .from('trip_requests')
      .insert({ trip_id: tripId, requester_id: authUserId, message: trimmedMessage || null })
      .select(TRIP_REQUESTS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapTripError(error) };
    }

    const newRequest = data as SupabaseTripRequestRow;
    setRemoteTrips((current) =>
      current.map((entry) =>
        entry.id === tripId
          ? { ...entry, rideRequestSent: true, rideRequestStatus: newRequest.status, rideRequestId: newRequest.id }
          : entry,
      ),
    );
    setOwnTripRequestByTripId((current) => ({ ...current, [tripId]: newRequest }));
    return { error: null };
  };

  type TripRequestRpcResult = { request: SupabaseTripRequestRow; seats_available: number };

  const applyTripRequestSeatUpdate = (tripId: string, seatsAvailable: number) => {
    setRemoteTrips((current) =>
      current.map((entry) =>
        entry.id === tripId && entry.tripDetails
          ? { ...entry, tripDetails: { ...entry.tripDetails, freeSeats: seatsAvailable } }
          : entry,
      ),
    );
  };

  const cancelRemoteTripRequest = async (requestId: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const { data, error } = await supabase.rpc('cancel_trip_request', { p_request_id: requestId });

    if (error) {
      return { error: mapTripError(error) };
    }

    const result = data as TripRequestRpcResult;
    const updatedRequest = result.request;

    setRemoteTrips((current) =>
      current.map((entry) =>
        entry.id === updatedRequest.trip_id
          ? {
              ...entry,
              rideRequestSent: false,
              rideRequestStatus: updatedRequest.status,
              tripDetails: entry.tripDetails ? { ...entry.tripDetails, freeSeats: result.seats_available } : entry.tripDetails,
            }
          : entry,
      ),
    );
    setOwnTripRequestByTripId((current) => ({ ...current, [updatedRequest.trip_id]: updatedRequest }));
    return { error: null };
  };

  const respondToRemoteTripRequest = async (
    requestId: string,
    decision: 'accepted' | 'rejected',
  ): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const rpcName = decision === 'accepted' ? 'accept_trip_request' : 'reject_trip_request';
    const { data, error } = await supabase.rpc(rpcName, { p_request_id: requestId });

    if (error) {
      return { error: mapTripError(error) };
    }

    const result = data as TripRequestRpcResult;
    const updatedRequest = result.request;

    setRequestsForOwnedTrips((current) => current.map((row) => (row.id === updatedRequest.id ? updatedRequest : row)));
    applyTripRequestSeatUpdate(updatedRequest.trip_id, result.seats_available);
    return { error: null };
  };

  const toggleRemoteTripRequest = async (tripId: string): Promise<void> => {
    const trip = remoteTrips.find((entry) => entry.id === tripId);

    if (!trip) {
      return;
    }

    if (trip.rideRequestSent) {
      const ownRequest = ownTripRequestByTripId[tripId];
      if (ownRequest) {
        await cancelRemoteTripRequest(ownRequest.id);
      }
    } else {
      await createRemoteTripRequest(tripId);
    }
  };

  const getRequestsForTrip = (tripId: string): SupabaseTripRequestRow[] =>
    requestsForOwnedTrips.filter((row) => row.trip_id === tripId);

  // Symmetric counterpart to refreshRequestsForTrip below, for the OTHER side of the same gap: the
  // requester's own rideRequestSent/rideRequestStatus on `remoteTrips` (read by post/[id].tsx's
  // "Mitfahren anfragen" button) is only ever set at the moment createRemoteTripRequest/
  // cancelRemoteTripRequest run on THIS client -- when the trip owner accepts/rejects from their
  // own client, that mutation has no way to reach back and update the requester's already-mapped
  // FeedPost. Same fix shape as createRemoteTripRequest's own update below, just fetched instead of
  // taken from a just-made request's response. Called from post/[id].tsx on focus.
  const refreshOwnTripRequestForTrip = async (tripId: string): Promise<void> => {
    if (!authUserId) {
      return;
    }

    const { data, error } = await supabase
      .from('trip_requests')
      .select(TRIP_REQUESTS_SELECT_COLUMNS)
      .eq('trip_id', tripId)
      .eq('requester_id', authUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return;
    }

    const freshRequest = data as SupabaseTripRequestRow;
    setRemoteTrips((current) =>
      current.map((entry) =>
        entry.id === tripId
          ? { ...entry, rideRequestSent: freshRequest.status !== 'cancelled', rideRequestStatus: freshRequest.status, rideRequestId: freshRequest.id }
          : entry,
      ),
    );
    setOwnTripRequestByTripId((current) => ({ ...current, [tripId]: freshRequest }));
  };

  // trip_requests is deliberately NOT in the supabase_realtime publication (see
  // 20260816100000_complete_realtime_publication.sql's own comment: the owner is already informed
  // live via the notifications table, so raw table realtime was judged unnecessary) -- but nothing
  // ever re-fetched requestsForOwnedTrips after its one-time load, so "Anfragen verwalten" stayed
  // stale until the next full sign-in/foreground reload even though the owner's notification had
  // already arrived live. This targets exactly that gap: trip/[id]/requests.tsx calls this on every
  // focus, matching the same "no realtime channel, refetch on demand" convention already used
  // elsewhere in this app (e.g. pendingInvitationsByGroup in GroupsContext). A failed refetch is
  // silently ignored -- the screen simply keeps showing whatever it already had, same as every
  // other on-demand refresh in this file never wiping already-loaded data on error.
  const refreshRequestsForTrip = async (tripId: string): Promise<void> => {
    const { data, error } = await supabase.from('trip_requests').select(TRIP_REQUESTS_SELECT_COLUMNS).eq('trip_id', tripId);

    if (error || !data) {
      return;
    }

    const freshRequests = data as SupabaseTripRequestRow[];
    setRequestsForOwnedTrips((current) => [...current.filter((row) => row.trip_id !== tripId), ...freshRequests]);
  };

  const pendingRequestCountForTrip = (tripId: string): number =>
    getRequestsForTrip(tripId).filter((row) => row.status === 'pending').length;

  const createRemoteMeetup = async (input: NewRemoteMeetupInput): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    if (!activeTeamId) {
      return { error: 'Bitte wähle zuerst einen Verein aus.' };
    }

    const trimmedDescription = input.description.trim();
    const trimmedTitle = input.title.trim();
    const trimmedLocation = input.location.trim();

    if (!trimmedDescription || !trimmedTitle || !trimmedLocation || !input.gameId) {
      return { error: 'Bitte fülle alle Pflichtfelder aus.' };
    }

    if (trimmedTitle.length > MEETUP_TITLE_MAX_LENGTH) {
      return { error: `Der Titel ist zu lang (max. ${MEETUP_TITLE_MAX_LENGTH} Zeichen).` };
    }

    if (trimmedDescription.length > POST_CONTENT_MAX_LENGTH) {
      return { error: `Deine Beschreibung ist zu lang (max. ${POST_CONTENT_MAX_LENGTH} Zeichen).` };
    }

    if (input.maxAttendees != null && (!Number.isInteger(input.maxAttendees) || input.maxAttendees <= 0)) {
      return { error: 'Bitte gib eine gültige positive Zahl für die maximale Teilnehmerzahl ein.' };
    }

    const startsAtIso = parseGermanDateAndTimeToIso(input.date, input.eventTime);

    if (!startsAtIso) {
      return { error: 'Bitte gib Datum (TT.MM.JJJJ) und Uhrzeit (HH:MM) im richtigen Format ein.' };
    }

    const { data, error } = await supabase
      .from('meetups')
      .insert({
        organizer_id: authUserId,
        title: trimmedTitle,
        description: trimmedDescription,
        location: trimmedLocation,
        starts_at: startsAtIso,
        max_attendees: input.maxAttendees ?? null,
        game_id: input.gameId,
        game_label: input.gameLabel,
        team_id: activeTeamId,
      })
      .select(MEETUPS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapMeetupError(error) };
    }

    const newMeetup = mapSupabaseMeetupToFeedPost(data as SupabaseMeetupRow, [], 0, false, getOwnAuthorDisplay());
    setRemoteMeetups((current) => [newMeetup, ...current]);
    return { error: null };
  };

  const toggleRemoteMeetupLike = async (meetupId: string): Promise<void> => {
    if (!authUserId || inFlightMeetupLikeIds.current.has(meetupId)) {
      return;
    }

    const meetup = remoteMeetups.find((entry) => entry.id === meetupId);

    if (!meetup) {
      return;
    }

    inFlightMeetupLikeIds.current.add(meetupId);
    const wasLiked = meetup.likedByCurrentUser;

    try {
      const { error } = wasLiked
        ? await supabase.from('meetup_likes').delete().eq('meetup_id', meetupId).eq('user_id', authUserId)
        : await supabase.from('meetup_likes').insert({ meetup_id: meetupId, user_id: authUserId });

      if (error) {
        // Leave UI state unchanged on error.
        return;
      }

      setRemoteMeetups((current) =>
        current.map((entry) => {
          if (entry.id !== meetupId) return entry;
          const nextLiked = !wasLiked;
          return { ...entry, likedByCurrentUser: nextLiked, likes: Math.max(0, entry.likes + (nextLiked ? 1 : -1)) };
        }),
      );
    } finally {
      inFlightMeetupLikeIds.current.delete(meetupId);
    }
  };

  type MeetupAttendanceRpcResult = { attendee_ids: string[] };

  const applyMeetupAttendeeIds = (meetupId: string, attendeeIds: string[]) => {
    setRemoteMeetups((current) =>
      current.map((entry) =>
        entry.id === meetupId && entry.meetupDetails ? { ...entry, meetupDetails: { ...entry.meetupDetails, attendeeIds } } : entry,
      ),
    );
  };

  const joinRemoteMeetup = async (meetupId: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    if (inFlightMeetupAttendanceIds.current.has(meetupId)) {
      return { error: null };
    }

    inFlightMeetupAttendanceIds.current.add(meetupId);

    try {
      const { data, error } = await supabase.rpc('join_meetup', { p_meetup_id: meetupId });

      if (error) {
        return { error: mapMeetupError(error) };
      }

      const result = data as MeetupAttendanceRpcResult;
      applyMeetupAttendeeIds(meetupId, result.attendee_ids ?? []);
      // Re-sync with the server's authoritative state so Feed/Stadion/Activity/Profile can never
      // drift from what was actually persisted, even if this meetup wasn't already present in
      // the locally-held remoteMeetups state for some reason.
      refreshRemoteMeetups();
      return { error: null };
    } finally {
      inFlightMeetupAttendanceIds.current.delete(meetupId);
    }
  };

  const leaveRemoteMeetup = async (meetupId: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    if (inFlightMeetupAttendanceIds.current.has(meetupId)) {
      return { error: null };
    }

    inFlightMeetupAttendanceIds.current.add(meetupId);

    try {
      const { data, error } = await supabase.rpc('leave_meetup', { p_meetup_id: meetupId });

      if (error) {
        return { error: mapMeetupError(error) };
      }

      const result = data as MeetupAttendanceRpcResult;
      applyMeetupAttendeeIds(meetupId, result.attendee_ids ?? []);
      // Same re-sync rationale as joinRemoteMeetup above.
      refreshRemoteMeetups();
      return { error: null };
    } finally {
      inFlightMeetupAttendanceIds.current.delete(meetupId);
    }
  };

  const getRemoteMeetupAttendees = (meetupId: string): string[] => getPostById(meetupId)?.meetupDetails?.attendeeIds ?? [];

  const isCurrentUserAttendingMeetup = (meetupId: string): boolean =>
    authUserId != null && getRemoteMeetupAttendees(meetupId).includes(authUserId);

  const toggleRemoteMeetupAttendance = async (meetupId: string): Promise<void> => {
    if (!authUserId) {
      return;
    }

    if (isCurrentUserAttendingMeetup(meetupId)) {
      await leaveRemoteMeetup(meetupId);
    } else {
      await joinRemoteMeetup(meetupId);
    }
  };

  const createRemoteWantedEntry = async (input: NewRemoteWantedEntryInput): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    if (!activeTeamId) {
      return { error: 'Bitte wähle zuerst einen Verein aus.' };
    }

    const trimmedDescription = input.description.trim();
    const trimmedRequestedService = input.requestedService.trim();

    if (!trimmedDescription || !trimmedRequestedService) {
      return { error: 'Bitte fülle alle Pflichtfelder aus.' };
    }

    if (trimmedDescription.length > POST_CONTENT_MAX_LENGTH) {
      return { error: `Deine Beschreibung ist zu lang (max. ${POST_CONTENT_MAX_LENGTH} Zeichen).` };
    }

    if (trimmedRequestedService.length > WANTED_SERVICE_MAX_LENGTH) {
      return { error: `Die gesuchte Leistung ist zu lang (max. ${WANTED_SERVICE_MAX_LENGTH} Zeichen).` };
    }

    const { data, error } = await supabase
      .from('wanted_entries')
      .insert({
        owner_id: authUserId,
        description: trimmedDescription,
        requested_service: trimmedRequestedService,
        game_id: input.gameId ?? null,
        game_label: input.gameLabel ?? null,
        team_id: activeTeamId,
      })
      .select(WANTED_ENTRIES_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapWantedEntryError(error) };
    }

    const newWantedEntry = mapSupabaseWantedEntryToFeedPost(data as SupabaseWantedEntryRow, 0, false, getOwnAuthorDisplay());
    setRemoteWantedEntries((current) => [newWantedEntry, ...current]);
    return { error: null };
  };

  const toggleRemoteWantedLike = async (wantedEntryId: string): Promise<void> => {
    if (!authUserId || inFlightWantedLikeIds.current.has(wantedEntryId)) {
      return;
    }

    const wantedEntry = remoteWantedEntries.find((entry) => entry.id === wantedEntryId);

    if (!wantedEntry) {
      return;
    }

    inFlightWantedLikeIds.current.add(wantedEntryId);
    const wasLiked = wantedEntry.likedByCurrentUser;

    try {
      const { error } = wasLiked
        ? await supabase.from('wanted_likes').delete().eq('wanted_entry_id', wantedEntryId).eq('user_id', authUserId)
        : await supabase.from('wanted_likes').insert({ wanted_entry_id: wantedEntryId, user_id: authUserId });

      if (error) {
        // Leave UI state unchanged on error.
        return;
      }

      setRemoteWantedEntries((current) =>
        current.map((entry) => {
          if (entry.id !== wantedEntryId) return entry;
          const nextLiked = !wasLiked;
          return { ...entry, likedByCurrentUser: nextLiked, likes: Math.max(0, entry.likes + (nextLiked ? 1 : -1)) };
        }),
      );
    } finally {
      inFlightWantedLikeIds.current.delete(wantedEntryId);
    }
  };

  const addPost = (post: NewFeedPost) => {
    const newPost: FeedPost = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: CURRENT_USER_ID,
      user: 'Marco B.',
      initials: 'MB',
      time: 'gerade eben',
      likes: 0,
      likedByCurrentUser: false,
      comments: [],
      rideRequestSent: false,
      source: 'local',
      ...post,
    };

    setLocalPosts((current) => [newPost, ...current]);
  };

  // Remote content first (posts, trips and meetups merged and sorted by actual creation time),
  // then local seed/created posts in their existing order — local seed timestamps are fuzzy
  // German relative strings ("vor 12 Min.") that can't be reliably parsed for cross-source
  // sorting. Meetups are additionally queried ordered by starts_at (soonest first) so that
  // dimension is preserved on remoteMeetups itself, even though this shared merge re-sorts by
  // creation time for a single, predictable ordering across all categories.
  //
  // Local seed posts are gated to their own club (data/feed-posts.ts's own header comment already
  // documents this exact invariant: "seed content must never bypass the team_id filter (only
  // visible when Arminia is the active club)") -- restored here because the merge below had no
  // such gate, so every real account browsing any club was seeing all 10 fake seed posts
  // (fabricated authors like "Mina K.") mixed indistinguishably into their real "Für dich" feed.
  // Every seed post already carries teamId (data/feed-posts.ts:385), so a plain equality filter is
  // sufficient -- no new field, no new architecture.
  const posts = useMemo(() => {
    const remoteCombined = [...remotePosts, ...remoteTrips, ...remoteMeetups, ...remoteWantedEntries].sort(
      (a, b) => getCreatedAtMs(b) - getCreatedAtMs(a),
    );

    const clubScopedLocalPosts = localPosts.filter((post) => post.teamId === activeTeamId);

    const seenIds = new Set<string>();
    const merged: FeedPost[] = [];

    for (const post of [...remoteCombined, ...clubScopedLocalPosts]) {
      if (seenIds.has(post.id)) continue;
      seenIds.add(post.id);
      merged.push(post);
    }

    return merged;
  }, [remotePosts, remoteTrips, remoteMeetups, remoteWantedEntries, localPosts, activeTeamId]);

  // A profile's own content, independent of activeTeamId (Vorgabe O) -- first resolves this
  // user's own id lists across all four tables (cheap, id-only queries, not team-scoped), then
  // resolves the full FeedPost objects via the same shared resolver saved-context.tsx uses for
  // "Gespeichert", so this fairly involved mapping exists in exactly one place.
  const loadUserContent = (userId: string) => {
    if (!authUserId) return;

    setUserContentByUserId((current) => ({
      ...current,
      [userId]: { ...(current[userId] ?? EMPTY_USER_CONTENT_STATE), isLoading: true, error: null },
    }));

    (async () => {
      const [postIdsResult, tripIdsResult, meetupIdsResult, wantedIdsResult] = await Promise.all([
        supabase.from('posts').select('id').eq('author_id', userId).order('created_at', { ascending: false }).limit(USER_CONTENT_LIMIT),
        supabase.from('trips').select('id').eq('owner_id', userId).order('created_at', { ascending: false }).limit(USER_CONTENT_LIMIT),
        supabase.from('meetups').select('id').eq('organizer_id', userId).order('created_at', { ascending: false }).limit(USER_CONTENT_LIMIT),
        supabase.from('wanted_entries').select('id').eq('owner_id', userId).order('created_at', { ascending: false }).limit(USER_CONTENT_LIMIT),
      ]);

      const firstError = postIdsResult.error ?? tripIdsResult.error ?? meetupIdsResult.error ?? wantedIdsResult.error;

      if (firstError) {
        setUserContentByUserId((current) => ({
          ...current,
          [userId]: { posts: [], isLoading: false, error: mapPostError(firstError), hasLoadedOnce: true },
        }));
        return;
      }

      const postIds = (postIdsResult.data ?? []).map((row) => row.id as string);
      const tripIds = (tripIdsResult.data ?? []).map((row) => row.id as string);
      const meetupIds = (meetupIdsResult.data ?? []).map((row) => row.id as string);
      const wantedIds = (wantedIdsResult.data ?? []).map((row) => row.id as string);

      const { resolved, error: resolveError } = await resolveContentByIds(authUserId, { postIds, tripIds, meetupIds, wantedIds });

      if (resolveError) {
        setUserContentByUserId((current) => ({
          ...current,
          [userId]: { posts: [], isLoading: false, error: resolveError, hasLoadedOnce: true },
        }));
        return;
      }

      const sortedPosts = [...resolved.values()].sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));

      setUserContentByUserId((current) => ({
        ...current,
        [userId]: { posts: sortedPosts, isLoading: false, error: null, hasLoadedOnce: true },
      }));
    })();
  };

  const getUserContentState = (userId: string): UserContentState => userContentByUserId[userId] ?? EMPTY_USER_CONTENT_STATE;

  // "Stadion → Beiträge" full club overview: a direct `posts WHERE team_id = teamId ORDER BY
  // created_at DESC` query, independent of `remotePosts`/the "Für dich" ranking (see
  // STADION_BEITRAEGE_LIMIT above). Reuses resolveContentByIds (lib/resolve-content-by-ids.ts) --
  // the same resolver loadUserContent above and saved-context.tsx already use -- for the
  // comments/likes/media bundling, instead of duplicating that mapping a third time (Vorgabe: keine
  // zweite PostCard / kein paralleles Datenmodell). Only game_id is intentionally NOT filtered here
  // (Vorgabe: Stadion → Beiträge zeigt alle Posts unabhängig von game_id) -- that stays the game
  // detail view's job.
  const loadStadionBeitraege = (teamId: string) => {
    if (!authUserId) return;

    setIsStadionBeitraegeLoading(true);
    setStadionBeitraegeError(null);

    (async () => {
      // Some legacy posts never got team_id set, but their game_id already ties them
      // unambiguously to one specific, real fixture (public.games) -- if that fixture is one this
      // exact club played (home or away), the post deterministically belongs to this club's
      // overview too, without guessing or touching any data. Never widens to "all team_id IS NULL
      // posts" -- only ones whose game_id resolves to a game this specific team was part of.
      const { data: teamGameRows, error: teamGamesError } = await supabase
        .from('games')
        .select('id')
        .or(`external_home_team_id.eq.${teamId},external_away_team_id.eq.${teamId}`);

      if (teamGamesError) {
        setStadionBeitraegeError(mapPostError(teamGamesError));
        setIsStadionBeitraegeLoading(false);
        return;
      }

      const teamGameIds = (teamGameRows ?? []).map((row) => row.id as string);

      let idsQuery = supabase.from('posts').select('id').order('created_at', { ascending: false }).limit(STADION_BEITRAEGE_LIMIT);
      idsQuery =
        teamGameIds.length > 0
          ? idsQuery.or(`team_id.eq.${teamId},and(team_id.is.null,game_id.in.(${teamGameIds.join(',')}))`)
          : idsQuery.eq('team_id', teamId);

      const { data: idRows, error: idsError } = await idsQuery;

      if (idsError) {
        // A transient reload error must not erase already-displayed real posts -- same reasoning
        // as remotePosts' own error handling above. Only clears below when there is genuinely
        // nothing (an empty, error-free result).
        setStadionBeitraegeError(mapPostError(idsError));
        setIsStadionBeitraegeLoading(false);
        return;
      }

      const postIds = (idRows ?? []).map((row) => row.id as string);

      if (postIds.length === 0) {
        setStadionBeitraegePosts([]);
        setStadionBeitraegeTeamId(teamId);
        setIsStadionBeitraegeLoading(false);
        return;
      }

      const { resolved, error: resolveError } = await resolveContentByIds(authUserId, { postIds, tripIds: [], meetupIds: [], wantedIds: [] });

      if (resolveError) {
        setStadionBeitraegeError(resolveError);
        setIsStadionBeitraegeLoading(false);
        return;
      }

      const sortedPosts = [...resolved.values()].sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));

      setStadionBeitraegePosts(sortedPosts);
      setStadionBeitraegeTeamId(teamId);
      setIsStadionBeitraegeLoading(false);
    })();
  };

  // "Spiel → Beiträge": a direct `posts WHERE game_id = gameId ORDER BY created_at DESC` query --
  // no team_id filter (Vorgabe: fetchPostsByGame lädt ALLE Posts mit game_id = X, unabhängig von
  // team_id), no ranking, no follow/engagement requirement. Same resolveContentByIds reuse as
  // loadStadionBeitraege above.
  const loadPostsByGame = (gameId: string) => {
    if (!authUserId) return;

    setIsGameBeitraegeLoading(true);
    setGameBeitraegeError(null);

    (async () => {
      const { data: idRows, error: idsError } = await supabase
        .from('posts')
        .select('id')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(STADION_BEITRAEGE_LIMIT);

      if (idsError) {
        setGameBeitraegeError(mapPostError(idsError));
        setIsGameBeitraegeLoading(false);
        return;
      }

      const postIds = (idRows ?? []).map((row) => row.id as string);

      if (postIds.length === 0) {
        setGameBeitraegePosts([]);
        setGameBeitraegeGameId(gameId);
        setIsGameBeitraegeLoading(false);
        return;
      }

      const { resolved, error: resolveError } = await resolveContentByIds(authUserId, { postIds, tripIds: [], meetupIds: [], wantedIds: [] });

      if (resolveError) {
        setGameBeitraegeError(resolveError);
        setIsGameBeitraegeLoading(false);
        return;
      }

      const sortedPosts = [...resolved.values()].sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));

      setGameBeitraegePosts(sortedPosts);
      setGameBeitraegeGameId(gameId);
      setIsGameBeitraegeLoading(false);
    })();
  };

  // "Spiel → Fahrten": same reasoning/shape as loadPostsByGame above, against public.trips.
  const loadTripsByGame = (gameId: string) => {
    if (!authUserId) return;

    setIsGameTripsLoading(true);
    setGameTripsError(null);

    (async () => {
      const { data: idRows, error: idsError } = await supabase
        .from('trips')
        .select('id')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(STADION_BEITRAEGE_LIMIT);

      if (idsError) {
        setGameTripsError(mapPostError(idsError));
        setIsGameTripsLoading(false);
        return;
      }

      const tripIds = (idRows ?? []).map((row) => row.id as string);

      if (tripIds.length === 0) {
        setGameTripsPosts([]);
        setGameTripsGameId(gameId);
        setIsGameTripsLoading(false);
        return;
      }

      const { resolved, error: resolveError } = await resolveContentByIds(authUserId, { postIds: [], tripIds, meetupIds: [], wantedIds: [] });

      if (resolveError) {
        setGameTripsError(resolveError);
        setIsGameTripsLoading(false);
        return;
      }

      const sortedTrips = [...resolved.values()].sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));

      setGameTripsPosts(sortedTrips);
      setGameTripsGameId(gameId);
      setIsGameTripsLoading(false);
    })();
  };

  // "Spiel → Treffen": same reasoning/shape as loadPostsByGame above, against public.meetups.
  const loadMeetupsByGame = (gameId: string) => {
    if (!authUserId) return;

    setIsGameMeetupsLoading(true);
    setGameMeetupsError(null);

    (async () => {
      const { data: idRows, error: idsError } = await supabase
        .from('meetups')
        .select('id')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(STADION_BEITRAEGE_LIMIT);

      if (idsError) {
        setGameMeetupsError(mapPostError(idsError));
        setIsGameMeetupsLoading(false);
        return;
      }

      const meetupIds = (idRows ?? []).map((row) => row.id as string);

      if (meetupIds.length === 0) {
        setGameMeetupsPosts([]);
        setGameMeetupsGameId(gameId);
        setIsGameMeetupsLoading(false);
        return;
      }

      const { resolved, error: resolveError } = await resolveContentByIds(authUserId, { postIds: [], tripIds: [], meetupIds, wantedIds: [] });

      if (resolveError) {
        setGameMeetupsError(resolveError);
        setIsGameMeetupsLoading(false);
        return;
      }

      const sortedMeetups = [...resolved.values()].sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));

      setGameMeetupsPosts(sortedMeetups);
      setGameMeetupsGameId(gameId);
      setIsGameMeetupsLoading(false);
    })();
  };

  // "Spiel → Gesucht": same reasoning/shape as loadPostsByGame above, against public.wanted_entries.
  const loadWantedByGame = (gameId: string) => {
    if (!authUserId) return;

    setIsGameWantedLoading(true);
    setGameWantedError(null);

    (async () => {
      const { data: idRows, error: idsError } = await supabase
        .from('wanted_entries')
        .select('id')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(STADION_BEITRAEGE_LIMIT);

      if (idsError) {
        setGameWantedError(mapPostError(idsError));
        setIsGameWantedLoading(false);
        return;
      }

      const wantedIds = (idRows ?? []).map((row) => row.id as string);

      if (wantedIds.length === 0) {
        setGameWantedPosts([]);
        setGameWantedGameId(gameId);
        setIsGameWantedLoading(false);
        return;
      }

      const { resolved, error: resolveError } = await resolveContentByIds(authUserId, { postIds: [], tripIds: [], meetupIds: [], wantedIds });

      if (resolveError) {
        setGameWantedError(resolveError);
        setIsGameWantedLoading(false);
        return;
      }

      const sortedWanted = [...resolved.values()].sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));

      setGameWantedPosts(sortedWanted);
      setGameWantedGameId(gameId);
      setIsGameWantedLoading(false);
    })();
  };

  // Post-Detail-Fallback: when content isn't part of the currently loaded local state (not in
  // `posts` -- team-scoped and capped -- and not a saved item), fetch it directly by id instead of
  // reporting "nicht gefunden" just because the personalized feed/team scope never loaded it
  // (Vorgabe: Für-dich-Ranking ist niemals Source of Truth für Post Detail). app/post/[id].tsx
  // renders Beitrag AND Fahrt AND Gesuch detail (getPostDetailPathname only routes Treffpunkt to
  // its own /meetup/[id] screen) -- so this checks all three tables the id could belong to, not
  // just public.posts, otherwise a Fahrt/Gesuch outside the working set falsely showed "nicht
  // gefunden" even though it exists. Three cheap indexed-PK lookups in parallel, then a single
  // resolveContentByIds call scoped to whichever table actually matched.
  const fetchPostById = async (postId: string): Promise<{ post: FeedPost | null; error: string | null }> => {
    if (!authUserId) return { post: null, error: null };

    const [postRowResult, tripRowResult, wantedRowResult] = await Promise.all([
      supabase.from('posts').select('id').eq('id', postId).maybeSingle(),
      supabase.from('trips').select('id').eq('id', postId).maybeSingle(),
      supabase.from('wanted_entries').select('id').eq('id', postId).maybeSingle(),
    ]);

    const firstError = postRowResult.error ?? tripRowResult.error ?? wantedRowResult.error;

    if (firstError) {
      return { post: null, error: mapPostError(firstError) };
    }

    const idsByCategory = {
      postIds: postRowResult.data ? [postId] : [],
      tripIds: tripRowResult.data ? [postId] : [],
      meetupIds: [],
      wantedIds: wantedRowResult.data ? [postId] : [],
    };

    if (idsByCategory.postIds.length === 0 && idsByCategory.tripIds.length === 0 && idsByCategory.wantedIds.length === 0) {
      // Genuinely no such row in any of the three tables (or RLS-hidden) -- a real "not found",
      // not a loading artifact.
      return { post: null, error: null };
    }

    const { resolved, error: resolveError } = await resolveContentByIds(authUserId, idsByCategory);

    if (resolveError) {
      return { post: null, error: resolveError };
    }

    return { post: resolved.get(postId) ?? null, error: null };
  };

  const isContentHidden = (targetType: ReportTargetType, targetId: string): boolean =>
    hiddenContentKeys.has(getReportTargetKey(targetType, targetId));

  const getPostById = (id: string) => posts.find((post) => post.id === id);

  const findCommentById = (commentId: string) => {
    for (const post of posts) {
      const comment = post.comments.find((entry) => entry.id === commentId);

      if (comment) {
        return { post, comment };
      }
    }

    return undefined;
  };

  const toggleLike = (postId: string) => {
    const post = getPostById(postId);

    if (post?.source === 'supabase') {
      if (post.category === 'Fahrt') {
        void toggleRemoteTripLike(postId);
      } else if (post.category === 'Treffpunkt') {
        void toggleRemoteMeetupLike(postId);
      } else if (post.category === 'Gesuch') {
        void toggleRemoteWantedLike(postId);
      } else {
        void toggleRemoteLike(postId);
      }
      return;
    }

    setLocalPosts((currentPosts) =>
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

  const addComment = async (postId: string, text: string): Promise<{ error: string | null }> => {
    const post = getPostById(postId);

    if (post?.source === 'supabase' && post.category === 'Beitrag') {
      return addRemoteComment(postId, text);
    }

    const trimmedText = text.trim();

    if (!trimmedText) {
      return { error: null };
    }

    const newComment: FeedComment = {
      id: `comment-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: CURRENT_USER_ID,
      username: 'Marco B.',
      initials: 'MB',
      text: trimmedText,
      timestamp: 'gerade eben',
      source: 'local',
    };

    // Trip/meetup/wanted-entry comments are not persisted in this step (in scope only for
    // "Beitrag"): append in-memory to whichever array currently holds this post — a no-op on
    // the others, since post IDs are unique across local posts and each remote source.
    setLocalPosts((currentPosts) =>
      currentPosts.map((post) => (post.id !== postId ? post : { ...post, comments: [...post.comments, newComment] })),
    );
    setRemoteTrips((currentTrips) =>
      currentTrips.map((trip) => (trip.id !== postId ? trip : { ...trip, comments: [...trip.comments, newComment] })),
    );
    setRemoteMeetups((currentMeetups) =>
      currentMeetups.map((meetup) => (meetup.id !== postId ? meetup : { ...meetup, comments: [...meetup.comments, newComment] })),
    );
    setRemoteWantedEntries((currentWantedEntries) =>
      currentWantedEntries.map((entry) => (entry.id !== postId ? entry : { ...entry, comments: [...entry.comments, newComment] })),
    );

    return { error: null };
  };

  const toggleRideRequest = (postId: string) => {
    const post = getPostById(postId);

    if (post?.source === 'supabase' && post.category === 'Fahrt') {
      void toggleRemoteTripRequest(postId);
      return;
    }

    setLocalPosts((currentPosts) =>
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

  const toggleMeetupAttendance = (postId: string) => {
    const post = getPostById(postId);

    if (post?.source === 'supabase' && post.category === 'Treffpunkt') {
      void toggleRemoteMeetupAttendance(postId);
      return;
    }

    setLocalPosts((currentPosts) =>
      currentPosts.map((post) => {
        if (post.id !== postId || post.category !== 'Treffpunkt' || !post.meetupDetails) {
          return post;
        }

        if (post.userId === CURRENT_USER_ID) {
          return post;
        }

        const details = post.meetupDetails;
        const isAttending = details.attendeeIds.includes(CURRENT_USER_ID);

        if (isAttending) {
          return {
            ...post,
            meetupDetails: { ...details, attendeeIds: details.attendeeIds.filter((id) => id !== CURRENT_USER_ID) },
          };
        }

        if (isMeetupFull(details)) {
          return post;
        }

        return {
          ...post,
          meetupDetails: { ...details, attendeeIds: [...details.attendeeIds, CURRENT_USER_ID] },
        };
      }),
    );
  };

  const value = useMemo(
    () => ({
      posts,
      addPost,
      getPostById,
      findCommentById,
      toggleLike,
      addComment,
      toggleRideRequest,
      toggleMeetupAttendance,
      remotePosts,
      isRemotePostsLoading,
      remotePostsError,
      refreshRemotePosts,
      createRemotePost,
      appendRemotePostMedia,
      addRemoteComment,
      toggleRemoteLike,
      getRemoteAuthorDisplay,
      remoteTrips,
      isRemoteTripsLoading,
      remoteTripsError,
      refreshRemoteTrips,
      createRemoteTrip,
      toggleRemoteTripLike,
      createRemoteTripRequest,
      cancelRemoteTripRequest,
      respondToRemoteTripRequest,
      requestsForOwnedTrips,
      getRequestsForTrip,
      refreshRequestsForTrip,
      refreshOwnTripRequestForTrip,
      pendingRequestCountForTrip,
      remoteMeetups,
      isRemoteMeetupsLoading,
      remoteMeetupsError,
      refreshRemoteMeetups,
      createRemoteMeetup,
      toggleRemoteMeetupLike,
      joinRemoteMeetup,
      leaveRemoteMeetup,
      getRemoteMeetupAttendees,
      isCurrentUserAttendingMeetup,
      remoteWantedEntries,
      isRemoteWantedEntriesLoading,
      remoteWantedEntriesError,
      refreshRemoteWantedEntries,
      createRemoteWantedEntry,
      toggleRemoteWantedLike,
      contentVisibilityRealtimeStatus,
      isContentHidden,
      contentChangesRealtimeStatus,
      loadUserContent,
      getUserContentState,
      stadionBeitraegePosts,
      isStadionBeitraegeLoading,
      stadionBeitraegeError,
      stadionBeitraegeTeamId,
      loadStadionBeitraege,
      gameBeitraegePosts,
      isGameBeitraegeLoading,
      gameBeitraegeError,
      gameBeitraegeGameId,
      loadPostsByGame,
      gameTripsPosts,
      isGameTripsLoading,
      gameTripsError,
      gameTripsGameId,
      loadTripsByGame,
      gameMeetupsPosts,
      isGameMeetupsLoading,
      gameMeetupsError,
      gameMeetupsGameId,
      loadMeetupsByGame,
      gameWantedPosts,
      isGameWantedLoading,
      gameWantedError,
      gameWantedGameId,
      loadWantedByGame,
      fetchPostById,
    }),
    [
      posts,
      remotePosts,
      isRemotePostsLoading,
      userContentByUserId,
      remotePostsError,
      remoteTrips,
      isRemoteTripsLoading,
      remoteTripsError,
      ownTripRequestByTripId,
      requestsForOwnedTrips,
      remoteMeetups,
      isRemoteMeetupsLoading,
      remoteMeetupsError,
      remoteWantedEntries,
      isRemoteWantedEntriesLoading,
      remoteWantedEntriesError,
      currentUser,
      authUserId,
      contentVisibilityRealtimeStatus,
      hiddenContentKeys,
      contentChangesRealtimeStatus,
      stadionBeitraegePosts,
      isStadionBeitraegeLoading,
      stadionBeitraegeError,
      stadionBeitraegeTeamId,
      gameBeitraegePosts,
      isGameBeitraegeLoading,
      gameBeitraegeError,
      gameBeitraegeGameId,
      gameTripsPosts,
      isGameTripsLoading,
      gameTripsError,
      gameTripsGameId,
      gameMeetupsPosts,
      isGameMeetupsLoading,
      gameMeetupsError,
      gameMeetupsGameId,
      gameWantedPosts,
      isGameWantedLoading,
      gameWantedError,
      gameWantedGameId,
    ],
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
