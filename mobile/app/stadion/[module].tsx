import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { TripCard } from '@/components/trips/trip-card';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { STADION_MODULES, type StadionModule } from '@/constants/stadion-modules';
import { useFeedPosts } from '@/context/feed-posts-context';
import { getPostDetailPathname, getPostGameId, type FeedPost } from '@/data/feed-posts';
import { useVisiblePosts } from '@/hooks/use-visible-posts';

const PREVIEW_COUNT = 3;

export default function StadionModuleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ module?: string; gameId?: string; gameLabel?: string }>();
  const { posts, toggleLike } = useFeedPosts();
  const visiblePosts = useVisiblePosts(posts);

  const activeModule: StadionModule = STADION_MODULES.some((module) => module.key === params.module)
    ? (params.module as StadionModule)
    : 'uebersicht';
  const gameId = params.gameId || null;
  const gameLabel = params.gameLabel || null;
  const moduleMeta = STADION_MODULES.find((module) => module.key === activeModule);

  const gamePosts = useMemo(() => {
    const forGame = visiblePosts.filter((post) => getPostGameId(post) === gameId);
    return {
      fahrten: forGame.filter((post) => post.category === 'Fahrt'),
      treffen: forGame.filter((post) => post.category === 'Treffpunkt'),
      beitraege: forGame.filter((post) => post.category === 'Beitrag'),
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
        <Text style={styles.subtitle}>{gameLabel ?? 'Kein Spiel ausgewählt'}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {activeModule === 'uebersicht' ? (
          <>
            {renderOverviewSection('Fahrten', gamePosts.fahrten, 'fahrten', 'Noch keine Fahrten zu diesem Spiel.', renderTripList)}
            {renderOverviewSection('Treffen', gamePosts.treffen, 'treffen', 'Noch keine Treffen zu diesem Spiel.', renderPostList)}
            {renderOverviewSection('Beiträge', gamePosts.beitraege, 'beitraege', 'Noch keine Beiträge zu diesem Spiel.', renderPostList)}
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
          gamePosts.beitraege.length === 0 ? (
            <EmptyModuleState text="Noch keine Beiträge zu diesem Spiel vorhanden." />
          ) : (
            renderPostList(gamePosts.beitraege)
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
