-- 20260804110000_enable_messages_realtime.sql
--
-- Adds public.messages to the `supabase_realtime` publication so INSERT events can be delivered
-- to subscribed clients via Supabase Realtime (Postgres Changes). This is the only change in
-- this migration: no new table, no RLS change, no broadcast trigger, no dropping/recreating the
-- publication. Safe to re-run — the table is only added if it isn't already a member.
--
-- Realtime authorizes postgres_changes events using the same RLS policies that already govern
-- normal SELECT queries on this table (see 20260804100000_create_conversations_and_messages.sql,
-- "Members can read conversation messages"), so this migration does not change who can see what.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
