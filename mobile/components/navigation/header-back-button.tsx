import { Pressable, StyleSheet } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors } from '@/constants/theme';
import { useSafeBack } from '@/hooks/use-safe-back';

export function HeaderBackButton() {
  const goBack = useSafeBack();

  return (
    <Pressable onPress={goBack} style={styles.button} hitSlop={8} accessibilityRole="button" accessibilityLabel="Zurück">
      <IconSymbol name="chevron.left" size={24} color={FeedColors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
});
