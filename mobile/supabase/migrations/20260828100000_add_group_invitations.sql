-- 20260828100000_add_group_invitations.sql
--
-- Private groups + persistent group invitations + invitation notifications. Analysis first (see
-- final report): public.groups already has a NOT NULL `visibility` column
-- ('public'/'private', 20260808120000_create_groups_and_memberships.sql) -- nothing to add there.
-- group_members is already the sole membership table and stays the sole source of truth here too.
-- public.group_join_requests already exists as a *different*, complementary flow (a user requests
-- to join a private group they already know the id of; owner/admin approves) -- this migration adds
-- the missing *inverse* direction (owner/admin proactively invites a specific user; invitee accepts/
-- declines), not a second copy of the same thing.
--
-- One real, pre-existing gap found and fixed here: get_group_suggestions() (
-- 20260821100000_add_team_scope_to_content.sql) has never filtered by visibility, so a private
-- group has been appearing in "Gruppen für dich" suggestions since that migration. Every other
-- discovery/access path (the base `groups` RLS SELECT policy, join_public_group,
-- request_private_group_join, get_group_detail) already correctly restricts non-members. No other
-- gap found.
--
-- No existing table/column/row/migration touched or deleted. Purely additive: one new table, one
-- widened CHECK constraint, five new/redefined functions (one of them a same-signature `create or
-- replace` bugfix). Not run remotely as part of this step.

-- ---------------------------------------------------------------------------------------------
-- public.group_invitations — a pending/accepted/declined/cancelled invitation, entirely separate
-- from group_join_requests (different direction, different table, same additive spirit).
-- ---------------------------------------------------------------------------------------------

create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint group_invitations_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  constraint group_invitations_not_self check (inviter_id <> invitee_id)
);

-- At most one open (pending) invitation per (group, invitee) at a time -- same partial-index
-- pattern already used for trip_requests/group_join_requests/reports. A new invitation after a
-- decline/cancel is allowed (only 'pending' rows are covered).
create unique index if not exists group_invitations_unique_pending_per_invitee
  on public.group_invitations (group_id, invitee_id)
  where status = 'pending';

create index if not exists group_invitations_invitee_id_status_idx on public.group_invitations (invitee_id, status);
create index if not exists group_invitations_group_id_status_idx on public.group_invitations (group_id, status);

alter table public.group_invitations enable row level security;

-- An invitee reads their own invitations (needed to resolve "am I still pending on this group"
-- independent of the notification row, which never changes after creation); a group admin/owner
-- reads invitations for groups they administer (needed for the "eingeladen"/cancel UI) -- same
-- dual-permissive-policy shape as group_join_requests. No one else can read any invitation.
drop policy if exists "Invitees can read their own group invitations" on public.group_invitations;
create policy "Invitees can read their own group invitations"
  on public.group_invitations
  for select
  to authenticated
  using (invitee_id = auth.uid());

drop policy if exists "Group admins can read invitations for their groups" on public.group_invitations;
create policy "Group admins can read invitations for their groups"
  on public.group_invitations
  for select
  to authenticated
  using (public.is_group_admin(group_id));

-- No INSERT/UPDATE/DELETE policy at all -- every write goes through invite_user_to_group()/
-- respond_to_group_invitation()/cancel_group_invitation() below (SECURITY DEFINER). A client can
-- never insert a fabricated invitation for itself, or accept one that was never actually sent.
revoke all on public.group_invitations from anon;
grant select on public.group_invitations to authenticated;
revoke insert, update, delete on public.group_invitations from authenticated;

-- ---------------------------------------------------------------------------------------------
-- invite_user_to_group — owner or admin only (is_group_admin() already returns true for the owner
-- too, since group creation/transfer always also sets group_members.role = 'admin' for them -- see
-- 20260808120000/20260812120000's own header comments -- no new role logic needed). inviter_id is
-- always auth.uid(), never a client-supplied value. Every rejection reason from Vorgabe 11 is
-- checked server-side, not just hidden in the UI.
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

  -- reference_type='group'/reference_id=group_id (not the invitation id) is deliberate: it's the
  -- exact same reference shape every other group notification already uses, and
  -- lib/notification-navigation.ts's existing 'group' branch already routes any non-group_message
  -- type to /group/[id] with zero client routing changes. The invitation itself is looked up by
  -- (group_id, invitee_id) at respond time -- see respond_to_group_invitation below -- so no second
  -- id needs to travel through the notification at all.
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
-- respond_to_group_invitation — atomic accept/decline. `for update` locks the specific invitation
-- row for the transaction, so a double-tap (or an accept/decline race) always serializes: the
-- second call finds status already <> 'pending' and raises, never producing a duplicate membership
-- or a membership-without-invitation/invitation-without-membership split (Vorgabe 19/38). Looked up
-- by (group_id, invitee_id) rather than a separate invitation id parameter -- the partial unique
-- index above guarantees at most one pending row per (group, invitee), so this is unambiguous, and
-- it's exactly the pair the notification's own reference_id (group_id) plus auth.uid() already
-- provide with no second id needed.
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
    -- Vorgabe 34: a block created after the invitation was sent (either direction) must still
    -- prevent it from ever being turned into a membership -- decline remains allowed regardless,
    -- since declining grants nothing.
    if public.are_users_blocked(v_invitation.inviter_id, v_self) then
      raise exception 'blocked: cannot accept this invitation';
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
-- cancel_group_invitation — owner/admin withdraws a still-pending invitation (Vorgabe 23, low
-- incremental cost given the admin SELECT policy above already exists for this exact purpose).
-- ---------------------------------------------------------------------------------------------

create or replace function public.cancel_group_invitation(p_group_id uuid, p_invitee_id uuid)
returns public.group_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_invitation public.group_invitations;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_group_admin(p_group_id) then
    raise exception 'not authorized';
  end if;

  select * into v_invitation
  from public.group_invitations
  where group_id = p_group_id and invitee_id = p_invitee_id and status = 'pending'
  for update;

  if not found then
    raise exception 'invitation not found';
  end if;

  update public.group_invitations
  set status = 'cancelled', responded_at = now()
  where id = v_invitation.id
  returning * into v_invitation;

  return v_invitation;
end;
$$;

revoke all on function public.cancel_group_invitation(uuid, uuid) from public;
revoke all on function public.cancel_group_invitation(uuid, uuid) from anon;
grant execute on function public.cancel_group_invitation(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Bugfix, same signature (safe `create or replace`): get_group_suggestions() never filtered by
-- visibility, so a private group has been leaking into "Gruppen für dich" since
-- 20260821100000_add_team_scope_to_content.sql. Every other line of this function is unchanged.
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
      and g.visibility = 'public'
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
-- Widen notifications_type_check with 'group_invitation'. Full existing list reproduced from every
-- migration that has ever defined this constraint, read directly (not assumed) -- see
-- 20260826100000_add_game_follow_notifications.sql's own header for the same discipline after the
-- documented "narrowed the list by accident" failure. reference_type='group' needs no constraint
-- change, already allowed since 20260813120000_add_group_notifications.sql.
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
      'user_follow',
      'game_new_post',
      'game_new_trip',
      'game_new_meetup',
      'group_invitation'
    )
  );
