import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';
import type { Group } from '@/data/groups';
import { CURRENT_USER_ID } from '@/data/users';

export function GroupsOverview() {
  const router = useRouter();
  const { getMyGroups, getMyPendingJoinRequests } = useGroups();

  const myGroups = getMyGroups();
  const pendingGroups = getMyPendingJoinRequests();

  const handleOpenGroup = (groupId: string) => {
    router.push({ pathname: '/group/[id]', params: { id: groupId } });
  };

  const handleCreateGroup = () => {
    router.push('/create-group');
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={handleCreateGroup} style={styles.createButton} accessibilityRole="button" accessibilityLabel="Gruppe erstellen">
        <IconSymbol size={18} name="square.and.pencil" color={FeedColors.textPrimary} />
        <Text style={styles.createButtonText}>Gruppe erstellen</Text>
      </Pressable>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Meine Gruppen</Text>

        {myGroups.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol size={40} name="person.3.fill" color={FeedColors.textSecondary} />
            <Text style={styles.emptyTitle}>Du bist noch in keiner Gruppe.</Text>
            <Text style={styles.emptyText}>Passende Gruppen werden dir im Feed vorgeschlagen.</Text>
          </View>
        ) : (
          myGroups.map((group: Group) => {
            const isOwner = group.ownerId === CURRENT_USER_ID;

            return (
              <Pressable key={group.id} onPress={() => handleOpenGroup(group.id)} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{group.name}</Text>
                  <View style={styles.memberBadge}>
                    <Text style={styles.memberBadgeText}>{isOwner ? 'Inhaber' : 'Mitglied'}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>
                  {group.clubName}
                  {group.city ? ` · ${group.city}` : ''}
                </Text>
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {group.description}
                </Text>
                <View style={styles.cardFooter}>
                  <IconSymbol size={14} name="person.3.fill" color={FeedColors.textSecondary} />
                  <Text style={styles.cardFooterText}>{group.memberIds.length} Mitglieder</Text>
                </View>
              </Pressable>
            );
          })
        )}

        {pendingGroups.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Ausstehende Anfragen</Text>
            {pendingGroups.map((group) => (
              <Pressable key={group.id} onPress={() => handleOpenGroup(group.id)} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{group.name}</Text>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Anfrage ausstehend</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>
                  {group.clubName}
                  {group.city ? ` · ${group.city}` : ''}
                </Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
    backgroundColor: FeedColors.cardBackground,
  },
  createButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardTitle: {
    flex: 1,
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  cardMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  cardDescription: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  cardFooterText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  memberBadge: {
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  memberBadgeText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  pendingBadge: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  pendingBadgeText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
  },
});
