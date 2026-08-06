import type { BlockedUser } from '@/data/blocks';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

export type SupabaseUserBlockRow = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

export function mapSupabaseUserBlockToBlock(row: SupabaseUserBlockRow): BlockedUser {
  return {
    userId: row.blocked_id,
    blockedAt: formatRelativeGermanTime(row.created_at),
    source: 'supabase',
    createdAtIso: row.created_at,
  };
}
