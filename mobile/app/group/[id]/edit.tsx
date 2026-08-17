import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useGroups } from '@/context/groups-context';
import type { GroupVisibility } from '@/data/groups';
import { dismissKeyboardOnNative } from '@/lib/dismiss-keyboard';

type EditGroupFormState = {
  name: string;
  description: string;
  visibility: GroupVisibility;
};

const VISIBILITY_OPTIONS: { value: GroupVisibility; label: string; hint: string }[] = [
  { value: 'public', label: 'Öffentlich', hint: 'Jeder kann die Gruppe finden und direkt beitreten.' },
  {
    value: 'closed',
    label: 'Geschlossen',
    hint: 'Jeder kann die Gruppe finden. Inhalte sind nur für Mitglieder sichtbar. Beitritt nach Freigabe durch einen Admin.',
  },
  {
    value: 'invite_only',
    label: 'Nur auf Einladung',
    hint: 'Die Gruppe ist für Außenstehende nicht sichtbar. Mitgliedschaft ausschließlich über Einladung.',
  },
];

const GROUP_TYPE_LABEL: Record<string, string> = {
  standalone: 'Normale Gruppe',
  parent: 'Hauptgruppe',
  subgroup: 'Untergruppe',
};

export default function EditGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { getGroupById, updateGroup, setGroupType, deleteGroup, isGroupActionSubmitting } = useGroups();
  const group = params.id ? getGroupById(params.id) : undefined;
  const canEdit = group?.source === 'supabase' && group.myRole === 'admin';
  const isOwner = group?.source === 'supabase' && authUserId !== null && group.ownerId === authUserId;

  const [form, setForm] = useState<EditGroupFormState>({
    name: group?.name ?? '',
    description: group?.description ?? '',
    visibility: group?.visibility ?? 'public',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // standalone <-> parent only (Vorgabe 21) -- a subgroup's own structure can never be changed here
  // (set_group_type rejects it server-side too), so the whole section is hidden for one.
  const handleToggleGroupType = async () => {
    if (isGroupActionSubmitting || group.groupType === 'subgroup') {
      return;
    }

    setStructureError(null);
    const nextType = group.groupType === 'parent' ? 'standalone' : 'parent';
    const { error } = await setGroupType(group.id, nextType);

    if (error) {
      setStructureError(error);
    }
  };

  const handleDelete = async () => {
    if (isGroupActionSubmitting) {
      return;
    }

    setDeleteError(null);
    const { error } = await deleteGroup(group.id);

    if (error) {
      setDeleteError(error);
      return;
    }

    router.replace('/messages');
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
              <View style={styles.optionColumn}>
                {VISIBILITY_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => updateField('visibility', option.value)}
                    style={[styles.visibilityOption, form.visibility === option.value && styles.visibilityOptionActive]}
                  >
                    <View style={[styles.radioDot, form.visibility === option.value && styles.radioDotActive]} />
                    <View style={styles.visibilityOptionTextWrapper}>
                      <Text style={[styles.optionText, form.visibility === option.value && styles.optionTextActive]}>{option.label}</Text>
                      <Text style={styles.visibilityHint}>{option.hint}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              {group.groupType === 'parent' ? (
                <Text style={styles.visibilityHint}>
                  Diese Gruppe ist eine Hauptgruppe — die Sichtbarkeit darf nicht offener sein als die ihrer Untergruppen.
                </Text>
              ) : group.groupType === 'subgroup' ? (
                <Text style={styles.visibilityHint}>Diese Untergruppe darf nicht offener sein als ihre Hauptgruppe.</Text>
              ) : null}
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!isFormValid() || isSubmitting}
              style={[styles.submitButton, (!isFormValid() || isSubmitting) && styles.submitButtonDisabled]}
            >
              <Text style={styles.submitButtonText}>{isSubmitting ? 'Wird gespeichert …' : 'Speichern'}</Text>
            </Pressable>

            {group.groupType !== 'subgroup' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Gruppenstruktur</Text>
                <Text style={styles.visibilityHint}>Aktuell: {GROUP_TYPE_LABEL[group.groupType] ?? group.groupType}</Text>
                {structureError ? <Text style={styles.errorText}>{structureError}</Text> : null}
                <Pressable
                  onPress={() => void handleToggleGroupType()}
                  disabled={isGroupActionSubmitting}
                  style={[styles.secondaryButton, isGroupActionSubmitting && styles.submitButtonDisabled]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {group.groupType === 'parent' ? 'Zu normaler Gruppe machen' : 'Zur Hauptgruppe machen'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {isOwner ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Verwaltung</Text>
                {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}
                {!confirmingDelete ? (
                  <Pressable
                    onPress={() => setConfirmingDelete(true)}
                    style={styles.deleteButton}
                    accessibilityRole="button"
                    accessibilityLabel="Gruppe löschen"
                  >
                    <Text style={styles.deleteButtonText}>Gruppe löschen</Text>
                  </Pressable>
                ) : (
                  <View style={styles.confirmBlock}>
                    <Text style={styles.confirmText}>
                      Möchtest du diese Gruppe wirklich unwiderruflich löschen? Alle Nachrichten und Mitgliedschaften gehen verloren.
                    </Text>
                    <View style={styles.confirmActions}>
                      <Pressable
                        onPress={() => void handleDelete()}
                        disabled={isGroupActionSubmitting}
                        style={[styles.deleteButton, isGroupActionSubmitting && styles.submitButtonDisabled]}
                      >
                        <Text style={styles.deleteButtonText}>{isGroupActionSubmitting ? 'Wird gelöscht …' : 'Endgültig löschen'}</Text>
                      </Pressable>
                      <Pressable onPress={() => setConfirmingDelete(false)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Abbrechen</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ) : null}

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
  optionColumn: {
    gap: Spacing.sm,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    padding: Spacing.sm,
  },
  visibilityOptionActive: {
    backgroundColor: ClubColors.surface,
    borderColor: ClubColors.border,
  },
  visibilityOptionTextWrapper: {
    flex: 1,
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    marginTop: 2,
  },
  radioDotActive: {
    borderColor: ClubColors.border,
    backgroundColor: ClubColors.primary,
  },
  optionText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  optionTextActive: {
    color: FeedColors.textPrimary,
  },
  visibilityHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
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
    color: StatusColors.error,
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
  secondaryButton: {
    marginTop: Spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  secondaryButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  deleteButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: StatusColors.error,
  },
  deleteButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  confirmBlock: {
    gap: Spacing.sm,
  },
  confirmText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
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
