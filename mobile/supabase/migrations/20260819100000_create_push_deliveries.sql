-- 20260819100000_create_push_deliveries.sql
--
-- Idempotency ledger for the send-push-notification Edge Function
-- (supabase/functions/send-push-notification/index.ts). public.push_tokens
-- (20260806120000_create_push_tokens.sql) already stores which devices exist; this table records,
-- per (notification, device) pair, whether a push was already attempted -- so a repeated webhook
-- call for the same notifications INSERT (network retry, a Database Webhook redelivery) can never
-- send the same push twice. Purely a server-internal delivery ledger, never a second source of
-- truth for notification content (that remains public.notifications) and never a place secrets are
-- stored.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`). Safe to
-- re-run: table creation uses `if not exists`, indexes use `if not exists`, the trigger is
-- (re)created with `drop ... if exists` immediately before being recreated. Purely additive: no
-- existing table/migration/row touched, no data deleted.

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  push_token_id uuid not null references public.push_tokens (id) on delete cascade,
  status text not null default 'pending',
  ticket_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_deliveries_status_check check (status in ('pending', 'sent', 'failed')),
  -- The actual idempotency guard: the Edge Function inserts this row with `on conflict
  -- (notification_id, push_token_id) do nothing` *before* calling the Expo Push Service for that
  -- token -- a redelivered webhook call finds the row already present and skips sending again.
  constraint push_deliveries_unique unique (notification_id, push_token_id)
);

create index if not exists push_deliveries_notification_id_idx on public.push_deliveries (notification_id);
create index if not exists push_deliveries_push_token_id_idx on public.push_deliveries (push_token_id);

drop trigger if exists set_push_deliveries_updated_at on public.push_deliveries;
create trigger set_push_deliveries_updated_at
  before update on public.push_deliveries
  for each row execute function public.set_updated_at();

alter table public.push_deliveries enable row level security;

-- Deliberately NO policies for `authenticated`/`anon` -- this is a purely server-internal delivery
-- ledger (technical status only: pending/sent/failed, an Expo ticket id, an error code -- never a
-- push secret or notification content). The only writer/reader is the Edge Function, which uses
-- the service_role key and therefore bypasses RLS entirely; RLS being *enabled* with no policies
-- means every normal client request (anon or authenticated) is denied by default, exactly the
-- "kein Client darf diese Tabelle manipulieren" requirement.
revoke all on public.push_deliveries from authenticated, anon;
