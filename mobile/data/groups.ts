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
