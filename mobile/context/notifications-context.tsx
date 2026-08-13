import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { seedNotifications, type AppNotification } from '@/data/notifications';
import { CURRENT_USER_ID } from '@/data/users';
import { getInitialsFromName } from '@/lib/map-supabase-profile';
import { mapSupabaseNotificationToNotification, type SupabaseNotificationRow } from '@/lib/map-supabase-notification';
import { mapNotificationError, mapNotificationRealtimeError } from '@/lib/notification-errors';
import { supabase } from '@/lib/supabase';

type AuthorDisplay = { displayName: string; initials: string; avatarUrl?: string };

// A minimal structural view of the postgres_changes INSERT payload — only the fields this
// handler actually reads. Avoids importing @supabase/realtime-js's payload types directly (a
// transitive dependency of @supabase/supabase-js, not declared in package.json); the real
// payload supabase-js hands us is always assignable to this shape.
type RealtimeNotificationInsertPayload = {
  new: Record<string, unknown>;
};

type RealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'reconnecting' | 'error' | 'closed';

type NotificationsContextValue = {
  notifications: AppNotification[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  getUnreadCount: () => number;

  // Supabase-backed server notifications.
  remoteNotifications: AppNotification[];
  isRemoteNotificationsLoading: boolean;
  remoteNotificationsError: string | null;
  refreshRemoteNotifications: () => void;
  markRemoteNotificationRead: (id: string) => Promise<void>;
  markAllRemoteNotificationsRead: () => Promise<void>;
  getRemoteActorDisplay: (userId: string) => AuthorDisplay;
  unreadNotificationCount: number;

  // Realtime synchronization for newly inserted notifications.
  notificationRealtimeStatus: RealtimeStatus;
  notificationRealtimeError: string | null;
  retryNotificationRealtime: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const NOTIFICATIONS_SELECT_COLUMNS =
  'id, recipient_id, actor_id, type, title, body, reference_type, reference_id, event_key, read_at, created_at';
const REMOTE_NOTIFICATIONS_LIMIT = 100;

const UNKNOWN_ACTOR_DISPLAY: AuthorDisplay = { displayName: 'Unbekanntes Mitglied', initials: '?' };

function getNotificationTimeMs(notification: AppNotification): number {
  return notification.createdAtIso ? new Date(notification.createdAtIso).getTime() : 0;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>(
    seedNotifications.filter((notification) => notification.recipientId === CURRENT_USER_ID),
  );

  const [remoteNotifications, setRemoteNotifications] = useState<AppNotification[]>([]);
  const [remoteActorProfiles, setRemoteActorProfiles] = useState<Record<string, AuthorDisplay>>({});
  const [isRemoteNotificationsLoading, setIsRemoteNotificationsLoading] = useState(false);
  const [remoteNotificationsError, setRemoteNotificationsError] = useState<string | null>(null);
  const [notificationsReloadToken, setNotificationsReloadToken] = useState(0);

  const inFlightMarkReadIds = useRef<Set<string>>(new Set());
  const isMarkingAllRef = useRef(false);

  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [realtimeReconnectToken, setRealtimeReconnectToken] = useState(0);
  const realtimeStatusRef = useRef<RealtimeStatus>('idle');

  useEffect(() => {
    realtimeStatusRef.current = realtimeStatus;
  }, [realtimeStatus]);

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never keep showing stale remote content.
      setRemoteNotifications([]);
      setRemoteActorProfiles({});
      setIsRemoteNotificationsLoading(false);
      setRemoteNotificationsError(null);
      inFlightMarkReadIds.current.clear();
      isMarkingAllRef.current = false;
      return;
    }

    let isCurrent = true;
    setIsRemoteNotificationsLoading(true);
    setRemoteNotificationsError(null);

    (async () => {
      const { data: rows, error } = await supabase
        .from('notifications')
        .select(NOTIFICATIONS_SELECT_COLUMNS)
        .eq('recipient_id', authUserId)
        .order('created_at', { ascending: false })
        .limit(REMOTE_NOTIFICATIONS_LIMIT);

      if (!isCurrent) return;

      if (error) {
        setRemoteNotificationsError(mapNotificationError(error));
        setRemoteNotifications([]);
        setIsRemoteNotificationsLoading(false);
        return;
      }

      const notificationRows = (rows ?? []) as SupabaseNotificationRow[];
      const mapped = notificationRows.map(mapSupabaseNotificationToNotification);

      const actorIds = Array.from(new Set(notificationRows.map((row) => row.actor_id).filter((id): id is string => id !== null)));

      const { data: profileRows, error: profilesError } =
        actorIds.length > 0
          ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', actorIds)
          : { data: [], error: null };

      if (!isCurrent) return;

      if (profilesError) {
        setRemoteNotificationsError(mapNotificationError(profilesError));
        setRemoteNotifications([]);
        setIsRemoteNotificationsLoading(false);
        return;
      }

      const actorDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null; avatar_url: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        actorDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName), avatarUrl: row.avatar_url ?? undefined };
      });

      setRemoteActorProfiles((current) => ({ ...current, ...actorDisplayById }));
      setRemoteNotifications(mapped);
      setIsRemoteNotificationsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, notificationsReloadToken]);

  const refreshRemoteNotifications = () => {
    setNotificationsReloadToken((token) => token + 1);
  };

  const getRemoteActorDisplay = (userId: string): AuthorDisplay => remoteActorProfiles[userId] ?? UNKNOWN_ACTOR_DISPLAY;

  const markRemoteNotificationRead = async (id: string): Promise<void> => {
    if (!authUserId || inFlightMarkReadIds.current.has(id)) {
      return;
    }

    inFlightMarkReadIds.current.add(id);

    setRemoteNotifications((current) =>
      current.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)),
    );

    try {
      const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: id });

      if (error && __DEV__) {
        console.error('[notifications]', mapNotificationError(error));
      }
    } finally {
      inFlightMarkReadIds.current.delete(id);
    }
  };

  const markAllRemoteNotificationsRead = async (): Promise<void> => {
    if (!authUserId || isMarkingAllRef.current) {
      return;
    }

    isMarkingAllRef.current = true;

    setRemoteNotifications((current) => current.map((notification) => ({ ...notification, read: true })));

    try {
      const { error } = await supabase.rpc('mark_all_notifications_read');

      if (error && __DEV__) {
        console.error('[notifications]', mapNotificationError(error));
      }
    } finally {
      isMarkingAllRef.current = false;
    }
  };

  // Central handler for every realtime INSERT event on public.notifications for this account.
  // The server-side filter (recipient_id=eq.authUserId) already scopes delivery, but the
  // recipient_id check below is kept as a defensive second layer.
  const handleRealtimeNotificationInsert = (payload: RealtimeNotificationInsertPayload) => {
    if (!authUserId) {
      return;
    }

    const row = payload.new;
    const isValidRow =
      row &&
      typeof row.id === 'string' &&
      typeof row.recipient_id === 'string' &&
      typeof row.type === 'string' &&
      typeof row.title === 'string' &&
      typeof row.body === 'string' &&
      typeof row.created_at === 'string';

    if (!isValidRow) {
      if (__DEV__) {
        console.error('[notifications:realtime] invalid INSERT payload', payload);
      }
      return;
    }

    if (row.recipient_id !== authUserId) {
      return;
    }

    const notification = mapSupabaseNotificationToNotification(row as unknown as SupabaseNotificationRow);

    setRemoteNotifications((current) => {
      if (current.some((entry) => entry.id === notification.id)) {
        // Duplicate of a notification this client already knows about — no second row, no
        // double unread count.
        return current;
      }

      return [notification, ...current];
    });
  };

  const handleRealtimeNotificationInsertRef = useRef(handleRealtimeNotificationInsert);
  handleRealtimeNotificationInsertRef.current = handleRealtimeNotificationInsert;

  useEffect(() => {
    if (!authUserId) {
      setRealtimeStatus('idle');
      setRealtimeError(null);
      return;
    }

    let isCurrent = true;
    setRealtimeStatus((current) => (current === 'error' || current === 'closed' ? 'reconnecting' : 'connecting'));
    setRealtimeError(null);

    const channel = supabase
      .channel(`notifications:${authUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${authUserId}` },
        (payload) => {
          if (!isCurrent) return;
          handleRealtimeNotificationInsertRef.current(payload);
        },
      )
      .subscribe((status, err) => {
        if (!isCurrent) return;

        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('subscribed');
          setRealtimeError(null);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('error');
          setRealtimeError(mapNotificationRealtimeError(err ?? new Error(status)));
        } else if (status === 'CLOSED') {
          setRealtimeStatus((current) => (current === 'error' ? current : 'closed'));
        }
      });

    return () => {
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [authUserId, realtimeReconnectToken]);

  const retryNotificationRealtime = () => {
    if (!authUserId) {
      return;
    }

    setRealtimeStatus('reconnecting');
    setRealtimeError(null);
    setRealtimeReconnectToken((token) => token + 1);
  };

  // Single, provider-level AppState listener (NotificationsProvider is mounted exactly once at
  // the app root, so this is the only such listener that ever exists for notifications).
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = /inactive|background/.test(appStateRef.current) && nextState === 'active';
      appStateRef.current = nextState;

      if (!cameToForeground || !authUserId) {
        return;
      }

      if (realtimeStatusRef.current !== 'subscribed') {
        retryNotificationRealtime();
      }

      refreshRemoteNotifications();
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  const notifications = useMemo(() => {
    const remoteSorted = [...remoteNotifications].sort((a, b) => getNotificationTimeMs(b) - getNotificationTimeMs(a));
    const seenIds = new Set<string>();
    const merged: AppNotification[] = [];

    for (const notification of [...remoteSorted, ...localNotifications]) {
      if (seenIds.has(notification.id)) continue;
      seenIds.add(notification.id);
      merged.push(notification);
    }

    return merged;
  }, [remoteNotifications, localNotifications]);

  const unreadNotificationCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);

  const markAsRead = (id: string) => {
    if (remoteNotifications.some((notification) => notification.id === id)) {
      void markRemoteNotificationRead(id);
      return;
    }

    setLocalNotifications((current) =>
      current.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)),
    );
  };

  const markAllAsRead = () => {
    setLocalNotifications((current) => current.map((notification) => ({ ...notification, read: true })));

    if (remoteNotifications.length > 0) {
      void markAllRemoteNotificationsRead();
    }
  };

  const getUnreadCount = () => unreadNotificationCount;

  const value = useMemo(
    () => ({
      notifications,
      markAsRead,
      markAllAsRead,
      getUnreadCount,
      remoteNotifications,
      isRemoteNotificationsLoading,
      remoteNotificationsError,
      refreshRemoteNotifications,
      markRemoteNotificationRead,
      markAllRemoteNotificationsRead,
      getRemoteActorDisplay,
      unreadNotificationCount,
      notificationRealtimeStatus: realtimeStatus,
      notificationRealtimeError: realtimeError,
      retryNotificationRealtime,
    }),
    [
      notifications,
      remoteNotifications,
      isRemoteNotificationsLoading,
      remoteNotificationsError,
      remoteActorProfiles,
      unreadNotificationCount,
      realtimeStatus,
      realtimeError,
      authUserId,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }

  return context;
}
