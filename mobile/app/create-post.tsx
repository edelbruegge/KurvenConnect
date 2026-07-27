import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CategoryLabels, ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import type { FeedPostCategory, NewFeedPost } from '@/data/feed-posts';
import { seedGames } from '@/data/games';

const categoryOptions: FeedPostCategory[] = ['Beitrag', 'Fahrt', 'Gesuch', 'Treffpunkt'];

type CreatePostFormState = {
  category: FeedPostCategory;
  description: string;
  hasImage: boolean;
  departure: string;
  destination: string;
  departureTime: string;
  freeSeats: string;
  occasion: string;
  requestedService: string;
  gameId: string;
  meetupTitle: string;
  location: string;
  date: string;
  eventTime: string;
  maxAttendees: string;
};

const initialFormState: CreatePostFormState = {
  category: 'Beitrag',
  description: '',
  hasImage: false,
  departure: '',
  destination: '',
  departureTime: '',
  freeSeats: '',
  occasion: '',
  requestedService: '',
  gameId: '',
  meetupTitle: '',
  location: '',
  date: '',
  eventTime: '',
  maxAttendees: '',
};

export default function CreatePostScreen() {
  const router = useRouter();
  const { addPost } = useFeedPosts();
  const [form, setForm] = React.useState<CreatePostFormState>(initialFormState);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const updateField = <K extends keyof CreatePostFormState>(field: K, value: CreatePostFormState[K]) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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

    if (form.category === 'Treffpunkt') {
      const maxAttendeesValid = !form.maxAttendees.trim() || (Number.isInteger(Number(form.maxAttendees)) && Number(form.maxAttendees) > 0);

      return Boolean(
        form.gameId &&
          form.meetupTitle.trim().length >= 3 &&
          form.location.trim() &&
          form.date.trim() &&
          form.eventTime.trim() &&
          form.description.trim().length >= 5 &&
          maxAttendeesValid,
      );
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

    if (form.category === 'Treffpunkt') {
      if (!form.gameId) {
        setErrorMessage('Bitte wähle ein Spiel aus.');
        return;
      }

      if (form.meetupTitle.trim().length < 3) {
        setErrorMessage('Der Titel muss mindestens 3 Zeichen lang sein.');
        return;
      }

      if (!form.location.trim()) {
        setErrorMessage('Bitte gib einen Ort an.');
        return;
      }

      if (!form.date.trim()) {
        setErrorMessage('Bitte gib ein Datum an.');
        return;
      }

      if (!form.eventTime.trim()) {
        setErrorMessage('Bitte gib eine Uhrzeit an.');
        return;
      }

      if (form.description.trim().length < 5) {
        setErrorMessage('Die Beschreibung muss mindestens 5 Zeichen lang sein.');
        return;
      }

      if (form.maxAttendees.trim()) {
        const parsedMax = Number(form.maxAttendees);
        if (!Number.isInteger(parsedMax) || parsedMax <= 0) {
          setErrorMessage('Bitte gib eine gültige positive Zahl für die maximale Teilnehmerzahl ein.');
          return;
        }
      }
    }

    const selectedGame = seedGames.find((game) => game.id === form.gameId);

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
              occasion: form.occasion.trim() || undefined,
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
      ...(form.category === 'Treffpunkt' && selectedGame
        ? {
            meetupDetails: {
              gameId: selectedGame.id,
              gameLabel: selectedGame.label,
              title: form.meetupTitle.trim(),
              location: form.location.trim(),
              date: form.date.trim(),
              eventTime: form.eventTime.trim(),
              maxAttendees: form.maxAttendees.trim() ? Number(form.maxAttendees) : undefined,
              attendeeIds: [],
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
        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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
                    <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>{CategoryLabels[category]}</Text>
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
              <TextInput value={form.departure} onChangeText={(value) => updateField('departure', value)} placeholder="Abfahrtsort" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.destination} onChangeText={(value) => updateField('destination', value)} placeholder="Ziel" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.departureTime} onChangeText={(value) => updateField('departureTime', value)} placeholder="Abfahrtszeit" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.freeSeats} onChangeText={(value) => updateField('freeSeats', value)} placeholder="Freie Plätze" keyboardType="number-pad" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.occasion} onChangeText={(value) => updateField('occasion', value)} placeholder="Spiel oder Anlass (optional)" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            </View>
          ) : null}

          {form.category === 'Gesuch' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gesucht</Text>
              <TextInput value={form.requestedService} onChangeText={(value) => updateField('requestedService', value)} placeholder="Gesuchte Leistung" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            </View>
          ) : null}

          {form.category === 'Treffpunkt' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Treffpunkt-Details</Text>
              <View style={styles.optionRow}>
                {seedGames.map((game) => {
                  const isSelected = form.gameId === game.id;
                  return (
                    <Pressable
                      key={game.id}
                      onPress={() => updateField('gameId', game.id)}
                      style={[styles.optionButton, isSelected && styles.optionButtonActive]}>
                      <Text style={[styles.optionText, isSelected && styles.optionTextActive]}>{game.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput value={form.meetupTitle} onChangeText={(value) => updateField('meetupTitle', value)} placeholder="Titel des Treffpunkts" placeholderTextColor={FeedColors.textSecondary} style={[styles.textInput, styles.optionSpacing]} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.location} onChangeText={(value) => updateField('location', value)} placeholder="Ort oder Adresse" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.date} onChangeText={(value) => updateField('date', value)} placeholder="Datum (z. B. 08.11.2026)" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.eventTime} onChangeText={(value) => updateField('eventTime', value)} placeholder="Uhrzeit (z. B. 13:00 Uhr)" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.maxAttendees} onChangeText={(value) => updateField('maxAttendees', value)} placeholder="Maximale Teilnehmerzahl (optional)" keyboardType="number-pad" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            </View>
          ) : null}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable onPress={handleSubmit} disabled={!isFormValid()} style={[styles.submitButton, !isFormValid() && styles.submitButtonDisabled]}>
            <Text style={styles.submitButtonText}>Beitrag veröffentlichen</Text>
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
  optionSpacing: {
    marginTop: Spacing.sm,
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
