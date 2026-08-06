import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { getReportTargetKey, type ModerationActionType, type Report, type ReportReason, type ReportStatus, type ReportTargetType } from '@/data/reports';
import { CURRENT_USER_ID } from '@/data/users';
import { clientReportTargetTypeToDb, mapSupabaseReportRow, type SupabaseReportRow } from '@/lib/map-supabase-report';
import { mapReportError } from '@/lib/report-errors';
import { supabase } from '@/lib/supabase';

type SubmitReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
  // 'supabase' for real Supabase content/users, everything else (including undefined) uses the
  // existing local in-memory path — messages/groups always do, since neither has a Supabase
  // table to report against.
  source?: 'local' | 'supabase';
};

type ResolveReportOptions = {
  resolutionNote?: string;
  moderationAction?: ModerationActionType;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REPORTS_SELECT_COLUMNS =
  'id, reporter_id, target_type, target_id, target_owner_id, reason, details, status, reviewed_by, reviewed_at, resolution_note, created_at, updated_at';

type ReportsContextValue = {
  reports: Report[];
  submitReport: (input: SubmitReportInput) => Promise<{ error: string | null }>;
  hasReported: (targetType: ReportTargetType, targetId: string) => boolean;
  isTargetReported: (targetType: ReportTargetType, targetId: string) => boolean;
  isUserReported: (userId: string) => boolean;
  shouldHideTarget: (targetType: ReportTargetType, targetId: string) => boolean;
  resolveReport: (reportId: string, status: ReportStatus, options?: ResolveReportOptions) => void;

  // Supabase-backed reports for the signed-in account.
  remoteReports: Report[];
  reportedTargetKeys: Set<string>;
  reportedUserIds: Set<string>;
  isRemoteReportsLoading: boolean;
  remoteReportsError: string | null;
  refreshRemoteReports: () => void;
  reportTarget: (input: SubmitReportInput) => Promise<{ error: string | null }>;
};

const ReportsContext = createContext<ReportsContextValue | undefined>(undefined);

export function ReportsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [localReports, setLocalReports] = useState<Report[]>([]);

  const [remoteReports, setRemoteReports] = useState<Report[]>([]);
  const [isRemoteReportsLoading, setIsRemoteReportsLoading] = useState(false);
  const [remoteReportsError, setRemoteReportsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const inFlightTargetKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never keep showing stale remote reports.
      setRemoteReports([]);
      setIsRemoteReportsLoading(false);
      setRemoteReportsError(null);
      inFlightTargetKeys.current.clear();
      return;
    }

    let isCurrent = true;
    setIsRemoteReportsLoading(true);
    setRemoteReportsError(null);

    supabase
      .from('reports')
      .select(REPORTS_SELECT_COLUMNS)
      .eq('reporter_id', authUserId)
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setRemoteReportsError(mapReportError(error));
          setRemoteReports([]);
          setIsRemoteReportsLoading(false);
          return;
        }

        const mapped = ((data ?? []) as SupabaseReportRow[]).map(mapSupabaseReportRow);
        setRemoteReports(mapped);
        setIsRemoteReportsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, reloadToken]);

  const refreshRemoteReports = () => {
    setReloadToken((token) => token + 1);
  };

  const reports = useMemo(() => {
    const seenIds = new Set<string>();
    const merged: Report[] = [];

    for (const report of [...remoteReports, ...localReports]) {
      if (seenIds.has(report.id)) continue;
      seenIds.add(report.id);
      merged.push(report);
    }

    return merged;
  }, [remoteReports, localReports]);

  const reportedTargetKeys = useMemo(
    () => new Set(reports.map((report) => getReportTargetKey(report.targetType, report.targetId))),
    [reports],
  );

  const reportedUserIds = useMemo(
    () => new Set(reports.filter((report) => report.targetType === 'user').map((report) => report.targetId)),
    [reports],
  );

  const hasReported = (targetType: ReportTargetType, targetId: string) => reportedTargetKeys.has(getReportTargetKey(targetType, targetId));
  const isTargetReported = hasReported;
  const isUserReported = (userId: string) => reportedUserIds.has(userId);
  const shouldHideTarget = hasReported;

  const submitReportLocal = (input: SubmitReportInput): { error: string | null } => {
    if (hasReported(input.targetType, input.targetId)) {
      return { error: null };
    }

    const newReport: Report = {
      id: `report-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      reporterId: CURRENT_USER_ID,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details?.trim() || undefined,
      createdAt: 'gerade eben',
      status: 'submitted',
      source: 'local',
    };

    setLocalReports((current) => [...current, newReport]);
    return { error: null };
  };

  const reportTarget = async (input: SubmitReportInput): Promise<{ error: string | null }> => {
    if (input.source !== 'supabase') {
      return submitReportLocal(input);
    }

    if (!authUserId) {
      return { error: mapReportError(new Error('not authenticated')) };
    }

    const targetKey = getReportTargetKey(input.targetType, input.targetId);

    if (hasReported(input.targetType, input.targetId) || inFlightTargetKeys.current.has(targetKey)) {
      return { error: null };
    }

    const dbTargetType = clientReportTargetTypeToDb(input.targetType);

    if (!dbTargetType || !UUID_PATTERN.test(input.targetId)) {
      // Not a remote-reportable type, or a non-UUID (e.g. local seed) id ended up on the remote
      // path — never send this to the RPC, fail closed with a neutral message instead.
      return { error: mapReportError(new Error('target not found')) };
    }

    inFlightTargetKeys.current.add(targetKey);

    try {
      const { data, error } = await supabase.rpc('create_report', {
        p_target_type: dbTargetType,
        p_target_id: input.targetId,
        p_reason: input.reason,
        p_details: input.details?.trim() || null,
      });

      if (error) {
        return { error: mapReportError(error) };
      }

      const newReport = mapSupabaseReportRow(data as SupabaseReportRow);
      setRemoteReports((current) => {
        if (current.some((entry) => entry.id === newReport.id)) {
          return current;
        }

        return [...current, newReport];
      });

      return { error: null };
    } finally {
      inFlightTargetKeys.current.delete(targetKey);
    }
  };

  // Kept as the original name/signature (now async) so report-modal.tsx and every existing call
  // site keeps working — it simply delegates to reportTarget.
  const submitReport = (input: SubmitReportInput) => reportTarget(input);

  const resolveReport = (reportId: string, status: ReportStatus, options?: ResolveReportOptions) => {
    setLocalReports((current) =>
      current.map((report) => {
        if (report.id !== reportId) {
          return report;
        }

        return {
          ...report,
          status,
          reviewedAt: status === 'reviewed' || status === 'action_taken' ? 'gerade eben' : report.reviewedAt,
          resolutionNote: options?.resolutionNote?.trim() || report.resolutionNote,
          moderationAction: options?.moderationAction ?? report.moderationAction,
        };
      }),
    );
  };

  const value = useMemo(
    () => ({
      reports,
      submitReport,
      hasReported,
      isTargetReported,
      isUserReported,
      shouldHideTarget,
      resolveReport,
      remoteReports,
      reportedTargetKeys,
      reportedUserIds,
      isRemoteReportsLoading,
      remoteReportsError,
      refreshRemoteReports,
      reportTarget,
    }),
    [reports, remoteReports, reportedTargetKeys, reportedUserIds, isRemoteReportsLoading, remoteReportsError, authUserId],
  );

  return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}

export function useReports() {
  const context = useContext(ReportsContext);

  if (!context) {
    throw new Error('useReports must be used within a ReportsProvider');
  }

  return context;
}
