import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { REPORT_TARGET_TYPE_LABELS } from '@/data/reports';
import type { ModerationQueueItem } from '@/lib/map-supabase-moderation';

type ModerationReportCardProps = {
  report: ModerationQueueItem;
  statusLabel: string;
  onPress: () => void;
};

export function ModerationReportCard({ report, statusLabel, onPress }: ModerationReportCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Meldung prüfen: ${REPORT_TARGET_TYPE_LABELS[report.targetType]}`}
    >
      <View style={styles.headerRow}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{REPORT_TARGET_TYPE_LABELS[report.targetType]}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{statusLabel}</Text>
        </View>
      </View>

      <Text style={styles.reason}>{report.reason}</Text>
      {report.details ? (
        <Text style={styles.details} numberOfLines={2}>
          {report.details}
        </Text>
      ) : null}

      <Text style={styles.meta}>Gemeldet von {report.reporterDisplayName ?? 'Unbekanntes Mitglied'}</Text>
      <Text style={styles.meta}>Betroffener Nutzer: {report.targetOwnerDisplayName ?? 'Unbekanntes Mitglied'}</Text>
      <Text style={styles.meta}>{report.createdAt}</Text>
    </Pressable>
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
    borderColor: ClubColors.border,
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: ClubColors.text,
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
});
