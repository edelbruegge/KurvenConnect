import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { useProfiles } from '@/context/profile-context';
import { feedPosts, isMeetupFull, type FeedComment, type FeedPost, type NewFeedPost } from '@/data/feed-posts';
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
import { supabase } from '@/lib/supabase';

type AuthorDisplay = { displayName: string; initials: string };

type RealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'reconnecting' | 'error' | 'closed';

// A minimal structural view of the postgres_changes INSERT payload for
// public.content_visibility_events — only the fields this handler actually reads, same approach
// as NotificationsContext's RealtimeNotificationInsertPayload/ModerationContext's
// RealtimeChangePayload.
type ContentVisibilityEventPayload = {
  new: Record<string, unknown>;
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
  createRemotePost: (input: { content: string; gameId?: string; gameLabel?: string }) => Promise<{ error: string | null }>;
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

const POSTS_SELECT_COLUMNS = 'id, author_id, content, category, created_at, updated_at, game_id, game_label';
const COMMENTS_SELECT_COLUMNS = 'id, post_id, author_id, content, created_at, updated_at';
const LIKES_SELECT_COLUMNS = 'post_id, user_id, created_at';

const TRIPS_SELECT_COLUMNS =
  'id, owner_id, departure, destination, departure_time, seats_available, occasion, description, created_at, updated_at, game_id, game_label';
const TRIP_LIKES_SELECT_COLUMNS = 'trip_id, user_id, created_at';
const TRIP_REQUESTS_SELECT_COLUMNS = 'id, trip_id, requester_id, message, status, created_at, updated_at';

const MEETUPS_SELECT_COLUMNS = 'id, organizer_id, title, description, location, starts_at, max_attendees, game_id, game_label, created_at, updated_at';
const MEETUP_LIKES_SELECT_COLUMNS = 'meetup_id, user_id, created_at';
const MEETUP_ATTENDEES_SELECT_COLUMNS = 'meetup_id, user_id, joined_at';

const WANTED_ENTRIES_SELECT_COLUMNS = 'id, owner_id, description, requested_service, created_at, updated_at, game_id, game_label';
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

  const [localPosts, setLocalPosts] = useState<FeedPost[]>(() => feedPosts.map((post) => withLocalSource(post)));

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

    let isCurrent = true;
    setIsRemotePostsLoading(true);
    setRemotePostsError(null);

    (async () => {
      const { data: postRows, error: postsError } = await supabase
        .from('posts')
        .select(POSTS_SELECT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(REMOTE_POSTS_LIMIT);

      if (!isCurrent) return;

      if (postsError) {
        setRemotePostsError(mapPostError(postsError));
        setRemotePosts([]);
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

      const [commentsResult, likesResult] = await Promise.all([
        supabase.from('post_comments').select(COMMENTS_SELECT_COLUMNS).in('post_id', postIds).order('created_at', { ascending: true }),
        supabase.from('post_likes').select(LIKES_SELECT_COLUMNS).in('post_id', postIds),
      ]);

      if (!isCurrent) return;

      if (commentsResult.error) {
        setRemotePostsError(mapPostError(commentsResult.error));
        setRemotePosts([]);
        setIsRemotePostsLoading(false);
        return;
      }

      if (likesResult.error) {
        setRemotePostsError(mapPostError(likesResult.error));
        setRemotePosts([]);
        setIsRemotePostsLoading(false);
        return;
      }

      const comments = (commentsResult.data ?? []) as SupabaseCommentRow[];
      const likes = (likesResult.data ?? []) as SupabaseLikeRow[];

      const authorIds = new Set<string>();
      posts.forEach((post) => authorIds.add(post.author_id));
      comments.forEach((comment) => authorIds.add(comment.author_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemotePostsError(mapPostError(profilesError));
        setRemotePosts([]);
        setIsRemotePostsLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName) };
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

      const mappedPosts = posts.map((row) =>
        mapSupabasePostToFeedPost(
          row,
          commentsByPostId.get(row.id) ?? [],
          likeCountByPostId.get(row.id) ?? 0,
          likedPostIdsByCurrentUser.has(row.id),
          authorDisplayById[row.author_id] ?? UNKNOWN_AUTHOR_DISPLAY,
        ),
      );

      setRemoteAuthorProfiles((current) => ({ ...current, ...authorDisplayById }));
      setRemotePosts(mappedPosts);
      setIsRemotePostsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

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

    let isCurrent = true;
    setIsRemoteTripsLoading(true);
    setRemoteTripsError(null);

    (async () => {
      const { data: tripRows, error: tripsError } = await supabase
        .from('trips')
        .select(TRIPS_SELECT_COLUMNS)
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

      const [likesResult, requestsResult] = await Promise.all([
        supabase.from('trip_likes').select(TRIP_LIKES_SELECT_COLUMNS).in('trip_id', tripIds),
        supabase.from('trip_requests').select(TRIP_REQUESTS_SELECT_COLUMNS).in('trip_id', tripIds),
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

      const authorIds = new Set<string>(trips.map((trip) => trip.owner_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemoteTripsError(mapTripError(profilesError));
        setRemoteTrips([]);
        setIsRemoteTripsLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName) };
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
  }, [authUserId, tripsReloadToken]);

  useEffect(() => {
    if (!authUserId) {
      setRemoteMeetups([]);
      setRemoteAuthorProfiles({});
      setIsRemoteMeetupsLoading(false);
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

      const [likesResult, attendeesResult] = await Promise.all([
        supabase.from('meetup_likes').select(MEETUP_LIKES_SELECT_COLUMNS).in('meetup_id', meetupIds),
        supabase.from('meetup_attendees').select(MEETUP_ATTENDEES_SELECT_COLUMNS).in('meetup_id', meetupIds),
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

      const authorIds = new Set<string>(meetups.map((meetup) => meetup.organizer_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemoteMeetupsError(mapMeetupError(profilesError));
        setRemoteMeetups([]);
        setIsRemoteMeetupsLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName) };
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
        ),
      );

      setRemoteAuthorProfiles((current) => ({ ...current, ...authorDisplayById }));
      setRemoteMeetups(mappedMeetups);
      setIsRemoteMeetupsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, meetupsReloadToken]);

  useEffect(() => {
    if (!authUserId) {
      setRemoteWantedEntries([]);
      setRemoteAuthorProfiles({});
      setIsRemoteWantedEntriesLoading(false);
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

      const { data: likeRows, error: likesError } = await supabase
        .from('wanted_likes')
        .select(WANTED_LIKES_SELECT_COLUMNS)
        .in('wanted_entry_id', wantedEntryIds);

      if (!isCurrent) return;

      if (likesError) {
        setRemoteWantedEntriesError(mapWantedEntryError(likesError));
        setRemoteWantedEntries([]);
        setIsRemoteWantedEntriesLoading(false);
        return;
      }

      const likes = (likeRows ?? []) as SupabaseWantedLikeRow[];

      const authorIds = new Set<string>(wantedEntries.map((entry) => entry.owner_id));

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', Array.from(authorIds));

      if (!isCurrent) return;

      if (profilesError) {
        setRemoteWantedEntriesError(mapWantedEntryError(profilesError));
        setRemoteWantedEntries([]);
        setIsRemoteWantedEntriesLoading(false);
        return;
      }

      const authorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        authorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName) };
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
        ),
      );

      setRemoteAuthorProfiles((current) => ({ ...current, ...authorDisplayById }));
      setRemoteWantedEntries(mappedWantedEntries);
      setIsRemoteWantedEntriesLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, wantedEntriesReloadToken]);

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

  // --- Foreground refresh: one AppState listener (react-native-web maps this to
  // document.visibilitychange), no polling. Also nudges a realtime reconnect if the channel isn't
  // healthy, mirroring ModerationContext's established behavior. ---
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

  const createRemotePost = async (input: { content: string; gameId?: string; gameLabel?: string }): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
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
      })
      .select(POSTS_SELECT_COLUMNS)
      .single();

    if (error) {
      return { error: mapPostError(error) };
    }

    const newPost = mapSupabasePostToFeedPost(data as SupabasePostRow, [], 0, false, getOwnAuthorDisplay());
    setRemotePosts((current) => [newPost, ...current]);
    return { error: null };
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

  const pendingRequestCountForTrip = (tripId: string): number =>
    getRequestsForTrip(tripId).filter((row) => row.status === 'pending').length;

  const createRemoteMeetup = async (input: NewRemoteMeetupInput): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
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
  const posts = useMemo(() => {
    const remoteCombined = [...remotePosts, ...remoteTrips, ...remoteMeetups, ...remoteWantedEntries].sort(
      (a, b) => getCreatedAtMs(b) - getCreatedAtMs(a),
    );

    const seenIds = new Set<string>();
    const merged: FeedPost[] = [];

    for (const post of [...remoteCombined, ...localPosts]) {
      if (seenIds.has(post.id)) continue;
      seenIds.add(post.id);
      merged.push(post);
    }

    return merged;
  }, [remotePosts, remoteTrips, remoteMeetups, remoteWantedEntries, localPosts]);

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
    }),
    [
      posts,
      remotePosts,
      isRemotePostsLoading,
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
