import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';

type MenuEntry = {
  key: string;
  label: string;
  icon: IconSymbolName;
  onPress: () => void;
};

export function MainMenuButton() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  const closeMenu = () => setVisible(false);

  const entries: MenuEntry[] = [
    {
      key: 'meetups',
      label: 'Treffpunkte',
      icon: 'mappin.and.ellipse',
      onPress: () => {
        closeMenu();
        router.push('/meetups');
      },
    },
  ];

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={styles.trigger}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Hauptmenü öffnen"
      >
        <IconSymbol size={24} name="line.3.horizontal" color={FeedColors.textPrimary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.backdrop} onPress={closeMenu}>
          <View style={styles.menuCard}>
            {entries.map((entry) => (
              <Pressable
                key={entry.key}
                onPress={entry.onPress}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                accessibilityRole="button"
                accessibilityLabel={entry.label}
              >
                <IconSymbol size={20} name={entry.icon} color={ClubColors.text} />
                <Text style={styles.menuItemText}>{entry.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Spacing.xl + 24,
    paddingRight: Spacing.lg,
  },
  menuCard: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    minWidth: 200,
    paddingVertical: Spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  menuItemPressed: {
    backgroundColor: ClubColors.surface,
  },
  menuItemText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
