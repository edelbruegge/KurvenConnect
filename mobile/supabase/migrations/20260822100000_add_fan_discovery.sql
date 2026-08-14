-- 20260822100000_add_fan_discovery.sql
--
-- Vereinsspezifische Fan-Discovery ("Fans von [Verein]" im Suchen-Tab). Liefert Profile mit
-- favorite_team_id = p_team_id, ohne den aufrufenden Nutzer selbst und ohne in beide Richtungen
-- blockierte Nutzer. Die Gegenrichtung ("wer hat mich blockiert") ist clientseitig bewusst nicht
-- auslesbar (public.user_blocks' SELECT-Policy beschränkt auf blocker_id = auth.uid(), siehe
-- 20260806130000_create_user_blocks.sql) -- deshalb ist eine serverseitige Funktion mit der dort
-- bereits vorhandenen public.are_users_blocked() nötig, kein reiner Client-Query möglich.
--
-- Kein neuer Index nötig: profiles_favorite_team_id_idx existiert bereits (siehe
-- 20260820100000_add_favorite_team_onboarding.sql). Keine neue Tabelle, keine RLS-Änderung --
-- Filterung erfolgt ausschließlich innerhalb dieser Funktion, nicht über Policies.
--
-- Ergänzt um search_profiles(): eine echte, vereinsunabhängige globale Nutzersuche (app/(tabs)/
-- search.tsx) -- die bisherige Suche durchsuchte nie public.profiles direkt, nur den auf jedem
-- Post kopierten Autorennamen, wodurch sie kaum Nutzer fand. Diese Funktion wird hier ergänzt
-- statt in einer eigenen Migration, weil sie inhaltlich zu genau diesem, noch nicht angewendeten
-- Migrations-Schritt gehört ("bestehende angewendete Migration" trifft auf diese Datei nicht zu).
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`). Safe to
-- re-run: `create or replace function`. Nicht remote ausgeführt.

create or replace function public.get_fan_discovery(p_team_id text, p_limit integer default 24, p_offset integer default 0)
returns table (
  id uuid,
  display_name text,
  club text,
  location text,
  bio text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_team_id is null or length(trim(p_team_id)) = 0 then
    raise exception 'team id is required';
  end if;

  return query
    select p.id, p.display_name, p.club, p.location, p.bio, p.avatar_url, p.created_at
    from public.profiles p
    where p.favorite_team_id = p_team_id
      and p.id <> v_self
      and not public.are_users_blocked(v_self, p.id)
    order by p.display_name asc
    limit v_limit offset v_offset;
end;
$$;

revoke all on function public.get_fan_discovery(text, integer, integer) from public;
revoke all on function public.get_fan_discovery(text, integer, integer) from anon;
grant execute on function public.get_fan_discovery(text, integer, integer) to authenticated;

-- Global (nicht vereinsbeschränkt) nach Anzeigename durchsuchbar -- findet jeden Nutzer, egal
-- welchen aktiven Verein der Suchende gerade betrachtet. Gleiche Blockfilterung (beide Richtungen)
-- und derselbe Rückgabe-Shape wie get_fan_discovery() oben, damit der Client beide Ergebnislisten
-- mit demselben Mapping/derselben Card-Komponente darstellen kann.
create or replace function public.search_profiles(p_query text, p_limit integer default 24, p_offset integer default 0)
returns table (
  id uuid,
  display_name text,
  club text,
  location text,
  bio text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if v_query is null then
    raise exception 'query is required';
  end if;

  return query
    select p.id, p.display_name, p.club, p.location, p.bio, p.avatar_url, p.created_at
    from public.profiles p
    where p.display_name ilike '%' || v_query || '%'
      and p.id <> v_self
      and not public.are_users_blocked(v_self, p.id)
    order by p.display_name asc
    limit v_limit offset v_offset;
end;
$$;

revoke all on function public.search_profiles(text, integer, integer) from public;
revoke all on function public.search_profiles(text, integer, integer) from anon;
grant execute on function public.search_profiles(text, integer, integer) to authenticated;
