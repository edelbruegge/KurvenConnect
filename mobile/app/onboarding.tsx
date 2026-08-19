import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ClubPicker } from '@/components/profile/club-picker';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { filterEnabledClubs } from '@/config/beta-clubs';
import { useGames } from '@/context/games-context';
import { useProfiles } from '@/context/profile-context';
import type { KnownTeam } from '@/data/database-games';

type OnboardingStep = 'welcome' | 'club';

/**
 * One-time onboarding shown after a fresh registration/login whenever the signed-in profile has
 * no onboarding_completed_at yet (see the routing guard in app/_layout.tsx). No skip -- selecting a
 * favorite club is mandatory for the first production version. On success, updateOwnProfile
 * updates ownProfile directly, which flips the routing guard to the main app automatically; no
 * explicit navigation call is needed here.
 */
export default function OnboardingScreen() {
  const { updateOwnProfile } = useProfiles();
  const { knownTeams, isKnownTeamsLoading, knownTeamsError, refreshKnownTeams } = useGames();

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [selectedTeam, setSelectedTeam] = useState<KnownTeam | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFinish = async () => {
    if (!selectedTeam || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await updateOwnProfile({
      favoriteTeamId: selectedTeam.externalTeamId,
      club: selectedTeam.teamName,
      completeOnboarding: true,
    });

    setIsSaving(false);

    if (error) {
      // Onboarding must never be falsely marked complete on failure -- the user stays on this
      // step with their selection intact and can simply tap "Fertig" again.
      setErrorMessage(error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {step === 'welcome' ? (
          <View style={styles.welcomeContent}>
            <Text style={styles.title}>Willkommen bei Kurvenconnect</Text>
            <Text style={styles.subtitle}>
              Deine zentrale Plattform für Community, Spieltage und Auswärtsfahrten rund um deinen Verein.
            </Text>
            <Pressable
              onPress={() => setStep('club')}
              style={styles.primaryButton}
              accessibilityRole="button"
              accessibilityLabel="Weiter"
            >
              <Text style={styles.primaryButtonText}>Weiter</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.clubContent}>
            <Text style={styles.title}>Dein Lieblingsverein</Text>
            <Text style={styles.subtitle}>Wähle deinen Verein aus, damit wir dir passende Spiele und Inhalte zeigen können.</Text>

            <ClubPicker
              knownTeams={filterEnabledClubs(knownTeams)}
              selectedTeamId={selectedTeam?.externalTeamId ?? null}
              onSelect={(team) => {
                setSelectedTeam(team);
                setErrorMessage(null);
              }}
              isLoading={isKnownTeamsLoading}
              error={knownTeamsError}
              onRetry={refreshKnownTeams}
            />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              onPress={handleFinish}
              disabled={!selectedTeam || isSaving}
              style={[styles.primaryButton, (!selectedTeam || isSaving) && styles.primaryButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Fertig"
            >
              <Text style={styles.primaryButtonText}>{isSaving ? 'Wird gespeichert…' : 'Fertig'}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  container: {
    flexGrow: 1,
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  welcomeContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  clubContent: {
    flexGrow: 1,
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.subtitle,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingVertical: Spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  errorText: {
    color: '#F87171',
    fontSize: FontSizes.meta,
    marginTop: Spacing.md,
  },
});
