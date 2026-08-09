-- 20260809120000_fix_content_visibility_realtime_sync.sql
--
-- Fixes two confirmed sync issues left after the previous moderation/realtime step:
--   1) A globally hidden post/comment/trip/meetup/wanted_entry did not disappear from already
--      connected normal users' already-loaded views until they manually reloaded — because
--      content_restrictions' only SELECT policy is moderator-only, postgres_changes on that
--      table (added in 20260807150000_fix_moderation_visibility_and_realtime.sql) is never
--      delivered to a normal user in the first place (Realtime authorizes delivery via the same
--      RLS as a normal SELECT). There was also no realtime subscription at all on
--      posts/post_comments/trips/meetups/wanted_entries.
--   2) FeedPostsContext (the single source of truth behind Feed/Stadion/Suche/Profil/
--      Aktivitäten/Gespeichert) had no realtime and no foreground refresh at all, unlike
--      ModerationContext/UserWarningsContext/NotificationsContext.
--
-- Chosen fix: a minimal, RLS-safe "content visibility event" table instead of full
-- content_restrictions access. It carries only target_type/target_id/action — never report_id,
-- moderator_id, reason, internal_note, resolution_note, warning text, or profile data. Broadcast
-- (realtime.send()) would be the preferred mechanism per the task, but its availability/grants
-- inside a SECURITY DEFINER function cannot be verified against the actual remote project from
-- here, and a failure there would break the already-production apply_report_action/
-- restore_restricted_content functions. This table reuses the exact postgres_changes pattern
-- already verified working in this project for reports/content_restrictions/user_warnings.
--
-- Does not touch content_restrictions' or moderation_actions' RLS at all — both remain exactly as
-- protected as before. Does not delete any data, does not weaken any existing policy.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, functions use `create or replace`, the
-- publication addition is guarded by an existence check.

create table if not exists public.content_visibility_events (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  action text not null,
  created_at timestamptz not null default now(),
  constraint content_visibility_events_target_type_check check (target_type in ('post', 'comment', 'trip', 'meetup', 'wanted_entry')),
  constraint content_visibility_events_action_check check (action in ('hidden', 'restored'))
);

create index if not exists content_visibility_events_created_at_idx on public.content_visibility_events (created_at);

alter table public.content_visibility_events enable row level security;

-- Deliberately unconditional for authenticated: this table structurally cannot leak moderation
-- details (no report_id/moderator_id/reason/notes columns exist), so a broad SELECT policy is
-- safe. This is the whole point of the table — a safe, minimal invalidation signal distinct from
-- the moderator-only content_restrictions table.
drop policy if exists "Authenticated users can read visibility events" on public.content_visibility_events;
create policy "Authenticated users can read visibility events"
  on public.content_visibility_events
  for select
  to authenticated
  using (true);

revoke all on public.content_visibility_events from anon;
grant select on public.content_visibility_events to authenticated;
revoke insert, update, delete on public.content_visibility_events from authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'content_visibility_events'
  ) then
    alter publication supabase_realtime add table public.content_visibility_events;
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- apply_report_action redefined: identical to the version in
-- 20260807140000_add_content_restrictions_and_user_warnings.sql, with exactly one addition per
-- hiding branch — a content_visibility_events insert, bound to the same transaction so the event
-- can only ever exist if the restriction was actually created.
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

-- ---------------------------------------------------------------------------------------------
-- restore_restricted_content redefined: identical to the existing version, with exactly one
-- addition — a content_visibility_events insert after the restriction is successfully lifted.
-- ---------------------------------------------------------------------------------------------

create or replace function public.restore_restricted_content(p_restriction_id uuid, p_note text default null)
returns public.content_restrictions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_restriction public.content_restrictions;
  v_note text;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_current_user_moderator() then
    raise exception 'not a moderator';
  end if;

  select * into v_restriction from public.content_restrictions where id = p_restriction_id for update;

  if not found then
    raise exception 'restriction not found';
  end if;

  if v_restriction.lifted_at is not null then
    raise exception 'restriction already lifted';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'note too long';
  end if;

  update public.content_restrictions
  set lifted_by = v_self, lifted_at = now(), lift_note = v_note
  where id = p_restriction_id
  returning * into v_restriction;

  insert into public.moderation_actions (report_id, moderator_id, action, note)
  values (v_restriction.report_id, v_self, 'content_restored', v_note);

  insert into public.content_visibility_events (target_type, target_id, action)
  values (v_restriction.target_type, v_restriction.target_id, 'restored');

  return v_restriction;
end;
$$;

revoke all on function public.restore_restricted_content(uuid, text) from public;
revoke all on function public.restore_restricted_content(uuid, text) from anon;
grant execute on function public.restore_restricted_content(uuid, text) to authenticated;
