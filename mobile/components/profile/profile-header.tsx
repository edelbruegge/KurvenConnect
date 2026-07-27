import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import type { UserProfile } from '@/data/users';

type ProfileHeaderProps = {
  profile: UserProfile;
};

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  return (
    <View style={styles.container}>
      <Avatar initials={profile.initials} size={72} />
      <Text style={styles.name}>{profile.displayName}</Text>

      <View style={styles.infoRow}>
        <IconSymbol size={16} name="shield.fill" color={FeedColors.textSecondary} />
        <Text style={styles.infoText}>{profile.club}</Text>
      </View>

      <View style={styles.infoRow}>
        <IconSymbol size={16} name="mappin.and.ellipse" color={FeedColors.textSecondary} />
        <Text style={styles.infoText}>{profile.location}</Text>
      </View>

      <View style={styles.infoRow}>
        <IconSymbol size={16} name="calendar" color={FeedColors.textSecondary} />
        <Text style={styles.infoText}>Mitglied seit {profile.memberSince}</Text>
      </View>

      <Text style={styles.bio}>{profile.bio}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  name: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  infoText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    flexShrink: 1,
  },
  bio: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing.md,
  },
});
