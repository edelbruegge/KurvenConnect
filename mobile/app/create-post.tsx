import React from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import type { FeedPostCategory, NewFeedPost } from '@/data/feed-posts';

const categoryOptions: FeedPostCategory[] = ['Beitrag', 'Fahrt', 'Gesuch'];

type CreatePostFormState = {
  category: FeedPostCategory;
  description: string;
  hasImage: boolean;
  departure: string;
  destination: string;
  departureTime: string;
  freeSeats: string;
  requestedService: string;
};

const initialFormState: CreatePostFormState = {
  category: 'Beitrag',
  description: '',
  hasImage: false,
  departure: '',
  destination: '',
  departureTime: '',
  freeSeats: '',
  requestedService: '',
};

export default function CreatePostScreen() {
  const router = useRouter();
  const { addPost } = useFeedPosts();
  const [form, setForm] = React.useState<CreatePostFormState>(initialFormState);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const updateField = <K extends keyof CreatePostFormState>(field: K, value: CreatePostFormState[K]) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const isFormValid = () => {
    if (!form.description.trim()) {
      return false;
    }

    if (form.category === 'Fahrt') {
      return Boolean(form.departure.trim() && form.destination.trim() && form.departureTime.trim() && form.freeSeats.trim());
    }

    if (form.category === 'Gesuch') {
      return Boolean(form.requestedService.trim());
    }

    return true;
  };

  const handleSubmit = () => {
    if (!form.description.trim()) {
      setErrorMessage('Bitte gib einen Beschreibungstext ein.');
      return;
    }

    if (form.category === 'Fahrt') {
      if (!form.departure.trim() || !form.destination.trim() || !form.departureTime.trim() || !form.freeSeats.trim()) {
        setErrorMessage('Bitte fülle Abfahrtsort, Ziel, Abfahrtszeit und freie Plätze aus.');
        return;
      }

      const parsedSeats = Number(form.freeSeats);
      if (!Number.isFinite(parsedSeats) || parsedSeats <= 0) {
        setErrorMessage('Bitte gib eine gültige Zahl für freie Plätze ein.');
        return;
      }
    }

    if (form.category === 'Gesuch' && !form.requestedService.trim()) {
      setErrorMessage('Bitte gib an, welche Leistung du suchst.');
      return;
    }

    const postToAdd: NewFeedPost = {
      category: form.category,
      description: form.description.trim(),
      hasImage: form.hasImage,
      ...(form.category === 'Fahrt'
        ? {
            tripDetails: {
              departure: form.departure.trim(),
              destination: form.destination.trim(),
              departureTime: form.departureTime.trim(),
              freeSeats: Number(form.freeSeats),
            },
          }
        : {}),
      ...(form.category === 'Gesuch'
        ? {
            requestDetails: {
              requestedService: form.requestedService.trim(),
            },
          }
        : {}),
    };

    addPost(postToAdd);
    setErrorMessage(null);
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Neuen Beitrag erstellen</Text>
          <Text style={styles.subtitle}>Erstelle einen lokalen Beispielbeitrag für den aktuellen Feed.</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kategorie</Text>
            <View style={styles.optionRow}>
              {categoryOptions.map((category) => {
                const isSelected = form.category === category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => updateField('category', category)}
                    style={[styles.optionButton, isSelected && styles.optionButtonActive]}>
                    <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>{category}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Beschreibung</Text>
            <TextInput
              multiline
              numberOfLines={5}
              value={form.description}
              onChangeText={(value) => updateField('description', value)}
              placeholder="Was möchtest du teilen?"
              placeholderTextColor={FeedColors.textSecondary}
              style={styles.textInput}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.section}>
            <Pressable onPress={() => updateField('hasImage', !form.hasImage)} style={styles.toggleRow}>
              <View style={[styles.checkbox, form.hasImage && styles.checkboxActive]} />
              <Text style={styles.toggleText}>Bildbereich anzeigen</Text>
            </Pressable>
          </View>

          {form.category === 'Fahrt' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Fahrdetails</Text>
              <TextInput value={form.departure} onChangeText={(value) => updateField('departure', value)} placeholder="Abfahrtsort" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} />
              <TextInput value={form.destination} onChangeText={(value) => updateField('destination', value)} placeholder="Ziel" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} />
              <TextInput value={form.departureTime} onChangeText={(value) => updateField('departureTime', value)} placeholder="Abfahrtszeit" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} />
              <TextInput value={form.freeSeats} onChangeText={(value) => updateField('freeSeats', value)} placeholder="Freie Plätze" keyboardType="number-pad" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} />
            </View>
          ) : null}

          {form.category === 'Gesuch' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gesuch</Text>
              <TextInput value={form.requestedService} onChangeText={(value) => updateField('requestedService', value)} placeholder="Gesuchte Leistung" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} />
            </View>
          ) : null}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable onPress={handleSubmit} disabled={!isFormValid()} style={[styles.submitButton, !isFormValid() && styles.submitButtonDisabled]}>
            <Text style={styles.submitButtonText}>Beitrag veröffentlichen</Text>
          </Pressable>
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
    backgroundColor: FeedColors.imagePlaceholder,
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
    marginBottom: Spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: FeedColors.textSecondary,
    marginRight: Spacing.sm,
  },
  checkboxActive: {
    backgroundColor: FeedColors.textPrimary,
  },
  toggleText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
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
});
