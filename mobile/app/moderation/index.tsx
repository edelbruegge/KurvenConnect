import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ActiveRestrictionCard } from '@/components/moderation/active-restriction-card';
import { ModerationReportCard } from '@/components/moderation/moderation-report-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useModeration } from '@/context/moderation-context';
import { REPORT_TARGET_TYPE_LABELS, type ReportTargetType } from '@/data/reports';
import { useRefreshOnFocus } from '@/hooks/use-refresh-on-focus';
import type { ModerationStatusFilter } from '@/lib/map-supabase-moderation';
import { supabase } from '@/lib/supabase';

const PROFILE_NAME_SELECT_COLUMNS = 'id, display_name';

const STATUS_FILTERS: { key: ModerationStatusFilter; label: string }[] = [
  { key: 'submitted', label: 'Offen' },
  { key: 'reviewed', label: 'Geprüft' },
  { key: 'dismissed', label: 'Verworfen' },
  { key: 'action_taken', label: 'Bearbeitet' },
  { key: 'all', label: 'Alle' },
];

const TARGET_TYPE_FILTERS: (ReportTargetType | 'all')[] = ['all', 'post', 'comment', 'trip', 'meetup', 'request', 'user'];

const STATUS_LABELS: Record<ModerationStatusFilter, string> = {
  submitted: 'Offen',
  reviewed: 'Geprüft',
  dismissed: 'Verworfen',
  action_taken: 'Bearbeitet',
  all: 'Alle',
};

export default function ModerationQueueScreen() {
  const router = useRouter();
  const {
    isModerator,
    isModeratorStatusLoading,
    moderationReports,
    isModerationReportsLoading,
    moderationReportsError,
    moderationFilter,
    setModerationFilter,
    refreshModerationReports,
    activeRestrictions,
    isActiveRestrictionsLoading,
    activeRestrictionsError,
    refreshActiveRestrictions,
    restoreRestrictedContent,
    isModerationActionSubmitting,
    moderationRealtimeStatus,
  } = useModeration();

  const [activeTab, setActiveTab] = useState<'reports' | 'hidden'>('reports');

  // Safety net only — while the reports/content_restrictions channel is healthy, the queue and
  // "Ausgeblendet" list already stay live via realtime + ModerationContext's own foreground
  // refresh. Never calls the moderator-only RPC for a non-moderator account.
  useRefreshOnFocus(refreshModerationReports, !isModerator || moderationRealtimeStatus === 'subscribed');
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreListError, setRestoreListError] = useState<string | null>(null);

  const unresolvedIdsKey = Array.from(
    new Set(
      moderationReports.flatMap((report) => [report.reporterId, report.targetOwnerId ?? '']).filter((id) => id && !profileNames[id]),
    ),
  )
    .sort()
    .join(',');

  useEffect(() => {
    const ids = unresolvedIdsKey ? unresolvedIdsKey.split(',') : [];

    if (ids.length === 0) {
      return;
    }

    let isCurrent = true;

    Promise.resolve(
      supabase.from('profiles').select(PROFILE_NAME_SELECT_COLUMNS).in('id', ids),
    )
      .then(({ data }) => {
        if (!isCurrent) return;

        const map: Record<string, string> = {};
        ((data ?? []) as { id: string; display_name: string | null }[]).forEach((row) => {
          map[row.id] = row.display_name?.trim() || 'Neues Mitglied';
        });
        setProfileNames((current) => ({ ...current, ...map }));
      })
      .catch(() => {
        // Best-effort stub resolution -- see blocked-users.tsx's identical comment.
      });

    return () => {
      isCurrent = false;
    };
  }, [unresolvedIdsKey]);

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

  const reportsWithNames = moderationReports.map((report) => ({
    ...report,
    reporterDisplayName: profileNames[report.reporterId],
    targetOwnerDisplayName: report.targetOwnerId ? profileNames[report.targetOwnerId] : undefined,
  }));

  const openCount = reportsWithNames.filter((report) => report.status === 'submitted').length;

  const handleRestore = async (restrictionId: string) => {
    if (restoringId) {
      return;
    }

    setRestoringId(restrictionId);
    setRestoreListError(null);
    const { error } = await restoreRestrictedContent(restrictionId);
    setRestoringId(null);

    if (error) {
      setRestoreListError(error);
    }
  };

  const reportsErrorBanner = moderationReportsError ? (
    <View style={styles.remoteErrorBanner}>
      <Text style={styles.remoteErrorText}>{moderationReportsError}</Text>
      <Pressable onPress={refreshModerationReports} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
        <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
      </Pressable>
    </View>
  ) : null;

  const hiddenErrorBanner = activeRestrictionsError ? (
    <View style={styles.remoteErrorBanner}>
      <Text style={styles.remoteErrorText}>{activeRestrictionsError}</Text>
      <Pressable onPress={refreshActiveRestrictions} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
        <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={activeTab === 'reports' ? isModerationReportsLoading : isActiveRestrictionsLoading}
            onRefresh={activeTab === 'reports' ? refreshModerationReports : refreshActiveRestrictions}
          />
        }
      >
        <View style={styles.headerRow}>
          <IconSymbol size={22} name="shield.fill" color={FeedColors.textPrimary} />
          <View style={styles.headerTextBlock}>
            <Text style={styles.title}>Moderation</Text>
            <Text style={styles.subtitle}>{openCount} offene Meldung{openCount === 1 ? '' : 'en'}</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setActiveTab('reports')}
            style={[styles.tabButton, activeTab === 'reports' && styles.tabButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Meldungen anzeigen"
          >
            <Text style={[styles.tabButtonText, activeTab === 'reports' && styles.tabButtonTextActive]}>Meldungen</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('hidden')}
            style={[styles.tabButton, activeTab === 'hidden' && styles.tabButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Ausgeblendete Inhalte anzeigen"
          >
            <Text style={[styles.tabButtonText, activeTab === 'hidden' && styles.tabButtonTextActive]}>
              Ausgeblendet {activeRestrictions.length > 0 ? `(${activeRestrictions.length})` : ''}
            </Text>
          </Pressable>
        </View>

        {activeTab === 'reports' ? (
          <>
            {reportsErrorBanner}

            <Text style={styles.sectionTitle}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {STATUS_FILTERS.map((filter) => {
                const isActive = moderationFilter.status === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setModerationFilter({ ...moderationFilter, status: filter.key })}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Meldungen filtern: ${filter.label}`}
                  >
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{filter.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.sectionTitle}>Zieltyp</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {TARGET_TYPE_FILTERS.map((type) => {
                const isActive = moderationFilter.targetType === type;
                const label = type === 'all' ? 'Alle' : REPORT_TARGET_TYPE_LABELS[type];
                return (
                  <Pressable
                    key={type}
                    onPress={() => setModerationFilter({ ...moderationFilter, targetType: type })}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Nach ${label} filtern`}
                  >
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {reportsWithNames.length === 0 ? (
              <View style={styles.emptyState}>
                <IconSymbol size={32} name="tray.fill" color={FeedColors.textSecondary} />
                <Text style={styles.emptyText}>
                  {isModerationReportsLoading ? 'Meldungen werden geladen …' : 'Keine Meldungen für diesen Filter.'}
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {reportsWithNames.map((report) => (
                  <ModerationReportCard
                    key={report.id}
                    report={report}
                    statusLabel={STATUS_LABELS[report.status as ModerationStatusFilter] ?? report.status}
                    onPress={() => router.push({ pathname: '/moderation/[id]', params: { id: report.id } })}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {hiddenErrorBanner}
            {restoreListError ? <Text style={styles.remoteErrorText}>{restoreListError}</Text> : null}

            {activeRestrictions.length === 0 ? (
              <View style={styles.emptyState}>
                <IconSymbol size={32} name="tray.fill" color={FeedColors.textSecondary} />
                <Text style={styles.emptyText}>
                  {isActiveRestrictionsLoading ? 'Wird geladen …' : 'Aktuell ist kein Inhalt global ausgeblendet.'}
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {activeRestrictions.map((restriction) => (
                  <ActiveRestrictionCard
                    key={restriction.id}
                    restriction={restriction}
                    isRestoring={isModerationActionSubmitting && restoringId === restriction.id}
                    onRestore={() => handleRestore(restriction.id)}
                    onOpenReport={
                      restriction.reportId
                        ? () => router.push({ pathname: '/moderation/[id]', params: { id: restriction.reportId! } })
                        : undefined
                    }
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerTextBlock: {
    flex: 1,
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  subtitle: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  tabButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: FeedColors.textPrimary,
  },
  remoteErrorBanner: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Spacing.sm,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  remoteErrorText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.xs,
  },
  remoteErrorRetry: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 44,
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
