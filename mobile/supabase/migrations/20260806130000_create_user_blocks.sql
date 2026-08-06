-- 20260806130000_create_user_blocks.sql
--
-- Persistent, server-enforced user blocking. public.user_blocks is the single source of truth
-- for "who blocked whom" between real Supabase accounts; local seed-user blocking stays purely
-- local/in-memory, exactly as before (local seed users have no row in public.profiles at all).
-- This migration also hardens the existing direct-conversation/message/trip-request/meetup-join
-- write paths so a block is enforced server-side, not just hidden in the UI — none of the
-- original migration files are modified, every changed function/policy is fully redefined here.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/function is (re)created
-- with `drop ... if exists` / `create or replace` immediately before being (re)created, so
-- re-applying this file after a partial or repeated run will not fail or duplicate anything.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

-- blocker_id is already indexed via the leftmost column of the primary key above — a separate
-- index on it alone would be a redundant duplicate. Only blocked_id needs its own index.
create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- SELECT is intentionally scoped to blocker_id = auth.uid() only: a blocked user must not be able
-- to discover who blocked them via a normal table query.
drop policy if exists "Blockers can read their own blocks" on public.user_blocks;
create policy "Blockers can read their own blocks"
  on public.user_blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "Users can block others" on public.user_blocks;
create policy "Users can block others"
  on public.user_blocks
  for insert
  to authenticated
  with check (
    blocker_id = auth.uid()
    and blocked_id <> auth.uid()
    and exists (select 1 from public.profiles where id = blocked_id)
  );

drop policy if exists "Blockers can remove their own blocks" on public.user_blocks;
create policy "Blockers can remove their own blocks"
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

-- No UPDATE policy: a block is either created or removed, never modified in place.

revoke all on public.user_blocks from anon;
grant select, insert, delete on public.user_blocks to authenticated;
revoke update on public.user_blocks from authenticated;

-- Narrow, internal-use boolean check: true if either user has blocked the other. Deliberately
-- does not expose full block lists or which direction the block is in — only a single pairwise
-- boolean. SECURITY DEFINER + granted to `authenticated` because it is called from inside RLS
-- policies below, which evaluate under the `authenticated` role itself (same reasoning as
-- is_conversation_member in 20260804100000_create_conversations_and_messages.sql: without the
-- EXECUTE grant, policy evaluation for ordinary users would fail outright).
create or replace function public.are_users_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_user_a and blocked_id = p_user_b)
       or (blocker_id = p_user_b and blocked_id = p_user_a)
  );
$$;

revoke all on function public.are_users_blocked(uuid, uuid) from public;
revoke all on function public.are_users_blocked(uuid, uuid) from anon;
grant execute on function public.are_users_blocked(uuid, uuid) to authenticated;

-- Re-defines get_or_create_direct_conversation (originally created in
-- 20260804100000_create_conversations_and_messages.sql) with one added check: a block in either
-- direction blocks creating a new conversation. Everything else is unchanged from the original.
create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_direct_key text;
  v_conversation public.conversations;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_other_user_id is null then
    raise exception 'other user is required';
  end if;

  if p_other_user_id = v_self then
    raise exception 'cannot start a conversation with yourself';
  end if;

  if not exists (select 1 from public.profiles where id = v_self) then
    raise exception 'own profile not found';
  end if;

  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'other profile not found';
  end if;

  if public.are_users_blocked(v_self, p_other_user_id) then
    raise exception 'blocked: cannot start a conversation with a blocked user';
  end if;

  if p_other_user_id < v_self then
    v_user_a := p_other_user_id;
    v_user_b := v_self;
  else
    v_user_a := v_self;
    v_user_b := p_other_user_id;
  end if;

  v_direct_key := v_user_a::text || ':' || v_user_b::text;

  insert into public.conversations (conversation_type, direct_key, created_by)
  values ('direct', v_direct_key, v_self)
  on conflict (direct_key) do nothing
  returning * into v_conversation;

  if v_conversation.id is null then
    select * into v_conversation from public.conversations where direct_key = v_direct_key;
  else
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conversation.id, v_user_a), (v_conversation.id, v_user_b)
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_conversation;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
revoke all on function public.get_or_create_direct_conversation(uuid) from anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- Blocks a new message into a conversation whose other member the sender is blocked with (either
-- direction), via a BEFORE INSERT trigger rather than folding this into the existing "Members can
-- send messages" WITH CHECK policy (originally created in
-- 20260804100000_create_conversations_and_messages.sql, left completely unchanged). A plain RLS
-- policy violation always produces the same generic "new row violates row-level security policy"
-- text regardless of which check failed — a trigger lets the app distinguish "you are blocked"
-- from every other rejection reason and show the correct, specific message. Existing messages are
-- never touched — only new inserts are affected.
create or replace function public.prevent_blocked_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.sender_id
      and public.are_users_blocked(new.sender_id, cm.user_id)
  ) then
    raise exception 'blocked: cannot send a message to a blocked user';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_blocked_message_insert_trigger on public.messages;
create trigger prevent_blocked_message_insert_trigger
  before insert on public.messages
  for each row execute function public.prevent_blocked_message_insert();

-- Same reasoning as above, for trip_requests: a BEFORE INSERT trigger (distinguishable error
-- text) instead of amending the existing "Users can request trips they do not own" WITH CHECK
-- policy (originally created in 20260803130000_create_trips_and_requests.sql, left completely
-- unchanged). Existing (pending/accepted/...) requests are left untouched.
create or replace function public.prevent_blocked_trip_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  select owner_id into v_owner_id from public.trips where id = new.trip_id;

  if v_owner_id is not null and public.are_users_blocked(new.requester_id, v_owner_id) then
    raise exception 'blocked: cannot request a trip from a blocked user';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_blocked_trip_request_insert_trigger on public.trip_requests;
create trigger prevent_blocked_trip_request_insert_trigger
  before insert on public.trip_requests
  for each row execute function public.prevent_blocked_trip_request_insert();

-- Re-defines join_meetup (originally created in
-- 20260803150000_create_meetups_and_participation.sql) with one added check: a blocked
-- relationship (either direction) between the caller and the organizer prevents joining.
-- leave_meetup is intentionally left unchanged — a already-attending user must always be able to
-- leave, regardless of any block that may since have been created.
create or replace function public.join_meetup(p_meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups;
  v_existing_count integer;
  v_attendee_ids uuid[];
begin
  select * into v_meetup from public.meetups where id = p_meetup_id for update;

  if not found then
    raise exception 'meetup not found';
  end if;

  if v_meetup.organizer_id = auth.uid() then
    raise exception 'organizer cannot join their own meetup';
  end if;

  if public.are_users_blocked(auth.uid(), v_meetup.organizer_id) then
    raise exception 'blocked: cannot join a meetup organized by a blocked user';
  end if;

  if exists (select 1 from public.meetup_attendees where meetup_id = p_meetup_id and user_id = auth.uid()) then
    raise exception 'already attending this meetup';
  end if;

  select count(*) into v_existing_count from public.meetup_attendees where meetup_id = p_meetup_id;

  -- Total attendee count including the organizer, if this join succeeds, would be
  -- v_existing_count + 1 (organizer) + 1 (this join) — mirrors the app's isMeetupFull() exactly.
  if v_meetup.max_attendees is not null and (v_existing_count + 2) > v_meetup.max_attendees then
    raise exception 'meetup is fully booked';
  end if;

  insert into public.meetup_attendees (meetup_id, user_id) values (p_meetup_id, auth.uid());

  select array_agg(user_id) into v_attendee_ids from public.meetup_attendees where meetup_id = p_meetup_id;

  return jsonb_build_object('attendee_ids', coalesce(to_jsonb(v_attendee_ids), '[]'::jsonb));
end;
$$;

revoke all on function public.join_meetup(uuid) from public;
grant execute on function public.join_meetup(uuid) to authenticated;
