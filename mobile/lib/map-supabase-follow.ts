// Row shape of public.user_follows -- see
// supabase/migrations/20260815100000_create_user_follows.sql.
export type SupabaseFollowRow = {
  follower_id: string;
  following_id: string;
  created_at: string;
};
