import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileView } from '@/components/profile/profile-view';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useProfiles } from '@/context/profile-context';

export default function ProfileScreen() {
  const router = useRouter();
  const { currentUser, isOwnProfileLoading, ownProfileError, ownProfile, authUserId, refreshOwnProfile, createMissingOwnProfile } =
    useProfiles();
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);

  const handleRepair = async () => {
    if (isRepairing) {
      return;
    }

    setIsRepairing(true);
    setRepairError(null);

    const { error } = await createMissingOwnProfile();

    setIsRepairing(false);

    if (error) {
      setRepairError(error);
    }
  };

  if (isOwnProfileLoading) {
    return (
      <SafeAreaView style={styles.stateSafeArea}>
        <View style={styles.stateContent}>
          <ActivityIndicator size="large" color={FeedColors.textPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  if (ownProfileError) {
    return (
      <SafeAreaView style={styles.stateSafeArea}>
        <View style={styles.stateContent}>
          <Text style={styles.stateText}>{ownProfileError}</Text>
          <Pressable onPress={refreshOwnProfile} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
            <Text style={styles.retryButtonText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (authUserId && !ownProfile) {
    return (
      <SafeAreaView style={styles.stateSafeArea}>
        <View style={styles.stateContent}>
          <Text style={styles.stateText}>Für dein Konto wurde noch kein Profil gefunden.</Text>
          {repairError ? <Text style={styles.stateErrorText}>{repairError}</Text> : null}
          <Pressable onPress={refreshOwnProfile} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
            <Text style={styles.retryButtonText}>Erneut versuchen</Text>
          </Pressable>
          <Pressable
            onPress={handleRepair}
            disabled={isRepairing}
            style={[styles.repairButton, isRepairing && styles.repairButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Profil vervollständigen"
          >
            <Text style={styles.repairButtonText}>{isRepairing ? 'Profil wird angelegt…' : 'Profil vervollständigen'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return <ProfileView profile={currentUser} isOwnProfile onEditPress={() => router.push('/edit-profile')} />;
}

const styles = StyleSheet.create({
  stateSafeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  stateContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  stateText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  stateErrorText: {
    color: '#F87171',
    fontSize: FontSizes.meta,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.sm,
    minHeight: 44,
    minWidth: 160,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  retryButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  repairButton: {
    marginTop: Spacing.sm,
    minHeight: 44,
    minWidth: 200,
    borderRadius: Radii.round,
    backgroundColor: ClubColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  repairButtonDisabled: {
    opacity: 0.5,
  },
  repairButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
});
