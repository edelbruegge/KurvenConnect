-- 20260825100000_create_game_follows.sql
--
-- Persistent, account-bound "Spiel folgen" relationships. game_id is a plain text reference (same
-- loose-coupled pattern as posts.game_id/trips.game_id -- no FK, games come from the openligadb
-- sync and are not guaranteed to exist as a public.games row for every id at write time), not a
-- second, parallel content architecture.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`). Safe to
-- re-run: table creation uses `if not exists`, every policy is dropped and recreated with
-- `if exists`/immediately-following `create policy`. Purely additive: no existing table/migration/
-- row touched, no data deleted.

create table if not exists public.game_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id text not null check (length(trim(game_id)) > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.game_follows enable row level security;

-- SELECT scoped to the caller's own rows only -- this table only ever needs to answer "do I follow
-- this game", never a public follower list/count (unlike public.user_follows, which is
-- intentionally public-facing). Same reasoning/shape as public.user_blocks' own-rows-only policy.
drop policy if exists "Users can read their own game follows" on public.game_follows;
create policy "Users can read their own game follows"
  on public.game_follows
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can follow games" on public.game_follows;
create policy "Users can follow games"
  on public.game_follows
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can unfollow games" on public.game_follows;
create policy "Users can unfollow games"
  on public.game_follows
  for delete
  to authenticated
  using (user_id = auth.uid());

-- No UPDATE policy: a follow is either present or absent, never modified in place.

revoke all on public.game_follows from anon;
grant select, insert, delete on public.game_follows to authenticated;
revoke update on public.game_follows from authenticated;
