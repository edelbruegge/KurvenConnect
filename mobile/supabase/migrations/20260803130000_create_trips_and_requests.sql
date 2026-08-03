-- 20260803130000_create_trips_and_requests.sql
--
-- Supabase persistence for normal trips ("Fahrt"), their likes, and ride requests. Meetups,
-- requests-for-help ("Gesucht"), messages, groups and everything else stay purely local for
-- now (see project changelog). Trip comments are NOT part of this step either — they remain
-- purely local/in-memory, same as before.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/trigger is dropped
-- with `if exists` immediately before being recreated, so re-applying this file after a
-- partial or repeated run will not fail or duplicate anything.
--
-- Seat model: the existing app only ever tracked a single, directly editable "freie Plätze"
-- number (`FahrtDetails.freeSeats`) — there is no separate total-seats field and no concept of
-- deriving free seats from accepted requests. `seats_available` below is that same canonical
-- value, carried over as-is. It is NOT automatically decremented when a request is created or
-- accepted in this step, because the existing app has no "accepted request reduces seats" flow
-- yet — that remains a documented follow-up once an owner-facing accept/reject screen exists.

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  departure text not null,
  destination text not null,
  departure_time text not null,
  seats_available integer not null default 0,
  occasion text,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_departure_not_blank check (length(trim(departure)) > 0),
  constraint trips_destination_not_blank check (length(trim(destination)) > 0),
  constraint trips_departure_time_not_blank check (length(trim(departure_time)) > 0),
  constraint trips_description_not_blank check (length(trim(description)) > 0),
  constraint trips_description_max_length check (length(description) <= 2000),
  constraint trips_seats_available_not_negative check (seats_available >= 0)
);

create table if not exists public.trip_likes (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.trip_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  requester_id uuid not null references public.profiles (id),
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_requests_status_valid check (status in ('pending', 'accepted', 'rejected', 'cancelled'))
);

-- Only one active (pending) request per requester per trip at a time. A partial index (rather
-- than a plain unique constraint) deliberately allows a new request after a previous one was
-- rejected or cancelled.
create unique index if not exists trip_requests_unique_pending_per_requester
  on public.trip_requests (trip_id, requester_id)
  where status = 'pending';

create index if not exists trips_owner_id_idx on public.trips (owner_id);
create index if not exists trips_created_at_idx on public.trips (created_at);
create index if not exists trips_departure_time_idx on public.trips (departure_time);
create index if not exists trip_likes_trip_id_idx on public.trip_likes (trip_id);
create index if not exists trip_likes_user_id_idx on public.trip_likes (user_id);
create index if not exists trip_requests_trip_id_idx on public.trip_requests (trip_id);
create index if not exists trip_requests_requester_id_idx on public.trip_requests (requester_id);
create index if not exists trip_requests_status_idx on public.trip_requests (status);

alter table public.trips enable row level security;
alter table public.trip_likes enable row level security;
alter table public.trip_requests enable row level security;

-- trips

drop policy if exists "Authenticated users can read trips" on public.trips;
create policy "Authenticated users can read trips"
  on public.trips
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own trips" on public.trips;
create policy "Users can insert their own trips"
  on public.trips
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Users can update their own trips" on public.trips;
create policy "Users can update their own trips"
  on public.trips
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Users can delete their own trips" on public.trips;
create policy "Users can delete their own trips"
  on public.trips
  for delete
  to authenticated
  using (auth.uid() = owner_id);

-- trip_likes

drop policy if exists "Authenticated users can read trip likes" on public.trip_likes;
create policy "Authenticated users can read trip likes"
  on public.trip_likes
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own trip likes" on public.trip_likes;
create policy "Users can insert their own trip likes"
  on public.trip_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own trip likes" on public.trip_likes;
create policy "Users can delete their own trip likes"
  on public.trip_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- trip_requests

drop policy if exists "Requesters and trip owners can read trip requests" on public.trip_requests;
create policy "Requesters and trip owners can read trip requests"
  on public.trip_requests
  for select
  to authenticated
  using (
    auth.uid() = requester_id
    or auth.uid() = (select owner_id from public.trips where trips.id = trip_requests.trip_id)
  );

drop policy if exists "Users can request trips they do not own" on public.trip_requests;
create policy "Users can request trips they do not own"
  on public.trip_requests
  for insert
  to authenticated
  with check (
    auth.uid() = requester_id
    and exists (select 1 from public.trips where trips.id = trip_requests.trip_id)
    and auth.uid() <> (select owner_id from public.trips where trips.id = trip_requests.trip_id)
  );

-- Two separate, narrow update policies rather than one blanket one: a requester may only ever
-- move their own request to 'cancelled'; the trip owner may set any status on requests against
-- their own trips (accept/reject) — the latter has no dedicated UI yet in this step, but the
-- policy is in place so that capability can be added later without another migration.
drop policy if exists "Requesters can cancel their own trip request" on public.trip_requests;
create policy "Requesters can cancel their own trip request"
  on public.trip_requests
  for update
  to authenticated
  using (auth.uid() = requester_id)
  with check (auth.uid() = requester_id and status = 'cancelled');

drop policy if exists "Trip owners can manage requests for their trips" on public.trip_requests;
create policy "Trip owners can manage requests for their trips"
  on public.trip_requests
  for update
  to authenticated
  using (auth.uid() = (select owner_id from public.trips where trips.id = trip_requests.trip_id))
  with check (auth.uid() = (select owner_id from public.trips where trips.id = trip_requests.trip_id));

-- No delete policy on trip_requests: cancelling is modeled as a status update, not a row delete.

-- trip_id and requester_id must never change after a request is created.
create or replace function public.prevent_trip_request_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.trip_id <> old.trip_id or new.requester_id <> old.requester_id then
    raise exception 'trip_id and requester_id cannot be changed after a trip request is created';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_trip_request_identity_change on public.trip_requests;
create trigger prevent_trip_request_identity_change
  before update on public.trip_requests
  for each row execute function public.prevent_trip_request_identity_change();

-- Keep updated_at current, reusing the same trigger function already defined for profiles/posts.

drop trigger if exists set_trips_updated_at on public.trips;
create trigger set_trips_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

drop trigger if exists set_trip_requests_updated_at on public.trip_requests;
create trigger set_trip_requests_updated_at
  before update on public.trip_requests
  for each row execute function public.set_updated_at();

-- Table privileges: authenticated users get exactly what the app needs; anonymous users get
-- nothing (RLS would block them anyway since every policy is scoped to `to authenticated` and
-- checks auth.uid(), but the explicit revoke/grant makes the intent unambiguous).

revoke all on public.trips from anon;
revoke all on public.trip_likes from anon;
revoke all on public.trip_requests from anon;

grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, delete on public.trip_likes to authenticated;
grant select, insert, update on public.trip_requests to authenticated;
