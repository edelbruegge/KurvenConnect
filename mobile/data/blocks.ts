export type BlockedUser = {
  userId: string;
  blockedAt: string;
  // 'local' for seed/in-memory blocks, 'supabase' for rows loaded from public.user_blocks.
  // Defaults to 'local' when absent, same convention as FeedPost.source.
  source?: 'local' | 'supabase';
  // Raw ISO timestamp, set only for source:'supabase' blocks.
  createdAtIso?: string;
};

export const seedBlockedUsers: BlockedUser[] = [];
