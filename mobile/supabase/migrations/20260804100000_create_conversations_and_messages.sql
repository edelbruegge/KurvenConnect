-- 20260804100000_create_conversations_and_messages.sql
--
-- Supabase persistence for direct (1:1) conversations and their text messages. Group chats,
-- attachments, realtime, and push notifications are explicitly out of scope for this step (see
-- project changelog). Local seed conversations/messages stay purely local/in-memory, exactly as
-- before — nothing here touches or migrates them.
--
-- Intended to be run once against a Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: table creation uses `if not exists`, and every policy/function/trigger is
-- (re)created with `drop ... if exists` / `create or replace` immediately before being
-- (re)created, so re-applying this file after a partial or repeated run will not fail or
-- duplicate anything.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'direct',
  direct_key text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_type_check check (conversation_type = 'direct'),
  constraint conversations_direct_key_unique unique (direct_key)
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  content text not null,
  reference_type text,
  reference_id text,
  reference_title text,
  created_at timestamptz not null default now(),
  constraint messages_content_not_blank check (length(trim(content)) > 0),
  constraint messages_content_max_length check (length(content) <= 2000),
  constraint messages_reference_type_check
    check (reference_type is null or reference_type in ('post', 'trip', 'meetup', 'wanted_entry', 'profile')),
  constraint messages_reference_id_requires_type check (reference_id is null or reference_type is not null)
);

create index if not exists conversation_members_user_id_idx on public.conversation_members (user_id);
create index if not exists messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists conversations_last_message_at_idx on public.conversations (last_message_at);
-- direct_key is already indexed via the unique constraint above — no separate index needed.

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Membership helper, SECURITY DEFINER so it bypasses conversation_members' own RLS when called
-- from a policy — this is what keeps the three policies below from being recursive: none of them
-- ever query their own (or another RLS-protected) table directly inside their USING clause.
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
revoke all on function public.is_conversation_member(uuid) from anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- conversations: read-only for the app. Rows are only ever created via
-- get_or_create_direct_conversation() below (SECURITY DEFINER) — no INSERT/UPDATE/DELETE policy.

drop policy if exists "Members can read their conversations" on public.conversations;
create policy "Members can read their conversations"
  on public.conversations
  for select
  to authenticated
  using (public.is_conversation_member(id));

-- conversation_members: read-only + a narrow "update my own last_read_at" path for the app.
-- INSERT/DELETE are only ever done by get_or_create_direct_conversation() (SECURITY DEFINER) —
-- no INSERT/DELETE policy, and the table grants further down withhold INSERT/DELETE from
-- `authenticated` entirely, mirroring the meetup_attendees pattern from an earlier migration.

drop policy if exists "Members can read conversation members" on public.conversation_members;
create policy "Members can read conversation members"
  on public.conversation_members
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can update their own read status" on public.conversation_members;
create policy "Members can update their own read status"
  on public.conversation_members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- messages

drop policy if exists "Members can read conversation messages" on public.messages;
create policy "Members can read conversation messages"
  on public.messages
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages"
  on public.messages
  for insert
  to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- Defense in depth for conversation_members: even though the column-level grant below only ever
-- allows `authenticated` to write last_read_at, this trigger additionally guarantees
-- conversation_id/user_id/joined_at can never be changed through any update path.
create or replace function public.protect_conversation_member_identity()
returns trigger
language plpgsql
as $$
begin
  if new.conversation_id <> old.conversation_id or new.user_id <> old.user_id or new.joined_at <> old.joined_at then
    raise exception 'conversation_id, user_id and joined_at cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_conversation_member_identity_trigger on public.conversation_members;
create trigger protect_conversation_member_identity_trigger
  before update on public.conversation_members
  for each row execute function public.protect_conversation_member_identity();

-- Keep updated_at current on conversations, reusing the same trigger function already defined
-- for profiles/posts/trips/meetups.
drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- New-message trigger: bumps the parent conversation's activity timestamps only. No
-- notification row, no push. SECURITY DEFINER because `authenticated` has no UPDATE grant on
-- conversations (writes to that table are function-mediated only).
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = new.created_at, last_message_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.handle_new_message();

-- Atomic get-or-create for a direct conversation between the caller and one other user. Both
-- UUIDs are sorted into a stable, order-independent direct_key so "A with B" and "B with A"
-- always resolve to the same row. Race-safety relies on the unique constraint on direct_key
-- combined with `insert ... on conflict do nothing` — the standard, lock-free idiom for this
-- exact problem, so no explicit advisory locking is needed.
create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_direct_key text;
  v_conversation public.conversations;
begin
  if v_self is null then
    raise exception 'not authenticated';
  end if;

  if p_other_user_id is null then
    raise exception 'other user is required';
  end if;

  if p_other_user_id = v_self then
    raise exception 'cannot start a conversation with yourself';
  end if;

  if not exists (select 1 from public.profiles where id = v_self) then
    raise exception 'own profile not found';
  end if;

  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'other profile not found';
  end if;

  if p_other_user_id < v_self then
    v_user_a := p_other_user_id;
    v_user_b := v_self;
  else
    v_user_a := v_self;
    v_user_b := p_other_user_id;
  end if;

  v_direct_key := v_user_a::text || ':' || v_user_b::text;

  insert into public.conversations (conversation_type, direct_key, created_by)
  values ('direct', v_direct_key, v_self)
  on conflict (direct_key) do nothing
  returning * into v_conversation;

  if v_conversation.id is null then
    select * into v_conversation from public.conversations where direct_key = v_direct_key;
  else
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conversation.id, v_user_a), (v_conversation.id, v_user_b)
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_conversation;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
revoke all on function public.get_or_create_direct_conversation(uuid) from anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- Table privileges: authenticated users get exactly what the app needs; anonymous users get
-- nothing. conversations/conversation_members writes are function-mediated only, except the
-- narrow last_read_at column update below.

revoke all on public.conversations from anon;
revoke all on public.conversation_members from anon;
revoke all on public.messages from anon;

grant select on public.conversations to authenticated;
revoke insert, update, delete on public.conversations from authenticated;

grant select on public.conversation_members to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
revoke insert, delete on public.conversation_members from authenticated;

grant select, insert on public.messages to authenticated;
revoke update, delete on public.messages from authenticated;
