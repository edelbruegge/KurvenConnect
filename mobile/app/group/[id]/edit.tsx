import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';
import type { GroupVisibility } from '@/data/groups';
import { dismissKeyboardOnNative } from '@/lib/dismiss-keyboard';

type EditGroupFormState = {
  name: string;
  description: string;
  visibility: GroupVisibility;
};

export default function EditGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { getGroupById, updateGroup } = useGroups();
  const group = params.id ? getGroupById(params.id) : undefined;
  const canEdit = group?.source === 'supabase' && group.myRole === 'admin';

  const [form, setForm] = useState<EditGroupFormState>({
    name: group?.name ?? '',
    description: group?.description ?? '',
    visibility: group?.visibility ?? 'public',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!group) {
    return <NotFoundView title="Gruppe nicht gefunden" message="Die angeforderte Gruppe konnte nicht gefunden werden." />;
  }

  if (!canEdit) {
    return <NotFoundView title="Kein Zugriff" message="Du bist nicht berechtigt, diese Gruppe zu bearbeiten." />;
  }

  const updateField = <K extends keyof EditGroupFormState>(field: K, value: EditGroupFormState[K]) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const isFormValid = () => form.name.trim().length > 0;

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!form.name.trim()) {
      setErrorMessage('Bitte gib einen gültigen Gruppennamen ein.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await updateGroup(group.id, {
      name: form.name,
      description: form.description,
      visibility: form.visibility,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error);
      return;
    }

    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboardOnNative}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.title}>Gruppe bearbeiten</Text>
            <Text style={styles.subtitle}>Ändere Name, Beschreibung oder Sichtbarkeit der Gruppe.</Text>

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
                maxLength={100}
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
                maxLength={2000}
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

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!isFormValid() || isSubmitting}
              style={[styles.submitButton, (!isFormValid() || isSubmitting) && styles.submitButtonDisabled]}
            >
              <Text style={styles.submitButtonText}>{isSubmitting ? 'Wird gespeichert …' : 'Speichern'}</Text>
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
