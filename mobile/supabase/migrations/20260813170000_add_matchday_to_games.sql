-- 20260813170000_add_matchday_to_games.sql
--
-- Adds the still-missing `matchday` column to public.games, as `integer` -- confirmed against a
-- live OpenLigaDB response (see supabase/functions/sync-football-games/index.ts): a match's
-- `group` object carries both `groupName` (a display string like "3. Spieltag") and
-- `groupOrderID` (the real numeric matchday, e.g. 3). This column stores `groupOrderID`, not the
-- display string, so the client can sort/group numerically without parsing text.
--
-- Confirmed remote state as of this step: public.games already has season/league_shortcut/
-- external_home_team_id/external_away_team_id (from 20260813160000, already executed, not
-- touched here), but no `matchday` column. Not run remotely as part of this step. Safe to re-run:
-- every statement uses `if not exists`. No data deleted, no existing column/game/post touched.
--
-- KNOWN INCONSISTENCY (see this step's final report): the older, evidently still-unrun
-- 20260813140000_prepare_real_match_data.sql migration also declares a `matchday` column, but as
-- `text`. That file is intentionally not edited here (no existing migration may be changed).
-- Whichever of the two migrations runs first on a given database will "win" the column's type for
-- that database (the other's `add column if not exists` then silently no-ops) -- reconciling that
-- ordering/type choice is left to whoever actually applies these migrations, not decided here.

alter table public.games
  add column if not exists matchday integer;

-- Supports the GameSelector's "browse a season" access pattern (see
-- components/stadion/game-selector.tsx): filtering/sorting by league + season + matchday +
-- kickoff time together, once real games are actually synced.
create index if not exists games_league_season_matchday_kickoff_idx
  on public.games (league_shortcut, season, matchday, kickoff_at);
