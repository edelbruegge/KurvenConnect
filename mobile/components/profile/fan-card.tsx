import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useProfiles } from '@/context/profile-context';
import type { UserProfile } from '@/data/users';

type FanCardProps = {
  user: UserProfile;
};

/**
 * A row in "Fans von [Verein]" (app/(tabs)/search.tsx) -- mirrors the established
 * row-with-action-button card pattern (components/groups/remote-group-suggestion-card.tsx) and
 * reuses the exact Folgen/Gefolgt button language already established in
 * components/profile/profile-view.tsx. No own follow state: reads/writes directly through
 * useProfiles(), the same connections context every other follow UI in the app uses, so a
 * follow/unfollow here is instantly consistent with the profile screen, follower/following lists,
 * and the "Folge ich" feed.
 */
export function FanCard({ user }: FanCardProps) {
  const router = useRouter();
  const { isFollowing, followUser, unfollowUser } = useProfiles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const following = isFollowing(user.id);

  const handleOpenProfile = () => {
    router.push({ pathname: '/profile/[id]', params: { id: user.id } });
  };

  const handleToggleFollow = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { error: actionError } = following ? await unfollowUser(user.id) : await followUser(user.id);

    setIsSubmitting(false);

    if (actionError) {
      setError(actionError);
    }
  };

  return (
    <Pressable onPress={handleOpenProfile} style={styles.card} accessibilityRole="button" accessibilityLabel={`Profil von ${user.displayName} öffnen`}>
      <Avatar initials={user.initials} avatarUrl={user.avatarUrl} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {user.displayName}
        </Text>
        {user.location ? (
          <Text style={styles.meta} numberOfLines={1}>
            {user.location}
          </Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          void handleToggleFollow();
        }}
        disabled={isSubmitting}
        style={[styles.followButton, following && styles.followingButton, isSubmitting && styles.followButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={following ? `${user.displayName} entfolgen` : `${user.displayName} folgen`}
      >
        <IconSymbol size={16} name={following ? 'checkmark.circle.fill' : 'person.badge.plus'} color={following ? ClubColors.text : FeedColors.textPrimary} />
        <Text style={[styles.followButtonText, following && styles.followingButtonText]}>{following ? 'Gefolgt' : 'Folgen'}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  info: {
    flex: 1,
    marginLeft: Spacing.sm,
    marginRight: Spacing.sm,
  },
  name: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  meta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  errorText: {
    color: StatusColors.error,
    fontSize: FontSizes.badge,
    marginTop: Spacing.xs,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  followingButton: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  followButtonDisabled: {
    opacity: 0.5,
  },
  followButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  followingButtonText: {
    color: ClubColors.text,
  },
});
