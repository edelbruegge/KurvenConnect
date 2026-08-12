import type { FeedPostCategory } from '@/data/feed-posts';

// Row shapes of public.post_saves/trip_saves/meetup_saves/wanted_saves -- see
// supabase/migrations/20260814130000_create_saved_content.sql. Each mirrors its equivalent
// *_likes row shape (content_id, user_id, created_at) exactly, just scoped to one content type's
// id column name.

export type SupabasePostSaveRow = { post_id: string; user_id: string; created_at: string };
export type SupabaseTripSaveRow = { trip_id: string; user_id: string; created_at: string };
export type SupabaseMeetupSaveRow = { meetup_id: string; user_id: string; created_at: string };
export type SupabaseWantedSaveRow = { wanted_entry_id: string; user_id: string; created_at: string };

export type SaveTableConfig = {
  table: 'post_saves' | 'trip_saves' | 'meetup_saves' | 'wanted_saves';
  idColumn: 'post_id' | 'trip_id' | 'meetup_id' | 'wanted_entry_id';
};

// The one save table + id column a given FeedPost category writes to -- single source of truth
// for this mapping, used by both the bundled load and the save/unsave writes in
// context/saved-context.tsx, so the two can never drift apart from each other.
export const SAVE_TABLE_BY_CATEGORY: Record<FeedPostCategory, SaveTableConfig> = {
  Beitrag: { table: 'post_saves', idColumn: 'post_id' },
  Fahrt: { table: 'trip_saves', idColumn: 'trip_id' },
  Treffpunkt: { table: 'meetup_saves', idColumn: 'meetup_id' },
  Gesuch: { table: 'wanted_saves', idColumn: 'wanted_entry_id' },
};
