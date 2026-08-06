import type { Report, ReportTargetType } from '@/data/reports';

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

export type ModerationAction = 'reviewed' | 'dismissed';

export type ModerationFilter = {
  status: 'submitted' | 'reviewed' | 'dismissed';
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
