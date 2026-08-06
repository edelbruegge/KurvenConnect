-- 20260807120000_create_reports.sql
--
-- Persistent, server-validated content/user reports. public.reports is the single source of
-- truth for a reporter's own reports; local seed content (messages, groups, seed posts/trips/
-- meetups/wanted entries) keeps using the existing purely local/in-memory reporting path — this
-- table only ever stores reports against real Supabase content (public.posts, post_comments,
-- trips, meetups, wanted_entries, profiles). No content, user, or existing report is deleted or
-- altered by this migration. Schema also prepares (but does not implement) a later moderation
-- queue via status/reviewed_by/reviewed_at/resolution_note — no moderator role exists yet, so
-- those fields are never writable by a normal client in this step.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/function is (re)created
-- with `drop ... if exists` / `create or replace` immediately before being (re)created, so
-- re-applying this file after a partial or repeated run will not fail or duplicate anything.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null,
  target_id text not null,
  target_owner_id uuid references public.profiles (id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_target_type_check check (target_type in ('post', 'comment', 'trip', 'meetup', 'wanted_entry', 'user')),
  constraint reports_status_check check (status in ('pending', 'reviewed', 'dismissed', 'actioned')),
  constraint reports_target_id_not_blank check (length(trim(target_id)) > 0),
  constraint reports_reason_not_blank check (length(trim(reason)) > 0),
  constraint reports_details_max_length check (details is null or length(details) <= 2000)
);

-- Prevents a second open (pending) report from the same reporter against the same target. Once a
-- report has moved past 'pending' (reviewed/dismissed/actioned), the same target can be reported
-- again — this is a partial index rather than a plain unique constraint specifically to allow
-- that re-reporting.
create unique index if not exists reports_unique_pending_target
  on public.reports (reporter_id, target_type, target_id)
  where status = 'pending';

create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reports_target_owner_id_idx on public.reports (target_owner_id);
create index if not exists reports_status_idx on public.reports (status);

drop trigger if exists set_reports_updated_at on public.reports;
create trigger set_reports_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

alter table public.reports enable row level security;

-- A reporter may only ever see their own reports — never who else reported the same target, and
-- never another user's reports.
drop policy if exists "Reporters can read their own reports" on public.reports;
create policy "Reporters can read their own reports"
  on public.reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy: every write goes through create_report() (SECURITY DEFINER)
-- below. This is what guarantees target_owner_id is always resolved server-side rather than
-- trusted from the client, and that status/reviewed_by/reviewed_at/resolution_note can never be
-- set by a normal client — there is no moderator role in this step, so those columns exist only
-- to prepare a later moderation queue.

revoke all on public.reports from anon;
grant select on public.reports to authenticated;
revoke insert, update, delete on public.reports from authenticated;

-- Central, controlled report-creation function. Resolves target_owner_id itself (never trusts a
-- client-supplied value), rejects self-reports and unknown/deleted targets, and relies on the
-- unique index above (plus an explicit pre-check for a clearer error) to reject a duplicate open
-- report. SECURITY DEFINER so it can look up owner columns across posts/post_comments/trips/
-- meetups/wanted_entries regardless of their own RLS — but every lookup is still scoped to the
-- exact target_id the caller passed in, nothing broader is ever read or returned.
create or replace function public.create_report(
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_details text default null
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_target_owner_id uuid;
  v_report public.reports;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_target_type not in ('post', 'comment', 'trip', 'meetup', 'wanted_entry', 'user') then
    raise exception 'invalid target type';
  end if;

  if length(trim(coalesce(p_target_id, ''))) = 0 then
    raise exception 'target id is required';
  end if;

  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason is required';
  end if;

  begin
    if p_target_type = 'post' then
      select author_id into v_target_owner_id from public.posts where id = p_target_id::uuid;
    elsif p_target_type = 'comment' then
      select author_id into v_target_owner_id from public.post_comments where id = p_target_id::uuid;
    elsif p_target_type = 'trip' then
      select owner_id into v_target_owner_id from public.trips where id = p_target_id::uuid;
    elsif p_target_type = 'meetup' then
      select organizer_id into v_target_owner_id from public.meetups where id = p_target_id::uuid;
    elsif p_target_type = 'wanted_entry' then
      select owner_id into v_target_owner_id from public.wanted_entries where id = p_target_id::uuid;
    elsif p_target_type = 'user' then
      select id into v_target_owner_id from public.profiles where id = p_target_id::uuid;
    end if;
  exception
    when invalid_text_representation then
      raise exception 'target not found';
  end;

  if v_target_owner_id is null then
    raise exception 'target not found';
  end if;

  if v_target_owner_id = v_self then
    raise exception 'cannot report your own content';
  end if;

  if exists (
    select 1 from public.reports
    where reporter_id = v_self and target_type = p_target_type and target_id = p_target_id and status = 'pending'
  ) then
    raise exception 'already reported';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_owner_id, reason, details)
  values (v_self, p_target_type, p_target_id, v_target_owner_id, trim(p_reason), nullif(trim(coalesce(p_details, '')), ''))
  returning * into v_report;

  return v_report;
end;
$$;

revoke all on function public.create_report(text, text, text, text) from public;
revoke all on function public.create_report(text, text, text, text) from anon;
grant execute on function public.create_report(text, text, text, text) to authenticated;
