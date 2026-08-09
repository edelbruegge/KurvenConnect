-- 20260808120000_create_groups_and_memberships.sql
--
-- Persistent groups, group memberships, and join requests. Local seed groups
-- (data/groups.ts) are completely untouched and keep working exactly as before — this migration
-- only adds a parallel, RLS-protected structure for real Supabase-backed groups.
--
-- Group chat persistence, invite links, and file attachments are all separate future steps.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`), as one
-- single script from a clean starting state (none of public.groups/public.group_members/
-- public.group_join_requests existing yet). Safe to re-run: table creation uses `if not exists`,
-- every policy/function/trigger is dropped with `if exists` / `create or replace` immediately
-- before being recreated, and the realtime publication additions at the very end are guarded by
-- an existence check.
--
-- Ordering is deliberate and load-bearing, not cosmetic: public.groups/public.group_members/
-- public.group_join_requests are created first (with their constraints and indexes), before
-- anything — trigger, helper function, or RPC — that declares `returns public.groups` /
-- `returns public.group_members` / `returns public.group_join_requests` or otherwise references
-- these tables. A composite row type for a table (which is what `returns public.groups` resolves
-- to) does not exist until `create table` for that table has actually run, and
-- `check_function_bodies` (on by default) validates a function's declared return type and the
-- objects its body references at CREATE FUNCTION time — defining such a function before its
-- table exists fails with `ERROR: 42704: type "public.groups" does not exist`. Keep every new
-- addition to this file below the three `create table` statements.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  name text not null,
  description text,
  visibility text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_not_blank check (length(trim(name)) > 0),
  constraint groups_name_max_length check (length(name) <= 100),
  constraint groups_description_max_length check (description is null or length(description) <= 2000),
  constraint groups_visibility_check check (visibility in ('public', 'private'))
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_members_role_check check (role in ('admin', 'member'))
);

create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  constraint group_join_requests_status_check check (status in ('pending', 'accepted', 'rejected', 'cancelled'))
);

-- Only one open (pending) request per requester per group at a time — same partial-index pattern
-- already used for trip_requests/reports.
create unique index if not exists group_join_requests_unique_pending_per_requester
  on public.group_join_requests (group_id, requester_id)
  where status = 'pending';

create index if not exists groups_owner_id_idx on public.groups (owner_id);
create index if not exists group_members_user_id_idx on public.group_members (user_id);
create index if not exists group_join_requests_group_id_idx on public.group_join_requests (group_id);
create index if not exists group_join_requests_requester_id_idx on public.group_join_requests (requester_id);
create index if not exists group_join_requests_status_idx on public.group_join_requests (status);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_join_requests enable row level security;

-- Keep updated_at current, reusing the same trigger function already defined for
-- profiles/posts/trips/meetups/wanted_entries.
drop trigger if exists set_groups_updated_at on public.groups;
create trigger set_groups_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

-- Guarantees "the owner of a group must be stored as an admin member" regardless of how the group
-- row was created (in this step: manually via the SQL editor) — a safety net, not a workaround.
create or replace function public.add_group_owner_as_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'admin')
  on conflict (group_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists add_group_owner_as_admin_trigger on public.groups;
create trigger add_group_owner_as_admin_trigger
  after insert on public.groups
  for each row execute function public.add_group_owner_as_admin();

-- ---------------------------------------------------------------------------------------------
-- Membership helpers, SECURITY DEFINER so they bypass group_members' own RLS when called from a
-- policy — this is what keeps the policies below from being recursive (same reasoning as
-- is_conversation_member in 20260804100000_create_conversations_and_messages.sql): none of them
-- ever query their own (or another RLS-protected) table directly inside their USING clause.
-- ---------------------------------------------------------------------------------------------

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_member(uuid) from anon;
grant execute on function public.is_group_member(uuid) to authenticated;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_group_admin(uuid) from public;
revoke all on function public.is_group_admin(uuid) from anon;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------------------------

-- groups: members can read their own groups; a requester with a pending join request can also
-- read the group they applied to (needed so "Ausstehende Anfragen" can show the group's name)
-- without granting general table access. No INSERT/UPDATE/DELETE for authenticated — groups are
-- only ever created manually in this step.
drop policy if exists "Members and pending requesters can read groups" on public.groups;
create policy "Members and pending requesters can read groups"
  on public.groups
  for select
  to authenticated
  using (
    public.is_group_member(id)
    or exists (
      select 1 from public.group_join_requests gjr
      where gjr.group_id = groups.id and gjr.requester_id = auth.uid() and gjr.status = 'pending'
    )
  );

revoke all on public.groups from anon;
grant select on public.groups to authenticated;
revoke insert, update, delete on public.groups from authenticated;

-- group_members: members can see the member list of their own groups. No INSERT/UPDATE/DELETE for
-- authenticated — memberships are only ever created/removed through the functions below.
drop policy if exists "Members can read their groups' membership" on public.group_members;
create policy "Members can read their groups' membership"
  on public.group_members
  for select
  to authenticated
  using (public.is_group_member(group_id));

revoke all on public.group_members from anon;
grant select on public.group_members to authenticated;
revoke insert, update, delete on public.group_members from authenticated;

-- group_join_requests: a requester reads their own requests; a group admin reads requests against
-- their own group. Two permissive policies, correctly additive — neither is unconditionally true.
-- No INSERT/UPDATE/DELETE for authenticated — writes only through the functions below.
drop policy if exists "Requesters can read their own join requests" on public.group_join_requests;
create policy "Requesters can read their own join requests"
  on public.group_join_requests
  for select
  to authenticated
  using (requester_id = auth.uid());

drop policy if exists "Group admins can read join requests for their groups" on public.group_join_requests;
create policy "Group admins can read join requests for their groups"
  on public.group_join_requests
  for select
  to authenticated
  using (public.is_group_admin(group_id));

revoke all on public.group_join_requests from anon;
grant select on public.group_join_requests to authenticated;
revoke insert, update, delete on public.group_join_requests from authenticated;

-- ---------------------------------------------------------------------------------------------
-- create_group — the owner is automatically inserted as an 'admin' member by the
-- add_group_owner_as_admin AFTER INSERT trigger above, regardless of how the row is created, so
-- no extra membership insert is needed here.
-- ---------------------------------------------------------------------------------------------

create or replace function public.create_group(p_name text, p_description text, p_visibility text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_name text;
  v_description text;
  v_group public.groups;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');

  if v_name is null then
    raise exception 'invalid name';
  end if;

  if length(v_name) > 100 then
    raise exception 'name too long';
  end if;

  v_description := nullif(trim(coalesce(p_description, '')), '');

  if v_description is not null and length(v_description) > 2000 then
    raise exception 'description too long';
  end if;

  if p_visibility not in ('public', 'private') then
    raise exception 'invalid visibility';
  end if;

  insert into public.groups (owner_id, name, description, visibility)
  values (v_self, v_name, v_description, p_visibility)
  returning * into v_group;

  return v_group;
end;
$$;

revoke all on function public.create_group(text, text, text) from public;
revoke all on function public.create_group(text, text, text) from anon;
grant execute on function public.create_group(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- join_public_group
-- ---------------------------------------------------------------------------------------------

create or replace function public.join_public_group(p_group_id uuid)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_member public.group_members;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  if v_group.visibility <> 'public' then
    raise exception 'group is private';
  end if;

  if public.are_users_blocked(v_self, v_group.owner_id) then
    raise exception 'blocked: cannot join a group owned by a blocked user';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (p_group_id, v_self, 'member')
  on conflict (group_id, user_id) do nothing;

  select * into v_member from public.group_members where group_id = p_group_id and user_id = v_self;

  return v_member;
end;
$$;

revoke all on function public.join_public_group(uuid) from public;
revoke all on function public.join_public_group(uuid) from anon;
grant execute on function public.join_public_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- request_private_group_join
-- ---------------------------------------------------------------------------------------------

create or replace function public.request_private_group_join(p_group_id uuid)
returns public.group_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_request public.group_join_requests;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  if v_group.visibility <> 'private' then
    raise exception 'group is public';
  end if;

  if public.is_group_member(p_group_id) then
    raise exception 'already a member';
  end if;

  if public.are_users_blocked(v_self, v_group.owner_id) then
    raise exception 'blocked: cannot request to join a group owned by a blocked user';
  end if;

  if exists (
    select 1 from public.group_join_requests
    where group_id = p_group_id and requester_id = v_self and status = 'pending'
  ) then
    raise exception 'request already exists';
  end if;

  insert into public.group_join_requests (group_id, requester_id, status)
  values (p_group_id, v_self, 'pending')
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.request_private_group_join(uuid) from public;
revoke all on function public.request_private_group_join(uuid) from anon;
grant execute on function public.request_private_group_join(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- manage_group_join_request
-- ---------------------------------------------------------------------------------------------

create or replace function public.manage_group_join_request(p_request_id uuid, p_action text)
returns public.group_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_request public.group_join_requests;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_action not in ('accept', 'reject') then
    raise exception 'invalid action';
  end if;

  select * into v_request from public.group_join_requests where id = p_request_id for update;

  if not found then
    raise exception 'request not found';
  end if;

  if not public.is_group_admin(v_request.group_id) then
    raise exception 'not a group admin';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'request already reviewed';
  end if;

  if p_action = 'accept' then
    insert into public.group_members (group_id, user_id, role)
    values (v_request.group_id, v_request.requester_id, 'member')
    on conflict (group_id, user_id) do nothing;

    update public.group_join_requests
    set status = 'accepted', reviewed_by = v_self, reviewed_at = now()
    where id = p_request_id
    returning * into v_request;
  else
    update public.group_join_requests
    set status = 'rejected', reviewed_by = v_self, reviewed_at = now()
    where id = p_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;

revoke all on function public.manage_group_join_request(uuid, text) from public;
revoke all on function public.manage_group_join_request(uuid, text) from anon;
grant execute on function public.manage_group_join_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- cancel_group_join_request
-- ---------------------------------------------------------------------------------------------

create or replace function public.cancel_group_join_request(p_request_id uuid)
returns public.group_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_request public.group_join_requests;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request from public.group_join_requests where id = p_request_id and requester_id = v_self for update;

  if not found then
    raise exception 'request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'request already reviewed';
  end if;

  update public.group_join_requests
  set status = 'cancelled'
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.cancel_group_join_request(uuid) from public;
revoke all on function public.cancel_group_join_request(uuid) from anon;
grant execute on function public.cancel_group_join_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- leave_group
-- ---------------------------------------------------------------------------------------------

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_deleted_count integer;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  if v_group.owner_id = v_self then
    raise exception 'owner cannot leave the group';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = v_self;
  get diagnostics v_deleted_count = row_count;

  if v_deleted_count = 0 then
    raise exception 'not a member';
  end if;
end;
$$;

revoke all on function public.leave_group(uuid) from public;
revoke all on function public.leave_group(uuid) from anon;
grant execute on function public.leave_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_my_groups
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_my_groups()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  my_role text,
  member_count bigint
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
      (select count(*) from public.group_members gm2 where gm2.group_id = g.id) as member_count
    from public.groups g
    join public.group_members gm on gm.group_id = g.id and gm.user_id = v_self
    order by g.updated_at desc;
end;
$$;

revoke all on function public.get_my_groups() from public;
revoke all on function public.get_my_groups() from anon;
grant execute on function public.get_my_groups() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_group_suggestions
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_group_suggestions(p_limit integer default 5)
returns table (
  id uuid,
  name text,
  description text,
  visibility text,
  member_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  return query
    select
      g.id, g.name, g.description, g.visibility,
      (select count(*) from public.group_members gm2 where gm2.group_id = g.id) as member_count
    from public.groups g
    where not exists (select 1 from public.group_members gm where gm.group_id = g.id and gm.user_id = v_self)
      and not public.are_users_blocked(v_self, g.owner_id)
    order by g.created_at desc
    limit v_limit;
end;
$$;

revoke all on function public.get_group_suggestions(integer) from public;
revoke all on function public.get_group_suggestions(integer) from anon;
grant execute on function public.get_group_suggestions(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_group_detail — a targeted, single-group fetch for a member; a non-member gets a
-- distinguishable 'not a member' error (mapped client-side to "Du bist kein Mitglied dieser
-- Gruppe.") rather than a generic not-found, without exposing any group data to them.
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_group_detail(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_my_role text;
  v_member_count bigint;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  select role into v_my_role from public.group_members where group_id = p_group_id and user_id = v_self;

  if v_my_role is null then
    raise exception 'not a member';
  end if;

  select count(*) into v_member_count from public.group_members where group_id = p_group_id;

  return jsonb_build_object(
    'id', v_group.id,
    'owner_id', v_group.owner_id,
    'name', v_group.name,
    'description', v_group.description,
    'visibility', v_group.visibility,
    'created_at', v_group.created_at,
    'updated_at', v_group.updated_at,
    'my_role', v_my_role,
    'member_count', v_member_count
  );
end;
$$;

revoke all on function public.get_group_detail(uuid) from public;
revoke all on function public.get_group_detail(uuid) from anon;
grant execute on function public.get_group_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime: group_members + group_join_requests. Placed last, after every table/function/policy
-- above already exists. Both tables keep exactly the same RLS SELECT policies defined earlier in
-- this file (scoped to "my own groups' membership"/"my own requests"/"requests for groups I
-- admin") — Realtime authorizes postgres_changes delivery via those same policies, so adding
-- these two tables to the publication is safe without any policy change (same reasoning already
-- applied to content_restrictions/user_warnings in
-- 20260807150000_fix_moderation_visibility_and_realtime.sql).
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_join_requests'
  ) then
    alter publication supabase_realtime add table public.group_join_requests;
  end if;
end
$$;
