-- 20260813190000_complete_stadium_mapping.sql
--
-- Fixes the root cause of 992/994 real synced games having stadium_id = NULL: OpenLigaDB returns
-- location.locationStadium = null for every match in the currently synced leagues/season (verified
-- live in a previous step), so the existing location-based stadium_aliases lookup
-- (supabase/functions/sync-football-games/index.ts) structurally never has anything to resolve.
-- This migration adds a second, independent resolution path -- a stable home-team -> home-stadium
-- mapping -- and backfills existing games from it. Purely additive: no existing migration edited,
-- no row deleted, no game.id/external_match_id changed, no already-set stadium_id ever overwritten.
-- Not run remotely as part of this step. Safe to re-run: every insert uses `on conflict do
-- nothing`, the backfill UPDATE only ever touches rows that are still NULL.
--
-- Data sourcing (see the plan/report for this step -- summarized here for anyone reading the SQL
-- later): the 56 clubs below are exactly the clubs currently present in public.games
-- (external_home_team_id per league_shortcut), cross-checked live against OpenLigaDB's
-- getavailableteams/{bl1,bl2,bl3}/2026 -- not a guessed league roster. Each club's current real
-- home stadium (name/city) was researched and cross-verified against multiple independent public
-- sources. Coordinates were geocoded via OpenStreetMap Nominatim (a real, public geocoding
-- service) per stadium name+city -- never estimated or invented. Two clubs (SG Sonnenhof
-- Großaspach and VfB Stuttgart II) genuinely ground-share one physical stadium
-- (WIRmachenDRUCK Arena, Großaspach) -- confirmed by multiple sources, not a data-entry mistake --
-- so 56 clubs resolve to 55 distinct stadiums, of which 2 (SchücoArena/Bielefeld,
-- Vonovia Ruhrstadion/Bochum) already exist from 20260813130000 and are therefore not
-- re-inserted below.

-- Natural key so the stadium insert below is idempotent without hand-assigning UUIDs, and so the
-- team_stadium_mappings insert can join against it by name+city instead of needing them recorded
-- separately.
create unique index if not exists stadiums_name_city_key on public.stadiums (name, city);

insert into public.stadiums (name, city, latitude, longitude, traditional_name)
values
  ('RheinEnergieStadion', 'Köln', 50.9335055, 6.8751167, null),
  ('Stadion An der Alten Försterei', 'Berlin', 52.4569741, 13.5680789, null),
  ('MEWA Arena', 'Mainz', 49.9839451, 8.2232277, null),
  ('BayArena', 'Leverkusen', 51.0381439, 7.0030964, null),
  ('Signal Iduna Park', 'Dortmund', 51.4924922, 7.4518549, 'Westfalenstadion'),
  ('Borussia-Park', 'Mönchengladbach', 51.1746249, 6.3854094, null),
  ('Deutsche Bank Park', 'Frankfurt am Main', 50.0686103, 8.6454154, 'Waldstadion'),
  ('WWK Arena', 'Augsburg', 48.3231179, 10.885879, null),
  ('Allianz Arena', 'München', 48.2187901, 11.6236227, null),
  ('Veltins-Arena', 'Gelsenkirchen', 51.5545938, 7.0676001, 'Arena AufSchalke'),
  ('Volksparkstadion', 'Hamburg', 53.5871535, 9.8987056, null),
  ('Red Bull Arena', 'Leipzig', 51.3457078, 12.3482361, null),
  ('Europa-Park Stadion', 'Freiburg im Breisgau', 48.0213778, 7.829817, null),
  ('Home Deluxe Arena', 'Paderborn', 51.7308967, 8.7109633, 'Benteler-Arena'),
  ('Ursapharm-Arena an der Kaiserlinde', 'Spiesen-Elversberg', 49.3188045, 7.1215724, null),
  ('Weserstadion', 'Bremen', 53.0664479, 8.8376718, null),
  ('PreZero Arena', 'Sinsheim', 49.2380604, 8.8866642, null),
  ('MHPArena', 'Stuttgart', 48.7922488, 9.2320857, 'Neckarstadion'),
  ('Voith-Arena', 'Heidenheim an der Brenz', 48.6685245, 10.1392963, null),
  ('Fritz-Walter-Stadion', 'Kaiserslautern', 49.4345765, 7.7766303, null),
  ('MDCC-Arena', 'Magdeburg', 52.1259962, 11.676845, null),
  ('Max-Morlock-Stadion', 'Nürnberg', 49.4262569, 11.1256706, null),
  ('Rudolf-Harbig-Stadion', 'Dresden', 51.040849, 13.7480416, null),
  ('Eintracht-Stadion', 'Braunschweig', 52.2901014, 10.5214686, null),
  ('LEAG Energie Stadion', 'Cottbus', 51.7516231, 14.345579, 'Stadion der Freundschaft'),
  ('Millerntor-Stadion', 'Hamburg', 53.5545566, 9.9677842, null),
  ('Heinz-von-Heiden-Arena', 'Hannover', 52.360026, 9.7310161, 'Niedersachsenstadion'),
  ('Olympiastadion Berlin', 'Berlin', 52.5145846, 13.2398144, null),
  ('Holstein-Stadion', 'Kiel', 54.3492088, 10.1237559, null),
  ('BBBank Wildpark', 'Karlsruhe', 49.0200043, 8.4129879, null),
  ('Sportpark Ronhof Thomas Sommer', 'Fürth', 49.4871453, 10.9988931, null),
  ('Merck-Stadion am Böllenfalltor', 'Darmstadt', 49.85771, 8.6724145, null),
  ('Bremer Brücke', 'Osnabrück', 52.2808323, 8.0712775, null),
  ('Volkswagen Arena', 'Wolfsburg', 52.4326524, 10.8038151, null),
  ('Ludwigsparkstadion', 'Saarbrücken', 49.248083, 6.9838944, null),
  ('Tivoli', 'Aachen', 50.7931119, 6.0964285, null),
  ('Audi Sportpark', 'Ingolstadt', 48.7452797, 11.4855268, null),
  ('Merkur Spiel-Arena', 'Düsseldorf', 51.261629, 6.7331516, null),
  ('Südstadion', 'Köln', 50.9173768, 6.9435448, null),
  ('Ostseestadion', 'Rostock', 54.0850095, 12.0950945, null),
  ('Jahnstadion Regensburg', 'Regensburg', 48.9908566, 12.1073501, null),
  ('Schauinsland-Reisen-Arena', 'Duisburg', 51.4091325, 6.779513, null),
  ('LVM-Preußenstadion', 'Münster', 51.9318157, 7.626097, null),
  ('Stadion an der Hafenstraße', 'Essen', 51.4868685, 6.9766158, null),
  ('SPORTCLUB Arena', 'Verl', 51.883499, 8.5133824, null),
  ('WIRmachenDRUCK Arena', 'Großaspach', 48.9806964, 9.3930146, null),
  ('Hänsch-Arena', 'Meppen', 52.7079918, 7.2980757, null),
  ('Carl-Benz-Stadion', 'Mannheim', 49.4794201, 8.5025049, null),
  ('BRITA-Arena', 'Wiesbaden', 50.0712853, 8.2566478, null),
  ('Dietmar-Hopp-Stadion', 'Sinsheim', 49.2782943, 8.8422013, null),
  ('Wilhelm-Langrehr-Stadion', 'Garbsen', 52.4088683, 9.6019752, null),
  ('Sportpark Höhenberg', 'Köln', 50.945109, 7.0304736, null),
  ('AKON Arena', 'Würzburg', 49.7672072, 9.9328429, null)
on conflict (name, city) do nothing;

-- ---------------------------------------------------------------------------------------------
-- public.team_stadium_mappings -- external team identity -> home stadium, keyed by a stable
-- numeric external_team_id (OpenLigaDB's teamId), never by the free-text team display name. Read
-- the same way as public.stadium_aliases: reference data, select-only for authenticated users,
-- never writable from the client -- only this migration's own seed and a future controlled step
-- may add rows.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.team_stadium_mappings (
  id uuid primary key default gen_random_uuid(),
  external_source text not null,
  external_team_id text not null,
  team_name text not null,
  stadium_id uuid not null references public.stadiums (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_stadium_mappings_source_team_key
  on public.team_stadium_mappings (external_source, external_team_id);

alter table public.team_stadium_mappings enable row level security;

drop policy if exists "Authenticated users can read team stadium mappings" on public.team_stadium_mappings;
create policy "Authenticated users can read team stadium mappings"
  on public.team_stadium_mappings
  for select
  to authenticated
  using (true);

revoke all on public.team_stadium_mappings from anon;
grant select on public.team_stadium_mappings to authenticated;
revoke insert, update, delete on public.team_stadium_mappings from authenticated;

drop trigger if exists set_team_stadium_mappings_updated_at on public.team_stadium_mappings;
create trigger set_team_stadium_mappings_updated_at
  before update on public.team_stadium_mappings
  for each row execute function public.set_updated_at();

-- All 56 clubs currently present in public.games (see file header) -- joined against the stadiums
-- inserted above (or already existing) by (name, city), so no UUID needs to be tracked by hand.
-- The Großaspach ground-share (SG Sonnenhof Großaspach / VfB Stuttgart II) naturally resolves both
-- rows to the same stadium_id via this join.
insert into public.team_stadium_mappings (external_source, external_team_id, team_name, stadium_id)
select 'openligadb', v.external_team_id, v.team_name, s.id
from (
  values
    ('65', '1. FC Köln', 'RheinEnergieStadion', 'Köln'),
    ('80', '1. FC Union Berlin', 'Stadion An der Alten Försterei', 'Berlin'),
    ('81', '1. FSV Mainz 05', 'MEWA Arena', 'Mainz'),
    ('6', 'Bayer 04 Leverkusen', 'BayArena', 'Leverkusen'),
    ('7', 'Borussia Dortmund', 'Signal Iduna Park', 'Dortmund'),
    ('87', 'Borussia Mönchengladbach', 'Borussia-Park', 'Mönchengladbach'),
    ('91', 'Eintracht Frankfurt', 'Deutsche Bank Park', 'Frankfurt am Main'),
    ('95', 'FC Augsburg', 'WWK Arena', 'Augsburg'),
    ('40', 'FC Bayern München', 'Allianz Arena', 'München'),
    ('9', 'FC Schalke 04', 'Veltins-Arena', 'Gelsenkirchen'),
    ('100', 'Hamburger SV', 'Volksparkstadion', 'Hamburg'),
    ('1635', 'RB Leipzig', 'Red Bull Arena', 'Leipzig'),
    ('112', 'SC Freiburg', 'Europa-Park Stadion', 'Freiburg im Breisgau'),
    ('31', 'SC Paderborn 07', 'Home Deluxe Arena', 'Paderborn'),
    ('198', 'SV 07 Elversberg', 'Ursapharm-Arena an der Kaiserlinde', 'Spiesen-Elversberg'),
    ('134', 'SV Werder Bremen', 'Weserstadion', 'Bremen'),
    ('175', 'TSG Hoffenheim', 'PreZero Arena', 'Sinsheim'),
    ('16', 'VfB Stuttgart', 'MHPArena', 'Stuttgart'),
    ('199', '1. FC Heidenheim 1846', 'Voith-Arena', 'Heidenheim an der Brenz'),
    ('76', '1. FC Kaiserslautern', 'Fritz-Walter-Stadion', 'Kaiserslautern'),
    ('78', '1. FC Magdeburg', 'MDCC-Arena', 'Magdeburg'),
    ('79', '1. FC Nürnberg', 'Max-Morlock-Stadion', 'Nürnberg'),
    ('83', 'DSC Arminia Bielefeld', 'SchücoArena', 'Bielefeld'),
    ('177', 'Dynamo Dresden', 'Rudolf-Harbig-Stadion', 'Dresden'),
    ('74', 'Eintracht Braunschweig', 'Eintracht-Stadion', 'Braunschweig'),
    ('93', 'Energie Cottbus', 'LEAG Energie Stadion', 'Cottbus'),
    ('98', 'FC St. Pauli', 'Millerntor-Stadion', 'Hamburg'),
    ('55', 'Hannover 96', 'Heinz-von-Heiden-Arena', 'Hannover'),
    ('54', 'Hertha BSC', 'Olympiastadion Berlin', 'Berlin'),
    ('104', 'Holstein Kiel', 'Holstein-Stadion', 'Kiel'),
    ('105', 'Karlsruher SC', 'BBBank Wildpark', 'Karlsruhe'),
    ('115', 'SpVgg Greuther Fürth', 'Sportpark Ronhof Thomas Sommer', 'Fürth'),
    ('118', 'SV Darmstadt 98', 'Merck-Stadion am Böllenfalltor', 'Darmstadt'),
    ('129', 'VfL Bochum', 'Vonovia Ruhrstadion', 'Bochum'),
    ('36', 'VfL Osnabrück', 'Bremer Brücke', 'Osnabrück'),
    ('131', 'VfL Wolfsburg', 'Volkswagen Arena', 'Wolfsburg'),
    ('417', '1. FC Saarbrücken', 'Ludwigsparkstadion', 'Saarbrücken'),
    ('23', 'Alemannia Aachen', 'Tivoli', 'Aachen'),
    ('171', 'FC Ingolstadt 04', 'Audi Sportpark', 'Ingolstadt'),
    ('185', 'Fortuna Düsseldorf', 'Merkur Spiel-Arena', 'Düsseldorf'),
    ('1718', 'Fortuna Köln', 'Südstadion', 'Köln'),
    ('102', 'Hansa Rostock', 'Ostseestadion', 'Rostock'),
    ('181', 'Jahn Regensburg', 'Jahnstadion Regensburg', 'Regensburg'),
    ('107', 'MSV Duisburg', 'Schauinsland-Reisen-Arena', 'Duisburg'),
    ('188', 'Preußen Münster', 'LVM-Preußenstadion', 'Münster'),
    ('109', 'Rot-Weiss Essen', 'Stadion an der Hafenstraße', 'Essen'),
    ('114', 'SC Verl', 'SPORTCLUB Arena', 'Verl'),
    ('529', 'SG Sonnenhof Großaspach', 'WIRmachenDRUCK Arena', 'Großaspach'),
    ('599', 'SV Meppen', 'Hänsch-Arena', 'Meppen'),
    ('553', 'SV Waldhof Mannheim', 'Carl-Benz-Stadion', 'Mannheim'),
    ('174', 'SV Wehen Wiesbaden', 'BRITA-Arena', 'Wiesbaden'),
    ('2396', 'TSG 1899 Hoffenheim II', 'Dietmar-Hopp-Stadion', 'Sinsheim'),
    ('126', 'TSV Havelse', 'Wilhelm-Langrehr-Stadion', 'Garbsen'),
    ('184', 'VfB Stuttgart II', 'WIRmachenDRUCK Arena', 'Großaspach'),
    ('2199', 'Viktoria Köln', 'Sportpark Höhenberg', 'Köln'),
    ('398', 'Würzburger Kickers', 'AKON Arena', 'Würzburg')
) as v(external_team_id, team_name, stadium_name, city)
join public.stadiums s on s.name = v.stadium_name and s.city = v.city
on conflict (external_source, external_team_id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Backfill: resolve stadium_id for already-imported games via their home team's mapping, but only
-- where stadium_id is still NULL -- never overwrites the two legacy manual games (their
-- external_source is NULL, so they can never match this join at all) and never overwrites a
-- stadium_id a future, more specific alias-based sync might already have set. game.id,
-- external_match_id and every other column are untouched; no row is deleted or duplicated.
-- ---------------------------------------------------------------------------------------------

update public.games g
set stadium_id = m.stadium_id
from public.team_stadium_mappings m
where g.stadium_id is null
  and g.external_source = 'openligadb'
  and g.external_home_team_id = m.external_team_id
  and m.external_source = 'openligadb';
