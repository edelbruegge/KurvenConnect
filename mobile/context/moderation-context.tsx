import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import type { ReportTargetType } from '@/data/reports';
import { clientReportStatusToDb, clientReportTargetTypeToDb, mapSupabaseReportRow, type SupabaseReportRow } from '@/lib/map-supabase-report';
import type { ModerationAction, ModerationFilter, ModerationQueueItem } from '@/lib/map-supabase-moderation';
import { mapModerationError } from '@/lib/moderation-errors';
import { supabase } from '@/lib/supabase';

type ModerationContextValue = {
  // Local, in-memory moderation demo (unchanged) — never touches Supabase.
  isContentModerationHidden: (targetType: ReportTargetType, targetId: string) => boolean;
  hideContentByModeration: (targetType: ReportTargetType, targetId: string) => void;
  restoreContentModeration: (targetType: ReportTargetType, targetId: string) => void;
  isUserSuspended: (userId: string) => boolean;
  suspendUser: (userId: string) => void;
  restoreUser: (userId: string) => void;

  // Real, server-checked moderator role and moderation queue.
  isModerator: boolean;
  isModeratorStatusLoading: boolean;
  moderatorStatusError: string | null;
  refreshModeratorStatus: () => void;

  moderationReports: ModerationQueueItem[];
  isModerationReportsLoading: boolean;
  moderationReportsError: string | null;
  moderationFilter: ModerationFilter;
  setModerationFilter: (filter: ModerationFilter) => void;
  refreshModerationReports: () => void;
  reviewReport: (reportId: string, note?: string) => Promise<{ error: string | null }>;
  dismissReport: (reportId: string, note?: string) => Promise<{ error: string | null }>;
  getModerationReportById: (id: string) => ModerationQueueItem | undefined;
};

const ModerationContext = createContext<ModerationContextValue | undefined>(undefined);

const contentKey = (targetType: ReportTargetType, targetId: string) => `${targetType}:${targetId}`;

const DEFAULT_MODERATION_FILTER: ModerationFilter = { status: 'submitted', targetType: 'all' };

export function ModerationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  // --- Local, in-memory moderation demo — unchanged. ---
  const [hiddenContentKeys, setHiddenContentKeys] = useState<string[]>([]);
  const [suspendedUserIds, setSuspendedUserIds] = useState<string[]>([]);

  const isContentModerationHidden = (targetType: ReportTargetType, targetId: string) =>
    hiddenContentKeys.includes(contentKey(targetType, targetId));

  const hideContentByModeration = (targetType: ReportTargetType, targetId: string) => {
    const key = contentKey(targetType, targetId);
    setHiddenContentKeys((current) => (current.includes(key) ? current : [...current, key]));
  };

  const restoreContentModeration = (targetType: ReportTargetType, targetId: string) => {
    const key = contentKey(targetType, targetId);
    setHiddenContentKeys((current) => current.filter((entry) => entry !== key));
  };

  const isUserSuspended = (userId: string) => suspendedUserIds.includes(userId);

  const suspendUser = (userId: string) => {
    setSuspendedUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
  };

  const restoreUser = (userId: string) => {
    setSuspendedUserIds((current) => current.filter((id) => id !== userId));
  };

  // --- Real moderator role. ---
  const [isModerator, setIsModerator] = useState(false);
  const [isModeratorStatusLoading, setIsModeratorStatusLoading] = useState(false);
  const [moderatorStatusError, setModeratorStatusError] = useState<string | null>(null);
  const [moderatorStatusReloadToken, setModeratorStatusReloadToken] = useState(0);

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never keep a stale moderator status.
      setIsModerator(false);
      setIsModeratorStatusLoading(false);
      setModeratorStatusError(null);
      return;
    }

    let isCurrent = true;
    setIsModeratorStatusLoading(true);
    setModeratorStatusError(null);

    supabase
      .rpc('is_current_user_moderator')
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setModeratorStatusError(mapModerationError(error, 'load'));
          setIsModerator(false);
          setIsModeratorStatusLoading(false);
          return;
        }

        setIsModerator(Boolean(data));
        setIsModeratorStatusLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, moderatorStatusReloadToken]);

  const refreshModeratorStatus = () => {
    setModeratorStatusReloadToken((token) => token + 1);
  };

  // --- Moderation queue. Only ever loaded when authUserId && isModerator — the RPC is never
  // called for a normal user, not just hidden from them in the UI. ---
  const [moderationReports, setModerationReports] = useState<ModerationQueueItem[]>([]);
  const [isModerationReportsLoading, setIsModerationReportsLoading] = useState(false);
  const [moderationReportsError, setModerationReportsError] = useState<string | null>(null);
  const [moderationFilter, setModerationFilter] = useState<ModerationFilter>(DEFAULT_MODERATION_FILTER);
  const [moderationReloadToken, setModerationReloadToken] = useState(0);

  const inFlightReportIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authUserId || !isModerator) {
      setModerationReports([]);
      setIsModerationReportsLoading(false);
      setModerationReportsError(null);
      inFlightReportIds.current.clear();
      return;
    }

    let isCurrent = true;
    setIsModerationReportsLoading(true);
    setModerationReportsError(null);

    supabase
      .rpc('get_moderation_reports', {
        p_status: clientReportStatusToDb(moderationFilter.status),
        p_target_type: moderationFilter.targetType === 'all' ? null : clientReportTargetTypeToDb(moderationFilter.targetType),
      })
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setModerationReportsError(mapModerationError(error, 'load'));
          setModerationReports([]);
          setIsModerationReportsLoading(false);
          return;
        }

        const mapped = ((data ?? []) as SupabaseReportRow[]).map(mapSupabaseReportRow);
        setModerationReports(mapped);
        setIsModerationReportsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, isModerator, moderationFilter, moderationReloadToken]);

  const refreshModerationReports = () => {
    setModerationReloadToken((token) => token + 1);
  };

  const moderationReportsById = useMemo(() => {
    const byId: Record<string, ModerationQueueItem> = {};
    moderationReports.forEach((report) => {
      byId[report.id] = report;
    });
    return byId;
  }, [moderationReports]);

  const getModerationReportById = (id: string): ModerationQueueItem | undefined => moderationReportsById[id];

  const applyModerationDecision = async (
    reportId: string,
    action: ModerationAction,
    note?: string,
  ): Promise<{ error: string | null }> => {
    if (inFlightReportIds.current.has(reportId)) {
      return { error: null };
    }

    inFlightReportIds.current.add(reportId);

    try {
      const { data, error } = await supabase.rpc('review_report', {
        p_report_id: reportId,
        p_action: action,
        p_note: note?.trim() || null,
      });

      if (error) {
        return { error: mapModerationError(error, 'review') };
      }

      const updated = mapSupabaseReportRow(data as SupabaseReportRow);
      setModerationReports((current) => current.map((report) => (report.id === updated.id ? { ...report, ...updated } : report)));

      return { error: null };
    } finally {
      inFlightReportIds.current.delete(reportId);
    }
  };

  const reviewReport = (reportId: string, note?: string) => applyModerationDecision(reportId, 'reviewed', note);
  const dismissReport = (reportId: string, note?: string) => applyModerationDecision(reportId, 'dismissed', note);

  const value = useMemo(
    () => ({
      isContentModerationHidden,
      hideContentByModeration,
      restoreContentModeration,
      isUserSuspended,
      suspendUser,
      restoreUser,
      isModerator,
      isModeratorStatusLoading,
      moderatorStatusError,
      refreshModeratorStatus,
      moderationReports,
      isModerationReportsLoading,
      moderationReportsError,
      moderationFilter,
      setModerationFilter,
      refreshModerationReports,
      reviewReport,
      dismissReport,
      getModerationReportById,
    }),
    [
      hiddenContentKeys,
      suspendedUserIds,
      isModerator,
      isModeratorStatusLoading,
      moderatorStatusError,
      moderationReports,
      isModerationReportsLoading,
      moderationReportsError,
      moderationFilter,
    ],
  );

  return <ModerationContext.Provider value={value}>{children}</ModerationContext.Provider>;
}

export function useModeration() {
  const context = useContext(ModerationContext);

  if (!context) {
    throw new Error('useModeration must be used within a ModerationProvider');
  }

  return context;
}
