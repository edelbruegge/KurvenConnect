import { StyleSheet, Text, View } from 'react-native';

import { CategoryColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import type { FeedPostCategory } from '@/data/feed-posts';

type CategoryBadgeProps = {
  category: FeedPostCategory;
};

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: CategoryColors[category] }]}> 
      <Text style={styles.badgeText}>{category}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  badgeText: {
    color: FeedColors.badgeText,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
});
