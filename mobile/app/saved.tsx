import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { TripCard } from '@/components/trips/trip-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useSaved } from '@/context/saved-context';
import { getPostDetailPathname, type FeedPost, type FeedPostCategory } from '@/data/feed-posts';
import { useVisiblePosts } from '@/hooks/use-visible-posts';

type SavedFilter = 'all' | FeedPostCategory;

const FILTERS: { key: SavedFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'Beitrag', label: 'Beiträge' },
  { key: 'Fahrt', label: 'Fahrten' },
  { key: 'Treffpunkt', label: 'Treffen' },
  { key: 'Gesuch', label: 'Gesucht' },
];

export default function SavedScreen() {
  const router = useRouter();
  const { savedIdsMostRecentFirst, isSavedContentLoading, savedContentError, refreshSavedContent, getSavedContent } = useSaved();
  const [activeFilter, setActiveFilter] = useState<SavedFilter>('all');

  // savedIdsMostRecentFirst is already sorted by save.created_at DESC (see
  // context/saved-context.tsx) -- that order is preserved through every step below (map keeps
  // order, filter keeps order, useVisiblePosts filters without reordering). Resolved via
  // getSavedContent (independent of the currently active club, see saved-context.tsx) rather than
  // useFeedPosts().getPostById -- a saved item from another club must stay reachable here even
  // while a different club is currently active (Vorgabe 20).
  const savedPostsUnfiltered = savedIdsMostRecentFirst
    .map((id) => getSavedContent(id))
    .filter((post): post is FeedPost => post !== undefined);

  // Respects blocking + the current user's own reports, exactly like the rest of the app (Feed,
  // Profile, ...) -- moderative hiding is already handled one level down: a moderated-away post
  // simply never resolves via getPostById in the first place, since posts/trips/meetups/
  // wanted_entries' own SELECT policies already exclude it for normal users (see the migration's
  // header comment).
  const visibleSavedPosts = useVisiblePosts(savedPostsUnfiltered);

  const filteredPosts = useMemo(
    () => (activeFilter === 'all' ? visibleSavedPosts : visibleSavedPosts.filter((post) => post.category === activeFilter)),
    [visibleSavedPosts, activeFilter],
  );

  const handleOpenPost = (post: FeedPost) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
  };

  const showEmptyState = !isSavedContentLoading && !savedContentError && visibleSavedPosts.length === 0;
  const showFilterBar = !isSavedContentLoading && !savedContentError && visibleSavedPosts.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Text style={styles.title}>Gespeichert</Text>

      {savedContentError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{savedContentError}</Text>
          <Pressable onPress={refreshSavedContent} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
            <Text style={styles.errorRetry}>Erneut versuchen</Text>
          </Pressable>
        </View>
      ) : null}

      {isSavedContentLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={FeedColors.textPrimary} />
        </View>
      ) : showEmptyState ? (
        <View style={styles.emptyState}>
          <IconSymbol size={40} name="bookmark.fill" color={FeedColors.textSecondary} />
          <Text style={styles.emptyTitle}>Noch nichts gespeichert</Text>
          <Text style={styles.emptyText}>
            Speichere Beiträge, Fahrten, Treffen oder Gesucht-Einträge, um sie später schnell wiederzufinden.
          </Text>
        </View>
      ) : !savedContentError ? (
        <>
          {showFilterBar ? (
            <View style={styles.filterRow}>
              {FILTERS.map((filter) => (
                <Pressable
                  key={filter.key}
                  onPress={() => setActiveFilter(filter.key)}
                  style={[styles.filterButton, activeFilter === filter.key && styles.filterButtonActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`${filter.label} anzeigen`}
                >
                  <Text style={[styles.filterButtonText, activeFilter === filter.key && styles.filterButtonTextActive]}>{filter.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {filteredPosts.length === 0 ? (
              <Text style={styles.emptyFilterText}>Keine gespeicherten Inhalte in dieser Kategorie.</Text>
            ) : (
              filteredPosts.map((post) =>
                post.category === 'Fahrt' ? (
                  <TripCard key={post.id} post={post} onPress={() => handleOpenPost(post)} />
                ) : (
                  <FeedPostCard
                    key={post.id}
                    post={post}
                    onPress={() => handleOpenPost(post)}
                    onCommentPress={() => router.push({ pathname: getPostDetailPathname(post), params: { id: post.id, focusComments: 'true' } })}
                  />
                ),
              )
            )}
          </ScrollView>
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  errorBanner: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Spacing.sm,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  filterButton: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  filterButtonActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  filterButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  filterButtonTextActive: {
    color: FeedColors.textPrimary,
    fontWeight: '600',
  },
  emptyFilterText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
});
