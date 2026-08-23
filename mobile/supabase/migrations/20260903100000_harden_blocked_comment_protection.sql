-- 20260903100000_harden_blocked_comment_protection.sql
--
-- Beta hardening: closes the one confirmed gap found while auditing block enforcement across the
-- app (messages, follows, trip requests, meetup joins, group joins/invitations all already check
-- public.are_users_blocked() server-side -- see 20260806130000_create_user_blocks.sql and every
-- migration listed in its own header). Post comments were the sole exception: the INSERT policy on
-- public.post_comments (20260803120000_create_community_posts.sql) never referenced
-- are_users_blocked, so a blocked user could still comment on the blocker's post and vice versa,
-- both server-side (a direct REST insert) and client-side (no check either).
--
-- Redefines the existing "Users can insert their own comments" policy (drop + recreate, same name,
-- same table, additive -- the original migration file is left untouched) with exactly one extra
-- condition: the commenter and the post's author must not be in a block relationship in either
-- direction. No data is deleted, no other policy/table/column is touched.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`) -- NOT run
-- as part of this change. Safe to re-run: `drop policy if exists` / `create policy` is idempotent.

drop policy if exists "Users can insert their own comments" on public.post_comments;
create policy "Users can insert their own comments"
  on public.post_comments
  for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (select 1 from public.posts where posts.id = post_comments.post_id)
    and not public.are_users_blocked(
      auth.uid(),
      (select author_id from public.posts where posts.id = post_comments.post_id)
    )
  );
