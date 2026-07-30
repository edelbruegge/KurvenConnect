import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';

export type OverflowMenuAction = {
  key: string;
  label: string;
  icon: IconSymbolName;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

type OverflowMenuProps = {
  actions: OverflowMenuAction[];
  accessibilityLabel?: string;
};

export function OverflowMenu({ actions, accessibilityLabel = 'Weitere Aktionen' }: OverflowMenuProps) {
  const [visible, setVisible] = useState(false);

  const closeMenu = () => setVisible(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={styles.trigger}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <IconSymbol size={20} name="ellipsis" color={FeedColors.textSecondary} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.backdrop} onPress={closeMenu}>
          <View style={styles.menuCard}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => {
                  closeMenu();
                  action.onPress();
                }}
                disabled={action.disabled}
                style={({ pressed }) => [styles.menuItem, pressed && !action.disabled && styles.menuItemPressed, action.disabled && styles.menuItemDisabled]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <IconSymbol size={18} name={action.icon} color={action.destructive ? StatusColors.error : ClubColors.text} />
                <Text style={[styles.menuItemText, action.destructive && styles.menuItemTextDestructive]}>{action.label}</Text>
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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuCard: {
    backgroundColor: FeedColors.cardBackground,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    paddingVertical: Spacing.xs,
    paddingBottom: Spacing.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  menuItemPressed: {
    backgroundColor: ClubColors.surface,
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuItemText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  menuItemTextDestructive: {
    color: StatusColors.error,
  },
});
