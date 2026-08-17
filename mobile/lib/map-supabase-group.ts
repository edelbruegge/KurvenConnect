import type {
  Group,
  GroupInvitation,
  GroupInvitationStatus,
  GroupJoinRequestRecord,
  GroupJoinRequestStatus,
  GroupMemberRecord,
  GroupPendingInvitation,
  GroupSuggestion,
  GroupType,
  GroupVisibility,
  Subgroup,
} from '@/data/groups';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

// A row from get_my_groups().
export type SupabaseGroupMembershipRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  visibility: string;
  group_type: string;
  parent_group_id: string | null;
  team_id: string | null;
  created_at: string;
  updated_at: string;
  my_role: string;
  member_count: number;
  last_message_body: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  unread_count: number;
};

// A row from get_group_suggestions() — deliberately narrower, no owner_id.
export type SupabaseGroupSuggestionRow = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  member_count: number;
};

// A row from get_subgroups() — same thin shape as SupabaseGroupSuggestionRow, different source.
export type SupabaseSubgroupRow = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  member_count: number;
};

// A row from group_join_requests, optionally with an embedded groups(*) select (used for "my own
// pending requests", where RLS also allows reading the target group's name/visibility).
export type SupabaseGroupJoinRequestRow = {
  id: string;
  group_id: string;
  requester_id: string;
  status: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  groups?: { name: string; visibility: string } | null;
};

// The jsonb shape returned by get_group_detail() — two distinct shapes depending on membership
// (see that function's own comment): a member gets every field below; a non-member of a
// public/closed group gets only the ones marked optional (never owner_id/my_role/created_at/
// updated_at — "never learn the owner's identity through a non-member view", same principle
// SupabaseGroupSuggestionRow already applies). is_member is what the client checks, not field
// presence, to tell the two shapes apart.
export type SupabaseGroupDetailResponse = {
  id: string;
  owner_id?: string;
  name: string;
  description: string | null;
  visibility: string;
  group_type: string;
  parent_group_id: string | null;
  team_id?: string | null;
  created_at?: string;
  updated_at?: string;
  my_role?: string;
  member_count: number;
  is_member: boolean;
  has_pending_join_request?: boolean;
};

// A raw group_members row — display_name is resolved separately via a batch profiles fetch, same
// pattern used everywhere else in this project.
export type SupabaseGroupMemberRow = {
  user_id: string;
  role: string;
  joined_at: string;
};

export function mapSupabaseGroupMembershipRow(row: SupabaseGroupMembershipRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    clubName: 'Arminia Bielefeld',
    clubId: row.team_id ?? undefined,
    ownerId: row.owner_id,
    memberIds: [],
    createdAt: formatRelativeGermanTime(row.created_at),
    visibility: row.visibility as GroupVisibility,
    groupType: row.group_type as GroupType,
    parentGroupId: row.parent_group_id ?? undefined,
    source: 'supabase',
    memberCount: row.member_count,
    myRole: row.my_role as Group['myRole'],
    isMember: true,
    createdAtIso: row.created_at,
    lastMessagePreview: row.last_message_body ?? undefined,
    lastMessageAt: row.last_message_at ? formatRelativeGermanTime(row.last_message_at) : undefined,
    lastMessageAtIso: row.last_message_at ?? undefined,
    lastMessageSenderId: row.last_message_sender_id ?? undefined,
    unreadCount: row.unread_count,
  };
}

export function mapSupabaseGroupSuggestionRow(row: SupabaseGroupSuggestionRow): GroupSuggestion {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    visibility: row.visibility as GroupVisibility,
    memberCount: row.member_count,
    source: 'supabase',
  };
}

export function mapSupabaseSubgroupRow(row: SupabaseSubgroupRow): Subgroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    visibility: row.visibility as GroupVisibility,
    memberCount: row.member_count,
  };
}

export function mapSupabaseGroupJoinRequestRow(row: SupabaseGroupJoinRequestRow): GroupJoinRequestRecord {
  return {
    id: row.id,
    groupId: row.group_id,
    requesterId: row.requester_id,
    status: row.status as GroupJoinRequestStatus,
    createdAt: formatRelativeGermanTime(row.created_at),
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ? formatRelativeGermanTime(row.reviewed_at) : undefined,
    source: 'supabase',
    groupName: row.groups?.name,
    groupVisibility: row.groups?.visibility as GroupVisibility | undefined,
  };
}

export function mapSupabaseGroupDetailResponse(response: SupabaseGroupDetailResponse): Group {
  return {
    id: response.id,
    name: response.name,
    description: response.description ?? '',
    clubName: 'Arminia Bielefeld',
    clubId: response.team_id ?? undefined,
    ownerId: response.owner_id,
    memberIds: [],
    // Only a member response carries created_at — "gerade eben" would be a wrong/invented
    // timestamp for a non-member preview, so createdAt/createdAtIso are simply left unset there
    // (nothing in the non-member preview UI ever needs them).
    createdAt: response.created_at ? formatRelativeGermanTime(response.created_at) : '',
    visibility: response.visibility as GroupVisibility,
    groupType: response.group_type as GroupType,
    parentGroupId: response.parent_group_id ?? undefined,
    source: 'supabase',
    memberCount: response.member_count,
    myRole: response.my_role as Group['myRole'] | undefined,
    isMember: response.is_member,
    hasPendingJoinRequest: response.has_pending_join_request,
    createdAtIso: response.created_at,
  };
}

// A row from public.group_invitations, scoped to the current user as invitee (RLS: "Invitees can
// read their own group invitations").
export type SupabaseGroupInvitationRow = {
  group_id: string;
  inviter_id: string;
  status: string;
  created_at: string;
  responded_at: string | null;
};

export function mapSupabaseGroupInvitationRow(row: SupabaseGroupInvitationRow): GroupInvitation {
  return {
    groupId: row.group_id,
    inviterId: row.inviter_id,
    status: row.status as GroupInvitationStatus,
    createdAt: formatRelativeGermanTime(row.created_at),
    createdAtIso: row.created_at,
    respondedAtIso: row.responded_at ?? undefined,
  };
}

// A row from public.group_invitations, scoped to a group the current user administers (RLS:
// "Group admins can read invitations for their groups") -- always status = 'pending' in practice
// since that's the only status the invite UI ever queries for.
export type SupabaseGroupPendingInvitationRow = {
  group_id: string;
  invitee_id: string;
  created_at: string;
};

export function mapSupabaseGroupPendingInvitationRow(
  row: SupabaseGroupPendingInvitationRow,
  displayName: string,
  avatarUrl?: string,
): GroupPendingInvitation {
  return {
    groupId: row.group_id,
    inviteeId: row.invitee_id,
    displayName,
    avatarUrl,
    createdAt: formatRelativeGermanTime(row.created_at),
  };
}

export function mapSupabaseGroupMemberRow(row: SupabaseGroupMemberRow, displayName: string, avatarUrl?: string): GroupMemberRecord {
  return {
    userId: row.user_id,
    role: row.role as GroupMemberRecord['role'],
    joinedAt: formatRelativeGermanTime(row.joined_at),
    displayName,
    avatarUrl,
  };
}
