import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { TripCard } from '@/components/trips/trip-card';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { STADION_MODULES, type StadionModule } from '@/constants/stadion-modules';
import { useActiveClub } from '@/context/active-club-context';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useGameFollows } from '@/context/game-follows-context';
import { useGames } from '@/context/games-context';
import type { Game } from '@/data/database-games';
import { getPostDetailPathname, type FeedPost } from '@/data/feed-posts';
import { useVisiblePosts } from '@/hooks/use-visible-posts';

const PREVIEW_COUNT = 3;

export default function StadionModuleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ module?: string; gameId?: string; gameLabel?: string }>();
  const {
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
    gameTripsPosts,
    isGameTripsLoading,
    gameTripsError,
    gameTripsGameId,
    loadTripsByGame,
    gameMeetupsPosts,
    isGameMeetupsLoading,
    gameMeetupsError,
    gameMeetupsGameId,
    loadMeetupsByGame,
    gameWantedPosts,
    isGameWantedLoading,
    gameWantedError,
    gameWantedGameId,
    loadWantedByGame,
  } = useFeedPosts();
  const { activeTeam, activeTeamId } = useActiveClub();
  const { getGameById } = useGames();

  const activeModule: StadionModule = STADION_MODULES.some((module) => module.key === params.module)
    ? (params.module as StadionModule)
    : 'uebersicht';
  const gameId = params.gameId || null;
  const gameLabel = params.gameLabel || null;
  const moduleMeta = STADION_MODULES.find((module) => module.key === activeModule);
  // Spieltag-Zentrale: the full Game record (competition/matchday/kickoff/score/stadium), looked
  // up from the already app-wide loaded GamesContext -- zero new query. Only rendered as the rich
  // header on the Übersicht hub itself; every other module (reached via "Alle anzeigen") keeps the
  // existing simple title/subtitle header unchanged.
  const selectedGame = gameId ? getGameById(gameId) : undefined;
  const isSpieltagZentrale = activeModule === 'uebersicht' && Boolean(gameId) && Boolean(selectedGame);

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

  // "Spiel → Beiträge/Fahrten/Treffen/Gesucht" (Übersicht-Vorschau UND vollständige Liste): each
  // its own independent, NOT team_id-filtered query (feed-posts-context.tsx's loadPostsByGame/
  // loadTripsByGame/loadMeetupsByGame/loadWantedByGame) -- a shared real-world match can have
  // content from either club's fans, and some legacy posts carry game_id with team_id = NULL (see
  // report), both of which a `posts`-state-derived filter would silently exclude since that shared
  // state is already `.eq('team_id', activeTeamId)` and capped for the "Für dich" feed's own
  // purposes. Fahrten/Treffen/Gesucht previously used exactly that excluding filter -- fixed here
  // to match the same independent-query pattern Beiträge already used.
  useEffect(() => {
    if (!gameId) return;
    loadPostsByGame(gameId);
    loadTripsByGame(gameId);
    loadMeetupsByGame(gameId);
    loadWantedByGame(gameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const visibleGameBeitraege = useVisiblePosts(gameBeitraegeGameId === gameId ? gameBeitraegePosts : []);
  const isGameBeitraegeReady = gameBeitraegeGameId === gameId && !isGameBeitraegeLoading;

  const visibleGameTrips = useVisiblePosts(gameTripsGameId === gameId ? gameTripsPosts : []);
  const isGameTripsReady = gameTripsGameId === gameId && !isGameTripsLoading;

  const visibleGameMeetups = useVisiblePosts(gameMeetupsGameId === gameId ? gameMeetupsPosts : []);
  const isGameMeetupsReady = gameMeetupsGameId === gameId && !isGameMeetupsLoading;

  const visibleGameWanted = useVisiblePosts(gameWantedGameId === gameId ? gameWantedPosts : []);
  const isGameWantedReady = gameWantedGameId === gameId && !isGameWantedLoading;

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
        <Text style={styles.overviewSectionTitle}>
          {title}
          {items.length > 0 ? ` (${items.length})` : ''}
        </Text>
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
        {isSpieltagZentrale && selectedGame ? (
          <GameHeader game={selectedGame} />
        ) : (
          <>
            <Text style={styles.title}>{moduleMeta?.label ?? 'Stadion'}</Text>
            <Text style={styles.subtitle}>
              {activeModule === 'beitraege' && !gameId ? `Alle Beiträge von ${activeTeam?.teamName ?? 'deinem Verein'}` : (gameLabel ?? 'Kein Spiel ausgewählt')}
            </Text>
          </>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {activeModule === 'uebersicht' ? (
          <>
            {renderOverviewSection(
              'Fahrten',
              isGameTripsReady ? visibleGameTrips : [],
              'fahrten',
              gameTripsError ? gameTripsError : isGameTripsReady ? 'Noch keine Fahrten zu diesem Spiel.' : 'Fahrten werden geladen …',
              renderTripList,
            )}
            {renderOverviewSection(
              'Treffen',
              isGameMeetupsReady ? visibleGameMeetups : [],
              'treffen',
              gameMeetupsError ? gameMeetupsError : isGameMeetupsReady ? 'Noch keine Treffen zu diesem Spiel.' : 'Treffen werden geladen …',
              renderPostList,
            )}
            {renderOverviewSection(
              'Beiträge',
              isGameBeitraegeReady ? visibleGameBeitraege : [],
              'beitraege',
              gameBeitraegeError ? gameBeitraegeError : isGameBeitraegeReady ? 'Noch keine Beiträge zu diesem Spiel.' : 'Beiträge werden geladen …',
              renderPostList,
            )}
            {renderOverviewSection(
              'Gesucht',
              isGameWantedReady ? visibleGameWanted : [],
              'gesucht',
              gameWantedError ? gameWantedError : isGameWantedReady ? 'Noch keine Gesucht-Einträge zu diesem Spiel.' : 'Gesucht-Einträge werden geladen …',
              renderPostList,
            )}
          </>
        ) : null}

        {activeModule === 'fahrten' ? (
          gameTripsError ? (
            <View style={styles.remoteErrorBanner}>
              <Text style={styles.remoteErrorText}>{gameTripsError}</Text>
              <Pressable onPress={() => gameId && loadTripsByGame(gameId)} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
                <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
              </Pressable>
            </View>
          ) : !isGameTripsReady ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={FeedColors.textPrimary} />
            </View>
          ) : visibleGameTrips.length === 0 ? (
            <EmptyModuleState text="Noch keine Fahrten zu diesem Spiel vorhanden." />
          ) : (
            renderTripList(visibleGameTrips)
          )
        ) : null}

        {activeModule === 'treffen' ? (
          gameMeetupsError ? (
            <View style={styles.remoteErrorBanner}>
              <Text style={styles.remoteErrorText}>{gameMeetupsError}</Text>
              <Pressable onPress={() => gameId && loadMeetupsByGame(gameId)} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
                <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
              </Pressable>
            </View>
          ) : !isGameMeetupsReady ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={FeedColors.textPrimary} />
            </View>
          ) : visibleGameMeetups.length === 0 ? (
            <EmptyModuleState text="Noch keine Treffen zu diesem Spiel vorhanden." />
          ) : (
            renderPostList(visibleGameMeetups)
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
          gameWantedError ? (
            <View style={styles.remoteErrorBanner}>
              <Text style={styles.remoteErrorText}>{gameWantedError}</Text>
              <Pressable onPress={() => gameId && loadWantedByGame(gameId)} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
                <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
              </Pressable>
            </View>
          ) : !isGameWantedReady ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={FeedColors.textPrimary} />
            </View>
          ) : visibleGameWanted.length === 0 ? (
            <EmptyModuleState text="Noch keine Gesucht-Einträge zu diesem Spiel vorhanden." />
          ) : (
            renderPostList(visibleGameWanted)
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

// Spieltag-Zentrale header: every line is conditional on the field actually being present on
// `Game` (data/database-games.ts already types every non-guaranteed field as nullable/optional) --
// never a fabricated date, score, or competition. Mirrors the same omission pattern
// components/stadion/game-selector.tsx's GameSummaryLines already uses. `status` only ever holds
// 'finished' or 'scheduled' in the real synced data (supabase/functions/sync-football-games) -- no
// "live" state is invented here.
function GameHeader({ game }: { game: Game }) {
  const { isGameFollowed, isGameFollowsLoading, toggleGameFollow } = useGameFollows();
  const metaLine = [game.competition, game.matchday != null ? `${game.matchday}. Spieltag` : undefined].filter(Boolean).join(' · ');
  const hasScore = game.homeScore != null && game.awayScore != null;
  const stadiumLine = game.stadiumName ? [game.stadiumName, game.stadiumCity].filter(Boolean).join(' · ') : undefined;
  // While the initial follow-status load for this account is still in flight, neither "Spiel
  // folgen" nor "✓ Folge ich" is shown as a definite state -- see GameFollowsProvider's
  // isGameFollowsLoading doc comment.
  const isFollowed = !isGameFollowsLoading && isGameFollowed(game.id);
  // Local-only: the last follow/unfollow attempt's error, so a failed tap is visible instead of
  // silently reverting (the optimistic flip + rollback in GameFollowsProvider is otherwise easy to
  // miss). Cleared on every new attempt; never persisted, never affects isFollowed itself.
  const [followMutationError, setFollowMutationError] = useState<string | null>(null);

  const handleFollowPress = () => {
    if (__DEV__) {
      console.log('[game-follow] press', game.id);
    }
    setFollowMutationError(null);
    void toggleGameFollow(game.id).then(({ error }) => {
      if (error) {
        setFollowMutationError(error);
      }
    });
  };

  return (
    <View>
      {metaLine ? <Text style={styles.gameHeaderMeta}>{metaLine}</Text> : null}
      <Text style={styles.title}>
        {game.homeTeam} – {game.awayTeam}
      </Text>
      <View style={styles.gameHeaderStatusRow}>
        <View style={styles.gameHeaderBadge}>
          <Text style={styles.gameHeaderBadgeText}>{game.status === 'finished' ? 'Beendet' : 'Kommend'}</Text>
        </View>
        {hasScore ? (
          <Text style={styles.gameHeaderScore}>
            {game.homeScore} : {game.awayScore}
          </Text>
        ) : null}
      </View>
      {game.kickoffAt ? <Text style={styles.gameHeaderDetail}>{game.kickoffAt}</Text> : null}
      {stadiumLine ? <Text style={styles.gameHeaderDetail}>{stadiumLine}</Text> : null}
      <Pressable
        onPress={handleFollowPress}
        disabled={isGameFollowsLoading}
        accessibilityRole="button"
        accessibilityLabel={isFollowed ? 'Spiel entfolgen' : 'Spiel folgen'}
        style={[styles.gameFollowButton, isFollowed && styles.gameFollowButtonActive, isGameFollowsLoading && styles.gameFollowButtonDisabled]}
      >
        {isGameFollowsLoading ? (
          <ActivityIndicator size="small" color={ClubColors.text} />
        ) : (
          <Text style={[styles.gameFollowButtonText, isFollowed && styles.gameFollowButtonTextActive]}>
            {isFollowed ? '✓ Folge ich' : 'Spiel folgen'}
          </Text>
        )}
      </Pressable>
      {followMutationError ? <Text style={styles.gameFollowErrorText}>{followMutationError}</Text> : null}
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
  gameHeaderMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
    marginBottom: 2,
  },
  gameHeaderStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  gameHeaderBadge: {
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  gameHeaderBadgeText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  gameHeaderScore: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  gameHeaderDetail: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  gameFollowButton: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    minHeight: 44,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.round,
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  gameFollowButtonActive: {
    backgroundColor: ClubColors.primary,
    borderColor: ClubColors.primary,
  },
  gameFollowButtonDisabled: {
    opacity: 0.6,
  },
  gameFollowButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  gameFollowButtonTextActive: {
    color: ClubColors.secondary,
  },
  gameFollowErrorText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
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
