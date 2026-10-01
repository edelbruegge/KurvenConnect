import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, FontSizes } from '@/constants/theme';

type AvatarProps = {
  initials: string;
  // Real, persisted profile picture -- when present, rendered as a circularly cropped image
  // instead of the initials fallback. Undefined/empty for every user without one. This is the
  // single place avatar-vs-initials logic lives; every screen that shows a user just passes
  // whatever avatarUrl it already resolved (feed author, comment author, follower, group member,
  // chat participant, notification actor, ...) -- no screen-specific copies of this branch.
  avatarUrl?: string;
  size?: number;
  backgroundColor?: string;
};

export function Avatar({ initials, avatarUrl, size = 40, backgroundColor }: AvatarProps) {
  if (avatarUrl) {
    // contentFit="cover" is the deliberate exception to the post-media carousel's "contain, never
    // crop" rule -- the user already square-cropped this image themselves at upload time (see
    // lib/avatar-media.ts), so filling the circle exactly is the correct, expected avatar look.
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.dark.tint }]}
        contentFit="cover"
        cachePolicy="disk"
      />
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: backgroundColor ?? Colors.dark.tint },
      ]}>
      <Text style={styles.initials}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: Colors.dark.background,
    fontSize: FontSizes.avatar,
    fontWeight: '700',
  },
});
