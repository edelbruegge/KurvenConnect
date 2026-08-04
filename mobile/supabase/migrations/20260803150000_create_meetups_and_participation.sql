-- 20260803150000_create_meetups_and_participation.sql
--
-- Supabase persistence for meetups ("Treffpunkt"), their likes, and attendance. Requests-for-
-- help ("Gesucht"), messages, groups and everything else stay purely local for now (see project
-- changelog). Meetup comments are NOT part of this step either — they remain purely
-- local/in-memory, same as trip comments.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/function/trigger is
-- (re)created with `drop ... if exists` / `create or replace` immediately before being
-- (re)created, so re-applying this file after a partial or repeated run will not fail or
-- duplicate anything.
--
-- Attendee-count model: the existing app never stores the organizer in its `attendeeIds` list —
-- `getMeetupAttendeeCount()` always adds 1 for the organizer on top of `attendeeIds.length`.
-- That exact meaning is preserved here: `meetup_attendees` never contains a row for the
-- organizer (enforced by `join_meetup()`, the only write path), and `max_attendees` continues to
-- implicitly include the organizer — capacity is checked as
-- `(existing meetup_attendees rows) + 1 (organizer) + 1 (the row about to be inserted)`.

create table if not exists public.meetups (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  location text not null,
  starts_at timestamptz not null,
  max_attendees integer,
  game_id text not null,
  game_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetups_title_not_blank check (length(trim(title)) > 0),
  constraint meetups_title_max_length check (length(title) <= 200),
  constraint meetups_description_not_blank check (length(trim(description)) > 0),
  constraint meetups_description_max_length check (length(description) <= 2000),
  constraint meetups_location_not_blank check (length(trim(location)) > 0),
  constraint meetups_max_attendees_positive check (max_attendees is null or max_attendees > 0)
);

create table if not exists public.meetup_likes (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create table if not exists public.meetup_attendees (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  joined_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create index if not exists meetups_organizer_id_idx on public.meetups (organizer_id);
create index if not exists meetups_starts_at_idx on public.meetups (starts_at);
create index if not exists meetups_created_at_idx on public.meetups (created_at);
create index if not exists meetup_likes_meetup_id_idx on public.meetup_likes (meetup_id);
create index if not exists meetup_likes_user_id_idx on public.meetup_likes (user_id);
create index if not exists meetup_attendees_meetup_id_idx on public.meetup_attendees (meetup_id);
create index if not exists meetup_attendees_user_id_idx on public.meetup_attendees (user_id);

alter table public.meetups enable row level security;
alter table public.meetup_likes enable row level security;
alter table public.meetup_attendees enable row level security;

-- meetups

drop policy if exists "Authenticated users can read meetups" on public.meetups;
create policy "Authenticated users can read meetups"
  on public.meetups
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own meetups" on public.meetups;
create policy "Users can insert their own meetups"
  on public.meetups
  for insert
  to authenticated
  with check (auth.uid() = organizer_id);

drop policy if exists "Users can update their own meetups" on public.meetups;
create policy "Users can update their own meetups"
  on public.meetups
  for update
  to authenticated
  using (auth.uid() = organizer_id)
  with check (auth.uid() = organizer_id);

drop policy if exists "Users can delete their own meetups" on public.meetups;
create policy "Users can delete their own meetups"
  on public.meetups
  for delete
  to authenticated
  using (auth.uid() = organizer_id);

-- meetup_likes

drop policy if exists "Authenticated users can read meetup likes" on public.meetup_likes;
create policy "Authenticated users can read meetup likes"
  on public.meetup_likes
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own meetup likes" on public.meetup_likes;
create policy "Users can insert their own meetup likes"
  on public.meetup_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own meetup likes" on public.meetup_likes;
create policy "Users can delete their own meetup likes"
  on public.meetup_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- meetup_attendees: read-only for the app. All writes go through join_meetup()/leave_meetup()
-- below (SECURITY DEFINER, bypasses RLS) — no INSERT/DELETE policy is defined, and the table
-- grants further down explicitly withhold INSERT/UPDATE/DELETE from `authenticated`, so a direct
-- client-side write can never bypass the capacity check.

drop policy if exists "Authenticated users can read meetup attendees" on public.meetup_attendees;
create policy "Authenticated users can read meetup attendees"
  on public.meetup_attendees
  for select
  to authenticated
  using (true);

-- Keep updated_at current on meetups, reusing the same trigger function already defined for
-- profiles/posts/trips.

drop trigger if exists set_meetups_updated_at on public.meetups;
create trigger set_meetups_updated_at
  before update on public.meetups
  for each row execute function public.set_updated_at();

-- Atomic join: locks the meetup row so concurrent joins to the same meetup serialize on it,
-- re-checks capacity server-side (never trusts the caller), and returns the authoritative,
-- up-to-date attendee id list so the app never has to compute attendee counts itself.
create or replace function public.join_meetup(p_meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meetup public.meetups;
  v_existing_count integer;
  v_attendee_ids uuid[];
begin
  select * into v_meetup from public.meetups where id = p_meetup_id for update;

  if not found then
    raise exception 'meetup not found';
  end if;

  if v_meetup.organizer_id = auth.uid() then
    raise exception 'organizer cannot join their own meetup';
  end if;

  if exists (select 1 from public.meetup_attendees where meetup_id = p_meetup_id and user_id = auth.uid()) then
    raise exception 'already attending this meetup';
  end if;

  select count(*) into v_existing_count from public.meetup_attendees where meetup_id = p_meetup_id;

  -- Total attendee count including the organizer, if this join succeeds, would be
  -- v_existing_count + 1 (organizer) + 1 (this join) — mirrors the app's isMeetupFull() exactly.
  if v_meetup.max_attendees is not null and (v_existing_count + 2) > v_meetup.max_attendees then
    raise exception 'meetup is fully booked';
  end if;

  insert into public.meetup_attendees (meetup_id, user_id) values (p_meetup_id, auth.uid());

  select array_agg(user_id) into v_attendee_ids from public.meetup_attendees where meetup_id = p_meetup_id;

  return jsonb_build_object('attendee_ids', coalesce(to_jsonb(v_attendee_ids), '[]'::jsonb));
end;
$$;

-- Atomic leave: only ever removes the caller's own row. The organizer never has a row here
-- (join_meetup refuses them one), so calling this as the organizer naturally raises "not
-- attending" without any special-case code.
create or replace function public.leave_meetup(p_meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendee_ids uuid[];
  v_deleted_count integer;
begin
  delete from public.meetup_attendees where meetup_id = p_meetup_id and user_id = auth.uid();
  get diagnostics v_deleted_count = row_count;

  if v_deleted_count = 0 then
    raise exception 'not attending this meetup';
  end if;

  select array_agg(user_id) into v_attendee_ids from public.meetup_attendees where meetup_id = p_meetup_id;

  return jsonb_build_object('attendee_ids', coalesce(to_jsonb(v_attendee_ids), '[]'::jsonb));
end;
$$;

revoke all on function public.join_meetup(uuid) from public;
revoke all on function public.leave_meetup(uuid) from public;

grant execute on function public.join_meetup(uuid) to authenticated;
grant execute on function public.leave_meetup(uuid) to authenticated;

-- Table privileges: authenticated users get exactly what the app needs; anonymous users get
-- nothing. meetup_attendees intentionally gets SELECT only — every write goes through the two
-- functions above, which run with elevated privileges regardless of this grant.

revoke all on public.meetups from anon;
revoke all on public.meetup_likes from anon;
revoke all on public.meetup_attendees from anon;

grant select, insert, update, delete on public.meetups to authenticated;
grant select, insert, delete on public.meetup_likes to authenticated;
grant select on public.meetup_attendees to authenticated;
revoke insert, update, delete on public.meetup_attendees from authenticated;
