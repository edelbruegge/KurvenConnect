import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchdayCard } from '@/components/stadion/matchday-card';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { useStadiumHistory } from '@/context/stadium-history-context';
import { formatStadiumTitle } from '@/lib/map-supabase-stadium';
import { getMatchdayDetailRoute } from '@/lib/stadium-navigation';

export default function StadiumDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { getVisitedStadiumById, getMatchdaysForStadium, hasLoadedStadiumHistoryOnce, stadiumHistoryError, refreshStadiumHistory } =
    useStadiumHistory();

  const stadium = params.id ? getVisitedStadiumById(params.id) : undefined;

  // Every stadium here is derived exclusively from the signed-in user's own get_my_visited_
  // stadiums() result — there is no p_user_id anywhere, so a stadium the account has not actually
  // visited itself (e.g. a stale/foreign id typed directly into the URL) simply is not present.
  // Important for a direct URL open/reload: the very first load is asynchronous, so `stadium`
  // being momentarily undefined does NOT yet mean "not found" — wait for
  // hasLoadedStadiumHistoryOnce before deciding that.
  if (!stadium) {
    if (!hasLoadedStadiumHistoryOnce) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={FeedColors.textPrimary} />
          </View>
        </SafeAreaView>
      );
    }

    if (stadiumHistoryError) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>Stadion konnte nicht geladen werden</Text>
            <Text style={styles.errorText}>{stadiumHistoryError}</Text>
            <Pressable onPress={refreshStadiumHistory} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
              <Text style={styles.retryButtonText}>Erneut versuchen</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return <NotFoundView title="Stadion nicht gefunden" message="Dieses Stadion ist nicht Teil deiner Stadionkarte." />;
  }

  const matchdays = getMatchdaysForStadium(stadium.id);

  const handleOpenMatchday = (gameId: string) => {
    router.push(getMatchdayDetailRoute(gameId));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{formatStadiumTitle(stadium.name, stadium.traditionalName)}</Text>
          <Text style={styles.subtitle}>{stadium.city}</Text>
          <Text style={styles.statsText}>
            {stadium.visitedGamesCount} {stadium.visitedGamesCount === 1 ? 'besuchter Spieltag' : 'besuchte Spieltage'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Deine Spieltage hier</Text>
        {matchdays.map((matchday) => (
          <MatchdayCard
            key={matchday.gameId}
            matchday={matchday}
            onPress={() => handleOpenMatchday(matchday.gameId)}
            onStadiumPress={() => {}}
            showStadiumLine={false}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  errorTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  errorText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  retryButton: {
    backgroundColor: FeedColors.cardBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Spacing.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  retryButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.lg,
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
  },
  statsText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
});
