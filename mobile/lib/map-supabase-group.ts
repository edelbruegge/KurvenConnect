import type { Group, GroupJoinRequestRecord, GroupJoinRequestStatus, GroupSuggestion, GroupVisibility } from '@/data/groups';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

// A row from get_my_groups().
export type SupabaseGroupMembershipRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  my_role: string;
  member_count: number;
};

// A row from get_group_suggestions() — deliberately narrower, no owner_id.
export type SupabaseGroupSuggestionRow = {
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

export function mapSupabaseGroupMembershipRow(row: SupabaseGroupMembershipRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    clubName: 'Arminia Bielefeld',
    ownerId: row.owner_id,
    memberIds: [],
    createdAt: formatRelativeGermanTime(row.created_at),
    visibility: row.visibility as GroupVisibility,
    source: 'supabase',
    memberCount: row.member_count,
    myRole: row.my_role as Group['myRole'],
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
