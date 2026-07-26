import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import type { FeedPost } from '@/data/feed-posts';

function matchesQuery(post: FeedPost, query: string): boolean {
  const haystack = [post.description, post.user, post.category];

  if (post.category === 'Fahrt' && post.tripDetails) {
    haystack.push(post.tripDetails.departure, post.tripDetails.destination);
  }

  return haystack.some((value) => value.toLowerCase().includes(query));
}

export default function SearchScreen() {
  const router = useRouter();
  const { posts, toggleLike } = useFeedPosts();
  const [query, setQuery] = useState('');

  const trimmedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!trimmedQuery) {
      return [];
    }

    return posts.filter((post) => matchesQuery(post, trimmedQuery));
  }, [posts, trimmedQuery]);

  const handleOpenPost = (postId: string) => {
    router.push({ pathname: '/post/[id]', params: { id: postId } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Suchen</Text>
          <Text style={styles.subtitle}>Finde Beiträge, Nutzer, Kategorien und Fahrten</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <IconSymbol size={20} name="magnifyingglass" color={FeedColors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Beiträge, Nutzer, Kategorien oder Fahrten suchen…"
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
        <View style={styles.stateContainer}>
          <IconSymbol size={40} name="magnifyingglass" color={FeedColors.textSecondary} />
          <Text style={styles.stateTitle}>Wonach suchst du?</Text>
          <Text style={styles.stateText}>
            Durchsuche Beitragstexte, Nutzernamen und Kategorien – bei Fahrten zusätzlich nach Start- und Zielort.
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.stateContainer}>
          <IconSymbol size={40} name="text.magnifyingglass" color={FeedColors.textSecondary} />
          <Text style={styles.stateTitle}>Keine Treffer</Text>
          <Text style={styles.stateText}>Für „{query.trim()}“ wurde nichts gefunden. Versuche einen anderen Suchbegriff.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {results.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onPress={() => handleOpenPost(post.id)}
              onLikePress={() => toggleLike(post.id)}
              onCommentPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id, focusComments: 'true' } })}
            />
          ))}
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
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  stateTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
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
  },
});
