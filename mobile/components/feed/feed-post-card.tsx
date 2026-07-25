import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { CategoryBadge } from '@/components/feed/category-badge';
import { Colors, FontSizes, FeedColors, Radii, Spacing } from '@/constants/theme';
import type { FeedPost } from '@/data/feed-posts';

type FeedPostCardProps = {
  post: FeedPost;
  onPress?: () => void;
};

export function FeedPostCard({ post, onPress }: FeedPostCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.userBlock}>
          <View style={styles.avatarMargin}>
            <Avatar initials={post.initials} />
          </View>
          <View>
            <Text style={styles.userName}>{post.user}</Text>
            <Text style={styles.time}>{post.time}</Text>
          </View>
        </View>
        <CategoryBadge category={post.category} />
      </View>

      {post.hasImage ? (
        <View style={styles.imageBox}>
          <Text style={styles.imageText}>Bildbereich</Text>
        </View>
      ) : null}

      <Text style={styles.description}>{post.description}</Text>

      <View style={styles.footer}>
        <Text style={styles.meta}>❤ {post.likes}</Text>
        <Text style={styles.meta}>💬 {post.comments.length}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  userBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarMargin: {
    marginRight: Spacing.sm,
  },
  userName: {
    color: Colors.dark.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  time: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 1,
  },
  imageBox: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.md,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  imageText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  description: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  meta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
});
