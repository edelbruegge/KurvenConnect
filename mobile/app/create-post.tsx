import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { GameSelector } from '@/components/stadion/game-selector';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CategoryLabels, ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useActiveClub } from '@/context/active-club-context';
import { useAuth } from '@/context/auth-context';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useStadiumHistory } from '@/context/stadium-history-context';
import { useStadiumStats } from '@/context/stadium-stats-context';
import type { FeedPostCategory } from '@/data/feed-posts';
import { seedGames } from '@/data/games';
import { dismissKeyboardOnNative } from '@/lib/dismiss-keyboard';
import { parseGermanDateAndTimeToIso } from '@/lib/map-supabase-meetup';
import { getPostMediaSignedUrl, MAX_POST_IMAGES, pickPostImages, uploadPostImage, type PickedPostImage } from '@/lib/post-media';

const categoryOptions: FeedPostCategory[] = ['Beitrag', 'Fahrt', 'Gesuch', 'Treffpunkt'];

type CreatePostFormState = {
  category: FeedPostCategory;
  description: string;
  departure: string;
  destination: string;
  departureTime: string;
  freeSeats: string;
  requestedService: string;
  gameId: string;
  gameLabel: string;
  meetupTitle: string;
  location: string;
  date: string;
  eventTime: string;
  maxAttendees: string;
};

const initialFormState: CreatePostFormState = {
  category: 'Beitrag',
  description: '',
  departure: '',
  destination: '',
  departureTime: '',
  freeSeats: '',
  requestedService: '',
  gameId: '',
  gameLabel: '',
  meetupTitle: '',
  location: '',
  date: '',
  eventTime: '',
  maxAttendees: '',
};

export default function CreatePostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ gameId?: string; gameLabel?: string }>();
  const { createRemotePost, createRemoteTrip, createRemoteMeetup, createRemoteWantedEntry, appendRemotePostMedia } = useFeedPosts();
  const { refreshStadiumHistory } = useStadiumHistory();
  const { refreshStadiumStats } = useStadiumStats();
  const { activeTeam } = useActiveClub();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  // Local to this screen, so it is naturally reset whenever create-post is (re-)opened -- e.g.
  // after an account switch, since nothing outside this component ever reads or persists it.
  const [selectedImages, setSelectedImages] = useState<PickedPostImage[]>([]);
  const [isPickingImages, setIsPickingImages] = useState(false);
  const [imagePickerError, setImagePickerError] = useState<string | null>(null);
  // An optional game preselection via route params — nothing in the app currently links here
  // with these set (the Stadion area has no creation entry point anymore, see
  // app/(tabs)/stadion.tsx), but a future deep link could still pass them, and the shared
  // GameSelector below always lets the user see/change/remove whatever ends up selected, so
  // creation never depends on this.
  const presetGameId = params.gameId || '';
  const presetGameLabel = params.gameLabel || '';
  const [form, setForm] = React.useState<CreatePostFormState>(() => ({
    ...initialFormState,
    gameId: presetGameId,
    gameLabel: presetGameId ? presetGameLabel : '',
  }));
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const updateField = <K extends keyof CreatePostFormState>(field: K, value: CreatePostFormState[K]) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handlePickImages = async () => {
    if (isPickingImages || selectedImages.length >= MAX_POST_IMAGES) {
      return;
    }

    setIsPickingImages(true);
    setImagePickerError(null);
    const { images, error } = await pickPostImages(MAX_POST_IMAGES - selectedImages.length);
    setIsPickingImages(false);

    if (error) {
      setImagePickerError(error);
    }

    if (images.length > 0) {
      setSelectedImages((current) => [...current, ...images].slice(0, MAX_POST_IMAGES));
    }
  };

  const handleRemoveImage = (uriToRemove: string) => {
    setSelectedImages((current) => current.filter((image) => image.uri !== uriToRemove));
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

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

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

      if (!parseGermanDateAndTimeToIso(form.date, form.eventTime)) {
        setErrorMessage('Bitte gib Datum (TT.MM.JJJJ) und Uhrzeit (HH:MM) im richtigen Format ein.');
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

    if (form.category === 'Beitrag') {
      setIsSubmitting(true);
      setErrorMessage(null);
      const { error, postId } = await createRemotePost({
        content: form.description,
        gameId: form.gameId || undefined,
        gameLabel: form.gameId ? form.gameLabel || undefined : undefined,
      });

      if (error || !postId) {
        setIsSubmitting(false);
        setErrorMessage(error);
        return;
      }

      if (form.gameId) {
        refreshStadiumHistory();
        // Same trigger condition as the just-created public.posts row's own game_id guard (see
        // record_game_attendance() in the attendance migration) -- a controlled refresh right after
        // a successful save is enough (Vorgabe 29), no extra realtime subscription needed for this.
        if (authUserId) {
          refreshStadiumStats(authUserId);
        }
      }

      // Images are uploaded only after the post itself exists (never a "half" post_media row for
      // a file that isn't there yet). A failed image never rolls back the already-published post
      // or text -- that would risk a duplicate post on retry -- it is reported instead, with
      // whatever was uploaded successfully still cleaned up per-image on its own failure (see
      // uploadPostImage).
      if (selectedImages.length > 0 && authUserId) {
        let failureCount = 0;

        for (let index = 0; index < selectedImages.length; index += 1) {
          const { mediaRow, error: uploadError } = await uploadPostImage({
            authUserId,
            postId,
            position: index,
            image: selectedImages[index],
          });

          if (uploadError || !mediaRow) {
            failureCount += 1;
            continue;
          }

          const signedUrl = await getPostMediaSignedUrl(mediaRow.storage_path);
          if (signedUrl) {
            appendRemotePostMedia(postId, { id: mediaRow.id, url: signedUrl, width: mediaRow.width, height: mediaRow.height });
          }
        }

        setIsSubmitting(false);

        if (failureCount > 0) {
          // The post is already live -- clear the form (its text is safely published, keeping it
          // around would only invite an accidental duplicate post on a second tap) and explain
          // what happened instead of silently navigating away.
          setForm(initialFormState);
          setSelectedImages([]);
          setErrorMessage(
            `Dein Beitrag wurde veröffentlicht. ${failureCount} von ${selectedImages.length} Bild(ern) konnte(n) nicht hochgeladen werden. Du findest den Beitrag im Feed.`,
          );
          return;
        }
      } else {
        setIsSubmitting(false);
      }

      router.replace('/');
      return;
    }

    if (form.category === 'Fahrt') {
      setIsSubmitting(true);
      setErrorMessage(null);
      const { error } = await createRemoteTrip({
        description: form.description,
        departure: form.departure,
        destination: form.destination,
        departureTime: form.departureTime,
        freeSeats: Number(form.freeSeats),
        gameId: form.gameId || undefined,
        gameLabel: form.gameId ? form.gameLabel || undefined : undefined,
      });
      setIsSubmitting(false);

      if (error) {
        setErrorMessage(error);
        return;
      }

      router.replace('/');
      return;
    }

    if (form.category === 'Treffpunkt') {
      const selectedGame = seedGames.find((game) => game.id === form.gameId);

      if (!selectedGame) {
        setErrorMessage('Bitte wähle ein Spiel aus.');
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(null);
      const { error } = await createRemoteMeetup({
        description: form.description,
        title: form.meetupTitle,
        location: form.location,
        date: form.date,
        eventTime: form.eventTime,
        maxAttendees: form.maxAttendees.trim() ? Number(form.maxAttendees) : undefined,
        gameId: selectedGame.id,
        gameLabel: selectedGame.label,
      });
      setIsSubmitting(false);

      if (error) {
        setErrorMessage(error);
        return;
      }

      router.replace('/');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const { error } = await createRemoteWantedEntry({
      description: form.description,
      requestedService: form.requestedService,
      gameId: form.gameId || undefined,
      gameLabel: form.gameId ? form.gameLabel || undefined : undefined,
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error);
      return;
    }

    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboardOnNative}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={styles.title}>Neuen Beitrag erstellen</Text>
          <Text style={styles.subtitle}>Erstelle einen lokalen Beispielbeitrag für den aktuellen Feed.</Text>
          {activeTeam ? <Text style={styles.activeClubHint}>{CategoryLabels[form.category]} für {activeTeam.teamName}</Text> : null}

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

            {form.category === 'Beitrag' ? (
              <View style={styles.imagesBlock}>
                {selectedImages.length > 0 ? (
                  <View style={styles.imagePreviewGrid}>
                    {selectedImages.map((image) => (
                      <View key={image.uri} style={styles.imagePreviewItem}>
                        <Image source={{ uri: image.uri }} style={styles.imagePreviewThumb} contentFit="cover" />
                        <Pressable
                          onPress={() => handleRemoveImage(image.uri)}
                          style={styles.imageRemoveButton}
                          accessibilityRole="button"
                          accessibilityLabel="Bild entfernen"
                          hitSlop={8}
                        >
                          <IconSymbol size={16} name="xmark.circle.fill" color={FeedColors.textPrimary} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Pressable
                  onPress={handlePickImages}
                  disabled={isPickingImages || selectedImages.length >= MAX_POST_IMAGES}
                  style={[styles.addPhotoButton, selectedImages.length >= MAX_POST_IMAGES && styles.addPhotoButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Foto hinzufügen"
                >
                  <IconSymbol size={16} name="photo" color={FeedColors.textPrimary} />
                  <Text style={styles.addPhotoButtonText}>
                    {selectedImages.length >= MAX_POST_IMAGES ? `Maximal ${MAX_POST_IMAGES} Fotos erreicht` : 'Foto hinzufügen'}
                  </Text>
                </Pressable>

                {imagePickerError ? <Text style={styles.imageErrorText}>{imagePickerError}</Text> : null}
              </View>
            ) : null}
          </View>

          <GameSelector
            selectedGameId={form.gameId || null}
            onChange={(gameId, gameLabel) => setForm((current) => ({ ...current, gameId: gameId ?? '', gameLabel: gameLabel ?? '' }))}
          />

          <View style={styles.section}>
            <Text style={styles.hintText}>
              {form.category === 'Beitrag'
                ? 'Dieser Beitrag wird online gespeichert.'
                : form.category === 'Fahrt'
                  ? 'Diese Fahrt wird online gespeichert. Bilder werden in diesem Schritt noch nicht unterstützt.'
                  : form.category === 'Treffpunkt'
                    ? 'Dieser Treffpunkt wird online gespeichert. Bilder werden in diesem Schritt noch nicht unterstützt.'
                    : 'Dieser Gesucht-Eintrag wird online gespeichert. Bilder werden in diesem Schritt noch nicht unterstützt.'}
            </Text>
          </View>

          {form.category === 'Fahrt' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Fahrdetails</Text>
              <TextInput value={form.departure} onChangeText={(value) => updateField('departure', value)} placeholder="Abfahrtsort" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.destination} onChangeText={(value) => updateField('destination', value)} placeholder="Ziel" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.departureTime} onChangeText={(value) => updateField('departureTime', value)} placeholder="Abfahrtszeit" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.freeSeats} onChangeText={(value) => updateField('freeSeats', value)} placeholder="Freie Plätze" keyboardType="number-pad" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
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
              <TextInput value={form.meetupTitle} onChangeText={(value) => updateField('meetupTitle', value)} placeholder="Titel des Treffpunkts" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.location} onChangeText={(value) => updateField('location', value)} placeholder="Ort oder Adresse" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.date} onChangeText={(value) => updateField('date', value)} placeholder="Datum (z. B. 08.11.2026)" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.eventTime} onChangeText={(value) => updateField('eventTime', value)} placeholder="Uhrzeit (z. B. 13:00 Uhr)" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput value={form.maxAttendees} onChangeText={(value) => updateField('maxAttendees', value)} placeholder="Maximale Teilnehmerzahl (optional)" keyboardType="number-pad" placeholderTextColor={FeedColors.textSecondary} style={styles.textInput} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            </View>
          ) : null}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            onPress={handleSubmit}
            disabled={!isFormValid() || isSubmitting}
            style={[styles.submitButton, (!isFormValid() || isSubmitting) && styles.submitButtonDisabled]}>
            <Text style={styles.submitButtonText}>{isSubmitting ? 'Wird veröffentlicht …' : 'Beitrag veröffentlichen'}</Text>
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
  activeClubHint: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
    marginTop: -Spacing.sm,
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
  imagesBlock: {
    marginTop: Spacing.xs,
  },
  imagePreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  imagePreviewItem: {
    width: 72,
    height: 72,
  },
  imagePreviewThumb: {
    width: 72,
    height: 72,
    borderRadius: Radii.md,
    backgroundColor: FeedColors.imagePlaceholder,
  },
  imageRemoveButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: FeedColors.background,
    borderRadius: Radii.round,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  addPhotoButtonDisabled: {
    opacity: 0.5,
  },
  addPhotoButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  imageErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
  },
  hintText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
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
