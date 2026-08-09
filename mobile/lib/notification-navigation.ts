import type { NotificationReference, NotificationType } from '@/data/notifications';

type NotificationRoutePathname =
  | '/messages/[id]'
  | '/profile/[id]'
  | '/meetup/[id]'
  | '/trip/[id]/requests'
  | '/post/[id]'
  | '/group/[id]'
  | '/group/[id]/chat';

export type NotificationRoute = { pathname: NotificationRoutePathname; params: { id: string } };

/**
 * The single, central place that turns a notification's type/reference into an in-app route.
 * Used by both the in-app notifications list (app/notifications.tsx) and a tapped push
 * notification (context/push-notifications-context.tsx) — neither duplicates this mapping.
 *
 * Every group destination below (/group/[id] and /group/[id]/chat) already enforces its own
 * membership route guard (fetchGroupDetail's "not a member" fallback, added in the group-
 * administration/group-chat steps) — that guard, not this function, is what keeps a notification
 * from ever granting access it shouldn't. group_join_rejected/group_member_removed deliberately
 * still route to /group/[id] rather than the chat: that screen safely shows a controlled "Du bist
 * kein Mitglied dieser Gruppe."/"Kein Zugriff" message for a non-member instead of a broken route.
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

  if (reference.type === 'group') {
    if (input.type === 'group_message') {
      return { pathname: '/group/[id]/chat', params: { id: reference.id } };
    }

    return { pathname: '/group/[id]', params: { id: reference.id } };
  }

  // A trip's owner is directed to their request management screen rather than the generic trip
  // detail — trip_request_accepted/rejected (the requester's perspective) fall through to the
  // generic /post/[id] branch below instead, since they have no access to that screen.
  if (reference.type === 'trip' && input.type === 'trip_request_received') {
    return { pathname: '/trip/[id]/requests', params: { id: reference.id } };
  }

  return { pathname: '/post/[id]', params: { id: reference.id } };
}
