export type ReportTargetType =
  | 'user'
  | 'post'
  | 'comment'
  | 'trip'
  | 'meetup'
  | 'request'
  | 'message'
  | 'group'
  | 'group_post';

export type ReportReason = 'Unangemessener Inhalt' | 'Spam oder Werbung' | 'Belästigung' | 'Falschinformation' | 'Sonstiges';

export const REPORT_REASONS: ReportReason[] = [
  'Unangemessener Inhalt',
  'Spam oder Werbung',
  'Belästigung',
  'Falschinformation',
  'Sonstiges',
];

export const REPORT_TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  user: 'Nutzer',
  post: 'Beitrag',
  comment: 'Kommentar',
  trip: 'Fahrt',
  meetup: 'Treffpunkt',
  request: 'Gesucht',
  message: 'Nachricht',
  group: 'Gruppe',
  group_post: 'Gruppenbeitrag',
};

export type ReportStatus = 'submitted' | 'reviewed' | 'dismissed' | 'action_taken';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  submitted: 'Offen',
  reviewed: 'Bearbeitet',
  dismissed: 'Zurückgewiesen',
  action_taken: 'Aktion durchgeführt',
};

export type ModerationActionType = 'hide_content' | 'suspend_user';

export type Report = {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  // Only ever set for source:'supabase' reports — the profile UUID owning the reported target
  // (resolved server-side by create_report, never trusted from the client).
  targetOwnerId?: string;
  reason: ReportReason;
  details?: string;
  createdAt: string;
  status: ReportStatus;
  reviewedAt?: string;
  // Only ever set for source:'supabase' reports that have moved past 'pending' — the moderator's
  // profile UUID, set server-side by review_report.
  reviewedBy?: string;
  resolutionNote?: string;
  moderationAction?: ModerationActionType;
  // 'local' for seed/in-memory reports (and message/group reports, which have no Supabase
  // backing), 'supabase' for rows loaded from public.reports. Defaults to 'local' when absent,
  // same convention as FeedPost.source.
  source?: 'local' | 'supabase';
  // Raw ISO timestamp, set only for source:'supabase' reports.
  createdAtIso?: string;
};

// The single, central key used everywhere a "was this target reported" lookup happens — never
// duplicate this string format at a call site.
export function getReportTargetKey(targetType: ReportTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}
