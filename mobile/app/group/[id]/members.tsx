import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ConnectionsList } from '@/components/profile/connections-list';
import { FeedColors } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import type { UserProfile } from '@/data/users';
import { getInitialsFromName, mapSupabaseProfileRow, type SupabaseProfileRow } from '@/lib/map-supabase-profile';
import { supabase } from '@/lib/supabase';

const PROFILE_SELECT_COLUMNS = 'id, display_name, club, location, bio, avatar_url, created_at, updated_at';

export default function GroupMembersScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { getGroupById } = useGroups();
  const { getUserById } = useProfiles();
  const { isUserSuspended } = useModeration();

  const group = params.id ? getGroupById(params.id) : undefined;
  const isRemoteGroup = group?.source === 'supabase';

  const [remoteMembers, setRemoteMembers] = useState<UserProfile[] | null>(null);
  const [isRemoteMembersLoading, setIsRemoteMembersLoading] = useState(false);

  useEffect(() => {
    if (!group || !isRemoteGroup) {
      setRemoteMembers(null);
      return;
    }

    let isCurrent = true;
    setIsRemoteMembersLoading(true);

    supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .then(async ({ data: memberRows, error: memberError }) => {
        if (!isCurrent) return;

        if (memberError || !memberRows || memberRows.length === 0) {
          setRemoteMembers([]);
          setIsRemoteMembersLoading(false);
          return;
        }

        const userIds = (memberRows as { user_id: string }[]).map((row) => row.user_id);

        const { data: profileRows } = await supabase.from('profiles').select(PROFILE_SELECT_COLUMNS).in('id', userIds);

        if (!isCurrent) return;

        const mapped = ((profileRows ?? []) as SupabaseProfileRow[]).map((row) => {
          const profile = mapSupabaseProfileRow(row);
          return {
            id: profile.id,
            displayName: profile.displayName,
            initials: getInitialsFromName(profile.displayName),
            club: profile.club || '',
            location: profile.location || '',
            bio: profile.bio || '',
            memberSince: profile.createdAt ? new Date(profile.createdAt).getFullYear().toString() : '',
            isCurrentUser: false,
            avatarUrl: profile.avatarUrl ?? undefined,
            source: 'supabase' as const,
          };
        });

        setRemoteMembers(mapped);
        setIsRemoteMembersLoading(false);
      });

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, isRemoteGroup]);

  if (!group) {
    return <NotFoundView title="Gruppe nicht gefunden" message="Die angeforderte Gruppe konnte nicht gefunden werden." />;
  }

  if (isRemoteGroup) {
    if (isRemoteMembersLoading || remoteMembers === null) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={FeedColors.textPrimary} />
        </View>
      );
    }

    return <ConnectionsList users={remoteMembers} emptyMessage="Diese Gruppe hat noch keine Mitglieder." />;
  }

  const members = group.memberIds
    .map((memberId) => getUserById(memberId))
    .filter((profile): profile is UserProfile => profile !== undefined)
    .filter((profile) => !isUserSuspended(profile.id));

  return <ConnectionsList users={members} emptyMessage="Diese Gruppe hat noch keine Mitglieder." />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FeedColors.background,
  },
});
