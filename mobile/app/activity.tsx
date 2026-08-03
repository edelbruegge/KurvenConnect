import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityRow } from '@/components/activity/activity-row';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useProfiles } from '@/context/profile-context';
import { getPostDetailPathname, type FeedPost } from '@/data/feed-posts';
import { CURRENT_USER_ID } from '@/data/users';
import { useVisiblePosts } from '@/hooks/use-visible-posts';

export default function ActivityScreen() {
  const router = useRouter();
  const { posts } = useFeedPosts();
  const { isCurrentUserId } = useProfiles();
  const visiblePosts = useVisiblePosts(posts);

  const ownPosts = visiblePosts.filter((post) => isCurrentUserId(post.userId));
  const likedPosts = visiblePosts.filter((post) => post.likedByCurrentUser);
  const commentedPosts = visiblePosts.filter((post) => post.comments.some((comment) => comment.userId && isCurrentUserId(comment.userId)));
  const rideRequests = visiblePosts.filter((post) => post.category === 'Fahrt' && post.rideRequestSent);
  const meetupParticipations = visiblePosts.filter(
    (post) => post.category === 'Treffpunkt' && post.meetupDetails?.attendeeIds.includes(CURRENT_USER_ID),
  );

  const sections: { title: string; posts: FeedPost[]; emptyText: string }[] = [
    { title: 'Eigene Beiträge', posts: ownPosts, emptyText: 'Du hast noch keine eigenen Inhalte erstellt.' },
    { title: 'Gelikte Inhalte', posts: likedPosts, emptyText: 'Du hast noch nichts geliked.' },
    { title: 'Kommentierte Inhalte', posts: commentedPosts, emptyText: 'Du hast noch nichts kommentiert.' },
    { title: 'Fahrtanfragen', posts: rideRequests, emptyText: 'Du hast noch keine Fahrt angefragt.' },
    { title: 'Treffpunkt-Teilnahmen', posts: meetupParticipations, emptyText: 'Du nimmst noch an keinem Treffpunkt teil.' },
  ];

  const handleOpenPost = (post: FeedPost) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.posts.length === 0 ? (
              <View style={styles.emptyState}>
                <IconSymbol size={28} name="tray.fill" color={FeedColors.textSecondary} />
                <Text style={styles.emptyText}>{section.emptyText}</Text>
              </View>
            ) : (
              section.posts.map((post) => <ActivityRow key={post.id} post={post} onPress={() => handleOpenPost(post)} />)
            )}
          </View>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
