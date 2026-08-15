import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useSafeBack } from '@/hooks/use-safe-back';

type NotFoundViewProps = {
  title: string;
  message: string;
  // Optional retry action (e.g. a transient network error while fetching content directly by id) --
  // shown alongside "Zurück" instead of it, existing callers that omit this keep the exact same
  // single-button layout as before.
  onRetry?: () => void;
  retryLabel?: string;
};

export function NotFoundView({ title, message, onRetry, retryLabel = 'Erneut versuchen' }: NotFoundViewProps) {
  const goBack = useSafeBack();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>{message}</Text>
        {onRetry ? (
          <Pressable onPress={onRetry} style={[styles.backButton, styles.retryButton]} accessibilityRole="button" accessibilityLabel={retryLabel}>
            <Text style={styles.backButtonText}>{retryLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Zurück">
          <Text style={styles.backButtonText}>Zurück</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  text: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  backButton: {
    backgroundColor: FeedColors.cardBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  retryButton: {
    marginBottom: Spacing.sm,
  },
  backButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
  },
});
