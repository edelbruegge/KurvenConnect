-- 20260813120000_add_group_notifications.sql
--
-- Group events integrated into the existing public.notifications architecture. No second,
-- parallel notification system: every group notification goes through the same table, the same
-- create_notification() helper, the same RLS policy, and the same realtime publication already
-- used for direct-message/trip/meetup notifications
-- (20260804120000_create_notifications.sql — completely untouched by this migration). No new
-- tables. No data deleted.
--
-- One responsible creation site per event, matching the existing project convention (a trigger for
-- an INSERT that always needs a notification, an RPC body for an event that is already a single
-- controlled transaction):
--   group_message              -> AFTER INSERT trigger on group_messages   (mirrors notify_on_new_message)
--   group_join_request         -> AFTER INSERT trigger on group_join_requests (mirrors notify_on_trip_request_created)
--   group_join_accepted/rejected -> inside manage_group_join_request (same transaction as the status change)
--   group_admin_promoted       -> inside promote_group_member
--   group_admin_demoted        -> inside demote_group_admin
--   group_member_removed       -> inside remove_group_member
--   group_ownership_transferred -> inside transfer_group_ownership
--
-- The four already-existing admin RPCs (from 20260812120000_add_group_administration.sql) and
-- manage_group_join_request (from 20260808120000_create_groups_and_memberships.sql) are
-- re-declared here via `create or replace function` with the exact same signature/return type —
-- this only appends a `create_notification` call at the end of each, their existing authorization/
-- validation logic is otherwise untouched. Safe to re-run: every statement below is
-- `create or replace` / `drop trigger if exists` + `create trigger`, and the constraint changes use
-- `drop constraint if exists` before re-adding the widened check (existing rows already satisfy it,
-- since it is a strict superset of the previous list).
--
-- Intended to run once against a Supabase project, after every migration listed above. Not run
-- remotely as part of this step.

-- ---------------------------------------------------------------------------------------------
-- Widen the type/reference_type CHECK constraints to include the new group event types and the
-- new 'group' reference type. No existing row is affected (every existing value remains valid).
-- ---------------------------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
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
    'group_ownership_transferred'
  )
);

alter table public.notifications drop constraint if exists notifications_reference_type_check;
alter table public.notifications add constraint notifications_reference_type_check
  check (reference_type is null or reference_type in ('conversation', 'trip', 'meetup', 'profile', 'group'));

-- ---------------------------------------------------------------------------------------------
-- group_message -> notify every current group member except the sender. Fires once per stored
-- message row (AFTER INSERT), so a realtime echo of that same row can never create a second
-- notification — there is only ever one INSERT to react to. event_key includes both the message
-- id and the recipient id, so the same message can never double-notify the same recipient even if
-- this trigger were somehow invoked twice for the same row.
-- ---------------------------------------------------------------------------------------------

create or replace function public.notify_on_new_group_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_sender_name text;
  v_body text;
  v_recipient record;
begin
  select name into v_group_name from public.groups where id = new.group_id;

  if v_group_name is null then
    return new;
  end if;

  select nullif(trim(display_name), '') into v_sender_name from public.profiles where id = new.sender_id;
  v_body := coalesce(v_sender_name, 'Ein Mitglied') || ' hat eine neue Nachricht gesendet.';

  for v_recipient in
    select user_id from public.group_members where group_id = new.group_id and user_id <> new.sender_id
  loop
    perform public.create_notification(
      v_recipient.user_id,
      new.sender_id,
      'group_message',
      v_group_name,
      v_body,
      'group',
      new.group_id::text,
      'group_message:' || new.id::text || ':' || v_recipient.user_id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists on_group_message_notify on public.group_messages;
create trigger on_group_message_notify
  after insert on public.group_messages
  for each row execute function public.notify_on_new_group_message();

-- ---------------------------------------------------------------------------------------------
-- group_join_request (private group) -> notify the owner and every current admin. Fires once per
-- inserted request row; request_private_group_join() is the only path that ever inserts into
-- group_join_requests, so there is exactly one responsible creation site regardless of which layer
-- is credited for it.
-- ---------------------------------------------------------------------------------------------

create or replace function public.notify_on_group_join_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_name text;
  v_requester_name text;
  v_body text;
  v_admin record;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select name into v_group_name from public.groups where id = new.group_id;

  if v_group_name is null then
    return new;
  end if;

  select nullif(trim(display_name), '') into v_requester_name from public.profiles where id = new.requester_id;
  v_body := coalesce(v_requester_name, 'Ein Nutzer') || ' möchte ' || v_group_name || ' beitreten.';

  for v_admin in
    select user_id from public.group_members where group_id = new.group_id and role = 'admin'
  loop
    perform public.create_notification(
      v_admin.user_id,
      new.requester_id,
      'group_join_request',
      'Neue Beitrittsanfrage',
      v_body,
      'group',
      new.group_id::text,
      'group_join_request:' || new.id::text || ':' || v_admin.user_id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists on_group_join_request_notify on public.group_join_requests;
create trigger on_group_join_request_notify
  after insert on public.group_join_requests
  for each row execute function public.notify_on_group_join_request_created();

-- ---------------------------------------------------------------------------------------------
-- manage_group_join_request — re-declared with the exact same signature/authorization/validation
-- as before, extended to notify the requester after a successful accept/reject. Membership is
-- already committed (accept branch) and the request status change is already applied before the
-- notification call, all within the same transaction — if anything later in this function were to
-- fail, the whole call (including the notification) rolls back together, so a notification can
-- never exist for a group action that did not actually happen. event_key is anchored on the
-- request id, which can only ever be reviewed once (the existing 'request already reviewed' guard
-- below prevents a second successful call for the same request), so no duplicate is possible.
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
  v_group_name text;
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

  select name into v_group_name from public.groups where id = v_request.group_id;

  if p_action = 'accept' then
    insert into public.group_members (group_id, user_id, role)
    values (v_request.group_id, v_request.requester_id, 'member')
    on conflict (group_id, user_id) do nothing;

    update public.group_join_requests
    set status = 'accepted', reviewed_by = v_self, reviewed_at = now()
    where id = p_request_id
    returning * into v_request;

    if v_group_name is not null then
      perform public.create_notification(
        v_request.requester_id,
        v_self,
        'group_join_accepted',
        'Beitrittsanfrage angenommen',
        'Du bist jetzt Mitglied von ' || v_group_name || '.',
        'group',
        v_request.group_id::text,
        'group_join_accepted:' || v_request.id::text
      );
    end if;
  else
    update public.group_join_requests
    set status = 'rejected', reviewed_by = v_self, reviewed_at = now()
    where id = p_request_id
    returning * into v_request;

    if v_group_name is not null then
      perform public.create_notification(
        v_request.requester_id,
        v_self,
        'group_join_rejected',
        'Beitrittsanfrage abgelehnt',
        'Deine Beitrittsanfrage für ' || v_group_name || ' wurde abgelehnt.',
        'group',
        v_request.group_id::text,
        'group_join_rejected:' || v_request.id::text
      );
    end if;
  end if;

  return v_request;
end;
$$;

revoke all on function public.manage_group_join_request(uuid, text) from public;
revoke all on function public.manage_group_join_request(uuid, text) from anon;
grant execute on function public.manage_group_join_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- promote_group_member — re-declared with the same authorization/validation, extended to notify
-- the promoted member. The existing 'target already admin' guard already rejects any repeat call
-- for a target that is already an admin, so a retry after a successful promotion can never reach
-- the notification line a second time — clock_timestamp() in event_key only needs to make distinct
-- promotion events (e.g. promote -> demote -> promote again, later) distinguishable, not defend
-- against a retry (already handled by that guard).
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

  perform public.create_notification(
    p_user_id,
    v_self,
    'group_admin_promoted',
    'Neue Adminrechte',
    'Du bist jetzt Admin von ' || v_group.name || '.',
    'group',
    p_group_id::text,
    'group_admin_promoted:' || p_group_id::text || ':' || p_user_id::text || ':' || clock_timestamp()::text
  );

  return v_member;
end;
$$;

revoke all on function public.promote_group_member(uuid, uuid) from public;
revoke all on function public.promote_group_member(uuid, uuid) from anon;
grant execute on function public.promote_group_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- demote_group_admin — re-declared, extended to notify the demoted member. Same reasoning as
-- promote_group_member above: the existing 'target not admin' guard already blocks a repeat call.
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

  perform public.create_notification(
    p_user_id,
    v_self,
    'group_admin_demoted',
    'Adminrechte geändert',
    'Du bist nicht mehr Admin von ' || v_group.name || '.',
    'group',
    p_group_id::text,
    'group_admin_demoted:' || p_group_id::text || ':' || p_user_id::text || ':' || clock_timestamp()::text
  );

  return v_member;
end;
$$;

revoke all on function public.demote_group_admin(uuid, uuid) from public;
revoke all on function public.demote_group_admin(uuid, uuid) from anon;
grant execute on function public.demote_group_admin(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- remove_group_member — re-declared, extended to notify the removed member. The notification is
-- created after the delete succeeds but is stored independently of group_members (notifications
-- has no FK to group_members), so it remains fully readable for the removed user even though their
-- membership row is gone — deliberate, per the requirement that this notification must survive
-- the removal it describes.
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
-- transfer_group_ownership — re-declared, extended to notify the new owner. `for update` already
-- fully serializes concurrent transfer attempts for the same group (see the original migration's
-- comment), so no additional race guard is needed for the notification either.
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

  perform public.create_notification(
    p_new_owner_id,
    v_self,
    'group_ownership_transferred',
    'Du bist jetzt Gruppeninhaber',
    'Die Gruppeninhaberschaft von ' || v_group.name || ' wurde auf dich übertragen.',
    'group',
    p_group_id::text,
    'group_ownership_transferred:' || p_group_id::text || ':' || p_new_owner_id::text || ':' || clock_timestamp()::text
  );

  return v_group;
end;
$$;

revoke all on function public.transfer_group_ownership(uuid, uuid) from public;
revoke all on function public.transfer_group_ownership(uuid, uuid) from anon;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
