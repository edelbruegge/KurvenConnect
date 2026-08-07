import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { mapSupabaseUserWarningRow, type SupabaseUserWarningRow, type UserWarning } from '@/lib/map-supabase-user-warning';
import { mapModerationActionError } from '@/lib/moderation-action-errors';
import { supabase } from '@/lib/supabase';

type UserWarningsContextValue = {
  userWarnings: UserWarning[];
  unacknowledgedWarningCount: number;
  isUserWarningsLoading: boolean;
  userWarningsError: string | null;
  refreshUserWarnings: () => void;
  acknowledgeWarning: (id: string) => Promise<{ error: string | null }>;
};

const UserWarningsContext = createContext<UserWarningsContextValue | undefined>(undefined);

const USER_WARNINGS_SELECT_COLUMNS = 'id, user_id, report_id, moderator_id, warning_type, title, message, internal_note, created_at, acknowledged_at';

// A minimal structural view of the postgres_changes payload — only the fields the handler below
// actually reads, same approach as NotificationsContext's RealtimeNotificationInsertPayload.
type RealtimeWarningChangePayload = {
  new: Record<string, unknown>;
};

export function UserWarningsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [userWarnings, setUserWarnings] = useState<UserWarning[]>([]);
  const [isUserWarningsLoading, setIsUserWarningsLoading] = useState(false);
  const [userWarningsError, setUserWarningsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const inFlightAcknowledgeIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never let warnings from the previous account
      // leak into the next one, and never keep a stale loading/error state around.
      setUserWarnings([]);
      setIsUserWarningsLoading(false);
      setUserWarningsError(null);
      inFlightAcknowledgeIds.current.clear();
      return;
    }

    let isCurrent = true;
    setIsUserWarningsLoading(true);
    setUserWarningsError(null);

    supabase
      .from('user_warnings')
      .select(USER_WARNINGS_SELECT_COLUMNS)
      .eq('user_id', authUserId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setUserWarningsError(mapModerationActionError(error, 'load'));
          setUserWarnings([]);
          setIsUserWarningsLoading(false);
          return;
        }

        const mapped = ((data ?? []) as SupabaseUserWarningRow[]).map(mapSupabaseUserWarningRow);
        setUserWarnings(mapped);
        setIsUserWarningsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  const refreshUserWarnings = () => {
    setReloadToken((token) => token + 1);
  };

  const unacknowledgedWarningCount = useMemo(() => userWarnings.filter((warning) => !warning.isAcknowledged).length, [userWarnings]);

  const upsertWarning = (warning: UserWarning) => {
    setUserWarnings((current) => {
      if (current.some((entry) => entry.id === warning.id)) {
        return current.map((entry) => (entry.id === warning.id ? warning : entry));
      }

      return [warning, ...current];
    });
  };

  const acknowledgeWarning = async (id: string): Promise<{ error: string | null }> => {
    if (inFlightAcknowledgeIds.current.has(id)) {
      return { error: null };
    }

    inFlightAcknowledgeIds.current.add(id);

    try {
      const { data, error } = await supabase.rpc('acknowledge_user_warning', { p_warning_id: id });

      if (error) {
        return { error: mapModerationActionError(error, 'acknowledge') };
      }

      upsertWarning(mapSupabaseUserWarningRow(data as SupabaseUserWarningRow));

      return { error: null };
    } finally {
      inFlightAcknowledgeIds.current.delete(id);
    }
  };

  // --- Realtime: this account's own warnings only. The server-side filter (user_id=eq.authUserId)
  // means a normal user's client never even receives an event for someone else's warning, on top
  // of the RLS policy that would already block reading it directly. ---
  const handleRealtimeWarningChange = (payload: RealtimeWarningChangePayload) => {
    if (!authUserId) {
      return;
    }

    const row = payload.new;
    const isValidRow =
      row &&
      typeof row.id === 'string' &&
      typeof row.user_id === 'string' &&
      typeof row.title === 'string' &&
      typeof row.message === 'string' &&
      typeof row.created_at === 'string';

    if (!isValidRow || row.user_id !== authUserId) {
      return;
    }

    upsertWarning(mapSupabaseUserWarningRow(row as unknown as SupabaseUserWarningRow));
  };

  const handleRealtimeWarningChangeRef = useRef(handleRealtimeWarningChange);
  handleRealtimeWarningChangeRef.current = handleRealtimeWarningChange;

  useEffect(() => {
    if (!authUserId) {
      return;
    }

    let isCurrent = true;

    const channel = supabase
      .channel(`user-warnings:${authUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_warnings', filter: `user_id=eq.${authUserId}` },
        (payload) => {
          if (!isCurrent) return;
          handleRealtimeWarningChangeRef.current(payload as unknown as RealtimeWarningChangePayload);
        },
      )
      .subscribe();

    return () => {
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [authUserId]);

  // --- Web/native foreground refresh: one AppState listener (react-native-web maps this to
  // document.visibilitychange), no polling. ---
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = /inactive|background/.test(appStateRef.current) && nextState === 'active';
      appStateRef.current = nextState;

      if (!cameToForeground || !authUserId) {
        return;
      }

      refreshUserWarnings();
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  const value = useMemo(
    () => ({
      userWarnings,
      unacknowledgedWarningCount,
      isUserWarningsLoading,
      userWarningsError,
      refreshUserWarnings,
      acknowledgeWarning,
    }),
    [userWarnings, unacknowledgedWarningCount, isUserWarningsLoading, userWarningsError],
  );

  return <UserWarningsContext.Provider value={value}>{children}</UserWarningsContext.Provider>;
}

export function useUserWarnings() {
  const context = useContext(UserWarningsContext);

  if (!context) {
    throw new Error('useUserWarnings must be used within a UserWarningsProvider');
  }

  return context;
}
