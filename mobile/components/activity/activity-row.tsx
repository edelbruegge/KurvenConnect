import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryBadge } from '@/components/feed/category-badge';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import type { FeedPost } from '@/data/feed-posts';

type ActivityRowProps = {
  post: FeedPost;
  onPress: () => void;
  trailing?: ReactNode;
};

function getRowTitle(post: FeedPost): string {
  if (post.category === 'Treffpunkt' && post.meetupDetails) {
    return post.meetupDetails.title;
  }

  if (post.category === 'Fahrt' && post.tripDetails) {
    return `${post.tripDetails.departure} → ${post.tripDetails.destination}`;
  }

  if (post.category === 'Gesuch' && post.requestDetails) {
    return post.requestDetails.requestedService;
  }

  return post.description;
}

export function ActivityRow({ post, onPress, trailing }: ActivityRowProps) {
  const title = getRowTitle(post);

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <CategoryBadge category={post.category} />
          <Text style={styles.time}>{post.time}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.description} numberOfLines={1}>
          {post.description}
        </Text>
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  rowContent: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  description: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  time: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
});
