-- 20260816100000_complete_realtime_publication.sql
--
-- Adds the tables behind the app's core content/social features to the `supabase_realtime`
-- publication so postgres_changes events for them can actually be delivered to clients. Verified
-- live (grep across every migration, not assumed) that `supabase_realtime` currently only carries
-- notifications, reports, content_restrictions, user_warnings, messages, group_members,
-- group_join_requests, content_visibility_events, group_messages, groups -- none of the tables
-- below were ever added. This is the direct, confirmed cause of "another user's like/comment/new
-- post/follow doesn't appear without a reload": the client-side realtime channels being added in
-- this same step (see context/feed-posts-context.tsx and context/profile-context.tsx) would have
-- nothing to subscribe to otherwise.
--
-- Purely additive: no table created, no RLS policy touched, no row modified or deleted, no
-- existing migration edited. Safe to re-run -- every addition is guarded by an existence check
-- against pg_publication_tables, exactly the pattern already used in
-- 20260804110000_enable_messages_realtime.sql / 20260804120000_create_notifications.sql /
-- 20260807150000_fix_moderation_visibility_and_realtime.sql / 20260808120000_create_groups_and_
-- memberships.sql / 20260809120000_fix_content_visibility_realtime_sync.sql /
-- 20260811120000_create_group_messages.sql / 20260812120000_add_group_administration.sql.
--
-- Deliberately NOT added here: public.stadiums/public.games (static/controlled-sync reference
-- data, no product benefit from live-pushing every row -- games already has its own explicit
-- full/current sync mechanism), public.trip_requests (status changes already surface live via the
-- existing, already-published notifications table -- trip_request_received/accepted/rejected --
-- so the requester/owner are already informed without needing raw table-level realtime for this
-- narrower, owner-only workflow). Realtime authorizes delivery using each table's own existing RLS
-- SELECT policies (same mechanism already relied on for every table listed above), so this
-- migration alone cannot expose data a client couldn't already read via a normal query.
--
-- REPLICA IDENTITY: intentionally left at its default (not set to FULL) for every table below.
-- Every one of them has a real primary key (either a single `id` or, for the *_likes/
-- meetup_attendees/user_follows junction tables, a composite key) -- REPLICA IDENTITY DEFAULT
-- already includes the primary key columns in a DELETE event's old record, which is all the
-- realtime handlers added in this step ever need (they only ever act on the key, never on a
-- pre-update snapshot of some other column). FULL would only be required if a handler needed the
-- old value of a non-key column on UPDATE/DELETE, which none of them do.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_comments'
  ) then
    alter publication supabase_realtime add table public.post_comments;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_likes'
  ) then
    alter publication supabase_realtime add table public.post_likes;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table public.trips;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_likes'
  ) then
    alter publication supabase_realtime add table public.trip_likes;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meetups'
  ) then
    alter publication supabase_realtime add table public.meetups;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meetup_likes'
  ) then
    alter publication supabase_realtime add table public.meetup_likes;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meetup_attendees'
  ) then
    alter publication supabase_realtime add table public.meetup_attendees;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wanted_entries'
  ) then
    alter publication supabase_realtime add table public.wanted_entries;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wanted_likes'
  ) then
    alter publication supabase_realtime add table public.wanted_likes;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_follows'
  ) then
    alter publication supabase_realtime add table public.user_follows;
  end if;
end
$$;
