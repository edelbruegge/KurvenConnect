import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GermanyMap } from '@/components/stadion/germany-map';
import { MatchdayCard } from '@/components/stadion/matchday-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useStadiumHistory } from '@/context/stadium-history-context';
import { formatStadiumTitle } from '@/lib/map-supabase-stadium';
import { getMatchdayDetailRoute, getStadiumDetailRoute } from '@/lib/stadium-navigation';

export default function StadionkarteScreen() {
  const router = useRouter();
  const {
    visitedStadiums,
    matchdayHistory,
    isStadiumHistoryLoading,
    stadiumHistoryError,
    refreshStadiumHistory,
    getVisitedStadiumById,
    getMatchdaysForStadium,
  } = useStadiumHistory();
  // A marker tap opens this small info card first (stadium + its own matchdays) instead of
  // navigating away immediately -- see the "Marker-Info" requirement: the user should see the
  // stadium/matchday context on the map before deciding to drill into a specific matchday.
  const [selectedStadiumId, setSelectedStadiumId] = useState<string | null>(null);
  const selectedStadium = selectedStadiumId ? getVisitedStadiumById(selectedStadiumId) : undefined;
  const selectedStadiumMatchdays = selectedStadiumId ? getMatchdaysForStadium(selectedStadiumId) : [];

  const handleSelectStadium = (stadiumId: string) => {
    setSelectedStadiumId(stadiumId);
  };

  const handleOpenStadium = (stadiumId: string) => {
    router.push(getStadiumDetailRoute(stadiumId));
  };

  const handleOpenMatchday = (gameId: string) => {
    router.push(getMatchdayDetailRoute(gameId));
  };

  const totalMatchdays = matchdayHistory.length;
  const lastVisit = [...visitedStadiums].sort((a, b) => (b.lastVisitAtIso < a.lastVisitAtIso ? -1 : 1))[0];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Stadionkarte</Text>
        <Text style={styles.subtitle}>Deine besuchten Stadien und Spieltage</Text>

        {stadiumHistoryError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{stadiumHistoryError}</Text>
            <Pressable onPress={refreshStadiumHistory} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
              <Text style={styles.errorRetry}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : null}

        {isStadiumHistoryLoading && visitedStadiums.length === 0 && !stadiumHistoryError ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={FeedColors.textPrimary} />
          </View>
        ) : (
          <>
            {visitedStadiums.length > 0 ? (
              <View style={styles.statsRow}>
                <Text style={styles.statsText}>
                  {visitedStadiums.length} {visitedStadiums.length === 1 ? 'Stadion' : 'Stadien'} besucht
                </Text>
                <Text style={styles.statsText}>
                  {totalMatchdays} {totalMatchdays === 1 ? 'Spieltag' : 'Spieltage'}
                </Text>
                {lastVisit ? <Text style={styles.statsMeta}>Letzter Besuch: {lastVisit.lastVisitAt}</Text> : null}
              </View>
            ) : null}

            <GermanyMap stadiums={visitedStadiums} onStadiumPress={handleSelectStadium} />

            {selectedStadium ? (
              <View style={styles.markerInfoCard}>
                <View style={styles.markerInfoHeaderRow}>
                  <Pressable
                    onPress={() => handleOpenStadium(selectedStadium.id)}
                    style={styles.markerInfoHeaderText}
                    accessibilityRole="button"
                    accessibilityLabel={`${selectedStadium.name}, ${selectedStadium.city} öffnen`}
                  >
                    <Text style={styles.markerInfoTitle}>{formatStadiumTitle(selectedStadium.name, selectedStadium.traditionalName)}</Text>
                    <Text style={styles.markerInfoCity}>{selectedStadium.city}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedStadiumId(null)}
                    style={styles.markerInfoCloseButton}
                    accessibilityRole="button"
                    accessibilityLabel="Marker-Info schließen"
                  >
                    <Text style={styles.markerInfoCloseButtonText}>×</Text>
                  </Pressable>
                </View>
                <Text style={styles.markerInfoCount}>
                  {selectedStadium.visitedGamesCount} {selectedStadium.visitedGamesCount === 1 ? 'besuchter Spieltag' : 'besuchte Spieltage'}
                </Text>
                {selectedStadiumMatchdays.map((matchday) => (
                  <MatchdayCard
                    key={matchday.gameId}
                    matchday={matchday}
                    onPress={() => handleOpenMatchday(matchday.gameId)}
                    onStadiumPress={() => handleOpenStadium(selectedStadium.id)}
                    showStadiumLine={false}
                  />
                ))}
              </View>
            ) : null}

            {visitedStadiums.length === 0 && !stadiumHistoryError ? (
              <View style={styles.emptyState}>
                <IconSymbol size={40} name="mappin.and.ellipse" color={FeedColors.textSecondary} />
                <Text style={styles.emptyTitle}>Noch keine Stadien besucht</Text>
                <Text style={styles.emptyText}>
                  Wenn du einen Beitrag zu einem Spieltag veröffentlichst, erscheint das Stadion hier.
                </Text>
              </View>
            ) : null}

            {visitedStadiums.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Meine Spieltage</Text>
                {matchdayHistory.map((matchday) => (
                  <MatchdayCard
                    key={matchday.gameId}
                    matchday={matchday}
                    onPress={() => handleOpenMatchday(matchday.gameId)}
                    onStadiumPress={() => handleOpenStadium(matchday.stadiumId)}
                  />
                ))}
              </>
            ) : null}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  subtitle: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.subtitle,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Spacing.sm,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
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
  statsRow: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 4,
  },
  statsText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  statsMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  markerInfoCard: {
    marginTop: Spacing.md,
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: ClubColors.border,
    padding: Spacing.md,
  },
  markerInfoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  markerInfoHeaderText: {
    flex: 1,
  },
  markerInfoTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  markerInfoCity: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.subtitle,
    marginTop: 2,
  },
  markerInfoCloseButton: {
    width: 28,
    height: 28,
    borderRadius: Radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ClubColors.surface,
  },
  markerInfoCloseButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  markerInfoCount: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
});
