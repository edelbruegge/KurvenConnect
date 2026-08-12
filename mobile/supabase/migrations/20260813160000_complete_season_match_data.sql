-- 20260813160000_complete_season_match_data.sql
--
-- Prepares public.games for a full real season import (all matchdays of a competition, not just
-- the next fixture) by adding the remaining reference fields the sync architecture needs. Purely
-- additive; does not touch the already-executed 20260813130000/20260813140000/20260813150000
-- migrations, does not delete or rename anything, does not change any existing game_id/stadium_id
-- value. Not run remotely as part of this step. Safe to re-run: every statement uses
-- `if not exists`.
--
-- Why these columns: `season`/`league_shortcut` let the client group and label a full season's
-- fixtures without hardcoding either in UI components (see lib/map-supabase-game.ts's
-- formatSeasonLabel and context/games-context.tsx's currentSeasonGames). `external_home_team_id`/
-- `external_away_team_id` are additive identifiers from the external source (see
-- supabase/functions/sync-football-games/index.ts, still not deployed) -- reserved for a later,
-- controlled "favorite club" mapping; not used to guess anything today.
--
-- The existing unique index games_external_source_match_id_key on (external_source,
-- external_match_id), added in 20260813140000, already guarantees a repeated sync cannot create a
-- duplicate row -- no new constraint needed here.

alter table public.games
  add column if not exists season text,
  add column if not exists league_shortcut text,
  add column if not exists external_home_team_id text,
  add column if not exists external_away_team_id text;

-- No RLS/grant changes: public.games already grants `select` to `authenticated` and revokes
-- insert/update/delete (20260813130000) -- new columns inherit that automatically. Only the
-- service-role sync function may ever write here.
