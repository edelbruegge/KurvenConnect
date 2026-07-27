import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripCard } from '@/components/trips/trip-card';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { getPostDetailPathname, type FeedPost } from '@/data/feed-posts';

export default function TripsScreen() {
  const router = useRouter();
  const { posts, toggleLike } = useFeedPosts();

  const trips = posts.filter((post) => post.category === 'Fahrt');

  const handleOpenPost = (post: FeedPost) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Fahrten</Text>
          <Text style={styles.subtitle}>Lokale Fahrgemeinschaften zum Spieltag</Text>
        </View>
      </View>

      {trips.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Noch keine Fahrten vorhanden.</Text>
          <Text style={styles.emptyText}>Über den Plus-Button kannst du direkt eine neue Fahrt anlegen.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              post={trip}
              onPress={() => handleOpenPost(trip)}
              onLikePress={() => toggleLike(trip.id)}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
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
    marginBottom: Spacing.xs,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
  },
});
