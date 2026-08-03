import type { FeedPost } from '@/data/feed-posts';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

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
};

export type SupabaseTripLikeRow = {
  trip_id: string;
  user_id: string;
  created_at: string;
};

export type TripRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export type SupabaseTripRequestRow = {
  id: string;
  trip_id: string;
  requester_id: string;
  message: string | null;
  status: TripRequestStatus;
  created_at: string;
  updated_at: string;
};

type AuthorDisplay = { displayName: string; initials: string };

export function mapSupabaseTripToFeedPost(
  row: SupabaseTripRow,
  likeCount: number,
  likedByCurrentUser: boolean,
  hasActiveOwnRequest: boolean,
  author: AuthorDisplay,
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
    rideRequestSent: hasActiveOwnRequest,
    source: 'supabase',
    createdAtIso: row.created_at,
    tripDetails: {
      departure: row.departure,
      destination: row.destination,
      departureTime: row.departure_time,
      freeSeats: row.seats_available,
      occasion: row.occasion ?? undefined,
    },
  };
}
