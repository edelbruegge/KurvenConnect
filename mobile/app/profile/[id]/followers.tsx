import { useLocalSearchParams } from 'expo-router';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ConnectionsList } from '@/components/profile/connections-list';
import { useProfiles } from '@/context/profile-context';

export default function FollowersScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { getUserById, getFollowers, currentUser } = useProfiles();

  const profile = params.id ? getUserById(params.id) : undefined;

  if (!profile) {
    return <NotFoundView title="Profil nicht gefunden" message="Das angeforderte Profil konnte nicht gefunden werden." />;
  }

  const isOwnProfile = profile.id === currentUser.id;
  const followers = getFollowers(profile.id);
  const emptyMessage = isOwnProfile ? 'Du hast noch keine Follower.' : 'Dieser Nutzer hat noch keine Follower.';

  return <ConnectionsList users={followers} emptyMessage={emptyMessage} />;
}
