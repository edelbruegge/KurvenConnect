import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';

type InviteUserCardProps = {
  groupId: string;
  user: { id: string; displayName: string; avatarUrl?: string; location?: string };
  alreadyInvited: boolean;
  // Set only for a subgroup invite where the candidate isn't (yet known to be) a member of the
  // parent group -- shown instead of the invite button rather than hiding the result outright
  // (Vorgabe 9: "anzeigen, aber Button deaktiviert mit verständlichem Grund"). The RPC itself
  // enforces this regardless; this is purely a proactive UX hint, never the security boundary.
  disabledReason?: string;
};

/**
 * A row in "Mitglieder einladen" (app/group/[id]/members.tsx) -- mirrors the established
 * row-with-action-button card pattern (components/profile/fan-card.tsx) exactly, but for
 * invite_user_to_group instead of follow/unfollow. Reuses the same Avatar/layout/theme tokens, no
 * new visual language.
 */
export function InviteUserCard({ groupId, user, alreadyInvited, disabledReason }: InviteUserCardProps) {
  const { inviteUserToGroup } = useGroups();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invited, setInvited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInvited = alreadyInvited || invited;
  const isBlocked = Boolean(disabledReason) && !isInvited;

  const handleInvite = async () => {
    if (isSubmitting || isInvited || isBlocked) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { error: actionError } = await inviteUserToGroup(groupId, user.id, {
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });

    setIsSubmitting(false);

    if (actionError) {
      setError(actionError);
      return;
    }

    setInvited(true);
  };

  return (
    <View style={styles.card}>
      <Avatar initials={user.displayName.slice(0, 1)} avatarUrl={user.avatarUrl} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {user.displayName}
        </Text>
        {user.location ? (
          <Text style={styles.meta} numberOfLines={1}>
            {user.location}
          </Text>
        ) : null}
        {isBlocked ? <Text style={styles.disabledReasonText}>{disabledReason}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <Pressable
        onPress={() => void handleInvite()}
        disabled={isSubmitting || isInvited || isBlocked}
        style={[
          styles.inviteButton,
          isInvited && styles.invitedButton,
          (isSubmitting || isInvited || isBlocked) && styles.inviteButtonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          isInvited ? `${user.displayName} bereits eingeladen` : isBlocked ? `${user.displayName}: ${disabledReason}` : `${user.displayName} einladen`
        }
      >
        <IconSymbol size={16} name={isInvited ? 'checkmark.circle.fill' : 'person.badge.plus'} color={isInvited ? ClubColors.text : FeedColors.textPrimary} />
        <Text style={[styles.inviteButtonText, isInvited && styles.invitedButtonText]}>
          {isSubmitting ? 'Wird eingeladen …' : isInvited ? 'Eingeladen' : isBlocked ? 'Nicht möglich' : 'Einladen'}
        </Text>
      </Pressable>
    </View>
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
  disabledReasonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    marginTop: Spacing.xs,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  invitedButton: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  inviteButtonDisabled: {
    opacity: 0.5,
  },
  inviteButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  invitedButtonText: {
    color: ClubColors.text,
  },
});
