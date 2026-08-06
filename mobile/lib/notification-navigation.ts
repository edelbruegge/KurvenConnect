import type { NotificationReference, NotificationType } from '@/data/notifications';

type NotificationRoutePathname = '/messages/[id]' | '/profile/[id]' | '/meetup/[id]' | '/trip/[id]/requests' | '/post/[id]';

export type NotificationRoute = { pathname: NotificationRoutePathname; params: { id: string } };

/**
 * The single, central place that turns a notification's type/reference into an in-app route.
 * Used by both the in-app notifications list (app/notifications.tsx) and a tapped push
 * notification (context/push-notifications-context.tsx) — neither duplicates this mapping.
 */
export function resolveNotificationRoute(input: { type: NotificationType; reference: NotificationReference }): NotificationRoute | null {
  const reference = input.reference;

  if (!reference) {
    return null;
  }

  if (reference.type === 'conversation') {
    return { pathname: '/messages/[id]', params: { id: reference.id } };
  }

  if (reference.type === 'profile') {
    return { pathname: '/profile/[id]', params: { id: reference.id } };
  }

  if (reference.type === 'meetup') {
    return { pathname: '/meetup/[id]', params: { id: reference.id } };
  }

  // A trip's owner is directed to their request management screen rather than the generic trip
  // detail — trip_request_accepted/rejected (the requester's perspective) fall through to the
  // generic /post/[id] branch below instead, since they have no access to that screen.
  if (reference.type === 'trip' && input.type === 'trip_request_received') {
    return { pathname: '/trip/[id]/requests', params: { id: reference.id } };
  }

  return { pathname: '/post/[id]', params: { id: reference.id } };
}
