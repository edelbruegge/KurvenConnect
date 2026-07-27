import { useLocalSearchParams } from 'expo-router';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ProfileView } from '@/components/profile/profile-view';
import { useProfiles } from '@/context/profile-context';

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { getUserById } = useProfiles();

  const profile = params.id ? getUserById(params.id) : undefined;

  if (!profile) {
    return <NotFoundView title="Profil nicht gefunden" message="Das angeforderte Profil konnte nicht gefunden werden." />;
  }

  return <ProfileView profile={profile} isOwnProfile={false} />;
}
