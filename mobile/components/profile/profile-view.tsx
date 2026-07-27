import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { ProfileHeader } from '@/components/profile/profile-header';
import { ProfileStats, type ProfileStat } from '@/components/profile/profile-stats';
import { TripCard } from '@/components/trips/trip-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useProfiles } from '@/context/profile-context';
import { getPostDetailPathname } from '@/data/feed-posts';
import type { UserProfile } from '@/data/users';

type ProfileViewProps = {
  profile: UserProfile;
  isOwnProfile: boolean;
  onEditPress?: () => void;
};

export function ProfileView({ profile, isOwnProfile, onEditPress }: ProfileViewProps) {
  const router = useRouter();
  const { posts, toggleLike } = useFeedPosts();
  const { isFollowing, followUser, unfollowUser, getFollowerCount, getFollowingCount } = useProfiles();
  const [activeTab, setActiveTab] = useState<'posts' | 'trips' | 'meetups'>('posts');

  const ownPosts = posts.filter((post) => post.userId === profile.id);
  const postsOnly = ownPosts.filter((post) => post.category !== 'Fahrt' && post.category !== 'Treffpunkt');
  const tripsOnly = ownPosts.filter((post) => post.category === 'Fahrt');
  const meetupsOnly = ownPosts.filter((post) => post.category === 'Treffpunkt');
  const postsCount = postsOnly.length;
  const tripsCount = tripsOnly.length;
  const meetupsCount = meetupsOnly.length;
  const likesReceived = ownPosts.reduce((sum, post) => sum + post.likes, 0);

  const stats: ProfileStat[] = [
    { label: 'Beiträge', value: postsCount },
    { label: 'Fahrten', value: tripsCount },
    { label: 'Likes erhalten', value: likesReceived },
  ];

  if (isOwnProfile) {
    const commentsCount = posts.reduce(
      (sum, post) =>
        sum +
        post.comments.filter((comment) =>
          comment.userId ? comment.userId === profile.id : comment.username === profile.displayName,
        ).length,
      0,
    );
    stats.push({ label: 'Kommentare', value: commentsCount });
  }

  const followStats: ProfileStat[] = [
    {
      label: 'Follower',
      value: getFollowerCount(profile.id),
      onPress: () => router.push({ pathname: '/profile/[id]/followers', params: { id: profile.id } }),
    },
    {
      label: 'Gefolgt',
      value: getFollowingCount(profile.id),
      onPress: () => router.push({ pathname: '/profile/[id]/following', params: { id: profile.id } }),
    },
  ];

  const following = isFollowing(profile.id);

  const handleFollowToggle = () => {
    if (following) {
      unfollowUser(profile.id);
    } else {
      followUser(profile.id);
    }
  };

  const handleOpenPost = (post: (typeof ownPosts)[number]) => {
    router.push({ pathname: getPostDetailPathname(post), params: { id: post.id } });
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
        ) : (
          <Pressable
            onPress={handleFollowToggle}
            style={[styles.editButton, following && styles.followingButton]}
            accessibilityRole="button"
            accessibilityLabel={following ? 'Entfolgen' : 'Folgen'}
          >
            <IconSymbol
              size={18}
              name={following ? 'checkmark.circle.fill' : 'person.badge.plus'}
              color={following ? ClubColors.text : FeedColors.textPrimary}
            />
            <Text style={[styles.editButtonText, following && styles.followingButtonText]}>
              {following ? 'Gefolgt' : 'Folgen'}
            </Text>
          </Pressable>
        )}

        <View style={styles.statsWrapper}>
          <ProfileStats stats={followStats} />
        </View>

        <View style={styles.statsWrapper}>
          <ProfileStats stats={stats} />
        </View>

        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setActiveTab('posts')}
            style={[styles.tabButton, activeTab === 'posts' && styles.tabButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Beiträge anzeigen"
          >
            <Text style={[styles.tabButtonText, activeTab === 'posts' && styles.tabButtonTextActive]}>
              Beiträge {postsCount}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('trips')}
            style={[styles.tabButton, activeTab === 'trips' && styles.tabButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Fahrten anzeigen"
          >
            <Text style={[styles.tabButtonText, activeTab === 'trips' && styles.tabButtonTextActive]}>
              Fahrten {tripsCount}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('meetups')}
            style={[styles.tabButton, activeTab === 'meetups' && styles.tabButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Treffpunkte anzeigen"
          >
            <Text style={[styles.tabButtonText, activeTab === 'meetups' && styles.tabButtonTextActive]}>
              Treffpunkte {meetupsCount}
            </Text>
          </Pressable>
        </View>

        {activeTab === 'posts' ? (
          postsOnly.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol size={40} name="tray.fill" color={FeedColors.textSecondary} />
              <Text style={styles.emptyText}>
                {isOwnProfile ? 'Du hast noch keine Beiträge geteilt.' : 'Dieser Nutzer hat noch keine Beiträge geteilt.'}
              </Text>
            </View>
          ) : (
            postsOnly.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                onPress={() => handleOpenPost(post)}
                onLikePress={() => toggleLike(post.id)}
                onCommentPress={() => router.push({ pathname: getPostDetailPathname(post), params: { id: post.id, focusComments: 'true' } })}
              />
            ))
          )
        ) : activeTab === 'trips' ? (
          tripsOnly.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol size={40} name="tray.fill" color={FeedColors.textSecondary} />
              <Text style={styles.emptyText}>
                {isOwnProfile ? 'Du hast noch keine Fahrten geteilt.' : 'Dieser Nutzer hat noch keine Fahrten geteilt.'}
              </Text>
            </View>
          ) : (
            tripsOnly.map((post) => (
              <TripCard
                key={post.id}
                post={post}
                onPress={() => handleOpenPost(post)}
                onLikePress={() => toggleLike(post.id)}
              />
            ))
          )
        ) : meetupsOnly.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol size={40} name="tray.fill" color={FeedColors.textSecondary} />
            <Text style={styles.emptyText}>
              {isOwnProfile ? 'Du hast noch keine Treffpunkte geteilt.' : 'Dieser Nutzer hat noch keine Treffpunkte geteilt.'}
            </Text>
          </View>
        ) : (
          meetupsOnly.map((post) => (
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
    borderColor: ClubColors.border,
    backgroundColor: FeedColors.cardBackground,
  },
  editButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  followingButton: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  followingButtonText: {
    color: ClubColors.text,
  },
  statsWrapper: {
    marginTop: Spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  tabButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: FeedColors.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
});
