import type { Report, ReportReason, ReportStatus, ReportTargetType } from '@/data/reports';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

export type SupabaseReportRow = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  target_owner_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

// The client's existing ReportTargetType (established long before this table existed) calls a
// Gesucht-reference 'request'; the database uses 'wanted_entry' to match the public.wanted_entries
// table name — same translation already used for conversation references in
// lib/map-supabase-message.ts's clientReferenceTypeToDb/dbReferenceTypeToClient.
function dbTargetTypeToClient(type: string): ReportTargetType {
  if (type === 'wanted_entry') return 'request';
  return type as ReportTargetType;
}

/**
 * The client's existing ReportTargetType is the vocabulary used everywhere in the app (including
 * for local/message/group reports, which never reach the database). Only the five remote-capable
 * types are translated here; message/group/group_post return null — there is no Supabase table to
 * report them against, so they are never sent to create_report.
 */
export function clientReportTargetTypeToDb(type: ReportTargetType): string | null {
  if (type === 'request') return 'wanted_entry';
  if (type === 'post' || type === 'comment' || type === 'trip' || type === 'meetup' || type === 'user') return type;
  return null;
}

// The client's existing ReportStatus (established long before this table existed) uses
// 'submitted'/'action_taken'; the database uses 'pending'/'actioned'. Only this mapping function
// knows about the difference — the rest of the app, including the local moderation demo, keeps
// working with the existing client status values unchanged.
function dbStatusToClient(status: string): ReportStatus {
  if (status === 'pending') return 'submitted';
  if (status === 'actioned') return 'action_taken';
  return status as ReportStatus;
}

// The reverse of dbStatusToClient — used by the moderation queue's status filter, which talks to
// get_moderation_reports() in the database's vocabulary.
export function clientReportStatusToDb(status: ReportStatus): string {
  if (status === 'submitted') return 'pending';
  if (status === 'action_taken') return 'actioned';
  return status;
}

export function mapSupabaseReportRow(row: SupabaseReportRow): Report {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: dbTargetTypeToClient(row.target_type),
    targetId: row.target_id,
    targetOwnerId: row.target_owner_id ?? undefined,
    reason: row.reason as ReportReason,
    details: row.details ?? undefined,
    createdAt: formatRelativeGermanTime(row.created_at),
    status: dbStatusToClient(row.status),
    reviewedAt: row.reviewed_at ? formatRelativeGermanTime(row.reviewed_at) : undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    resolutionNote: row.resolution_note ?? undefined,
    source: 'supabase',
    createdAtIso: row.created_at,
  };
}
