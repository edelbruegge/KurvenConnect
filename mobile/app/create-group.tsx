import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useActiveClub } from '@/context/active-club-context';
import { useGroups } from '@/context/groups-context';
import type { GroupType, GroupVisibility } from '@/data/groups';
import { dismissKeyboardOnNative } from '@/lib/dismiss-keyboard';

type CreateGroupFormState = {
  name: string;
  description: string;
  visibility: GroupVisibility;
  groupType: GroupType;
};

const VISIBILITY_RANK: Record<GroupVisibility, number> = { public: 0, closed: 1, invite_only: 2 };

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

export default function CreateGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ parentGroupId?: string; parentGroupName?: string; parentVisibility?: string }>();
  const { createGroup, getMyGroups } = useGroups();
  const { activeTeam } = useActiveClub();

  // "Untergruppe erstellen" from a parent group's own management screen (app/group/[id].tsx)
  // arrives here with the parent pre-selected via route params — the Gruppenstruktur picker is
  // hidden entirely in that case (nothing to choose, the parent is already fixed). Reaching this
  // screen the generic way (the "Gruppe erstellen" button in the Gruppen-Übersicht) instead offers
  // "Untergruppe" as a third structure option below, with its own in-screen parent picker.
  const isPreselectedSubgroup = Boolean(params.parentGroupId);
  const parentGroupName = params.parentGroupName ?? 'die Hauptgruppe';

  const [form, setForm] = useState<CreateGroupFormState>({
    name: '',
    description: '',
    visibility: 'public',
    groupType: isPreselectedSubgroup ? 'subgroup' : 'standalone',
  });
  const [manualParentGroupId, setManualParentGroupId] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Only groups the current user actually administers can be offered as a parent (Vorgabe 3:
  // group_type = 'parent', Owner/Admin, "Zugriff hat") -- getMyGroups() already only ever contains
  // groups the account has real membership in, so no extra access check is needed on top.
  const eligibleParentGroups = getMyGroups().filter(
    (candidate) => candidate.source === 'supabase' && candidate.groupType === 'parent' && candidate.myRole === 'admin',
  );

  const isCreatingSubgroup = isPreselectedSubgroup || form.groupType === 'subgroup';
  const effectiveParentGroupId = isPreselectedSubgroup ? params.parentGroupId : manualParentGroupId;
  const effectiveParentVisibility: GroupVisibility | undefined = isPreselectedSubgroup
    ? ((params.parentVisibility as GroupVisibility) ?? 'public')
    : eligibleParentGroups.find((candidate) => candidate.id === manualParentGroupId)?.visibility;

  // A subgroup may never be less protected than its parent (Vorgabe 8) — enforced again
  // server-side regardless, this only pre-filters the choices actually offered (Vorgabe 4: schränke
  // die Optionen direkt ein, statt den Button rätselhaft zu deaktivieren).
  const allowedVisibilityOptions = effectiveParentVisibility
    ? VISIBILITY_OPTIONS.filter((option) => VISIBILITY_RANK[option.value] >= VISIBILITY_RANK[effectiveParentVisibility])
    : VISIBILITY_OPTIONS;

  // Derived directly from allowedVisibilityOptions on every render (never trusts form.visibility
  // alone) -- this is what actually gets shown as selected and what actually gets submitted, so a
  // disabled/single-option visibility control is *always* a valid, well-defined value, never
  // undefined/null (Vorgabe 3), even in the instant before the effect below has run.
  const effectiveVisibility: GroupVisibility = allowedVisibilityOptions.some((option) => option.value === form.visibility)
    ? form.visibility
    : (allowedVisibilityOptions[0]?.value ?? 'public');
  const isVisibilityLocked = allowedVisibilityOptions.length <= 1;

  // Keeps form.visibility itself in sync too (not just the derived value above), so the radio
  // selection visually reflects reality once the user can interact with it again -- e.g. switching
  // the manual parent picker to a less restrictive Hauptgruppe re-opens real choices.
  const allowedVisibilityKey = allowedVisibilityOptions.map((option) => option.value).join(',');
  useEffect(() => {
    if (!allowedVisibilityOptions.some((option) => option.value === form.visibility)) {
      setForm((current) => ({ ...current, visibility: allowedVisibilityOptions[0]?.value ?? 'public' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedVisibilityKey]);

  // A single eligible Hauptgruppe is auto-selected -- with only one real choice, requiring an
  // explicit tap just traps the user into a form that *looks* complete (parent name visible,
  // visibility already narrowed down accordingly) while parentGroupId is silently still undefined,
  // which is exactly what kept the Create-button disabled with zero explanation. With more than one
  // eligible parent, an explicit choice is still required (never guessed).
  useEffect(() => {
    if (!isPreselectedSubgroup && form.groupType === 'subgroup' && !manualParentGroupId && eligibleParentGroups.length === 1) {
      setManualParentGroupId(eligibleParentGroups[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreselectedSubgroup, form.groupType, manualParentGroupId, eligibleParentGroups.length]);

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

  // Only name/description/parent selection are genuine submit-blockers (Vorgabe 2/7: "nur
  // tatsächlich notwendige Felder dürfen das Absenden blockieren", nie ob der Nutzer die
  // Sichtbarkeit manuell "berührt" hat) -- visibility is never part of this check, since
  // effectiveVisibility above already guarantees a valid, inheritance-respecting value by
  // construction. Returns the actual missing reasons (not just a boolean) so a disabled button is
  // never unexplained -- a disabled Pressable's onPress never runs, so handleSubmit's own
  // per-field error messages below could otherwise never actually reach the user.
  const missingRequirements = (): string[] => {
    const reasons: string[] = [];

    if (form.name.trim().length < 3) {
      reasons.push('Gib einen Gruppennamen mit mindestens 3 Zeichen ein.');
    }

    if (form.description.trim().length < 5) {
      reasons.push('Gib eine Beschreibung mit mindestens 5 Zeichen ein.');
    }

    if (isCreatingSubgroup && !effectiveParentGroupId) {
      reasons.push('Wähle eine Hauptgruppe aus.');
    }

    return reasons;
  };

  const isFormValid = () => missingRequirements().length === 0;

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const reasons = missingRequirements();

    if (reasons.length > 0) {
      setErrorMessage(reasons[0]);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { id, error } = await createGroup({
      name: form.name,
      description: form.description,
      visibility: effectiveVisibility,
      groupType: form.groupType,
      parentGroupId: isCreatingSubgroup ? effectiveParentGroupId : undefined,
    });

    setIsSubmitting(false);

    if (error || !id) {
      setErrorMessage(error ?? 'Die Gruppe konnte nicht erstellt werden.');
      return;
    }

    router.replace({ pathname: '/group/[id]', params: { id } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboardOnNative}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={styles.title}>{isCreatingSubgroup ? 'Untergruppe erstellen' : 'Neue Gruppe erstellen'}</Text>
            <Text style={styles.subtitle}>
              {isPreselectedSubgroup
                ? `Neue Untergruppe von ${parentGroupName}.`
                : isCreatingSubgroup
                  ? 'Wähle unten die Hauptgruppe, zu der die neue Untergruppe gehören soll.'
                  : activeTeam
                    ? `Erstelle eine Gruppe rund um ${activeTeam.teamName}.`
                    : 'Erstelle eine Gruppe.'}
            </Text>

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
                {allowedVisibilityOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => (isVisibilityLocked ? undefined : updateField('visibility', option.value))}
                    style={[
                      styles.visibilityOption,
                      effectiveVisibility === option.value && styles.visibilityOptionActive,
                      isVisibilityLocked && styles.visibilityOptionLocked,
                    ]}
                  >
                    <View style={[styles.radioDot, effectiveVisibility === option.value && styles.radioDotActive]} />
                    <View style={styles.visibilityOptionTextWrapper}>
                      <Text style={[styles.optionText, effectiveVisibility === option.value && styles.optionTextActive]}>{option.label}</Text>
                      <Text style={styles.visibilityHint}>{option.hint}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              {isVisibilityLocked && isCreatingSubgroup ? (
                <Text style={styles.visibilityLockedNote}>Die Sichtbarkeit ist durch die Hauptgruppe vorgegeben.</Text>
              ) : null}
            </View>

            {!isPreselectedSubgroup ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Gruppenstruktur</Text>
                <View style={styles.optionColumn}>
                  <Pressable
                    onPress={() => updateField('groupType', 'standalone')}
                    style={[styles.visibilityOption, form.groupType === 'standalone' && styles.visibilityOptionActive]}
                  >
                    <View style={[styles.radioDot, form.groupType === 'standalone' && styles.radioDotActive]} />
                    <View style={styles.visibilityOptionTextWrapper}>
                      <Text style={[styles.optionText, form.groupType === 'standalone' && styles.optionTextActive]}>Normale Gruppe</Text>
                      <Text style={styles.visibilityHint}>Eigenständige Gruppe.</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => updateField('groupType', 'parent')}
                    style={[styles.visibilityOption, form.groupType === 'parent' && styles.visibilityOptionActive]}
                  >
                    <View style={[styles.radioDot, form.groupType === 'parent' && styles.radioDotActive]} />
                    <View style={styles.visibilityOptionTextWrapper}>
                      <Text style={[styles.optionText, form.groupType === 'parent' && styles.optionTextActive]}>Hauptgruppe</Text>
                      <Text style={styles.visibilityHint}>Kann Untergruppen enthalten.</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => updateField('groupType', 'subgroup')}
                    style={[styles.visibilityOption, form.groupType === 'subgroup' && styles.visibilityOptionActive]}
                  >
                    <View style={[styles.radioDot, form.groupType === 'subgroup' && styles.radioDotActive]} />
                    <View style={styles.visibilityOptionTextWrapper}>
                      <Text style={[styles.optionText, form.groupType === 'subgroup' && styles.optionTextActive]}>Untergruppe</Text>
                      <Text style={styles.visibilityHint}>Wird Teil einer Hauptgruppe, die du verwaltest.</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {!isPreselectedSubgroup && form.groupType === 'subgroup' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Hauptgruppe</Text>
                {eligibleParentGroups.length === 0 ? (
                  <Text style={styles.visibilityHint}>
                    Du bist aktuell Owner oder Admin keiner Hauptgruppe. Erstelle zuerst eine Hauptgruppe, bevor du eine Untergruppe anlegen kannst.
                  </Text>
                ) : (
                  <View style={styles.optionColumn}>
                    {eligibleParentGroups.map((parent) => (
                      <Pressable
                        key={parent.id}
                        onPress={() => setManualParentGroupId(parent.id)}
                        style={[styles.visibilityOption, manualParentGroupId === parent.id && styles.visibilityOptionActive]}
                      >
                        <View style={[styles.radioDot, manualParentGroupId === parent.id && styles.radioDotActive]} />
                        <View style={styles.visibilityOptionTextWrapper}>
                          <Text style={[styles.optionText, manualParentGroupId === parent.id && styles.optionTextActive]}>{parent.name}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ) : null}

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            {(() => {
              // Once the button would be disabled, say exactly why -- a disabled Pressable's
              // onPress never fires, so handleSubmit's own per-field messages could otherwise never
              // reach the user (Vorgabe 1/20: never leave a grey button unexplained). Suppressed on
              // a still-pristine "Neue Gruppe erstellen" screen (nothing typed, not building a
              // subgroup yet) so it isn't noise on first render.
              const reasons = missingRequirements();
              const hasStartedFilling = form.name.trim().length > 0 || form.description.trim().length > 0 || isCreatingSubgroup;

              if (reasons.length === 0 || !hasStartedFilling || isSubmitting) {
                return null;
              }

              return (
                <View style={styles.missingRequirements}>
                  {reasons.map((reason) => (
                    <Text key={reason} style={styles.missingRequirementText}>
                      • {reason}
                    </Text>
                  ))}
                </View>
              );
            })()}

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!isFormValid() || isSubmitting}
              style={[styles.submitButton, (!isFormValid() || isSubmitting) && styles.submitButtonDisabled]}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Wird erstellt …' : isCreatingSubgroup ? 'Untergruppe erstellen' : 'Gruppe erstellen'}
              </Text>
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
  visibilityOptionLocked: {
    opacity: 0.7,
  },
  visibilityLockedNote: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
  },
  missingRequirements: {
    marginBottom: Spacing.sm,
  },
  missingRequirementText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: 2,
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
    marginTop: 2,
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
