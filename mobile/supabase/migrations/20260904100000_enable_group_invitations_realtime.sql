-- 20260904100000_enable_group_invitations_realtime.sql
--
-- Realtime/notification hardening: adds public.group_invitations to the supabase_realtime
-- publication. Without this, a client-side postgres_changes subscription on this table (added in
-- GroupsContext's existing groups:${authUserId} channel) would silently never receive any events
-- -- Realtime only ever broadcasts changes for tables explicitly in this publication, exactly like
-- every other table already added this way (group_members, group_join_requests, groups, messages,
-- notifications, ...). No RLS change is needed: "Invitees can read their own group invitations"
-- (20260828100000_add_group_invitations.sql) already scopes delivery correctly, the same mechanism
-- already relied on for every other realtime-enabled table in this project.
--
-- This closes the actual mechanism behind "a group invitation notification appears, but Annehmen/
-- Ablehnen buttons are sometimes missing": the notification itself already arrives live (the
-- notifications table's own realtime subscription is unaffected by this migration), but
-- GroupsContext's separate myGroupInvitations state (which getInvitationStatusForGroup reads to
-- decide whether to render the buttons) previously only ever loaded once at sign-in and on
-- foreground transitions -- an invitation created while the app was already in the foreground had
-- no way to reach that state until the next foreground refresh. This table's addition to the
-- publication makes the client-side realtime handler added in the same change actually receive the
-- INSERT it's already subscribed to.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`) -- NOT run
-- as part of this change. Safe to re-run: guarded by an existence check, identical in shape to
-- every other publication addition in this project. No data is created, altered, or deleted; no
-- existing table, policy, or function is touched.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_invitations'
  ) then
    alter publication supabase_realtime add table public.group_invitations;
  end if;
end
$$;
