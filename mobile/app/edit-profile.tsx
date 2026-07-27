import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useProfiles } from '@/context/profile-context';

const BIO_MAX_LENGTH = 160;

export default function EditProfileScreen() {
  const router = useRouter();
  const { currentUser, updateCurrentUser } = useProfiles();

  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [location, setLocation] = useState(currentUser.location);
  const [bio, setBio] = useState(currentUser.bio);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const isFormValid = () => displayName.trim().length >= 2 && bio.trim().length <= BIO_MAX_LENGTH;

  const handleSave = () => {
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

    updateCurrentUser({ displayName: trimmedName, location: trimmedLocation, bio: trimmedBio });
    setErrorMessage(null);
    router.back();
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.title}>Profil bearbeiten</Text>
            <Text style={styles.subtitle}>Passe deinen Anzeigenamen, Wohnort und deine Bio an.</Text>

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
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>{currentUser.club}</Text>
              </View>
              <Text style={styles.readOnlyHint}>Der Verein kann in diesem Schritt noch nicht geändert werden.</Text>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable onPress={handleSave} disabled={!isFormValid()} style={[styles.saveButton, !isFormValid() && styles.saveButtonDisabled]}>
              <Text style={styles.saveButtonText}>Speichern</Text>
            </Pressable>

            <Pressable onPress={handleCancel} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Abbrechen</Text>
            </Pressable>

            {keyboardVisible ? (
              <Pressable onPress={() => Keyboard.dismiss()} style={styles.closeKeyboardButton} accessibilityRole="button" accessibilityLabel="Tastatur schließen">
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
    color: '#F87171',
  },
  readOnlyField: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: FeedColors.imagePlaceholder,
  },
  readOnlyText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
  },
  readOnlyHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
  },
  errorText: {
    color: '#F87171',
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
