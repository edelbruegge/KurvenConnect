-- 20260807150000_fix_moderation_visibility_and_realtime.sql
--
-- Corrective migration on top of 20260807140000_add_content_restrictions_and_user_warnings.sql
-- (left untouched). Fixes issues found during manual end-to-end testing of the moderation
-- actions/user warnings feature:
--
--   1) Actioned/reviewed/dismissed reports were only reachable while they happened to still be
--      present in whatever filtered list the client last fetched — there was no way to load a
--      single report by id regardless of status. Fixed by get_moderation_report().
--   2) Moderators could not find or re-open globally hidden content once it scrolled out of the
--      report it came from — there was no listing of currently active restrictions. Fixed by
--      get_active_content_restrictions().
--   3) The moderation detail preview relied on whatever the moderator's own FeedPostsContext
--      already happened to have loaded client-side, which does not necessarily include content
--      that is globally restricted (or simply not in the moderator's local cache). Fixed by
--      get_moderation_target_preview(), a live, RLS-bypassing, moderator-only lookup.
--   4) The web app required manual reloads to see new reports, status changes, new restrictions,
--      restorations, and new warnings. Fixed by adding reports/content_restrictions/user_warnings
--      to the supabase_realtime publication so the client can subscribe to postgres_changes.
--
-- Safe to re-run: functions use create or replace, the publication additions are guarded by an
-- existence check. No table is dropped, no existing data is touched, no RLS policy is loosened.

-- ---------------------------------------------------------------------------------------------
-- get_moderation_report — load exactly one report by id, independent of its current status and
-- independent of any client-side cached list.
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_moderation_report(p_report_id uuid)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_current_user_moderator() then
    raise exception 'not a moderator';
  end if;

  if p_report_id is null then
    raise exception 'invalid report id';
  end if;

  select * into v_report from public.reports where id = p_report_id;

  if not found then
    raise exception 'report not found';
  end if;

  return v_report;
end;
$$;

revoke all on function public.get_moderation_report(uuid) from public;
revoke all on function public.get_moderation_report(uuid) from anon;
grant execute on function public.get_moderation_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_active_content_restrictions — list of currently hidden content for the moderation
-- "Ausgeblendet" view. Only ever active restrictions (lifted_at is null); history stays reachable
-- through the originating report instead.
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_active_content_restrictions(
  p_target_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.content_restrictions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_current_user_moderator() then
    raise exception 'not a moderator';
  end if;

  if p_target_type is not null and p_target_type not in ('post', 'comment', 'trip', 'meetup', 'wanted_entry') then
    raise exception 'invalid target type';
  end if;

  return query
    select *
    from public.content_restrictions cr
    where cr.lifted_at is null
      and (p_target_type is null or cr.target_type = p_target_type)
    order by cr.created_at desc
    limit v_limit offset v_offset;
end;
$$;

revoke all on function public.get_active_content_restrictions(text, integer, integer) from public;
revoke all on function public.get_active_content_restrictions(text, integer, integer) from anon;
grant execute on function public.get_active_content_restrictions(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_moderation_target_preview — a live, moderator-only lookup of a single target's safe
-- preview fields. Runs as SECURITY DEFINER (owner bypasses RLS entirely), so it works regardless
-- of whether the target is currently restricted and regardless of whether the moderator's own
-- client happens to have it cached locally. Never returns auth.* data, never returns more than a
-- short preview + owner id.
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_moderation_target_preview(p_target_type text, p_target_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_current_user_moderator() then
    raise exception 'not a moderator';
  end if;

  if p_target_type not in ('post', 'comment', 'trip', 'meetup', 'wanted_entry', 'user') then
    raise exception 'invalid target type';
  end if;

  begin
    if p_target_type = 'post' then
      select jsonb_build_object('exists', true, 'preview_text', left(p.content, 300), 'owner_id', p.author_id)
        into v_result
        from public.posts p
        where p.id = p_target_id::uuid;
    elsif p_target_type = 'comment' then
      select jsonb_build_object('exists', true, 'preview_text', left(c.content, 300), 'owner_id', c.author_id)
        into v_result
        from public.post_comments c
        where c.id = p_target_id::uuid;
    elsif p_target_type = 'trip' then
      select jsonb_build_object('exists', true, 'preview_text', left(t.description, 300), 'owner_id', t.owner_id)
        into v_result
        from public.trips t
        where t.id = p_target_id::uuid;
    elsif p_target_type = 'meetup' then
      select jsonb_build_object('exists', true, 'preview_text', left(m.title, 300), 'owner_id', m.organizer_id)
        into v_result
        from public.meetups m
        where m.id = p_target_id::uuid;
    elsif p_target_type = 'wanted_entry' then
      select jsonb_build_object('exists', true, 'preview_text', left(w.requested_service, 300), 'owner_id', w.owner_id)
        into v_result
        from public.wanted_entries w
        where w.id = p_target_id::uuid;
    elsif p_target_type = 'user' then
      select jsonb_build_object('exists', true, 'preview_text', pr.display_name, 'owner_id', pr.id, 'display_name', pr.display_name)
        into v_result
        from public.profiles pr
        where pr.id = p_target_id::uuid;
    end if;
  exception
    when invalid_text_representation then
      v_result := null;
  end;

  if v_result is null then
    return jsonb_build_object('exists', false);
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_moderation_target_preview(text, text) from public;
revoke all on function public.get_moderation_target_preview(text, text) from anon;
grant execute on function public.get_moderation_target_preview(text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime: add reports/content_restrictions/user_warnings to supabase_realtime so clients can
-- subscribe to postgres_changes. Realtime authorizes delivery using each table's own existing RLS
-- SELECT policies (same mechanism already relied on for public.messages, see
-- 20260804110000_enable_messages_realtime.sql) — reporters keep seeing only their own reports,
-- moderators see all reports/content_restrictions/user_warnings (per the existing moderator SELECT
-- policies), and normal users only ever receive their own user_warnings rows. No RLS policy is
-- changed by this migration; only additive to the publication, guarded so re-running is a no-op.
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'content_restrictions'
  ) then
    alter publication supabase_realtime add table public.content_restrictions;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_warnings'
  ) then
    alter publication supabase_realtime add table public.user_warnings;
  end if;
end
$$;
