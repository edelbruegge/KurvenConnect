-- 20260907100000_hide_blocked_authors_content_from_feed.sql
--
-- Beta finding: after blocking a user, the BLOCKED user could still see the BLOCKER's posts/trips/
-- meetups/wanted entries in their own feed. Root cause: the client-side visibility check
-- (hooks/use-safety-selectors.ts's canViewContent, via blocks-context.tsx's isUserHidden) only ever
-- asks "have I blocked this author" -- it has no data at all about "has this author blocked me"
-- (blocks-context.tsx only ever loads the current account's own outgoing block list, by design,
-- same as every other social app never revealing to a blocked user who blocked them). So when B is
-- blocked by A, B's own isUserHidden(A) is false, and A's content stays visible to B.
--
-- Every OTHER cross-account interaction already enforces blocking bidirectionally via the existing
-- public.are_users_blocked() function (messages, comments -- 20260903100000_harden_blocked_
-- comment_protection.sql --, trip requests, meetup joins, group joins/invitations, see each of
-- those migrations' own header). Content *visibility* in the feed/list views was the one path that
-- was never audited for this, since it predates are_users_blocked() (20260807140000_add_content_
-- restrictions_and_user_warnings.sql's "Authenticated users can read posts/trips/meetups/wanted
-- entries" policies were written before user_blocks existed at all, see 20260806130000_create_
-- user_blocks.sql).
--
-- Fixed at the RLS layer (not client-side): this is the correct location per this project's own
-- security posture (client-side state must never be the sole gate on a security-relevant
-- visibility rule), AND it's the only layer that actually has the data needed for the missing
-- reverse-direction check -- are_users_blocked() already checks both directions in one call, no new
-- client-side "who blocked me" query needed. The client's existing isUserHidden forward-direction
-- check remains as-is and stays useful for instant UI feedback the moment *you* block someone,
-- without waiting on a refetch; this migration only closes the gap RLS never covered.
--
-- Every policy below keeps its existing content_restriction/moderator-bypass behavior byte-for-byte
-- unchanged, only adding one extra "and not blocked" condition. A user's own content remains
-- visible to themselves (are_users_blocked(self, self) is always false -- self-blocking isn't
-- possible, see 20260806130000_create_user_blocks.sql's own check constraint). Moderators keep full
-- visibility for moderation purposes, same as they already do for restricted content.
--
-- Purely additive to RLS (drop + recreate the same four policies, same pattern as every prior
-- policy redefinition in this project). No table, column, or row is created/altered/deleted. Safe
-- to re-run.

drop policy if exists "Authenticated users can read posts" on public.posts;
create policy "Authenticated users can read posts"
  on public.posts
  for select
  to authenticated
  using (
    (not public.is_content_restricted('post', id::text) and not public.are_users_blocked(auth.uid(), author_id))
    or public.is_current_user_moderator()
  );

drop policy if exists "Authenticated users can read trips" on public.trips;
create policy "Authenticated users can read trips"
  on public.trips
  for select
  to authenticated
  using (
    (not public.is_content_restricted('trip', id::text) and not public.are_users_blocked(auth.uid(), owner_id))
    or public.is_current_user_moderator()
  );

drop policy if exists "Authenticated users can read meetups" on public.meetups;
create policy "Authenticated users can read meetups"
  on public.meetups
  for select
  to authenticated
  using (
    (not public.is_content_restricted('meetup', id::text) and not public.are_users_blocked(auth.uid(), organizer_id))
    or public.is_current_user_moderator()
  );

drop policy if exists "Authenticated users can read wanted entries" on public.wanted_entries;
create policy "Authenticated users can read wanted entries"
  on public.wanted_entries
  for select
  to authenticated
  using (
    (not public.is_content_restricted('wanted_entry', id::text) and not public.are_users_blocked(auth.uid(), owner_id))
    or public.is_current_user_moderator()
  );
