import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/auth-context';
import { useMessages } from '@/context/messages-context';
import { useNotifications } from '@/context/notifications-context';
import { toNotificationType, toReference } from '@/lib/map-supabase-notification';
import { resolveNotificationRoute } from '@/lib/notification-navigation';
import { mapPushError } from '@/lib/push-errors';
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  configureNotificationHandler,
  getExpoPushToken,
  getLastNotificationResponse,
  getPushPermissionStatus,
  isPushSupported,
  registerCurrentDevicePushToken,
  requestPushPermission,
  unregisterCurrentDevicePushToken,
} from '@/lib/push-notifications';

export type PushStatus = 'unsupported' | 'not_determined' | 'denied' | 'registering' | 'registered' | 'error';

type PendingPushNavigation = {
  notificationId: string;
  type: string;
  referenceType: string | null;
  referenceId: string | null;
};

type PushNotificationsContextValue = {
  pushStatus: PushStatus;
  pushError: string | null;
  isPushSupported: boolean;
  requestAndRegisterPush: () => Promise<void>;
  disablePush: () => Promise<void>;
  retryPushRegistration: () => Promise<void>;
  // Called by account-section.tsx BEFORE supabase.auth.signOut() — see the function itself for why.
  deactivatePushTokenBeforeSignOut: () => Promise<void>;
};

const PushNotificationsContext = createContext<PushNotificationsContextValue | undefined>(undefined);

function extractPendingNavigation(data: Record<string, unknown> | undefined): PendingPushNavigation | null {
  if (!data || typeof data.notificationId !== 'string' || typeof data.type !== 'string') {
    return null;
  }

  return {
    notificationId: data.notificationId,
    type: data.type,
    referenceType: typeof data.referenceType === 'string' ? data.referenceType : null,
    referenceId: typeof data.referenceId === 'string' ? data.referenceId : null,
  };
}

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { markConversationAsRead } = useMessages();
  const { markRemoteNotificationRead } = useNotifications();
  const authUserId = user?.id ?? null;

  const supported = useMemo(() => isPushSupported(), []);

  const [pushStatus, setPushStatus] = useState<PushStatus>(supported ? 'not_determined' : 'unsupported');
  const [pushError, setPushError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const currentTokenRef = useRef<string | null>(null);
  const attemptedForUserRef = useRef<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingPushNavigation | null>(null);

  useEffect(() => {
    if (supported) {
      configureNotificationHandler();
    }
  }, [supported]);

  // Silent, best-effort registration: only proceeds automatically if OS permission was already
  // granted in an earlier session — never triggers the OS permission dialog on its own.
  useEffect(() => {
    if (!supported || !authUserId) {
      return;
    }

    if (attemptedForUserRef.current === authUserId) {
      return;
    }

    let isCurrent = true;
    attemptedForUserRef.current = authUserId;

    (async () => {
      const status = await getPushPermissionStatus();

      if (!isCurrent) return;

      if (status !== 'granted') {
        setPushStatus(status === 'denied' ? 'denied' : 'not_determined');
        return;
      }

      setPushStatus('registering');
      setPushError(null);

      try {
        const token = await getExpoPushToken();
        if (!isCurrent) return;
        currentTokenRef.current = token;
        await registerCurrentDevicePushToken(token);
        if (!isCurrent) return;
        setPushStatus('registered');
      } catch (error) {
        if (!isCurrent) return;
        setPushStatus('error');
        setPushError(mapPushError(error));
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [supported, authUserId, reloadToken]);

  useEffect(() => {
    if (!authUserId) {
      attemptedForUserRef.current = null;
      currentTokenRef.current = null;
      if (supported) {
        setPushStatus('not_determined');
      }
      setPushError(null);
    }
  }, [authUserId, supported]);

  const requestAndRegisterPush = async (): Promise<void> => {
    if (!supported) {
      return;
    }

    setPushStatus('registering');
    setPushError(null);

    try {
      const permission = await requestPushPermission();

      if (permission !== 'granted') {
        setPushStatus('denied');
        return;
      }

      const token = await getExpoPushToken();
      currentTokenRef.current = token;
      await registerCurrentDevicePushToken(token);
      setPushStatus('registered');
    } catch (error) {
      setPushStatus('error');
      setPushError(mapPushError(error));
    }
  };

  const disablePush = async (): Promise<void> => {
    const token = currentTokenRef.current;

    if (!token) {
      return;
    }

    try {
      await unregisterCurrentDevicePushToken(token);
      setPushStatus('not_determined');
      setPushError(null);
    } catch (error) {
      setPushStatus('error');
      setPushError(mapPushError(error));
    }
  };

  // Exposed for account-section.tsx: must be called (and awaited) BEFORE supabase.auth.signOut(),
  // since deactivate_push_token relies on auth.uid() still resolving to the outgoing account.
  // No-op if this device was never registered.
  const deactivatePushTokenBeforeSignOut = async (): Promise<void> => {
    const token = currentTokenRef.current;

    if (!token) {
      return;
    }

    try {
      await unregisterCurrentDevicePushToken(token);
    } catch (error) {
      if (__DEV__) {
        console.error('[push] failed to deactivate token before sign-out', mapPushError(error));
      }
    }
  };

  const retryPushRegistration = async (): Promise<void> => {
    attemptedForUserRef.current = null;
    setReloadToken((token) => token + 1);
  };

  // Exactly one received listener and one response listener, set up once and torn down together.
  // The received listener is intentionally a no-op beyond dev logging: public.notifications (via
  // NotificationsContext's own Realtime subscription) remains the single source of truth for
  // in-app state, so a foreground push arriving here must never itself write a notification row
  // or duplicate what Realtime already delivers — the OS banner is handled by
  // configureNotificationHandler() alone.
  //
  // Tap handling: foreground/background taps arrive via the response listener; a cold start (app
  // launched by tapping a push) is captured once via getLastNotificationResponse(). Both funnel
  // into the same pendingNavigation state, only consumed once auth has fully settled.
  useEffect(() => {
    if (!supported) {
      return;
    }

    let isCurrent = true;

    (async () => {
      const response = await getLastNotificationResponse();
      if (!isCurrent || !response) return;
      const pending = extractPendingNavigation(response.notification.request.content.data as Record<string, unknown> | undefined);
      if (pending) {
        setPendingNavigation(pending);
      }
    })();

    const receivedSubscription = addNotificationReceivedListener((notification) => {
      if (__DEV__) {
        console.log('[push] notification received in foreground', notification.request.identifier);
      }
    });

    const responseSubscription = addNotificationResponseReceivedListener((response) => {
      const pending = extractPendingNavigation(response.notification.request.content.data as Record<string, unknown> | undefined);
      if (pending) {
        setPendingNavigation(pending);
      }
    });

    return () => {
      isCurrent = false;
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [supported]);

  useEffect(() => {
    if (!pendingNavigation || isAuthLoading || !isAuthenticated) {
      return;
    }

    const reference = toReference(pendingNavigation.referenceType, pendingNavigation.referenceId);
    const type = toNotificationType(pendingNavigation.type);
    const route = resolveNotificationRoute({ type, reference });

    if (reference?.type === 'conversation') {
      markConversationAsRead(reference.id);
    }

    if (route) {
      router.push({ pathname: route.pathname, params: route.params });
    }

    void markRemoteNotificationRead(pendingNavigation.notificationId);
    setPendingNavigation(null);
  }, [pendingNavigation, isAuthLoading, isAuthenticated, router, markConversationAsRead, markRemoteNotificationRead]);

  const value = useMemo<PushNotificationsContextValue>(
    () => ({
      pushStatus,
      pushError,
      isPushSupported: supported,
      requestAndRegisterPush,
      disablePush,
      retryPushRegistration,
      deactivatePushTokenBeforeSignOut,
    }),
    [pushStatus, pushError, supported],
  );

  return <PushNotificationsContext.Provider value={value}>{children}</PushNotificationsContext.Provider>;
}

export function usePushNotifications() {
  const context = useContext(PushNotificationsContext);

  if (!context) {
    throw new Error('usePushNotifications must be used within a PushNotificationsProvider');
  }

  return context;
}
