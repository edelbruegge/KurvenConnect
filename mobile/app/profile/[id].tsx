import { useLocalSearchParams } from 'expo-router';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ProfileView } from '@/components/profile/profile-view';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { getUserById } = useProfiles();
  const { isUserSuspended } = useModeration();

  const profile = params.id ? getUserById(params.id) : undefined;

  if (!profile) {
    return <NotFoundView title="Profil nicht gefunden" message="Das angeforderte Profil konnte nicht gefunden werden." />;
  }

  if (isUserSuspended(profile.id)) {
    return <NotFoundView title="Profil nicht verfügbar" message="Dieser Nutzer wurde lokal moderativ gesperrt." />;
  }

  return <ProfileView profile={profile} isOwnProfile={false} />;
}
