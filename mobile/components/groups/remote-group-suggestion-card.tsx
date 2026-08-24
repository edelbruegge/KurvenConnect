import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';
import type { GroupSuggestion } from '@/data/groups';

type RemoteGroupSuggestionCardProps = {
  suggestion: GroupSuggestion;
  // Defaults to the original "Gruppe für dich" recommendation framing (Feed tab). search.tsx passes
  // a plain "Gruppe" label instead -- these are real search matches, not a personalized suggestion.
  badgeLabel?: string;
};

// Deliberately does not navigate anywhere on tap — a non-member has no full group page to see
// (see app/group/[id].tsx's membership guard), so this card is not wrapped in a
// Pressable-that-opens-the-group. Only the action button does anything.
export function RemoteGroupSuggestionCard({ suggestion, badgeLabel = 'Gruppe für dich' }: RemoteGroupSuggestionCardProps) {
  const router = useRouter();
  const { joinPublicGroup, requestPrivateGroupJoin, cancelJoinRequest, myJoinRequests, isGroupActionSubmitting } = useGroups();
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pendingRequest = myJoinRequests.find((request) => request.groupId === suggestion.id);

  const handleJoinOrRequest = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    const { error } = suggestion.visibility === 'public' ? await joinPublicGroup(suggestion.id) : await requestPrivateGroupJoin(suggestion.id);

    setIsSubmitting(false);

    if (error) {
      setLocalError(error);
    }
  };

  const handleCancel = async () => {
    if (!pendingRequest || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);
    const { error } = await cancelJoinRequest(pendingRequest.id);
    setIsSubmitting(false);

    if (error) {
      setLocalError(error);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <View style={styles.recommendationBadge}>
          <IconSymbol size={14} name="person.3.fill" color={ClubColors.text} />
          <Text style={styles.recommendationBadgeText}>{badgeLabel}</Text>
        </View>
        <View style={styles.visibilityBadge}>
          <Text style={styles.visibilityBadgeText}>{suggestion.visibility === 'public' ? 'Öffentlich' : 'Geschlossen'}</Text>
        </View>
      </View>

      <Text style={styles.title}>{suggestion.name}</Text>
      {suggestion.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {suggestion.description}
        </Text>
      ) : null}

      {localError ? <Text style={styles.errorText}>{localError}</Text> : null}

      <View style={styles.footer}>
        <View style={styles.memberCount}>
          <IconSymbol size={14} name="person.3.fill" color={FeedColors.textSecondary} />
          <Text style={styles.memberCountText}>{suggestion.memberCount} Mitglieder</Text>
        </View>

        {suggestion.isMember ? (
          <Pressable
            onPress={() => router.push({ pathname: '/group/[id]', params: { id: suggestion.id } })}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={`${suggestion.name} öffnen`}
          >
            <Text style={styles.actionButtonText}>Öffnen</Text>
          </Pressable>
        ) : pendingRequest ? (
          <Pressable
            onPress={() => void handleCancel()}
            disabled={isGroupActionSubmitting && isSubmitting}
            style={styles.pendingPill}
            accessibilityRole="button"
            accessibilityLabel="Anfrage zurückziehen"
          >
            <Text style={styles.pendingPillText}>{isSubmitting ? 'Wird zurückgezogen …' : 'Angefragt · Zurückziehen'}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void handleJoinOrRequest()}
            disabled={isSubmitting}
            style={[styles.actionButton, isSubmitting && styles.actionButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={suggestion.visibility === 'public' ? `${suggestion.name} beitreten` : `Beitritt zu ${suggestion.name} anfragen`}
          >
            <Text style={styles.actionButtonText}>
              {isSubmitting ? 'Wird gesendet …' : suggestion.visibility === 'public' ? 'Beitreten' : 'Beitritt anfragen'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: ClubColors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recommendationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  recommendationBadgeText: {
    color: ClubColors.text,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  visibilityBadge: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  visibilityBadgeText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    fontWeight: '600',
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  description: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  errorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  memberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberCountText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  actionButton: {
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  pendingPill: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  pendingPillText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
