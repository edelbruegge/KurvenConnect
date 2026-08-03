-- 20260803140000_manage_trip_request_status.sql
--
-- Adds owner-facing trip request management (accept/reject) and atomic, race-safe seat
-- accounting on top of the existing public.trips / public.trip_requests tables. No new
-- table is created here.
--
-- Status transitions enforced (both inside the functions below AND, defense-in-depth, in the
-- RLS policies): pending -> accepted, pending -> rejected, pending -> cancelled,
-- accepted -> cancelled. No other transition is possible.
--
-- Safe to re-run: column addition uses `if not exists`, functions use `create or replace`,
-- policies/triggers are dropped with `if exists` immediately before being recreated.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).

alter table public.trip_requests add column if not exists responded_at timestamptz;

-- Strengthen the existing identity-protection trigger to also cover `id` and `created_at`
-- (previously only trip_id/requester_id were protected). Same trigger, no new one needed.
create or replace function public.prevent_trip_request_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id
    or new.trip_id <> old.trip_id
    or new.requester_id <> old.requester_id
    or new.created_at <> old.created_at
  then
    raise exception 'id, trip_id, requester_id and created_at cannot be changed after a trip request is created';
  end if;

  return new;
end;
$$;

-- Atomic accept: locks both rows, re-checks everything server-side (never trusts the caller),
-- decrements seats_available by exactly 1, and returns the updated request + the authoritative
-- new seat count in a single round-trip so the app never computes seat counts itself.
create or replace function public.accept_trip_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.trip_requests;
  v_trip public.trips;
begin
  select * into v_request from public.trip_requests where id = p_request_id for update;

  if not found then
    raise exception 'trip request not found';
  end if;

  select * into v_trip from public.trips where id = v_request.trip_id for update;

  if not found then
    raise exception 'trip not found';
  end if;

  if v_trip.owner_id <> auth.uid() then
    raise exception 'not authorized to manage this trip request';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'trip request is no longer pending';
  end if;

  if v_trip.seats_available <= 0 then
    raise exception 'no seats available for this trip';
  end if;

  update public.trips set seats_available = seats_available - 1 where id = v_trip.id
    returning seats_available into v_trip.seats_available;

  update public.trip_requests set status = 'accepted', responded_at = now() where id = p_request_id
    returning * into v_request;

  return jsonb_build_object('request', to_jsonb(v_request), 'seats_available', v_trip.seats_available);
end;
$$;

-- Atomic reject: no seat change, only the trip owner may reject a still-pending request.
create or replace function public.reject_trip_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.trip_requests;
  v_trip public.trips;
begin
  select * into v_request from public.trip_requests where id = p_request_id for update;

  if not found then
    raise exception 'trip request not found';
  end if;

  select * into v_trip from public.trips where id = v_request.trip_id;

  if not found then
    raise exception 'trip not found';
  end if;

  if v_trip.owner_id <> auth.uid() then
    raise exception 'not authorized to manage this trip request';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'trip request is no longer pending';
  end if;

  update public.trip_requests set status = 'rejected', responded_at = now() where id = p_request_id
    returning * into v_request;

  return jsonb_build_object('request', to_jsonb(v_request), 'seats_available', v_trip.seats_available);
end;
$$;

-- Atomic cancel (requester-initiated): allowed from 'pending' or 'accepted'. Only releases a
-- seat back when the request had actually consumed one (i.e. was 'accepted'). Never touches
-- responded_at — cancellation is the requester's own action, not an owner response.
create or replace function public.cancel_trip_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.trip_requests;
  v_seats integer;
begin
  select * into v_request from public.trip_requests where id = p_request_id for update;

  if not found then
    raise exception 'trip request not found';
  end if;

  if v_request.requester_id <> auth.uid() then
    raise exception 'not authorized to manage this trip request';
  end if;

  if v_request.status not in ('pending', 'accepted') then
    raise exception 'trip request can no longer be cancelled';
  end if;

  if v_request.status = 'accepted' then
    update public.trips set seats_available = seats_available + 1 where id = v_request.trip_id
      returning seats_available into v_seats;
  else
    select seats_available into v_seats from public.trips where id = v_request.trip_id;
  end if;

  update public.trip_requests set status = 'cancelled' where id = p_request_id
    returning * into v_request;

  return jsonb_build_object('request', to_jsonb(v_request), 'seats_available', v_seats);
end;
$$;

-- Functions are executable by PUBLIC by default in Postgres unless revoked — lock them down to
-- `authenticated` only. auth.uid() is checked inside each function regardless (never trust the
-- app's visible buttons alone).
revoke all on function public.accept_trip_request(uuid) from public;
revoke all on function public.reject_trip_request(uuid) from public;
revoke all on function public.cancel_trip_request(uuid) from public;

grant execute on function public.accept_trip_request(uuid) to authenticated;
grant execute on function public.reject_trip_request(uuid) to authenticated;
grant execute on function public.cancel_trip_request(uuid) to authenticated;

-- Force every status change through the three functions above: revoke direct UPDATE access on
-- trip_requests entirely. Without this, a direct `.update({status:'accepted'})` from the app (or
-- any other client) could change status without ever touching seats_available, silently
-- breaking seat accounting even though it would technically be a valid transition.
revoke update on public.trip_requests from authenticated;

-- RLS UPDATE policies, tightened to the exact allowed transition matrix. Technically
-- unreachable now that UPDATE has been revoked above, but kept correct and specific as a
-- documented defense-in-depth backstop (e.g. if a future migration ever re-grants UPDATE).
drop policy if exists "Requesters can cancel their own trip request" on public.trip_requests;
create policy "Requesters can cancel their own trip request"
  on public.trip_requests
  for update
  to authenticated
  using (auth.uid() = requester_id and status in ('pending', 'accepted'))
  with check (auth.uid() = requester_id and status = 'cancelled');

drop policy if exists "Trip owners can manage requests for their trips" on public.trip_requests;
create policy "Trip owners can manage requests for their trips"
  on public.trip_requests
  for update
  to authenticated
  using (
    auth.uid() = (select owner_id from public.trips where trips.id = trip_requests.trip_id)
    and status = 'pending'
  )
  with check (
    auth.uid() = (select owner_id from public.trips where trips.id = trip_requests.trip_id)
    and status in ('accepted', 'rejected')
  );
