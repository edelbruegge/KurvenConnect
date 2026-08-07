import type { Report, ReportTargetType } from '@/data/reports';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

export type UserRole = 'moderator';

export type SupabaseUserRoleRow = {
  user_id: string;
  role: UserRole;
  assigned_at: string;
  assigned_by: string | null;
};

export type SupabaseModerationActionRow = {
  id: string;
  report_id: string;
  moderator_id: string;
  action: ModerationAction;
  note: string | null;
  created_at: string;
};

// 'reviewed'/'dismissed' come from review_report; the other four come from
// apply_report_action/restore_restricted_content — the full, current moderation_actions audit
// vocabulary. Keep this in sync with the check constraint in
// supabase/migrations/20260807140000_add_content_restrictions_and_user_warnings.sql.
export type ModerationAction = 'reviewed' | 'dismissed' | 'content_hidden' | 'user_warned' | 'content_hidden_and_user_warned' | 'content_restored';

export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  reviewed: 'Als geprüft markiert',
  dismissed: 'Meldung verworfen',
  content_hidden: 'Inhalt ausgeblendet',
  user_warned: 'Nutzer verwarnt',
  content_hidden_and_user_warned: 'Inhalt ausgeblendet und Nutzer verwarnt',
  content_restored: 'Inhalt wiederhergestellt',
};

export type ModerationActionLogEntry = {
  id: string;
  reportId: string;
  moderatorId: string;
  action: ModerationAction;
  note?: string;
  createdAt: string;
  createdAtIso: string;
};

export function mapSupabaseModerationActionRow(row: SupabaseModerationActionRow): ModerationActionLogEntry {
  return {
    id: row.id,
    reportId: row.report_id,
    moderatorId: row.moderator_id,
    action: row.action,
    note: row.note ?? undefined,
    createdAt: formatRelativeGermanTime(row.created_at),
    createdAtIso: row.created_at,
  };
}

// 'action_taken' (DB: 'actioned') is now a selectable filter so actioned reports stay reachable
// from the queue, not just from a direct link. 'all' removes the status filter entirely.
export type ModerationStatusFilter = 'submitted' | 'reviewed' | 'dismissed' | 'action_taken' | 'all';

export type ModerationFilter = {
  status: ModerationStatusFilter;
  targetType: ReportTargetType | 'all';
};

// Reports as loaded into the moderation queue — same shape as the reporter-facing Report (mapped
// via the existing mapSupabaseReportRow), with display names resolved client-side afterwards
// (batch profile fetch, same pattern as trip/[id]/requests.tsx) rather than embedded in the RPC
// response.
export type ModerationQueueItem = Report & {
  reporterDisplayName?: string;
  targetOwnerDisplayName?: string;
  reviewedByDisplayName?: string;
};
