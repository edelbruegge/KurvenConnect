import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { useReports } from '@/context/reports-context';
import { seedBlockedUsers, type BlockedUser } from '@/data/blocks';
import { mapBlockError } from '@/lib/block-errors';
import { mapSupabaseUserBlockToBlock, type SupabaseUserBlockRow } from '@/lib/map-supabase-block';
import { supabase } from '@/lib/supabase';

type BlocksContextValue = {
  blockedUsers: BlockedUser[];
  isBlocked: (userId: string) => boolean;
  isUserHidden: (userId: string) => boolean;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;

  // Supabase-backed blocks for the signed-in account.
  remoteBlocks: BlockedUser[];
  isRemoteBlocksLoading: boolean;
  remoteBlocksError: string | null;
  refreshRemoteBlocks: () => void;
  blockRemoteUser: (userId: string) => Promise<{ error: string | null }>;
  unblockRemoteUser: (userId: string) => Promise<{ error: string | null }>;
  isUserBlocked: (userId: string) => boolean;
  // Client-side gate for contact actions (message/trip-request/meetup-join). Reflects only "I
  // blocked them" — the reverse direction ("they blocked me") is never client-visible, and is
  // instead enforced server-side, surfacing as a neutral error message on the attempted action.
  isInteractionBlocked: (userId: string) => boolean;
};

const BlocksContext = createContext<BlocksContextValue | undefined>(undefined);

const USER_BLOCKS_SELECT_COLUMNS = 'blocker_id, blocked_id, created_at';

export function BlocksProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { hasReported } = useReports();

  const [localBlockedUsers, setLocalBlockedUsers] = useState<BlockedUser[]>(seedBlockedUsers);

  const [remoteBlocks, setRemoteBlocks] = useState<BlockedUser[]>([]);
  const [isRemoteBlocksLoading, setIsRemoteBlocksLoading] = useState(false);
  const [remoteBlocksError, setRemoteBlocksError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const inFlightUserIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never keep showing stale remote blocks.
      setRemoteBlocks([]);
      setIsRemoteBlocksLoading(false);
      setRemoteBlocksError(null);
      inFlightUserIds.current.clear();
      return;
    }

    let isCurrent = true;
    setIsRemoteBlocksLoading(true);
    setRemoteBlocksError(null);

    supabase
      .from('user_blocks')
      .select(USER_BLOCKS_SELECT_COLUMNS)
      .eq('blocker_id', authUserId)
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setRemoteBlocksError(mapBlockError(error, 'block'));
          setRemoteBlocks([]);
          setIsRemoteBlocksLoading(false);
          return;
        }

        const mapped = ((data ?? []) as SupabaseUserBlockRow[]).map(mapSupabaseUserBlockToBlock);
        setRemoteBlocks(mapped);
        setIsRemoteBlocksLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  const refreshRemoteBlocks = () => {
    setReloadToken((token) => token + 1);
  };

  const blockedUsers = useMemo(() => {
    const seenIds = new Set<string>();
    const merged: BlockedUser[] = [];

    for (const entry of [...remoteBlocks, ...localBlockedUsers]) {
      if (seenIds.has(entry.userId)) continue;
      seenIds.add(entry.userId);
      merged.push(entry);
    }

    return merged;
  }, [remoteBlocks, localBlockedUsers]);

  const isUserBlocked = (userId: string) => blockedUsers.some((entry) => entry.userId === userId);
  // Kept as the original name so every existing call site (useSafetySelectors, blocked-users.tsx,
  // profile-view.tsx, messages/[id].tsx) keeps working unchanged.
  const isBlocked = isUserBlocked;
  // Same underlying data as isUserBlocked today — see the type's doc comment for why the reverse
  // direction can never be folded in here.
  const isInteractionBlocked = isUserBlocked;

  const isUserHidden = (userId: string) => isUserBlocked(userId) || hasReported('user', userId);

  const blockRemoteUser = async (userId: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: mapBlockError(new Error('not authenticated'), 'block') };
    }

    if (isUserBlocked(userId) || inFlightUserIds.current.has(userId)) {
      return { error: null };
    }

    inFlightUserIds.current.add(userId);

    try {
      const { error } = await supabase.from('user_blocks').insert({ blocker_id: authUserId, blocked_id: userId });

      if (error) {
        return { error: mapBlockError(error, 'block') };
      }

      setRemoteBlocks((current) => {
        if (current.some((entry) => entry.userId === userId)) {
          return current;
        }

        return [...current, { userId, blockedAt: 'gerade eben', source: 'supabase', createdAtIso: new Date().toISOString() }];
      });

      return { error: null };
    } finally {
      inFlightUserIds.current.delete(userId);
    }
  };

  const unblockRemoteUser = async (userId: string): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: mapBlockError(new Error('not authenticated'), 'unblock') };
    }

    if (inFlightUserIds.current.has(userId)) {
      return { error: null };
    }

    inFlightUserIds.current.add(userId);

    const previousRemoteBlocks = remoteBlocks;
    setRemoteBlocks((current) => current.filter((entry) => entry.userId !== userId));

    try {
      const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', authUserId).eq('blocked_id', userId);

      if (error) {
        setRemoteBlocks(previousRemoteBlocks);
        return { error: mapBlockError(error, 'unblock') };
      }

      return { error: null };
    } finally {
      inFlightUserIds.current.delete(userId);
    }
  };

  const blockUser = (userId: string) => {
    setLocalBlockedUsers((current) => {
      if (current.some((entry) => entry.userId === userId)) {
        return current;
      }

      return [...current, { userId, blockedAt: 'gerade eben', source: 'local' }];
    });
  };

  const unblockUser = (userId: string) => {
    setLocalBlockedUsers((current) => current.filter((entry) => entry.userId !== userId));
  };

  const value = useMemo(
    () => ({
      blockedUsers,
      isBlocked,
      isUserHidden,
      blockUser,
      unblockUser,
      remoteBlocks,
      isRemoteBlocksLoading,
      remoteBlocksError,
      refreshRemoteBlocks,
      blockRemoteUser,
      unblockRemoteUser,
      isUserBlocked,
      isInteractionBlocked,
    }),
    [blockedUsers, remoteBlocks, isRemoteBlocksLoading, remoteBlocksError, hasReported, authUserId],
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
