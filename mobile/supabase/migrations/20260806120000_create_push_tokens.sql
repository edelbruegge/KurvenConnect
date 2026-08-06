-- 20260806120000_create_push_tokens.sql
--
-- Device push token registry for real Expo push notifications. This table stores only what is
-- needed to deliver a push via the Expo Push Service — it is never a second source of truth for
-- notification content (that remains public.notifications). expo_push_token is UNIQUE: a token
-- belongs to one physical app installation, not to a user, so switching accounts on the same
-- device reassigns the existing row (via register_push_token below) instead of creating a second
-- one — this is what keeps a token from ever being actively assigned to two users at once.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/function/trigger is
-- (re)created with `drop ... if exists` / `create or replace` immediately before being
-- (re)created, so re-applying this file after a partial or repeated run will not fail or
-- duplicate anything.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  device_id text not null,
  platform text not null,
  app_version text,
  device_name text,
  is_active boolean not null default true,
  last_registered_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_expo_push_token_unique unique (expo_push_token),
  constraint push_tokens_platform_check check (platform in ('ios', 'android')),
  constraint push_tokens_device_id_not_blank check (length(trim(device_id)) > 0),
  constraint push_tokens_expo_push_token_not_blank check (length(trim(expo_push_token)) > 0)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);
create index if not exists push_tokens_active_by_user_idx on public.push_tokens (user_id) where is_active;
-- expo_push_token is already indexed via the unique constraint above.

drop trigger if exists set_push_tokens_updated_at on public.push_tokens;
create trigger set_push_tokens_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

drop policy if exists "Users can read their own push tokens" on public.push_tokens;
create policy "Users can read their own push tokens"
  on public.push_tokens
  for select
  to authenticated
  using (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy: every write goes through the two SECURITY DEFINER functions
-- below, so a client can never register a token for someone else or read another user's token
-- via a crafted request. The send-push-notification Edge Function reads active tokens with the
-- service_role key, bypassing RLS entirely on the server side (never exposed to the app).

revoke all on public.push_tokens from anon;
grant select on public.push_tokens to authenticated;
revoke insert, update, delete on public.push_tokens from authenticated;

-- Registers (or re-registers) the current device's Expo push token for the calling user. Upserts
-- on the token itself, so re-registering the same physical installation under a different
-- account (after sign-out/sign-in) atomically reassigns and reactivates the row — the previous
-- account no longer owns an active token on this device once this runs.
create or replace function public.register_push_token(
  p_expo_push_token text,
  p_device_id text,
  p_platform text,
  p_app_version text,
  p_device_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.push_tokens (
    user_id, expo_push_token, device_id, platform, app_version, device_name, is_active, last_registered_at
  )
  values (
    auth.uid(), p_expo_push_token, p_device_id, p_platform, p_app_version, p_device_name, true, now()
  )
  on conflict (expo_push_token) do update
  set
    user_id = excluded.user_id,
    device_id = excluded.device_id,
    platform = excluded.platform,
    app_version = excluded.app_version,
    device_name = excluded.device_name,
    is_active = true,
    last_registered_at = now(),
    last_error_at = null,
    last_error_code = null,
    updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text, text, text, text) from public;
revoke all on function public.register_push_token(text, text, text, text, text) from anon;
grant execute on function public.register_push_token(text, text, text, text, text) to authenticated;

-- Deactivates a token currently owned by the calling user (logout, or the user turning push off
-- in-app). Only ever touches a row the caller currently owns.
create or replace function public.deactivate_push_token(p_expo_push_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.push_tokens
  set is_active = false, updated_at = now()
  where expo_push_token = p_expo_push_token and user_id = auth.uid();
end;
$$;

revoke all on function public.deactivate_push_token(text) from public;
revoke all on function public.deactivate_push_token(text) from anon;
grant execute on function public.deactivate_push_token(text) to authenticated;
