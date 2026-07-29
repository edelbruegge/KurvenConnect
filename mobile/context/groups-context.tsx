import React, { createContext, useContext, useMemo, useState } from 'react';

import {
  seedGroupJoinRequests,
  seedGroups,
  type Group,
  type GroupJoinRequest,
  type GroupJoinRequestStatus,
  type GroupVisibility,
} from '@/data/groups';
import { CURRENT_USER_ID } from '@/data/users';

type CreateGroupInput = {
  name: string;
  description: string;
  visibility: GroupVisibility;
  city?: string;
};

type GroupsContextValue = {
  groups: Group[];
  getGroupById: (id: string) => Group | undefined;
  getMyGroups: () => Group[];
  getRecommendedGroups: () => Group[];
  isMember: (groupId: string) => boolean;
  joinGroup: (groupId: string) => void;
  leaveGroup: (groupId: string) => void;
  createGroup: (input: CreateGroupInput) => string;
  requestToJoin: (groupId: string) => void;
  getJoinRequestStatus: (groupId: string) => GroupJoinRequestStatus | null;
  getPendingRequestsForGroup: (groupId: string) => GroupJoinRequest[];
  getMyPendingJoinRequests: () => Group[];
  acceptJoinRequest: (requestId: string) => void;
  rejectJoinRequest: (requestId: string) => void;
};

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

export function GroupsProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<Group[]>(seedGroups);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>(seedGroupJoinRequests);

  const getGroupById = (id: string) => groups.find((group) => group.id === id);

  const isMember = (groupId: string) => {
    const group = getGroupById(groupId);
    return group ? group.memberIds.includes(CURRENT_USER_ID) : false;
  };

  const getMyGroups = () => groups.filter((group) => group.memberIds.includes(CURRENT_USER_ID));

  const getRecommendedGroups = () =>
    groups.filter((group) => group.ownerId !== CURRENT_USER_ID && !group.memberIds.includes(CURRENT_USER_ID));

  const joinGroup = (groupId: string) => {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId && !group.memberIds.includes(CURRENT_USER_ID)
          ? { ...group, memberIds: [...group.memberIds, CURRENT_USER_ID] }
          : group,
      ),
    );
  };

  const leaveGroup = (groupId: string) => {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId && group.ownerId !== CURRENT_USER_ID
          ? { ...group, memberIds: group.memberIds.filter((id) => id !== CURRENT_USER_ID) }
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

    setGroups((current) => [newGroup, ...current]);

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
      .map((entry) => getGroupById(entry.groupId))
      .filter((group): group is Group => group !== undefined);

  const acceptJoinRequest = (requestId: string) => {
    const request = joinRequests.find((entry) => entry.id === requestId);

    if (!request) {
      return;
    }

    setJoinRequests((current) =>
      current.map((entry) => (entry.id === requestId ? { ...entry, status: 'accepted' } : entry)),
    );

    setGroups((current) =>
      current.map((group) =>
        group.id === request.groupId && !group.memberIds.includes(request.userId)
          ? { ...group, memberIds: [...group.memberIds, request.userId] }
          : group,
      ),
    );
  };

  const rejectJoinRequest = (requestId: string) => {
    setJoinRequests((current) =>
      current.map((entry) => (entry.id === requestId ? { ...entry, status: 'rejected' } : entry)),
    );
  };

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
    }),
    [groups, joinRequests],
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
