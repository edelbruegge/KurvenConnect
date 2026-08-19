-- 20260902100000_add_user_warning_notifications.sql
--
-- Completes the existing Verwarnungsworkflow: today a moderator's "Nutzer verwarnen"/"Ausblenden
-- und verwarnen" action (apply_report_action, redefined in
-- 20260809120000_fix_content_visibility_realtime_sync.sql) inserts exactly one public.user_warnings
-- row, but creates zero notifications for the warned user — confirmed by reading every migration
-- that touches public.notifications (20260804120000_create_notifications.sql onward) and every
-- caller of create_notification(): none of them is warning-related. This migration adds exactly
-- one public.notifications row per warning, using the already-central create_notification() helper
-- (same idempotency/self-notify guarantees as every other notification type) and the already-single
-- write path apply_report_action (no new trigger, no second path).
--
-- Left untouched: public.user_warnings itself (still the sole source of truth for the warning),
-- acknowledge_user_warning() (already correct), all RLS policies, all existing notification types.
-- No data is deleted or altered. reference_type 'profile' is already an allowed value on
-- public.notifications (see notifications_reference_type_check) — no change needed there, only
-- notifications_type_check needs to widen to allow the new 'warning_received' type.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`) -- NOT run
-- as part of this change. Safe to re-run: the constraint is dropped/recreated idempotently, the
-- function uses create or replace.

-- Full existing list reproduced from 20260828100000_add_group_invitations.sql (the last migration
-- to redefine this constraint before this one, verified via grep across every migration touching
-- notifications_type_check) -- same discipline as that migration's own header describes after an
-- earlier "narrowed the list by accident" failure. Only 'warning_received' is newly added; nothing
-- existing is removed or reordered.
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
      'group_invitation',
      'warning_received'
    )
  );

-- ---------------------------------------------------------------------------------------------
-- apply_report_action redefined: identical to the version in
-- 20260809120000_fix_content_visibility_realtime_sync.sql, with exactly one addition per
-- warning-creating branch (warn_user, hide_and_warn) -- a single create_notification() call, bound
-- to the same transaction as the user_warnings insert so a notification can only ever exist if the
-- warning row was actually created, and vice versa. event_key is derived from the warning's own id
-- (only known after the insert), which makes this call structurally idempotent (on conflict (event_
-- key) do nothing inside create_notification) even if this function were ever somehow invoked twice
-- for the same warning.
-- ---------------------------------------------------------------------------------------------

create or replace function public.apply_report_action(
  p_report_id uuid,
  p_action text,
  p_note text default null,
  p_warning_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_report public.reports;
  v_target_owner_id uuid;
  v_note text;
  v_warning_message text;
  v_restriction_id uuid;
  v_warning_id uuid;
  v_audit_action text;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_current_user_moderator() then
    raise exception 'not a moderator';
  end if;

  if p_action not in ('hide_content', 'warn_user', 'hide_and_warn') then
    raise exception 'invalid action';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;

  if not found then
    raise exception 'report not found';
  end if;

  if v_report.status not in ('pending', 'reviewed') then
    raise exception 'report already actioned';
  end if;

  v_target_owner_id := public.resolve_content_owner(v_report.target_type, v_report.target_id);

  if v_target_owner_id is null then
    raise exception 'target not found';
  end if;

  if p_action in ('hide_content', 'hide_and_warn') then
    if v_report.target_type = 'user' then
      raise exception 'target type cannot be globally hidden';
    end if;

    if public.is_content_restricted(v_report.target_type, v_report.target_id) then
      raise exception 'target already hidden';
    end if;
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'note too long';
  end if;

  if p_action in ('warn_user', 'hide_and_warn') then
    if v_target_owner_id = v_self then
      raise exception 'cannot warn yourself';
    end if;

    v_warning_message := nullif(trim(coalesce(p_warning_message, '')), '');
    if v_warning_message is null then
      v_warning_message := 'Ein von dir veröffentlichter Inhalt verstößt möglicherweise gegen unsere Community-Regeln. Bitte beachte unsere Regeln bei zukünftigen Beiträgen.';
    end if;
    if length(v_warning_message) > 1000 then
      raise exception 'warning message too long';
    end if;
  end if;

  if p_action = 'hide_content' then
    insert into public.content_restrictions (target_type, target_id, target_owner_id, report_id, restriction_type, reason, created_by)
    values (v_report.target_type, v_report.target_id, v_target_owner_id, v_report.id, 'hidden', v_note, v_self)
    returning id into v_restriction_id;

    insert into public.content_visibility_events (target_type, target_id, action)
    values (v_report.target_type, v_report.target_id, 'hidden');

    v_audit_action := 'content_hidden';
  elsif p_action = 'warn_user' then
    insert into public.user_warnings (user_id, report_id, moderator_id, warning_type, title, message, internal_note)
    values (v_target_owner_id, v_report.id, v_self, 'content_violation', 'Hinweis zu deinem Verhalten', v_warning_message, v_note)
    returning id into v_warning_id;

    perform public.create_notification(
      v_target_owner_id,
      v_self,
      'warning_received',
      'Verwarnung erhalten',
      'Du hast eine Verwarnung erhalten. Öffne dein Profil, um sie einzusehen.',
      'profile',
      v_target_owner_id::text,
      'user_warning:' || v_warning_id::text
    );

    v_audit_action := 'user_warned';
  else
    insert into public.content_restrictions (target_type, target_id, target_owner_id, report_id, restriction_type, reason, created_by)
    values (v_report.target_type, v_report.target_id, v_target_owner_id, v_report.id, 'hidden', v_note, v_self)
    returning id into v_restriction_id;

    insert into public.content_visibility_events (target_type, target_id, action)
    values (v_report.target_type, v_report.target_id, 'hidden');

    insert into public.user_warnings (user_id, report_id, moderator_id, warning_type, title, message, internal_note)
    values (v_target_owner_id, v_report.id, v_self, 'content_violation', 'Hinweis zu deinem Verhalten', v_warning_message, v_note)
    returning id into v_warning_id;

    perform public.create_notification(
      v_target_owner_id,
      v_self,
      'warning_received',
      'Verwarnung erhalten',
      'Du hast eine Verwarnung erhalten. Öffne dein Profil, um sie einzusehen.',
      'profile',
      v_target_owner_id::text,
      'user_warning:' || v_warning_id::text
    );

    v_audit_action := 'content_hidden_and_user_warned';
  end if;

  update public.reports
  set status = 'actioned', reviewed_by = v_self, reviewed_at = now(), resolution_note = coalesce(v_note, resolution_note)
  where id = p_report_id
  returning * into v_report;

  insert into public.moderation_actions (report_id, moderator_id, action, note)
  values (p_report_id, v_self, v_audit_action, v_note);

  return jsonb_build_object('report', to_jsonb(v_report), 'restriction_id', v_restriction_id, 'warning_id', v_warning_id);
end;
$$;

revoke all on function public.apply_report_action(uuid, text, text, text) from public;
revoke all on function public.apply_report_action(uuid, text, text, text) from anon;
grant execute on function public.apply_report_action(uuid, text, text, text) to authenticated;
