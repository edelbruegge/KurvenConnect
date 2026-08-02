import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useProfiles } from '@/context/profile-context';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { REPORT_STATUS_LABELS, REPORT_TARGET_TYPE_LABELS, type Report, type ReportStatus } from '@/data/reports';
import { useResolvedReportTarget } from '@/hooks/use-resolved-report-target';

type ReportCardProps = {
  report: Report;
  onPressDetails: () => void;
};

const STATUS_STYLES: Record<ReportStatus, { badge: object; text: object }> = {
  submitted: { badge: { backgroundColor: ClubColors.surface, borderColor: ClubColors.border }, text: { color: ClubColors.text } },
  reviewed: {
    badge: { backgroundColor: FeedColors.imagePlaceholder, borderColor: FeedColors.cardBorder },
    text: { color: FeedColors.textSecondary },
  },
  dismissed: {
    badge: { backgroundColor: 'transparent', borderColor: FeedColors.cardBorder },
    text: { color: FeedColors.textSecondary },
  },
  action_taken: {
    badge: { backgroundColor: FeedColors.imagePlaceholder, borderColor: FeedColors.cardBorder },
    text: { color: FeedColors.textSecondary },
  },
};

export function ReportCard({ report, onPressDetails }: ReportCardProps) {
  const { getUserById } = useProfiles();
  const target = useResolvedReportTarget(report);

  const reporter = getUserById(report.reporterId);
  const targetUser = target.targetUserId ? getUserById(target.targetUserId) : undefined;
  const statusStyle = STATUS_STYLES[report.status];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{REPORT_TARGET_TYPE_LABELS[report.targetType]}</Text>
        </View>
        <View style={[styles.statusBadge, statusStyle.badge]}>
          <Text style={[styles.statusBadgeText, statusStyle.text]}>{REPORT_STATUS_LABELS[report.status]}</Text>
        </View>
      </View>

      <Text style={styles.reason}>{report.reason}</Text>
      {report.details ? (
        <Text style={styles.details} numberOfLines={2}>
          {report.details}
        </Text>
      ) : null}

      <Text style={styles.meta}>Gemeldet von {reporter?.displayName ?? 'Unbekannter Nutzer'}</Text>
      {targetUser ? <Text style={styles.meta}>Betroffener Nutzer: {targetUser.displayName}</Text> : null}
      <Text style={styles.meta}>{report.createdAt}</Text>

      <Pressable
        onPress={onPressDetails}
        style={styles.detailsButton}
        accessibilityRole="button"
        accessibilityLabel={`Details zu Meldung prüfen: ${REPORT_TARGET_TYPE_LABELS[report.targetType]}`}
      >
        <Text style={styles.detailsButtonText}>Details prüfen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
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
    borderWidth: 1,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  reason: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  details: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.xs,
  },
  meta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  detailsButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: ClubColors.border,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minHeight: 40,
    justifyContent: 'center',
  },
  detailsButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
