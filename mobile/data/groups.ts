import { CURRENT_USER_ID } from './users';

export type GroupVisibility = 'public' | 'private';
export type GroupRole = 'admin' | 'member';

export type Group = {
  id: string;
  name: string;
  description: string;
  clubId?: string;
  clubName: string;
  city?: string;
  ownerId: string;
  // Denormalized member list — only ever populated for local seed groups. Remote (source:
  // 'supabase') groups keep this empty; use memberCount for display and a dedicated
  // group_members query (see app/group/[id]/members.tsx) to actually list members, so a
  // membership list is never eagerly fetched just to show a group card.
  memberIds: string[];
  createdAt: string;
  visibility: GroupVisibility;
  // 'local' for seed groups (also the default when absent, same convention as FeedPost.source
  // etc.), 'supabase' for rows loaded from public.groups via get_my_groups().
  source?: 'local' | 'supabase';
  // Only ever set for source:'supabase' groups.
  memberCount?: number;
  myRole?: GroupRole;
  // Raw ISO timestamp for `createdAt` — set for both local seed groups (fixed literals, see
  // seedGroups below) and remote groups (from public.groups.created_at). Used as the fallback for
  // sortGroupsByRecentActivity below when a group has no messages yet; never derived from
  // Date.now(), always a stable value from real data.
  createdAtIso?: string;
  // Chat preview fields for "Nachrichten -> Gruppen" — populated for BOTH remote groups
  // (get_my_groups()/realtime) and local seed groups (derived from seedGroupMessages/
  // sendLocalGroupMessage, see GroupsContext) so sortGroupsByRecentActivity below can treat both
  // uniformly without source-specific branching.
  lastMessagePreview?: string;
  lastMessageAt?: string;
  lastMessageAtIso?: string;
  lastMessageSenderId?: string;
  unreadCount?: number;
};

// "Letzte Aktivität" = Zeitpunkt der neuesten Gruppennachricht, sonst created_at der Gruppe als
// Fallback (nie Date.now()) — deliberately reads only lastMessageAtIso/createdAtIso so it treats
// local and remote groups identically. A missing/invalid timestamp sinks to the very bottom
// (epoch, 0) instead of crashing or defaulting to "now".
function getGroupActivityTimestamp(group: Group): number {
  const iso = group.lastMessageAtIso ?? group.createdAtIso;

  if (!iso) {
    return 0;
  }

  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function getGroupCreatedTimestamp(group: Group): number {
  if (!group.createdAtIso) {
    return 0;
  }

  const ms = new Date(group.createdAtIso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

// The single, central sort for "Nachrichten -> Gruppen" — applied once to the merged local+remote
// list (never re-implemented per-component). Newest activity first; ties broken by created_at
// descending (a stable, deterministic order — JS's Array.sort is a stable sort, so groups with no
// timestamp at all keep their original relative order instead of jumping around).
export function sortGroupsByRecentActivity(groups: Group[]): Group[] {
  return [...groups].sort((a, b) => {
    const activityDiff = getGroupActivityTimestamp(b) - getGroupActivityTimestamp(a);

    if (activityDiff !== 0) {
      return activityDiff;
    }

    return getGroupCreatedTimestamp(b) - getGroupCreatedTimestamp(a);
  });
}

// A single group chat message — local (seed groups, in-memory) or remote (public.group_messages).
// Deliberately separate from Message (data/messages.ts, direct 1:1 chats) — group chat and direct
// chat never share a data model or storage.
export type GroupMessage = {
  id: string;
  groupId: string;
  senderId: string;
  text: string;
  createdAt: string;
  // 'local' for seed/in-memory group messages, 'supabase' for rows loaded from
  // public.group_messages. Defaults to 'local' when absent, same convention as Message.source.
  source?: 'local' | 'supabase';
  // Raw ISO timestamp — used for chronological merge/dedup safety (remote) and as the input to
  // sortGroupsByRecentActivity's "last activity" computation (both local and remote).
  createdAtIso?: string;
  // Set only for source:'supabase' messages sent with a client-generated idempotency token.
  clientMessageId?: string;
};

// The number of members to display for a group card/detail header — local groups derive this
// from the denormalized memberIds array, remote groups carry the count directly (their memberIds
// is always empty, see the Group.memberIds comment above).
export function getGroupMemberCount(group: Group): number {
  return group.source === 'supabase' ? (group.memberCount ?? 0) : group.memberIds.length;
}

// A controlled preview of a group the current user is not a member of, as returned by
// get_group_suggestions() — deliberately thinner than Group (no ownerId, no memberIds) since a
// non-member must never learn the owner's identity or any member list through a suggestion.
export type GroupSuggestion = {
  id: string;
  name: string;
  description: string;
  visibility: GroupVisibility;
  memberCount: number;
  source: 'supabase';
};

export type GroupJoinRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export type GroupJoinRequest = {
  id: string;
  groupId: string;
  userId: string;
  status: GroupJoinRequestStatus;
  createdAt: string;
};

// The remote counterpart to GroupJoinRequest — a row from public.group_join_requests, always for
// the current user's own request (RLS only ever exposes own requests or, to a group admin,
// requests against groups they administer — the latter is represented separately, see
// GroupsContext's incomingJoinRequests).
export type GroupJoinRequestRecord = {
  id: string;
  groupId: string;
  requesterId: string;
  status: GroupJoinRequestStatus;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  source: 'supabase';
  // Resolved alongside the request row (embedded groups(*) select) so "Ausstehende Anfragen" can
  // show the group's name without a second round trip.
  groupName?: string;
  groupVisibility?: GroupVisibility;
};

// A single row of a remote group's member list (public.group_members + a batch-resolved display
// name, same pattern used everywhere else in this project — never embedded in the RPC response).
export type GroupMemberRecord = {
  userId: string;
  role: GroupRole;
  joinedAt: string;
  displayName: string;
  avatarUrl?: string;
};

// Local seed groups/requests always use the fixed 'group-...'/'request-...' id scheme (see
// seedGroups/seedGroupJoinRequests below) — never a UUID. Used to fail closed before ever sending
// an id to a remote group RPC that expects a real UUID.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlausibleRemoteGroupId(id: string): boolean {
  return UUID_PATTERN.test(id);
}

export const seedGroups: Group[] = [
  {
    id: 'group-1',
    name: 'Auswärtsfahrer Arminia',
    description: 'Wir organisieren gemeinsame Fahrten zu allen Auswärtsspielen.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: 'user-david-s',
    memberIds: ['user-david-s', CURRENT_USER_ID, 'user-sina-p'],
    createdAt: 'vor 2 Monaten',
    createdAtIso: '2026-06-09T10:00:00.000Z',
    visibility: 'public',
  },
  {
    id: 'group-2',
    name: 'Familie & Freunde Arminia',
    description: 'Lockere Gruppe für Familien und Freunde, die gemeinsam ins Stadion gehen.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: 'user-sina-p',
    memberIds: ['user-sina-p', 'user-mina-k', CURRENT_USER_ID],
    createdAt: 'vor 5 Monaten',
    createdAtIso: '2026-03-09T10:00:00.000Z',
    visibility: 'public',
  },
  {
    id: 'group-3',
    name: 'Fanclub Ostkurve',
    description: 'Offizieller Fanclub für alle, die in der Ostkurve stehen.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: 'user-mina-k',
    memberIds: ['user-mina-k', 'user-luca-r'],
    createdAt: 'vor 1 Jahr',
    createdAtIso: '2025-08-09T10:00:00.000Z',
    visibility: 'public',
  },
  {
    id: 'group-4',
    name: 'Nur geladene Gäste',
    description: 'Private Gruppe nur für persönlich eingeladene Mitglieder.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: 'user-luca-r',
    memberIds: ['user-luca-r', 'user-david-s'],
    createdAt: 'vor 3 Monaten',
    createdAtIso: '2026-05-09T10:00:00.000Z',
    visibility: 'private',
  },
  {
    id: 'group-5',
    name: 'Marcos Blockrunde',
    description: 'Kleine private Runde für alle, die regelmäßig im gleichen Block stehen.',
    clubName: 'Arminia Bielefeld',
    city: 'Bielefeld',
    ownerId: CURRENT_USER_ID,
    memberIds: [CURRENT_USER_ID],
    createdAt: 'vor 1 Monat',
    createdAtIso: '2026-07-09T10:00:00.000Z',
    visibility: 'private',
  },
];

export const seedGroupJoinRequests: GroupJoinRequest[] = [
  {
    id: 'request-1',
    groupId: 'group-5',
    userId: 'user-luca-r',
    status: 'pending',
    createdAt: 'vor 2 Std.',
  },
];

// A minimal local group chat for two of the five seed groups — kept intentionally small (this is
// demo/local-only content, not a feature to build out further here). Local group chats never touch
// Supabase and are never migrated into public.group_messages.
export const seedGroupMessages: GroupMessage[] = [
  {
    id: 'group-message-1-1',
    groupId: 'group-1',
    senderId: 'user-david-s',
    text: 'Wer ist am Samstag beim Auswärtsspiel dabei?',
    createdAt: 'vor 3 Std.',
    createdAtIso: '2026-08-09T07:00:00.000Z',
  },
  {
    id: 'group-message-1-2',
    groupId: 'group-1',
    senderId: CURRENT_USER_ID,
    text: 'Ich bin dabei, Abfahrt wie immer am Hauptbahnhof?',
    createdAt: 'vor 2 Std.',
    createdAtIso: '2026-08-09T08:00:00.000Z',
  },
  {
    id: 'group-message-1-3',
    groupId: 'group-1',
    senderId: 'user-sina-p',
    text: 'Genau, 9 Uhr am Hauptbahnhof.',
    createdAt: 'vor 1 Std.',
    createdAtIso: '2026-08-09T09:00:00.000Z',
  },
  {
    id: 'group-message-5-1',
    groupId: 'group-5',
    senderId: CURRENT_USER_ID,
    text: 'Willkommen in der Blockrunde!',
    createdAt: 'vor 3 Wochen',
    createdAtIso: '2026-07-19T10:00:00.000Z',
  },
];
