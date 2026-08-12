import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, GestureResponderEvent } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { PostMetadata } from '@/components/feed/post-metadata';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useProfiles } from '@/context/profile-context';
import { useSaved } from '@/context/saved-context';
import type { FeedPost } from '@/data/feed-posts';

type TripCardProps = {
  post: FeedPost;
  onPress?: () => void;
  onLikePress?: () => void;
};

export function TripCard({ post, onPress, onLikePress }: TripCardProps) {
  const router = useRouter();
  const { getAuthorDisplay } = useProfiles();
  const { isSaved, toggleSaved } = useSaved();
  const saved = isSaved(post.id);
  const tripDetails = post.tripDetails;

  if (!tripDetails) {
    return null;
  }

  const author = getAuthorDisplay(post);

  const handleAuthorPress = (e: GestureResponderEvent) => {
    e.stopPropagation();
    router.push({ pathname: '/profile/[id]', params: { id: post.userId } });
  };

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Pressable
          onPress={handleAuthorPress}
          style={styles.userBlock}
          accessibilityRole="button"
          accessibilityLabel={`Profil von ${author.displayName} öffnen`}
        >
          <Avatar initials={author.initials} />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{author.displayName}</Text>
            <Text style={styles.time}>{post.time}</Text>
          </View>
        </Pressable>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{tripDetails.freeSeats} frei</Text>
        </View>
      </View>

      <View style={styles.routeRow}>
        <View style={styles.routeItem}>
          <Text style={styles.routeLabel}>Start</Text>
          <Text style={styles.routeValue}>{tripDetails.departure}</Text>
        </View>
        <IconSymbol name="chevron.right" size={18} color={FeedColors.textSecondary} />
        <View style={styles.routeItem}>
          <Text style={styles.routeLabel}>Ziel</Text>
          <Text style={styles.routeValue}>{tripDetails.destination}</Text>
        </View>
      </View>

      <View style={styles.detailRow}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Abfahrt</Text>
          <Text style={styles.detailValue}>{tripDetails.departureTime}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Freie Plätze</Text>
          <Text style={styles.detailValue}>{tripDetails.freeSeats}</Text>
        </View>
      </View>

      {tripDetails.occasion ? (
        <View style={styles.occasionBox}>
          <Text style={styles.occasionText}>{tripDetails.occasion}</Text>
        </View>
      ) : null}

      <Text style={styles.description}>{post.description}</Text>

      {post.rideRequestSent ? (
        <View style={styles.requestHint}>
          <Text style={styles.requestHintText}>
            {post.rideRequestStatus === 'accepted' ? 'Anfrage angenommen' : 'Anfrage gesendet'}
          </Text>
        </View>
      ) : null}

      <PostMetadata post={post} variant="compact" />

      <View style={styles.footer}>
        <Pressable
          onPress={(e: GestureResponderEvent) => {
            e.stopPropagation();
            onLikePress?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={post.likedByCurrentUser ? 'Gefällt nicht mehr' : 'Gefällt mir'}
          style={[styles.footerItem, post.likedByCurrentUser && styles.footerItemActive]}
        >
          <IconSymbol
            size={16}
            name={post.likedByCurrentUser ? 'heart.fill' : 'heart'}
            color={post.likedByCurrentUser ? ClubColors.text : FeedColors.textSecondary}
          />
          <Text style={[styles.footerText, post.likedByCurrentUser && styles.footerTextActive]}>{post.likes}</Text>
        </Pressable>
        <View style={styles.footerItem}>
          <IconSymbol size={16} name="message" color={FeedColors.textSecondary} />
          <Text style={styles.footerText}>{post.comments.length}</Text>
        </View>

        <Pressable
          onPress={(e: GestureResponderEvent) => {
            e.stopPropagation();
            toggleSaved(post);
          }}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Nicht mehr gespeichert' : 'Speichern'}
          style={[styles.footerItem, styles.saveButton, saved && styles.footerItemActive]}
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
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  userBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userInfo: {
    marginLeft: Spacing.sm,
  },
  userName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  time: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#1F2937',
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  routeItem: {
    flex: 1,
  },
  routeLabel: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: 2,
  },
  routeValue: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: 2,
  },
  detailValue: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  occasionBox: {
    backgroundColor: '#1F2937',
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-start',
  },
  occasionText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  description: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  requestHint: {
    alignSelf: 'flex-start',
    backgroundColor: '#1F2937',
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginBottom: Spacing.sm,
  },
  requestHintText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  saveButton: {
    marginLeft: 'auto',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerItemActive: {
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  footerText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  footerTextActive: {
    color: ClubColors.text,
  },
});
