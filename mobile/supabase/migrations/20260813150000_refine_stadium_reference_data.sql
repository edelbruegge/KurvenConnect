-- 20260813150000_refine_stadium_reference_data.sql
--
-- Adds a canonical/traditional-name distinction and an alias-resolution table to
-- public.stadiums, so a future real fixture import can resolve an external venue name to a
-- stadium without the UI ever showing a raw external string. Purely additive; does not touch the
-- already-executed 20260813130000/20260813140000 migrations, does not delete/rename anything, and
-- does not change any existing game_id/stadium_id value. Not run remotely as part of this step.
-- Safe to re-run: every statement uses `if not exists`/`on conflict do nothing`, and the two
-- functions are dropped and recreated (their SQL body, not their data).

alter table public.stadiums
  add column if not exists traditional_name text;

-- Real, publicly known historical/fan names for the two existing stadiums -- not invented.
-- "Alm" is SchücoArena's long-standing traditional name (the ground has been known as "die Alm"
-- since long before its current sponsor naming); "Ruhrstadion" was Vonovia Ruhrstadion's own name
-- before its current sponsor naming, so it is a genuinely different string from the current name,
-- not a duplicate.
update public.stadiums set traditional_name = 'Alm' where id = '11111111-1111-4111-8111-111111111111' and traditional_name is null;
update public.stadiums set traditional_name = 'Ruhrstadion' where id = '22222222-2222-4222-8222-222222222222' and traditional_name is null;

-- ---------------------------------------------------------------------------------------------
-- public.stadium_aliases -- lets a future external sync (see
-- supabase/functions/sync-football-games/index.ts, still not deployed) resolve a raw venue string
-- to a canonical stadium_id via an exact, normalized lookup -- never fuzzy matching, so a sync can
-- never silently attach the wrong stadium to a game. No match simply means stadium_id stays NULL
-- on the game (see that function's resolveStadiumId) -- no invented/guessed stadium assignment.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.stadium_aliases (
  id uuid primary key default gen_random_uuid(),
  stadium_id uuid not null references public.stadiums (id),
  external_source text not null,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists stadium_aliases_source_normalized_key
  on public.stadium_aliases (external_source, normalized_alias);

alter table public.stadium_aliases enable row level security;

drop policy if exists "Authenticated users can read stadium aliases" on public.stadium_aliases;
create policy "Authenticated users can read stadium aliases"
  on public.stadium_aliases
  for select
  to authenticated
  using (true);

revoke all on public.stadium_aliases from anon;
grant select on public.stadium_aliases to authenticated;
revoke insert, update, delete on public.stadium_aliases from authenticated;

-- Seed rows are normalization variants of the two stadiums' own already-known real names (not
-- fabricated third-party data) -- a starting point for the (still undeployed) OpenLigaDB sync.
insert into public.stadium_aliases (stadium_id, external_source, alias, normalized_alias)
values
  ('11111111-1111-4111-8111-111111111111', 'openligadb', 'SchücoArena', 'schuecoarena'),
  ('11111111-1111-4111-8111-111111111111', 'openligadb', 'Schueco Arena', 'schuecoarena'),
  ('22222222-2222-4222-8222-222222222222', 'openligadb', 'Vonovia Ruhrstadion', 'vonoviaruhrstadion'),
  ('22222222-2222-4222-8222-222222222222', 'openligadb', 'Ruhrstadion', 'ruhrstadion')
on conflict (external_source, normalized_alias) do nothing;

-- ---------------------------------------------------------------------------------------------
-- get_my_visited_stadiums / get_my_matchday_history -- re-declared here (not editing the old
-- migration file) purely to add `traditional_name` to the returned columns. Postgres requires a
-- DROP before a CREATE that changes a function's return-table shape; this only redefines the
-- function body, it does not touch any existing row in public.posts/public.games/public.stadiums.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.get_my_visited_stadiums();

create function public.get_my_visited_stadiums()
returns table (
  stadium_id uuid,
  stadium_name text,
  traditional_name text,
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
      s.traditional_name,
      s.city,
      s.latitude,
      s.longitude,
      count(distinct p.game_id) as visited_games_count,
      max(p.created_at) as last_visit_at
    from public.posts p
    join public.games g on g.id = p.game_id
    join public.stadiums s on s.id = g.stadium_id
    where p.author_id = v_self and p.game_id is not null
    group by s.id, s.name, s.traditional_name, s.city, s.latitude, s.longitude
    order by max(p.created_at) desc;
end;
$$;

revoke all on function public.get_my_visited_stadiums() from public;
revoke all on function public.get_my_visited_stadiums() from anon;
grant execute on function public.get_my_visited_stadiums() to authenticated;

drop function if exists public.get_my_matchday_history(uuid);

create function public.get_my_matchday_history(p_stadium_id uuid default null)
returns table (
  game_id text,
  stadium_id uuid,
  stadium_name text,
  traditional_name text,
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
      s.traditional_name,
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
    group by g.id, g.stadium_id, s.name, s.traditional_name, s.city, g.kickoff_at, g.home_team, g.away_team, g.home_score, g.away_score, g.attendance
    order by max(p.created_at) desc;
end;
$$;

revoke all on function public.get_my_matchday_history(uuid) from public;
revoke all on function public.get_my_matchday_history(uuid) from anon;
grant execute on function public.get_my_matchday_history(uuid) to authenticated;
