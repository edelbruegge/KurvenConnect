-- 20260906100000_add_group_search_and_rotate_suggestions.sql
--
-- Two additive, independent changes, both requested after beta testing found that groups were only
-- ever discoverable through the "Gruppen für dich" suggestion strip on the Feed tab:
--
-- 1) search_groups(): there was no way to find a group by name at all -- (tabs)/search.tsx already
--    has a real, club-independent user search (search_profiles, 20260822100000_add_fan_discovery.sql)
--    but nothing equivalent for groups. Mirrors that exact function's shape (same limit/offset
--    clamping, same ilike name match, same "not blocked" filter via are_users_blocked), adapted to
--    public.groups: excludes invite_only (Vorgabe 1/2: only public/closed are ever discoverable to a
--    non-member, same visibility filter get_group_suggestions already uses). Deliberately does NOT
--    exclude groups the caller already belongs to (revised after beta testing: an already-a-member
--    exclusion made this a "find a NEW group" search rather than a reliable "find this group by
--    name" search, and was hard for a beta tester to distinguish from an actual bug) -- an added
--    is_member column tells the client whether to offer "Öffnen" or "Beitreten"/"Beitritt anfragen".
--
-- 2) get_group_suggestions(): reduces the default limit from 5 to 3 and switches the ordering from
--    `created_at desc` (always the same newest groups, static) to `order by random()`, so a caller
--    with more than 3 eligible groups sees a different subset each time it's re-fetched -- which,
--    since 2026-08-23's own fix, now happens on every Feed-tab focus. No new client-side rotation
--    logic needed: refetching an already-random query on every focus IS the rotation.
--
-- Neither existing migration file is modified. Safe to re-run -- both functions are `create or
-- replace`, identical in spirit to every other function redefinition in this project.

-- A plain `create or replace` cannot change an existing function's return columns (Postgres error
-- 42P13) -- this only matters if search_groups already exists from an earlier run of this same
-- file without is_member; harmless no-op on a fresh database where it was never created yet.
drop function if exists public.search_groups(text, integer, integer);

create function public.search_groups(p_query text, p_limit integer default 24, p_offset integer default 0)
returns table (
  id uuid,
  name text,
  description text,
  visibility text,
  member_count bigint,
  is_member boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if v_query is null then
    raise exception 'query is required';
  end if;

  -- Unlike get_group_suggestions (a "you might want to join this" recommendation, where excluding
  -- already-a-member groups makes sense), this is a name search -- it must reliably find a real,
  -- visible group regardless of the caller's own membership, exactly like the client's user/post
  -- search already do. is_member tells the client whether to offer "Öffnen" or "Beitreten".
  return query
    select
      g.id, g.name, g.description, g.visibility,
      (select count(*) from public.group_members gm2 where gm2.group_id = g.id) as member_count,
      exists (select 1 from public.group_members gm3 where gm3.group_id = g.id and gm3.user_id = v_self) as is_member
    from public.groups g
    where g.name ilike '%' || v_query || '%'
      and g.visibility in ('public', 'closed')
      and not public.are_users_blocked(v_self, g.owner_id)
    order by g.name asc
    limit v_limit offset v_offset;
end;
$$;

revoke all on function public.search_groups(text, integer, integer) from public;
revoke all on function public.search_groups(text, integer, integer) from anon;
grant execute on function public.search_groups(text, integer, integer) to authenticated;

-- get_group_suggestions -- same body as 20260829100000_add_group_visibility_tiers_and_subgroups.sql
-- (team scope, block filter, already-a-member exclusion, visibility filter all unchanged), only the
-- default limit and ordering change per the file header above.
create or replace function public.get_group_suggestions(p_limit integer default 3, p_team_id text default null)
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
  v_limit integer := least(greatest(coalesce(p_limit, 3), 1), 20);
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
    order by random()
    limit v_limit;
end;
$$;

revoke all on function public.get_group_suggestions(integer, text) from public;
revoke all on function public.get_group_suggestions(integer, text) from anon;
grant execute on function public.get_group_suggestions(integer, text) to authenticated;
