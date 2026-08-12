-- 20260813180000_repair_games_sync_schema.sql
--
-- Comprehensive, one-shot repair: adds every column supabase/functions/sync-football-games/
-- index.ts's mapMatchToGamesRow()/upsert actually writes that is not yet confirmed present on the
-- remote public.games, instead of chasing one missing-column error at a time (matchday, then
-- external_source, ...). Every statement uses `if not exists`, so this is safe to run regardless
-- of the table's exact current partial state -- a column already present from an earlier
-- migration is simply left untouched.
--
-- Not run remotely as part of this step. No existing migration edited, no column renamed or
-- dropped, no data deleted, no game id or post changed.
--
-- Context: 20260813130000 (already executed) created the base public.games table with
-- id/home_team/away_team/stadium_id/kickoff_at/home_score/away_score/attendance/status/
-- created_at/updated_at. 20260813160000 (already executed) added season/league_shortcut/
-- external_home_team_id/external_away_team_id. 20260813170000 added matchday (integer). The
-- remaining columns below -- competition/external_source/external_match_id/last_synced_at, plus
-- their unique index -- were declared in 20260813140000_prepare_real_match_data.sql, which the
-- "column external_source does not exist" error confirms has evidently still not run on this
-- database. That file is intentionally not edited (no existing migration may be changed); this
-- migration re-declares the same additive columns/index so the sync can work regardless of
-- whether 20260813140000 ever ends up running before or after this one (both use
-- `if not exists`, so whichever runs second simply no-ops on each already-present item).

alter table public.games
  add column if not exists competition text,
  add column if not exists matchday integer,
  add column if not exists season text,
  add column if not exists league_shortcut text,
  add column if not exists external_home_team_id text,
  add column if not exists external_away_team_id text,
  add column if not exists external_source text,
  add column if not exists external_match_id text,
  add column if not exists last_synced_at timestamptz;

-- Required for the sync's upsert (`onConflict: 'id'` relies on the primary key directly, but this
-- index is what actually prevents two different `id` values from ever representing the same real
-- external fixture on repeat syncs). Only applies to rows that carry an external identity --
-- existing legacy/manual games (both fields NULL) are unaffected and can never collide under it.
create unique index if not exists games_external_source_match_id_key
  on public.games (external_source, external_match_id)
  where external_source is not null and external_match_id is not null;

-- Supports the GameSelector's "browse a season" access pattern -- filtering/sorting by league +
-- season + matchday + kickoff time together (see components/stadion/game-selector.tsx). Harmless
-- no-op if 20260813170000 already created it.
create index if not exists games_league_season_matchday_kickoff_idx
  on public.games (league_shortcut, season, matchday, kickoff_at);

-- No RLS/grant changes: public.games already grants `select` to `authenticated` and revokes
-- insert/update/delete (20260813130000) -- these columns inherit that automatically. Only the
-- service-role sync function may ever write here; normal app users remain read-only for results,
-- matchdays, kickoff times and external IDs alike.
