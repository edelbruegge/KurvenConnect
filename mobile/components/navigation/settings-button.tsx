import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors } from '@/constants/theme';

export function SettingsButton() {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/settings')}
      style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel="Einstellungen öffnen"
    >
      <IconSymbol size={24} name="gearshape.fill" color={FeedColors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerPressed: {
    backgroundColor: ClubColors.surface,
  },
});
