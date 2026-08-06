import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useModeration } from '@/context/moderation-context';
import { REPORT_REASONS, REPORT_TARGET_TYPE_LABELS, type Report } from '@/data/reports';
import { useResolvedReportTarget } from '@/hooks/use-resolved-report-target';
import { mapSupabaseProfileRow, type SupabaseProfileRow } from '@/lib/map-supabase-profile';
import { supabase } from '@/lib/supabase';

const PROFILE_NAME_SELECT_COLUMNS = 'id, display_name, club, location, bio, avatar_url, created_at, updated_at';
const NOTE_MAX_LENGTH = 2000;

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Offen',
  reviewed: 'Geprüft',
  dismissed: 'Verworfen',
  action_taken: 'Aktion durchgeführt',
};

// A stable, harmless placeholder so useResolvedReportTarget (which expects a Report, not
// Report | undefined) can always be called unconditionally — Rules of Hooks. Its empty targetId
// simply resolves to "not found" until the real report has loaded.
const EMPTY_REPORT: Report = {
  id: '',
  reporterId: '',
  targetType: 'post',
  targetId: '',
  reason: REPORT_REASONS[0],
  createdAt: '',
  status: 'submitted',
};

type ResolvedUserTarget = { exists: boolean; displayName?: string; userId?: string };

export default function ModerationReportDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const {
    isModerator,
    isModeratorStatusLoading,
    getModerationReportById,
    isModerationReportsLoading,
    refreshModerationReports,
    reviewReport,
    dismissReport,
  } = useModeration();

  const report = params.id ? getModerationReportById(params.id) : undefined;
  const resolvedContentTarget = useResolvedReportTarget(report ?? EMPTY_REPORT);
  const [resolvedUserTarget, setResolvedUserTarget] = useState<ResolvedUserTarget | null>(null);

  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [confirmingAction, setConfirmingAction] = useState<'reviewed' | 'dismissed' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!report && !isModerationReportsLoading) {
      refreshModerationReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);

  const idsToResolveKey = report
    ? Array.from(new Set([report.reporterId, report.targetOwnerId, report.reviewedBy].filter((id): id is string => Boolean(id) && !profileNames[id!])))
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

  useEffect(() => {
    if (!report || report.targetType !== 'user') {
      setResolvedUserTarget(null);
      return;
    }

    let isCurrent = true;

    supabase
      .from('profiles')
      .select(PROFILE_NAME_SELECT_COLUMNS)
      .eq('id', report.targetId)
      .maybeSingle()
      .then(({ data }) => {
        if (!isCurrent) return;

        if (!data) {
          setResolvedUserTarget({ exists: false });
          return;
        }

        const mapped = mapSupabaseProfileRow(data as SupabaseProfileRow);
        setResolvedUserTarget({ exists: true, displayName: mapped.displayName, userId: mapped.id });
      });

    return () => {
      isCurrent = false;
    };
    // Deliberately narrow: only the target identity should re-trigger this fetch, not every
    // field change on `report` (e.g. status/resolutionNote updating after a review decision).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.targetType, report?.targetId]);

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
    if (isModerationReportsLoading) {
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
    report.targetType === 'user'
      ? resolvedUserTarget
        ? resolvedUserTarget.exists
          ? resolvedUserTarget.displayName
          : null
        : undefined
      : resolvedContentTarget.exists
        ? resolvedContentTarget.previewText || '—'
        : null;

  const targetRoute = report.targetType === 'user' ? undefined : resolvedContentTarget.route;

  const handleOpenTarget = () => {
    if (report.targetType === 'user' && resolvedUserTarget?.exists && resolvedUserTarget.userId) {
      router.push({ pathname: '/profile/[id]', params: { id: resolvedUserTarget.userId } });
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

  const canOpenTarget = report.targetType === 'user' ? Boolean(resolvedUserTarget?.exists) : Boolean(targetRoute);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Pressable style={styles.flexOne} onPress={() => Keyboard.dismiss()}>
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
});
