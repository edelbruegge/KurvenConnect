import React, { createContext, useContext, useMemo, useState } from 'react';

import { seedBlockedUsers, type BlockedUser } from '@/data/blocks';
import { useReports } from '@/context/reports-context';

type BlocksContextValue = {
  blockedUsers: BlockedUser[];
  isBlocked: (userId: string) => boolean;
  isUserHidden: (userId: string) => boolean;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
};

const BlocksContext = createContext<BlocksContextValue | undefined>(undefined);

export function BlocksProvider({ children }: { children: React.ReactNode }) {
  const { hasReported } = useReports();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>(seedBlockedUsers);

  const isBlocked = (userId: string) => blockedUsers.some((entry) => entry.userId === userId);

  const isUserHidden = (userId: string) => isBlocked(userId) || hasReported('user', userId);

  const blockUser = (userId: string) => {
    setBlockedUsers((current) => {
      if (current.some((entry) => entry.userId === userId)) {
        return current;
      }

      return [...current, { userId, blockedAt: 'gerade eben' }];
    });
  };

  const unblockUser = (userId: string) => {
    setBlockedUsers((current) => current.filter((entry) => entry.userId !== userId));
  };

  const value = useMemo(
    () => ({
      blockedUsers,
      isBlocked,
      isUserHidden,
      blockUser,
      unblockUser,
    }),
    [blockedUsers, hasReported],
  );

  return <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>;
}

export function useBlocks() {
  const context = useContext(BlocksContext);

  if (!context) {
    throw new Error('useBlocks must be used within a BlocksProvider');
  }

  return context;
}
