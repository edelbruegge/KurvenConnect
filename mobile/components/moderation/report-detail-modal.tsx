import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import { useReports } from '@/context/reports-context';
import { REPORT_STATUS_LABELS, REPORT_TARGET_TYPE_LABELS, type Report } from '@/data/reports';
import { CURRENT_USER_ID } from '@/data/users';
import { useResolvedReportTarget } from '@/hooks/use-resolved-report-target';

type ReportDetailModalProps = {
  report: Report;
  onClose: () => void;
};

export function ReportDetailModal({ report, onClose }: ReportDetailModalProps) {
  const router = useRouter();
  const { getUserById } = useProfiles();
  const { resolveReport } = useReports();
  const {
    isContentModerationHidden,
    hideContentByModeration,
    restoreContentModeration,
    isUserSuspended,
    suspendUser,
    restoreUser,
  } = useModeration();
  const target = useResolvedReportTarget(report);
  const [showDismissField, setShowDismissField] = useState(false);
  const [dismissNote, setDismissNote] = useState('');

  const reporter = getUserById(report.reporterId);
  const targetUser = target.targetUserId ? getUserById(target.targetUserId) : undefined;
  const contentHidden = report.targetType !== 'user' && target.exists && isContentModerationHidden(report.targetType, report.targetId);
  const userSuspended = target.targetUserId ? isUserSuspended(target.targetUserId) : false;
  const canSuspendUser = Boolean(target.targetUserId) && target.targetUserId !== CURRENT_USER_ID;

  const handleOpenTarget = () => {
    if (!target.route) {
      return;
    }

    onClose();
    router.push(target.route);
  };

  const handleMarkReviewed = () => resolveReport(report.id, 'reviewed');

  const handleConfirmDismiss = () => {
    resolveReport(report.id, 'dismissed', { resolutionNote: dismissNote });
    setShowDismissField(false);
    setDismissNote('');
  };

  const handleHideContent = () => {
    hideContentByModeration(report.targetType, report.targetId);
    resolveReport(report.id, 'action_taken', { moderationAction: 'hide_content' });
  };

  const handleRestoreContent = () => restoreContentModeration(report.targetType, report.targetId);

  const handleSuspendUser = () => {
    if (!target.targetUserId) {
      return;
    }

    suspendUser(target.targetUserId);
    resolveReport(report.id, 'action_taken', { moderationAction: 'suspend_user' });
  };

  const handleRestoreUser = () => {
    if (target.targetUserId) {
      restoreUser(target.targetUserId);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Meldungsdetail</Text>

            <View style={styles.badgeRow}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{REPORT_TARGET_TYPE_LABELS[report.targetType]}</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{REPORT_STATUS_LABELS[report.status]}</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Meldegrund</Text>
            <Text style={styles.sectionValue}>{report.reason}</Text>

            {report.details ? (
              <>
                <Text style={styles.sectionLabel}>Beschreibung</Text>
                <Text style={styles.sectionValue}>{report.details}</Text>
              </>
            ) : null}

            <Text style={styles.sectionLabel}>Gemeldet von</Text>
            <Text style={styles.sectionValue}>{reporter?.displayName ?? 'Unbekannter Nutzer'}</Text>

            <Text style={styles.sectionLabel}>Gemeldetes Ziel</Text>
            <Text style={styles.sectionValue}>
              {target.exists ? target.previewText || '—' : 'Der gemeldete Inhalt ist nicht mehr verfügbar.'}
            </Text>

            {targetUser ? (
              <>
                <Text style={styles.sectionLabel}>Betroffener Nutzer</Text>
                <Text style={styles.sectionValue}>{targetUser.displayName}</Text>
              </>
            ) : null}

            <Text style={styles.sectionLabel}>Zeitpunkt</Text>
            <Text style={styles.sectionValue}>
              {report.createdAt}
              {report.reviewedAt ? ` · geprüft ${report.reviewedAt}` : ''}
            </Text>

            {report.resolutionNote ? (
              <>
                <Text style={styles.sectionLabel}>Interne Begründung</Text>
                <Text style={styles.sectionValue}>{report.resolutionNote}</Text>
              </>
            ) : null}

            <View style={styles.noticeBox}>
              <IconSymbol size={16} name="shield.fill" color={FeedColors.textSecondary} />
              <Text style={styles.noticeText}>
                Lokale Moderations-Demo. Diese Aktion wird nur im aktuellen lokalen App-Zustand gespeichert.
              </Text>
            </View>

            {target.route ? (
              <Pressable onPress={handleOpenTarget} style={styles.actionButton} accessibilityRole="button" accessibilityLabel="Ziel aufrufen">
                <Text style={styles.actionButtonText}>Ziel aufrufen</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleMarkReviewed}
              disabled={report.status === 'reviewed'}
              style={[styles.actionButton, report.status === 'reviewed' && styles.actionButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Als geprüft markieren"
            >
              <Text style={styles.actionButtonText}>Als geprüft markieren</Text>
            </Pressable>

            {showDismissField ? (
              <View style={styles.dismissField}>
                <TextInput
                  value={dismissNote}
                  onChangeText={setDismissNote}
                  placeholder="Interne Begründung (optional)"
                  placeholderTextColor={FeedColors.textSecondary}
                  style={styles.dismissInput}
                  multiline
                />
                <Pressable
                  onPress={handleConfirmDismiss}
                  style={styles.actionButton}
                  accessibilityRole="button"
                  accessibilityLabel="Zurückweisen bestätigen"
                >
                  <Text style={styles.actionButtonText}>Zurückweisen bestätigen</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowDismissField(true)}
                disabled={report.status === 'dismissed'}
                style={[styles.actionButton, report.status === 'dismissed' && styles.actionButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Meldung zurückweisen"
              >
                <Text style={styles.actionButtonText}>Meldung zurückweisen</Text>
              </Pressable>
            )}

            {report.targetType !== 'user' && target.exists ? (
              contentHidden ? (
                <Pressable
                  onPress={handleRestoreContent}
                  style={[styles.actionButton, styles.restoreButton]}
                  accessibilityRole="button"
                  accessibilityLabel="Inhalt wiederherstellen"
                >
                  <Text style={styles.restoreButtonText}>Inhalt wiederherstellen</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleHideContent}
                  style={[styles.actionButton, styles.destructiveButton]}
                  accessibilityRole="button"
                  accessibilityLabel="Inhalt lokal ausblenden"
                >
                  <Text style={styles.destructiveButtonText}>Inhalt lokal ausblenden</Text>
                </Pressable>
              )
            ) : null}

            {canSuspendUser ? (
              userSuspended ? (
                <Pressable
                  onPress={handleRestoreUser}
                  style={[styles.actionButton, styles.restoreButton]}
                  accessibilityRole="button"
                  accessibilityLabel="Nutzersperre aufheben"
                >
                  <Text style={styles.restoreButtonText}>Nutzersperre aufheben</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleSuspendUser}
                  style={[styles.actionButton, styles.destructiveButton]}
                  accessibilityRole="button"
                  accessibilityLabel="Nutzer lokal sperren"
                >
                  <Text style={styles.destructiveButtonText}>Nutzer lokal sperren</Text>
                </Pressable>
              )
            ) : null}

            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Schließen">
              <Text style={styles.closeButtonText}>Schließen</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    maxHeight: '85%',
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginBottom: Spacing.sm,
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
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  noticeText: {
    flex: 1,
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
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
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  destructiveButton: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  destructiveButtonText: {
    color: StatusColors.error,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  restoreButton: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  restoreButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  dismissField: {
    marginTop: Spacing.sm,
  },
  dismissInput: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    color: FeedColors.textPrimary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 56,
    marginBottom: Spacing.xs,
  },
  closeButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  closeButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
