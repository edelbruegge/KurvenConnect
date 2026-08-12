-- 20260814130000_create_saved_content.sql
--
-- Persistent, account-bound "Gespeichert" (saved content) for the four existing content types:
-- posts ("Beitrag"), trips ("Fahrt"), meetups ("Treffpunkt"), wanted_entries ("Gesucht"). Replaces
-- the previous purely-local, non-persistent context/saved-context.tsx implementation -- this is
-- the single, real save architecture, not a second parallel one.
--
-- Structure deliberately mirrors the existing *_likes junction tables (post_likes/trip_likes/
-- meetup_likes/wanted_likes, see 20260803120000/20260803130000/20260803150000/20260803160000):
-- one table per content type, composite primary key (content_id, user_id), `on delete cascade` to
-- the content row (a deleted post/trip/meetup/wanted entry silently drops its saves along with it
-- -- never a dangling save pointing at nothing). The one deliberate divergence from the *_likes
-- precedent: SELECT is scoped to `user_id = auth.uid()` here, not `using (true)` -- a like count is
-- public, but who saved what is private to that user (see RLS section below).
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`). Safe to
-- re-run: table creation uses `if not exists`, every policy is dropped with `if exists`
-- immediately before being recreated. Purely additive: no existing table/migration/row touched,
-- no id changed, no data deleted.
--
-- Moderation/visibility: no extra handling needed here. posts/trips/meetups/wanted_entries' own
-- SELECT policies (20260807140000_add_content_restrictions_and_user_warnings.sql) already exclude
-- globally-restricted rows for normal users. As long as the app resolves a saved content_id back
-- to its actual row through a normal (non-SECURITY-DEFINER) select -- which it does -- a
-- moderated-away row simply will not come back, and the saved reference becomes unresolvable
-- (rendered as "not shown" by the client), never a backdoor around moderation.

create table if not exists public.post_saves (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.trip_saves (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.meetup_saves (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create table if not exists public.wanted_saves (
  wanted_entry_id uuid not null references public.wanted_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (wanted_entry_id, user_id)
);

-- One index per table on user_id: every load is "all of my saves for this content type"
-- (see context/saved-context.tsx's bundled load), never a per-row lookup. The other half of each
-- composite primary key (post_id/trip_id/meetup_id/wanted_entry_id) is already indexed as the
-- leading PK column, same reasoning as user_blocks' own index comment.
create index if not exists post_saves_user_id_idx on public.post_saves (user_id);
create index if not exists trip_saves_user_id_idx on public.trip_saves (user_id);
create index if not exists meetup_saves_user_id_idx on public.meetup_saves (user_id);
create index if not exists wanted_saves_user_id_idx on public.wanted_saves (user_id);

alter table public.post_saves enable row level security;
alter table public.trip_saves enable row level security;
alter table public.meetup_saves enable row level security;
alter table public.wanted_saves enable row level security;

-- post_saves

drop policy if exists "Users can read their own post saves" on public.post_saves;
create policy "Users can read their own post saves"
  on public.post_saves
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can save posts for themselves" on public.post_saves;
create policy "Users can save posts for themselves"
  on public.post_saves
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own post saves" on public.post_saves;
create policy "Users can remove their own post saves"
  on public.post_saves
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- trip_saves

drop policy if exists "Users can read their own trip saves" on public.trip_saves;
create policy "Users can read their own trip saves"
  on public.trip_saves
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can save trips for themselves" on public.trip_saves;
create policy "Users can save trips for themselves"
  on public.trip_saves
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own trip saves" on public.trip_saves;
create policy "Users can remove their own trip saves"
  on public.trip_saves
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- meetup_saves

drop policy if exists "Users can read their own meetup saves" on public.meetup_saves;
create policy "Users can read their own meetup saves"
  on public.meetup_saves
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can save meetups for themselves" on public.meetup_saves;
create policy "Users can save meetups for themselves"
  on public.meetup_saves
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own meetup saves" on public.meetup_saves;
create policy "Users can remove their own meetup saves"
  on public.meetup_saves
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- wanted_saves

drop policy if exists "Users can read their own wanted saves" on public.wanted_saves;
create policy "Users can read their own wanted saves"
  on public.wanted_saves
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can save wanted entries for themselves" on public.wanted_saves;
create policy "Users can save wanted entries for themselves"
  on public.wanted_saves
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own wanted saves" on public.wanted_saves;
create policy "Users can remove their own wanted saves"
  on public.wanted_saves
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- No UPDATE policy on any of the four tables: a save is either present or absent, never modified
-- in place -- same reasoning as post_likes/trip_likes/meetup_likes/wanted_likes.

-- Table privileges: authenticated users get exactly what the app needs; anonymous users get
-- nothing (RLS would block them anyway, since every policy above is scoped to `to authenticated`
-- and checks auth.uid() -- the explicit revoke/grant makes the intent unambiguous, same pattern as
-- every other content table in this project).

revoke all on public.post_saves from anon;
revoke all on public.trip_saves from anon;
revoke all on public.meetup_saves from anon;
revoke all on public.wanted_saves from anon;

grant select, insert, delete on public.post_saves to authenticated;
grant select, insert, delete on public.trip_saves to authenticated;
grant select, insert, delete on public.meetup_saves to authenticated;
grant select, insert, delete on public.wanted_saves to authenticated;

revoke update on public.post_saves from authenticated;
revoke update on public.trip_saves from authenticated;
revoke update on public.meetup_saves from authenticated;
revoke update on public.wanted_saves from authenticated;
