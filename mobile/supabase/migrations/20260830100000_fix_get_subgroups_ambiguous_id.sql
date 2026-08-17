-- 20260830100000_fix_get_subgroups_ambiguous_id.sql
--
-- Bugfix only, no schema change. get_subgroups() (20260829100000_add_group_visibility_tiers_and_
-- subgroups.sql) declares `returns table (id uuid, ...)`, which creates an implicit PL/pgSQL OUT
-- variable named `id`. Its body then did `select * into v_parent from public.groups where id =
-- p_parent_group_id`, an unqualified `id` -- ambiguous between that OUT variable and
-- public.groups.id, and failing at call time with 42702 "column reference \"id\" is ambiguous".
-- Confirmed live: viewing any group_type = 'parent' group 400s as soon as its "Untergruppen"
-- section loads. Fixed by qualifying the reference via a table alias. Every other line (parameter
-- list, return shape, visibility checks, ordering) is unchanged from that migration.
--
-- Additive/idempotent: create or replace function. Not run remotely by the assistant.

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

  select * into v_parent from public.groups gp where gp.id = p_parent_group_id;

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
