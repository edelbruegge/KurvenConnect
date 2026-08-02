import React, { createContext, useContext, useMemo, useState } from 'react';

import type { ModerationActionType, Report, ReportReason, ReportStatus, ReportTargetType } from '@/data/reports';
import { CURRENT_USER_ID } from '@/data/users';

type SubmitReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
};

type ResolveReportOptions = {
  resolutionNote?: string;
  moderationAction?: ModerationActionType;
};

type ReportsContextValue = {
  reports: Report[];
  submitReport: (input: SubmitReportInput) => void;
  hasReported: (targetType: ReportTargetType, targetId: string) => boolean;
  shouldHideTarget: (targetType: ReportTargetType, targetId: string) => boolean;
  resolveReport: (reportId: string, status: ReportStatus, options?: ResolveReportOptions) => void;
};

const ReportsContext = createContext<ReportsContextValue | undefined>(undefined);

export function ReportsProvider({ children }: { children: React.ReactNode }) {
  const [reports, setReports] = useState<Report[]>([]);

  const hasReported = (targetType: ReportTargetType, targetId: string) =>
    reports.some(
      (report) => report.reporterId === CURRENT_USER_ID && report.targetType === targetType && report.targetId === targetId,
    );

  const submitReport = (input: SubmitReportInput) => {
    if (hasReported(input.targetType, input.targetId)) {
      return;
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
    };

    setReports((current) => [...current, newReport]);
  };

  const shouldHideTarget = (targetType: ReportTargetType, targetId: string) => hasReported(targetType, targetId);

  const resolveReport = (reportId: string, status: ReportStatus, options?: ResolveReportOptions) => {
    setReports((current) =>
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
      shouldHideTarget,
      resolveReport,
    }),
    [reports],
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
