import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { ClubPicker } from '@/components/profile/club-picker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { filterEnabledClubs } from '@/config/beta-clubs';
import { useActiveClub } from '@/context/active-club-context';
import { useAuth } from '@/context/auth-context';
import { useGames } from '@/context/games-context';
import { useProfiles } from '@/context/profile-context';
import type { KnownTeam } from '@/data/database-games';
import { extractOwnAvatarStoragePath, pickAvatarImage, processAvatarImage, removeAvatarFile, uploadAvatarImage } from '@/lib/avatar-media';
import { dismissKeyboardOnNative } from '@/lib/dismiss-keyboard';
import { useSafeBack } from '@/hooks/use-safe-back';

const BIO_MAX_LENGTH = 160;

export default function EditProfileScreen() {
  const goBack = useSafeBack();
  const headerHeight = useHeaderHeight();
  const { currentUser, ownProfile, updateOwnProfile } = useProfiles();
  const { knownTeams, isKnownTeamsLoading, knownTeamsError, refreshKnownTeams } = useGames();
  const { setActiveTeam } = useActiveClub();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [location, setLocation] = useState(currentUser.location);
  const [bio, setBio] = useState(currentUser.bio);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // null = the user hasn't changed the club selection this session -- the existing favorite stays
  // untouched on save. Only set once the user actually picks a (possibly identical) team in the
  // picker below.
  const [selectedTeam, setSelectedTeam] = useState<KnownTeam | null>(null);
  const [isClubPickerOpen, setIsClubPickerOpen] = useState(false);
  const currentFavoriteTeamId = selectedTeam?.externalTeamId ?? ownProfile?.favoriteTeamId ?? null;

  // A newly picked + processed (square, resized, compressed) local image staged for upload on the
  // next "Speichern" tap -- never written to the server just by picking it (Vorgabe 6). Local to
  // this screen, so it is naturally discarded on cancel/navigate-away and reset on every fresh
  // mount (e.g. after an account switch, Vorgabe 22) without any extra cleanup code.
  const [pendingAvatarUri, setPendingAvatarUri] = useState<string | null>(null);
  const [isPickingAvatar, setIsPickingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const isBusy = isSubmitting || isPickingAvatar || isRemovingAvatar;
  const isFormValid = () => displayName.trim().length >= 2 && bio.trim().length <= BIO_MAX_LENGTH;
  const displayedAvatarUrl = pendingAvatarUri ?? currentUser.avatarUrl;

  const handlePickAvatar = async () => {
    if (isBusy) {
      return;
    }

    setIsPickingAvatar(true);
    setErrorMessage(null);

    const { image, error: pickError } = await pickAvatarImage();

    if (pickError) {
      setIsPickingAvatar(false);
      setErrorMessage(pickError);
      return;
    }

    if (!image) {
      // User cancelled the picker -- not an error, nothing changes.
      setIsPickingAvatar(false);
      return;
    }

    const { uri: processedUri, error: processError } = await processAvatarImage(image);
    setIsPickingAvatar(false);

    if (processError || !processedUri) {
      setErrorMessage(processError ?? 'Das Bild konnte nicht verarbeitet werden.');
      return;
    }

    setPendingAvatarUri(processedUri);
  };

  // Immediate action for an already-*saved* avatar -- a real mutation in its own right, not a
  // pending local edit. If the currently shown image is only a not-yet-saved pending pick,
  // discarding it is a pure local reset instead -- nothing was ever uploaded, so there is nothing
  // on the server to remove and no reason for a network round-trip.
  const handleRemoveAvatar = async () => {
    if (isBusy) {
      return;
    }

    if (pendingAvatarUri) {
      setPendingAvatarUri(null);
      return;
    }

    if (!currentUser.avatarUrl) {
      return;
    }

    setIsRemovingAvatar(true);
    setErrorMessage(null);

    // Uses the currently-*saved* text fields, not whatever is mid-edit in the form -- removing
    // the avatar must never silently also persist unsaved display name/location/bio changes.
    const previousAvatarUrl = currentUser.avatarUrl;
    const { error } = await updateOwnProfile({
      displayName: currentUser.displayName,
      location: currentUser.location,
      bio: currentUser.bio,
      avatarUrl: null,
    });

    setIsRemovingAvatar(false);

    if (error) {
      setErrorMessage(error);
      return;
    }

    setPendingAvatarUri(null);

    if (authUserId) {
      const oldPath = extractOwnAvatarStoragePath(previousAvatarUrl, authUserId);
      if (oldPath) {
        void removeAvatarFile(oldPath);
      }
    }
  };

  const handleSave = async () => {
    if (isBusy) {
      return;
    }

    const trimmedName = displayName.trim();
    const trimmedLocation = location.trim();
    const trimmedBio = bio.trim();

    if (!trimmedName) {
      setErrorMessage('Bitte gib einen Anzeigenamen ein.');
      return;
    }

    if (trimmedName.length < 2) {
      setErrorMessage('Der Anzeigename muss mindestens 2 Zeichen lang sein.');
      return;
    }

    if (trimmedBio.length > BIO_MAX_LENGTH) {
      setErrorMessage(`Die Bio darf maximal ${BIO_MAX_LENGTH} Zeichen lang sein.`);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    // Safe swap: (1) image already processed at pick-time, (2) upload must succeed, (3) profile
    // row update must succeed -- only *then* is the previous avatar file removed. Any failure
    // along the way leaves the existing avatar and text completely untouched (Vorgabe 14).
    let newAvatarUrl: string | undefined;
    const previousAvatarUrl = currentUser.avatarUrl;

    if (pendingAvatarUri) {
      if (!authUserId) {
        setIsSubmitting(false);
        setErrorMessage('Du bist nicht angemeldet.');
        return;
      }

      const { url, error: uploadError } = await uploadAvatarImage({ authUserId, uri: pendingAvatarUri });

      if (uploadError || !url) {
        setIsSubmitting(false);
        setErrorMessage(uploadError ?? 'Das Profilbild konnte nicht hochgeladen werden.');
        return;
      }

      newAvatarUrl = url;
    }

    // Only included when the user actually changed the selection (Vorgabe: undefined = unchanged)
    // -- reopening the picker and re-picking the same team is a no-op, not a redundant write.
    const clubChange =
      selectedTeam && selectedTeam.externalTeamId !== ownProfile?.favoriteTeamId
        ? { favoriteTeamId: selectedTeam.externalTeamId, club: selectedTeam.teamName }
        : {};

    const { error } = await updateOwnProfile({
      displayName: trimmedName,
      location: trimmedLocation,
      bio: trimmedBio,
      avatarUrl: newAvatarUrl,
      ...clubChange,
    });

    setIsSubmitting(false);

    if (error) {
      // The profile row update failed after a successful upload -- clean up the now-orphaned new
      // file (best effort); the previous avatar was never touched and stays authoritative.
      if (newAvatarUrl && authUserId) {
        const orphanPath = extractOwnAvatarStoragePath(newAvatarUrl, authUserId);
        if (orphanPath) void removeAvatarFile(orphanPath);
      }
      setErrorMessage(error);
      return;
    }

    if (newAvatarUrl && authUserId) {
      const oldPath = extractOwnAvatarStoragePath(previousAvatarUrl, authUserId);
      if (oldPath) void removeAvatarFile(oldPath);
    }

    // A deliberate change of the permanent favorite club (not temporary browsing) also switches
    // the active club being viewed -- distinct UX from the Stadion club switcher (Vorgabe 36).
    if ('favoriteTeamId' in clubChange && selectedTeam) {
      setActiveTeam(selectedTeam);
    }

    setPendingAvatarUri(null);
    goBack();
  };

  const handleCancel = () => {
    goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={styles.keyboardView}>
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboardOnNative}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.title}>Profil bearbeiten</Text>
            <Text style={styles.subtitle}>Passe deinen Anzeigenamen, Wohnort und deine Bio an.</Text>

            <View style={styles.avatarSection}>
              <Pressable
                onPress={handlePickAvatar}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Profilbild ändern"
              >
                <Avatar initials={currentUser.initials} avatarUrl={displayedAvatarUrl} size={96} />
              </Pressable>

              <Pressable onPress={handlePickAvatar} disabled={isBusy} style={styles.changeAvatarButton} accessibilityRole="button" accessibilityLabel="Profilbild ändern">
                <IconSymbol size={16} name="photo" color={FeedColors.textPrimary} />
                <Text style={styles.changeAvatarButtonText}>{isPickingAvatar ? 'Wird verarbeitet …' : 'Profilbild ändern'}</Text>
              </Pressable>

              {displayedAvatarUrl ? (
                <Pressable onPress={handleRemoveAvatar} disabled={isBusy} style={styles.removeAvatarButton} accessibilityRole="button" accessibilityLabel="Profilbild entfernen">
                  <Text style={styles.removeAvatarButtonText}>{isRemovingAvatar ? 'Wird entfernt …' : 'Profilbild entfernen'}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Anzeigename</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Dein Name"
                placeholderTextColor={FeedColors.textSecondary}
                style={styles.textInput}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Wohnort</Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Dein Wohnort"
                placeholderTextColor={FeedColors.textSecondary}
                style={styles.textInput}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
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

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Verein</Text>
              <Pressable
                onPress={() => setIsClubPickerOpen((current) => !current)}
                style={styles.clubSummaryRow}
                accessibilityRole="button"
                accessibilityLabel="Verein ändern"
              >
                <Text style={styles.clubSummaryText}>{selectedTeam?.teamName ?? currentUser.club}</Text>
                <Text style={styles.chevron}>{isClubPickerOpen ? '︿' : '﹀'}</Text>
              </Pressable>

              {isClubPickerOpen ? (
                <View style={styles.clubPickerWrapper}>
                  <ClubPicker
                    knownTeams={filterEnabledClubs(knownTeams)}
                    selectedTeamId={currentFavoriteTeamId}
                    onSelect={(team) => {
                      setSelectedTeam(team);
                      setIsClubPickerOpen(false);
                    }}
                    isLoading={isKnownTeamsLoading}
                    error={knownTeamsError}
                    onRetry={refreshKnownTeams}
                  />
                </View>
              ) : null}
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              onPress={handleSave}
              disabled={!isFormValid() || isBusy}
              style={[styles.saveButton, (!isFormValid() || isBusy) && styles.saveButtonDisabled]}
            >
              <Text style={styles.saveButtonText}>{isSubmitting ? 'Speichern…' : 'Speichern'}</Text>
            </Pressable>

            <Pressable onPress={handleCancel} disabled={isBusy} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Abbrechen</Text>
            </Pressable>

            {keyboardVisible ? (
              <Pressable onPress={dismissKeyboardOnNative} style={styles.closeKeyboardButton} accessibilityRole="button" accessibilityLabel="Tastatur schließen">
                <Text style={styles.closeKeyboardButtonText}>Fertig</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Pressable>
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
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
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
    marginBottom: Spacing.md,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  changeAvatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
  },
  changeAvatarButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  removeAvatarButton: {
    paddingVertical: Spacing.xs,
  },
  removeAvatarButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
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
  clubSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  clubSummaryText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    flexShrink: 1,
  },
  chevron: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
  },
  clubPickerWrapper: {
    marginTop: Spacing.sm,
  },
  errorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.md,
  },
  saveButton: {
    backgroundColor: FeedColors.textPrimary,
    borderRadius: Radii.round,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: FeedColors.background,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  cancelButton: {
    borderRadius: Radii.round,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  cancelButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  closeKeyboardButton: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.xl + 8,
    backgroundColor: FeedColors.cardBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  closeKeyboardButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
