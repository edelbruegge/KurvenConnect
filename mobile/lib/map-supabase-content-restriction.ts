import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

// The five real, remote-capable content types that can ever be globally restricted — user
// profiles are deliberately excluded, matching public.content_restrictions' own check
// constraint. Uses the client's existing report-target vocabulary ('request' for a Gesucht entry,
// not 'wanted_entry') so callers never juggle two different type spellings.
export type RestrictableTargetType = 'post' | 'comment' | 'trip' | 'meetup' | 'request';

export type SupabaseContentRestrictionRow = {
  id: string;
  target_type: string;
  target_id: string;
  target_owner_id: string | null;
  report_id: string | null;
  restriction_type: string;
  reason: string | null;
  created_by: string;
  created_at: string;
  lifted_by: string | null;
  lifted_at: string | null;
  lift_note: string | null;
};

export type ContentRestriction = {
  id: string;
  targetType: RestrictableTargetType;
  targetId: string;
  targetOwnerId?: string;
  reportId?: string;
  reason?: string;
  createdBy: string;
  createdAt: string;
  createdAtIso: string;
  liftedBy?: string;
  liftedAt?: string;
  liftedAtIso?: string;
  liftNote?: string;
  isActive: boolean;
};

function dbTargetTypeToClient(type: string): RestrictableTargetType {
  if (type === 'wanted_entry') return 'request';
  return type as RestrictableTargetType;
}

export function mapSupabaseContentRestrictionRow(row: SupabaseContentRestrictionRow): ContentRestriction {
  return {
    id: row.id,
    targetType: dbTargetTypeToClient(row.target_type),
    targetId: row.target_id,
    targetOwnerId: row.target_owner_id ?? undefined,
    reportId: row.report_id ?? undefined,
    reason: row.reason ?? undefined,
    createdBy: row.created_by,
    createdAt: formatRelativeGermanTime(row.created_at),
    createdAtIso: row.created_at,
    liftedBy: row.lifted_by ?? undefined,
    liftedAt: row.lifted_at ? formatRelativeGermanTime(row.lifted_at) : undefined,
    liftedAtIso: row.lifted_at ?? undefined,
    liftNote: row.lift_note ?? undefined,
    isActive: row.lifted_at == null,
  };
}
