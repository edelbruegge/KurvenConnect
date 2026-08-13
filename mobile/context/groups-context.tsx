import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useActiveClub } from '@/context/active-club-context';
import { useAuth } from '@/context/auth-context';
import {
  getGroupMemberCount,
  isPlausibleRemoteGroupId,
  seedGroupJoinRequests,
  seedGroupMessages,
  seedGroups,
  sortGroupsByRecentActivity,
  type Group,
  type GroupJoinRequest,
  type GroupJoinRequestRecord,
  type GroupJoinRequestStatus,
  type GroupMemberRecord,
  type GroupMessage,
  type GroupSuggestion,
  type GroupVisibility,
} from '@/data/groups';
import { CURRENT_USER_ID } from '@/data/users';
import { mapGroupError } from '@/lib/group-errors';
import { mapGroupMessageError } from '@/lib/group-message-errors';
import {
  mapSupabaseGroupDetailResponse,
  mapSupabaseGroupJoinRequestRow,
  mapSupabaseGroupMemberRow,
  mapSupabaseGroupMembershipRow,
  mapSupabaseGroupSuggestionRow,
  type SupabaseGroupDetailResponse,
  type SupabaseGroupJoinRequestRow,
  type SupabaseGroupMemberRow,
  type SupabaseGroupMembershipRow,
  type SupabaseGroupSuggestionRow,
} from '@/lib/map-supabase-group';
import { mapSupabaseGroupMessageRow, type SupabaseGroupMessageRow } from '@/lib/map-supabase-group-message';
import { supabase } from '@/lib/supabase';

// A client-generated idempotency token for send_group_message — lets a retried send be recognized
// server-side and avoid creating a duplicate message. Not a security token, just cheap collision
// avoidance, so Math.random() (not a crypto RNG) is fine here — same reasoning already applied to
// this project's other client-side temp-id generation (e.g. request-temp-... ids above).
function generateClientMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

type CreateGroupInput = {
  name: string;
  description: string;
  visibility: GroupVisibility;
};

// Seeds each local group's lastMessagePreview/lastMessageAt/lastMessageAtIso from
// seedGroupMessages once at startup, so sortGroupsByRecentActivity has real data to work with
// immediately — not just after the first local message is sent. ISO strings compare correctly
// with plain string comparison (lexicographic order matches chronological order for ISO 8601).
function deriveInitialLocalGroups(): Group[] {
  return seedGroups.map((group) => {
    const groupMessages = seedGroupMessages.filter((message) => message.groupId === group.id);

    if (groupMessages.length === 0) {
      return group;
    }

    const lastMessage = [...groupMessages].sort((a, b) => (b.createdAtIso ?? '').localeCompare(a.createdAtIso ?? ''))[0];

    return {
      ...group,
      lastMessagePreview: lastMessage.text,
      lastMessageAt: lastMessage.createdAt,
      lastMessageAtIso: lastMessage.createdAtIso,
      lastMessageSenderId: lastMessage.senderId,
    };
  });
}

type ActionResult = { error: string | null };

type RealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'reconnecting' | 'error' | 'closed';

// A minimal structural view of the postgres_changes payload — only the fields the handlers below
// actually read, same approach as ModerationContext/FeedPostsContext.
type GroupsRealtimeChangePayload = {
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

// Same minimal structural view, for the group_messages INSERT-only channel.
type GroupMessageRealtimeChangePayload = {
  new: Record<string, unknown>;
};

type GroupsContextValue = {
  groups: Group[];
  getGroupById: (id: string) => Group | undefined;
  getMyGroups: () => Group[];
  getRecommendedGroups: () => Group[];
  isMember: (groupId: string) => boolean;
  joinGroup: (groupId: string) => void;
  leaveGroup: (groupId: string) => Promise<ActionResult>;
  createGroup: (input: CreateGroupInput) => Promise<{ id: string | null; error: string | null }>;
  requestToJoin: (groupId: string) => void;
  getJoinRequestStatus: (groupId: string) => GroupJoinRequestStatus | null;
  getPendingRequestsForGroup: (groupId: string) => GroupJoinRequest[];
  getMyPendingJoinRequests: () => Group[];
  acceptJoinRequest: (requestId: string) => Promise<ActionResult>;
  rejectJoinRequest: (requestId: string) => Promise<ActionResult>;

  // Real, server-checked remote groups.
  remoteGroups: Group[];
  groupSuggestions: GroupSuggestion[];
  myJoinRequests: GroupJoinRequestRecord[];
  incomingJoinRequests: Record<string, GroupJoinRequestRecord[]>;
  isRemoteGroupsLoading: boolean;
  remoteGroupsError: string | null;
  isGroupSuggestionsLoading: boolean;
  groupSuggestionsError: string | null;
  isGroupActionSubmitting: boolean;
  groupActionError: string | null;
  refreshMyGroups: () => void;
  refreshGroupSuggestions: () => void;
  refreshIncomingRequestsForGroup: (groupId: string) => void;
  joinPublicGroup: (groupId: string) => Promise<ActionResult>;
  requestPrivateGroupJoin: (groupId: string) => Promise<ActionResult>;
  cancelJoinRequest: (requestId: string) => Promise<ActionResult>;

  // Group administration — owner/admin-only, all authorized server-side (see the RPCs themselves,
  // never trust client role checks alone). Local seed groups never accept these; every function
  // fails closed via isPlausibleRemoteGroupId.
  updateGroup: (groupId: string, input: { name: string; description: string; visibility: GroupVisibility }) => Promise<ActionResult>;
  removeGroupMember: (groupId: string, userId: string) => Promise<ActionResult>;
  promoteGroupMember: (groupId: string, userId: string) => Promise<ActionResult>;
  demoteGroupAdmin: (groupId: string, userId: string) => Promise<ActionResult>;
  transferGroupOwnership: (groupId: string, newOwnerId: string) => Promise<ActionResult>;

  // Member list for a single remote group, loaded on demand (never eagerly for every group).
  groupMembers: Record<string, GroupMemberRecord[]>;
  isGroupMembersLoading: boolean;
  groupMembersError: string | null;
  refreshGroupMembers: (groupId: string) => void;

  // Targeted single-group fetch (get_group_detail) — used by the route guard to distinguish "this
  // group doesn't exist" from "you are not a member of it", and to refresh a single group's own
  // data without reloading the whole get_my_groups() list.
  fetchGroupDetail: (groupId: string) => Promise<{ group: Group | null; error: string | null }>;

  groupsRealtimeStatus: RealtimeStatus;

  // Group chat — local seed groups (in-memory, source: 'local') and remote groups (public.
  // group_messages via RPC, source: 'supabase') are handled through entirely separate state below,
  // never mixed. Local groups never touch Supabase; remote functions never accept a local seed id.
  getLocalGroupMessages: (groupId: string) => GroupMessage[];
  sendLocalGroupMessage: (groupId: string, text: string) => void;

  remoteGroupMessagesByGroupId: Record<string, GroupMessage[]>;
  isGroupMessagesLoading: (groupId: string) => boolean;
  groupMessagesErrorFor: (groupId: string) => string | null;
  hasMoreGroupMessages: (groupId: string) => boolean;
  loadGroupMessages: (groupId: string) => void;
  loadOlderGroupMessages: (groupId: string) => void;
  sendGroupMessage: (groupId: string, text: string) => Promise<ActionResult>;
  markGroupRead: (groupId: string) => Promise<void>;

  // The single remote group chat currently open on screen — gates whether an incoming realtime
  // message is appended directly vs. only bumping the group's unread count/preview, and whether it
  // triggers an automatic markGroupRead. Mirrors MessagesContext's activeConversationId.
  activeGroupId: string | null;
  setActiveGroupId: (groupId: string | null) => void;

  groupMessagesRealtimeStatus: RealtimeStatus;
  retryGroupMessagesRealtime: () => void;
};

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

export function GroupsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { activeTeamId } = useActiveClub();

  // --- Local, in-memory seed groups — membership/join-request logic unchanged; initial
  // lastMessage* fields are derived once from seedGroupMessages (see deriveInitialLocalGroups). ---
  const [localGroups, setLocalGroups] = useState<Group[]>(() => deriveInitialLocalGroups());
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>(seedGroupJoinRequests);

  const getLocalGroupById = (id: string) => localGroups.find((group) => group.id === id);

  const isLocalMember = (groupId: string) => {
    const group = getLocalGroupById(groupId);
    return group ? group.memberIds.includes(CURRENT_USER_ID) : false;
  };

  const getRecommendedGroups = () =>
    localGroups.filter(
      (group) => group.ownerId !== CURRENT_USER_ID && !group.memberIds.includes(CURRENT_USER_ID) && group.clubId === activeTeamId,
    );

  const joinGroup = (groupId: string) => {
    setLocalGroups((current) =>
      current.map((group) =>
        group.id === groupId && !group.memberIds.includes(CURRENT_USER_ID)
          ? { ...group, memberIds: [...group.memberIds, CURRENT_USER_ID] }
          : group,
      ),
    );
  };

  const getJoinRequestStatus = (groupId: string): GroupJoinRequestStatus | null => {
    const request = joinRequests.find((entry) => entry.groupId === groupId && entry.userId === CURRENT_USER_ID);
    return request ? request.status : null;
  };

  const requestToJoin = (groupId: string) => {
    setJoinRequests((current) => {
      const existing = current.find((entry) => entry.groupId === groupId && entry.userId === CURRENT_USER_ID);

      if (existing) {
        if (existing.status === 'rejected') {
          return current.map((entry) =>
            entry.id === existing.id ? { ...entry, status: 'pending', createdAt: 'gerade eben' } : entry,
          );
        }

        return current;
      }

      const newRequest: GroupJoinRequest = {
        id: `request-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        groupId,
        userId: CURRENT_USER_ID,
        status: 'pending',
        createdAt: 'gerade eben',
      };

      return [...current, newRequest];
    });
  };

  const getPendingRequestsForGroup = (groupId: string) =>
    joinRequests.filter((entry) => entry.groupId === groupId && entry.status === 'pending');

  const getMyPendingJoinRequests = (): Group[] =>
    joinRequests
      .filter((entry) => entry.userId === CURRENT_USER_ID && entry.status === 'pending')
      .map((entry) => getLocalGroupById(entry.groupId))
      .filter((group): group is Group => group !== undefined);

  const acceptLocalJoinRequest = (requestId: string) => {
    const request = joinRequests.find((entry) => entry.id === requestId);

    if (!request) {
      return;
    }

    setJoinRequests((current) => current.map((entry) => (entry.id === requestId ? { ...entry, status: 'accepted' } : entry)));

    setLocalGroups((current) =>
      current.map((group) =>
        group.id === request.groupId && !group.memberIds.includes(request.userId)
          ? { ...group, memberIds: [...group.memberIds, request.userId] }
          : group,
      ),
    );
  };

  const rejectLocalJoinRequest = (requestId: string) => {
    setJoinRequests((current) => current.map((entry) => (entry.id === requestId ? { ...entry, status: 'rejected' } : entry)));
  };

  // --- Local group chat (seed groups only) — in-memory, never touches Supabase. ---
  const [localGroupMessages, setLocalGroupMessages] = useState<GroupMessage[]>(seedGroupMessages);

  const getLocalGroupMessages = (groupId: string): GroupMessage[] =>
    localGroupMessages.filter((message) => message.groupId === groupId);

  const sendLocalGroupMessage = (groupId: string, text: string) => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    // The actual moment of sending — real data, not a "missing timestamp" fallback, so stamping
    // the current time here is correct (unlike getGroupActivityTimestamp's 0-fallback for groups
    // that have no real timestamp at all).
    const sentAtIso = new Date().toISOString();

    const newMessage: GroupMessage = {
      id: `group-message-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      groupId,
      senderId: CURRENT_USER_ID,
      text: trimmed,
      createdAt: 'gerade eben',
      createdAtIso: sentAtIso,
    };

    setLocalGroupMessages((current) => [...current, newMessage]);

    // Keep the local group's own lastMessage* fields in sync, exactly like sendGroupMessage does
    // for remoteGroups — this is what lets sortGroupsByRecentActivity treat local and remote
    // groups uniformly without any source-specific branching.
    setLocalGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              lastMessagePreview: newMessage.text,
              lastMessageAt: newMessage.createdAt,
              lastMessageAtIso: newMessage.createdAtIso,
              lastMessageSenderId: newMessage.senderId,
            }
          : group,
      ),
    );
  };

  // --- Remote groups (get_my_groups). ---
  const [remoteGroups, setRemoteGroups] = useState<Group[]>([]);
  const [isRemoteGroupsLoading, setIsRemoteGroupsLoading] = useState(false);
  const [remoteGroupsError, setRemoteGroupsError] = useState<string | null>(null);
  const [remoteGroupsReloadToken, setRemoteGroupsReloadToken] = useState(0);

  useEffect(() => {
    if (!authUserId) {
      setRemoteGroups([]);
      setIsRemoteGroupsLoading(false);
      setRemoteGroupsError(null);
      return;
    }

    let isCurrent = true;
    setIsRemoteGroupsLoading(true);
    setRemoteGroupsError(null);

    supabase
      .rpc('get_my_groups')
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setRemoteGroupsError(mapGroupError(error, 'load'));
          setRemoteGroups([]);
          setIsRemoteGroupsLoading(false);
          return;
        }

        setRemoteGroups(((data ?? []) as SupabaseGroupMembershipRow[]).map(mapSupabaseGroupMembershipRow));
        setIsRemoteGroupsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, remoteGroupsReloadToken]);

  const refreshMyGroups = () => {
    setRemoteGroupsReloadToken((token) => token + 1);
  };

  const createGroup = async (input: CreateGroupInput): Promise<{ id: string | null; error: string | null }> => {
    const { data, error } = await supabase.rpc('create_group', {
      p_name: input.name,
      p_description: input.description.trim() || null,
      p_visibility: input.visibility,
      p_team_id: activeTeamId,
    });

    if (error) {
      return { id: null, error: mapGroupError(error, 'create') };
    }

    const mapped = mapSupabaseGroupMembershipRow({
      ...(data as { id: string; owner_id: string; name: string; description: string | null; visibility: string; created_at: string; updated_at: string }),
      my_role: 'admin',
      member_count: 1,
      last_message_body: null,
      last_message_at: null,
      last_message_sender_id: null,
      unread_count: 0,
    });

    setRemoteGroups((current) => [mapped, ...current]);

    return { id: mapped.id, error: null };
  };

  // Targeted single-group fetch — used by the route guard (distinguishes "not found" from "not a
  // member") and to refresh one group's own data without reloading the whole list. Never sends a
  // local seed id to the RPC.
  const fetchGroupDetail = async (groupId: string): Promise<{ group: Group | null; error: string | null }> => {
    if (!isPlausibleRemoteGroupId(groupId)) {
      return { group: null, error: 'Diese Gruppe ist nicht mehr verfügbar.' };
    }

    const { data, error } = await supabase.rpc('get_group_detail', { p_group_id: groupId });

    if (error) {
      return { group: null, error: mapGroupError(error, 'load') };
    }

    const mapped = mapSupabaseGroupDetailResponse(data as SupabaseGroupDetailResponse);

    setRemoteGroups((current) => {
      const exists = current.some((group) => group.id === mapped.id);
      return exists ? current.map((group) => (group.id === mapped.id ? mapped : group)) : [mapped, ...current];
    });

    return { group: mapped, error: null };
  };

  // --- Group suggestions (get_group_suggestions). ---
  const [groupSuggestions, setGroupSuggestions] = useState<GroupSuggestion[]>([]);
  const [isGroupSuggestionsLoading, setIsGroupSuggestionsLoading] = useState(false);
  const [groupSuggestionsError, setGroupSuggestionsError] = useState<string | null>(null);
  const [groupSuggestionsReloadToken, setGroupSuggestionsReloadToken] = useState(0);

  useEffect(() => {
    if (!authUserId || !activeTeamId) {
      setGroupSuggestions([]);
      setIsGroupSuggestionsLoading(!!authUserId);
      setGroupSuggestionsError(null);
      return;
    }

    let isCurrent = true;
    setIsGroupSuggestionsLoading(true);
    setGroupSuggestionsError(null);

    supabase
      .rpc('get_group_suggestions', { p_limit: 5, p_team_id: activeTeamId })
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setGroupSuggestionsError(mapGroupError(error, 'load'));
          setGroupSuggestions([]);
          setIsGroupSuggestionsLoading(false);
          return;
        }

        setGroupSuggestions(((data ?? []) as SupabaseGroupSuggestionRow[]).map(mapSupabaseGroupSuggestionRow));
        setIsGroupSuggestionsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, activeTeamId, remoteGroups, groupSuggestionsReloadToken]);

  const refreshGroupSuggestions = () => {
    setGroupSuggestionsReloadToken((token) => token + 1);
  };

  // --- My own pending join requests. ---
  const [myJoinRequests, setMyJoinRequests] = useState<GroupJoinRequestRecord[]>([]);
  const [myJoinRequestsReloadToken, setMyJoinRequestsReloadToken] = useState(0);

  useEffect(() => {
    if (!authUserId) {
      setMyJoinRequests([]);
      return;
    }

    let isCurrent = true;

    supabase
      .from('group_join_requests')
      .select('id, group_id, requester_id, status, created_at, reviewed_by, reviewed_at, groups(name, visibility)')
      .eq('requester_id', authUserId)
      .eq('status', 'pending')
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setMyJoinRequests([]);
          return;
        }

        setMyJoinRequests(((data ?? []) as unknown as SupabaseGroupJoinRequestRow[]).map(mapSupabaseGroupJoinRequestRow));
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, myJoinRequestsReloadToken]);

  const refreshMyJoinRequests = () => {
    setMyJoinRequestsReloadToken((token) => token + 1);
  };

  // --- Incoming join requests for groups I administer — loaded on demand only, never eagerly for
  // every admin group. ---
  const [incomingJoinRequests, setIncomingJoinRequests] = useState<Record<string, GroupJoinRequestRecord[]>>({});

  const refreshIncomingRequestsForGroup = (groupId: string) => {
    if (!authUserId) {
      return;
    }

    supabase
      .from('group_join_requests')
      .select('id, group_id, requester_id, status, created_at, reviewed_by, reviewed_at')
      .eq('group_id', groupId)
      .eq('status', 'pending')
      .then(({ data, error }) => {
        if (error) {
          return;
        }

        const mapped = ((data ?? []) as SupabaseGroupJoinRequestRow[]).map(mapSupabaseGroupJoinRequestRow);
        setIncomingJoinRequests((current) => ({ ...current, [groupId]: mapped }));
      });
  };

  // --- Member list for a single group, loaded on demand only (never eagerly for every group). ---
  const [groupMembers, setGroupMembers] = useState<Record<string, GroupMemberRecord[]>>({});
  const [isGroupMembersLoading, setIsGroupMembersLoading] = useState(false);
  const [groupMembersError, setGroupMembersError] = useState<string | null>(null);

  const refreshGroupMembers = (groupId: string) => {
    if (!authUserId) {
      return;
    }

    setIsGroupMembersLoading(true);
    setGroupMembersError(null);

    supabase
      .from('group_members')
      .select('user_id, role, joined_at')
      .eq('group_id', groupId)
      .then(async ({ data, error }) => {
        if (error) {
          setGroupMembersError(mapGroupError(error, 'load'));
          setIsGroupMembersLoading(false);
          return;
        }

        const rows = (data ?? []) as SupabaseGroupMemberRow[];

        if (rows.length === 0) {
          setGroupMembers((current) => ({ ...current, [groupId]: [] }));
          setIsGroupMembersLoading(false);
          return;
        }

        const userIds = rows.map((row) => row.user_id);
        const { data: profileRows } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds);

        const displayNameById: Record<string, string> = {};
        const avatarUrlById: Record<string, string | undefined> = {};
        ((profileRows ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]).forEach((row) => {
          displayNameById[row.id] = row.display_name?.trim() || 'Neues Mitglied';
          avatarUrlById[row.id] = row.avatar_url ?? undefined;
        });

        const mapped = rows.map((row) =>
          mapSupabaseGroupMemberRow(row, displayNameById[row.user_id] ?? 'Unbekanntes Mitglied', avatarUrlById[row.user_id]),
        );
        setGroupMembers((current) => ({ ...current, [groupId]: mapped }));
        setIsGroupMembersLoading(false);
      });
  };

  // --- Remote group chat (public.group_messages). Loaded on demand per group, never eagerly for
  // every group — mirrors MessagesContext's remoteMessagesByConversationId. ---
  const [remoteGroupMessagesByGroupId, setRemoteGroupMessagesByGroupId] = useState<Record<string, GroupMessage[]>>({});
  const [groupMessagesLoadingByGroupId, setGroupMessagesLoadingByGroupId] = useState<Record<string, boolean>>({});
  const [groupMessagesErrorByGroupId, setGroupMessagesErrorByGroupId] = useState<Record<string, string | null>>({});
  const [groupMessagesHasMoreByGroupId, setGroupMessagesHasMoreByGroupId] = useState<Record<string, boolean>>({});
  const groupMessagesRequestSeq = useRef<Record<string, number>>({});
  const GROUP_MESSAGES_PAGE_SIZE = 50;

  const isGroupMessagesLoading = (groupId: string) => groupMessagesLoadingByGroupId[groupId] ?? false;
  const groupMessagesErrorFor = (groupId: string) => groupMessagesErrorByGroupId[groupId] ?? null;
  const hasMoreGroupMessages = (groupId: string) => groupMessagesHasMoreByGroupId[groupId] ?? false;

  const loadGroupMessages = (groupId: string) => {
    if (!authUserId || !isPlausibleRemoteGroupId(groupId)) {
      return;
    }

    const seq = (groupMessagesRequestSeq.current[groupId] ?? 0) + 1;
    groupMessagesRequestSeq.current[groupId] = seq;

    setGroupMessagesLoadingByGroupId((current) => ({ ...current, [groupId]: true }));
    setGroupMessagesErrorByGroupId((current) => ({ ...current, [groupId]: null }));

    supabase
      .rpc('get_group_messages', { p_group_id: groupId, p_limit: GROUP_MESSAGES_PAGE_SIZE })
      .then(({ data, error }) => {
        if (groupMessagesRequestSeq.current[groupId] !== seq) {
          return;
        }

        if (error) {
          setGroupMessagesErrorByGroupId((current) => ({ ...current, [groupId]: mapGroupMessageError(error, 'load') }));
          setGroupMessagesLoadingByGroupId((current) => ({ ...current, [groupId]: false }));
          return;
        }

        const rows = (data ?? []) as SupabaseGroupMessageRow[];
        const mapped = rows.map(mapSupabaseGroupMessageRow).reverse();

        setRemoteGroupMessagesByGroupId((current) => ({ ...current, [groupId]: mapped }));
        setGroupMessagesHasMoreByGroupId((current) => ({ ...current, [groupId]: rows.length === GROUP_MESSAGES_PAGE_SIZE }));
        setGroupMessagesLoadingByGroupId((current) => ({ ...current, [groupId]: false }));
      });
  };

  const loadOlderGroupMessages = (groupId: string) => {
    if (!authUserId || !isPlausibleRemoteGroupId(groupId) || isGroupMessagesLoading(groupId)) {
      return;
    }

    const existing = remoteGroupMessagesByGroupId[groupId] ?? [];
    const oldest = existing[0];

    if (!oldest?.createdAtIso) {
      return;
    }

    const seq = (groupMessagesRequestSeq.current[groupId] ?? 0) + 1;
    groupMessagesRequestSeq.current[groupId] = seq;

    setGroupMessagesLoadingByGroupId((current) => ({ ...current, [groupId]: true }));

    supabase
      .rpc('get_group_messages', { p_group_id: groupId, p_limit: GROUP_MESSAGES_PAGE_SIZE, p_before: oldest.createdAtIso })
      .then(({ data, error }) => {
        if (groupMessagesRequestSeq.current[groupId] !== seq) {
          return;
        }

        if (error) {
          setGroupMessagesErrorByGroupId((current) => ({ ...current, [groupId]: mapGroupMessageError(error, 'load') }));
          setGroupMessagesLoadingByGroupId((current) => ({ ...current, [groupId]: false }));
          return;
        }

        const rows = (data ?? []) as SupabaseGroupMessageRow[];
        const mapped = rows.map(mapSupabaseGroupMessageRow).reverse();

        setRemoteGroupMessagesByGroupId((current) => ({ ...current, [groupId]: [...mapped, ...(current[groupId] ?? [])] }));
        setGroupMessagesHasMoreByGroupId((current) => ({ ...current, [groupId]: rows.length === GROUP_MESSAGES_PAGE_SIZE }));
        setGroupMessagesLoadingByGroupId((current) => ({ ...current, [groupId]: false }));
      });
  };

  const inFlightGroupMessageSends = useRef<Set<string>>(new Set());

  // Sends via the send_group_message RPC and appends the real, server-returned message right away
  // — there is no pre-save optimistic bubble (nothing to reconcile once the real row arrives), and
  // the realtime echo is deduped by id against this same append (see handleGroupMessageInsert).
  const sendGroupMessage = async (groupId: string, text: string): Promise<ActionResult> => {
    if (!authUserId) {
      return { error: 'Bitte melde dich an, um das zu tun.' };
    }

    if (!isPlausibleRemoteGroupId(groupId)) {
      return { error: 'Diese Gruppe ist nicht mehr verfügbar.' };
    }

    const trimmed = text.trim();

    if (!trimmed) {
      return { error: 'Bitte gib eine Nachricht ein.' };
    }

    if (trimmed.length > 2000) {
      return { error: 'Deine Nachricht ist zu lang (max. 2000 Zeichen).' };
    }

    if (inFlightGroupMessageSends.current.has(groupId)) {
      return { error: null };
    }

    inFlightGroupMessageSends.current.add(groupId);

    try {
      const { data, error } = await supabase.rpc('send_group_message', {
        p_group_id: groupId,
        p_body: trimmed,
        p_client_message_id: generateClientMessageId(),
      });

      if (error) {
        return { error: mapGroupMessageError(error, 'send') };
      }

      const message = mapSupabaseGroupMessageRow(data as SupabaseGroupMessageRow);

      setRemoteGroupMessagesByGroupId((current) => {
        const existing = current[groupId] ?? [];

        if (existing.some((entry) => entry.id === message.id)) {
          return current;
        }

        return { ...current, [groupId]: [...existing, message] };
      });

      setRemoteGroups((current) =>
        current.map((group) =>
          group.id === groupId
            ? {
                ...group,
                lastMessagePreview: message.text,
                lastMessageAt: message.createdAt,
                lastMessageAtIso: message.createdAtIso,
                lastMessageSenderId: message.senderId,
              }
            : group,
        ),
      );

      return { error: null };
    } finally {
      inFlightGroupMessageSends.current.delete(groupId);
    }
  };

  // markGroupRead: optimistic local zero-out (no waiting on the round trip, no F5 needed), same
  // pattern as MessagesContext's markRemoteConversationRead.
  const markGroupRead = async (groupId: string): Promise<void> => {
    if (!authUserId || !isPlausibleRemoteGroupId(groupId)) {
      return;
    }

    setRemoteGroups((current) => current.map((group) => (group.id === groupId ? { ...group, unreadCount: 0 } : group)));

    const { error } = await supabase.rpc('mark_group_read', { p_group_id: groupId });

    if (error && __DEV__) {
      console.error('[group-messages] mark_group_read failed', error);
    }
  };

  // The single remote group chat currently open on screen.
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  // Guards against repeatedly calling refreshMyGroups() if several messages for a not-yet-known
  // group arrive in a burst — reset once remoteGroups actually changes (including from that same
  // refresh), same reasoning as MessagesContext's conversationsRefreshScheduledRef.
  const groupMessagesResyncScheduledRef = useRef(false);

  useEffect(() => {
    groupMessagesResyncScheduledRef.current = false;
  }, [remoteGroups]);

  // --- Realtime: group_messages, one channel per signed-in user (not per open chat — RLS already
  // scopes delivery to "messages of groups I'm a member of", and a single stable channel avoids
  // teardown/rebuild every time the user switches which chat is open). activeGroupIdRef decides
  // whether an incoming message is appended directly to an open chat or only bumps the group's
  // unread count/preview in the list. Dedup is always by id, never by text/time/sender. ---
  const handleGroupMessageInsert = (payload: GroupMessageRealtimeChangePayload) => {
    if (!authUserId) {
      return;
    }

    const row = payload.new;

    if (
      typeof row.id !== 'string' ||
      typeof row.group_id !== 'string' ||
      typeof row.sender_id !== 'string' ||
      typeof row.body !== 'string' ||
      typeof row.created_at !== 'string'
    ) {
      return;
    }

    const message = mapSupabaseGroupMessageRow({
      id: row.id,
      group_id: row.group_id,
      sender_id: row.sender_id,
      body: row.body,
      created_at: row.created_at,
      client_message_id: typeof row.client_message_id === 'string' ? row.client_message_id : null,
    });

    const isOwnMessage = message.senderId === authUserId;
    const isActiveGroup = activeGroupIdRef.current === message.groupId;

    let alreadyKnown = false;

    setRemoteGroupMessagesByGroupId((current) => {
      const existing = current[message.groupId] ?? [];

      if (existing.some((entry) => entry.id === message.id)) {
        alreadyKnown = true;
        return current;
      }

      return { ...current, [message.groupId]: [...existing, message] };
    });

    if (alreadyKnown) {
      return;
    }

    setRemoteGroups((current) => {
      const groupExists = current.some((group) => group.id === message.groupId);

      if (!groupExists) {
        if (!groupMessagesResyncScheduledRef.current) {
          groupMessagesResyncScheduledRef.current = true;
          refreshMyGroups();
        }
        return current;
      }

      return current.map((group) =>
        group.id === message.groupId
          ? {
              ...group,
              lastMessagePreview: message.text,
              lastMessageAt: message.createdAt,
              lastMessageAtIso: message.createdAtIso,
              lastMessageSenderId: message.senderId,
              unreadCount: !isOwnMessage && !isActiveGroup ? (group.unreadCount ?? 0) + 1 : (group.unreadCount ?? 0),
            }
          : group,
      );
    });

    if (isActiveGroup && !isOwnMessage) {
      void markGroupRead(message.groupId);
    }
  };

  const [groupMessagesRealtimeStatus, setGroupMessagesRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [groupMessagesRealtimeReconnectToken, setGroupMessagesRealtimeReconnectToken] = useState(0);
  const groupMessagesRealtimeStatusRef = useRef<RealtimeStatus>('idle');

  useEffect(() => {
    groupMessagesRealtimeStatusRef.current = groupMessagesRealtimeStatus;
  }, [groupMessagesRealtimeStatus]);

  const handleGroupMessageInsertRef = useRef(handleGroupMessageInsert);
  handleGroupMessageInsertRef.current = handleGroupMessageInsert;

  useEffect(() => {
    if (!authUserId) {
      setGroupMessagesRealtimeStatus('idle');
      return;
    }

    let isCurrent = true;
    setGroupMessagesRealtimeStatus((current) => (current === 'error' || current === 'closed' ? 'reconnecting' : 'connecting'));

    const channel = supabase
      .channel(`group-messages:${authUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, (payload) => {
        if (!isCurrent) return;
        handleGroupMessageInsertRef.current(payload as unknown as GroupMessageRealtimeChangePayload);
      })
      .subscribe((status) => {
        if (!isCurrent) return;

        if (status === 'SUBSCRIBED') {
          setGroupMessagesRealtimeStatus('subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setGroupMessagesRealtimeStatus('error');
        } else if (status === 'CLOSED') {
          setGroupMessagesRealtimeStatus((current) => (current === 'error' ? current : 'closed'));
        }
      });

    return () => {
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [authUserId, groupMessagesRealtimeReconnectToken]);

  const retryGroupMessagesRealtime = () => {
    setGroupMessagesRealtimeReconnectToken((token) => token + 1);
  };

  // --- Reset everything remote on logout/account switch. ---
  useEffect(() => {
    if (!authUserId) {
      setIncomingJoinRequests({});
      setGroupMembers({});
      setGroupMembersError(null);
      setIsGroupMembersLoading(false);
      setRemoteGroupMessagesByGroupId({});
      setGroupMessagesLoadingByGroupId({});
      setGroupMessagesErrorByGroupId({});
      setGroupMessagesHasMoreByGroupId({});
      setActiveGroupId(null);
      groupMessagesRequestSeq.current = {};
    }
  }, [authUserId]);

  // --- Group actions (join/request/manage/cancel/leave). ---
  const [isGroupActionSubmitting, setIsGroupActionSubmitting] = useState(false);
  const [groupActionError, setGroupActionError] = useState<string | null>(null);
  const inFlightGroupActionIds = useRef<Set<string>>(new Set());

  const joinPublicGroup = async (groupId: string): Promise<ActionResult> => {
    if (inFlightGroupActionIds.current.has(groupId)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(groupId);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { error } = await supabase.rpc('join_public_group', { p_group_id: groupId });

      if (error) {
        const mapped = mapGroupError(error, 'join');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      setGroupSuggestions((current) => current.filter((suggestion) => suggestion.id !== groupId));
      refreshMyGroups();

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(groupId);
      setIsGroupActionSubmitting(false);
    }
  };

  const requestPrivateGroupJoin = async (groupId: string): Promise<ActionResult> => {
    if (inFlightGroupActionIds.current.has(groupId)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(groupId);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { data, error } = await supabase.rpc('request_private_group_join', { p_group_id: groupId });

      if (error) {
        const mapped = mapGroupError(error, 'request');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      const suggestion = groupSuggestions.find((entry) => entry.id === groupId);
      const mappedRequest = mapSupabaseGroupJoinRequestRow(data as SupabaseGroupJoinRequestRow);
      setMyJoinRequests((current) => [
        { ...mappedRequest, groupName: suggestion?.name, groupVisibility: suggestion?.visibility },
        ...current,
      ]);

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(groupId);
      setIsGroupActionSubmitting(false);
    }
  };

  const cancelJoinRequest = async (requestId: string): Promise<ActionResult> => {
    if (inFlightGroupActionIds.current.has(requestId)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(requestId);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { error } = await supabase.rpc('cancel_group_join_request', { p_request_id: requestId });

      if (error) {
        const mapped = mapGroupError(error, 'cancel');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      setMyJoinRequests((current) => current.filter((entry) => entry.id !== requestId));

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(requestId);
      setIsGroupActionSubmitting(false);
    }
  };

  // acceptJoinRequest/rejectJoinRequest: reused names, now source-aware — a local seed request is
  // handled exactly as before (synchronous, wrapped in a resolved promise), anything else is
  // treated as a remote request id and goes through manage_group_join_request.
  const acceptJoinRequest = async (requestId: string): Promise<ActionResult> => {
    if (joinRequests.some((entry) => entry.id === requestId)) {
      acceptLocalJoinRequest(requestId);
      return { error: null };
    }

    if (inFlightGroupActionIds.current.has(requestId)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(requestId);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { data, error } = await supabase.rpc('manage_group_join_request', { p_request_id: requestId, p_action: 'accept' });

      if (error) {
        const mapped = mapGroupError(error, 'manage');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      const updated = mapSupabaseGroupJoinRequestRow(data as SupabaseGroupJoinRequestRow);
      setIncomingJoinRequests((current) => ({
        ...current,
        [updated.groupId]: (current[updated.groupId] ?? []).filter((entry) => entry.id !== updated.id),
      }));

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(requestId);
      setIsGroupActionSubmitting(false);
    }
  };

  const rejectJoinRequest = async (requestId: string): Promise<ActionResult> => {
    if (joinRequests.some((entry) => entry.id === requestId)) {
      rejectLocalJoinRequest(requestId);
      return { error: null };
    }

    if (inFlightGroupActionIds.current.has(requestId)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(requestId);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { data, error } = await supabase.rpc('manage_group_join_request', { p_request_id: requestId, p_action: 'reject' });

      if (error) {
        const mapped = mapGroupError(error, 'manage');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      const updated = mapSupabaseGroupJoinRequestRow(data as SupabaseGroupJoinRequestRow);
      setIncomingJoinRequests((current) => ({
        ...current,
        [updated.groupId]: (current[updated.groupId] ?? []).filter((entry) => entry.id !== updated.id),
      }));

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(requestId);
      setIsGroupActionSubmitting(false);
    }
  };

  // leaveGroup: reused name, now source-aware — local groups keep the exact previous behavior
  // (owner can never leave), remote groups go through leave_group.
  const leaveGroup = async (groupId: string): Promise<ActionResult> => {
    const localGroup = getLocalGroupById(groupId);

    if (localGroup) {
      if (localGroup.ownerId !== CURRENT_USER_ID) {
        setLocalGroups((current) =>
          current.map((group) =>
            group.id === groupId ? { ...group, memberIds: group.memberIds.filter((id) => id !== CURRENT_USER_ID) } : group,
          ),
        );
      }

      return { error: null };
    }

    if (inFlightGroupActionIds.current.has(groupId)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(groupId);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });

      if (error) {
        const mapped = mapGroupError(error, 'leave');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      setRemoteGroups((current) => current.filter((group) => group.id !== groupId));

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(groupId);
      setIsGroupActionSubmitting(false);
    }
  };

  // --- Group administration (update/remove/promote/demote/transfer) — all authorized server-side
  // by the RPCs themselves; the client-side checks driving button visibility are UI convenience
  // only, never the actual security boundary. Reuses the same isGroupActionSubmitting/
  // groupActionError/inFlightGroupActionIds trio as join/leave/accept/reject above rather than a
  // parallel second state group — conceptually the same "one group action in flight" idea. ---

  const updateGroup = async (
    groupId: string,
    input: { name: string; description: string; visibility: GroupVisibility },
  ): Promise<ActionResult> => {
    if (!isPlausibleRemoteGroupId(groupId)) {
      return { error: 'Diese Gruppe ist nicht mehr verfügbar.' };
    }

    if (inFlightGroupActionIds.current.has(groupId)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(groupId);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { data, error } = await supabase.rpc('update_group', {
        p_group_id: groupId,
        p_name: input.name,
        p_description: input.description.trim() || null,
        p_visibility: input.visibility,
      });

      if (error) {
        const mapped = mapGroupError(error, 'update');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      const row = data as { name: string; description: string | null; visibility: string };
      setRemoteGroups((current) =>
        current.map((group) =>
          group.id === groupId
            ? { ...group, name: row.name, description: row.description ?? '', visibility: row.visibility as GroupVisibility }
            : group,
        ),
      );

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(groupId);
      setIsGroupActionSubmitting(false);
    }
  };

  // removeGroupMember/promoteGroupMember/demoteGroupAdmin: keyed by group+target (not just group)
  // so an admin confirming actions on two different members of the same group in quick succession
  // isn't incorrectly blocked by the other's in-flight flag. After success, just re-fetch the
  // affected group's member list (if already loaded) and the acting user's own group list — same
  // "re-fetch rather than patch" reasoning as the realtime handlers below; group sizes here are
  // small, a full re-fetch is simple and safe.
  const removeGroupMember = async (groupId: string, userId: string): Promise<ActionResult> => {
    if (!isPlausibleRemoteGroupId(groupId)) {
      return { error: 'Diese Gruppe ist nicht mehr verfügbar.' };
    }

    const actionKey = `remove:${groupId}:${userId}`;

    if (inFlightGroupActionIds.current.has(actionKey)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(actionKey);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { error } = await supabase.rpc('remove_group_member', { p_group_id: groupId, p_user_id: userId });

      if (error) {
        const mapped = mapGroupError(error, 'removeMember');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      if (groupId in groupMembers) {
        refreshGroupMembers(groupId);
      }
      refreshMyGroups();

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(actionKey);
      setIsGroupActionSubmitting(false);
    }
  };

  const promoteGroupMember = async (groupId: string, userId: string): Promise<ActionResult> => {
    if (!isPlausibleRemoteGroupId(groupId)) {
      return { error: 'Diese Gruppe ist nicht mehr verfügbar.' };
    }

    const actionKey = `promote:${groupId}:${userId}`;

    if (inFlightGroupActionIds.current.has(actionKey)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(actionKey);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { error } = await supabase.rpc('promote_group_member', { p_group_id: groupId, p_user_id: userId });

      if (error) {
        const mapped = mapGroupError(error, 'promote');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      if (groupId in groupMembers) {
        refreshGroupMembers(groupId);
      }
      refreshMyGroups();

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(actionKey);
      setIsGroupActionSubmitting(false);
    }
  };

  const demoteGroupAdmin = async (groupId: string, userId: string): Promise<ActionResult> => {
    if (!isPlausibleRemoteGroupId(groupId)) {
      return { error: 'Diese Gruppe ist nicht mehr verfügbar.' };
    }

    const actionKey = `demote:${groupId}:${userId}`;

    if (inFlightGroupActionIds.current.has(actionKey)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(actionKey);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { error } = await supabase.rpc('demote_group_admin', { p_group_id: groupId, p_user_id: userId });

      if (error) {
        const mapped = mapGroupError(error, 'demote');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      if (groupId in groupMembers) {
        refreshGroupMembers(groupId);
      }
      refreshMyGroups();

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(actionKey);
      setIsGroupActionSubmitting(false);
    }
  };

  const transferGroupOwnership = async (groupId: string, newOwnerId: string): Promise<ActionResult> => {
    if (!isPlausibleRemoteGroupId(groupId)) {
      return { error: 'Diese Gruppe ist nicht mehr verfügbar.' };
    }

    if (inFlightGroupActionIds.current.has(groupId)) {
      return { error: null };
    }

    inFlightGroupActionIds.current.add(groupId);
    setIsGroupActionSubmitting(true);
    setGroupActionError(null);

    try {
      const { data, error } = await supabase.rpc('transfer_group_ownership', {
        p_group_id: groupId,
        p_new_owner_id: newOwnerId,
      });

      if (error) {
        const mapped = mapGroupError(error, 'transferOwnership');
        setGroupActionError(mapped);
        return { error: mapped };
      }

      const row = data as { owner_id: string };
      setRemoteGroups((current) => current.map((group) => (group.id === groupId ? { ...group, ownerId: row.owner_id } : group)));

      if (groupId in groupMembers) {
        refreshGroupMembers(groupId);
      }
      refreshMyGroups();

      return { error: null };
    } finally {
      inFlightGroupActionIds.current.delete(groupId);
      setIsGroupActionSubmitting(false);
    }
  };

  // --- Realtime: group_members + group_join_requests, one channel per signed-in user. RLS on
  // both tables already scopes delivery to "my own groups' membership"/"my own
  // requests"/"requests for groups I admin" — no policy change was needed to add this. On any
  // relevant change this simply re-triggers the matching existing refresh function rather than
  // patching state in place (group sizes in this app are small, a full re-fetch is simple and
  // safe) — same reasoning as ModerationContext's reports/content_restrictions channel. ---
  const [groupsRealtimeStatus, setGroupsRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [groupsRealtimeReconnectToken, setGroupsRealtimeReconnectToken] = useState(0);
  const groupsRealtimeStatusRef = useRef<RealtimeStatus>('idle');

  useEffect(() => {
    groupsRealtimeStatusRef.current = groupsRealtimeStatus;
  }, [groupsRealtimeStatus]);

  const handleGroupMembersChange = (payload: GroupsRealtimeChangePayload) => {
    const row = payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old;
    const groupId = row.group_id;

    if (typeof groupId !== 'string') {
      return;
    }

    if (remoteGroups.some((group) => group.id === groupId)) {
      refreshMyGroups();
    }

    if (groupId in groupMembers) {
      refreshGroupMembers(groupId);
    }
  };

  // Handles name/description/visibility/owner_id changes (update_group, transfer_group_ownership).
  // Role changes (promote/demote/remove) touch group_members instead, already covered by
  // handleGroupMembersChange above — no overlap. Always re-fetches rather than patching in place:
  // a raw groups-table row doesn't carry my_role/member_count/last_message_*/unread_count (those
  // are only computed by get_my_groups()), and after an ownership transfer my_role itself may have
  // changed too, so a full refreshMyGroups() is the only way to stay correct.
  const handleGroupsRowChange = (payload: GroupsRealtimeChangePayload) => {
    const row = payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old;
    const groupId = row.id;

    if (typeof groupId !== 'string') {
      return;
    }

    if (remoteGroups.some((group) => group.id === groupId)) {
      refreshMyGroups();
    }

    if (groupId in groupMembers) {
      refreshGroupMembers(groupId);
    }
  };

  const handleGroupJoinRequestChange = (payload: GroupsRealtimeChangePayload) => {
    const row = payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old;
    const groupId = row.group_id;
    const requesterId = row.requester_id;
    const status = row.status;

    if (typeof groupId !== 'string') {
      return;
    }

    if (typeof requesterId === 'string' && requesterId === authUserId) {
      refreshMyJoinRequests();

      if (status === 'accepted') {
        refreshMyGroups();
      }
    }

    if (groupId in incomingJoinRequests) {
      refreshIncomingRequestsForGroup(groupId);
    }
  };

  // Ref indirection so the long-lived channel subscription always calls the latest closures
  // without needing to reconnect the channel on every state change — same pattern already used in
  // ModerationContext/FeedPostsContext.
  const handleGroupMembersChangeRef = useRef(handleGroupMembersChange);
  handleGroupMembersChangeRef.current = handleGroupMembersChange;
  const handleGroupJoinRequestChangeRef = useRef(handleGroupJoinRequestChange);
  handleGroupJoinRequestChangeRef.current = handleGroupJoinRequestChange;
  const handleGroupsRowChangeRef = useRef(handleGroupsRowChange);
  handleGroupsRowChangeRef.current = handleGroupsRowChange;

  useEffect(() => {
    if (!authUserId) {
      setGroupsRealtimeStatus('idle');
      return;
    }

    let isCurrent = true;
    setGroupsRealtimeStatus((current) => (current === 'error' || current === 'closed' ? 'reconnecting' : 'connecting'));

    const channel = supabase
      .channel(`groups:${authUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, (payload) => {
        if (!isCurrent) return;
        handleGroupMembersChangeRef.current(payload as unknown as GroupsRealtimeChangePayload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_join_requests' }, (payload) => {
        if (!isCurrent) return;
        handleGroupJoinRequestChangeRef.current(payload as unknown as GroupsRealtimeChangePayload);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups' }, (payload) => {
        if (!isCurrent) return;
        handleGroupsRowChangeRef.current(payload as unknown as GroupsRealtimeChangePayload);
      })
      .subscribe((status) => {
        if (!isCurrent) return;

        if (status === 'SUBSCRIBED') {
          setGroupsRealtimeStatus('subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setGroupsRealtimeStatus('error');
        } else if (status === 'CLOSED') {
          setGroupsRealtimeStatus((current) => (current === 'error' ? current : 'closed'));
        }
      });

    return () => {
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [authUserId, groupsRealtimeReconnectToken]);

  // --- Foreground refresh: one AppState listener (react-native-web maps this to
  // document.visibilitychange), no polling — mirrors FeedPostsContext/ModerationContext. ---
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = /inactive|background/.test(appStateRef.current) && nextState === 'active';
      appStateRef.current = nextState;

      if (!cameToForeground || !authUserId) {
        return;
      }

      if (groupsRealtimeStatusRef.current !== 'subscribed') {
        setGroupsRealtimeReconnectToken((token) => token + 1);
      }

      if (groupMessagesRealtimeStatusRef.current !== 'subscribed') {
        setGroupMessagesRealtimeReconnectToken((token) => token + 1);
      }

      refreshMyGroups();
      refreshGroupSuggestions();
      refreshMyJoinRequests();

      if (activeGroupIdRef.current) {
        loadGroupMessages(activeGroupIdRef.current);
      }
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  // --- Merged view (local ∪ remote). Suggestions are deliberately never merged in — a
  // non-member must never be able to resolve a full Group for a suggested remote group. ---
  const groups = useMemo(() => [...localGroups, ...remoteGroups], [localGroups, remoteGroups]);

  const getGroupById = (id: string): Group | undefined => groups.find((group) => group.id === id);

  const isMember = (groupId: string) => isLocalMember(groupId) || remoteGroups.some((group) => group.id === groupId);

  // The single, central sort point for "Nachrichten -> Gruppen" — sortGroupsByRecentActivity is
  // applied once here to the merged local+remote list, never re-implemented in the UI layer.
  const getMyGroups = (): Group[] =>
    sortGroupsByRecentActivity([
      ...localGroups.filter((group) => group.memberIds.includes(CURRENT_USER_ID)),
      ...remoteGroups,
    ]);

  const value = useMemo(
    () => ({
      groups,
      getGroupById,
      getMyGroups,
      getRecommendedGroups,
      isMember,
      joinGroup,
      leaveGroup,
      createGroup,
      requestToJoin,
      getJoinRequestStatus,
      getPendingRequestsForGroup,
      getMyPendingJoinRequests,
      acceptJoinRequest,
      rejectJoinRequest,
      remoteGroups,
      groupSuggestions,
      myJoinRequests,
      incomingJoinRequests,
      isRemoteGroupsLoading,
      remoteGroupsError,
      isGroupSuggestionsLoading,
      groupSuggestionsError,
      isGroupActionSubmitting,
      groupActionError,
      refreshMyGroups,
      refreshGroupSuggestions,
      refreshIncomingRequestsForGroup,
      joinPublicGroup,
      requestPrivateGroupJoin,
      cancelJoinRequest,
      updateGroup,
      removeGroupMember,
      promoteGroupMember,
      demoteGroupAdmin,
      transferGroupOwnership,
      groupMembers,
      isGroupMembersLoading,
      groupMembersError,
      refreshGroupMembers,
      fetchGroupDetail,
      groupsRealtimeStatus,
      getLocalGroupMessages,
      sendLocalGroupMessage,
      remoteGroupMessagesByGroupId,
      isGroupMessagesLoading,
      groupMessagesErrorFor,
      hasMoreGroupMessages,
      loadGroupMessages,
      loadOlderGroupMessages,
      sendGroupMessage,
      markGroupRead,
      activeGroupId,
      setActiveGroupId,
      groupMessagesRealtimeStatus,
      retryGroupMessagesRealtime,
    }),
    [
      localGroups,
      joinRequests,
      localGroupMessages,
      remoteGroups,
      groupSuggestions,
      myJoinRequests,
      incomingJoinRequests,
      isRemoteGroupsLoading,
      remoteGroupsError,
      isGroupSuggestionsLoading,
      groupSuggestionsError,
      isGroupActionSubmitting,
      groupActionError,
      groupMembers,
      isGroupMembersLoading,
      groupMembersError,
      groupsRealtimeStatus,
      remoteGroupMessagesByGroupId,
      groupMessagesLoadingByGroupId,
      groupMessagesErrorByGroupId,
      groupMessagesHasMoreByGroupId,
      activeGroupId,
      groupMessagesRealtimeStatus,
    ],
  );

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  const context = useContext(GroupsContext);

  if (!context) {
    throw new Error('useGroups must be used within a GroupsProvider');
  }

  return context;
}
