import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ConnectionsList } from '@/components/profile/connections-list';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import { useRefreshOnFocus } from '@/hooks/use-refresh-on-focus';

export default function FollowingScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { getUserById, getFollowingListState, loadFollowingList, unfollowUser, currentUser, connectionsRealtimeStatus } =
    useProfiles();
  const { isUserSuspended } = useModeration();

  const profile = params.id ? getUserById(params.id) : undefined;

  useEffect(() => {
    if (profile) {
      loadFollowingList(profile.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Safety net only -- while the user-follows channel is healthy, this list already stays live
  // via the realtime handler's targeted loadFollowingList() re-fetch in profile-context.tsx.
  useRefreshOnFocus(() => {
    if (profile) {
      loadFollowingList(profile.id);
    }
  }, connectionsRealtimeStatus === 'subscribed');

  if (!profile) {
    return <NotFoundView title="Profil nicht gefunden" message="Das angeforderte Profil konnte nicht gefunden werden." />;
  }

  const isOwnProfile = profile.id === currentUser.id;
  const { users, isLoading, error, hasLoadedOnce } = getFollowingListState(profile.id);
  const following = users.filter((user) => !isUserSuspended(user.id));
  const emptyMessage = isOwnProfile ? 'Folgt noch niemandem' : 'Dieser Nutzer folgt noch niemandem.';

  // Re-syncs the list with the server right after a successful unfollow -- see
  // context/profile-context.tsx's loadFollowingList; the list is a shared, on-demand-loaded
  // cache, not local component state, so refetching it is how "verschwindet unmittelbar" is
  // satisfied here without duplicating list-splicing logic in every screen that shows it.
  const handleUnfollow = async (userId: string) => {
    const { error: unfollowError } = await unfollowUser(userId);
    if (!unfollowError) {
      loadFollowingList(profile.id);
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => loadFollowingList(profile.id)}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Erneut versuchen"
          >
            <Text style={styles.retryButtonText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading && !hasLoadedOnce) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={FeedColors.textPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ConnectionsList
      users={following}
      emptyMessage={emptyMessage}
      showUnfollowButton={isOwnProfile}
      onUnfollow={isOwnProfile ? (userId) => void handleUnfollow(userId) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  retryButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  retryButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
});
