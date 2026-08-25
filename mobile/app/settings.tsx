import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountSection } from '@/components/profile/account-section';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';

// Everything account-/legal-adjacent that used to sit inline in the profile screen, moved behind
// the gear icon: blocked users, sign-out, account deletion, and the legal pages (the latter two
// via AccountSection, which already renders them -- see components/profile/account-section.tsx).
export default function SettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable
          onPress={() => router.push('/blocked-users')}
          style={styles.linkButton}
          accessibilityRole="button"
          accessibilityLabel="Blockierte Nutzer öffnen"
        >
          <IconSymbol size={18} name="nosign" color={FeedColors.textPrimary} />
          <Text style={styles.linkButtonText}>Blockierte Nutzer</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/legal/datenschutz')}
          style={styles.linkButton}
          accessibilityRole="button"
          accessibilityLabel="Datenschutzerklärung öffnen"
        >
          <IconSymbol size={18} name="shield.fill" color={FeedColors.textPrimary} />
          <Text style={styles.linkButtonText}>Datenschutzerklärung</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/legal/nutzungsbedingungen')}
          style={styles.linkButton}
          accessibilityRole="button"
          accessibilityLabel="Nutzungsbedingungen öffnen"
        >
          <IconSymbol size={18} name="doc.text.fill" color={FeedColors.textPrimary} />
          <Text style={styles.linkButtonText}>Nutzungsbedingungen</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/legal/impressum')}
          style={styles.linkButton}
          accessibilityRole="button"
          accessibilityLabel="Impressum öffnen"
        >
          <IconSymbol size={18} name="doc.text.fill" color={FeedColors.textPrimary} />
          <Text style={styles.linkButtonText}>Impressum</Text>
        </Pressable>

        <AccountSection />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  container: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    minHeight: 44,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
    backgroundColor: FeedColors.cardBackground,
  },
  linkButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
