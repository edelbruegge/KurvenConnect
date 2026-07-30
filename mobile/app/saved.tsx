import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityRow } from '@/components/activity/activity-row';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useSaved } from '@/context/saved-context';
import { getPostDetailPathname, type FeedPost, type FeedPostCategory } from '@/data/feed-posts';
import { useVisiblePosts } from '@/hooks/use-visible-posts';

const SECTION_ORDER: { category: FeedPostCategory; label: string }[] = [
  { category: 'Beitrag', label: 'Beiträge' },
  { category: 'Fahrt', label: 'Fahrten' },
  { category: 'Treffpunkt', label: 'Treffpunkte' },
  { category: 'Gesuch', label: 'Gesuchte' },
];

export default function SavedScreen() {
  const router = useRouter();
  const { getPostById } = useFeedPosts();
  const { savedItems, toggleSaved } = useSaved();

  const savedPosts = useVisiblePosts(
    savedItems.map((item) => getPostById(item.id)).filter((post): post is FeedPost => post !== undefined),
  );

  const handleOpenPost = (post: FeedPost) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {savedPosts.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol size={40} name="bookmark.fill" color={FeedColors.textSecondary} />
          <Text style={styles.emptyTitle}>Noch nichts gespeichert.</Text>
          <Text style={styles.emptyText}>Speichere Beiträge, Fahrten, Treffpunkte oder Gesuche über das Lesezeichen-Symbol.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {SECTION_ORDER.map(({ category, label }) => {
            const postsInSection = savedPosts.filter((post) => post.category === category);

            if (postsInSection.length === 0) {
              return null;
            }

            return (
              <View key={category} style={styles.section}>
                <Text style={styles.sectionTitle}>{label}</Text>
                {postsInSection.map((post) => (
                  <ActivityRow
                    key={post.id}
                    post={post}
                    onPress={() => handleOpenPost(post)}
                    trailing={
                      <Pressable
                        onPress={() => toggleSaved(post)}
                        accessibilityRole="button"
                        accessibilityLabel="Aus Gespeichert entfernen"
                        hitSlop={8}
                      >
                        <IconSymbol size={20} name="bookmark.fill" color={FeedColors.textPrimary} />
                      </Pressable>
                    }
                  />
                ))}
              </View>
            );
          })}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
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
