import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useBlocks } from '@/context/blocks-context';
import { useProfiles } from '@/context/profile-context';

export default function BlockedUsersScreen() {
  const { blockedUsers, unblockUser } = useBlocks();
  const { getUserById } = useProfiles();

  const blockedProfiles = blockedUsers
    .map((entry) => getUserById(entry.userId))
    .filter((profile): profile is NonNullable<typeof profile> => profile !== undefined);

  return (
    <SafeAreaView style={styles.safeArea}>
      {blockedProfiles.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol size={40} name="nosign" color={FeedColors.textSecondary} />
          <Text style={styles.emptyTitle}>Du hast noch keine Nutzer blockiert.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {blockedProfiles.map((profile) => (
            <View key={profile.id} style={styles.row}>
              <Avatar initials={profile.initials} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{profile.displayName}</Text>
                <Text style={styles.rowMeta}>
                  {profile.club}
                  {profile.location ? ` · ${profile.location}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => unblockUser(profile.id)}
                style={styles.unblockButton}
                accessibilityRole="button"
                accessibilityLabel={`${profile.displayName} entsperren`}
              >
                <Text style={styles.unblockButtonText}>Entsperren</Text>
              </Pressable>
            </View>
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
    gap: Spacing.sm,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  rowMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  unblockButton: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  unblockButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
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
    textAlign: 'center',
  },
});
