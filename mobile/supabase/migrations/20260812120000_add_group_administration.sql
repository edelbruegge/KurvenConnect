-- 20260812120000_add_group_administration.sql
--
-- Secure group administration: editing group info, member removal, promoting/demoting admins, and
-- ownership transfer. The two already-executed group migrations
-- (20260808120000_create_groups_and_memberships.sql, 20260811120000_create_group_messages.sql)
-- are completely untouched — this migration only adds new RPCs (plus one, single, backward-
-- compatible extension of the already-existing join_public_group) and a realtime publication
-- addition for public.groups. No new tables, no data deletion.
--
-- Role model enforced entirely server-side (client-side button hiding is UI only, never a security
-- boundary):
--   Owner  = groups.owner_id. Exactly one. Always also has group_members.role = 'admin'.
--   Admin  = group_members.role = 'admin' AND user_id <> groups.owner_id.
--   Member = group_members.role = 'member'.
-- MVP decision: only the owner manages admin roles (promote/demote) and ownership transfer.
-- Admins may edit the group and remove ordinary members, but may never touch other admins/the
-- owner, and can never make themselves (or anyone else) the owner.
--
-- Intended to run once against a Supabase project, after the two migrations above. Safe to re-run:
-- every function is `create or replace` (same signature/return type in every case, including
-- join_public_group), and the realtime publication addition is guarded by an existence check.

-- ---------------------------------------------------------------------------------------------
-- update_group — owner or admin. owner_id is not a parameter and can never be changed here;
-- ownership transfer has its own, separately-guarded function below.
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

  if p_visibility not in ('public', 'private') then
    raise exception 'invalid visibility';
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
-- join_public_group — extended (same signature/return type, safe to redefine): after a successful
-- direct join, if the joining user already had their own pending request for this same group
-- (possible if the group was private and became public since they applied), that stale request is
-- now controlled-resolved to 'accepted' instead of being left dangling forever. No duplicate
-- membership is possible either way (group_members' primary key + the on conflict do nothing
-- below already guarantee that).
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

  update public.group_join_requests
  set status = 'accepted', reviewed_by = v_group.owner_id, reviewed_at = now()
  where group_id = p_group_id and requester_id = v_self and status = 'pending';

  select * into v_member from public.group_members where group_id = p_group_id and user_id = v_self;

  return v_member;
end;
$$;

revoke all on function public.join_public_group(uuid) from public;
revoke all on function public.join_public_group(uuid) from anon;
grant execute on function public.join_public_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- remove_group_member — owner may remove anyone except themselves; an admin (who is not the
-- owner) may only remove ordinary members. Never deletes group_messages/group_message_reads/
-- group_join_requests — chat history is untouched.
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
    -- Owner: may remove any non-owner member, admin or not.
    null;
  elsif public.is_group_admin(p_group_id) then
    -- Admin (not owner): only ordinary members.
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
end;
$$;

revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.remove_group_member(uuid, uuid) from anon;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- promote_group_member — owner only.
-- ---------------------------------------------------------------------------------------------

create or replace function public.promote_group_member(p_group_id uuid, p_user_id uuid)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_target_role text;
  v_member public.group_members;
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

  if p_user_id = v_group.owner_id then
    raise exception 'target is owner';
  end if;

  select role into v_target_role from public.group_members where group_id = p_group_id and user_id = p_user_id;

  if v_target_role is null then
    raise exception 'target not a member';
  end if;

  if v_target_role = 'admin' then
    raise exception 'target already admin';
  end if;

  update public.group_members
  set role = 'admin'
  where group_id = p_group_id and user_id = p_user_id
  returning * into v_member;

  return v_member;
end;
$$;

revoke all on function public.promote_group_member(uuid, uuid) from public;
revoke all on function public.promote_group_member(uuid, uuid) from anon;
grant execute on function public.promote_group_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- demote_group_admin — owner only. Membership and chat access are untouched, only the role
-- column changes.
-- ---------------------------------------------------------------------------------------------

create or replace function public.demote_group_admin(p_group_id uuid, p_user_id uuid)
returns public.group_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
  v_target_role text;
  v_member public.group_members;
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

  if p_user_id = v_group.owner_id then
    raise exception 'cannot demote owner';
  end if;

  select role into v_target_role from public.group_members where group_id = p_group_id and user_id = p_user_id;

  if v_target_role is null then
    raise exception 'target not a member';
  end if;

  if v_target_role <> 'admin' then
    raise exception 'target not admin';
  end if;

  update public.group_members
  set role = 'member'
  where group_id = p_group_id and user_id = p_user_id
  returning * into v_member;

  return v_member;
end;
$$;

revoke all on function public.demote_group_admin(uuid, uuid) from public;
revoke all on function public.demote_group_admin(uuid, uuid) from anon;
grant execute on function public.demote_group_admin(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- transfer_group_ownership — owner only, atomic. `for update` locks the group row for the
-- duration of the transaction so a concurrent transfer attempt has to wait rather than race.
-- There is no point at which the group has zero or two owners: owner_id is a single column on a
-- single row, updated exactly once.
-- ---------------------------------------------------------------------------------------------

create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_group public.groups;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_group from public.groups where id = p_group_id for update;

  if not found then
    raise exception 'group not found';
  end if;

  if v_group.owner_id <> v_self then
    raise exception 'not the group owner';
  end if;

  if p_new_owner_id = v_self then
    raise exception 'cannot transfer to yourself';
  end if;

  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_new_owner_id) then
    raise exception 'target not a member';
  end if;

  update public.group_members
  set role = 'admin'
  where group_id = p_group_id and user_id = p_new_owner_id;

  -- The previous owner already has role = 'admin' (guaranteed since group creation / by this same
  -- function on every prior transfer) — no further action needed for them.

  update public.groups
  set owner_id = p_new_owner_id, updated_at = now()
  where id = p_group_id
  returning * into v_group;

  return v_group;
end;
$$;

revoke all on function public.transfer_group_ownership(uuid, uuid) from public;
revoke all on function public.transfer_group_ownership(uuid, uuid) from anon;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime: public.groups. RLS already scopes SELECT to "members of the group or a pending
-- requester" — Realtime authorizes postgres_changes delivery via that same policy, so adding this
-- table to the publication is safe without any policy change (same reasoning already applied to
-- group_members/group_join_requests/group_messages in the two prior group migrations).
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;
end
$$;
