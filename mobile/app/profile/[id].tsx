import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ProfileView } from '@/components/profile/profile-view';
import { FeedColors } from '@/constants/theme';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import { useReports } from '@/context/reports-context';
import type { UserProfile } from '@/data/users';
import { getInitialsFromName, mapSupabaseProfileRow } from '@/lib/map-supabase-profile';
import { supabase } from '@/lib/supabase';

const PROFILE_SELECT_COLUMNS =
  'id, display_name, club, location, bio, avatar_url, favorite_team_id, onboarding_completed_at, created_at, updated_at';

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { getUserById } = useProfiles();
  const { isUserSuspended } = useModeration();
  const { isUserReported } = useReports();

  const localProfile = params.id ? getUserById(params.id) : undefined;
  const [remoteProfile, setRemoteProfile] = useState<UserProfile | null>(null);
  const [isLoadingRemoteProfile, setIsLoadingRemoteProfile] = useState(false);

  useEffect(() => {
    if (!params.id || localProfile) {
      setRemoteProfile(null);
      setIsLoadingRemoteProfile(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingRemoteProfile(true);

    supabase
      .from('profiles')
      .select(PROFILE_SELECT_COLUMNS)
      .eq('id', params.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!isCurrent) return;

        if (data) {
          const mapped = mapSupabaseProfileRow(data);
          setRemoteProfile({
            id: mapped.id,
            displayName: mapped.displayName,
            initials: getInitialsFromName(mapped.displayName),
            club: mapped.club || '',
            location: mapped.location || '',
            bio: mapped.bio || '',
            memberSince: mapped.createdAt ? new Date(mapped.createdAt).getFullYear().toString() : '',
            isCurrentUser: false,
            avatarUrl: mapped.avatarUrl ?? undefined,
            source: 'supabase',
          });
        } else {
          setRemoteProfile(null);
        }

        setIsLoadingRemoteProfile(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [params.id, localProfile]);

  const profile = localProfile ?? remoteProfile;

  if (!profile) {
    if (isLoadingRemoteProfile) {
      return (
        <SafeAreaView style={styles.loadingSafeArea}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={FeedColors.textPrimary} />
          </View>
        </SafeAreaView>
      );
    }

    return <NotFoundView title="Profil nicht gefunden" message="Das angeforderte Profil konnte nicht gefunden werden." />;
  }

  if (isUserReported(profile.id)) {
    return <NotFoundView title="Profil nicht verfügbar" message="Dieses Profil wurde von dir gemeldet und wird nicht mehr angezeigt." />;
  }

  if (isUserSuspended(profile.id)) {
    return <NotFoundView title="Profil nicht verfügbar" message="Dieser Nutzer wurde lokal moderativ gesperrt." />;
  }

  return <ProfileView profile={profile} isOwnProfile={false} />;
}

const styles = StyleSheet.create({
  loadingSafeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
