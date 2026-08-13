import type { FeedPost, MeetupDetails } from '@/data/feed-posts';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

export type SupabaseMeetupRow = {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  max_attendees: number | null;
  game_id: string;
  game_label: string;
  created_at: string;
  updated_at: string;
  team_id: string | null;
};

export type SupabaseMeetupLikeRow = {
  meetup_id: string;
  user_id: string;
  created_at: string;
};

export type SupabaseMeetupAttendeeRow = {
  meetup_id: string;
  user_id: string;
  joined_at: string;
};

type AuthorDisplay = { displayName: string; initials: string };

/** "08.11.2026" — matches the existing seed-data date display convention. */
function formatGermanDate(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

/** "13:00 Uhr" — matches the existing seed-data time display convention. */
function formatGermanEventTime(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date)} Uhr`;
}

/**
 * Parses "TT.MM.JJJJ" + "HH:MM" (an optional trailing " Uhr" on the time is ignored) into an
 * ISO timestamp. Returns null for anything that doesn't match — the existing form fields are
 * free text with no prior format enforcement, so this is deliberately strict rather than
 * guessing at malformed input.
 */
export function parseGermanDateAndTimeToIso(dateText: string, timeText: string): string | null {
  const dateMatch = dateText.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const timeMatch = timeText.trim().match(/^(\d{1,2}):(\d{2})/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const [, day, month, year] = dateMatch;
  const [, hours, minutes] = timeMatch;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), 0, 0);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function mapSupabaseMeetupToFeedPost(
  row: SupabaseMeetupRow,
  attendeeIds: string[],
  likeCount: number,
  likedByCurrentUser: boolean,
  author: AuthorDisplay,
): FeedPost {
  const meetupDetails: MeetupDetails = {
    gameId: row.game_id,
    gameLabel: row.game_label,
    title: row.title,
    location: row.location,
    date: formatGermanDate(row.starts_at),
    eventTime: formatGermanEventTime(row.starts_at),
    maxAttendees: row.max_attendees ?? undefined,
    attendeeIds,
  };

  return {
    id: row.id,
    userId: row.organizer_id,
    user: author.displayName,
    initials: author.initials,
    time: formatRelativeGermanTime(row.created_at),
    category: 'Treffpunkt',
    description: row.description,
    likes: likeCount,
    likedByCurrentUser,
    comments: [],
    source: 'supabase',
    createdAtIso: row.created_at,
    teamId: row.team_id ?? undefined,
    meetupDetails,
  };
}
