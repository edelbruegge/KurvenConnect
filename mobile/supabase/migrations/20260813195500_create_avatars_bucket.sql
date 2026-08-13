-- 20260818100000_create_avatars_bucket.sql
--
-- Persistent user avatars. public.profiles.avatar_url already exists (001_auth_profiles.sql) and
-- is already writable by its owner (existing "Users can update their own profile" policy) -- this
-- migration adds only what is genuinely missing: a Storage bucket + policies for the image files
-- themselves, and public.profiles in the realtime publication so another client with a profile
-- already open can see an avatar change live.
--
-- Purely additive: no existing table/migration/row touched, no column added, no data deleted, no
-- auth data touched. Safe to re-run (bucket upsert, `drop policy if exists` + recreate, guarded
-- publication check -- the same idiom as every prior migration in this project).
--
-- ---------------------------------------------------------------------------------------------
-- Bucket visibility: PUBLIC -- deliberately different from the post-media bucket
-- (20260817100000_create_post_media.sql), which is private for a reason specific to *posts*
-- (moderated/blocked post content must never get a permanent, unauthenticated backdoor URL).
-- None of that applies to avatars:
--   * There is no "hidden avatar" moderation state -- an avatar is exactly as visible as
--     display_name/bio, which public.profiles already exposes to every authenticated user via
--     its own `using (true)` SELECT policy.
--   * avatar_url is read as a plain, ready-to-use string from at least eight independent call
--     sites across the app (feed, comments, follow lists, groups, messages, notifications,
--     trips/meetups). A private bucket would require every one of those call sites to resolve a
--     signed URL before use -- exactly the kind of duplicated complexity the project consistently
--     avoids elsewhere.
--   * A public bucket's getPublicUrl() is synchronous, has no expiry, and keeps avatar_url
--     exactly what its type/mapper (SupabaseProfile.avatarUrl, lib/map-supabase-profile.ts)
--     already assumes: a directly usable URL.
-- Write/delete access is still fully gated by auth + RLS/Storage policies below -- only *reads*
-- are public, mirroring how public.profiles' own row data is already public-to-authenticated.
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object paths are always `{authUserId}/{uuid}.jpg` (see lib/avatar-media.ts) -- a new random
-- filename on every avatar change, never overwriting the previous one in place, so cached/CDN
-- copies of the old URL are never an issue and no cache-busting query string is needed.
-- (storage.foldername(name))[1] is that leading auth-user-id segment -- the same
-- owner-scoped-path pattern already used for post-media.

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload avatars into their own folder" on storage.objects;
create policy "Users can upload avatars into their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own avatars" on storage.objects;
create policy "Users can delete their own avatars"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- No update policy -- avatars are create-once per file (`upsert: false`), never overwritten in
-- place; changing an avatar uploads a new file and removes the old one as two separate steps.

-- ---------------------------------------------------------------------------------------------
-- Realtime: add public.profiles so an already-open screen showing another user's profile can
-- receive their avatar/display-name change live (see context/profile-context.tsx and
-- context/feed-posts-context.tsx, each extended with one more table binding on their own already-
-- existing channel -- not a new channel). Realtime authorizes delivery via the table's own RLS
-- SELECT policy (`using (true)` for authenticated, same mechanism as every other publication
-- addition in this project) -- this exposes nothing that a normal `select * from profiles` could
-- not already return today.
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end
$$;
