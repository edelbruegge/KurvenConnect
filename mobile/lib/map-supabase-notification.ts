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
];

function toNotificationType(type: string): NotificationType {
  return (KNOWN_NOTIFICATION_TYPES as string[]).includes(type) ? (type as NotificationType) : 'system';
}

function toReference(referenceType: string | null, referenceId: string | null): NotificationReference {
  if (!referenceType || !referenceId) {
    return null;
  }

  if (referenceType === 'conversation' || referenceType === 'trip' || referenceType === 'meetup' || referenceType === 'profile') {
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
    reference: toReference(row.reference_type, row.reference_id),
    createdAt: formatRelativeGermanTime(row.created_at),
    read: row.read_at !== null,
    source: 'supabase',
    createdAtIso: row.created_at,
  };
}
