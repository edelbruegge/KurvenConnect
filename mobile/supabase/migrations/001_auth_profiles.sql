-- 001_auth_profiles.sql
--
-- Minimal Supabase auth foundation for Kurvenconnect: a `profiles` table linked 1:1 to
-- `auth.users`, Row Level Security, and a trigger that creates a profile row whenever a
-- new auth user is created. Intended to be run once against a Supabase project (SQL
-- editor or `supabase db push`). It is written to be safely re-runnable: table creation,
-- function definitions, and policy/trigger (re)creation all guard against already
-- existing objects, so running it again after a partial or repeated apply will not fail
-- or duplicate anything.
--
-- Deliberately out of scope: posts, comments, likes, trips, meetups, messages, groups,
-- reports — none of that is migrated in this step (see project changelog).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  club text,
  location text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created. Reads the display name
-- from the signUp() user metadata (`options.data.display_name` on the client), falling
-- back to a neutral placeholder if it is missing or blank.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Neues Mitglied')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at current on every profile change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
