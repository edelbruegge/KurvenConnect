import React, { createContext, useContext, useMemo, useState } from 'react';

import { seedNotifications, type AppNotification } from '@/data/notifications';
import { CURRENT_USER_ID } from '@/data/users';

type NotificationsContextValue = {
  notifications: AppNotification[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  getUnreadCount: () => number;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(
    seedNotifications.filter((notification) => notification.recipientId === CURRENT_USER_ID),
  );

  const markAsRead = (id: string) => {
    setNotifications((current) =>
      current.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)),
    );
  };

  const markAllAsRead = () => {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  };

  const getUnreadCount = () => notifications.filter((notification) => !notification.read).length;

  const value = useMemo(
    () => ({
      notifications,
      markAsRead,
      markAllAsRead,
      getUnreadCount,
    }),
    [notifications],
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
