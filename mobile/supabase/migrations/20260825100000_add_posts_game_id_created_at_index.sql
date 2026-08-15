-- 20260825100000_add_posts_game_id_created_at_index.sql
--
-- posts.game_id/game_label already exist (20260804090000_add_game_reference_to_content.sql),
-- already fully wired end-to-end (POSTS_SELECT_COLUMNS, createRemotePost, mapSupabasePostToFeedPost
-- in the current app code), and already have a single-column index (posts_game_id_idx). Only the
-- composite (game_id, created_at) index -- the shape a "Spiel → Beiträge" server-side query would
-- want -- was missing, mirroring the existing posts_team_id_created_at_idx pattern
-- (20260821100000_add_team_scope_to_content.sql).
--
-- Purely additive, no data change. Not run remotely as part of this step. Safe to re-run:
-- `create index if not exists`.

create index if not exists posts_game_id_created_at_idx on public.posts (game_id, created_at desc);
