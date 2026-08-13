-- 20260817100000_create_post_media.sql
--
-- Persistent images (0-4) attached to a normal "Beitrag" community post. Adds a relational
-- public.post_media table (not a JSON column on posts), a private Supabase Storage bucket
-- ("post-media"), RLS, and Storage policies. Purely additive: no existing table/migration/row
-- touched, no post id changed.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`). Safe to
-- re-run: table creation uses `if not exists`, every policy is dropped with `if exists`
-- immediately before being recreated, the bucket upsert uses `on conflict ... do update`, and the
-- realtime-publication addition at the bottom is guarded by an existence check -- exactly the
-- established pattern from every prior migration in this project.
--
-- ---------------------------------------------------------------------------------------------
-- Bucket visibility: PRIVATE, not public.
--
-- public.posts' own SELECT policy is `using (true)` for any authenticated user -- moderation and
-- blocking in this app are enforced client-side (useVisiblePosts/canViewContent), never by
-- restricting a post row's own visibility at the RLS layer. A *public* Storage bucket would be a
-- strictly bigger exposure than that existing model: a public object URL is permanent, requires
-- no Supabase session at all, and works for anyone who ever saw the link (crawlers, caches,
-- signed-out users, forever) -- unlike a raw `select * from posts`, which at least requires an
-- authenticated Supabase client. That is exactly the "dauerhaft öffentliche Bild-URLs als
-- Hintertür" this step was asked to avoid.
--
-- A private bucket + signed URLs closes that gap without changing the app's actual visibility
-- philosophy: the Storage SELECT policy below allows any *authenticated* user to sign a URL for
-- any object in this bucket, mirroring posts' own `using (true)` exactly. So this is not a new,
-- stricter access model layered on top of posts (which would be inconsistent and surprising) --
-- it only removes the *anonymous/public-internet* exposure a public bucket would add.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  position integer not null,
  mime_type text,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  constraint post_media_position_range check (position between 0 and 3),
  unique (post_id, position)
);

create index if not exists post_media_post_id_idx on public.post_media (post_id);
create index if not exists post_media_owner_id_idx on public.post_media (owner_id);

alter table public.post_media enable row level security;

-- Same visibility as posts itself (see bucket-visibility note above) -- any authenticated user can
-- read the metadata rows; the actual image bytes stay gated behind the private bucket + signed
-- URLs, which is where the real access control for this step lives.
drop policy if exists "Authenticated users can read post media" on public.post_media;
create policy "Authenticated users can read post media"
  on public.post_media
  for select
  to authenticated
  using (true);

-- A user may only ever attach media to a post they actually own -- checked twice: the claimed
-- owner_id must equal the caller, AND the referenced post's real author_id must also equal the
-- caller. The second check is what actually prevents "a user can't create media rows for foreign
-- posts" (Vorgabe 14) -- owner_id alone would just be a claim.
drop policy if exists "Users can attach media to their own posts" on public.post_media;
create policy "Users can attach media to their own posts"
  on public.post_media
  for insert
  to authenticated
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.posts
      where posts.id = post_media.post_id
        and posts.author_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own post media" on public.post_media;
create policy "Users can delete their own post media"
  on public.post_media
  for delete
  to authenticated
  using (auth.uid() = owner_id);

-- No update policy: a media row is immutable once created (swapping an image means removing and
-- re-adding it, which the client already handles locally before publish -- never a DB update).

revoke all on public.post_media from anon;
grant select, insert, delete on public.post_media to authenticated;
revoke update on public.post_media from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage bucket + policies.
--
-- file_size_limit/allowed_mime_types are enforced server-side by Storage itself, as a second line
-- of defense behind the client-side checks in lib/post-media.ts (a client check alone is only
-- advisory). 6 MiB matches the "ca. 5-6 MB pro Bild" guidance for this MVP step.
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage object paths are always `{authUserId}/{postId}/{mediaId}.{ext}` (see
-- lib/post-media.ts) -- (storage.foldername(name))[1] is that leading auth-user-id segment, the
-- standard Supabase pattern for binding a Storage path to its owner.

drop policy if exists "Authenticated users can read post media objects" on storage.objects;
create policy "Authenticated users can read post media objects"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'post-media');

drop policy if exists "Users can upload post media into their own folder" on storage.objects;
create policy "Users can upload post media into their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own post media objects" on storage.objects;
create policy "Users can delete their own post media objects"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- No update policy on storage.objects for this bucket -- uploads are create-once (`upsert: false`
-- in lib/post-media.ts), never overwritten in place.

-- ---------------------------------------------------------------------------------------------
-- Realtime: add post_media to supabase_realtime so the existing content-changes channel (see
-- context/feed-posts-context.tsx, extended in this same step with one more table binding, not a
-- new channel) can receive INSERT/DELETE events -- otherwise a second client's uploaded image
-- would never arrive without a reload, same root cause as the tables added in
-- 20260816100000_complete_realtime_publication.sql. REPLICA IDENTITY left at its default: post_media
-- has a real primary key (id), which DEFAULT already includes in a DELETE event's old record --
-- sufficient for the handler, which only ever acts on the id.
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_media'
  ) then
    alter publication supabase_realtime add table public.post_media;
  end if;
end
$$;
