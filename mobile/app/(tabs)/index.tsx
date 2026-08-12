import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { GroupRecommendationCard } from '@/components/groups/group-recommendation-card';
import { RemoteGroupSuggestionCard } from '@/components/groups/remote-group-suggestion-card';
import { MessagesButton } from '@/components/navigation/messages-button';
import { NotificationsButton } from '@/components/navigation/notifications-button';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useGroups } from '@/context/groups-context';
import { getPostDetailPathname, type FeedPost } from '@/data/feed-posts';
import { useRefreshOnFocus } from '@/hooks/use-refresh-on-focus';
import { useVisiblePosts } from '@/hooks/use-visible-posts';

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
  } = useFeedPosts();
  const { getRecommendedGroups, groupSuggestions } = useGroups();

  const recommendedGroups = getRecommendedGroups();
  const visiblePosts = useVisiblePosts(posts);

  // Safety net only — while the shared content-visibility AND content-changes channels are
  // healthy, Feed/Stadion/Suche/Profil/Aktivitäten/Gespeichert already stay live via realtime +
  // the AppState foreground refresh in FeedPostsContext. This only kicks in if either channel
  // silently dropped without the app ever backgrounding.
  useRefreshOnFocus(
    refreshRemotePosts,
    contentVisibilityRealtimeStatus === 'subscribed' && contentChangesRealtimeStatus === 'subscribed',
  );

  const handleOpenPost = (post: FeedPost) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
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
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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

        {visiblePosts.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            onPress={() => handleOpenPost(post)}
            onLikePress={() => toggleLike(post.id)}
            onCommentPress={() => router.push({ pathname: getPostDetailPathname(post), params: { id: post.id, focusComments: 'true' } })}
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
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomColor: FeedColors.cardBorder,
    borderBottomWidth: 1,
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
});
