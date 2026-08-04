-- 20260803160000_create_wanted_entries.sql
--
-- Supabase persistence for "Gesucht" entries and their likes. This is the last remaining feed
-- category to move off purely-local state — messages, groups and everything else stay purely
-- local for now (see project changelog). Wanted-entry comments are NOT part of this step either
-- — they remain purely local/in-memory, same as trip and meetup comments.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/trigger is dropped with
-- `if exists` immediately before being recreated, so re-applying this file after a partial or
-- repeated run will not fail or duplicate anything.
--
-- Data model: the existing app's "Gesuch" entries only ever have two fields — a shared
-- `description` (same field every other category uses) and `requestDetails.requestedService`.
-- There is no title, no game/location/time reference, and no status field anywhere in the app
-- model, so none of those are invented here. This is deliberately not a ticket/marketplace
-- feature — no price, payment, or ticket-status columns exist or are planned.

create table if not exists public.wanted_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  description text not null,
  requested_service text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wanted_entries_description_not_blank check (length(trim(description)) > 0),
  constraint wanted_entries_description_max_length check (length(description) <= 2000),
  constraint wanted_entries_requested_service_not_blank check (length(trim(requested_service)) > 0),
  constraint wanted_entries_requested_service_max_length check (length(requested_service) <= 200)
);

create table if not exists public.wanted_likes (
  wanted_entry_id uuid not null references public.wanted_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (wanted_entry_id, user_id)
);

create index if not exists wanted_entries_owner_id_idx on public.wanted_entries (owner_id);
create index if not exists wanted_entries_created_at_idx on public.wanted_entries (created_at);
create index if not exists wanted_likes_wanted_entry_id_idx on public.wanted_likes (wanted_entry_id);
create index if not exists wanted_likes_user_id_idx on public.wanted_likes (user_id);

alter table public.wanted_entries enable row level security;
alter table public.wanted_likes enable row level security;

-- wanted_entries

drop policy if exists "Authenticated users can read wanted entries" on public.wanted_entries;
create policy "Authenticated users can read wanted entries"
  on public.wanted_entries
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own wanted entries" on public.wanted_entries;
create policy "Users can insert their own wanted entries"
  on public.wanted_entries
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Users can update their own wanted entries" on public.wanted_entries;
create policy "Users can update their own wanted entries"
  on public.wanted_entries
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Users can delete their own wanted entries" on public.wanted_entries;
create policy "Users can delete their own wanted entries"
  on public.wanted_entries
  for delete
  to authenticated
  using (auth.uid() = owner_id);

-- wanted_likes

drop policy if exists "Authenticated users can read wanted likes" on public.wanted_likes;
create policy "Authenticated users can read wanted likes"
  on public.wanted_likes
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own wanted likes" on public.wanted_likes;
create policy "Users can insert their own wanted likes"
  on public.wanted_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own wanted likes" on public.wanted_likes;
create policy "Users can delete their own wanted likes"
  on public.wanted_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Keep updated_at current, reusing the same trigger function already defined for
-- profiles/posts/trips/meetups.

drop trigger if exists set_wanted_entries_updated_at on public.wanted_entries;
create trigger set_wanted_entries_updated_at
  before update on public.wanted_entries
  for each row execute function public.set_updated_at();

-- Table privileges: authenticated users get exactly what the app needs; anonymous users get
-- nothing.

revoke all on public.wanted_entries from anon;
revoke all on public.wanted_likes from anon;

grant select, insert, update, delete on public.wanted_entries to authenticated;
grant select, insert, delete on public.wanted_likes to authenticated;
