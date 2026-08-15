-- 20260824100000_add_engagement_save_counts.sql
--
-- Personalisierter "Für dich"-Feed: das Ranking selbst läuft clientseitig (siehe
-- lib/for-you-ranking.ts) -- es gibt aktuell keine echte Pagination über die bereits geladenen
-- ≤50 Posts/Trips/Meetups/Wanted-Entries pro Verein hinaus, ein serverseitiges Ranking-RPC wäre
-- an dieser Stelle nur zusätzliche Komplexität ohne Nutzen.
--
-- Eine Ausnahme braucht zwingend eine serverseitige Funktion: wie viele Nutzer einen Beitrag
-- gespeichert haben. public.post_saves/trip_saves/meetup_saves/wanted_saves beschränken SELECT
-- bewusst auf `user_id = auth.uid()` (siehe 20260814130000_create_saved_content.sql: "wer was
-- gespeichert hat, ist privat zu diesem Nutzer") -- eine echte Gesamtzahl ist über einen normalen
-- Client-Query deshalb architektonisch nicht erreichbar, unabhängig vom aufrufenden Nutzer. Vier
-- kleine, symmetrische SECURITY DEFINER-Funktionen (dieselbe Begründungsklasse wie das bereits
-- bestehende public.are_users_blocked() -- ein enger, aggregierter Zähler, keine Offenlegung, wer
-- konkret gespeichert hat) sind hier sauberer als eine einzelne dynamische/parametrisierte Lösung.
--
-- Kein neuer Index nötig: post_id/trip_id/meetup_id/wanted_entry_id sind bereits die jeweils
-- führende Spalte des Composite-Primary-Keys von post_saves/trip_saves/meetup_saves/wanted_saves
-- (siehe deren eigener Migrationskommentar) und damit für ein `= any(p_ids)` bereits indiziert.
-- posts(team_id, created_at)/post_likes(post_id)/post_comments(post_id)/user_follows(following_id)
-- bestehen ebenfalls bereits (20260821100000_add_team_scope_to_content.sql,
-- 20260803120000_create_community_posts.sql, 20260815100000_create_user_follows.sql).
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`). Safe to
-- re-run: `create or replace function`. Nicht remote ausgeführt.

create or replace function public.get_post_save_counts(p_ids uuid[])
returns table (id uuid, save_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select post_id as id, count(*) as save_count
  from public.post_saves
  where post_id = any(p_ids)
  group by post_id;
$$;

create or replace function public.get_trip_save_counts(p_ids uuid[])
returns table (id uuid, save_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select trip_id as id, count(*) as save_count
  from public.trip_saves
  where trip_id = any(p_ids)
  group by trip_id;
$$;

create or replace function public.get_meetup_save_counts(p_ids uuid[])
returns table (id uuid, save_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select meetup_id as id, count(*) as save_count
  from public.meetup_saves
  where meetup_id = any(p_ids)
  group by meetup_id;
$$;

create or replace function public.get_wanted_save_counts(p_ids uuid[])
returns table (id uuid, save_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select wanted_entry_id as id, count(*) as save_count
  from public.wanted_saves
  where wanted_entry_id = any(p_ids)
  group by wanted_entry_id;
$$;

revoke all on function public.get_post_save_counts(uuid[]) from public;
revoke all on function public.get_post_save_counts(uuid[]) from anon;
grant execute on function public.get_post_save_counts(uuid[]) to authenticated;

revoke all on function public.get_trip_save_counts(uuid[]) from public;
revoke all on function public.get_trip_save_counts(uuid[]) from anon;
grant execute on function public.get_trip_save_counts(uuid[]) to authenticated;

revoke all on function public.get_meetup_save_counts(uuid[]) from public;
revoke all on function public.get_meetup_save_counts(uuid[]) from anon;
grant execute on function public.get_meetup_save_counts(uuid[]) to authenticated;

revoke all on function public.get_wanted_save_counts(uuid[]) from public;
revoke all on function public.get_wanted_save_counts(uuid[]) from anon;
grant execute on function public.get_wanted_save_counts(uuid[]) to authenticated;
