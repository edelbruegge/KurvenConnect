import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useSafeBack } from '@/hooks/use-safe-back';

type NotFoundViewProps = {
  title: string;
  message: string;
};

export function NotFoundView({ title, message }: NotFoundViewProps) {
  const goBack = useSafeBack();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>{message}</Text>
        <Pressable onPress={goBack} style={styles.backButton}>
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
  backButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
  },
});
