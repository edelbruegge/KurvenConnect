-- 20260804120000_create_notifications.sql
--
-- Persistent, server-generated in-app notifications. No new content data is created — every
-- notification is a trigger-driven side effect of something that already happens (a message is
-- sent, a trip request is created/answered, a meetup is joined/left). Local seed notifications
-- stay purely local/in-memory, exactly as before — nothing here touches or migrates them.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/function/trigger is
-- (re)created with `drop ... if exists` / `create or replace` immediately before being
-- (re)created, so re-applying this file after a partial or repeated run will not fail or
-- duplicate anything.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  reference_type text,
  reference_id text,
  event_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (
    type in (
      'message_received',
      'trip_request_received',
      'trip_request_accepted',
      'trip_request_rejected',
      'meetup_joined',
      'meetup_left'
    )
  ),
  constraint notifications_reference_type_check
    check (reference_type is null or reference_type in ('conversation', 'trip', 'meetup', 'profile')),
  constraint notifications_reference_id_requires_type check (reference_id is null or reference_type is not null),
  constraint notifications_title_not_blank check (length(trim(title)) > 0),
  constraint notifications_body_not_blank check (length(trim(body)) > 0)
);

create index if not exists notifications_recipient_id_idx on public.notifications (recipient_id);
create index if not exists notifications_recipient_unread_idx on public.notifications (recipient_id, read_at);
create index if not exists notifications_created_at_idx on public.notifications (created_at);
-- event_key is already indexed via the unique constraint above — no separate index needed.

alter table public.notifications enable row level security;

drop policy if exists "Recipients can read their own notifications" on public.notifications;
create policy "Recipients can read their own notifications"
  on public.notifications
  for select
  to authenticated
  using (recipient_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy: notifications are only ever written by the trigger functions
-- below (SECURITY DEFINER) and read/marked-as-read via the two functions further down.

revoke all on public.notifications from anon;
grant select on public.notifications to authenticated;
revoke insert, update, delete on public.notifications from authenticated;

-- Central creation helper, used exclusively by the trigger functions below. Not callable from
-- the app: EXECUTE is revoked from every client-facing role. `on conflict (event_key) do
-- nothing` makes every caller idempotent — a trigger re-firing (or a duplicated status
-- transition) can never produce a duplicate notification.
create or replace function public.create_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_reference_type text,
  p_reference_id text,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient_id = p_actor_id then
    return;
  end if;

  insert into public.notifications (
    recipient_id, actor_id, type, title, body, reference_type, reference_id, event_key
  )
  values (
    p_recipient_id, p_actor_id, p_type, p_title, p_body, p_reference_type, p_reference_id, p_event_key
  )
  on conflict (event_key) do nothing;
end;
$$;

revoke all on function public.create_notification(uuid, uuid, text, text, text, text, text, text) from public;
revoke all on function public.create_notification(uuid, uuid, text, text, text, text, text, text) from anon;
revoke all on function public.create_notification(uuid, uuid, text, text, text, text, text, text) from authenticated;

-- New message -> notify the other conversation member.
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
  v_preview text;
begin
  select user_id into v_recipient_id
  from public.conversation_members
  where conversation_id = new.conversation_id and user_id <> new.sender_id
  limit 1;

  if v_recipient_id is null then
    return new;
  end if;

  v_preview := left(new.content, 140);

  perform public.create_notification(
    v_recipient_id,
    new.sender_id,
    'message_received',
    'Neue Nachricht',
    v_preview,
    'conversation',
    new.conversation_id::text,
    'message:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists on_message_notify on public.messages;
create trigger on_message_notify
  after insert on public.messages
  for each row execute function public.notify_on_new_message();

-- New (pending) trip request -> notify the trip owner.
create or replace function public.notify_on_trip_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select owner_id into v_owner_id from public.trips where id = new.trip_id;

  if v_owner_id is null then
    return new;
  end if;

  perform public.create_notification(
    v_owner_id,
    new.requester_id,
    'trip_request_received',
    'Neue Fahrtanfrage',
    'Jemand möchte bei deiner Fahrt mitfahren.',
    'trip',
    new.trip_id::text,
    'trip_request_created:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists on_trip_request_notify_created on public.trip_requests;
create trigger on_trip_request_notify_created
  after insert on public.trip_requests
  for each row execute function public.notify_on_trip_request_created();

-- Trip request accepted/rejected -> notify the requester. Cancellations are not notified in
-- this step (see project changelog / final report — documented as a possible follow-up).
create or replace function public.notify_on_trip_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('accepted', 'rejected') then
    return new;
  end if;

  select owner_id into v_owner_id from public.trips where id = new.trip_id;

  if v_owner_id is null then
    return new;
  end if;

  v_title := case when new.status = 'accepted' then 'Fahrtanfrage angenommen' else 'Fahrtanfrage abgelehnt' end;

  perform public.create_notification(
    new.requester_id,
    v_owner_id,
    case when new.status = 'accepted' then 'trip_request_accepted' else 'trip_request_rejected' end,
    v_title,
    case
      when new.status = 'accepted' then 'Deine Anfrage für eine Mitfahrgelegenheit wurde angenommen.'
      else 'Deine Anfrage für eine Mitfahrgelegenheit wurde abgelehnt.'
    end,
    'trip',
    new.trip_id::text,
    'trip_request_status:' || new.id::text || ':' || new.status
  );

  return new;
end;
$$;

drop trigger if exists on_trip_request_notify_status on public.trip_requests;
create trigger on_trip_request_notify_status
  after update on public.trip_requests
  for each row execute function public.notify_on_trip_request_status_change();

-- Meetup joined -> notify the organizer.
create or replace function public.notify_on_meetup_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_id uuid;
begin
  select organizer_id into v_organizer_id from public.meetups where id = new.meetup_id;

  if v_organizer_id is null then
    return new;
  end if;

  perform public.create_notification(
    v_organizer_id,
    new.user_id,
    'meetup_joined',
    'Neue Teilnahme',
    'Jemand nimmt an deinem Treffpunkt teil.',
    'meetup',
    new.meetup_id::text,
    'meetup_join:' || new.meetup_id::text || ':' || new.user_id::text || ':' || new.joined_at::text
  );

  return new;
end;
$$;

drop trigger if exists on_meetup_join_notify on public.meetup_attendees;
create trigger on_meetup_join_notify
  after insert on public.meetup_attendees
  for each row execute function public.notify_on_meetup_joined();

-- Meetup left -> notify the organizer.
create or replace function public.notify_on_meetup_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_id uuid;
begin
  select organizer_id into v_organizer_id from public.meetups where id = old.meetup_id;

  if v_organizer_id is null then
    return old;
  end if;

  perform public.create_notification(
    v_organizer_id,
    old.user_id,
    'meetup_left',
    'Teilnahme abgesagt',
    'Jemand hat seine Teilnahme an deinem Treffpunkt abgesagt.',
    'meetup',
    old.meetup_id::text,
    'meetup_leave:' || old.meetup_id::text || ':' || old.user_id::text || ':' || old.joined_at::text
  );

  return old;
end;
$$;

drop trigger if exists on_meetup_leave_notify on public.meetup_attendees;
create trigger on_meetup_leave_notify
  after delete on public.meetup_attendees
  for each row execute function public.notify_on_meetup_left();

-- Controlled read-status functions. The app never updates public.notifications directly (no
-- UPDATE grant exists above) — both go through these SECURITY DEFINER functions.

create or replace function public.mark_notification_read(p_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification public.notifications;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.notifications
  set read_at = now()
  where id = p_notification_id and recipient_id = auth.uid() and read_at is null
  returning * into v_notification;

  if v_notification.id is null then
    select * into v_notification
    from public.notifications
    where id = p_notification_id and recipient_id = auth.uid();
  end if;

  if v_notification.id is null then
    raise exception 'notification not found';
  end if;

  return v_notification;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid() and read_at is null;

  get diagnostics v_updated_count = row_count;

  return v_updated_count;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_notification_read(uuid) from anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

revoke all on function public.mark_all_notifications_read() from public;
revoke all on function public.mark_all_notifications_read() from anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Realtime publication: only INSERT events are consumed by the app, so REPLICA IDENTITY FULL is
-- not required.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
