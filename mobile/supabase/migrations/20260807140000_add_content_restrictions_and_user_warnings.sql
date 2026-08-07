-- 20260807140000_add_content_restrictions_and_user_warnings.sql
--
-- Controlled moderation actions on top of the existing reports/moderation queue
-- (20260807130000_add_moderation_roles_and_queue.sql, left untouched): global content hiding,
-- restoration, and persistent user warnings. Everything here is additive/adjusting — no existing
-- table, policy, or row from an earlier migration is dropped or destructively rewritten.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/function is dropped or
-- replaced with `if exists`/`create or replace` immediately before being (re)created.

-- ---------------------------------------------------------------------------------------------
-- public.content_restrictions
-- ---------------------------------------------------------------------------------------------
-- Global, moderator-issued hides of real Supabase content. Profiles ('user' target_type reports)
-- are deliberately NOT restrictable here — a reported user can only be warned in this step, never
-- globally hidden/locked (that is a later, separate feature).

create table if not exists public.content_restrictions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  target_owner_id uuid references public.profiles (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  restriction_type text not null default 'hidden',
  reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  lifted_by uuid references public.profiles (id),
  lifted_at timestamptz,
  lift_note text,
  constraint content_restrictions_target_type_check check (target_type in ('post', 'comment', 'trip', 'meetup', 'wanted_entry')),
  constraint content_restrictions_target_id_not_blank check (length(trim(target_id)) > 0),
  constraint content_restrictions_restriction_type_check check (restriction_type = 'hidden'),
  constraint content_restrictions_reason_max_length check (reason is null or length(reason) <= 2000),
  constraint content_restrictions_lift_note_max_length check (lift_note is null or length(lift_note) <= 2000)
);

-- At most one *active* (not yet lifted) restriction per target. Previously lifted restrictions
-- remain as history and do not block a fresh one from being reapplied later.
create unique index if not exists content_restrictions_active_unique
  on public.content_restrictions (target_type, target_id)
  where lifted_at is null;

create index if not exists content_restrictions_target_owner_id_idx on public.content_restrictions (target_owner_id);
create index if not exists content_restrictions_report_id_idx on public.content_restrictions (report_id);
create index if not exists content_restrictions_created_at_idx on public.content_restrictions (created_at);
create index if not exists content_restrictions_lifted_at_idx on public.content_restrictions (lifted_at);

alter table public.content_restrictions enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policy for normal authenticated users at all — every write goes
-- through apply_report_action()/restore_restricted_content() (SECURITY DEFINER, bypass RLS
-- internally). Moderators get a narrow, read-only policy so the moderation detail view can show
-- "Global ausgeblendet seit ..." without a dedicated RPC.
drop policy if exists "Moderators can read content restrictions" on public.content_restrictions;
create policy "Moderators can read content restrictions"
  on public.content_restrictions
  for select
  to authenticated
  using (public.is_current_user_moderator());

revoke all on public.content_restrictions from anon;
grant select on public.content_restrictions to authenticated;
revoke insert, update, delete on public.content_restrictions from authenticated;

-- ---------------------------------------------------------------------------------------------
-- public.user_warnings
-- ---------------------------------------------------------------------------------------------

create table if not exists public.user_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  report_id uuid references public.reports (id) on delete set null,
  moderator_id uuid not null references public.profiles (id),
  warning_type text not null,
  title text not null,
  message text not null,
  internal_note text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  constraint user_warnings_warning_type_check check (warning_type in ('content_violation', 'conduct_warning')),
  constraint user_warnings_title_not_blank check (length(trim(title)) > 0),
  constraint user_warnings_title_max_length check (length(title) <= 200),
  constraint user_warnings_message_not_blank check (length(trim(message)) > 0),
  constraint user_warnings_message_max_length check (length(message) <= 1000),
  constraint user_warnings_internal_note_max_length check (internal_note is null or length(internal_note) <= 2000)
);

create index if not exists user_warnings_user_id_idx on public.user_warnings (user_id);
create index if not exists user_warnings_report_id_idx on public.user_warnings (report_id);
create index if not exists user_warnings_moderator_id_idx on public.user_warnings (moderator_id);
create index if not exists user_warnings_created_at_idx on public.user_warnings (created_at);
create index if not exists user_warnings_acknowledged_at_idx on public.user_warnings (acknowledged_at);

alter table public.user_warnings enable row level security;

-- SELECT: a user reads only their own warnings; moderators read all via a separate policy (two
-- permissive policies, correctly OR-combined here since neither one is unconditionally `true` —
-- unlike the content tables below, both policies are meant to *add* visibility, not narrow it).
drop policy if exists "Users can read their own warnings" on public.user_warnings;
create policy "Users can read their own warnings"
  on public.user_warnings
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Moderators can read all warnings" on public.user_warnings;
create policy "Moderators can read all warnings"
  on public.user_warnings
  for select
  to authenticated
  using (public.is_current_user_moderator());

-- No INSERT policy (only apply_report_action() may create a warning) and, deliberately, no UPDATE
-- policy either: acknowledging a warning goes exclusively through acknowledge_user_warning() below
-- (SECURITY DEFINER), the same "no direct client write, only a narrow function" pattern already
-- used for public.notifications/mark_notification_read — safer than a column-scoped RLS UPDATE
-- policy and consistent with the rest of this codebase. No DELETE policy: warnings are never
-- deleted.
revoke all on public.user_warnings from anon;
grant select on public.user_warnings to authenticated;
revoke insert, update, delete on public.user_warnings from authenticated;

-- ---------------------------------------------------------------------------------------------
-- public.is_content_restricted — used both from RLS policies below and safe to call directly.
-- ---------------------------------------------------------------------------------------------

create or replace function public.is_content_restricted(p_target_type text, p_target_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.content_restrictions
    where target_type = p_target_type
      and target_id = p_target_id
      and lifted_at is null
  );
$$;

revoke all on function public.is_content_restricted(text, text) from public;
revoke all on function public.is_content_restricted(text, text) from anon;
grant execute on function public.is_content_restricted(text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- public.resolve_content_owner — internal helper, never called directly by the client.
-- ---------------------------------------------------------------------------------------------

create or replace function public.resolve_content_owner(p_target_type text, p_target_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  begin
    if p_target_type = 'post' then
      select author_id into v_owner from public.posts where id = p_target_id::uuid;
    elsif p_target_type = 'comment' then
      select author_id into v_owner from public.post_comments where id = p_target_id::uuid;
    elsif p_target_type = 'trip' then
      select owner_id into v_owner from public.trips where id = p_target_id::uuid;
    elsif p_target_type = 'meetup' then
      select organizer_id into v_owner from public.meetups where id = p_target_id::uuid;
    elsif p_target_type = 'wanted_entry' then
      select owner_id into v_owner from public.wanted_entries where id = p_target_id::uuid;
    elsif p_target_type = 'user' then
      select id into v_owner from public.profiles where id = p_target_id::uuid;
    else
      return null;
    end if;
  exception
    when invalid_text_representation then
      return null;
  end;

  return v_owner;
end;
$$;

-- Intentionally no grants to public/anon/authenticated: this function is only ever called from
-- within apply_report_action() below. As that function's owner also owns this one, the internal
-- call succeeds regardless of the revoke — a normal client can never invoke it directly.
revoke all on function public.resolve_content_owner(text, text) from public;
revoke all on function public.resolve_content_owner(text, text) from anon;
revoke all on function public.resolve_content_owner(text, text) from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Narrow the five existing content SELECT policies so normal users no longer see actively
-- restricted rows. These *replace* the prior "using (true)" policies rather than adding a second
-- permissive one alongside them — Postgres OR-combines permissive policies, so an additional
-- `true`-adjacent policy could only ever widen access, never narrow it. Moderators keep full
-- access via the `or is_current_user_moderator()` branch, which is what lets the existing
-- useResolvedReportTarget-based preview in the moderation detail view keep working unchanged.
-- ---------------------------------------------------------------------------------------------

drop policy if exists "Authenticated users can read posts" on public.posts;
create policy "Authenticated users can read posts"
  on public.posts
  for select
  to authenticated
  using (not public.is_content_restricted('post', id::text) or public.is_current_user_moderator());

drop policy if exists "Authenticated users can read comments" on public.post_comments;
create policy "Authenticated users can read comments"
  on public.post_comments
  for select
  to authenticated
  using (not public.is_content_restricted('comment', id::text) or public.is_current_user_moderator());

drop policy if exists "Authenticated users can read trips" on public.trips;
create policy "Authenticated users can read trips"
  on public.trips
  for select
  to authenticated
  using (not public.is_content_restricted('trip', id::text) or public.is_current_user_moderator());

drop policy if exists "Authenticated users can read meetups" on public.meetups;
create policy "Authenticated users can read meetups"
  on public.meetups
  for select
  to authenticated
  using (not public.is_content_restricted('meetup', id::text) or public.is_current_user_moderator());

drop policy if exists "Authenticated users can read wanted entries" on public.wanted_entries;
create policy "Authenticated users can read wanted entries"
  on public.wanted_entries
  for select
  to authenticated
  using (not public.is_content_restricted('wanted_entry', id::text) or public.is_current_user_moderator());

-- ---------------------------------------------------------------------------------------------
-- Extend moderation_actions' allowed action values. Existing rows/constraint history untouched —
-- only the set of permitted future values grows.
-- ---------------------------------------------------------------------------------------------

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check
  check (action in ('reviewed', 'dismissed', 'content_hidden', 'user_warned', 'content_hidden_and_user_warned', 'content_restored'));

-- ---------------------------------------------------------------------------------------------
-- public.apply_report_action
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
-- public.restore_restricted_content
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

  return v_restriction;
end;
$$;

revoke all on function public.restore_restricted_content(uuid, text) from public;
revoke all on function public.restore_restricted_content(uuid, text) from anon;
grant execute on function public.restore_restricted_content(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- public.acknowledge_user_warning
-- ---------------------------------------------------------------------------------------------

create or replace function public.acknowledge_user_warning(p_warning_id uuid)
returns public.user_warnings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_warning public.user_warnings;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  select * into v_warning from public.user_warnings where id = p_warning_id and user_id = v_self for update;

  if not found then
    raise exception 'warning not found';
  end if;

  if v_warning.acknowledged_at is null then
    update public.user_warnings set acknowledged_at = now() where id = p_warning_id returning * into v_warning;
  end if;

  return v_warning;
end;
$$;

revoke all on function public.acknowledge_user_warning(uuid) from public;
revoke all on function public.acknowledge_user_warning(uuid) from anon;
grant execute on function public.acknowledge_user_warning(uuid) to authenticated;
