-- 20260901100000_inherit_subgroup_team_id_from_parent.sql
--
-- A subgroup must belong to the same club as its Hauptgruppe. create_group() (20260829100000_
-- add_group_visibility_tiers_and_subgroups.sql) currently inserts team_id from the raw p_team_id
-- argument for every group type, including subgroups -- the client (context/groups-context.tsx)
-- always sends p_team_id: activeTeamId, i.e. whatever club is currently selected in the UI at the
-- moment of creation, not necessarily the parent's own team_id. Verified: nothing today re-derives
-- team_id from v_parent for the subgroup branch, even though that branch already loads v_parent for
-- its other checks (parent exists, is a 'parent' group, caller is admin, visibility inheritance).
--
-- Fixed server-side (Vorgabe: "serverseitig möglichst konsistent absichern", "nicht activeTeamId...
-- raten") rather than trusting the client to always pass the right value: for group_type =
-- 'subgroup', team_id is now always taken from v_parent.team_id, ignoring whatever p_team_id the
-- client sent. Every other branch (standalone/parent) keeps the exact previous behavior. All
-- existing validation (name/description/visibility/group_type checks, parent-exists, parent-is-
-- main-group, admin-of-parent, visibility-inheritance) is preserved unchanged.
--
-- Does not touch 20260829100000_add_group_visibility_tiers_and_subgroups.sql. Additive only
-- (create or replace function, same signature). No table/data changes. Not run remotely by the
-- assistant.

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
  v_team_id text;
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

    -- Always the parent's own club, never the client-supplied p_team_id (which only ever reflects
    -- whatever club happens to be active in the UI right now) -- a subgroup can never end up under
    -- a Hauptgruppe of a different club this way.
    v_team_id := v_parent.team_id;
  elsif p_parent_group_id is not null then
    raise exception 'parent group only allowed for subgroups';
  else
    v_team_id := nullif(trim(coalesce(p_team_id, '')), '');
  end if;

  insert into public.groups (owner_id, name, description, visibility, team_id, group_type, parent_group_id)
  values (v_self, v_name, v_description, p_visibility, v_team_id, p_group_type, p_parent_group_id)
  returning * into v_group;

  return v_group;
end;
$$;

revoke all on function public.create_group(text, text, text, text, text, uuid) from public;
revoke all on function public.create_group(text, text, text, text, text, uuid) from anon;
grant execute on function public.create_group(text, text, text, text, text, uuid) to authenticated;
