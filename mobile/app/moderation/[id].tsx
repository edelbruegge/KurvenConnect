import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useModeration, type ReportActionType } from '@/context/moderation-context';
import { REPORT_TARGET_TYPE_LABELS } from '@/data/reports';
import { useResolvedReportTarget } from '@/hooks/use-resolved-report-target';
import { dismissKeyboardOnNative } from '@/lib/dismiss-keyboard';
import type { ContentRestriction } from '@/lib/map-supabase-content-restriction';
import { MODERATION_ACTION_LABELS, mapSupabaseModerationActionRow, type ModerationActionLogEntry, type SupabaseModerationActionRow } from '@/lib/map-supabase-moderation';
import { getAllowedModerationActions } from '@/lib/moderation-action-matrix';
import { supabase } from '@/lib/supabase';

const NOTE_MAX_LENGTH = 2000;
const WARNING_MESSAGE_MAX_LENGTH = 1000;
const DEFAULT_WARNING_TITLE = 'Hinweis zu deinem Verhalten';
const DEFAULT_WARNING_MESSAGE =
  'Ein von dir veröffentlichter Inhalt verstößt möglicherweise gegen unsere Community-Regeln. Bitte beachte unsere Regeln bei zukünftigen Beiträgen.';

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Offen',
  reviewed: 'Geprüft',
  dismissed: 'Verworfen',
  action_taken: 'Bearbeitet',
};

const MODERATION_ACTION_CONFIRM_TEXT: Record<ReportActionType, string> = {
  hide_content: 'Dieser Inhalt wird für alle normalen Nutzer ausgeblendet. Möchtest du fortfahren?',
  warn_user: 'Der Nutzer erhält eine Verwarnung in seinem Konto. Möchtest du fortfahren?',
  hide_and_warn: 'Der Inhalt wird ausgeblendet und der Nutzer erhält eine Verwarnung.',
};

const MODERATION_ACTION_BUTTON_LABEL: Record<ReportActionType, string> = {
  hide_content: 'Inhalt global ausblenden',
  warn_user: 'Nutzer verwarnen',
  hide_and_warn: 'Ausblenden und verwarnen',
};

export default function ModerationReportDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const {
    isModerator,
    isModeratorStatusLoading,
    getModerationReportById,
    fetchModerationReportById,
    reviewReport,
    dismissReport,
    isModerationActionSubmitting,
    moderationActionError,
    applyReportAction,
    restoreRestrictedContent,
    getRestrictionForReport,
    getModerationTargetPreview,
  } = useModeration();

  const report = params.id ? getModerationReportById(params.id) : undefined;
  // useResolvedReportTarget is only used for a best-effort in-app deep link ("Ziel aufrufen") —
  // it depends on the target already being present in this client's own locally loaded
  // FeedPostsContext state, which a moderator's account will not always have (e.g. content that
  // was never in their own feed, or that is globally restricted). The actual preview shown below
  // comes from the live, moderator-only getModerationTargetPreview() RPC instead, which works
  // regardless of local cache state and regardless of restriction.
  const resolvedContentTarget = useResolvedReportTarget(
    report ?? { id: '', reporterId: '', targetType: 'post', targetId: '', reason: 'Sonstiges', createdAt: '', status: 'submitted' },
  );

  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [confirmingAction, setConfirmingAction] = useState<'reviewed' | 'dismissed' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // --- Controlled moderation actions (hide/warn/hide+warn) ---
  const [pendingModerationAction, setPendingModerationAction] = useState<ReportActionType | null>(null);
  const [moderationActionNote, setModerationActionNote] = useState('');
  const [warningMessage, setWarningMessage] = useState(DEFAULT_WARNING_MESSAGE);
  const [confirmingModerationAction, setConfirmingModerationAction] = useState(false);

  // --- Restriction status (only relevant once the report has actually been actioned) ---
  const [restriction, setRestriction] = useState<ContentRestriction | null | undefined>(undefined);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // --- Live target preview (replaces the old FeedPostsContext/profiles-only lookup) ---
  const [targetPreview, setTargetPreview] = useState<
    { exists: boolean; previewText?: string; ownerId?: string; displayName?: string } | undefined
  >(undefined);

  // --- Audit history (moderation_actions for this report, chronological) ---
  const [actionHistory, setActionHistory] = useState<ModerationActionLogEntry[]>([]);
  const [isActionHistoryLoading, setIsActionHistoryLoading] = useState(false);

  // --- Fallback: the report isn't (yet) in this context's cache — load it directly by id,
  // independent of whatever filter/list was last fetched. This is what makes a direct/deep link
  // to an already-reviewed/dismissed/actioned report work. ---
  const [isFetchingReportById, setIsFetchingReportById] = useState(false);
  const [reportFetchFailed, setReportFetchFailed] = useState(false);

  useEffect(() => {
    if (report || !params.id || reportFetchFailed || !isModerator) {
      return;
    }

    let isCurrent = true;
    setIsFetchingReportById(true);

    fetchModerationReportById(params.id).then((result) => {
      if (!isCurrent) return;
      setIsFetchingReportById(false);
      if (!result) {
        setReportFetchFailed(true);
      }
    });

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, report?.id, isModerator]);

  useEffect(() => {
    if (!report) {
      setTargetPreview(undefined);
      return;
    }

    let isCurrent = true;

    getModerationTargetPreview(report.targetType, report.targetId).then((result) => {
      if (!isCurrent) return;
      setTargetPreview(result);
    });

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.targetType, report?.targetId]);

  useEffect(() => {
    if (!report) {
      setActionHistory([]);
      return;
    }

    let isCurrent = true;
    setIsActionHistoryLoading(true);

    supabase
      .from('moderation_actions')
      .select('id, report_id, moderator_id, action, note, created_at')
      .eq('report_id', report.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setActionHistory([]);
          setIsActionHistoryLoading(false);
          return;
        }

        setActionHistory(((data ?? []) as SupabaseModerationActionRow[]).map(mapSupabaseModerationActionRow));
        setIsActionHistoryLoading(false);
      });

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);

  const idsToResolveKey = report
    ? Array.from(
        new Set(
          [report.reporterId, report.targetOwnerId, report.reviewedBy, restriction?.createdBy, ...actionHistory.map((entry) => entry.moderatorId)].filter(
            (id): id is string => Boolean(id) && !profileNames[id!],
          ),
        ),
      )
        .sort()
        .join(',')
    : '';

  useEffect(() => {
    const ids = idsToResolveKey ? idsToResolveKey.split(',') : [];

    if (ids.length === 0) {
      return;
    }

    let isCurrent = true;

    supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids)
      .then(({ data }) => {
        if (!isCurrent) return;

        const map: Record<string, string> = {};
        ((data ?? []) as { id: string; display_name: string | null }[]).forEach((row) => {
          map[row.id] = row.display_name?.trim() || 'Neues Mitglied';
        });
        setProfileNames((current) => ({ ...current, ...map }));
      });

    return () => {
      isCurrent = false;
    };
  }, [idsToResolveKey]);

  // Only content reports (never 'user') can ever have a restriction row, and only once a
  // moderation action was actually taken — no point querying otherwise.
  useEffect(() => {
    if (!report || report.status !== 'action_taken' || report.targetType === 'user') {
      setRestriction(undefined);
      return;
    }

    let isCurrent = true;

    getRestrictionForReport(report.id).then((result) => {
      if (!isCurrent) return;
      setRestriction(result);
    });

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, report?.status, report?.targetType]);

  if (isModeratorStatusLoading) {
    return (
      <SafeAreaView style={styles.loadingSafeArea}>
        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color={FeedColors.textPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isModerator) {
    return <NotFoundView title="Kein Zugriff" message="Du bist nicht berechtigt, diesen Bereich zu öffnen." />;
  }

  if (!report) {
    if (isFetchingReportById) {
      return (
        <SafeAreaView style={styles.loadingSafeArea}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={FeedColors.textPrimary} />
          </View>
        </SafeAreaView>
      );
    }

    return <NotFoundView title="Meldung nicht gefunden" message="Diese Meldung ist nicht mehr verfügbar." />;
  }

  const isDecided = report.status !== 'submitted';
  const reporterName = profileNames[report.reporterId] ?? 'Unbekanntes Mitglied';
  const targetOwnerName = report.targetOwnerId ? (profileNames[report.targetOwnerId] ?? 'Unbekanntes Mitglied') : 'Unbekanntes Mitglied';
  const reviewedByName = report.reviewedBy ? (profileNames[report.reviewedBy] ?? 'Unbekanntes Mitglied') : null;

  const previewText =
    targetPreview === undefined ? undefined : targetPreview.exists ? targetPreview.previewText || targetPreview.displayName || '—' : null;

  // Best-effort in-app route: only available when the moderator's own client already happens to
  // have this content loaded locally. Always falls back gracefully (button simply doesn't show)
  // when it doesn't — the preview text above is authoritative either way.
  const targetRoute = report.targetType === 'user' ? undefined : resolvedContentTarget.route;

  const handleOpenTarget = () => {
    if (report.targetType === 'user' && targetPreview?.exists) {
      router.push({ pathname: '/profile/[id]', params: { id: report.targetId } });
      return;
    }

    if (targetRoute) {
      router.push(targetRoute);
    }
  };

  const handleConfirmAction = async (action: 'reviewed' | 'dismissed') => {
    setConfirmingAction(null);

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    const trimmedNote = note.trim().slice(0, NOTE_MAX_LENGTH);
    const { error } = action === 'reviewed' ? await reviewReport(report.id, trimmedNote) : await dismissReport(report.id, trimmedNote);
    setIsSubmitting(false);

    if (error) {
      setActionError(error);
    }
  };

  const canOpenTarget = report.targetType === 'user' ? Boolean(targetPreview?.exists) : Boolean(targetRoute);

  const canStillAct = report.status === 'submitted' || report.status === 'reviewed';
  const allowedActions = getAllowedModerationActions(report.targetType);

  const handleOpenModerationAction = (action: ReportActionType) => {
    setConfirmingAction(null);
    setPendingModerationAction(action);
    setConfirmingModerationAction(false);
    setModerationActionNote('');
    setWarningMessage(DEFAULT_WARNING_MESSAGE);
  };

  const handleCancelModerationAction = () => {
    setPendingModerationAction(null);
    setConfirmingModerationAction(false);
  };

  const handleConfirmModerationAction = async () => {
    if (!pendingModerationAction || isModerationActionSubmitting) {
      return;
    }

    const trimmedNote = moderationActionNote.trim().slice(0, NOTE_MAX_LENGTH);
    const trimmedWarningMessage = warningMessage.trim().slice(0, WARNING_MESSAGE_MAX_LENGTH);

    const { error } = await applyReportAction(report.id, pendingModerationAction, {
      note: trimmedNote,
      warningMessage: trimmedWarningMessage,
    });

    if (!error) {
      setPendingModerationAction(null);
      setConfirmingModerationAction(false);
    } else {
      setConfirmingModerationAction(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restriction || isModerationActionSubmitting) {
      return;
    }

    setRestoreError(null);
    const { error } = await restoreRestrictedContent(restriction.id);
    setConfirmingRestore(false);

    if (error) {
      setRestoreError(error);
      return;
    }

    const refreshed = await getRestrictionForReport(report.id);
    setRestriction(refreshed);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Pressable style={styles.flexOne} onPress={dismissKeyboardOnNative}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.badgeRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{REPORT_TARGET_TYPE_LABELS[report.targetType]}</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{STATUS_LABELS[report.status] ?? report.status}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Meldegrund</Text>
          <Text style={styles.sectionValue}>{report.reason}</Text>

          {report.details ? (
            <>
              <Text style={styles.sectionLabel}>Details</Text>
              <Text style={styles.sectionValue}>{report.details}</Text>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Zeitpunkt</Text>
          <Text style={styles.sectionValue}>{report.createdAt}</Text>

          <Text style={styles.sectionLabel}>Meldender Nutzer</Text>
          <Text style={styles.sectionValue}>{reporterName}</Text>

          <Text style={styles.sectionLabel}>Zielbesitzer</Text>
          <Text style={styles.sectionValue}>{targetOwnerName}</Text>

          <Text style={styles.sectionLabel}>Gemeldetes Ziel</Text>
          <Text style={styles.sectionValue}>
            {previewText === null ? 'Der gemeldete Inhalt ist nicht mehr verfügbar.' : previewText === undefined ? 'Wird geladen …' : previewText}
          </Text>
          {canOpenTarget ? (
            <Pressable onPress={handleOpenTarget} style={styles.actionButton} accessibilityRole="button" accessibilityLabel="Ziel aufrufen">
              <Text style={styles.actionButtonText}>Ziel aufrufen</Text>
            </Pressable>
          ) : null}

          {isDecided ? (
            <View style={styles.decidedBlock}>
              <Text style={styles.sectionLabel}>Moderator</Text>
              <Text style={styles.sectionValue}>{reviewedByName ?? 'Unbekanntes Mitglied'}</Text>
              <Text style={styles.sectionLabel}>Geprüft am</Text>
              <Text style={styles.sectionValue}>{report.reviewedAt ?? '—'}</Text>
              {report.resolutionNote ? (
                <>
                  <Text style={styles.sectionLabel}>Interne Notiz</Text>
                  <Text style={styles.sectionValue}>{report.resolutionNote}</Text>
                </>
              ) : null}
            </View>
          ) : (
            <View style={styles.decisionBlock}>
              <Text style={styles.sectionLabel}>Interne Notiz (optional)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Nur für Moderatoren sichtbar"
                placeholderTextColor={FeedColors.textSecondary}
                style={styles.noteInput}
                multiline
                maxLength={NOTE_MAX_LENGTH}
              />

              {actionError ? <Text style={styles.actionErrorText}>{actionError}</Text> : null}

              {confirmingAction ? (
                <View style={styles.confirmBlock}>
                  <Text style={styles.confirmText}>
                    {confirmingAction === 'reviewed'
                      ? 'Möchtest du diese Meldung als geprüft markieren?'
                      : 'Möchtest du diese Meldung verwerfen?'}
                  </Text>
                  <View style={styles.confirmActions}>
                    <Pressable
                      onPress={() => void handleConfirmAction(confirmingAction)}
                      disabled={isSubmitting}
                      style={[styles.confirmButton, isSubmitting && styles.actionButtonDisabled]}
                      accessibilityRole="button"
                      accessibilityLabel="Bestätigen"
                    >
                      <Text style={styles.confirmButtonText}>{isSubmitting ? 'Wird gespeichert …' : 'Bestätigen'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setConfirmingAction(null)}
                      disabled={isSubmitting}
                      style={[styles.cancelButton, isSubmitting && styles.actionButtonDisabled]}
                      accessibilityRole="button"
                      accessibilityLabel="Abbrechen"
                    >
                      <Text style={styles.cancelButtonText}>Abbrechen</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.decisionActions}>
                  <Pressable
                    onPress={() => setConfirmingAction('reviewed')}
                    disabled={isSubmitting}
                    style={[styles.reviewButton, isSubmitting && styles.actionButtonDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="Als geprüft markieren"
                  >
                    <IconSymbol size={16} name="checkmark.circle.fill" color={ClubColors.secondary} />
                    <Text style={styles.reviewButtonText}>Als geprüft markieren</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmingAction('dismissed')}
                    disabled={isSubmitting}
                    style={[styles.dismissButton, isSubmitting && styles.actionButtonDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="Meldung verwerfen"
                  >
                    <Text style={styles.dismissButtonText}>Meldung verwerfen</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {canStillAct && allowedActions.length > 0 ? (
            <View style={styles.moderationActionsBlock}>
              <Text style={styles.sectionLabel}>Moderationsmaßnahme</Text>

              {moderationActionError ? <Text style={styles.actionErrorText}>{moderationActionError}</Text> : null}

              {pendingModerationAction ? (
                <View style={styles.confirmBlock}>
                  {pendingModerationAction === 'hide_content' ? (
                    <>
                      <Text style={styles.sectionLabel}>Grund (optional, nur für Moderatoren)</Text>
                      <TextInput
                        value={moderationActionNote}
                        onChangeText={setModerationActionNote}
                        placeholder="Nur für Moderatoren sichtbar"
                        placeholderTextColor={FeedColors.textSecondary}
                        style={styles.noteInput}
                        multiline
                        maxLength={NOTE_MAX_LENGTH}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.sectionLabel}>Titel</Text>
                      <Text style={styles.sectionValue}>{DEFAULT_WARNING_TITLE}</Text>

                      <Text style={styles.sectionLabel}>Nachricht an den Nutzer</Text>
                      <TextInput
                        value={warningMessage}
                        onChangeText={setWarningMessage}
                        placeholder="Nachricht an den Nutzer"
                        placeholderTextColor={FeedColors.textSecondary}
                        style={styles.noteInput}
                        multiline
                        maxLength={WARNING_MESSAGE_MAX_LENGTH}
                      />

                      <Text style={styles.sectionLabel}>Interne Notiz (optional, nur für Moderatoren)</Text>
                      <TextInput
                        value={moderationActionNote}
                        onChangeText={setModerationActionNote}
                        placeholder="Nur für Moderatoren sichtbar"
                        placeholderTextColor={FeedColors.textSecondary}
                        style={styles.noteInput}
                        multiline
                        maxLength={NOTE_MAX_LENGTH}
                      />

                      <Text style={styles.sectionLabel}>Vorschau für den Nutzer</Text>
                      <View style={styles.previewCard}>
                        <Text style={styles.previewTitle}>{DEFAULT_WARNING_TITLE}</Text>
                        <Text style={styles.previewMessage}>{warningMessage.trim() || DEFAULT_WARNING_MESSAGE}</Text>
                      </View>
                    </>
                  )}

                  {confirmingModerationAction ? (
                    <>
                      <Text style={styles.confirmText}>{MODERATION_ACTION_CONFIRM_TEXT[pendingModerationAction]}</Text>
                      <View style={styles.confirmActions}>
                        <Pressable
                          onPress={() => void handleConfirmModerationAction()}
                          disabled={isModerationActionSubmitting}
                          style={[styles.confirmButton, isModerationActionSubmitting && styles.actionButtonDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel="Bestätigen"
                        >
                          <Text style={styles.confirmButtonText}>{isModerationActionSubmitting ? 'Wird gespeichert …' : 'Bestätigen'}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setConfirmingModerationAction(false)}
                          disabled={isModerationActionSubmitting}
                          style={[styles.cancelButton, isModerationActionSubmitting && styles.actionButtonDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel="Abbrechen"
                        >
                          <Text style={styles.cancelButtonText}>Abbrechen</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <View style={styles.confirmActions}>
                      <Pressable
                        onPress={() => setConfirmingModerationAction(true)}
                        style={styles.confirmButton}
                        accessibilityRole="button"
                        accessibilityLabel="Weiter"
                      >
                        <Text style={styles.confirmButtonText}>Weiter</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleCancelModerationAction}
                        style={styles.cancelButton}
                        accessibilityRole="button"
                        accessibilityLabel="Abbrechen"
                      >
                        <Text style={styles.cancelButtonText}>Abbrechen</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.decisionActions}>
                  {allowedActions.map((action) => (
                    <Pressable
                      key={action}
                      onPress={() => handleOpenModerationAction(action)}
                      style={styles.moderationActionButton}
                      accessibilityRole="button"
                      accessibilityLabel={MODERATION_ACTION_BUTTON_LABEL[action]}
                    >
                      <Text style={styles.moderationActionButtonText}>{MODERATION_ACTION_BUTTON_LABEL[action]}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {report.status === 'action_taken' && report.targetType !== 'user' ? (
            <View style={styles.restrictionBlock}>
              <Text style={styles.sectionLabel}>Inhaltsstatus</Text>
              {restriction === undefined ? (
                <Text style={styles.sectionValue}>Wird geladen …</Text>
              ) : restriction === null ? (
                <Text style={styles.sectionValue}>Für diese Meldung wurde keine Ausblendung vorgenommen.</Text>
              ) : restriction.isActive ? (
                <>
                  <Text style={styles.sectionValue}>Global ausgeblendet</Text>
                  <Text style={styles.sectionLabel}>Ausgeblendet am</Text>
                  <Text style={styles.sectionValue}>{restriction.createdAt}</Text>
                  <Text style={styles.sectionLabel}>Ausgeblendet von</Text>
                  <Text style={styles.sectionValue}>{profileNames[restriction.createdBy] ?? 'Unbekanntes Mitglied'}</Text>

                  {restoreError ? <Text style={styles.actionErrorText}>{restoreError}</Text> : null}

                  {confirmingRestore ? (
                    <View style={styles.confirmBlock}>
                      <Text style={styles.confirmText}>Möchtest du diesen Inhalt wiederherstellen?</Text>
                      <View style={styles.confirmActions}>
                        <Pressable
                          onPress={() => void handleConfirmRestore()}
                          disabled={isModerationActionSubmitting}
                          style={[styles.confirmButton, isModerationActionSubmitting && styles.actionButtonDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel="Bestätigen"
                        >
                          <Text style={styles.confirmButtonText}>
                            {isModerationActionSubmitting ? 'Wird gespeichert …' : 'Bestätigen'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setConfirmingRestore(false)}
                          disabled={isModerationActionSubmitting}
                          style={[styles.cancelButton, isModerationActionSubmitting && styles.actionButtonDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel="Abbrechen"
                        >
                          <Text style={styles.cancelButtonText}>Abbrechen</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setConfirmingRestore(true)}
                      style={styles.actionButton}
                      accessibilityRole="button"
                      accessibilityLabel="Inhalt wiederherstellen"
                    >
                      <Text style={styles.actionButtonText}>Inhalt wiederherstellen</Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.sectionValue}>Wiederhergestellt</Text>
                  <Text style={styles.sectionLabel}>Wiederhergestellt am</Text>
                  <Text style={styles.sectionValue}>{restriction.liftedAt ?? '—'}</Text>
                </>
              )}
            </View>
          ) : null}

          {actionHistory.length > 0 || isActionHistoryLoading ? (
            <View style={styles.historyBlock}>
              <Text style={styles.sectionLabel}>Verlauf</Text>
              {isActionHistoryLoading && actionHistory.length === 0 ? (
                <Text style={styles.sectionValue}>Wird geladen …</Text>
              ) : (
                actionHistory.map((entry) => (
                  <View key={entry.id} style={styles.historyEntry}>
                    <Text style={styles.historyAction}>{MODERATION_ACTION_LABELS[entry.action] ?? entry.action}</Text>
                    <Text style={styles.historyMeta}>
                      {entry.createdAt} · {profileNames[entry.moderatorId] ?? 'Unbekannter Moderator'}
                    </Text>
                    {entry.note ? <Text style={styles.historyNote}>{entry.note}</Text> : null}
                  </View>
                ))
              )}
            </View>
          ) : null}
        </ScrollView>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  flexOne: {
    flex: 1,
  },
  loadingSafeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  typeBadge: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: ClubColors.text,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  sectionLabel: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  sectionValue: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    marginTop: 2,
  },
  actionButton: {
    marginTop: Spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
    backgroundColor: ClubColors.surface,
  },
  actionButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  decidedBlock: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  decisionBlock: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    color: FeedColors.textPrimary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 72,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  actionErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
  },
  decisionActions: {
    gap: Spacing.sm,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 44,
    borderRadius: Radii.round,
    backgroundColor: ClubColors.primary,
  },
  reviewButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  dismissButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  dismissButtonText: {
    color: StatusColors.error,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  confirmBlock: {
    gap: Spacing.sm,
  },
  confirmText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  confirmButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: ClubColors.primary,
  },
  confirmButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  cancelButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  moderationActionsBlock: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  moderationActionButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
    backgroundColor: ClubColors.surface,
  },
  moderationActionButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  previewCard: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    backgroundColor: FeedColors.cardBackground,
  },
  previewTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: 4,
  },
  previewMessage: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
  },
  restrictionBlock: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  historyBlock: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  historyEntry: {
    marginTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: FeedColors.cardBorder,
  },
  historyAction: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  historyMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    marginTop: 2,
  },
  historyNote: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
  },
});
