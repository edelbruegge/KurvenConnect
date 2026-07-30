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

export type Report = {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
  createdAt: string;
};
