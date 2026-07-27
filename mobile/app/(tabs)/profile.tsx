import { useRouter } from 'expo-router';

import { ProfileView } from '@/components/profile/profile-view';
import { useProfiles } from '@/context/profile-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { currentUser } = useProfiles();

  return <ProfileView profile={currentUser} isOwnProfile onEditPress={() => router.push('/edit-profile')} />;
}
