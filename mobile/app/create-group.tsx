import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';
import type { GroupVisibility } from '@/data/groups';
import { dismissKeyboardOnNative } from '@/lib/dismiss-keyboard';

type CreateGroupFormState = {
  name: string;
  description: string;
  visibility: GroupVisibility;
  city: string;
};

const initialFormState: CreateGroupFormState = {
  name: '',
  description: '',
  visibility: 'public',
  city: '',
};

export default function CreateGroupScreen() {
  const router = useRouter();
  const { createGroup } = useGroups();
  const [form, setForm] = useState<CreateGroupFormState>(initialFormState);
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

  const updateField = <K extends keyof CreateGroupFormState>(field: K, value: CreateGroupFormState[K]) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const isFormValid = () => form.name.trim().length >= 3 && form.description.trim().length >= 5;

  const handleSubmit = () => {
    if (form.name.trim().length < 3) {
      setErrorMessage('Der Gruppenname muss mindestens 3 Zeichen lang sein.');
      return;
    }

    if (form.description.trim().length < 5) {
      setErrorMessage('Die Beschreibung muss mindestens 5 Zeichen lang sein.');
      return;
    }

    const newGroupId = createGroup({
      name: form.name,
      description: form.description,
      visibility: form.visibility,
      city: form.city,
    });

    setErrorMessage(null);
    router.replace({ pathname: '/group/[id]', params: { id: newGroupId } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboardOnNative}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.title}>Neue Gruppe erstellen</Text>
            <Text style={styles.subtitle}>Erstelle eine lokale Gruppe rund um Arminia Bielefeld.</Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Name</Text>
              <TextInput
                value={form.name}
                onChangeText={(value) => updateField('name', value)}
                placeholder="Gruppenname"
                placeholderTextColor={FeedColors.textSecondary}
                style={styles.textInput}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Beschreibung</Text>
              <TextInput
                multiline
                numberOfLines={4}
                value={form.description}
                onChangeText={(value) => updateField('description', value)}
                placeholder="Worum geht es in der Gruppe?"
                placeholderTextColor={FeedColors.textSecondary}
                style={styles.textInput}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sichtbarkeit</Text>
              <View style={styles.optionRow}>
                <Pressable
                  onPress={() => updateField('visibility', 'public')}
                  style={[styles.optionButton, form.visibility === 'public' && styles.optionButtonActive]}
                >
                  <Text style={[styles.optionText, form.visibility === 'public' && styles.optionTextActive]}>Öffentlich</Text>
                </Pressable>
                <Pressable
                  onPress={() => updateField('visibility', 'private')}
                  style={[styles.optionButton, form.visibility === 'private' && styles.optionButtonActive]}
                >
                  <Text style={[styles.optionText, form.visibility === 'private' && styles.optionTextActive]}>Privat</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ort (optional)</Text>
              <TextInput
                value={form.city}
                onChangeText={(value) => updateField('city', value)}
                placeholder="z. B. Bielefeld"
                placeholderTextColor={FeedColors.textSecondary}
                style={styles.textInput}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable onPress={handleSubmit} disabled={!isFormValid()} style={[styles.submitButton, !isFormValid() && styles.submitButtonDisabled]}>
              <Text style={styles.submitButtonText}>Gruppe erstellen</Text>
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
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  optionButtonActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  optionText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  optionTextActive: {
    color: FeedColors.textPrimary,
  },
  textInput: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    color: FeedColors.textPrimary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  errorText: {
    color: '#F87171',
    fontSize: FontSizes.meta,
    marginBottom: Spacing.md,
  },
  submitButton: {
    backgroundColor: FeedColors.textPrimary,
    borderRadius: Radii.round,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: FeedColors.background,
    fontSize: FontSizes.body,
    fontWeight: '700',
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
