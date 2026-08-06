-- 20260807130000_add_moderation_roles_and_queue.sql
--
-- A real, server-checked `moderator` role plus a protected moderation queue on top of the
-- existing public.reports table. No content, user, or report is deleted or altered by this
-- migration; public.reports itself is not recreated, only granted an additional SELECT policy.
-- There is still no in-app way to grant the moderator role — that remains a controlled, manual
-- SQL Editor step (see the final report) so a normal user can never self-assign it.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/function is (re)created
-- with `drop ... if exists` / `create or replace` immediately before being (re)created, so
-- re-applying this file after a partial or repeated run will not fail or duplicate anything.

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, role),
  constraint user_roles_role_check check (role in ('moderator'))
);

alter table public.user_roles enable row level security;

-- Deliberately no SELECT/INSERT/UPDATE/DELETE policy for `authenticated` at all: the table is
-- readable/writable only via a `postgres`-privileged connection (the Supabase SQL Editor) or the
-- SECURITY DEFINER function below, which only ever reads (never writes) it. This is what makes
-- "no client-side moderator role" and "a user can never grant themselves the role" structural
-- guarantees rather than app-level conventions.
revoke all on public.user_roles from anon;
revoke all on public.user_roles from authenticated;

-- The single source of truth for "is the calling user a moderator". Only ever evaluates
-- auth.uid() — it has no parameter to check an arbitrary other user, and never returns the full
-- role list. Granted to `authenticated` because it is called both from the new reports policy
-- below (policies evaluate as the `authenticated` role — same reasoning as are_users_blocked /
-- is_conversation_member in earlier migrations) and directly by the client to drive UI state.
create or replace function public.is_current_user_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = 'moderator'
  );
$$;

revoke all on function public.is_current_user_moderator() from public;
revoke all on function public.is_current_user_moderator() from anon;
grant execute on function public.is_current_user_moderator() to authenticated;

-- Additional, separate SELECT policy on the existing public.reports table (created in
-- 20260807120000_create_reports.sql, not modified). Postgres combines multiple permissive SELECT
-- policies on the same table with OR, so normal users keep seeing only their own reports via the
-- original policy, and moderators additionally see every report via this one — neither policy is
-- touched or replaced.
drop policy if exists "Moderators can read all reports" on public.reports;
create policy "Moderators can read all reports"
  on public.reports
  for select
  to authenticated
  using (public.is_current_user_moderator());

-- Immutable audit log: every moderation decision, who made it and when. No UPDATE/DELETE policy
-- exists for anyone (including moderators) — rows are only ever inserted by review_report()
-- below, and never modified afterwards.
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  moderator_id uuid not null references public.profiles (id),
  action text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint moderation_actions_action_check check (action in ('reviewed', 'dismissed')),
  constraint moderation_actions_note_max_length check (note is null or length(note) <= 2000)
);

create index if not exists moderation_actions_report_id_idx on public.moderation_actions (report_id);
create index if not exists moderation_actions_moderator_id_idx on public.moderation_actions (moderator_id);

alter table public.moderation_actions enable row level security;

drop policy if exists "Moderators can read moderation actions" on public.moderation_actions;
create policy "Moderators can read moderation actions"
  on public.moderation_actions
  for select
  to authenticated
  using (public.is_current_user_moderator());

-- No INSERT/UPDATE/DELETE policy: every write goes through review_report() (SECURITY DEFINER).
revoke all on public.moderation_actions from anon;
grant select on public.moderation_actions to authenticated;
revoke insert, update, delete on public.moderation_actions from authenticated;

-- Loads a page of the moderation queue. Rejects non-moderators with a clear exception (rather
-- than silently returning nothing), validates filters instead of trusting them, and always
-- enforces a bounded limit — there is no way to request an unbounded scan of public.reports
-- through this function.
create or replace function public.get_moderation_reports(
  p_status text default 'pending',
  p_target_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_current_user_moderator() then
    raise exception 'not a moderator';
  end if;

  if p_status is not null and p_status not in ('pending', 'reviewed', 'dismissed', 'actioned') then
    raise exception 'invalid status';
  end if;

  if p_target_type is not null and p_target_type not in ('post', 'comment', 'trip', 'meetup', 'wanted_entry', 'user') then
    raise exception 'invalid target type';
  end if;

  return query
    select *
    from public.reports r
    where (p_status is null or r.status = p_status)
      and (p_target_type is null or r.target_type = p_target_type)
    order by r.created_at desc
    limit v_limit
    offset v_offset;
end;
$$;

revoke all on function public.get_moderation_reports(text, text, integer, integer) from public;
revoke all on function public.get_moderation_reports(text, text, integer, integer) from anon;
grant execute on function public.get_moderation_reports(text, text, integer, integer) to authenticated;

-- Controlled review decision. Locks the target row (mirrors accept_trip_request's pattern) so
-- two moderators acting on the same report at once serialize instead of racing, refuses to
-- re-decide a report that has already left 'pending' (covers both "already reviewed" and
-- concurrent double-submission with the same, single check), and records the decision in
-- moderation_actions in the same transaction as the reports update.
create or replace function public.review_report(
  p_report_id uuid,
  p_action text,
  p_note text default null
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_current_user_moderator() then
    raise exception 'not a moderator';
  end if;

  if p_action not in ('reviewed', 'dismissed') then
    raise exception 'invalid action';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;

  if not found then
    raise exception 'report not found';
  end if;

  if v_report.status <> 'pending' then
    raise exception 'report already reviewed';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  if v_note is not null and length(v_note) > 2000 then
    raise exception 'note too long';
  end if;

  update public.reports
  set status = p_action, reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = coalesce(v_note, resolution_note)
  where id = p_report_id
  returning * into v_report;

  insert into public.moderation_actions (report_id, moderator_id, action, note)
  values (p_report_id, auth.uid(), p_action, v_note);

  return v_report;
end;
$$;

revoke all on function public.review_report(uuid, text, text) from public;
revoke all on function public.review_report(uuid, text, text) from anon;
grant execute on function public.review_report(uuid, text, text) to authenticated;
