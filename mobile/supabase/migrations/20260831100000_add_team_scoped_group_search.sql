-- 20260831100000_add_team_scoped_group_search.sql
--
-- Two additive changes, both required for the group invite search to find real registered users
-- of the group's own club rather than either the whole world or nobody:
--
-- 1) get_my_groups() and get_group_detail() never returned public.groups.team_id at all, so the
--    client had no way to know which club a remote group belongs to (confirmed: neither function's
--    column list nor jsonb_build_object include it, even though create_group() already stores and
--    even returns team_id on creation). Extended additively -- create or replace / drop+create,
--    same pattern as their own prior extensions in 20260829100000_..., every other column/join/
--    ordering/branch unchanged.
--
-- 2) No existing function combines "search profiles by name" (search_profiles, club-independent)
--    with "profiles of one club" (get_fan_discovery, no text search) -- exactly what the invite
--    search needs (Vorgabe: "denselben favorite_team_id... UND display_name ILIKE"). New
--    search_team_profiles() merges both functions' own logic (same block-filtering via
--    are_users_blocked, same ilike name match, same self-exclusion, same limit/offset clamping) --
--    no new architecture, just the missing combination of two already-established patterns.
--
-- Neither 20260822100000_add_fan_discovery.sql nor 20260829100000_... is modified; both are
-- superseded/extended additively here. Not run remotely by the assistant.

-- --- get_group_detail: add team_id to both the member and non-member preview shapes. ---
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
      'team_id', v_group.team_id,
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
    'team_id', v_group.team_id,
    'member_count', v_member_count,
    'is_member', false,
    'has_pending_join_request', v_has_pending_request
  );
end;
$$;

revoke all on function public.get_group_detail(uuid) from public;
revoke all on function public.get_group_detail(uuid) from anon;
grant execute on function public.get_group_detail(uuid) to authenticated;

-- --- get_my_groups: add team_id column. ---
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
  team_id text,
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
      g.id, g.owner_id, g.name, g.description, g.visibility, g.group_type, g.parent_group_id, g.team_id, g.created_at, g.updated_at,
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

-- --- search_team_profiles: search_profiles' name match + get_fan_discovery's team filter. ---
create or replace function public.search_team_profiles(p_team_id text, p_query text, p_limit integer default 24, p_offset integer default 0)
returns table (
  id uuid,
  display_name text,
  club text,
  location text,
  bio text,
  avatar_url text,
  created_at timestamptz
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

  if p_team_id is null or length(trim(p_team_id)) = 0 then
    raise exception 'team id is required';
  end if;

  if v_query is null then
    raise exception 'query is required';
  end if;

  return query
    select p.id, p.display_name, p.club, p.location, p.bio, p.avatar_url, p.created_at
    from public.profiles p
    where p.favorite_team_id = p_team_id
      and p.display_name ilike '%' || v_query || '%'
      and p.id <> v_self
      and not public.are_users_blocked(v_self, p.id)
    order by p.display_name asc
    limit v_limit offset v_offset;
end;
$$;

revoke all on function public.search_team_profiles(text, text, integer, integer) from public;
revoke all on function public.search_team_profiles(text, text, integer, integer) from anon;
grant execute on function public.search_team_profiles(text, text, integer, integer) to authenticated;
