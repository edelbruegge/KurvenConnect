import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { RemoteGroupSuggestionCard } from '@/components/groups/remote-group-suggestion-card';
import { MessagesButton } from '@/components/navigation/messages-button';
import { NotificationsButton } from '@/components/navigation/notifications-button';
import { FanCard } from '@/components/profile/fan-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useGroups } from '@/context/groups-context';
import { useProfiles } from '@/context/profile-context';
import { getPostDetailPathname, type FeedPost } from '@/data/feed-posts';
import { useVisiblePosts } from '@/hooks/use-visible-posts';

function matchesQuery(post: FeedPost, query: string): boolean {
  const haystack = [post.description, post.user, post.category];

  if (post.category === 'Fahrt' && post.tripDetails) {
    haystack.push(post.tripDetails.departure, post.tripDetails.destination);
  }

  if (post.category === 'Treffpunkt' && post.meetupDetails) {
    haystack.push(post.meetupDetails.title, post.meetupDetails.location, post.meetupDetails.gameLabel);
  }

  if (post.category === 'Gesuch' && post.requestDetails) {
    haystack.push(post.requestDetails.requestedService);
  }

  return haystack.some((value) => value.toLowerCase().includes(query));
}

export default function SearchScreen() {
  const router = useRouter();
  const { posts, toggleLike } = useFeedPosts();
  const { userSearchState, searchUsers, loadMoreUserSearch } = useProfiles();
  const { groupSearchState, searchGroups, loadMoreGroupSearch } = useGroups();
  const visiblePosts = useVisiblePosts(posts);
  const [query, setQuery] = useState('');

  const trimmedQueryRaw = query.trim();
  const trimmedQuery = trimmedQueryRaw.toLowerCase();

  const results = useMemo(() => {
    if (!trimmedQuery) {
      return [];
    }

    return visiblePosts.filter((post) => matchesQuery(post, trimmedQuery));
  }, [visiblePosts, trimmedQuery]);

  // Real, club-independent user search (Vorgabe B: "Suche NICHT nach favorite_team_id
  // einschränken") -- debounced so a network request isn't fired on every keystroke.
  useEffect(() => {
    if (!trimmedQueryRaw) {
      return;
    }

    const timeout = setTimeout(() => {
      if (userSearchState.query !== trimmedQueryRaw) {
        searchUsers(trimmedQueryRaw);
      }
    }, 300);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQueryRaw]);

  // Same debounce as the user search above, independent request/state (search_groups()).
  useEffect(() => {
    if (!trimmedQueryRaw) {
      return;
    }

    const timeout = setTimeout(() => {
      if (groupSearchState.query !== trimmedQueryRaw) {
        searchGroups(trimmedQueryRaw);
      }
    }, 300);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQueryRaw]);

  const isUserSearchShowingStaleQuery = userSearchState.query !== trimmedQueryRaw;
  const userResults = isUserSearchShowingStaleQuery ? [] : userSearchState.users;

  const isGroupSearchShowingStaleQuery = groupSearchState.query !== trimmedQueryRaw;
  const groupResults = isGroupSearchShowingStaleQuery ? [] : groupSearchState.groups;

  const handleOpenPost = (post: FeedPost) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Suchen</Text>
            <Text style={styles.subtitle}>Finde Beiträge, Nutzer, Gruppen, Kategorien und Fahrten</Text>
          </View>
          <View style={styles.headerActions}>
            <NotificationsButton />
            <MessagesButton />
          </View>
        </View>
      </View>

      <View style={styles.searchBar}>
        <IconSymbol size={20} name="magnifyingglass" color={FeedColors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Beiträge, Nutzer, Gruppen, Kategorien oder Fahrten suchen…"
          placeholderTextColor={FeedColors.textSecondary}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Suche zurücksetzen"
            hitSlop={8}>
            <IconSymbol size={20} name="xmark.circle.fill" color={FeedColors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {trimmedQuery === '' ? (
        <View style={styles.emptyState}>
          <IconSymbol size={32} name="magnifyingglass" color={FeedColors.textSecondary} />
          <Text style={styles.stateText}>Suche nach Beiträgen, Nutzern, Gruppen, Kategorien oder Fahrten.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Text style={styles.sectionTitle}>Nutzer</Text>

          {userSearchState.error && !isUserSearchShowingStaleQuery ? (
            <View style={styles.remoteErrorBanner}>
              <Text style={styles.remoteErrorText}>{userSearchState.error}</Text>
              <Pressable onPress={() => searchUsers(trimmedQueryRaw)} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
                <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
              </Pressable>
            </View>
          ) : userSearchState.isLoading && userResults.length === 0 ? (
            <View style={styles.fanLoadingContainer}>
              <ActivityIndicator size="small" color={FeedColors.textSecondary} />
            </View>
          ) : userResults.length === 0 ? (
            <Text style={styles.emptySectionText}>Keine Nutzer gefunden.</Text>
          ) : (
            <>
              {userResults.map((user) => (
                <FanCard key={user.id} user={user} />
              ))}
              {userSearchState.hasMore ? (
                <Pressable
                  onPress={loadMoreUserSearch}
                  disabled={userSearchState.isLoading}
                  style={styles.loadMoreButton}
                  accessibilityRole="button"
                  accessibilityLabel="Weitere Nutzer laden"
                >
                  <Text style={styles.loadMoreButtonText}>{userSearchState.isLoading ? 'Wird geladen …' : 'Mehr laden'}</Text>
                </Pressable>
              ) : null}
            </>
          )}

          <Text style={[styles.sectionTitle, styles.postsSectionTitle]}>Gruppen</Text>

          {groupSearchState.error && !isGroupSearchShowingStaleQuery ? (
            <View style={styles.remoteErrorBanner}>
              <Text style={styles.remoteErrorText}>{groupSearchState.error}</Text>
              <Pressable onPress={() => searchGroups(trimmedQueryRaw)} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
                <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
              </Pressable>
            </View>
          ) : groupSearchState.isLoading && groupResults.length === 0 ? (
            <View style={styles.fanLoadingContainer}>
              <ActivityIndicator size="small" color={FeedColors.textSecondary} />
            </View>
          ) : groupResults.length === 0 ? (
            <Text style={styles.emptySectionText}>Keine Gruppen gefunden.</Text>
          ) : (
            <>
              {groupResults.map((group) => (
                <RemoteGroupSuggestionCard key={group.id} suggestion={group} badgeLabel="Gruppe" />
              ))}
              {groupSearchState.hasMore ? (
                <Pressable
                  onPress={loadMoreGroupSearch}
                  disabled={groupSearchState.isLoading}
                  style={styles.loadMoreButton}
                  accessibilityRole="button"
                  accessibilityLabel="Weitere Gruppen laden"
                >
                  <Text style={styles.loadMoreButtonText}>{groupSearchState.isLoading ? 'Wird geladen …' : 'Mehr laden'}</Text>
                </Pressable>
              ) : null}
            </>
          )}

          <Text style={[styles.sectionTitle, styles.postsSectionTitle]}>Beiträge</Text>

          {results.length === 0 ? (
            <Text style={styles.emptySectionText}>Für „{query.trim()}“ wurden keine Beiträge gefunden.</Text>
          ) : (
            results.map((post) => (
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
      )}
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  searchInput: {
    flex: 1,
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    padding: 0,
  },
  emptySectionText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    paddingVertical: Spacing.sm,
  },
  stateText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    textAlign: 'center',
    lineHeight: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    // Respects the existing max content width used across every other screen -- no wider card
    // layout on tablet/web.
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  postsSectionTitle: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  fanLoadingContainer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  loadMoreButton: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  loadMoreButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
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
});
