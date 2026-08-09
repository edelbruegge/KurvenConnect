import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import type { ReportTargetType } from '@/data/reports';
import { clientReportStatusToDb, clientReportTargetTypeToDb, mapSupabaseReportRow, type SupabaseReportRow } from '@/lib/map-supabase-report';
import type { ModerationAction, ModerationFilter, ModerationQueueItem } from '@/lib/map-supabase-moderation';
import {
  mapSupabaseContentRestrictionRow,
  type ContentRestriction,
  type SupabaseContentRestrictionRow,
} from '@/lib/map-supabase-content-restriction';
import { mapModerationError } from '@/lib/moderation-errors';
import { mapModerationActionError } from '@/lib/moderation-action-errors';
import { supabase } from '@/lib/supabase';

export type ReportActionType = 'hide_content' | 'warn_user' | 'hide_and_warn';

export type ModerationTargetPreview = { exists: boolean; previewText?: string; ownerId?: string; displayName?: string };

// The warning title is a fixed, server-side default ("Hinweis zu deinem Verhalten") — only the
// message and the optional internal moderator note are ever sent to apply_report_action.
type ReportActionOptions = {
  note?: string;
  warningMessage?: string;
};

type RealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'reconnecting' | 'error' | 'closed';

// A minimal structural view of the postgres_changes payload — only the fields the handlers below
// actually read, same approach as NotificationsContext's RealtimeNotificationInsertPayload.
type RealtimeChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
};

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
  // Looks up a report already known to this context (current filter's list, a past action result,
  // or a prior fetchModerationReportById call) — never searches only the currently loaded filtered
  // array, so a report that scrolled out of view because its status no longer matches the active
  // filter stays resolvable.
  getModerationReportById: (id: string) => ModerationQueueItem | undefined;
  // Loads exactly one report by id via get_moderation_report(), independent of status and of
  // whatever filter is currently active — the fallback path for direct/deep-linked access.
  fetchModerationReportById: (id: string) => Promise<ModerationQueueItem | null>;

  // Controlled moderation actions against an existing report's target/owner.
  isModerationActionSubmitting: boolean;
  moderationActionError: string | null;
  applyReportAction: (reportId: string, action: ReportActionType, options?: ReportActionOptions) => Promise<{ error: string | null }>;
  hideReportedContent: (reportId: string, note?: string) => Promise<{ error: string | null }>;
  warnReportedUser: (reportId: string, warningMessage?: string, note?: string) => Promise<{ error: string | null }>;
  hideAndWarn: (reportId: string, warningMessage?: string, note?: string) => Promise<{ error: string | null }>;
  restoreRestrictedContent: (restrictionId: string, note?: string) => Promise<{ error: string | null }>;
  getRestrictionForReport: (reportId: string) => Promise<ContentRestriction | null>;
  // A live, moderator-only preview of a report's target that does not depend on the target
  // already being present in the moderator's own locally cached feed/trips/etc. state, and works
  // even while the target is globally restricted.
  getModerationTargetPreview: (targetType: ReportTargetType, targetId: string) => Promise<ModerationTargetPreview>;

  // Currently active (not yet lifted) global content restrictions — the "Ausgeblendet" view.
  activeRestrictions: ContentRestriction[];
  isActiveRestrictionsLoading: boolean;
  activeRestrictionsError: string | null;
  refreshActiveRestrictions: () => void;

  // Realtime status of the reports/content_restrictions channel — exposed so a screen can decide
  // whether a focus-triggered refresh is actually needed (only when this is not 'subscribed').
  moderationRealtimeStatus: RealtimeStatus;
};

const ModerationContext = createContext<ModerationContextValue | undefined>(undefined);

const contentKey = (targetType: ReportTargetType, targetId: string) => `${targetType}:${targetId}`;

const DEFAULT_MODERATION_FILTER: ModerationFilter = { status: 'submitted', targetType: 'all' };

function reportMatchesFilter(report: ModerationQueueItem, filter: ModerationFilter): boolean {
  const matchesStatus = filter.status === 'all' || report.status === filter.status;
  const matchesTargetType = filter.targetType === 'all' || report.targetType === filter.targetType;
  return matchesStatus && matchesTargetType;
}

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

  // Declared here (ahead of use) so the reset below never references a not-yet-initialized
  // setter — the actual hide/warn/restore logic that uses these lives further down.
  const [isModerationActionSubmitting, setIsModerationActionSubmitting] = useState(false);
  const [moderationActionError, setModerationActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never keep a stale moderator status, and
      // never let a leftover moderation-action error/submitting flag from the previous account
      // bleed into the next one.
      setIsModerator(false);
      setIsModeratorStatusLoading(false);
      setModeratorStatusError(null);
      setModerationActionError(null);
      setIsModerationActionSubmitting(false);
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
  // called for a normal user, not just hidden from them in the UI. Every report this context has
  // ever seen (from a filtered list fetch, a single-report fetch, an action result, or a realtime
  // event) accumulates in reportsById and is never evicted just because a later filter fetch
  // didn't include it again — only the *visible list* for the current filter
  // (currentFilterReportIds) changes when the filter changes or a report's status moves it in or
  // out of the active filter. This is what keeps reviewed/dismissed/actioned reports reachable. ---
  const [reportsById, setReportsById] = useState<Record<string, ModerationQueueItem>>({});
  const [currentFilterReportIds, setCurrentFilterReportIds] = useState<string[]>([]);
  const [isModerationReportsLoading, setIsModerationReportsLoading] = useState(false);
  const [moderationReportsError, setModerationReportsError] = useState<string | null>(null);
  const [moderationFilter, setModerationFilter] = useState<ModerationFilter>(DEFAULT_MODERATION_FILTER);
  const [moderationReloadToken, setModerationReloadToken] = useState(0);

  const inFlightReportIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authUserId || !isModerator) {
      setReportsById({});
      setCurrentFilterReportIds([]);
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
        p_status: moderationFilter.status === 'all' ? null : clientReportStatusToDb(moderationFilter.status),
        p_target_type: moderationFilter.targetType === 'all' ? null : clientReportTargetTypeToDb(moderationFilter.targetType),
      })
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setModerationReportsError(mapModerationError(error, 'load'));
          setIsModerationReportsLoading(false);
          return;
        }

        const mapped = ((data ?? []) as SupabaseReportRow[]).map(mapSupabaseReportRow);
        setReportsById((current) => {
          const next = { ...current };
          mapped.forEach((report) => {
            next[report.id] = report;
          });
          return next;
        });
        setCurrentFilterReportIds(mapped.map((report) => report.id));
        setIsModerationReportsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, isModerator, moderationFilter, moderationReloadToken]);

  const refreshModerationReports = () => {
    setModerationReloadToken((token) => token + 1);
  };

  const moderationReports = useMemo(
    () => currentFilterReportIds.map((id) => reportsById[id]).filter((report): report is ModerationQueueItem => Boolean(report)),
    [currentFilterReportIds, reportsById],
  );

  const getModerationReportById = (id: string): ModerationQueueItem | undefined => reportsById[id];

  const fetchModerationReportById = async (id: string): Promise<ModerationQueueItem | null> => {
    const { data, error } = await supabase.rpc('get_moderation_report', { p_report_id: id });

    if (error || !data) {
      return null;
    }

    const mapped = mapSupabaseReportRow(data as SupabaseReportRow);
    setReportsById((current) => ({ ...current, [mapped.id]: mapped }));
    return mapped;
  };

  // Merges a freshly updated report into the accumulator and reconciles which filtered lists it
  // should currently appear in (e.g. a report moving from 'submitted' to 'action_taken' disappears
  // from an "Offen" filter view immediately, without ever disappearing from the app entirely).
  const upsertModerationReport = (updated: ModerationQueueItem) => {
    setReportsById((current) => ({ ...current, [updated.id]: { ...current[updated.id], ...updated } }));
    setCurrentFilterReportIds((current) => {
      const shouldBeInList = reportMatchesFilter(updated, moderationFilter);
      const isInList = current.includes(updated.id);

      if (shouldBeInList && !isInList) {
        return [updated.id, ...current];
      }
      if (!shouldBeInList && isInList) {
        return current.filter((id) => id !== updated.id);
      }
      return current;
    });
  };

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

      upsertModerationReport(mapSupabaseReportRow(data as SupabaseReportRow));

      return { error: null };
    } finally {
      inFlightReportIds.current.delete(reportId);
    }
  };

  const reviewReport = (reportId: string, note?: string) => applyModerationDecision(reportId, 'reviewed', note);
  const dismissReport = (reportId: string, note?: string) => applyModerationDecision(reportId, 'dismissed', note);

  // --- Active content restrictions ("Ausgeblendet"). Loaded independently of the reports queue —
  // only ever when authUserId && isModerator. ---
  const [activeRestrictions, setActiveRestrictions] = useState<ContentRestriction[]>([]);
  const [isActiveRestrictionsLoading, setIsActiveRestrictionsLoading] = useState(false);
  const [activeRestrictionsError, setActiveRestrictionsError] = useState<string | null>(null);
  const [activeRestrictionsReloadToken, setActiveRestrictionsReloadToken] = useState(0);

  useEffect(() => {
    if (!authUserId || !isModerator) {
      setActiveRestrictions([]);
      setIsActiveRestrictionsLoading(false);
      setActiveRestrictionsError(null);
      return;
    }

    let isCurrent = true;
    setIsActiveRestrictionsLoading(true);
    setActiveRestrictionsError(null);

    supabase
      .rpc('get_active_content_restrictions', {})
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setActiveRestrictionsError(mapModerationActionError(error, 'load'));
          setActiveRestrictions([]);
          setIsActiveRestrictionsLoading(false);
          return;
        }

        const mapped = ((data ?? []) as SupabaseContentRestrictionRow[]).map(mapSupabaseContentRestrictionRow);
        setActiveRestrictions(mapped);
        setIsActiveRestrictionsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [authUserId, isModerator, activeRestrictionsReloadToken]);

  const refreshActiveRestrictions = () => {
    setActiveRestrictionsReloadToken((token) => token + 1);
  };

  const upsertActiveRestriction = (restriction: ContentRestriction) => {
    setActiveRestrictions((current) => {
      if (!restriction.isActive) {
        return current.filter((entry) => entry.id !== restriction.id);
      }

      const withoutExisting = current.filter((entry) => entry.id !== restriction.id);
      return [restriction, ...withoutExisting];
    });
  };

  // --- Controlled moderation actions (hide/warn/hide+warn, restore). Shared in-flight guard with
  // the reviewed/dismissed actions above so a report can never be double-actioned from two
  // different buttons at once. ---
  const applyReportAction = async (
    reportId: string,
    action: ReportActionType,
    options?: ReportActionOptions,
  ): Promise<{ error: string | null }> => {
    if (inFlightReportIds.current.has(reportId)) {
      return { error: null };
    }

    inFlightReportIds.current.add(reportId);
    setIsModerationActionSubmitting(true);
    setModerationActionError(null);

    try {
      const { data, error } = await supabase.rpc('apply_report_action', {
        p_report_id: reportId,
        p_action: action,
        p_note: options?.note?.trim() || null,
        p_warning_message: options?.warningMessage?.trim() || null,
      });

      if (error) {
        const mapped = mapModerationActionError(error, 'action');
        setModerationActionError(mapped);
        return { error: mapped };
      }

      const result = data as { report: SupabaseReportRow; restriction_id: string | null };
      upsertModerationReport(mapSupabaseReportRow(result.report));

      // The RPC only returns the new restriction's id, not the full row — fetch it once so the
      // "Ausgeblendet" list updates immediately instead of waiting for the next realtime event.
      if (result.restriction_id) {
        const { data: restrictionRow } = await supabase
          .from('content_restrictions')
          .select('*')
          .eq('id', result.restriction_id)
          .maybeSingle();

        if (restrictionRow) {
          upsertActiveRestriction(mapSupabaseContentRestrictionRow(restrictionRow as SupabaseContentRestrictionRow));
        }
      }

      return { error: null };
    } finally {
      inFlightReportIds.current.delete(reportId);
      setIsModerationActionSubmitting(false);
    }
  };

  const hideReportedContent = (reportId: string, note?: string) => applyReportAction(reportId, 'hide_content', { note });
  const warnReportedUser = (reportId: string, warningMessage?: string, note?: string) =>
    applyReportAction(reportId, 'warn_user', { note, warningMessage });
  const hideAndWarn = (reportId: string, warningMessage?: string, note?: string) =>
    applyReportAction(reportId, 'hide_and_warn', { note, warningMessage });

  const restoreRestrictedContent = async (restrictionId: string, note?: string): Promise<{ error: string | null }> => {
    if (inFlightReportIds.current.has(restrictionId)) {
      return { error: null };
    }

    inFlightReportIds.current.add(restrictionId);
    setIsModerationActionSubmitting(true);
    setModerationActionError(null);

    try {
      const { data, error } = await supabase.rpc('restore_restricted_content', {
        p_restriction_id: restrictionId,
        p_note: note?.trim() || null,
      });

      if (error) {
        const mapped = mapModerationActionError(error, 'restore');
        setModerationActionError(mapped);
        return { error: mapped };
      }

      if (data) {
        upsertActiveRestriction(mapSupabaseContentRestrictionRow(data as SupabaseContentRestrictionRow));
      }

      return { error: null };
    } finally {
      inFlightReportIds.current.delete(restrictionId);
      setIsModerationActionSubmitting(false);
    }
  };

  const getRestrictionForReport = async (reportId: string): Promise<ContentRestriction | null> => {
    const { data, error } = await supabase
      .from('content_restrictions')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapSupabaseContentRestrictionRow(data as SupabaseContentRestrictionRow);
  };

  const getModerationTargetPreview = async (targetType: ReportTargetType, targetId: string): Promise<ModerationTargetPreview> => {
    const dbType = clientReportTargetTypeToDb(targetType);

    if (!dbType) {
      return { exists: false };
    }

    const { data, error } = await supabase.rpc('get_moderation_target_preview', { p_target_type: dbType, p_target_id: targetId });

    if (error || !data) {
      return { exists: false };
    }

    const row = data as { exists: boolean; preview_text?: string | null; owner_id?: string | null; display_name?: string | null };
    return {
      exists: Boolean(row.exists),
      previewText: row.preview_text ?? undefined,
      ownerId: row.owner_id ?? undefined,
      displayName: row.display_name ?? undefined,
    };
  };

  // --- Realtime: reports + content_restrictions, moderators only. A normal (non-moderator)
  // account never opens this channel at all — RLS would block the events anyway, but not
  // subscribing in the first place keeps this from being an even-theoretically-observable signal
  // and avoids an idle connection nobody needs. ---
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [realtimeReconnectToken, setRealtimeReconnectToken] = useState(0);

  const handleRealtimeReportChange = (payload: RealtimeChangePayload) => {
    const row = payload.new;
    const isValidRow = row && typeof row.id === 'string' && typeof row.status === 'string' && typeof row.target_type === 'string';

    if (!isValidRow) {
      return;
    }

    upsertModerationReport(mapSupabaseReportRow(row as unknown as SupabaseReportRow));
  };

  const handleRealtimeRestrictionChange = (payload: RealtimeChangePayload) => {
    const row = payload.new;
    const isValidRow = row && typeof row.id === 'string' && typeof row.target_type === 'string';

    if (!isValidRow) {
      return;
    }

    upsertActiveRestriction(mapSupabaseContentRestrictionRow(row as unknown as SupabaseContentRestrictionRow));
  };

  // Refs so the long-lived channel subscription (below) always calls the latest closure without
  // needing moderationFilter/reportsById/activeRestrictions in its own effect dependencies —
  // exactly the pattern already used in NotificationsProvider for the same reason: reconnecting
  // the channel on every filter change would violate "genau ein passender Channel pro Konto".
  const handleRealtimeReportChangeRef = useRef(handleRealtimeReportChange);
  handleRealtimeReportChangeRef.current = handleRealtimeReportChange;
  const handleRealtimeRestrictionChangeRef = useRef(handleRealtimeRestrictionChange);
  handleRealtimeRestrictionChangeRef.current = handleRealtimeRestrictionChange;

  useEffect(() => {
    if (!authUserId || !isModerator) {
      setRealtimeStatus('idle');
      return;
    }

    let isCurrent = true;
    setRealtimeStatus((current) => (current === 'error' || current === 'closed' ? 'reconnecting' : 'connecting'));

    const channel = supabase
      .channel(`moderation:${authUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, (payload) => {
        if (!isCurrent) return;
        handleRealtimeReportChangeRef.current(payload as unknown as RealtimeChangePayload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_restrictions' }, (payload) => {
        if (!isCurrent) return;
        handleRealtimeRestrictionChangeRef.current(payload as unknown as RealtimeChangePayload);
      })
      .subscribe((status) => {
        if (!isCurrent) return;

        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('error');
        } else if (status === 'CLOSED') {
          setRealtimeStatus((current) => (current === 'error' ? current : 'closed'));
        }
      });

    return () => {
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [authUserId, isModerator, realtimeReconnectToken]);

  // --- Web/native foreground refresh: one AppState listener (react-native-web maps this to
  // document.visibilitychange), no polling, no setInterval. Re-checks moderator status defensively
  // (role could have been revoked/granted while backgrounded) and, only if still a moderator,
  // refreshes the queue and active-restrictions list once. ---
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = /inactive|background/.test(appStateRef.current) && nextState === 'active';
      appStateRef.current = nextState;

      if (!cameToForeground || !authUserId) {
        return;
      }

      refreshModeratorStatus();

      if (isModerator) {
        if (realtimeStatus !== 'subscribed') {
          setRealtimeReconnectToken((token) => token + 1);
        }

        refreshModerationReports();
        refreshActiveRestrictions();
      }
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, isModerator]);

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
      fetchModerationReportById,
      isModerationActionSubmitting,
      moderationActionError,
      applyReportAction,
      hideReportedContent,
      warnReportedUser,
      hideAndWarn,
      restoreRestrictedContent,
      getRestrictionForReport,
      getModerationTargetPreview,
      activeRestrictions,
      isActiveRestrictionsLoading,
      activeRestrictionsError,
      refreshActiveRestrictions,
      moderationRealtimeStatus: realtimeStatus,
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
      isModerationActionSubmitting,
      moderationActionError,
      activeRestrictions,
      isActiveRestrictionsLoading,
      activeRestrictionsError,
      realtimeStatus,
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
