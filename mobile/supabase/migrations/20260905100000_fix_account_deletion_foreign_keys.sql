-- 20260905100000_fix_account_deletion_foreign_keys.sql
--
-- Fixes "Failed to delete user: Database error deleting user" in the Supabase Dashboard's Auth ->
-- Delete user action. Root cause: `public.profiles.id` already cascades from `auth.users.id`
-- (001_auth_profiles.sql), but roughly a third of the tables that in turn reference
-- `public.profiles (id)` were defined with NO explicit `on delete` clause. Postgres defaults an
-- unspecified foreign key action to NO ACTION -- the very first such row Postgres encounters while
-- cascading the profile delete raises a foreign-key-violation, which aborts the whole `auth.users`
-- delete and surfaces exactly as "Database error deleting user" in the Dashboard. There is no
-- separate account-deletion Edge Function or RPC anywhere in this project (confirmed by search) --
-- the Dashboard's admin delete is the only existing deletion path, so this is fixed entirely at the
-- schema level.
--
-- Every table referencing public.profiles (id) was audited (grep across all migrations for
-- "references public.profiles" / "references auth.users" -- see the summary below). Two policies
-- are applied, matching the two patterns this project already uses elsewhere for the exact same
-- kind of column (target_owner_id/reviewed_by/actor_id already do on delete set null; posts/trips/
-- meetups/wanted_entries' own owner columns already do on delete cascade):
--
--   1) ON DELETE CASCADE -- for a table row that IS the deleted user's own content/interaction and
--      has no meaning once they're gone (a like, a save, a comment they wrote, an attendance/
--      request they made). Removing it only ever removes the deleted user's own data, never
--      another user's.
--   2) ON DELETE SET NULL -- for a column that attributes a shared/communal object (a conversation,
--      a message, a moderation record) to a user, where the OBJECT ITSELF must survive for other
--      people (the other conversation participant, remaining group members, moderation history)
--      even though the specific person is gone. Requires relaxing `not null` on that column first,
--      exactly like the already-existing `content_restrictions.created_by` pattern in spirit
--      (that one just happened to be defined not-null-with-no-fallback from the start; the ones
--      fixed here were defined not null with no on-delete clause at all, which is the actual bug).
--
-- groups.owner_id is the one column handled differently, deliberately NOT via on delete set null:
-- see the trigger and its comment near the bottom of this file for why.
--
-- No data is deleted or altered by *running this migration itself* -- it only changes constraint
-- definitions (drop + re-add each foreign key, which is metadata-only and touches zero rows) and
-- adds one new trigger function. It changes what happens to a user's own already-existing rows the
-- *next* time an account is actually deleted through the Dashboard, which is exactly the intended,
-- requested fix. No existing migration file is edited; this is purely additive.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`) -- NOT run
-- as part of this change. Safe to re-run: every constraint is dropped with `if exists` before being
-- re-added, and the trigger is dropped with `if exists` before being recreated.

-- ---------------------------------------------------------------------------------------------
-- ON DELETE CASCADE: the deleted user's own likes/saves/comments/attendance/requests. Never
-- touches a row that belongs to (or was made on) another user's content.
-- ---------------------------------------------------------------------------------------------

alter table public.meetup_likes drop constraint if exists meetup_likes_user_id_fkey;
alter table public.meetup_likes
  add constraint meetup_likes_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.meetup_attendees drop constraint if exists meetup_attendees_user_id_fkey;
alter table public.meetup_attendees
  add constraint meetup_attendees_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.wanted_likes drop constraint if exists wanted_likes_user_id_fkey;
alter table public.wanted_likes
  add constraint wanted_likes_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.post_comments drop constraint if exists post_comments_author_id_fkey;
alter table public.post_comments
  add constraint post_comments_author_id_fkey foreign key (author_id) references public.profiles (id) on delete cascade;

alter table public.post_likes drop constraint if exists post_likes_user_id_fkey;
alter table public.post_likes
  add constraint post_likes_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.trip_likes drop constraint if exists trip_likes_user_id_fkey;
alter table public.trip_likes
  add constraint trip_likes_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

-- A ride request the deleted user made on someone else's trip -- removing it only removes their own
-- (now moot) request, exactly like group_join_requests.requester_id already does.
alter table public.trip_requests drop constraint if exists trip_requests_requester_id_fkey;
alter table public.trip_requests
  add constraint trip_requests_requester_id_fkey foreign key (requester_id) references public.profiles (id) on delete cascade;

alter table public.post_saves drop constraint if exists post_saves_user_id_fkey;
alter table public.post_saves
  add constraint post_saves_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.trip_saves drop constraint if exists trip_saves_user_id_fkey;
alter table public.trip_saves
  add constraint trip_saves_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.meetup_saves drop constraint if exists meetup_saves_user_id_fkey;
alter table public.meetup_saves
  add constraint meetup_saves_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.wanted_saves drop constraint if exists wanted_saves_user_id_fkey;
alter table public.wanted_saves
  add constraint wanted_saves_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------------------------
-- ON DELETE SET NULL: the referenced object is shared/communal and must survive for the people
-- still around, so the row itself is kept -- only the "who" attribution is cleared. Every column
-- below is relaxed to nullable first (identical end state to how target_owner_id/reviewed_by/
-- actor_id were already defined nullable+set null from the start elsewhere in this project); the
-- client's existing "Unbekanntes Mitglied" fallback (already used for unresolved actor/member
-- profiles throughout the app) is what a null value here naturally displays as -- no client change
-- needed.
-- ---------------------------------------------------------------------------------------------

alter table public.moderation_actions alter column moderator_id drop not null;
alter table public.moderation_actions drop constraint if exists moderation_actions_moderator_id_fkey;
alter table public.moderation_actions
  add constraint moderation_actions_moderator_id_fkey foreign key (moderator_id) references public.profiles (id) on delete set null;

alter table public.group_join_requests drop constraint if exists group_join_requests_reviewed_by_fkey;
alter table public.group_join_requests
  add constraint group_join_requests_reviewed_by_fkey foreign key (reviewed_by) references public.profiles (id) on delete set null;

-- A 1:1 conversation and its messages belong to BOTH participants, not just whoever happens to have
-- created the conversation row or sent a given message -- deleting either one out from under the
-- remaining participant would destroy their own message history. Both survive; only the pointer to
-- the deleted account is cleared.
alter table public.conversations alter column created_by drop not null;
alter table public.conversations drop constraint if exists conversations_created_by_fkey;
alter table public.conversations
  add constraint conversations_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.messages alter column sender_id drop not null;
alter table public.messages drop constraint if exists messages_sender_id_fkey;
alter table public.messages
  add constraint messages_sender_id_fkey foreign key (sender_id) references public.profiles (id) on delete set null;

-- Same reasoning as messages.sender_id above, for group chat: a departed member's messages remain
-- visible to the group they were shared with instead of silently vanishing from the conversation.
alter table public.group_messages alter column sender_id drop not null;
alter table public.group_messages drop constraint if exists group_messages_sender_id_fkey;
alter table public.group_messages
  add constraint group_messages_sender_id_fkey foreign key (sender_id) references public.profiles (id) on delete set null;

alter table public.content_restrictions alter column created_by drop not null;
alter table public.content_restrictions drop constraint if exists content_restrictions_created_by_fkey;
alter table public.content_restrictions
  add constraint content_restrictions_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.content_restrictions drop constraint if exists content_restrictions_lifted_by_fkey;
alter table public.content_restrictions
  add constraint content_restrictions_lifted_by_fkey foreign key (lifted_by) references public.profiles (id) on delete set null;

-- CLAUDE.md: "Eine Verwarnung wird nie gelöscht" -- the warning itself (already on delete cascade
-- via user_id, i.e. only removed together with the WARNED account) must not be destroyed just
-- because the MODERATOR who issued it later deletes their own account.
alter table public.user_warnings alter column moderator_id drop not null;
alter table public.user_warnings drop constraint if exists user_warnings_moderator_id_fkey;
alter table public.user_warnings
  add constraint user_warnings_moderator_id_fkey foreign key (moderator_id) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------------------------
-- groups.owner_id: deliberately NOT relaxed to nullable + on delete set null, unlike every column
-- above. owner_id is compared directly (`v_group.owner_id <> v_self` / `= v_self`) in several
-- existing SECURITY DEFINER functions (transfer_group_ownership, promote_group_member,
-- demote_group_admin, delete_group, ...). In plpgsql, `if <uuid> <> null then ...` evaluates to
-- NULL, which `if` treats as false -- so a null owner_id would silently make every one of those
-- "raise exception if caller is not the owner" checks never raise, letting ANY authenticated caller
-- pass an owner-only check on an ownerless group. Rather than audit and patch every such comparison
-- for a NULL that should never normally occur, ownership is instead reassigned to another existing
-- member (preferring an existing admin, else the earliest-joined member) -- owner_id is never null,
-- so none of those existing functions need to change. A group with no remaining members left after
-- the deleted account is removed (nothing communal to protect there) is removed along with it;
-- group_members/group_messages/group_message_reads/group_join_requests/group_invitations for that
-- group are already on delete cascade via group_id, so nothing is left dangling.
-- ---------------------------------------------------------------------------------------------

create or replace function public.reassign_or_remove_owned_groups_before_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group record;
  v_new_owner uuid;
begin
  for v_group in select id from public.groups where owner_id = old.id loop
    select gm.user_id
      into v_new_owner
      from public.group_members gm
      where gm.group_id = v_group.id and gm.user_id <> old.id
      order by (gm.role = 'admin') desc, gm.joined_at asc
      limit 1;

    if v_new_owner is not null then
      update public.groups set owner_id = v_new_owner, updated_at = now() where id = v_group.id;
    else
      delete from public.groups where id = v_group.id;
    end if;
  end loop;

  return old;
end;
$$;

drop trigger if exists reassign_owned_groups_before_profile_delete on public.profiles;
create trigger reassign_owned_groups_before_profile_delete
  before delete on public.profiles
  for each row execute function public.reassign_or_remove_owned_groups_before_profile_delete();
