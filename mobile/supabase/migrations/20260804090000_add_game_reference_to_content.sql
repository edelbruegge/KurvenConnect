-- Adds an optional matchday reference (game_id/game_label) to public.posts, public.trips and
-- public.wanted_entries, mirroring the pattern already used on public.meetups. This enables a
-- per-game "Stadion" hub to filter content by game across all four content categories.
--
-- Schema-only in this step: nullable, additive columns + indexes. The app does not yet
-- select/insert these columns for posts/trips/wanted_entries (only meetups already does) --
-- wiring that through the existing, already-live read/write paths for these three tables is a
-- deliberate, separate follow-up so this migration can be applied without any risk of breaking
-- currently working functionality.
--
-- Games are not a database table -- they are the existing local `data/games.ts` seed list
-- (`seedGames`), exactly as already used by public.meetups. game_id/game_label are therefore
-- plain nullable text columns here too, not a foreign key.

alter table public.posts add column if not exists game_id text;
alter table public.posts add column if not exists game_label text;

alter table public.trips add column if not exists game_id text;
alter table public.trips add column if not exists game_label text;

alter table public.wanted_entries add column if not exists game_id text;
alter table public.wanted_entries add column if not exists game_label text;

create index if not exists posts_game_id_idx on public.posts (game_id);
create index if not exists trips_game_id_idx on public.trips (game_id);
create index if not exists wanted_entries_game_id_idx on public.wanted_entries (game_id);
