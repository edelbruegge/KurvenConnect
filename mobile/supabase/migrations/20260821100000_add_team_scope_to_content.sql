-- 20260821100000_add_team_scope_to_content.sql
--
-- Vereinsspezifische Inhaltsarchitektur: fügt eine stabile team_id (dasselbe Textformat wie
-- profiles.favorite_team_id / games.external_home_team_id, keine FK -- gleiches lose gekoppelte
-- Muster wie posts.game_id) zu jeder vereinsbezogenen Inhaltstabelle hinzu, damit der Client
-- Inhalte nach dem aktuell aktiven Verein (activeTeamId, client-seitig, siehe
-- context/active-club-context.tsx) filtern kann. Filterung erfolgt ausschließlich über Queries/
-- RPC-Parameter -- RLS wird bewusst NICHT an team_id gebunden (ein Nutzer darf jeden Verein
-- browsen), bestehende Ownership-/Moderations-Policies bleiben unverändert.
--
-- Backfill-Strategie (einheitlich für alle fünf Tabellen): team_id = die aktuelle
-- favorite_team_id des jeweiligen Erstellers/Owners. game_id/game_label (bestehende, freie
-- Textfelder ohne FK) wurden bewusst NICHT als Backfill-Quelle verwendet -- selbst wenn sie sich
-- gegen public.games auflösen ließen, ist unklar, ob ein Inhalt zum Heim- oder Auswärtsteam
-- gehört; die Vereinszugehörigkeit eines Inhalts ist fachlich an seinen Ersteller gebunden, dessen
-- favorite_team_id ist die einzige zuverlässige vorhandene Zuordnung. team_id bleibt NULL, wenn
-- der Ersteller selbst noch keine favorite_team_id hat -- keine NOT NULL-Constraint, da der
-- Backfill nicht für jede Zeile garantiert greifen kann. Keine Daten gelöscht, keine bestehende
-- Migration verändert. Nicht remote ausgeführt.

alter table public.posts add column if not exists team_id text;
alter table public.trips add column if not exists team_id text;
alter table public.meetups add column if not exists team_id text;
alter table public.wanted_entries add column if not exists team_id text;
alter table public.groups add column if not exists team_id text;

update public.posts t
set team_id = p.favorite_team_id
from public.profiles p
where t.author_id = p.id and t.team_id is null and p.favorite_team_id is not null;

update public.trips t
set team_id = p.favorite_team_id
from public.profiles p
where t.owner_id = p.id and t.team_id is null and p.favorite_team_id is not null;

update public.meetups t
set team_id = p.favorite_team_id
from public.profiles p
where t.organizer_id = p.id and t.team_id is null and p.favorite_team_id is not null;

update public.wanted_entries t
set team_id = p.favorite_team_id
from public.profiles p
where t.owner_id = p.id and t.team_id is null and p.favorite_team_id is not null;

update public.groups t
set team_id = p.favorite_team_id
from public.profiles p
where t.owner_id = p.id and t.team_id is null and p.favorite_team_id is not null;

create index if not exists posts_team_id_created_at_idx on public.posts (team_id, created_at desc);
create index if not exists trips_team_id_created_at_idx on public.trips (team_id, created_at desc);
create index if not exists meetups_team_id_created_at_idx on public.meetups (team_id, created_at desc);
create index if not exists wanted_entries_team_id_created_at_idx on public.wanted_entries (team_id, created_at desc);
create index if not exists groups_team_id_created_at_idx on public.groups (team_id, created_at desc);

-- create_group: additional trailing, defaulted parameter -- fully backward compatible with any
-- existing caller still passing only the original three arguments.
create or replace function public.create_group(p_name text, p_description text, p_visibility text, p_team_id text default null)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_name text;
  v_description text;
  v_group public.groups;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');

  if v_name is null then
    raise exception 'invalid name';
  end if;

  if length(v_name) > 100 then
    raise exception 'name too long';
  end if;

  v_description := nullif(trim(coalesce(p_description, '')), '');

  if v_description is not null and length(v_description) > 2000 then
    raise exception 'description too long';
  end if;

  if p_visibility not in ('public', 'private') then
    raise exception 'invalid visibility';
  end if;

  insert into public.groups (owner_id, name, description, visibility, team_id)
  values (v_self, v_name, v_description, p_visibility, nullif(trim(coalesce(p_team_id, '')), ''))
  returning * into v_group;

  return v_group;
end;
$$;

revoke all on function public.create_group(text, text, text, text) from public;
revoke all on function public.create_group(text, text, text, text) from anon;
grant execute on function public.create_group(text, text, text, text) to authenticated;

-- get_group_suggestions: scoped to p_team_id (the caller's activeTeamId) -- discovery/suggestions
-- are club-specific (Vorgabe 15), unlike get_my_groups() (unchanged, membership-based, cross-club).
-- p_team_id is null-safe: with no team_id given, no suggestions are returned rather than showing
-- every club's groups.
create or replace function public.get_group_suggestions(p_limit integer default 5, p_team_id text default null)
returns table (
  id uuid,
  name text,
  description text,
  visibility text,
  member_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  return query
    select
      g.id, g.name, g.description, g.visibility,
      (select count(*) from public.group_members gm2 where gm2.group_id = g.id) as member_count
    from public.groups g
    where not exists (select 1 from public.group_members gm where gm.group_id = g.id and gm.user_id = v_self)
      and not public.are_users_blocked(v_self, g.owner_id)
      and p_team_id is not null
      and g.team_id = p_team_id
    order by g.created_at desc
    limit v_limit;
end;
$$;

revoke all on function public.get_group_suggestions(integer, text) from public;
revoke all on function public.get_group_suggestions(integer, text) from anon;
grant execute on function public.get_group_suggestions(integer, text) to authenticated;

-- The old single-argument overload becomes unreachable from the client after this migration (the
-- client always calls it with two arguments), but is dropped explicitly so it can never be called
-- with the old, unscoped behavior by mistake.
drop function if exists public.get_group_suggestions(integer);
