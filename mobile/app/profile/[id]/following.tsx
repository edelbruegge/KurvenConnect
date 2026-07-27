import { useLocalSearchParams } from 'expo-router';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ConnectionsList } from '@/components/profile/connections-list';
import { useProfiles } from '@/context/profile-context';

export default function FollowingScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { getUserById, getFollowing, unfollowUser, currentUser } = useProfiles();

  const profile = params.id ? getUserById(params.id) : undefined;

  if (!profile) {
    return <NotFoundView title="Profil nicht gefunden" message="Das angeforderte Profil konnte nicht gefunden werden." />;
  }

  const isOwnProfile = profile.id === currentUser.id;
  const following = getFollowing(profile.id);
  const emptyMessage = isOwnProfile ? 'Du folgst noch keinen Accounts.' : 'Dieser Nutzer folgt noch keinen Accounts.';

  return (
    <ConnectionsList
      users={following}
      emptyMessage={emptyMessage}
      showUnfollowButton={isOwnProfile}
      onUnfollow={isOwnProfile ? unfollowUser : undefined}
    />
  );
}
