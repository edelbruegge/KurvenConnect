import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { GroupRecommendationCard } from '@/components/groups/group-recommendation-card';
import { RemoteGroupSuggestionCard } from '@/components/groups/remote-group-suggestion-card';
import { ActiveClubBadge } from '@/components/navigation/active-club-badge';
import { MessagesButton } from '@/components/navigation/messages-button';
import { NotificationsButton } from '@/components/navigation/notifications-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useActiveClub } from '@/context/active-club-context';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useGroups } from '@/context/groups-context';
import { useProfiles } from '@/context/profile-context';
import { getPostDetailPathname, type FeedMode, type FeedPost } from '@/data/feed-posts';
import { useRefreshOnFocus } from '@/hooks/use-refresh-on-focus';
import { useVisiblePosts } from '@/hooks/use-visible-posts';
import { rankForYouPosts } from '@/lib/for-you-ranking';

const FEED_MODES: { key: FeedMode; label: string }[] = [
  { key: 'for-you', label: 'Für dich' },
  { key: 'following', label: 'Folge ich' },
];

export default function HomeScreen() {
  const router = useRouter();
  const {
    posts,
    toggleLike,
    remotePostsError,
    refreshRemotePosts,
    remoteWantedEntriesError,
    refreshRemoteWantedEntries,
    contentVisibilityRealtimeStatus,
    contentChangesRealtimeStatus,
    isRemotePostsLoading,
    isRemoteTripsLoading,
    isRemoteMeetupsLoading,
    isRemoteWantedEntriesLoading,
  } = useFeedPosts();
  const { getRecommendedGroups, groupSuggestions } = useGroups();
  const { followingIds, isConnectionsLoading, connectionsError, refreshConnections } = useProfiles();
  const { activeTeamId } = useActiveClub();
  const [feedMode, setFeedMode] = useState<FeedMode>('for-you');
  const scrollViewRef = useRef<ScrollView>(null);

  const recommendedGroups = getRecommendedGroups();
  const visiblePosts = useVisiblePosts(posts);

  const isForYouLoading = isRemotePostsLoading || isRemoteTripsLoading || isRemoteMeetupsLoading || isRemoteWantedEntriesLoading;

  // "Für dich" ranking order (lib/for-you-ranking.ts) -- deliberately its own state, decoupled
  // from `visiblePosts` itself, so a live like/comment count update never reshuffles the feed
  // while someone is reading it (Vorgabe 19/20). Recomputed in full only when a load cycle just
  // finished (covers initial load, pull-to-refresh, the foreground safety net, and a club switch
  // finishing its refetch -- all of these already toggle isForYouLoading true->false) or when
  // activeTeamId itself changes (belt-and-suspenders for the rare case a switch doesn't trigger a
  // loading transition, e.g. switching between two already-cached-empty clubs).
  const [rankedPostIds, setRankedPostIds] = useState<string[]>([]);
  const rankedTeamIdRef = useRef<string | null>(null);
  const wasForYouLoadingRef = useRef(isForYouLoading);

  useEffect(() => {
    const justFinishedLoading = wasForYouLoadingRef.current && !isForYouLoading;
    wasForYouLoadingRef.current = isForYouLoading;

    if (isForYouLoading) return;
    if (!justFinishedLoading && rankedTeamIdRef.current === activeTeamId) return;

    rankedTeamIdRef.current = activeTeamId;
    setRankedPostIds(rankForYouPosts(visiblePosts, { followingIds }).map((post) => post.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForYouLoading, activeTeamId]);

  // A new realtime post (not yet part of the ranked order) is placed at the top rather than
  // triggering a full re-rank -- a brand-new post already has the highest possible recency score
  // in virtually every real case, and this avoids visually reshuffling everything else someone
  // might currently be reading (Vorgabe 18/20). Bails out to the exact same `current` reference
  // (no-op re-render) whenever nothing new arrived, e.g. on a plain like/comment count update.
  useEffect(() => {
    if (rankedTeamIdRef.current !== activeTeamId) return;

    setRankedPostIds((current) => {
      const known = new Set(current);
      const newIds = visiblePosts.filter((post) => post.source === 'supabase' && !known.has(post.id)).map((post) => post.id);
      return newIds.length > 0 ? [...newIds, ...current] : current;
    });
  }, [visiblePosts, activeTeamId]);

  const rankedForYouPosts = useMemo(() => {
    const postById = new Map(visiblePosts.map((post) => [post.id, post]));
    return rankedPostIds.map((id) => postById.get(id)).filter((post): post is FeedPost => post !== undefined);
  }, [rankedPostIds, visiblePosts]);

  // Pure client-side filter over state that is already loaded and already kept live by the
  // existing content-changes (posts) and user-follows (followingIds) realtime channels -- no new
  // query, no new subscription. Runs on visiblePosts (already block-/moderation-filtered), not on
  // the raw posts array, so moderation/blocking is guaranteed to apply first.
  //
  // `post.source === 'supabase'` makes the "no local seed content here" intent explicit -- local
  // seed authors (e.g. 'user-mina-k') could never match a real followingIds UUID anyway, but this
  // documents it rather than relying on that coincidence.
  //
  // Own posts never appear here even though this is a plain author-membership filter: user_follows
  // has a DB constraint forbidding a self-follow, so the current account's own id can never be a
  // member of its own followingIds set.
  const followingPosts = useMemo(
    () => visiblePosts.filter((post) => post.source === 'supabase' && followingIds.has(post.userId)),
    [visiblePosts, followingIds],
  );

  const isFollowingFeedLoading = isForYouLoading || isConnectionsLoading;

  // Safety net only — while the shared content-visibility AND content-changes channels are
  // healthy, Feed/Stadion/Suche/Profil/Aktivitäten/Gespeichert already stay live via realtime +
  // the AppState foreground refresh in FeedPostsContext. This only kicks in if either channel
  // silently dropped without the app ever backgrounding. Covers both feed modes since both are
  // derived from the same underlying `posts` state.
  useRefreshOnFocus(
    refreshRemotePosts,
    contentVisibilityRealtimeStatus === 'subscribed' && contentChangesRealtimeStatus === 'subscribed',
  );

  const handleOpenPost = (post: FeedPost) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
  };

  const handleSelectFeedMode = (mode: FeedMode) => {
    setFeedMode(mode);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Kurvenconnect Feed</Text>
            <Text style={styles.subtitle}>Aktuelle Community-Updates aus dem Stadionalltag</Text>
          </View>
          <View style={styles.headerActions}>
            <NotificationsButton />
            <MessagesButton />
          </View>
        </View>
        <ActiveClubBadge style={styles.activeClubBadge} />
      </View>

      <View style={styles.feedModeRow}>
        {FEED_MODES.map((mode) => (
          <Pressable
            key={mode.key}
            onPress={() => handleSelectFeedMode(mode.key)}
            style={[styles.feedModeButton, feedMode === mode.key && styles.feedModeButtonActive]}
            accessibilityRole="button"
            accessibilityLabel={`${mode.label} anzeigen`}
          >
            <Text style={[styles.feedModeButtonText, feedMode === mode.key && styles.feedModeButtonTextActive]}>{mode.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {remotePostsError ? (
          <View style={styles.remoteErrorBanner}>
            <Text style={styles.remoteErrorText}>{remotePostsError}</Text>
            <Pressable onPress={refreshRemotePosts} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
              <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : null}

        {remoteWantedEntriesError ? (
          <View style={styles.remoteErrorBanner}>
            <Text style={styles.remoteErrorText}>{remoteWantedEntriesError}</Text>
            <Pressable onPress={refreshRemoteWantedEntries} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
              <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : null}

        {feedMode === 'for-you' ? (
          <>
            {recommendedGroups.length > 0 || groupSuggestions.length > 0 ? (
              <View style={styles.recommendationsSection}>
                <Text style={styles.recommendationsTitle}>Gruppen für dich</Text>
                {recommendedGroups.map((group) => (
                  <GroupRecommendationCard key={group.id} group={group} />
                ))}
                {groupSuggestions.map((suggestion) => (
                  <RemoteGroupSuggestionCard key={suggestion.id} suggestion={suggestion} />
                ))}
              </View>
            ) : null}

            {rankedForYouPosts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                onPress={() => handleOpenPost(post)}
                onLikePress={() => toggleLike(post.id)}
                onCommentPress={() => router.push({ pathname: getPostDetailPathname(post), params: { id: post.id, focusComments: 'true' } })}
              />
            ))}
          </>
        ) : connectionsError ? (
          <View style={styles.remoteErrorBanner}>
            <Text style={styles.remoteErrorText}>{connectionsError}</Text>
            <Pressable onPress={refreshConnections} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
              <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : isFollowingFeedLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={FeedColors.textPrimary} />
          </View>
        ) : followingIds.size === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol size={40} name="person.3.fill" color={FeedColors.textSecondary} />
            <Text style={styles.emptyTitle}>Du folgst noch niemandem.</Text>
            <Text style={styles.emptyText}>Finde andere Fans über die Suche und folge ihnen, um ihre Beiträge hier zu sehen.</Text>
            <Pressable onPress={() => router.push('/search')} style={styles.discoverButton} accessibilityRole="button" accessibilityLabel="Fans entdecken">
              <Text style={styles.discoverButtonText}>Fans entdecken</Text>
            </Pressable>
          </View>
        ) : followingPosts.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol size={40} name="doc.text.fill" color={FeedColors.textSecondary} />
            <Text style={styles.emptyTitle}>Noch keine Beiträge</Text>
            <Text style={styles.emptyText}>Von den Personen, denen du folgst, gibt es aktuell keine Beiträge.</Text>
          </View>
        ) : (
          followingPosts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onPress={() => handleOpenPost(post)}
              onLikePress={() => toggleLike(post.id)}
              onCommentPress={() => router.push({ pathname: getPostDetailPathname(post), params: { id: post.id, focusComments: 'true' } })}
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
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomColor: FeedColors.cardBorder,
    borderBottomWidth: 1,
  },
  activeClubBadge: {
    marginTop: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
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
  feedModeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  feedModeButton: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  feedModeButtonActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  feedModeButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  feedModeButtonTextActive: {
    color: FeedColors.textPrimary,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  recommendationsSection: {
    marginBottom: Spacing.md,
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
  recommendationsTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    textAlign: 'center',
  },
  discoverButton: {
    marginTop: Spacing.sm,
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  discoverButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
});
