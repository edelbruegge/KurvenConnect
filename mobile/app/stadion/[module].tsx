import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { TripCard } from '@/components/trips/trip-card';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { STADION_MODULES, type StadionModule } from '@/constants/stadion-modules';
import { useActiveClub } from '@/context/active-club-context';
import { useFeedPosts } from '@/context/feed-posts-context';
import { getPostDetailPathname, getPostGameId, type FeedPost } from '@/data/feed-posts';
import { useVisiblePosts } from '@/hooks/use-visible-posts';

const PREVIEW_COUNT = 3;

export default function StadionModuleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ module?: string; gameId?: string; gameLabel?: string }>();
  const {
    posts,
    toggleLike,
    stadionBeitraegePosts,
    isStadionBeitraegeLoading,
    stadionBeitraegeError,
    stadionBeitraegeTeamId,
    loadStadionBeitraege,
    gameBeitraegePosts,
    isGameBeitraegeLoading,
    gameBeitraegeError,
    gameBeitraegeGameId,
    loadPostsByGame,
  } = useFeedPosts();
  const visiblePosts = useVisiblePosts(posts);
  const { activeTeam, activeTeamId } = useActiveClub();

  const activeModule: StadionModule = STADION_MODULES.some((module) => module.key === params.module)
    ? (params.module as StadionModule)
    : 'uebersicht';
  const gameId = params.gameId || null;
  const gameLabel = params.gameLabel || null;
  const moduleMeta = STADION_MODULES.find((module) => module.key === activeModule);

  // "Stadion → Beiträge" reached without a gameId is the vereinsweite vollständige Übersicht --
  // loaded from its own independent, non-ranked, non-limited query (feed-posts-context.tsx's
  // loadStadionBeitraege), never derived from the "Für dich" feed's remotePosts. Reloads whenever
  // this screen is showing that view for a (possibly new) activeTeamId.
  const isClubWideBeitraege = activeModule === 'beitraege' && !gameId;
  useEffect(() => {
    if (!isClubWideBeitraege || !activeTeamId) return;
    loadStadionBeitraege(activeTeamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClubWideBeitraege, activeTeamId]);

  // Same moderation/blocking filter as everywhere else (hooks/use-visible-posts.ts), applied on top
  // of the independently-loaded club-wide list. `stadionBeitraegeTeamId === activeTeamId` guards
  // against rendering a single stale frame of a previous club's posts right after a club switch,
  // before the effect above has flipped isStadionBeitraegeLoading to true.
  const visibleStadionBeitraege = useVisiblePosts(stadionBeitraegeTeamId === activeTeamId ? stadionBeitraegePosts : []);
  const isClubWideBeitraegeLoading = isStadionBeitraegeLoading || stadionBeitraegeTeamId !== activeTeamId;

  // "Spiel → Beiträge" (Übersicht-Vorschau UND vollständige Liste): its own independent, NOT
  // team_id-filtered query (feed-posts-context.tsx's loadPostsByGame) -- a shared real-world match
  // can have posts from either club's fans, and some legacy posts carry game_id with team_id = NULL
  // (see report), both of which the old `visiblePosts`-derived filter below silently excluded since
  // `posts` itself is already `.eq('team_id', activeTeamId)`. Fahrten/Treffen/Gesucht are untouched
  // -- out of this fix's scope.
  useEffect(() => {
    if (!gameId) return;
    loadPostsByGame(gameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const visibleGameBeitraege = useVisiblePosts(gameBeitraegeGameId === gameId ? gameBeitraegePosts : []);
  const isGameBeitraegeReady = gameBeitraegeGameId === gameId && !isGameBeitraegeLoading;

  const gamePosts = useMemo(() => {
    const forGame = visiblePosts.filter((post) => getPostGameId(post) === gameId);
    return {
      fahrten: forGame.filter((post) => post.category === 'Fahrt'),
      treffen: forGame.filter((post) => post.category === 'Treffpunkt'),
      gesucht: forGame.filter((post) => post.category === 'Gesuch'),
    };
  }, [visiblePosts, gameId]);

  const handleOpenPost = (post: FeedPost) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
  };

  const handleOpenModule = (module: StadionModule) => {
    router.push({ pathname: '/stadion/[module]', params: { module, gameId: gameId ?? '', gameLabel: gameLabel ?? '' } });
  };

  const renderTripList = (trips: FeedPost[]) =>
    trips.map((trip) => (
      <TripCard key={trip.id} post={trip} onPress={() => handleOpenPost(trip)} onLikePress={() => toggleLike(trip.id)} />
    ));

  const renderPostList = (list: FeedPost[]) =>
    list.map((post) => (
      <FeedPostCard
        key={post.id}
        post={post}
        onPress={() => handleOpenPost(post)}
        onLikePress={() => toggleLike(post.id)}
        onCommentPress={() => router.push({ pathname: getPostDetailPathname(post), params: { id: post.id, focusComments: 'true' } })}
      />
    ));

  const renderOverviewSection = (
    title: string,
    items: FeedPost[],
    module: StadionModule,
    emptyText: string,
    renderList: (items: FeedPost[]) => ReactNode
  ) => (
    <View style={styles.overviewSection}>
      <View style={styles.overviewSectionHeader}>
        <Text style={styles.overviewSectionTitle}>{title}</Text>
        {items.length > 0 ? (
          <Pressable onPress={() => handleOpenModule(module)} accessibilityRole="button" accessibilityLabel={`Alle ${title} anzeigen`}>
            <Text style={styles.overviewAllLink}>Alle anzeigen</Text>
          </Pressable>
        ) : null}
      </View>
      {items.length === 0 ? (
        <Text style={styles.overviewEmptyText}>{emptyText}</Text>
      ) : (
        renderList(items.slice(0, PREVIEW_COUNT))
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>{moduleMeta?.label ?? 'Stadion'}</Text>
        <Text style={styles.subtitle}>
          {activeModule === 'beitraege' && !gameId ? `Alle Beiträge von ${activeTeam?.teamName ?? 'deinem Verein'}` : (gameLabel ?? 'Kein Spiel ausgewählt')}
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {activeModule === 'uebersicht' ? (
          <>
            {renderOverviewSection('Fahrten', gamePosts.fahrten, 'fahrten', 'Noch keine Fahrten zu diesem Spiel.', renderTripList)}
            {renderOverviewSection('Treffen', gamePosts.treffen, 'treffen', 'Noch keine Treffen zu diesem Spiel.', renderPostList)}
            {renderOverviewSection(
              'Beiträge',
              isGameBeitraegeReady ? visibleGameBeitraege : [],
              'beitraege',
              gameBeitraegeError ? gameBeitraegeError : isGameBeitraegeReady ? 'Noch keine Beiträge zu diesem Spiel.' : 'Beiträge werden geladen …',
              renderPostList,
            )}
            {renderOverviewSection('Gesucht', gamePosts.gesucht, 'gesucht', 'Noch keine Gesucht-Einträge zu diesem Spiel.', renderPostList)}
          </>
        ) : null}

        {activeModule === 'fahrten' ? (
          gamePosts.fahrten.length === 0 ? (
            <EmptyModuleState text="Noch keine Fahrten zu diesem Spiel vorhanden." />
          ) : (
            renderTripList(gamePosts.fahrten)
          )
        ) : null}

        {activeModule === 'treffen' ? (
          gamePosts.treffen.length === 0 ? (
            <EmptyModuleState text="Noch keine Treffen zu diesem Spiel vorhanden." />
          ) : (
            renderPostList(gamePosts.treffen)
          )
        ) : null}

        {activeModule === 'beitraege' ? (
          gameId ? (
            gameBeitraegeError ? (
              <View style={styles.remoteErrorBanner}>
                <Text style={styles.remoteErrorText}>{gameBeitraegeError}</Text>
                <Pressable onPress={() => loadPostsByGame(gameId)} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
                  <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
                </Pressable>
              </View>
            ) : !isGameBeitraegeReady ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={FeedColors.textPrimary} />
              </View>
            ) : visibleGameBeitraege.length === 0 ? (
              <EmptyModuleState text="Noch keine Beiträge zu diesem Spiel vorhanden." />
            ) : (
              renderPostList(visibleGameBeitraege)
            )
          ) : stadionBeitraegeError ? (
            <View style={styles.remoteErrorBanner}>
              <Text style={styles.remoteErrorText}>{stadionBeitraegeError}</Text>
              <Pressable
                onPress={() => activeTeamId && loadStadionBeitraege(activeTeamId)}
                accessibilityRole="button"
                accessibilityLabel="Erneut versuchen"
              >
                <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
              </Pressable>
            </View>
          ) : isClubWideBeitraegeLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={FeedColors.textPrimary} />
            </View>
          ) : visibleStadionBeitraege.length === 0 ? (
            <EmptyModuleState text={`Noch keine Beiträge von ${activeTeam?.teamName ?? 'deinem Verein'}.`} />
          ) : (
            renderPostList(visibleStadionBeitraege)
          )
        ) : null}

        {activeModule === 'gesucht' ? (
          gamePosts.gesucht.length === 0 ? (
            <EmptyModuleState text="Noch keine Gesucht-Einträge zu diesem Spiel vorhanden." />
          ) : (
            renderPostList(gamePosts.gesucht)
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyModuleState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomColor: FeedColors.cardBorder,
    borderBottomWidth: 1,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
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
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  overviewSection: {
    marginBottom: Spacing.lg,
  },
  overviewSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  overviewSectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  overviewAllLink: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  overviewEmptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  emptyState: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
  },
});
