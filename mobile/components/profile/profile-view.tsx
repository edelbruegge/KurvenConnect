import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPostCard } from '@/components/feed/feed-post-card';
import { MessagesButton } from '@/components/navigation/messages-button';
import { NotificationsButton } from '@/components/navigation/notifications-button';
import { AccountSection } from '@/components/profile/account-section';
import { ProfileHeader } from '@/components/profile/profile-header';
import { PushNotificationsSection } from '@/components/profile/push-notifications-section';
import { ProfileStats, type ProfileStat } from '@/components/profile/profile-stats';
import { TripCard } from '@/components/trips/trip-card';
import { ReportModal } from '@/components/reports/report-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useBlocks } from '@/context/blocks-context';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useMessages } from '@/context/messages-context';
import { useProfiles } from '@/context/profile-context';
import { useReports } from '@/context/reports-context';
import { getPostDetailPathname } from '@/data/feed-posts';
import type { UserProfile } from '@/data/users';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';
import { useVisiblePosts } from '@/hooks/use-visible-posts';

type ProfileViewProps = {
  profile: UserProfile;
  isOwnProfile: boolean;
  onEditPress?: () => void;
};

export function ProfileView({ profile, isOwnProfile, onEditPress }: ProfileViewProps) {
  const router = useRouter();
  const { posts, toggleLike } = useFeedPosts();
  const { getOrCreateConversation, getOrCreateDirectConversation } = useMessages();
  const { isFollowing, followUser, unfollowUser, getFollowerCount, getFollowingCount, isContentOwnedByCurrentUser } = useProfiles();
  const { hasReported } = useReports();
  const { isBlocked, blockUser, unblockUser, blockRemoteUser, unblockRemoteUser } = useBlocks();
  const { canMessageUser } = useSafetySelectors();
  const [activeTab, setActiveTab] = useState<'posts' | 'trips' | 'meetups'>('posts');
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [isBlockActionPending, setIsBlockActionPending] = useState(false);
  const [blockActionError, setBlockActionError] = useState<string | null>(null);

  const ownPosts = useVisiblePosts(
    posts.filter((post) =>
      isOwnProfile ? isContentOwnedByCurrentUser({ source: post.source, ownerId: post.userId }) : post.userId === profile.id,
    ),
  );
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
          comment.userId
            ? isContentOwnedByCurrentUser({ source: comment.source, ownerId: comment.userId })
            : comment.username === profile.displayName,
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

  const handleMessagePress = async () => {
    if (isStartingConversation) {
      return;
    }

    if (profile.source !== 'supabase') {
      const conversationId = getOrCreateConversation(profile.id);
      router.push({ pathname: '/messages/[id]', params: { id: conversationId } });
      return;
    }

    setIsStartingConversation(true);
    setMessageError(null);
    const { conversationId, error } = await getOrCreateDirectConversation({ otherUserId: profile.id });
    setIsStartingConversation(false);

    if (error || !conversationId) {
      setMessageError(error ?? 'Die Unterhaltung konnte nicht gestartet werden.');
      return;
    }

    router.push({
      pathname: '/messages/[id]',
      params: { id: conversationId, referenceType: 'profile', referenceId: profile.id, referenceTitle: profile.displayName },
    });
  };

  const handleBlockTogglePress = async () => {
    if (isBlockActionPending) {
      return;
    }

    const currentlyBlocked = isBlocked(profile.id);

    if (profile.source !== 'supabase') {
      if (currentlyBlocked) {
        unblockUser(profile.id);
      } else {
        blockUser(profile.id);
      }
      return;
    }

    setIsBlockActionPending(true);
    setBlockActionError(null);
    const { error } = currentlyBlocked ? await unblockRemoteUser(profile.id) : await blockRemoteUser(profile.id);
    setIsBlockActionPending(false);

    if (error) {
      setBlockActionError(error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {isOwnProfile ? (
        <View style={styles.headerRow}>
          <NotificationsButton />
          <MessagesButton />
        </View>
      ) : null}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ProfileHeader profile={profile} />

        {isOwnProfile ? (
          <>
            <Pressable onPress={onEditPress} style={styles.editButton} accessibilityRole="button" accessibilityLabel="Profil bearbeiten">
              <IconSymbol size={18} name="square.and.pencil" color={FeedColors.textPrimary} />
              <Text style={styles.editButtonText}>Profil bearbeiten</Text>
            </Pressable>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => router.push('/saved')}
                style={[styles.editButton, styles.actionRowButton]}
                accessibilityRole="button"
                accessibilityLabel="Gespeichert öffnen"
              >
                <IconSymbol size={18} name="bookmark.fill" color={FeedColors.textPrimary} />
                <Text style={styles.editButtonText}>Gespeichert</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/activity')}
                style={[styles.editButton, styles.actionRowButton]}
                accessibilityRole="button"
                accessibilityLabel="Meine Aktivitäten öffnen"
              >
                <IconSymbol size={18} name="clock.arrow.circlepath" color={FeedColors.textPrimary} />
                <Text style={styles.editButtonText}>Meine Aktivitäten</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => router.push('/blocked-users')}
              style={styles.editButton}
              accessibilityRole="button"
              accessibilityLabel="Blockierte Nutzer öffnen"
            >
              <IconSymbol size={18} name="nosign" color={FeedColors.textPrimary} />
              <Text style={styles.editButtonText}>Blockierte Nutzer</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/moderation')}
              style={styles.editButton}
              accessibilityRole="button"
              accessibilityLabel="Moderation – lokale Demo öffnen"
            >
              <IconSymbol size={18} name="shield.fill" color={FeedColors.textPrimary} />
              <Text style={styles.editButtonText}>Moderation – lokale Demo</Text>
            </Pressable>
            <AccountSection />
            <PushNotificationsSection />
          </>
        ) : (
          <View style={styles.actionRowWrapper}>
            <View style={styles.actionRow}>
              <Pressable
                onPress={handleFollowToggle}
                style={[styles.editButton, styles.actionRowButton, following && styles.followingButton]}
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
              {canMessageUser(profile.id) ? (
                <Pressable
                  onPress={() => void handleMessagePress()}
                  disabled={isStartingConversation}
                  style={[styles.editButton, styles.actionRowButton, isStartingConversation && styles.actionButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={`Nachricht an ${profile.displayName} schreiben`}
                >
                  <IconSymbol size={18} name="message" color={FeedColors.textPrimary} />
                  <Text style={styles.editButtonText}>{isStartingConversation ? 'Wird gestartet …' : 'Nachricht'}</Text>
                </Pressable>
              ) : null}
            </View>
            {messageError ? <Text style={styles.messageErrorText}>{messageError}</Text> : null}
            {blockActionError ? <Text style={styles.messageErrorText}>{blockActionError}</Text> : null}
            <View style={styles.profileOverflowWrapper}>
              <OverflowMenu
                accessibilityLabel="Weitere Aktionen zu diesem Nutzer"
                actions={[
                  {
                    key: 'report-user',
                    label: hasReported('user', profile.id) ? 'Bereits gemeldet' : 'Nutzer melden',
                    icon: 'flag.fill',
                    disabled: hasReported('user', profile.id),
                    onPress: () => setReportModalVisible(true),
                  },
                  {
                    key: 'block-user',
                    label: isBlockActionPending
                      ? 'Wird bearbeitet …'
                      : isBlocked(profile.id)
                        ? 'Nutzer entsperren'
                        : 'Nutzer blockieren',
                    icon: 'nosign',
                    destructive: !isBlocked(profile.id),
                    disabled: isBlockActionPending,
                    onPress: () => void handleBlockTogglePress(),
                  },
                ]}
              />
            </View>
          </View>
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
      {!isOwnProfile ? (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          title="Nutzer melden"
          targetType="user"
          targetId={profile.id}
          source={profile.source}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
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
  actionRowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  profileOverflowWrapper: {
    marginTop: Spacing.md,
  },
  actionRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionRowButton: {
    flex: 1,
    marginTop: Spacing.md,
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
  actionButtonDisabled: {
    opacity: 0.5,
  },
  messageErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
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
