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
  reason: ReportReason;
  details?: string;
  createdAt: string;
  status: ReportStatus;
  reviewedAt?: string;
  resolutionNote?: string;
  moderationAction?: ModerationActionType;
};
