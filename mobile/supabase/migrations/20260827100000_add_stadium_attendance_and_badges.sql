-- 20260827100000_add_stadium_attendance_and_badges.sql
--
-- Stadionstatistik + besuchte Spiele + Abzeichen. Adds public.user_game_attendance as the single,
-- persistent, server-authoritative record of "which real games has this user actually documented
-- attending" -- derived exclusively from the user's own public.posts rows ("Beitrag"), the exact
-- same definition already used by get_my_visited_stadiums()/get_my_matchday_history()
-- (20260813130000_add_stadiums_and_matchday_history.sql, refined in
-- 20260813150000_refine_stadium_reference_data.sql): "trips/meetups/wanted entries may carry a
-- game_id for the per-game Stadion hub, but offering a ride or organizing a meetup is not proof of
-- having actually attended" -- reused verbatim, not reinvented.
--
-- Purely additive: no existing table/column/row touched, no post/game/stadium changed or deleted.
-- Not run remotely as part of this step. Safe to re-run: table creation uses `if not exists`,
-- every policy/function/trigger is dropped-or-replaced immediately before being recreated, the
-- backfill uses `on conflict do nothing`.

-- ---------------------------------------------------------------------------------------------
-- public.user_game_attendance
--
-- game_id is deliberately NOT a foreign key to public.games, mirroring posts.game_id/trips.game_id/
-- meetups.game_id/wanted_entries.game_id everywhere else in this schema (see
-- 20260804090000_add_game_reference_to_content.sql's own header) -- a synced game row is not
-- guaranteed to exist for every id at insert time, and the AFTER INSERT trigger below runs inside
-- the same transaction as the post itself, so a hard FK here would risk rolling back a user's post
-- if their particular game_id doesn't yet have a public.games row. get_user_stadium_stats() below
-- LEFT JOINs to public.games precisely so a not-yet-synced game still counts toward total_games
-- (it just can't contribute to away/home/stadium until a matching games row exists).
--
-- team_id is nullable text, same format as posts.team_id/profiles.favorite_team_id/
-- games.external_home_team_id/external_away_team_id (20260821100000_add_team_scope_to_content.sql)
-- -- see the trigger below for why this is copied from the post, never from the user's current
-- favorite_team_id.
--
-- source_type is a single-value enum today ('post') -- structurally ready for a future
-- 'check_in'/'ticket_verification'/'manual_verified' source without a second attendance table, but
-- none of those are implemented here (Vorgabe 34: keine Feature-Creep).
-- ---------------------------------------------------------------------------------------------

create table if not exists public.user_game_attendance (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id text not null,
  team_id text,
  source_post_id uuid references public.posts (id) on delete set null,
  source_type text not null default 'post',
  first_recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, game_id),
  constraint user_game_attendance_game_id_not_blank check (length(trim(game_id)) > 0),
  constraint user_game_attendance_source_type_check check (source_type in ('post'))
);

-- user_id is already indexed via the leading primary-key column (same reasoning as
-- user_blocks_blocked_id_idx/user_follows_following_id_idx) -- only game_id needs its own index,
-- for "who has attended this game" lookups (used by get_user_stadium_stats' join direction and any
-- future "wer war auch da" feature).
create index if not exists user_game_attendance_game_id_idx on public.user_game_attendance (game_id);

alter table public.user_game_attendance enable row level security;

-- Own rows only -- a public profile's aggregate stadium stats are exposed exclusively through
-- get_user_stadium_stats() below (SECURITY DEFINER), never by relaxing this SELECT policy to "any
-- authenticated user" -- that would leak every user's full per-game attendance history (effectively
-- a precise movement/travel log), not just the three aggregate counts Vorgabe 15 asks for.
drop policy if exists "Users can read their own game attendance" on public.user_game_attendance;
create policy "Users can read their own game attendance"
  on public.user_game_attendance
  for select
  to authenticated
  using (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy at all, and the grants below revoke all three from `authenticated`
-- outright -- every row is written exclusively by the SECURITY DEFINER trigger below (fired only by
-- a genuine post insert) or this migration's own one-time backfill. This is the anti-cheat
-- boundary from Vorgabe 33: a client can never insert/update/delete an attendance row directly, so
-- "100 Auswärtsspiele" cannot be faked by a free client action -- it requires 100 real, distinct,
-- game_id-tagged posts to actually exist in public.posts.
revoke all on public.user_game_attendance from anon;
grant select on public.user_game_attendance to authenticated;
revoke insert, update, delete on public.user_game_attendance from authenticated;

-- ---------------------------------------------------------------------------------------------
-- record_game_attendance -- AFTER INSERT on public.posts. Fires once per stored post row, so a
-- realtime echo of that same row can never create a second attendance attempt; `on conflict
-- (user_id, game_id) do nothing` makes a second/third/tenth post to the same game a guaranteed
-- no-op (Vorgabe 24) regardless. team_id is copied from NEW.team_id (the post's own team_id, set to
-- whichever club was active when the post was created -- see feed-posts-context.tsx's
-- createRemotePost) rather than the user's current favorite_team_id, so a later favorite_team_id
-- change can never rewrite which club an already-documented visit "belongs" to (Vorgabe 5).
-- game_id = NULL is the only guard needed -- Vorgabe 25/26: no game_label-based guessing, no
-- legacy-id reconciliation, a post genuinely without a game_id is simply not a stadium visit.
-- ---------------------------------------------------------------------------------------------

create or replace function public.record_game_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.game_id is null then
    return new;
  end if;

  insert into public.user_game_attendance (user_id, game_id, team_id, source_post_id, source_type, first_recorded_at)
  values (new.author_id, new.game_id, new.team_id, new.id, 'post', new.created_at)
  on conflict (user_id, game_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_post_record_game_attendance on public.posts;
create trigger on_post_record_game_attendance
  after insert on public.posts
  for each row execute function public.record_game_attendance();

-- ---------------------------------------------------------------------------------------------
-- Safe backfill for already-existing real posts. `distinct on (author_id, game_id) ... order by
-- ... created_at asc` picks each user's EARLIEST post per game_id -- matching "first spielbezogener
-- Beitrag" exactly, same as the trigger going forward. `on conflict do nothing` makes this
-- idempotent (re-running this migration, or the trigger having already recorded some of these rows
-- if it runs before the backfill statement in some future re-apply order, can never duplicate or
-- error). No post/game/team_id is read into anything but this new table -- nothing in public.posts
-- is written, updated, or deleted.
-- ---------------------------------------------------------------------------------------------

insert into public.user_game_attendance (user_id, game_id, team_id, source_post_id, source_type, first_recorded_at)
select distinct on (p.author_id, p.game_id)
  p.author_id, p.game_id, p.team_id, p.id, 'post', p.created_at
from public.posts p
where p.game_id is not null
order by p.author_id, p.game_id, p.created_at asc
on conflict (user_id, game_id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- get_user_stadium_stats -- the one statistics entry point for both the owner's own profile and
-- any other profile (Vorgabe 15/31). SECURITY DEFINER is required here specifically because the
-- RLS policy above scopes user_game_attendance to `user_id = auth.uid()` -- without SECURITY
-- DEFINER, calling this for p_user_id <> auth.uid() would just return all-zero aggregates (RLS
-- silently hiding the other user's rows from the query), breaking "fremde Profile sehen die
-- Statistik" entirely. The function itself never returns a raw attendance row -- only four scalar
-- counts -- so this does not reopen the raw-data leak the RLS policy exists to prevent.
--
-- total_games is computed from user_game_attendance alone (no join), so an attendance row whose
-- game_id has no matching public.games row yet (not-FK, see above) still counts -- away_games/
-- home_games/stadiums_visited use a LEFT JOIN and simply contribute 0 for such a row until the game
-- is synced, they never make it disappear from total_games.
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_user_stadium_stats(p_user_id uuid)
returns table (
  total_games bigint,
  away_games bigint,
  home_games bigint,
  stadiums_visited bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  return query
    select
      count(*)::bigint as total_games,
      count(*) filter (
        where g.external_away_team_id is not null and a.team_id = g.external_away_team_id
      )::bigint as away_games,
      count(*) filter (
        where g.external_home_team_id is not null and a.team_id = g.external_home_team_id
      )::bigint as home_games,
      count(distinct g.stadium_id) filter (where g.stadium_id is not null)::bigint as stadiums_visited
    from public.user_game_attendance a
    left join public.games g on g.id = a.game_id
    where a.user_id = p_user_id;
end;
$$;

revoke all on function public.get_user_stadium_stats(uuid) from public;
revoke all on function public.get_user_stadium_stats(uuid) from anon;
grant execute on function public.get_user_stadium_stats(uuid) to authenticated;
