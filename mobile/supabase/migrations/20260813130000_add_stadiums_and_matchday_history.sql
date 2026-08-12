-- 20260813130000_add_stadiums_and_matchday_history.sql
--
-- A real stadiums/games data basis for the personal "Stadionkarte" (stadium map) and matchday
-- history. No new tables for anything else; no user check-in state (see below). Every other
-- already-executed migration is untouched.
--
-- games.id is deliberately `text`, not `uuid`. game_id/game_label already exist as plain nullable
-- text columns on public.posts/public.trips/public.wanted_entries/public.meetups
-- (20260804090000_add_game_reference_to_content.sql), populated with the local seed ids from
-- data/games.ts (e.g. 'game-bochum-arminia') -- not a foreign key today. Using a text primary key
-- here that matches those exact values lets every already-stored game_id resolve directly against
-- this new table, with zero data migration and zero risk to existing content. New games can still
-- get any stable text id going forward (slug-style or a random uuid cast to text) -- the column
-- type is what matters, not the value shape.
--
-- Why no user_stadium_visits table: a "visit" is entirely derived from existing data (an own
-- community post with a game_id, resolved through games.stadium_id) -- introducing a separate
-- visit-tracking table would just be a redundant, independently-driftable copy of information
-- public.posts already contains.
--
-- A personal stadium visit is defined *exclusively* by an own row in public.posts (the "Beitrag"
-- category table) with a game_id. Trips ("Fahrt"), meetups ("Treffpunkt") and wanted entries
-- ("Gesucht") may still carry a game_id/game_label for the existing per-game Stadion hub
-- (app/stadion/[module].tsx) -- that is untouched -- but offering a ride or organizing a meetup
-- for a game is not proof of having actually attended it, so none of those three count toward
-- get_my_visited_stadiums()/get_my_matchday_history() below.
--
-- Intended to run once against a Supabase project. Not run remotely as part of this step. Safe to
-- re-run: table creation uses `if not exists`, seed rows use `on conflict do nothing`, every
-- function is `create or replace`.

create table if not exists public.stadiums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  -- Only ever used to place a marker on the stadium map -- never a user's location. No user
  -- position, no GPS data, no precise whereabouts of any person is stored anywhere in this schema.
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id text primary key,
  home_team text not null,
  away_team text not null,
  stadium_id uuid references public.stadiums (id),
  kickoff_at timestamptz,
  -- Deliberately nullable and never backfilled with invented values -- see the file header. The
  -- UI shows "Ergebnis noch nicht verfügbar" / omits the attendance line when these are null.
  home_score integer,
  away_score integer,
  attendance integer,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_stadium_id_idx on public.games (stadium_id);

alter table public.stadiums enable row level security;
alter table public.games enable row level security;

-- Pure, non-personal reference data (stadium names/cities/coordinates, fixture team names/dates) --
-- safe to expose to every signed-in user, same treatment as public.profiles' own baseline
-- visibility. No write policy for authenticated: these are only ever written by this migration's
-- own seed inserts (or a future admin-only path), never by the app.
drop policy if exists "Authenticated users can read stadiums" on public.stadiums;
create policy "Authenticated users can read stadiums"
  on public.stadiums
  for select
  to authenticated
  using (true);

revoke all on public.stadiums from anon;
grant select on public.stadiums to authenticated;
revoke insert, update, delete on public.stadiums from authenticated;

drop policy if exists "Authenticated users can read games" on public.games;
create policy "Authenticated users can read games"
  on public.games
  for select
  to authenticated
  using (true);

revoke all on public.games from anon;
grant select on public.games to authenticated;
revoke insert, update, delete on public.games from authenticated;

drop trigger if exists set_stadiums_updated_at on public.stadiums;
create trigger set_stadiums_updated_at
  before update on public.stadiums
  for each row execute function public.set_updated_at();

drop trigger if exists set_games_updated_at on public.games;
create trigger set_games_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Seed rows for the two games already referenced by data/games.ts (seedGames) -- without these,
-- get_my_visited_stadiums()/get_my_matchday_history() below would have nothing to resolve even a
-- real, correctly game_id-tagged post against. Stadium names/cities/coordinates are real, publicly
-- known facts about the two real clubs already used throughout this app's seed content (not
-- invented sports data); stadium_id is assigned to the home team's ground, a structural inference
-- from who is listed first in the existing "Home – Away" label, not a fabricated result.
-- kickoff_at/home_score/away_score/attendance are intentionally left null -- see above.
-- ---------------------------------------------------------------------------------------------

insert into public.stadiums (id, name, city, latitude, longitude)
values
  ('11111111-1111-4111-8111-111111111111', 'SchücoArena', 'Bielefeld', 52.0331, 8.5389),
  ('22222222-2222-4222-8222-222222222222', 'Vonovia Ruhrstadion', 'Bochum', 51.4906, 7.2264)
on conflict (id) do nothing;

insert into public.games (id, home_team, away_team, stadium_id)
values
  ('game-bochum-arminia', 'VfL Bochum', 'Arminia Bielefeld', '22222222-2222-4222-8222-222222222222'),
  ('game-arminia-paderborn', 'Arminia Bielefeld', 'SC Paderborn', '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- get_my_visited_stadiums — one row per stadium the caller has at least one own community post
-- (public.posts, author_id = auth.uid()) tagged with a game in that stadium. Trips/meetups/wanted
-- entries are deliberately not considered here -- see the file header.
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_my_visited_stadiums()
returns table (
  stadium_id uuid,
  stadium_name text,
  city text,
  latitude double precision,
  longitude double precision,
  visited_games_count bigint,
  last_visit_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  return query
    select
      s.id,
      s.name,
      s.city,
      s.latitude,
      s.longitude,
      count(distinct p.game_id) as visited_games_count,
      max(p.created_at) as last_visit_at
    from public.posts p
    join public.games g on g.id = p.game_id
    join public.stadiums s on s.id = g.stadium_id
    where p.author_id = v_self and p.game_id is not null
    group by s.id, s.name, s.city, s.latitude, s.longitude
    order by max(p.created_at) desc;
end;
$$;

revoke all on function public.get_my_visited_stadiums() from public;
revoke all on function public.get_my_visited_stadiums() from anon;
grant execute on function public.get_my_visited_stadiums() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_my_matchday_history — one row per own visited game (not per post), optionally filtered to a
-- single stadium. own_content_count counts the caller's own posts for that game (multiple posts
-- for the same game_id still collapse to one row here, per the group by on g.id below).
-- ---------------------------------------------------------------------------------------------

create or replace function public.get_my_matchday_history(p_stadium_id uuid default null)
returns table (
  game_id text,
  stadium_id uuid,
  stadium_name text,
  city text,
  kickoff_at timestamptz,
  home_team text,
  away_team text,
  home_score integer,
  away_score integer,
  attendance integer,
  own_content_count bigint,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  return query
    select
      g.id,
      g.stadium_id,
      s.name,
      s.city,
      g.kickoff_at,
      g.home_team,
      g.away_team,
      g.home_score,
      g.away_score,
      g.attendance,
      count(*) as own_content_count,
      max(p.created_at) as last_activity_at
    from public.posts p
    join public.games g on g.id = p.game_id
    join public.stadiums s on s.id = g.stadium_id
    where p.author_id = v_self
      and p.game_id is not null
      and (p_stadium_id is null or g.stadium_id = p_stadium_id)
    group by g.id, g.stadium_id, s.name, s.city, g.kickoff_at, g.home_team, g.away_team, g.home_score, g.away_score, g.attendance
    order by max(p.created_at) desc;
end;
$$;

revoke all on function public.get_my_matchday_history(uuid) from public;
revoke all on function public.get_my_matchday_history(uuid) from anon;
grant execute on function public.get_my_matchday_history(uuid) to authenticated;
