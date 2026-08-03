-- 20260803120000_create_community_posts.sql
--
-- Supabase persistence for the normal "Beitrag" (community post) category only: posts,
-- their comments, and their likes. Trips, meetups, requests, messages, groups and
-- everything else stay purely local for now (see project changelog).
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy is dropped with
-- `if exists` immediately before being recreated, so re-applying this file after a partial
-- or repeated run will not fail or duplicate anything.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  category text not null default 'Beitrag',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_content_not_blank check (length(trim(content)) > 0),
  constraint posts_content_max_length check (length(content) <= 2000)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_comments_content_not_blank check (length(trim(content)) > 0),
  constraint post_comments_content_max_length check (length(content) <= 500)
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists posts_created_at_idx on public.posts (created_at);
create index if not exists posts_author_id_idx on public.posts (author_id);
create index if not exists post_comments_post_id_idx on public.post_comments (post_id);
create index if not exists post_comments_author_id_idx on public.post_comments (author_id);
create index if not exists post_likes_post_id_idx on public.post_likes (post_id);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);

alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;

-- posts

drop policy if exists "Authenticated users can read posts" on public.posts;
create policy "Authenticated users can read posts"
  on public.posts
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own posts" on public.posts;
create policy "Users can insert their own posts"
  on public.posts
  for insert
  to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts"
  on public.posts
  for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
  on public.posts
  for delete
  to authenticated
  using (auth.uid() = author_id);

-- post_comments

drop policy if exists "Authenticated users can read comments" on public.post_comments;
create policy "Authenticated users can read comments"
  on public.post_comments
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own comments" on public.post_comments;
create policy "Users can insert their own comments"
  on public.post_comments
  for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (select 1 from public.posts where posts.id = post_comments.post_id)
  );

drop policy if exists "Users can update their own comments" on public.post_comments;
create policy "Users can update their own comments"
  on public.post_comments
  for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "Users can delete their own comments" on public.post_comments;
create policy "Users can delete their own comments"
  on public.post_comments
  for delete
  to authenticated
  using (auth.uid() = author_id);

-- post_likes

drop policy if exists "Authenticated users can read likes" on public.post_likes;
create policy "Authenticated users can read likes"
  on public.post_likes
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own likes" on public.post_likes;
create policy "Users can insert their own likes"
  on public.post_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own likes" on public.post_likes;
create policy "Users can delete their own likes"
  on public.post_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Keep updated_at current, reusing the same trigger function already defined for profiles.

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists set_post_comments_updated_at on public.post_comments;
create trigger set_post_comments_updated_at
  before update on public.post_comments
  for each row execute function public.set_updated_at();
