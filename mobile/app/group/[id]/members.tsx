import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { ConnectionsList } from '@/components/profile/connections-list';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import type { UserProfile } from '@/data/users';
import { getInitialsFromName } from '@/lib/map-supabase-profile';

export default function GroupMembersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { getGroupById, groupMembers, groupMembersError, refreshGroupMembers } = useGroups();
  const { getUserById } = useProfiles();
  const { isUserSuspended } = useModeration();

  const group = params.id ? getGroupById(params.id) : undefined;
  const isRemoteGroup = group?.source === 'supabase';
  const remoteMembers = group ? groupMembers[group.id] : undefined;

  useEffect(() => {
    if (group && isRemoteGroup) {
      refreshGroupMembers(group.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, isRemoteGroup]);

  if (!group) {
    return <NotFoundView title="Gruppe nicht gefunden" message="Die angeforderte Gruppe konnte nicht gefunden werden." />;
  }

  if (isRemoteGroup) {
    if (remoteMembers === undefined) {
      if (groupMembersError) {
        return <NotFoundView title="Mitglieder nicht verfügbar" message={groupMembersError} />;
      }

      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={FeedColors.textPrimary} />
        </View>
      );
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        {remoteMembers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Diese Gruppe hat noch keine Mitglieder.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {remoteMembers.map((member) => (
              <Pressable
                key={member.userId}
                onPress={() => router.push({ pathname: '/profile/[id]', params: { id: member.userId } })}
                style={styles.row}
                accessibilityLabel={`Profil von ${member.displayName} öffnen`}
              >
                <Avatar initials={getInitialsFromName(member.displayName)} />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  <Text style={styles.memberMeta}>Mitglied seit {member.joinedAt}</Text>
                </View>
                <View style={[styles.roleBadge, member.role === 'admin' && styles.roleBadgeAdmin]}>
                  <Text style={[styles.roleBadgeText, member.role === 'admin' && styles.roleBadgeTextAdmin]}>
                    {member.role === 'admin' ? 'Admin' : 'Mitglied'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  const members = group.memberIds
    .map((memberId) => getUserById(memberId))
    .filter((profile): profile is UserProfile => profile !== undefined)
    .filter((profile) => !isUserSuspended(profile.id));

  return <ConnectionsList users={members} emptyMessage="Diese Gruppe hat noch keine Mitglieder." />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FeedColors.background,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  memberInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  memberName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  memberMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  roleBadgeAdmin: {
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  roleBadgeText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  roleBadgeTextAdmin: {
    color: ClubColors.text,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
  },
});
