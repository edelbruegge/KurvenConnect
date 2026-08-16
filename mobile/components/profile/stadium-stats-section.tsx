import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileStats, type ProfileStat } from '@/components/profile/profile-stats';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { getBadgeProgress, getHighestAchievedBadgePerMetric, getNextAchievableBadgePerMetric, type BadgeProgress } from '@/data/stadium-badges';
import type { StadiumStats } from '@/data/stadium-stats';

type StadiumStatsSectionProps = {
  stats: StadiumStats;
  isLoading: boolean;
  error: string | null;
  hasLoadedOnce: boolean;
  onRetry: () => void;
};

// Compact by default (Vorgabe 21/22): the highest achieved badge per category plus, for a category
// with nothing achieved yet, the next reachable one -- not the full 10-entry list. "Alle Abzeichen"
// expands in place (no new route, no new bottom tab -- Vorgabe 21) to the complete, always-in-the-
// same-BADGE_DEFINITIONS-order list.
export function StadiumStatsSection({ stats, isLoading, error, hasLoadedOnce, onRetry }: StadiumStatsSectionProps) {
  const [showAllBadges, setShowAllBadges] = useState(false);

  const statRow: ProfileStat[] = [
    { label: 'Spiele', value: stats.totalGames },
    { label: 'Auswärts', value: stats.awayGames },
    { label: 'Stadien', value: stats.stadiumsVisited },
  ];

  const achieved = getHighestAchievedBadgePerMetric(stats);
  const next = getNextAchievableBadgePerMetric(stats);
  const compactBadges = [...achieved, ...next];
  const allBadges = getBadgeProgress(stats);

  if (!hasLoadedOnce && isLoading) {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>Stadionstatistik</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={FeedColors.textSecondary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>Stadionstatistik</Text>
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
            <Text style={styles.errorRetry}>Erneut versuchen</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Stadionstatistik</Text>
      <ProfileStats stats={statRow} />

      {compactBadges.length > 0 ? (
        <>
          <Text style={styles.subheading}>Abzeichen</Text>
          <View style={styles.badgeList}>
            {(showAllBadges ? allBadges : compactBadges).map((entry) => (
              <BadgeCard key={entry.definition.id} entry={entry} />
            ))}
          </View>
          {allBadges.length > compactBadges.length ? (
            <Pressable
              onPress={() => setShowAllBadges((current) => !current)}
              style={styles.toggleButton}
              accessibilityRole="button"
              accessibilityLabel={showAllBadges ? 'Weniger Abzeichen anzeigen' : 'Alle Abzeichen anzeigen'}
            >
              <Text style={styles.toggleButtonText}>{showAllBadges ? 'Weniger anzeigen' : 'Alle Abzeichen'}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function BadgeCard({ entry }: { entry: BadgeProgress }) {
  const { definition, current, achieved, progress } = entry;

  return (
    <View style={[styles.badgeCard, achieved && styles.badgeCardAchieved]}>
      <View style={[styles.badgeIconWrapper, achieved && styles.badgeIconWrapperAchieved]}>
        <IconSymbol size={20} name={definition.icon} color={achieved ? ClubColors.secondary : FeedColors.textSecondary} />
      </View>
      <View style={styles.badgeTextWrapper}>
        <Text style={[styles.badgeTitle, achieved && styles.badgeTitleAchieved]}>{definition.title}</Text>
        {achieved ? (
          <View style={styles.achievedRow}>
            <IconSymbol size={14} name="checkmark.circle.fill" color={ClubColors.text} />
            <Text style={styles.achievedText}>{definition.description} · Erreicht</Text>
          </View>
        ) : (
          <>
            <Text style={styles.badgeProgressText}>
              {current} / {definition.threshold} · {definition.description}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.md,
  },
  heading: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  subheading: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  loadingContainer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  errorBanner: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.sm,
  },
  errorText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.xs,
  },
  errorRetry: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  badgeList: {
    gap: Spacing.sm,
  },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    backgroundColor: FeedColors.cardBackground,
  },
  badgeCardAchieved: {
    borderColor: ClubColors.border,
  },
  badgeIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: Radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  badgeIconWrapperAchieved: {
    backgroundColor: ClubColors.primary,
    borderColor: ClubColors.primary,
  },
  badgeTextWrapper: {
    flex: 1,
  },
  badgeTitle: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  badgeTitleAchieved: {
    color: FeedColors.textPrimary,
  },
  achievedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  achievedText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  badgeProgressText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  progressTrack: {
    marginTop: Spacing.xs,
    height: 4,
    borderRadius: 2,
    backgroundColor: FeedColors.imagePlaceholder,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: ClubColors.border,
  },
  toggleButton: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
  },
  toggleButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
