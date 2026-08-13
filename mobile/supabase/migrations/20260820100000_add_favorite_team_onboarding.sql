-- 20260820100000_add_favorite_team_onboarding.sql
--
-- Persistentes Onboarding mit Lieblingsverein-Auswahl. public.profiles.club (001_auth_profiles.sql)
-- bleibt bestehen und wird zu einem denormalisierten Anzeigenamen-Cache, der beim Speichern der
-- Auswahl mitgeschrieben wird -- jede bestehende `club`-lesende Stelle (ProfileHeader,
-- GameSelector, ...) profitiert davon ohne eigene Codeänderung. favorite_team_id wird die neue,
-- stabile Quelle der Wahrheit: die OpenLigaDB-Team-ID aus public.team_stadium_mappings
-- (external_team_id, siehe 20260813190000_complete_stadium_mapping.sql, 56 real gepflegte
-- deutsche Vereine bl1/bl2/bl3). Keine neue, parallele Vereinstabelle -- diese Migration liest die
-- bestehende Tabelle nur aus.
--
-- Rein additiv: keine bestehende Migration verändert, keine Daten gelöscht. Sicher erneut
-- ausführbar (`add column if not exists`, `create index if not exists`,
-- `create or replace function`). Nicht remote ausgeführt.

alter table public.profiles add column if not exists favorite_team_id text;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;

-- Bewusst keine Foreign Key auf team_stadium_mappings -- gleiches lose gekoppeltes Muster wie
-- public.games.external_home_team_id/external_away_team_id (siehe deren Migrations-Header).
create index if not exists profiles_favorite_team_id_idx
  on public.profiles (favorite_team_id)
  where favorite_team_id is not null;

-- Unterstützt sowohl die Stadion-Standardauswahl (Verein <-> aktuelle Spiele) als auch die
-- Liga-Auflösung in get_known_teams() unten mit einem Index statt eines Sequential Scans pro Verein.
create index if not exists games_external_home_team_id_idx
  on public.games (external_home_team_id)
  where external_home_team_id is not null;

-- Liefert alle bekannten Vereine aus team_stadium_mappings inkl. der aktuell zuverlässig
-- ableitbaren Liga (jüngstes Heimspiel in public.games). league_shortcut ist null, wenn (noch)
-- kein Spiel für den Verein vorliegt -- der Client zeigt so einen Verein defensiv unter "Weitere"
-- statt eine falsche Liga zu behaupten. `stable`, kein `security definer` nötig: beide zugrunde
-- liegenden Tabellen haben bereits eine `select`-Policy für `authenticated` (`using (true)`).
create or replace function public.get_known_teams()
returns table (external_team_id text, team_name text, league_shortcut text)
language sql
stable
as $$
  select
    m.external_team_id,
    m.team_name,
    (
      select g.league_shortcut
      from public.games g
      where g.external_home_team_id = m.external_team_id
      order by g.season desc nulls last, g.kickoff_at desc nulls last
      limit 1
    ) as league_shortcut
  from public.team_stadium_mappings m
  order by m.team_name;
$$;

grant execute on function public.get_known_teams() to authenticated;
