import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, GestureResponderEvent } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { CategoryBadge } from '@/components/feed/category-badge';
import { PostMetadata } from '@/components/feed/post-metadata';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, Colors, FontSizes, FeedColors, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useProfiles } from '@/context/profile-context';
import { useSaved } from '@/context/saved-context';
import { getMeetupAttendeeCount, type FeedPost } from '@/data/feed-posts';

type FeedPostCardProps = {
  post: FeedPost;
  onPress?: () => void;
  onLikePress?: () => void;
  onCommentPress?: () => void;
};

export function FeedPostCard({ post, onPress, onLikePress, onCommentPress }: FeedPostCardProps) {
  // Self-contained, like getAuthorDisplay/getRemoteAuthorDisplay above -- the save action is the
  // same toggleSaved(post) call regardless of which screen renders this card, unlike
  // onLikePress/onCommentPress (which need screen-specific context, e.g. navigation for
  // comments), so no extra prop/call-site wiring is needed anywhere this card is already used.
  const { isSaved, toggleSaved } = useSaved();
  const saved = isSaved(post.id);
  const router = useRouter();
  const { getAuthorDisplay, isCurrentUserId } = useProfiles();
  const { getRemoteAuthorDisplay } = useFeedPosts();
  const author =
    post.source === 'supabase' && !isCurrentUserId(post.userId) ? getRemoteAuthorDisplay(post.userId) : getAuthorDisplay(post);

  const handleAuthorPress = (e: GestureResponderEvent) => {
    e.stopPropagation();
    router.push({ pathname: '/profile/[id]', params: { id: post.userId } });
  };

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <Pressable
          onPress={handleAuthorPress}
          style={styles.userBlock}
          accessibilityRole="button"
          accessibilityLabel={`Profil von ${author.displayName} öffnen`}
        >
          <View style={styles.avatarMargin}>
            <Avatar initials={author.initials} />
          </View>
          <View>
            <Text style={styles.userName}>{author.displayName}</Text>
            <Text style={styles.time}>{post.time}</Text>
          </View>
        </Pressable>
        <CategoryBadge category={post.category} />
      </View>

      {post.hasImage ? (
        <View style={styles.imageBox}>
          <Text style={styles.imageText}>Bildbereich</Text>
        </View>
      ) : null}

      {post.category === 'Treffpunkt' && post.meetupDetails ? (
        <Text style={styles.meetupTitle}>{post.meetupDetails.title}</Text>
      ) : null}

      <Text style={styles.description}>{post.description}</Text>
      <PostMetadata post={post} variant="compact" />

      {post.category === 'Treffpunkt' && post.meetupDetails ? (
        <View style={styles.attendeeRow}>
          <IconSymbol size={14} name="person.3.fill" color={FeedColors.textSecondary} />
          <Text style={styles.attendeeText}>{getMeetupAttendeeCount(post.meetupDetails)} Teilnehmer</Text>
          {post.meetupDetails.attendeeIds.some((id) => isCurrentUserId(id)) ? (
            <View style={styles.attendingTag}>
              <Text style={styles.attendingTagText}>Du nimmst teil</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          onPress={(e: GestureResponderEvent) => {
            e.stopPropagation();
            onLikePress?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={post.likedByCurrentUser ? 'Gefällt nicht mehr' : 'Gefällt mir'}
          style={[styles.metaItem, post.likedByCurrentUser && styles.metaItemActive]}
        >
          <IconSymbol size={16} name={post.likedByCurrentUser ? 'heart.fill' : 'heart'} color={post.likedByCurrentUser ? ClubColors.text : FeedColors.textSecondary} />
          <Text style={[styles.meta, post.likedByCurrentUser && styles.metaActive]}>{post.likes}</Text>
        </Pressable>

        <Pressable
          onPress={(e: GestureResponderEvent) => {
            e.stopPropagation();
            onCommentPress?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Kommentare anzeigen"
          style={styles.metaItem}
        >
          <IconSymbol size={16} name="message" color={FeedColors.textSecondary} />
          <Text style={styles.meta}>{post.comments.length}</Text>
        </Pressable>

        <Pressable
          onPress={(e: GestureResponderEvent) => {
            e.stopPropagation();
            toggleSaved(post);
          }}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Nicht mehr gespeichert' : 'Speichern'}
          style={[styles.metaItem, styles.saveButton, saved && styles.metaItemActive]}
          hitSlop={8}
        >
          <IconSymbol size={16} name={saved ? 'bookmark.fill' : 'bookmark'} color={saved ? ClubColors.text : FeedColors.textSecondary} />
        </Pressable>
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
  meetupTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  attendeeText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  attendingTag: {
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginLeft: Spacing.xs,
  },
  attendingTagText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  saveButton: {
    marginLeft: 'auto',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaItemActive: {
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  meta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  metaActive: {
    color: ClubColors.text,
  },
});
