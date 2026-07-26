import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';

export default function HomeScreen() {
  const router = useRouter();
  const { posts, toggleLike } = useFeedPosts();

  const handleOpenPost = (postId: string) => {
    router.push({ pathname: '/post/[id]', params: { id: postId } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Kurvenconnect Feed</Text>
          <Text style={styles.subtitle}>Aktuelle Community-Updates aus dem Stadionalltag</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {posts.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            onPress={() => handleOpenPost(post.id)}
            onLikePress={() => toggleLike(post.id)}
            onCommentPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id, focusComments: 'true' } })}
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
});
