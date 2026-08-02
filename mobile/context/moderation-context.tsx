import React, { createContext, useContext, useMemo, useState } from 'react';

import type { ReportTargetType } from '@/data/reports';

type ModerationContextValue = {
  isContentModerationHidden: (targetType: ReportTargetType, targetId: string) => boolean;
  hideContentByModeration: (targetType: ReportTargetType, targetId: string) => void;
  restoreContentModeration: (targetType: ReportTargetType, targetId: string) => void;
  isUserSuspended: (userId: string) => boolean;
  suspendUser: (userId: string) => void;
  restoreUser: (userId: string) => void;
};

const ModerationContext = createContext<ModerationContextValue | undefined>(undefined);

const contentKey = (targetType: ReportTargetType, targetId: string) => `${targetType}:${targetId}`;

export function ModerationProvider({ children }: { children: React.ReactNode }) {
  const [hiddenContentKeys, setHiddenContentKeys] = useState<string[]>([]);
  const [suspendedUserIds, setSuspendedUserIds] = useState<string[]>([]);

  const isContentModerationHidden = (targetType: ReportTargetType, targetId: string) =>
    hiddenContentKeys.includes(contentKey(targetType, targetId));

  const hideContentByModeration = (targetType: ReportTargetType, targetId: string) => {
    const key = contentKey(targetType, targetId);
    setHiddenContentKeys((current) => (current.includes(key) ? current : [...current, key]));
  };

  const restoreContentModeration = (targetType: ReportTargetType, targetId: string) => {
    const key = contentKey(targetType, targetId);
    setHiddenContentKeys((current) => current.filter((entry) => entry !== key));
  };

  const isUserSuspended = (userId: string) => suspendedUserIds.includes(userId);

  const suspendUser = (userId: string) => {
    setSuspendedUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
  };

  const restoreUser = (userId: string) => {
    setSuspendedUserIds((current) => current.filter((id) => id !== userId));
  };

  const value = useMemo(
    () => ({
      isContentModerationHidden,
      hideContentByModeration,
      restoreContentModeration,
      isUserSuspended,
      suspendUser,
      restoreUser,
    }),
    [hiddenContentKeys, suspendedUserIds],
  );

  return <ModerationContext.Provider value={value}>{children}</ModerationContext.Provider>;
}

export function useModeration() {
  const context = useContext(ModerationContext);

  if (!context) {
    throw new Error('useModeration must be used within a ModerationProvider');
  }

  return context;
}
