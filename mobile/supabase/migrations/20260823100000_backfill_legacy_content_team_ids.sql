-- 20260823100000_backfill_legacy_content_team_ids.sql
--
-- Reparatur-Migration: 20260821100000_add_team_scope_to_content.sql hat team_id ausschließlich aus
-- dem favorite_team_id des jeweiligen Erstellers/Owners befüllt. Zum Zeitpunkt ihrer Anwendung
-- hatten von 16 Profilen nur 3 ein gesetztes favorite_team_id -- alle übrigen (ältere Test-/Dev-
-- Accounts ohne abgeschlossenes Onboarding) blieben mit team_id = NULL zurück und sind seither aus
-- jeder vereinsgescopten Ansicht verschwunden (live verifiziert: 18/45 posts, 6/12 meetups,
-- 1/8 trips, 1/2 wanted_entries mit team_id IS NULL). Die Inhalte selbst waren nie gelöscht.
--
-- Backfill in zwei Schritten, streng additiv, nur UPDATE ... WHERE team_id IS NULL, keine DELETEs,
-- keine bereits gesetzte team_id wird verändert, idempotent (mehrfaches Ausführen ändert beim
-- zweiten Mal nichts mehr):
--
-- Schritt 1 (höchste Priorität -- eine bereits am Inhalt selbst vorhandene, zuverlässige Club-
-- Zuordnung): game_label ist ein bestehendes, freies Textfeld (siehe
-- 20260804090000_add_game_reference_to_content.sql) und enthält bei allen live gefundenen
-- betroffenen Zeilen wörtlich "Arminia Bielefeld" als eine der beiden Mannschaften (z. B.
-- "VfL Bochum – Arminia Bielefeld", "1. FC Nürnberg – DSC Arminia Bielefeld") -- kein Raten,
-- sondern ein bereits vorhandenes, direkt lesbares Signal. Kurvenconnect war vor der
-- Mehrvereins-Erweiterung eine reine Arminia-Bielefeld-App (siehe die lokalen Seed-Daten in
-- data/feed-posts.ts/data/groups.ts, die exakt dieselbe Team-ID '83' verwenden).
--
-- Schritt 2 (zweithöchste Priorität -- Autor/Owner-favorite_team_id, dieselbe Regel wie in
-- 20260821100000, hier erneut und idempotent angewendet): deckt zusätzlich jeden Fall ab, in dem
-- ein Autor sein Onboarding *nach* der ursprünglichen Migration abgeschlossen hat.
--
-- Was danach weiterhin team_id = NULL hat, hat keine zuverlässige Zuordnung (weder Spielbezug noch
-- Autoren-favorite_team_id) und bleibt bewusst unangetastet -- nicht gelöscht, nicht geraten,
-- im Abschlussbericht dieser Runde genannt.
--
-- Nicht remote ausgeführt.

-- Schritt 1: game_label-basierter Arminia-Bielefeld-Bezug.
update public.posts
set team_id = '83'
where team_id is null and game_label ilike '%Arminia Bielefeld%';

update public.trips
set team_id = '83'
where team_id is null and game_label ilike '%Arminia Bielefeld%';

update public.meetups
set team_id = '83'
where team_id is null and game_label ilike '%Arminia Bielefeld%';

update public.wanted_entries
set team_id = '83'
where team_id is null and game_label ilike '%Arminia Bielefeld%';

-- Schritt 2: Autor/Owner-favorite_team_id (Top-up für alles, was Schritt 1 nicht erfasst hat).
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
