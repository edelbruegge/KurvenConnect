import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReportCard } from '@/components/moderation/report-card';
import { ReportDetailModal } from '@/components/moderation/report-detail-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useReports } from '@/context/reports-context';
import { REPORT_TARGET_TYPE_LABELS, type ReportTargetType } from '@/data/reports';

type StatusFilter = 'submitted' | 'reviewed' | 'dismissed' | 'all';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'submitted', label: 'Offen' },
  { key: 'reviewed', label: 'Bearbeitet' },
  { key: 'dismissed', label: 'Zurückgewiesen' },
  { key: 'all', label: 'Alle' },
];

const TYPE_FILTERS: ReportTargetType[] = ['user', 'post', 'comment', 'trip', 'meetup', 'request', 'message', 'group'];

export default function ModerationScreen() {
  const { reports } = useReports();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('submitted');
  const [typeFilter, setTypeFilter] = useState<ReportTargetType | 'all'>('all');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const filteredReports = useMemo(() => {
    const byStatus = reports.filter((report) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'reviewed') return report.status === 'reviewed' || report.status === 'action_taken';
      return report.status === statusFilter;
    });

    const byType = byStatus.filter((report) => typeFilter === 'all' || report.targetType === typeFilter);

    return [...byType].reverse();
  }, [reports, statusFilter, typeFilter]);

  const selectedReport = selectedReportId ? reports.find((report) => report.id === selectedReportId) : undefined;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.noticeBox}>
          <IconSymbol size={18} name="shield.fill" color={FeedColors.textSecondary} />
          <View style={styles.noticeTextBlock}>
            <Text style={styles.noticeTitle}>Lokale Moderations-Demo</Text>
            <Text style={styles.noticeText}>
              Diese Ansicht behauptet keine echte Administratorberechtigung. Alle Aktionen wirken nur im aktuellen
              lokalen App-Zustand und werden nicht dauerhaft gespeichert.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setStatusFilter(filter.key)}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Meldungen filtern: ${filter.label}`}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Typ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pressable
            onPress={() => setTypeFilter('all')}
            style={[styles.filterChip, typeFilter === 'all' && styles.filterChipActive]}
            accessibilityRole="button"
            accessibilityLabel="Alle Typen anzeigen"
          >
            <Text style={[styles.filterChipText, typeFilter === 'all' && styles.filterChipTextActive]}>Alle</Text>
          </Pressable>
          {TYPE_FILTERS.map((type) => {
            const isActive = typeFilter === type;
            return (
              <Pressable
                key={type}
                onPress={() => setTypeFilter(type)}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Nach ${REPORT_TARGET_TYPE_LABELS[type]} filtern`}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {REPORT_TARGET_TYPE_LABELS[type]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredReports.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol size={32} name="tray.fill" color={FeedColors.textSecondary} />
            <Text style={styles.emptyText}>
              {reports.length === 0 ? 'Es liegen noch keine Meldungen vor.' : 'Keine Meldungen für diesen Filter.'}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredReports.map((report) => (
              <ReportCard key={report.id} report={report} onPressDetails={() => setSelectedReportId(report.id)} />
            ))}
          </View>
        )}
      </ScrollView>

      {selectedReport ? <ReportDetailModal report={selectedReport} onClose={() => setSelectedReportId(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: FeedColors.cardBackground,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  noticeTextBlock: {
    flex: 1,
  },
  noticeTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: 2,
  },
  noticeText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  filterChipText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  filterChipTextActive: {
    color: FeedColors.textPrimary,
    fontWeight: '600',
  },
  list: {
    marginTop: Spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
