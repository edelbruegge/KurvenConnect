import { useLocalSearchParams } from 'expo-router';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ConnectionsList } from '@/components/profile/connections-list';
import { useGroups } from '@/context/groups-context';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import type { UserProfile } from '@/data/users';

export default function GroupMembersScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { getGroupById } = useGroups();
  const { getUserById } = useProfiles();
  const { isUserSuspended } = useModeration();

  const group = params.id ? getGroupById(params.id) : undefined;

  if (!group) {
    return <NotFoundView title="Gruppe nicht gefunden" message="Die angeforderte Gruppe konnte nicht gefunden werden." />;
  }

  const members = group.memberIds
    .map((memberId) => getUserById(memberId))
    .filter((profile): profile is UserProfile => profile !== undefined)
    .filter((profile) => !isUserSuspended(profile.id));

  return <ConnectionsList users={members} emptyMessage="Diese Gruppe hat noch keine Mitglieder." />;
}
