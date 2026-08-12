-- 20260814120000_schedule_football_sync.sql
--
-- Prepares automatic, unattended scheduling of supabase/functions/sync-football-games/index.ts via
-- Supabase's own pg_cron + pg_net + Vault mechanisms -- no app code triggers this, and nothing here
-- runs until this migration and a one-time manual Vault step (see below) are both applied remotely,
-- which is explicitly NOT done as part of this step. Purely additive: no existing table/column/row
-- touched, no game/post/stadium data affected. Safe to re-run: extension creation uses
-- `if not exists`, and job (re)scheduling explicitly unschedules only its own exactly-named job
-- before recreating it (see below) -- never touches any other cron job in the project.
--
-- ---------------------------------------------------------------------------------------------
-- Required manual, one-time, OUT-OF-BAND step (never put the real secret value in any file in
-- this repo, including this one) -- run this yourself, once, via the Supabase SQL editor or CLI,
-- AFTER this migration has been applied, and only once FOOTBALL_SYNC_SECRET has been set as an
-- Edge Function secret (see sync-football-games/index.ts's own header for that step):
--
--   select vault.create_secret('<the exact same value as the FOOTBALL_SYNC_SECRET Edge Function secret>', 'football_sync_secret');
--
-- Everything below only ever references the NAME 'football_sync_secret', never a value. Until the
-- statement above has been run for real, the cron jobs below would find no matching row in
-- vault.decrypted_secrets and would call the function with a missing/empty secret header, which
-- sync-football-games already safely rejects with 401 (see that file) -- never a silent failure
-- that writes bad data, just an authenticated-caller-only function correctly staying closed.
-- ---------------------------------------------------------------------------------------------

-- pg_cron: schedules the two jobs below. pg_net: lets a scheduled job make an HTTP call (to the
-- Edge Function) directly from Postgres. Both are standard, Supabase-provided extensions for
-- exactly this "call an Edge Function on a schedule" pattern -- no other extension is needed;
-- Vault (referenced above) is a built-in Supabase feature, not a togglable extension, so there is
-- no corresponding `create extension` for it.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- The project's public REST/Functions base URL -- not a secret (already visible in
-- mobile/.env as EXPO_PUBLIC_SUPABASE_URL and in supabase/config.toml's project_id). Only ever
-- used as the request target, never as a credential.
-- Project ref: pumvmdmmmxgrhofxawnf

-- ---------------------------------------------------------------------------------------------
-- football-current-sync -- every 15 minutes, {"mode":"current"}: refreshes only the previous/
-- current/next matchday per configured league (see the Edge Function's own "current" mode
-- documentation) -- picks up new results, late score corrections, and short-notice kickoff
-- changes without re-fetching the full ~1000-game season every run.
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'football-current-sync') then
    perform cron.unschedule('football-current-sync');
  end if;
end $$;

select cron.schedule(
  'football-current-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://pumvmdmmmxgrhofxawnf.supabase.co/functions/v1/sync-football-games',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-football-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_secret')
    ),
    body := jsonb_build_object('mode', 'current'),
    timeout_milliseconds := 30000
  );
  $$
);

-- ---------------------------------------------------------------------------------------------
-- football-full-sync -- once daily at 04:00 UTC, {"mode":"full"}: re-fetches every configured
-- league's entire season in one pass, catching anything a matchday-scoped current-sync could
-- structurally miss (e.g. a fixture moved to a matchday outside the previous/current/next window).
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'football-full-sync') then
    perform cron.unschedule('football-full-sync');
  end if;
end $$;

select cron.schedule(
  'football-full-sync',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://pumvmdmmmxgrhofxawnf.supabase.co/functions/v1/sync-football-games',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-football-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'football_sync_secret')
    ),
    body := jsonb_build_object('mode', 'full'),
    timeout_milliseconds := 90000
  );
  $$
);

-- Monitoring (no new UI, see the report for this step): `select * from cron.job;` lists both
-- schedules; `select * from cron.job_run_details order by start_time desc limit 20;` shows recent
-- run history/success/failure per job; the Edge Function's own execution logs (Supabase Dashboard
-- -> Edge Functions -> sync-football-games -> Logs) show each run's response body (mode, leagues,
-- fetched, upserted, errors); `select id, last_synced_at from games order by last_synced_at desc
-- limit 20;` shows the most recently synced games directly.
