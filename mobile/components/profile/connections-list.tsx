import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import type { UserProfile } from '@/data/users';

type ConnectionsListProps = {
  users: UserProfile[];
  emptyMessage: string;
  showUnfollowButton?: boolean;
  onUnfollow?: (userId: string) => void;
};

export function ConnectionsList({ users, emptyMessage, showUnfollowButton, onUnfollow }: ConnectionsListProps) {
  const router = useRouter();

  const handleOpenProfile = (userId: string) => {
    router.push({ pathname: '/profile/[id]', params: { id: userId } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {users.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol size={40} name="tray.fill" color={FeedColors.textSecondary} />
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {users.map((user) => (
            <Pressable
              key={user.id}
              onPress={() => handleOpenProfile(user.id)}
              style={styles.row}
              accessibilityLabel={`Profil von ${user.displayName} öffnen`}
            >
              <Avatar initials={user.initials} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.displayName}</Text>
                <Text style={styles.userMeta}>
                  {user.club}
                  {user.location ? ` · ${user.location}` : ''}
                </Text>
              </View>
              {showUnfollowButton ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onUnfollow?.(user.id);
                  }}
                  style={styles.unfollowButton}
                  accessibilityRole="button"
                  accessibilityLabel={`${user.displayName} entfolgen`}
                >
                  <IconSymbol size={16} name="xmark.circle.fill" color={FeedColors.textSecondary} />
                  <Text style={styles.unfollowButtonText}>Entfolgen</Text>
                </Pressable>
              ) : null}
            </Pressable>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  userInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  userName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  userMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  unfollowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  unfollowButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});
