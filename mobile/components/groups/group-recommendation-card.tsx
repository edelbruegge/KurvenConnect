import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';
import type { Group } from '@/data/groups';

type GroupRecommendationCardProps = {
  group: Group;
};

export function GroupRecommendationCard({ group }: GroupRecommendationCardProps) {
  const router = useRouter();
  const { joinGroup, requestToJoin, getJoinRequestStatus } = useGroups();

  const requestStatus = getJoinRequestStatus(group.id);
  const isPending = requestStatus === 'pending';

  const handleOpenGroup = () => {
    router.push({ pathname: '/group/[id]', params: { id: group.id } });
  };

  const handleActionPress = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();

    if (group.visibility === 'public') {
      joinGroup(group.id);
    } else {
      requestToJoin(group.id);
    }
  };

  return (
    <Pressable onPress={handleOpenGroup} style={styles.card}>
      <View style={styles.badgeRow}>
        <View style={styles.recommendationBadge}>
          <IconSymbol size={14} name="person.3.fill" color={ClubColors.text} />
          <Text style={styles.recommendationBadgeText}>Gruppe für dich</Text>
        </View>
        <View style={styles.visibilityBadge}>
          <Text style={styles.visibilityBadgeText}>{group.visibility === 'public' ? 'Öffentlich' : 'Privat'}</Text>
        </View>
      </View>

      <Text style={styles.title}>{group.name}</Text>
      <Text style={styles.meta}>
        {group.clubName}
        {group.city ? ` · ${group.city}` : ''}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {group.description}
      </Text>

      <View style={styles.footer}>
        <View style={styles.memberCount}>
          <IconSymbol size={14} name="person.3.fill" color={FeedColors.textSecondary} />
          <Text style={styles.memberCountText}>{group.memberIds.length} Mitglieder</Text>
        </View>

        {isPending ? (
          <View style={styles.pendingPill}>
            <Text style={styles.pendingPillText}>Anfrage ausstehend</Text>
          </View>
        ) : (
          <Pressable
            onPress={handleActionPress}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={group.visibility === 'public' ? `${group.name} beitreten` : `Anfrage an ${group.name} senden`}
          >
            <Text style={styles.actionButtonText}>{group.visibility === 'public' ? 'Beitreten' : 'Anfrage senden'}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
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
  meta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  description: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 20,
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
