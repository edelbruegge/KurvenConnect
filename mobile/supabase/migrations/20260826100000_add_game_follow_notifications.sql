-- 20260826100000_add_game_follow_notifications.sql
--
-- Repair migration: 20260825100000_create_game_follows.sql only created public.game_follows
-- itself -- deliberately, per that step's scope -- with no server-side notification-generation
-- infrastructure at all. This migration adds exactly that missing piece, integrated into the
-- existing public.notifications architecture (20260804120000_create_notifications.sql): same
-- create_notification() helper, same event_key idempotency, same realtime publication. No second,
-- parallel notification system.
--
-- Diagnosis (see final report): before this migration, public.posts/public.trips/public.meetups
-- had zero AFTER INSERT triggers referencing game_follows or create_notification at all -- grepped
-- across every migration file, confirmed absent. That is the entire reason Account A never
-- received a notification for Account B's new post: nothing was ever generating one.
--
-- Fahrten ("Fahrt"), Treffpunkte ("Treffpunkt") and Beiträge ("Beitrag") live in three separate
-- tables (public.posts/public.trips/public.meetups respectively, see their own create-table
-- migrations) -- not one shared "posts" table with a category enum -- so this needs three
-- separate triggers, one per table, exactly as requested. Gesucht (public.wanted_entries) is
-- deliberately NOT included here -- out of the requested scope (post/trip/meetup only).
--
-- Purely additive: every constraint change only widens an existing `in (...)` list (all
-- previously-valid values kept, verified against every prior migration that touched these two
-- constraints), every function is `create or replace`, every trigger is `drop ... if exists` +
-- `create trigger`, the new index uses `if not exists`. No existing row updated or deleted, no
-- existing posts/trips/meetups/game_follows/notifications touched. Safe to re-run.
--
-- Not run remotely as part of this step.

-- ---------------------------------------------------------------------------------------------
-- Widen notifications_type_check with the three new game-follow event types. Full existing list
-- reproduced from the two migrations that have ever defined this constraint
-- (20260804120000_create_notifications.sql's original 6, 20260813120000_add_group_notifications
-- .sql's 8 group types, 20260815100000_create_user_follows.sql's user_follow) -- read directly,
-- not assumed, after the exact "narrowed the list by accident" failure documented in
-- 20260815100000_create_user_follows.sql's own header comment.
-- ---------------------------------------------------------------------------------------------

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
      'game_new_meetup'
    )
  );

-- Widen notifications_reference_type_check with 'post' -- needed so a game_new_post notification
-- (reference_id = the new post's id) can be stored at all. 'trip'/'meetup' are already allowed
-- (present since the original migration) and are reused unchanged for game_new_trip/
-- game_new_meetup -- lib/notification-navigation.ts's existing fallthrough (any non-
-- trip_request_received 'trip' reference already routes to /post/[id], exactly like
-- trip_request_accepted/rejected already do today) and its explicit 'meetup' branch (-> /meetup/
-- [id]) already handle both correctly with zero client routing changes.
alter table public.notifications drop constraint if exists notifications_reference_type_check;
alter table public.notifications add constraint notifications_reference_type_check
  check (reference_type is null or reference_type in ('conversation', 'trip', 'meetup', 'profile', 'group', 'post'));

-- ---------------------------------------------------------------------------------------------
-- game_follows only had its primary key (user_id, game_id) -- leading column user_id is already
-- indexed via that PK, but the lookup these triggers need ("everyone following this game_id") is
-- on the second/non-leading PK column, which is not efficiently searchable without its own index.
-- ---------------------------------------------------------------------------------------------

create index if not exists game_follows_game_id_idx on public.game_follows (game_id);

-- ---------------------------------------------------------------------------------------------
-- public.posts ("Beitrag") -> notify every follower of NEW.game_id except the author. Fires once
-- per stored post row (AFTER INSERT), so a realtime echo of that same row can never create a
-- second notification. event_key includes both the post id and the recipient id, so the same post
-- can never double-notify the same follower even if this trigger were somehow invoked twice.
-- Skips silently (no notification to anyone) when NEW.game_id is null -- a post not tied to any
-- game has no followers to notify, per the requested "keine Notification ohne Game" rule.
-- ---------------------------------------------------------------------------------------------

create or replace function public.notify_followers_on_game_new_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_name text;
  v_body text;
  v_follower record;
begin
  if new.game_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(display_name), ''), 'Ein Mitglied') into v_author_name
  from public.profiles
  where id = new.author_id;

  v_body := coalesce(v_author_name, 'Ein Mitglied') || ' hat einen neuen Beitrag zu ' ||
    coalesce(new.game_label, 'eurem gemeinsamen Spiel') || ' veröffentlicht.';

  for v_follower in
    select gf.user_id
    from public.game_follows gf
    where gf.game_id = new.game_id
      and gf.user_id <> new.author_id
      and not public.are_users_blocked(gf.user_id, new.author_id)
  loop
    perform public.create_notification(
      v_follower.user_id,
      new.author_id,
      'game_new_post',
      'Neuer Beitrag zu deinem Spiel',
      v_body,
      'post',
      new.id::text,
      'game_new_post:' || new.id::text || ':' || v_follower.user_id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists on_post_game_follow_notify on public.posts;
create trigger on_post_game_follow_notify
  after insert on public.posts
  for each row execute function public.notify_followers_on_game_new_post();

-- ---------------------------------------------------------------------------------------------
-- public.trips ("Fahrt") -> notify every follower of NEW.game_id except the owner. Same
-- reasoning/shape as the post trigger above; reference_type stays 'trip' (already allowed),
-- reference_id is the trip's own id.
-- ---------------------------------------------------------------------------------------------

create or replace function public.notify_followers_on_game_new_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_name text;
  v_body text;
  v_follower record;
begin
  if new.game_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(display_name), ''), 'Ein Mitglied') into v_owner_name
  from public.profiles
  where id = new.owner_id;

  v_body := coalesce(v_owner_name, 'Ein Mitglied') || ' hat eine neue Fahrt zu ' ||
    coalesce(new.game_label, 'eurem gemeinsamen Spiel') || ' angeboten.';

  for v_follower in
    select gf.user_id
    from public.game_follows gf
    where gf.game_id = new.game_id
      and gf.user_id <> new.owner_id
      and not public.are_users_blocked(gf.user_id, new.owner_id)
  loop
    perform public.create_notification(
      v_follower.user_id,
      new.owner_id,
      'game_new_trip',
      'Neue Fahrt zu deinem Spiel',
      v_body,
      'trip',
      new.id::text,
      'game_new_trip:' || new.id::text || ':' || v_follower.user_id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists on_trip_game_follow_notify on public.trips;
create trigger on_trip_game_follow_notify
  after insert on public.trips
  for each row execute function public.notify_followers_on_game_new_trip();

-- ---------------------------------------------------------------------------------------------
-- public.meetups ("Treffpunkt") -> notify every follower of NEW.game_id except the organizer.
-- game_id/game_label are NOT NULL on this table already (see
-- 20260803150000_create_meetups_and_participation.sql), so the "no game_id -> no notification"
-- guard can never actually trigger here in practice -- kept anyway for defensive symmetry with
-- the other two triggers and in case that constraint is ever relaxed later.
-- ---------------------------------------------------------------------------------------------

create or replace function public.notify_followers_on_game_new_meetup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_name text;
  v_body text;
  v_follower record;
begin
  if new.game_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(display_name), ''), 'Ein Mitglied') into v_organizer_name
  from public.profiles
  where id = new.organizer_id;

  v_body := coalesce(v_organizer_name, 'Ein Mitglied') || ' hat einen neuen Treffpunkt zu ' ||
    coalesce(new.game_label, 'eurem gemeinsamen Spiel') || ' erstellt.';

  for v_follower in
    select gf.user_id
    from public.game_follows gf
    where gf.game_id = new.game_id
      and gf.user_id <> new.organizer_id
      and not public.are_users_blocked(gf.user_id, new.organizer_id)
  loop
    perform public.create_notification(
      v_follower.user_id,
      new.organizer_id,
      'game_new_meetup',
      'Neuer Treffpunkt zu deinem Spiel',
      v_body,
      'meetup',
      new.id::text,
      'game_new_meetup:' || new.id::text || ':' || v_follower.user_id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists on_meetup_game_follow_notify on public.meetups;
create trigger on_meetup_game_follow_notify
  after insert on public.meetups
  for each row execute function public.notify_followers_on_game_new_meetup();
