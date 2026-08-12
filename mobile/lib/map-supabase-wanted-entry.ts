import type { FeedPost } from '@/data/feed-posts';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

export type SupabaseWantedEntryRow = {
  id: string;
  owner_id: string;
  description: string;
  requested_service: string;
  created_at: string;
  updated_at: string;
  game_id: string | null;
  game_label: string | null;
};

export type SupabaseWantedLikeRow = {
  wanted_entry_id: string;
  user_id: string;
  created_at: string;
};

type AuthorDisplay = { displayName: string; initials: string };

export function mapSupabaseWantedEntryToFeedPost(
  row: SupabaseWantedEntryRow,
  likeCount: number,
  likedByCurrentUser: boolean,
  author: AuthorDisplay,
): FeedPost {
  return {
    id: row.id,
    userId: row.owner_id,
    user: author.displayName,
    initials: author.initials,
    time: formatRelativeGermanTime(row.created_at),
    category: 'Gesuch',
    description: row.description,
    likes: likeCount,
    likedByCurrentUser,
    comments: [],
    source: 'supabase',
    createdAtIso: row.created_at,
    gameId: row.game_id ?? undefined,
    gameLabel: row.game_label ?? undefined,
    requestDetails: {
      requestedService: row.requested_service,
    },
  };
}
