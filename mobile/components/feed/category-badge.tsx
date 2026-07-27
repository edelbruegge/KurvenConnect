import { StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { CategoryLabels, ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import type { FeedPostCategory } from '@/data/feed-posts';

type CategoryBadgeProps = {
  category: FeedPostCategory;
};

const CATEGORY_ICON_NAME = {
  Beitrag: 'doc.text.fill',
  Fahrt: 'car.fill',
  Gesuch: 'magnifyingglass',
} as const;

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <View style={styles.badge}>
      <IconSymbol size={12} name={CATEGORY_ICON_NAME[category]} color={ClubColors.text} />
      <Text style={styles.badgeText}>{CategoryLabels[category]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  badgeText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
});
