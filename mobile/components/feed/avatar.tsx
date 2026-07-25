import { StyleSheet, Text, View } from 'react-native';

import { Colors, FontSizes } from '@/constants/theme';

type AvatarProps = {
  initials: string;
  size?: number;
  backgroundColor?: string;
};

export function Avatar({ initials, size = 40, backgroundColor }: AvatarProps) {
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
