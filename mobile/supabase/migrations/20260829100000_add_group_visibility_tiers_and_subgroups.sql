-- 20260829100000_add_group_visibility_tiers_and_subgroups.sql
--
-- Full group management: three independent visibility tiers (public/closed/invite_only, replacing
-- the previous two-tier public/private model) and an independent group structure axis
-- (standalone/parent/subgroup, max one level deep). Analysis first (see final report): every
-- write path to public.groups already goes exclusively through SECURITY DEFINER RPCs (no direct
-- INSERT/UPDATE grant to `authenticated`), so every new business rule below is enforced inside
-- those RPC bodies, matching this project's own established convention (e.g. invite_user_to_group's
-- many checks) rather than a new database trigger.
--
-- Purely additive to existing rows: two new nullable/defaulted columns on public.groups, one data
-- rename (visibility 'private' -> 'closed', the least-destructive mapping -- 'private' groups
-- already only ever supported request-to-join, exactly what 'closed' means now; nothing is made
-- more restricted than it already was), and `create or replace`/`drop+create` on existing
-- functions with the exact same call sites still working (create_group/update_group/
-- get_group_suggestions keep their existing required parameters, new ones are optional/trailing).
-- No existing group, membership, message, join request, or invitation is deleted.
--
-- Not run remotely as part of this step.

-- ---------------------------------------------------------------------------------------------
-- public.groups: group_type + parent_group_id, and the visibility rename/widen.
-- ---------------------------------------------------------------------------------------------

alter table public.groups add column if not exists group_type text not null default 'standalone';
alter table public.groups add column if not exists parent_group_id uuid references public.groups (id);

-- Existing groups: 'private' meant "not directly joinable, request required" -- exactly what
-- 'closed' means below. Mapping to 'invite_only' would have silently made every existing private
-- group MORE restricted (losing the join-request capability it already had), which Vorgabe 38
-- explicitly forbids. 'public' groups and the two new columns' defaults already need no backfill
-- (group_type/parent_group_id already default to 'standalone'/NULL for every existing row).
update public.groups set visibility = 'closed' where visibility = 'private';

alter table public.groups drop constraint if exists groups_visibility_check;
alter table public.groups add constraint groups_visibility_check check (visibility in ('public', 'closed', 'invite_only'));

alter table public.groups drop constraint if exists groups_group_type_check;
alter table public.groups add constraint groups_group_type_check check (group_type in ('standalone', 'parent', 'subgroup'));

-- A subgroup always has a parent; a standalone/parent group never does. Cross-row rules (parent
-- must itself be group_type='parent', max one level deep, privacy inheritance) cannot be plain
-- CHECK constraints and are enforced in create_group/update_group/set_group_type below instead.
alter table public.groups drop constraint if exists groups_subgroup_requires_parent;
alter table public.groups add constraint groups_subgroup_requires_parent check (
  (group_type = 'subgroup' and parent_group_id is not null) or (group_type <> 'subgroup' and parent_group_id is null)
);

create index if not exists groups_parent_group_id_idx on public.groups (parent_group_id);

-- ---------------------------------------------------------------------------------------------
-- group_visibility_rank -- public < closed < invite_only, the single shared definition of "more
-- protected than" used by every inheritance check below. Never duplicated as a CASE expression at
-- each call site.
-- ---------------------------------------------------------------------------------------------

create or replace function public.group_visibility_rank(p_visibility text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_visibility
    when 'public' then 0
    when 'closed' then 1
    when 'invite_only' then 2
    else null
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- create_group -- extended with p_group_type/p_parent_group_id (both optional, trailing -- every
-- existing call site keeps working unchanged). Subgroup creation requires: parent exists, parent
-- is itself group_type='parent' (max one level deep -- Vorgabe 7), caller is owner/admin of the
-- parent (is_group_admin(), reused unchanged), and the chosen visibility is at least as protected
-- as the parent's (privacy inheritance -- Vorgabe 8). The creator becomes the subgroup's own
-- owner/admin via the existing add_group_owner_as_admin trigger, same as any other new group --
-- parent members are never auto-added (Vorgabe 11).
-- ---------------------------------------------------------------------------------------------

create or replace function public.create_group(
  p_name text,
  p_description text,
  p_visibility text,
  p_team_id text default null,
  p_group_type text default 'standalone',
  p_parent_group_id uuid default null
)
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
  v_parent public.groups;
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

  if p_visibility not in ('public', 'closed', 'invite_only') then
    raise exception 'invalid visibility';
  end if;

  if p_group_type not in ('standalone', 'parent', 'subgroup') then
    raise exception 'invalid group type';
  end if;

  if p_group_type = 'subgroup' then
    if p_parent_group_id is null then
      raise exception 'parent group is required';
    end if;

    select * into v_parent from public.groups where id = p_parent_group_id;

    if not found then
      raise exception 'parent group not found';
    end if;

    if v_parent.group_type <> 'parent' then
      raise exception 'parent is not a main group';
    end if;

    if not public.is_group_admin(p_parent_group_id) then
      raise exception 'not authorized for parent group';
    end if;

    if public.group_visibility_rank(p_visibility) < public.group_visibility_rank(v_parent.visibility) then
      raise exception 'subgroup less protected than parent';
    end if;
  elsif p_parent_group_id is not null then
    raise exception 'parent group only allowed for subgroups';
  end if;

  insert into public.groups (owner_id, name, description, visibility, team_id, group_type, parent_group_id)
  values (v_self, v_name, v_description, p_visibility, nullif(trim(coalesce(p_team_id, '')), ''), p_group_type, p_parent_group_id)
  returning * into v_group;

  return v_group;
end;
$$;

revoke all on function public.create_group(text, text, text, text, text, uuid) from public;
revoke all on function public.create_group(text, text, text, text, text, uuid) from anon;
grant execute on function public.create_group(text, text, text, text, text, uuid) to authenticated;

-- The now-superseded 4-arg overload becomes unreachable from the client after this migration (the
-- client always calls the 6-arg form now), dropped explicitly so it can never be called with the
-- old, structure-less behavior by mistake -- same reasoning already applied to
-- get_group_suggestions(integer) in 20260821100000_add_team_scope_to_content.sql.
drop function if exists public.create_group(text, text, text, text);

-- ---------------------------------------------------------------------------------------------
-- update_group -- same signature (fully backward compatible), widened visibility values, plus
-- privacy-inheritance validation whenever visibility actually changes (Vorgabe 20): a parent group
-- may not become more protected than its least-protected subgroup, and a subgroup may not become
-- less protected than its parent. Rejected with a clear reason, never silently cascades a change
-- to other rows.
-- ---------------------------------------------------------------------------------------------

create or replace function public.update_group(p_group_id uuid, p_name text, p_description text, p_visibility text)
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
  v_min_subgroup_rank integer;
  v_parent_rank integer;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  if not public.is_group_admin(p_group_id) then
    raise exception 'not authorized';
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

  if p_visibility not in ('public', 'closed', 'invite_only') then
    raise exception 'invalid visibility';
  end if;

  if p_visibility <> v_group.visibility then
    if v_group.group_type = 'parent' then
      select min(public.group_visibility_rank(g.visibility)) into v_min_subgroup_rank
      from public.groups g
      where g.parent_group_id = p_group_id;

      if v_min_subgroup_rank is not null and public.group_visibility_rank(p_visibility) > v_min_subgroup_rank then
        raise exception 'subgroups less protected';
      end if;
    end if;

    if v_group.group_type = 'subgroup' then
      select public.group_visibility_rank(g.visibility) into v_parent_rank
      from public.groups g
      where g.id = v_group.parent_group_id;

      if v_parent_rank is not null and public.group_visibility_rank(p_visibility) < v_parent_rank then
        raise exception 'less protected than parent';
      end if;
    end if;
  end if;

  update public.groups
  set name = v_name, description = v_description, visibility = p_visibility, updated_at = now()
  where id = p_group_id
  returning * into v_group;

  return v_group;
end;
$$;

revoke all on function public.update_group(uuid, text, text, text) from public;
revoke all on function public.update_group(uuid, text, text, text) from anon;
grant execute on function public.update_group(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- set_group_type -- the only way group_type changes after creation (Vorgabe 21). standalone <->
-- parent only; a subgroup's type can never be changed here (no mechanism to detach it from its
-- parent exists in this step, deliberately -- Vorgabe 36 forbids nested sub-subgroups, and
-- detaching would need its own careful design). parent -> standalone is rejected while any
-- subgroup still references it, so a subgroup can never end up with a dangling/former "parent"
-- whose own type quietly changed underneath it.
-- ---------------------------------------------------------------------------------------------

create or replace function public.set_group_type(p_group_id uuid, p_group_type text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_subgroup_count integer;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_group_type not in ('standalone', 'parent') then
    raise exception 'invalid group type';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  if not public.is_group_admin(p_group_id) then
    raise exception 'not authorized';
  end if;

  if v_group.group_type = 'subgroup' then
    raise exception 'cannot change type of a subgroup';
  end if;

  if v_group.group_type = p_group_type then
    return v_group;
  end if;

  if p_group_type = 'standalone' then
    select count(*) into v_subgroup_count from public.groups where parent_group_id = p_group_id;

    if v_subgroup_count > 0 then
      raise exception 'group has subgroups';
    end if;
  end if;

  update public.groups
  set group_type = p_group_type, updated_at = now()
  where id = p_group_id
  returning * into v_group;

  return v_group;
end;
$$;

revoke all on function public.set_group_type(uuid, text) from public;
revoke all on function public.set_group_type(uuid, text) from anon;
grant execute on function public.set_group_type(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- delete_group -- owner only (Vorgabe 14/16). A parent group with existing subgroups is rejected
-- outright rather than cascade-deleting them, so a subgroup can never disappear as a side effect
-- of deleting its parent. The actual delete relies entirely on the already-existing `on delete
-- cascade` foreign keys from group_members/group_messages/group_message_reads/
-- group_join_requests/group_invitations -- no manual cleanup needed, nothing new to keep in sync.
-- ---------------------------------------------------------------------------------------------

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_subgroup_count integer;
  v_deleted_count integer;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  if v_group.owner_id <> v_self then
    raise exception 'not the group owner';
  end if;

  if v_group.group_type = 'parent' then
    select count(*) into v_subgroup_count from public.groups where parent_group_id = p_group_id;

    if v_subgroup_count > 0 then
      raise exception 'group has subgroups';
    end if;
  end if;

  delete from public.groups where id = p_group_id;
  get diagnostics v_deleted_count = row_count;

  if v_deleted_count = 0 then
    raise exception 'group not found';
  end if;
end;
$$;

revoke all on function public.delete_group(uuid) from public;
revoke all on function public.delete_group(uuid) from anon;
grant execute on function public.delete_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- request_private_group_join -- same function, same table (group_join_requests is reused
-- unchanged, per Vorgabe 27's explicit "prüfe zuerst, ob bestehende Struktur dies bereits
-- unterstützt" -- it already did). Only the visibility check and its error text are updated: a
-- join request is now specifically the 'closed' tier's join path (an 'invite_only' group never
-- accepted requests either, but previously reused the same "group is public" wording, which no
-- longer makes sense for a three-tier model).
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

  if v_group.visibility <> 'closed' then
    raise exception 'group does not accept join requests';
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
-- invite_user_to_group -- same signature, one addition: a subgroup invitation may only target
-- someone who is already a member of the subgroup's parent group (Vorgabe 12 -- the preferred,
-- simpler rule over inventing an implicit parent-join). Every check from the previous step
-- (self-invite, existing membership, existing pending invitation, block in either direction)
-- stays unchanged.
-- ---------------------------------------------------------------------------------------------

create or replace function public.invite_user_to_group(p_group_id uuid, p_invitee_id uuid)
returns public.group_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_inviter_name text;
  v_invitation public.group_invitations;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_invitee_id is null then
    raise exception 'invitee is required';
  end if;

  if p_invitee_id = v_self then
    raise exception 'cannot invite yourself';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  if not public.is_group_admin(p_group_id) then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from public.profiles where id = p_invitee_id) then
    raise exception 'invitee not found';
  end if;

  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_invitee_id) then
    raise exception 'already a member';
  end if;

  if v_group.group_type = 'subgroup' and v_group.parent_group_id is not null then
    if not exists (select 1 from public.group_members where group_id = v_group.parent_group_id and user_id = p_invitee_id) then
      raise exception 'invitee not a member of parent group';
    end if;
  end if;

  if exists (
    select 1 from public.group_invitations
    where group_id = p_group_id and invitee_id = p_invitee_id and status = 'pending'
  ) then
    raise exception 'invitation already pending';
  end if;

  if public.are_users_blocked(v_self, p_invitee_id) then
    raise exception 'blocked: cannot invite a blocked user';
  end if;

  insert into public.group_invitations (group_id, inviter_id, invitee_id, status)
  values (p_group_id, v_self, p_invitee_id, 'pending')
  returning * into v_invitation;

  select nullif(trim(display_name), '') into v_inviter_name from public.profiles where id = v_self;

  perform public.create_notification(
    p_invitee_id,
    v_self,
    'group_invitation',
    'Gruppeneinladung',
    coalesce(v_inviter_name, 'Ein Mitglied') || ' hat dich in „' || v_group.name || '“ eingeladen.',
    'group',
    p_group_id::text,
    'group_invitation:' || v_invitation.id::text
  );

  return v_invitation;
end;
$$;

revoke all on function public.invite_user_to_group(uuid, uuid) from public;
revoke all on function public.invite_user_to_group(uuid, uuid) from anon;
grant execute on function public.invite_user_to_group(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- respond_to_group_invitation -- same signature and lookup shape, one addition: for a subgroup
-- invitation, parent membership is re-verified at accept time too (not just at invite time) --
-- the invitee could have left the parent group in between. Declining is never blocked by this
-- (declining grants nothing, same reasoning already applied to the block check below it).
-- ---------------------------------------------------------------------------------------------

create or replace function public.respond_to_group_invitation(p_group_id uuid, p_response text)
returns public.group_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_invitation public.group_invitations;
  v_group public.groups;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_response not in ('accepted', 'declined') then
    raise exception 'invalid response';
  end if;

  select * into v_invitation
  from public.group_invitations
  where group_id = p_group_id and invitee_id = v_self and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'invitation not found';
  end if;

  if p_response = 'accepted' then
    if public.are_users_blocked(v_invitation.inviter_id, v_self) then
      raise exception 'blocked: cannot accept this invitation';
    end if;

    select * into v_group from public.groups where id = p_group_id;

    if v_group.group_type = 'subgroup' and v_group.parent_group_id is not null then
      if not exists (select 1 from public.group_members where group_id = v_group.parent_group_id and user_id = v_self) then
        raise exception 'not a member of parent group';
      end if;
    end if;

    insert into public.group_members (group_id, user_id, role)
    values (p_group_id, v_self, 'member')
    on conflict (group_id, user_id) do nothing;
  end if;

  update public.group_invitations
  set status = p_response, responded_at = now()
  where id = v_invitation.id
  returning * into v_invitation;

  return v_invitation;
end;
$$;

revoke all on function public.respond_to_group_invitation(uuid, text) from public;
revoke all on function public.respond_to_group_invitation(uuid, text) from anon;
grant execute on function public.respond_to_group_invitation(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- leave_group -- same signature, one addition: leaving a parent group also removes membership
-- from all of its subgroups (Vorgabe 13/17), in the same function call/transaction as leaving the
-- parent itself -- no orphaned subgroup memberships. Owner-cannot-leave guard unchanged.
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

  if v_group.group_type = 'parent' then
    delete from public.group_members
    where user_id = v_self
      and group_id in (select id from public.groups where parent_group_id = p_group_id);
  end if;
end;
$$;

revoke all on function public.leave_group(uuid) from public;
revoke all on function public.leave_group(uuid) from anon;
grant execute on function public.leave_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- remove_group_member -- re-declared from its latest version (20260813120000_add_group_
-- notifications.sql, which added the group_member_removed notification -- kept verbatim below),
-- with the same parent->subgroups cascade as leave_group above (Vorgabe 17). Every existing
-- authorization check (owner may remove any non-owner, admin may only remove ordinary members,
-- cannot remove self/owner) is unchanged.
-- ---------------------------------------------------------------------------------------------

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_target_role text;
  v_deleted_count integer;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  if p_user_id = v_self then
    raise exception 'use leave_group instead';
  end if;

  if p_user_id = v_group.owner_id then
    raise exception 'cannot remove owner';
  end if;

  select role into v_target_role from public.group_members where group_id = p_group_id and user_id = p_user_id;

  if v_target_role is null then
    raise exception 'target not a member';
  end if;

  if v_self = v_group.owner_id then
    null;
  elsif public.is_group_admin(p_group_id) then
    if v_target_role = 'admin' then
      raise exception 'not authorized';
    end if;
  else
    raise exception 'not authorized';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
  get diagnostics v_deleted_count = row_count;

  if v_deleted_count = 0 then
    raise exception 'target not a member';
  end if;

  if v_group.group_type = 'parent' then
    delete from public.group_members
    where user_id = p_user_id
      and group_id in (select id from public.groups where parent_group_id = p_group_id);
  end if;

  perform public.create_notification(
    p_user_id,
    v_self,
    'group_member_removed',
    'Gruppenmitgliedschaft beendet',
    'Du wurdest aus ' || v_group.name || ' entfernt.',
    'group',
    p_group_id::text,
    'group_member_removed:' || p_group_id::text || ':' || p_user_id::text || ':' || clock_timestamp()::text
  );
end;
$$;

revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.remove_group_member(uuid, uuid) from anon;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_group_suggestions -- same signature, widens the visibility filter from 'public' only to
-- 'public'/'closed' (Vorgabe 1/2: both tiers are discoverable; only invite_only stays hidden from
-- discovery). Every other line (team scope, block filter, already-a-member exclusion) unchanged
-- from the version already fixed in 20260828100000_add_group_invitations.sql.
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_group_suggestions(p_limit integer default 5, p_team_id text default null)
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
      and g.visibility in ('public', 'closed')
      and p_team_id is not null
      and g.team_id = p_team_id
    order by g.created_at desc
    limit v_limit;
end;
$$;

revoke all on function public.get_group_suggestions(integer, text) from public;
revoke all on function public.get_group_suggestions(integer, text) from anon;
grant execute on function public.get_group_suggestions(integer, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_group_detail -- the key access-control change (Vorgabe 24). A member still gets full detail
-- (now including group_type/parent_group_id). A non-member of a 'public'/'closed' group now gets a
-- deliberately thin preview (no owner_id, no my_role -- same "never learn the owner's identity
-- through a non-member view" principle already applied to get_group_suggestions'
-- GroupSuggestion), enough to show basic info and a join/request-to-join action, plus whether they
-- already have a pending join request. A non-member of an 'invite_only' group still gets the exact
-- same 'not a member' rejection as before -- fully hidden, zero information leak (Vorgabe 3/24).
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
  v_has_pending_request boolean;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  select role into v_my_role from public.group_members where group_id = p_group_id and user_id = v_self;
  select count(*) into v_member_count from public.group_members where group_id = p_group_id;

  if v_my_role is not null then
    return jsonb_build_object(
      'id', v_group.id,
      'owner_id', v_group.owner_id,
      'name', v_group.name,
      'description', v_group.description,
      'visibility', v_group.visibility,
      'group_type', v_group.group_type,
      'parent_group_id', v_group.parent_group_id,
      'created_at', v_group.created_at,
      'updated_at', v_group.updated_at,
      'my_role', v_my_role,
      'member_count', v_member_count,
      'is_member', true
    );
  end if;

  if v_group.visibility = 'invite_only' then
    raise exception 'not a member';
  end if;

  v_has_pending_request := exists (
    select 1 from public.group_join_requests
    where group_id = p_group_id and requester_id = v_self and status = 'pending'
  );

  return jsonb_build_object(
    'id', v_group.id,
    'name', v_group.name,
    'description', v_group.description,
    'visibility', v_group.visibility,
    'group_type', v_group.group_type,
    'parent_group_id', v_group.parent_group_id,
    'member_count', v_member_count,
    'is_member', false,
    'has_pending_join_request', v_has_pending_request
  );
end;
$$;

revoke all on function public.get_group_detail(uuid) from public;
revoke all on function public.get_group_detail(uuid) from anon;
grant execute on function public.get_group_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_my_groups -- same "drop + create" treatment as its previous return-shape change
-- (20260811120000_create_group_messages.sql), extended with group_type/parent_group_id. Every
-- other column/join/ordering is unchanged from that version.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.get_my_groups();

create function public.get_my_groups()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  visibility text,
  group_type text,
  parent_group_id uuid,
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
      g.id, g.owner_id, g.name, g.description, g.visibility, g.group_type, g.parent_group_id, g.created_at, g.updated_at,
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
-- get_subgroups -- new (Vorgabe 9/14/21). Access to the list itself requires being able to see the
-- parent at all (an invite_only parent's subgroups are exactly as hidden as the parent itself --
-- no leak through this side door). Within an accessible parent, an individual subgroup is included
-- if it is 'public'/'closed' (basic info is meant to be generally visible), or the caller is
-- already a member of that specific subgroup, or the caller administers the parent (management
-- view -- Vorgabe 14 needs owners/admins to see every subgroup regardless of its own visibility).
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_subgroups(p_parent_group_id uuid)
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
  v_parent public.groups;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_parent from public.groups where id = p_parent_group_id;

  if not found then
    raise exception 'group not found';
  end if;

  if v_parent.visibility = 'invite_only' and not public.is_group_member(p_parent_group_id) then
    raise exception 'not a member';
  end if;

  return query
    select
      g.id, g.name, g.description, g.visibility,
      (select count(*) from public.group_members gm2 where gm2.group_id = g.id) as member_count
    from public.groups g
    where g.parent_group_id = p_parent_group_id
      and (
        g.visibility in ('public', 'closed')
        or public.is_group_member(g.id)
        or public.is_group_admin(p_parent_group_id)
      )
    order by g.created_at desc;
end;
$$;

revoke all on function public.get_subgroups(uuid) from public;
revoke all on function public.get_subgroups(uuid) from anon;
grant execute on function public.get_subgroups(uuid) to authenticated;
