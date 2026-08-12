import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { ClubColors, FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useStadiumHistory } from '@/context/stadium-history-context';
import { getPostDetailPathname, getPostGameId } from '@/data/feed-posts';
import { formatStadiumTitle } from '@/lib/map-supabase-stadium';
import { getStadiumDetailRoute } from '@/lib/stadium-navigation';

// Later step (not built here, see plan §7 "Persönliche Daten dieses Spieltags"): a "Mein
// Spieltag" section (note/rating/travel/mood/company) could be added below "Meine Beiträge"
// without restructuring this screen — no fields/table for that exist yet, intentionally.

export default function MatchdayDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { getMatchdayById, hasLoadedStadiumHistoryOnce, stadiumHistoryError, refreshStadiumHistory } = useStadiumHistory();
  const { posts, toggleLike } = useFeedPosts();

  const matchday = params.id ? getMatchdayById(params.id) : undefined;

  // Same principle as app/stadium/[id].tsx: getMatchdayById only ever resolves a game the
  // signed-in user has at least one own community post ("Beitrag") for — no p_user_id, no other
  // user's matchday reachable through this route. `stadium` being momentarily undefined on a
  // direct URL open/reload does NOT yet mean "not found" — wait for hasLoadedStadiumHistoryOnce.
  if (!matchday) {
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
            <Text style={styles.errorTitle}>Spieltag konnte nicht geladen werden</Text>
            <Text style={styles.errorText}>{stadiumHistoryError}</Text>
            <Pressable onPress={refreshStadiumHistory} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
              <Text style={styles.retryButtonText}>Erneut versuchen</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return <NotFoundView title="Spieltag nicht gefunden" message="Dieser Spieltag ist nicht Teil deiner Spieltage." />;
  }

  // "Meine Beiträge" here means exactly the same thing as the visit definition itself (see the
  // migration): only own public.posts rows (category 'Beitrag'), never trips/meetups/wanted
  // entries, even if one of those also happens to carry this game_id.
  const ownPosts = authUserId
    ? posts.filter(
        (post) =>
          post.source === 'supabase' &&
          post.userId === authUserId &&
          post.category === 'Beitrag' &&
          getPostGameId(post) === matchday.gameId,
      )
    : [];

  const handleOpenStadium = () => {
    router.push(getStadiumDetailRoute(matchday.stadiumId));
  };

  const handleOpenPost = (postId: string) => {
    const post = ownPosts.find((entry) => entry.id === postId);
    if (post) {
      router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
    }
  };

  const hasScore = matchday.homeScore != null && matchday.awayScore != null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.matchCard}>
          <View style={styles.teamsRow}>
            <Text style={styles.teamText} numberOfLines={2}>
              {matchday.homeTeam}
            </Text>
            <Text style={styles.scoreText}>{hasScore ? `${matchday.homeScore} : ${matchday.awayScore}` : 'vs.'}</Text>
            <Text style={[styles.teamText, styles.awayTeamText]} numberOfLines={2}>
              {matchday.awayTeam}
            </Text>
          </View>
          {!hasScore ? <Text style={styles.metaText}>Ergebnis noch nicht verfügbar</Text> : null}
          {matchday.kickoffAt ? <Text style={styles.metaText}>{matchday.kickoffAt}</Text> : null}

          <Pressable
            onPress={handleOpenStadium}
            style={styles.stadiumLine}
            accessibilityRole="button"
            accessibilityLabel={`${matchday.stadiumName}, ${matchday.city} öffnen`}
            hitSlop={4}
          >
            <Text style={styles.stadiumLineText}>
              {formatStadiumTitle(matchday.stadiumName, matchday.traditionalStadiumName)} · {matchday.city}
            </Text>
          </Pressable>

          {matchday.attendance != null ? (
            <Text style={styles.metaText}>{matchday.attendance.toLocaleString('de-DE')} Zuschauer</Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Meine Beiträge</Text>
        {ownPosts.length === 0 ? (
          <Text style={styles.emptyText}>Keine eigenen Beiträge zu diesem Spieltag gefunden.</Text>
        ) : (
          ownPosts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onPress={() => handleOpenPost(post.id)}
              onLikePress={() => toggleLike(post.id)}
              onCommentPress={() => handleOpenPost(post.id)}
            />
          ))
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
  matchCard: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Spacing.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  teamText: {
    flex: 1,
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  awayTeamText: {
    textAlign: 'right',
  },
  scoreText: {
    color: ClubColors.text,
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  metaText: {
    marginTop: Spacing.xs,
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  stadiumLine: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
  },
  stadiumLineText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    lineHeight: 20,
  },
});
