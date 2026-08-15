import type { FeedPost, TripRequestStatus } from '@/data/feed-posts';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

export type { TripRequestStatus };

export type SupabaseTripRow = {
  id: string;
  owner_id: string;
  departure: string;
  destination: string;
  departure_time: string;
  seats_available: number;
  occasion: string | null;
  description: string;
  created_at: string;
  updated_at: string;
  game_id: string | null;
  game_label: string | null;
  team_id: string | null;
};

export type SupabaseTripLikeRow = {
  trip_id: string;
  user_id: string;
  created_at: string;
};

export type SupabaseTripRequestRow = {
  id: string;
  trip_id: string;
  requester_id: string;
  message: string | null;
  status: TripRequestStatus;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
};

type AuthorDisplay = { displayName: string; initials: string };

export function mapSupabaseTripToFeedPost(
  row: SupabaseTripRow,
  likeCount: number,
  likedByCurrentUser: boolean,
  ownRequest: SupabaseTripRequestRow | undefined,
  author: AuthorDisplay,
  saveCount = 0,
): FeedPost {
  return {
    id: row.id,
    userId: row.owner_id,
    user: author.displayName,
    initials: author.initials,
    time: formatRelativeGermanTime(row.created_at),
    category: 'Fahrt',
    description: row.description,
    likes: likeCount,
    likedByCurrentUser,
    comments: [],
    rideRequestSent: ownRequest?.status === 'pending' || ownRequest?.status === 'accepted',
    rideRequestStatus: ownRequest?.status,
    rideRequestId: ownRequest?.id,
    source: 'supabase',
    createdAtIso: row.created_at,
    gameId: row.game_id ?? undefined,
    gameLabel: row.game_label ?? undefined,
    teamId: row.team_id ?? undefined,
    savesCount: saveCount,
    tripDetails: {
      departure: row.departure,
      destination: row.destination,
      departureTime: row.departure_time,
      freeSeats: row.seats_available,
      occasion: row.occasion ?? undefined,
    },
  };
}
