import type { AppNotification, NotificationReference, NotificationType } from '@/data/notifications';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

export type SupabaseNotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string;
  reference_type: string | null;
  reference_id: string | null;
  event_key: string;
  read_at: string | null;
  created_at: string;
};

const KNOWN_NOTIFICATION_TYPES: NotificationType[] = [
  'message_received',
  'trip_request_received',
  'trip_request_accepted',
  'trip_request_rejected',
  'meetup_joined',
  'meetup_left',
  'user_follow',
  'group_message',
  'group_join_request',
  'group_join_accepted',
  'group_join_rejected',
  'group_admin_promoted',
  'group_admin_demoted',
  'group_member_removed',
  'group_ownership_transferred',
];

// Notification types whose title/body are fully resolved server-side at creation time (the group
// name and/or actor name are baked into the stored row) rather than reconstructed client-side —
// unlike the trip-request types below, several of these (group_member_removed,
// group_join_rejected) describe a state the recipient may no longer have any read access to by the
// time they open the notification, so re-resolving a group/actor name client-side would not always
// be possible. getNotificationDisplayContent surfaces the stored title for exactly these types.
const GROUP_NOTIFICATION_TYPES: NotificationType[] = [
  'group_message',
  'group_join_request',
  'group_join_accepted',
  'group_join_rejected',
  'group_admin_promoted',
  'group_admin_demoted',
  'group_member_removed',
  'group_ownership_transferred',
];

// Exported so the push-notification payload parser (lib/push-notifications.ts) can validate a
// push payload's type/reference fields with the exact same rules used for remote-loaded rows,
// instead of duplicating this validation.
export function toNotificationType(type: string): NotificationType {
  return (KNOWN_NOTIFICATION_TYPES as string[]).includes(type) ? (type as NotificationType) : 'system';
}

export function toReference(referenceType: string | null, referenceId: string | null): NotificationReference {
  if (!referenceType || !referenceId) {
    return null;
  }

  if (
    referenceType === 'conversation' ||
    referenceType === 'trip' ||
    referenceType === 'meetup' ||
    referenceType === 'profile' ||
    referenceType === 'group'
  ) {
    return { type: referenceType, id: referenceId };
  }

  return null;
}

export function mapSupabaseNotificationToNotification(row: SupabaseNotificationRow): AppNotification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    actorId: row.actor_id ?? undefined,
    type: toNotificationType(row.type),
    text: row.body,
    title: row.title,
    reference: toReference(row.reference_type, row.reference_id),
    createdAt: formatRelativeGermanTime(row.created_at),
    read: row.read_at !== null,
    source: 'supabase',
    createdAtIso: row.created_at,
  };
}

export type NotificationDisplayContext = {
  // A resolved, real display name for notification.actorId — pass undefined (not a placeholder
  // string like "Unbekanntes Mitglied") when the actor is missing or unresolved, so the ride
  // request text can fall back to "Jemand" itself rather than showing a fallback-of-a-fallback.
  actorDisplayName?: string;
  // Only pass departure/destination when they come from an actually-loaded trip; the function
  // itself re-validates both are non-empty before ever using them.
  tripRoute?: { departure: string; destination: string };
};

export type NotificationDisplayContent = {
  // null => no separate title line; the notification card renders body only, exactly as before
  // this change. Only the three trip-request types below ever get a title.
  title: string | null;
  body: string;
};

/**
 * The single, central place that decides what a notification's title/body actually say.
 * Deliberately never touches notification.text/DB body/reference IDs for the trip-request
 * types — every visible word for those three is a fixed template string interpolated only with
 * a validated actor name and/or validated route, so no technical value (UUID, event_key,
 * timestamp, status code, seat count, ...) can ever end up in what the user reads. All other
 * notification types are untouched and keep showing their existing stored/seed text as-is.
 */
export function getNotificationDisplayContent(
  notification: AppNotification,
  context: NotificationDisplayContext = {},
): NotificationDisplayContent {
  const actorName = context.actorDisplayName?.trim() || null;
  const route = context.tripRoute;
  const hasCleanRoute = Boolean(route && route.departure.trim() && route.destination.trim());
  const routeSuffix = hasCleanRoute ? ` von ${route!.departure.trim()} nach ${route!.destination.trim()}` : '';

  if (notification.type === 'trip_request_received') {
    const who = actorName ?? 'Jemand';
    return { title: 'Neue Fahrtanfrage', body: `${who} möchte bei deiner Fahrt${routeSuffix} mitfahren.` };
  }

  if (notification.type === 'trip_request_accepted') {
    return { title: 'Fahrtanfrage angenommen', body: `Deine Anfrage für die Fahrt${routeSuffix} wurde angenommen.` };
  }

  if (notification.type === 'trip_request_rejected') {
    return { title: 'Fahrtanfrage abgelehnt', body: `Deine Anfrage für die Fahrt${routeSuffix} wurde abgelehnt.` };
  }

  // Group notifications: title/body were already fully resolved (group name, actor name) at
  // creation time server-side — see the notify_on_*/manage_group_join_request/promote_group_
  // member/etc. functions in 20260813120000_add_group_notifications.sql — so this simply surfaces
  // the stored values instead of reconstructing anything client-side.
  if (GROUP_NOTIFICATION_TYPES.includes(notification.type)) {
    return { title: notification.title ?? null, body: notification.text };
  }

  return { title: null, body: notification.text };
}
