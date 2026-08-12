-- 20260815100000_create_user_follows.sql
--
-- Persistent, account-bound follow relationships. Replaces the previous purely-local,
-- non-persistent context/profile-context.tsx implementation (seedFollowEdges) for real Supabase
-- accounts -- this is the single, real follow architecture, not a second parallel one. Local seed
-- profiles (no row in public.profiles at all) keep their existing local demo relationships,
-- exactly as local likes/saves/blocks already do for seed content -- never mixed with real rows.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`). Safe to
-- re-run: table creation uses `if not exists`, every policy/trigger/function is dropped or
-- replaced with `if exists`/`create or replace` immediately before being recreated. Purely
-- additive: no existing table/migration/row touched, no id changed, no data deleted.

create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint user_follows_no_self_follow check (follower_id <> following_id)
);

-- follower_id is already indexed via the leading primary-key column (same reasoning as
-- user_blocks_blocked_id_idx) -- only following_id needs its own index, for follower
-- counts/lists ("who follows this profile").
create index if not exists user_follows_following_id_idx on public.user_follows (following_id);

alter table public.user_follows enable row level security;

-- SELECT is intentionally open (`using (true)`), unlike the private post_saves/trip_saves/etc.
-- tables from the previous step -- a follower/following list is public-facing information on this
-- app (same visibility model as post_likes/trip_likes/...), and both app/profile/[id]/followers.tsx
-- and following.tsx must be able to read any profile's connections, not just the caller's own.
drop policy if exists "Authenticated users can read follows" on public.user_follows;
create policy "Authenticated users can read follows"
  on public.user_follows
  for select
  to authenticated
  using (true);

-- A user may only ever create a follow row as themselves (never on another account's behalf), and
-- never while blocked in either direction with the target -- are_users_blocked() already exists
-- (20260806130000_create_user_blocks.sql, SECURITY DEFINER, granted to authenticated for exactly
-- this kind of RLS-policy use) and is reused here unchanged, no new blocking logic.
drop policy if exists "Users can follow others" on public.user_follows;
create policy "Users can follow others"
  on public.user_follows
  for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and following_id <> auth.uid()
    and not public.are_users_blocked(auth.uid(), following_id)
  );

drop policy if exists "Users can unfollow" on public.user_follows;
create policy "Users can unfollow"
  on public.user_follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);

-- No UPDATE policy: a follow is either present or absent, never modified in place.

revoke all on public.user_follows from anon;
grant select, insert, delete on public.user_follows to authenticated;
revoke update on public.user_follows from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Block cleanup: when A blocks B (a row is inserted into user_blocks -- always a direct client
-- insert in this app, there is no RPC for it, see blocks-context.tsx), any existing follow
-- relationship between A and B in either direction is removed automatically, server-side. This
-- runs regardless of who currently holds the follow row, so it can never be bypassed by RLS (the
-- trigger function is SECURITY DEFINER) and never leaves an inconsistent A<->B relationship after
-- a block. No notification is generated for this removal -- only a genuine new follow notifies
-- (see below).
-- ---------------------------------------------------------------------------------------------

create or replace function public.cleanup_user_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);

  return new;
end;
$$;

drop trigger if exists on_user_block_cleanup_follows on public.user_blocks;
create trigger on_user_block_cleanup_follows
  after insert on public.user_blocks
  for each row execute function public.cleanup_user_follows_on_block();

-- ---------------------------------------------------------------------------------------------
-- Notifications: widen the existing type check (additive only -- every currently valid value
-- stays allowed, no existing row is touched) and add a trigger that notifies the followed user
-- exactly once per genuine new follow, reusing the existing create_notification() helper
-- (20260804120000_create_notifications.sql) and its `on conflict (event_key) do nothing`
-- idempotency guarantee -- a rapid double-tap or any trigger re-fire can never produce a second
-- notification for the same follow. reference_type='profile' needs no constraint change, it was
-- already an allowed value.
--
-- The full list below is every value notifications_type_check has ever allowed, gathered from
-- both prior migrations that defined it: the original 6 from
-- 20260804120000_create_notifications.sql (message_received/trip_request_*/meetup_*) plus the 8
-- group types added later in 20260813120000_add_group_notifications.sql (group_message/
-- group_join_*/group_admin_*/group_member_removed/group_ownership_transferred) -- verified by
-- reading that migration's own `add constraint` list directly, not assumed. A first attempt at
-- this migration only carried the original 6 forward and dropped the 8 group types, which is
-- exactly why applying it remotely failed with "check constraint ... is violated by some row"
-- (existing group_* notifications no longer satisfied the narrowed check). Only `user_follow` is
-- newly added here; nothing is removed.
-- ---------------------------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (
    type in (
      'message_received',
      'trip_request_received',
      'trip_request_accepted',
      'trip_request_rejected',
      'meetup_joined',
      'meetup_left',
      'group_message',
      'group_join_request',
      'group_join_accepted',
      'group_join_rejected',
      'group_admin_promoted',
      'group_admin_demoted',
      'group_member_removed',
      'group_ownership_transferred',
      'user_follow'
    )
  );

create or replace function public.notify_on_new_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower_name text;
begin
  select coalesce(nullif(trim(display_name), ''), 'Ein Mitglied') into v_follower_name
  from public.profiles
  where id = new.follower_id;

  if v_follower_name is null then
    v_follower_name := 'Ein Mitglied';
  end if;

  perform public.create_notification(
    new.following_id,
    new.follower_id,
    'user_follow',
    'Neuer Follower',
    v_follower_name || ' folgt dir jetzt.',
    'profile',
    new.follower_id::text,
    'user_follow:' || new.follower_id::text || ':' || new.following_id::text
  );

  return new;
end;
$$;

drop trigger if exists on_user_follow_notify on public.user_follows;
create trigger on_user_follow_notify
  after insert on public.user_follows
  for each row execute function public.notify_on_new_follow();

-- No DELETE trigger on user_follows: unfollowing must never generate a notification.
