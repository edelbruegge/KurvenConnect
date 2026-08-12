-- 20260813140000_prepare_real_match_data.sql
--
-- Prepares public.games for real, externally-sourced fixtures (see
-- supabase/functions/sync-football-games/index.ts, not deployed as part of this step) without
-- touching the already-executed 20260813130000 migration or any existing data. Purely additive:
-- new nullable columns plus a partial unique index. Not run remotely as part of this step. Safe
-- to re-run: every statement uses `if not exists`.
--
-- Why these columns: a synced fixture needs a stable external identity to upsert against on
-- repeat sync (external_source + external_match_id, e.g. 'openligadb' + the numeric matchID as
-- text) and a `last_synced_at` marker for observability. `competition`/`matchday` let the
-- GameSelector show "2. Bundesliga · 3. Spieltag" when a game has that data, without inventing it
-- for games that don't (both stay NULL for those).
--
-- The two existing seed games (game-bochum-arminia, game-arminia-paderborn) are left completely
-- untouched: external_source/external_match_id stay NULL for them, so the partial unique index
-- below does not apply to them and they keep functioning as manual/legacy entries. There is no
-- reliable, non-guessed way to match them to a specific real fixture (no kickoff date on record),
-- so no such mapping is attempted here -- see the final report for this step.

alter table public.games
  add column if not exists competition text,
  add column if not exists matchday text,
  add column if not exists external_source text,
  add column if not exists external_match_id text,
  add column if not exists last_synced_at timestamptz;

-- Only applies to rows that actually carry an external identity -- legacy/manual games (both
-- fields NULL) are unaffected and can never collide with each other under this constraint.
create unique index if not exists games_external_source_match_id_key
  on public.games (external_source, external_match_id)
  where external_source is not null and external_match_id is not null;

-- No RLS/grant changes: public.games already grants `select` to `authenticated` and revokes
-- insert/update/delete from `authenticated` (20260813130000) -- new columns inherit that
-- automatically. Only a service-role sync (see the Edge Function) may ever write here.
