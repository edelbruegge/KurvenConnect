-- 20260811120000_create_group_messages.sql
--
-- Persistent group chat messages and per-user read state. Direct 1:1 conversations/messages
-- (20260804100000_create_conversations_and_messages.sql) and groups/memberships
-- (20260808120000_create_groups_and_memberships.sql) are completely untouched — this migration
-- only adds a parallel structure for messages *within* a group, plus a necessary extension of
-- get_my_groups() to surface a last-message preview and unread count per group.
--
-- File attachments, editing/deleting messages, reactions, threads, @mentions, presence, and push
-- notifications for group messages are all separate future steps.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`), as one
-- single script, after 20260808120000_create_groups_and_memberships.sql has already run (this file
-- references public.groups/public.is_group_member, both defined there). Safe to re-run: table
-- creation uses `if not exists`, every policy/function/trigger is dropped with `if exists` /
-- `create or replace` immediately before being recreated, and the realtime publication addition is
-- guarded by an existence check. get_my_groups() is the one exception — its return type changes
-- (new columns), and Postgres does not allow `create or replace function` to change an existing
-- function's return type, so it is dropped and recreated here.

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  -- Optional, client-generated idempotency token: lets send_group_message() safely be retried
  -- (e.g. after a network hiccup where the insert succeeded but the response never arrived)
  -- without creating a duplicate message. NULL values never collide with each other in a unique
  -- constraint, so omitting it (as direct-message-style raw inserts do) is unaffected.
  client_message_id uuid,
  created_at timestamptz not null default now(),
  constraint group_messages_body_not_blank check (length(trim(body)) > 0),
  constraint group_messages_body_max_length check (length(body) <= 2000),
  constraint group_messages_sender_client_unique unique (sender_id, client_message_id)
);

create index if not exists group_messages_group_id_created_at_idx
  on public.group_messages (group_id, created_at desc);
create index if not exists group_messages_sender_id_idx on public.group_messages (sender_id);

-- One row per (group, user) — "how far this user has read in this group's chat". Never exposes
-- another member's read state (no per-message read receipts, no "X hat gelesen").
create table if not exists public.group_message_reads (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_messages enable row level security;
alter table public.group_message_reads enable row level security;

-- ---------------------------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------------------------

-- group_messages: only current members of the group can read its messages. No INSERT/UPDATE/
-- DELETE policy at all — writing is exclusively through send_group_message() (SECURITY DEFINER,
-- below), which performs its own membership/validation checks and bypasses RLS internally. This is
-- a deliberate RPC-only write path (no direct-insert policy, unlike the older
-- conversation_members/messages pattern) so every write goes through one validated, idempotent
-- entry point.
drop policy if exists "Members can read group messages" on public.group_messages;
create policy "Members can read group messages"
  on public.group_messages
  for select
  to authenticated
  using (public.is_group_member(group_id));

revoke all on public.group_messages from anon;
grant select on public.group_messages to authenticated;
revoke insert, update, delete on public.group_messages from authenticated;

-- group_message_reads: a user can only ever read their own read state — never a fellow member's.
-- No INSERT/UPDATE/DELETE policy — writing is exclusively through mark_group_read() below.
drop policy if exists "Users can read their own group read state" on public.group_message_reads;
create policy "Users can read their own group read state"
  on public.group_message_reads
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.group_message_reads from anon;
grant select on public.group_message_reads to authenticated;
revoke insert, update, delete on public.group_message_reads from authenticated;

-- ---------------------------------------------------------------------------------------------
-- send_group_message — the only way a group message can be created. sender_id always comes from
-- auth.uid(), never a client-supplied value.
-- ---------------------------------------------------------------------------------------------

create or replace function public.send_group_message(p_group_id uuid, p_body text, p_client_message_id uuid default null)
returns public.group_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_body text;
  v_message public.group_messages;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_group_id is null or not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'group not found';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'not a member';
  end if;

  v_body := nullif(trim(coalesce(p_body, '')), '');

  if v_body is null then
    raise exception 'empty message';
  end if;

  if length(v_body) > 2000 then
    raise exception 'message too long';
  end if;

  if p_client_message_id is not null then
    insert into public.group_messages (group_id, sender_id, body, client_message_id)
    values (p_group_id, v_self, v_body, p_client_message_id)
    on conflict (sender_id, client_message_id) do nothing
    returning * into v_message;

    -- A conflict means this exact (sender, client_message_id) pair was already stored by an
    -- earlier attempt (e.g. a retried request) — return that existing row instead of erroring or
    -- creating a duplicate.
    if v_message.id is null then
      select * into v_message from public.group_messages
      where sender_id = v_self and client_message_id = p_client_message_id;
    end if;
  else
    insert into public.group_messages (group_id, sender_id, body)
    values (p_group_id, v_self, v_body)
    returning * into v_message;
  end if;

  return v_message;
end;
$$;

revoke all on function public.send_group_message(uuid, text, uuid) from public;
revoke all on function public.send_group_message(uuid, text, uuid) from anon;
grant execute on function public.send_group_message(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_group_messages — cursor-paginated history for a single group, newest first. The caller
-- (client) reverses the page to ascending order for display. Never loads the full history at once.
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_group_messages(p_group_id uuid, p_limit integer default 50, p_before timestamptz default null)
returns setof public.group_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'not a member';
  end if;

  return query
    select *
    from public.group_messages
    where group_id = p_group_id
      and (p_before is null or created_at < p_before)
    order by created_at desc
    limit v_limit;
end;
$$;

revoke all on function public.get_group_messages(uuid, integer, timestamptz) from public;
revoke all on function public.get_group_messages(uuid, integer, timestamptz) from anon;
grant execute on function public.get_group_messages(uuid, integer, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- mark_group_read — the only way a user's own group_message_reads row can be written. No
-- parameter for user_id, so a caller can never touch anyone else's read state.
-- ---------------------------------------------------------------------------------------------

create or replace function public.mark_group_read(p_group_id uuid)
returns public.group_message_reads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_read public.group_message_reads;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'not a member';
  end if;

  insert into public.group_message_reads (group_id, user_id, last_read_at, updated_at)
  values (p_group_id, v_self, now(), now())
  on conflict (group_id, user_id) do update
    set last_read_at = excluded.last_read_at, updated_at = excluded.updated_at
  returning * into v_read;

  return v_read;
end;
$$;

revoke all on function public.mark_group_read(uuid) from public;
revoke all on function public.mark_group_read(uuid) from anon;
grant execute on function public.mark_group_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_my_groups — extended with a last-message preview and an unread count per group, computed in
-- a single query (a LEFT JOIN LATERAL for the newest message + a correlated subquery for the
-- unread count — both evaluated per row by the planner, not as N additional round trips from the
-- client) so the "Nachrichten -> Gruppen" list never needs a separate request per group. The
-- function's column set is changing, which `create or replace function` does not allow for an
-- existing function — it is dropped and recreated instead. Sorting now prefers the most recent
-- chat activity, falling back to the group's own updated_at for groups with no messages yet.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.get_my_groups();

create function public.get_my_groups()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  my_role text,
  member_count bigint,
  last_message_body text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  unread_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  return query
    select
      g.id, g.owner_id, g.name, g.description, g.visibility, g.created_at, g.updated_at,
      gm.role as my_role,
      (select count(*) from public.group_members gm2 where gm2.group_id = g.id) as member_count,
      lm.body as last_message_body,
      lm.created_at as last_message_at,
      lm.sender_id as last_message_sender_id,
      (
        select count(*) from public.group_messages gmsg
        where gmsg.group_id = g.id
          and gmsg.sender_id <> v_self
          and gmsg.created_at > coalesce(gmr.last_read_at, 'epoch'::timestamptz)
      ) as unread_count
    from public.groups g
    join public.group_members gm on gm.group_id = g.id and gm.user_id = v_self
    left join public.group_message_reads gmr on gmr.group_id = g.id and gmr.user_id = v_self
    left join lateral (
      select gmsg2.body, gmsg2.created_at, gmsg2.sender_id
      from public.group_messages gmsg2
      where gmsg2.group_id = g.id
      order by gmsg2.created_at desc
      limit 1
    ) lm on true
    order by coalesce(lm.created_at, g.updated_at) desc;
end;
$$;

revoke all on function public.get_my_groups() from public;
revoke all on function public.get_my_groups() from anon;
grant execute on function public.get_my_groups() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime: group_messages. RLS on group_messages already scopes SELECT to "current members of
-- the group" — Realtime authorizes postgres_changes delivery via that same policy, so adding this
-- table to the publication is safe without any policy change (same reasoning already applied to
-- group_members/group_join_requests in 20260808120000_create_groups_and_memberships.sql).
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end
$$;
