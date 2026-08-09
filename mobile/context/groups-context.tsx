import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import {
  getGroupMemberCount,
  seedGroupJoinRequests,
  seedGroups,
  type Group,
  type GroupJoinRequest,
  type GroupJoinRequestRecord,
  type GroupJoinRequestStatus,
  type GroupSuggestion,
  type GroupVisibility,
} from '@/data/groups';
import { CURRENT_USER_ID } from '@/data/users';
import { mapGroupError } from '@/lib/group-errors';
import {
  mapSupabaseGroupJoinRequestRow,
  mapSupabaseGroupMembershipRow,
  mapSupabaseGroupSuggestionRow,
  type SupabaseGroupJoinRequestRow,
  type SupabaseGroupMembershipRow,
  type SupabaseGroupSuggestionRow,
} from '@/lib/map-supabase-group';
import { supabase } from '@/lib/supabase';

type CreateGroupInput = {
  name: string;
  description: string;
  visibility: GroupVisibility;
  city?: string;
};

type ActionResult = { error: string | null };

type GroupsContextValue = {
  groups: Group[];
  getGroupById: (id: string) => Group | undefined;
  getMyGroups: () => Group[];
  getRecommendedGroups: () => Group[];
  isMember: (groupId: string) => boolean;
  joinGroup: (groupId: string) => void;
  leaveGroup: (groupId: string) => Promise<ActionResult>;
  createGroup: (input: CreateGroupInput) => string;
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
};

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

export function GroupsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  // --- Local, in-memory seed groups — unchanged. ---
  const [localGroups, setLocalGroups] = useState<Group[]>(seedGroups);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>(seedGroupJoinRequests);

  const getLocalGroupById = (id: string) => localGroups.find((group) => group.id === id);

  const isLocalMember = (groupId: string) => {
    const group = getLocalGroupById(groupId);
    return group ? group.memberIds.includes(CURRENT_USER_ID) : false;
  };

  const getRecommendedGroups = () =>
    localGroups.filter((group) => group.ownerId !== CURRENT_USER_ID && !group.memberIds.includes(CURRENT_USER_ID));

  const joinGroup = (groupId: string) => {
    setLocalGroups((current) =>
      current.map((group) =>
        group.id === groupId && !group.memberIds.includes(CURRENT_USER_ID)
          ? { ...group, memberIds: [...group.memberIds, CURRENT_USER_ID] }
          : group,
      ),
    );
  };

  const createGroup = (input: CreateGroupInput): string => {
    const newGroup: Group = {
      id: `group-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name.trim(),
      description: input.description.trim(),
      clubName: 'Arminia Bielefeld',
      city: input.city?.trim() || undefined,
      ownerId: CURRENT_USER_ID,
      memberIds: [CURRENT_USER_ID],
      createdAt: 'gerade eben',
      visibility: input.visibility,
    };

    setLocalGroups((current) => [newGroup, ...current]);

    return newGroup.id;
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

  // --- Group suggestions (get_group_suggestions). ---
  const [groupSuggestions, setGroupSuggestions] = useState<GroupSuggestion[]>([]);
  const [isGroupSuggestionsLoading, setIsGroupSuggestionsLoading] = useState(false);
  const [groupSuggestionsError, setGroupSuggestionsError] = useState<string | null>(null);
  const [groupSuggestionsReloadToken, setGroupSuggestionsReloadToken] = useState(0);

  useEffect(() => {
    if (!authUserId) {
      setGroupSuggestions([]);
      setIsGroupSuggestionsLoading(false);
      setGroupSuggestionsError(null);
      return;
    }

    let isCurrent = true;
    setIsGroupSuggestionsLoading(true);
    setGroupSuggestionsError(null);

    supabase
      .rpc('get_group_suggestions', { p_limit: 5 })
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
  }, [authUserId, remoteGroups, groupSuggestionsReloadToken]);

  const refreshGroupSuggestions = () => {
    setGroupSuggestionsReloadToken((token) => token + 1);
  };

  // --- My own pending join requests. ---
  const [myJoinRequests, setMyJoinRequests] = useState<GroupJoinRequestRecord[]>([]);

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
  }, [authUserId]);

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

  // --- Reset everything remote on logout/account switch. ---
  useEffect(() => {
    if (!authUserId) {
      setIncomingJoinRequests({});
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

  // --- Merged view (local ∪ remote). Suggestions are deliberately never merged in — a
  // non-member must never be able to resolve a full Group for a suggested remote group. ---
  const groups = useMemo(() => [...localGroups, ...remoteGroups], [localGroups, remoteGroups]);

  const getGroupById = (id: string): Group | undefined => groups.find((group) => group.id === id);

  const isMember = (groupId: string) => isLocalMember(groupId) || remoteGroups.some((group) => group.id === groupId);

  const getMyGroups = (): Group[] => [...localGroups.filter((group) => group.memberIds.includes(CURRENT_USER_ID)), ...remoteGroups];

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
    }),
    [
      localGroups,
      joinRequests,
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
