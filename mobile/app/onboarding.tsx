import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ClubPicker } from '@/components/profile/club-picker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { filterEnabledClubs } from '@/config/beta-clubs';
import { useGames } from '@/context/games-context';
import { useProfiles } from '@/context/profile-context';
import type { KnownTeam } from '@/data/database-games';

// Kept identical to edit-profile.tsx's own BIO_MAX_LENGTH so the same value entered here never
// becomes invalid the moment a user later opens "Profil bearbeiten".
const BIO_MAX_LENGTH = 160;

type OnboardingStep = 'welcome' | 'club' | 'profile';

/**
 * One-time onboarding shown after a fresh registration/login whenever the signed-in profile has
 * no onboarding_completed_at yet (see the routing guard in app/_layout.tsx). Three steps: welcome
 * -> club (mandatory, no skip) -> profile (Wohnort/Bio, optional -- "Fertig" always works). On
 * success, updateOwnProfile updates ownProfile directly, which flips the routing guard to the main
 * app automatically; no explicit navigation call is needed here.
 */
export default function OnboardingScreen() {
  const { updateOwnProfile } = useProfiles();
  const { knownTeams, isKnownTeamsLoading, knownTeamsError, refreshKnownTeams } = useGames();

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [selectedTeam, setSelectedTeam] = useState<KnownTeam | null>(null);
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const enabledTeams = filterEnabledClubs(knownTeams);
  // Vorgabe 5: with exactly one beta-enabled club, a searchable/grouped club list is unnecessary
  // friction -- show a simple "Dein Verein" confirmation instead. The underlying data (knownTeams,
  // beta-clubs.ts) is untouched, so this automatically reverts to the full ClubPicker the moment a
  // second club is enabled there, with no further change needed here.
  const isSingleClubBeta = enabledTeams.length === 1;
  const soleEnabledTeam = isSingleClubBeta ? enabledTeams[0] : null;

  // Auto-select the sole beta club once it has loaded, same end state a user would reach by hand
  // in the full picker -- only while nothing else has been selected yet, so this never overrides an
  // explicit choice.
  useEffect(() => {
    if (soleEnabledTeam && !selectedTeam) {
      setSelectedTeam(soleEnabledTeam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleEnabledTeam?.externalTeamId]);

  const handleFinish = async () => {
    if (!selectedTeam || isSaving) {
      return;
    }

    // Wohnort/Bio are optional (Vorgabe: überspringbar) -- only the length cap on Bio is still
    // enforced when something was actually entered, same rule as edit-profile.tsx's BIO_MAX_LENGTH.
    const trimmedBio = bio.trim();
    if (trimmedBio.length > BIO_MAX_LENGTH) {
      setErrorMessage(`Die Bio darf maximal ${BIO_MAX_LENGTH} Zeichen lang sein.`);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await updateOwnProfile({
      favoriteTeamId: selectedTeam.externalTeamId,
      club: selectedTeam.teamName,
      location: location.trim(),
      bio: trimmedBio,
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
        ) : step === 'club' ? (
          <View style={styles.clubContent}>
            <Text style={styles.title}>Dein Verein</Text>
            <Text style={styles.subtitle}>
              {isSingleClubBeta
                ? 'In dieser ersten Beta ist Kurvenconnect für deinen Verein freigeschaltet. Weitere Vereine folgen schrittweise.'
                : 'Wähle deinen Verein aus, damit wir dir passende Spiele und Inhalte zeigen können.'}
            </Text>

            {isSingleClubBeta && soleEnabledTeam ? (
              <View style={styles.singleClubCard}>
                <View style={styles.singleClubRow}>
                  <Text style={styles.singleClubName}>{soleEnabledTeam.teamName}</Text>
                  <IconSymbol size={22} name="checkmark.circle.fill" color={StatusColors.success} />
                </View>
                <Text style={styles.singleClubHint}>Weitere Vereine folgen in einer späteren Beta-Phase.</Text>
              </View>
            ) : (
              <ClubPicker
                knownTeams={enabledTeams}
                selectedTeamId={selectedTeam?.externalTeamId ?? null}
                onSelect={(team) => {
                  setSelectedTeam(team);
                  setErrorMessage(null);
                }}
                isLoading={isKnownTeamsLoading}
                error={knownTeamsError}
                onRetry={refreshKnownTeams}
              />
            )}

            <Pressable
              onPress={() => setStep('profile')}
              disabled={!selectedTeam}
              style={[styles.primaryButton, !selectedTeam && styles.primaryButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Weiter"
            >
              <Text style={styles.primaryButtonText}>Weiter</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.clubContent}>
            <Text style={styles.title}>Dein Profil</Text>
            <Text style={styles.subtitle}>
              Optional: Erzähl anderen etwas über dich. Du kannst das jederzeit später über „Profil bearbeiten“ ändern.
            </Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Wohnort</Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Dein Wohnort"
                placeholderTextColor={FeedColors.textSecondary}
                style={styles.textInput}
                returnKeyType="done"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Bio</Text>
              <TextInput
                multiline
                numberOfLines={4}
                value={bio}
                onChangeText={setBio}
                placeholder="Erzähl etwas über dich"
                placeholderTextColor={FeedColors.textSecondary}
                style={[styles.textInput, styles.bioInput]}
                textAlignVertical="top"
              />
              <Text style={[styles.charCount, bio.trim().length > BIO_MAX_LENGTH && styles.charCountExceeded]}>
                {bio.trim().length}/{BIO_MAX_LENGTH}
              </Text>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              onPress={handleFinish}
              disabled={isSaving}
              style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Fertig"
            >
              <Text style={styles.primaryButtonText}>{isSaving ? 'Wird gespeichert…' : 'Fertig'}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  keyboardView: {
    flex: 1,
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
  singleClubCard: {
    backgroundColor: FeedColors.cardBackground,
    borderWidth: 1,
    borderColor: ClubColors.border,
    borderRadius: Radii.lg,
    padding: Spacing.md,
  },
  singleClubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  singleClubName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.subtitle,
    fontWeight: '700',
  },
  singleClubHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
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
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginTop: Spacing.md,
  },
  section: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  textInput: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    color: FeedColors.textPrimary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  bioInput: {
    minHeight: 96,
  },
  charCount: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  charCountExceeded: {
    color: StatusColors.error,
  },
});
