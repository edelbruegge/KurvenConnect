import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { ProfileHeader } from '@/components/profile/profile-header';
import { ProfileStats, type ProfileStat } from '@/components/profile/profile-stats';
import { TripCard } from '@/components/trips/trip-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import type { UserProfile } from '@/data/users';

type ProfileViewProps = {
  profile: UserProfile;
  isOwnProfile: boolean;
  onEditPress?: () => void;
};

export function ProfileView({ profile, isOwnProfile, onEditPress }: ProfileViewProps) {
  const router = useRouter();
  const { posts, toggleLike } = useFeedPosts();

  const ownPosts = posts.filter((post) => post.userId === profile.id);
  const postsCount = ownPosts.filter((post) => post.category !== 'Fahrt').length;
  const tripsCount = ownPosts.filter((post) => post.category === 'Fahrt').length;
  const likesReceived = ownPosts.reduce((sum, post) => sum + post.likes, 0);

  const stats: ProfileStat[] = [
    { label: 'Beiträge', value: postsCount },
    { label: 'Fahrten', value: tripsCount },
    { label: 'Likes erhalten', value: likesReceived },
  ];

  if (isOwnProfile) {
    const commentsCount = posts.reduce(
      (sum, post) => sum + post.comments.filter((comment) => comment.username === profile.displayName).length,
      0,
    );
    stats.push({ label: 'Kommentare', value: commentsCount });
  }

  const handleOpenPost = (postId: string) => {
    router.push({ pathname: '/post/[id]', params: { id: postId } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ProfileHeader profile={profile} />

        {isOwnProfile ? (
          <Pressable onPress={onEditPress} style={styles.editButton} accessibilityRole="button" accessibilityLabel="Profil bearbeiten">
            <IconSymbol size={18} name="square.and.pencil" color={FeedColors.textPrimary} />
            <Text style={styles.editButtonText}>Profil bearbeiten</Text>
          </Pressable>
        ) : null}

        <View style={styles.statsWrapper}>
          <ProfileStats stats={stats} />
        </View>

        <Text style={styles.sectionTitle}>Beiträge & Fahrten</Text>

        {ownPosts.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol size={40} name="tray.fill" color={FeedColors.textSecondary} />
            <Text style={styles.emptyTitle}>Noch keine Aktivitäten</Text>
            <Text style={styles.emptyText}>
              {isOwnProfile
                ? 'Du hast noch keine Beiträge oder Fahrten geteilt.'
                : 'Dieser Nutzer hat noch keine Beiträge oder Fahrten geteilt.'}
            </Text>
          </View>
        ) : (
          ownPosts.map((post) =>
            post.category === 'Fahrt' ? (
              <TripCard key={post.id} post={post} onPress={() => handleOpenPost(post.id)} />
            ) : (
              <FeedPostCard
                key={post.id}
                post={post}
                onPress={() => handleOpenPost(post.id)}
                onLikePress={() => toggleLike(post.id)}
                onCommentPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id, focusComments: 'true' } })}
              />
            ),
          )
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    backgroundColor: FeedColors.cardBackground,
  },
  editButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  statsWrapper: {
    marginTop: Spacing.md,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
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
