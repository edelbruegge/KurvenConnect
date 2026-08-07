import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

export type WarningType = 'content_violation' | 'conduct_warning';

export type SupabaseUserWarningRow = {
  id: string;
  user_id: string;
  report_id: string | null;
  moderator_id: string;
  warning_type: string;
  title: string;
  message: string;
  internal_note: string | null;
  created_at: string;
  acknowledged_at: string | null;
};

// Deliberately has no internal_note/moderator_id field for the normal-user-facing shape — a
// warned user must never see who reported/moderated them or read moderator-only notes. The
// moderation queue reads those directly off the report (resolutionNote) instead of this type.
export type UserWarning = {
  id: string;
  warningType: WarningType;
  title: string;
  message: string;
  createdAt: string;
  createdAtIso: string;
  acknowledgedAt?: string;
  isAcknowledged: boolean;
};

export function mapSupabaseUserWarningRow(row: SupabaseUserWarningRow): UserWarning {
  return {
    id: row.id,
    warningType: row.warning_type as WarningType,
    title: row.title,
    message: row.message,
    createdAt: formatRelativeGermanTime(row.created_at),
    createdAtIso: row.created_at,
    acknowledgedAt: row.acknowledged_at ? formatRelativeGermanTime(row.acknowledged_at) : undefined,
    isAcknowledged: row.acknowledged_at != null,
  };
}
