-- 20260910100000_send_push_notifications_via_pg_net.sql
--
-- supabase/functions/send-push-notification/index.ts was written to be wired up via a Supabase
-- Dashboard Database Webhook (see that file's own header comment) specifically so the function
-- URL/secret would never have to live in a versioned migration file. In practice, this project's
-- Dashboard fails to create that webhook with "ERROR: 3F000: schema \"supabase_functions\" does
-- not exist" -- a known, occasionally-occurring Supabase project-provisioning gap (the internal
-- schema Database Webhooks rely on), not something fixable from the SQL editor or the Dashboard
-- itself.
--
-- This achieves the exact same effect a Database Webhook would (call the Edge Function once per
-- new public.notifications row) using pg_net directly instead -- a standard Postgres extension
-- Supabase provides on every project, independent of the broken supabase_functions schema. The
-- webhook secret is the only thing embedded here, which is exactly as sensitive as it already was
-- sitting in `supabase secrets set PUSH_WEBHOOK_SECRET=...` -- NOT the service-role key (see
-- supabase/config.toml's new [functions.send-push-notification] verify_jwt = false entry, added in
-- this same change, which is what makes embedding a real end-user/service JWT unnecessary here).
--
-- pg_net calls are fire-and-forget/async by design (net.http_post returns a request id
-- immediately) -- exactly right here, since inserting a notification must never block on push
-- delivery succeeding.
--
-- IMPORTANT: replace both placeholders below with the real values before running this migration:
--   - <PROJECT_REF> -> pumvmdmmmxgrhofxawnf (already known; kept as a placeholder purely so this
--     file reads the same way regardless of which project runs it)
--   - <PUSH_WEBHOOK_SECRET> -> the exact same value passed to `supabase secrets set
--     PUSH_WEBHOOK_SECRET=...`

-- pg_net always creates its own dedicated "net" schema regardless of any `with schema` clause
-- (its functions are always called as net.http_post(...), never extensions.net.http_post(...)).
create extension if not exists pg_net;

create or replace function public.trigger_send_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', '<PUSH_WEBHOOK_SECRET>'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', jsonb_build_object('id', new.id)
    )
  );

  return new;
end;
$$;

drop trigger if exists send_push_notification_on_insert on public.notifications;
create trigger send_push_notification_on_insert
  after insert on public.notifications
  for each row execute function public.trigger_send_push_notification();
