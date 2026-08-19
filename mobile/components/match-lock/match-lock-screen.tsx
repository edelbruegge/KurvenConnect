import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClubColors, FeedColors, FontSizes, Spacing } from '@/constants/theme';
import type { MatchLockGame } from '@/context/match-lock-context';

// Fullscreen replacement for the entire app while a match lock is active (see app/_layout.tsx's
// RootNavigator) -- no header, no bottom navigation, no buttons of any kind, no live score.
// Deliberately quiet: this screen is not a feature to engage with, it's the app stepping out of
// the way (Vorgabe 19-23). No user-facing bypass and no visible development control either --
// MatchLockContext's own simulation is __DEV__-console-only (see that file), never wired to
// anything rendered here, so this screen looks and behaves identically for every build.
export function MatchLockScreen({ game }: { game: MatchLockGame | null }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.accentLine} />
        <Text style={styles.headline}>ES IST SPIELTAG.</Text>
        <Text style={styles.subheadline}>Gib alles für deine Farben.</Text>

        {game ? (
          <Text style={styles.teams}>
            {game.homeTeamName} – {game.awayTeamName}
          </Text>
        ) : null}

        <Text style={styles.explanation}>
          Kurvenconnect ist während des Spiels geschlossen.{'\n'}Nach dem Abpfiff sind wir wieder für dich da.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  accentLine: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: ClubColors.primary,
    marginBottom: Spacing.xl,
  },
  headline: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
  subheadline: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  teams: {
    color: ClubColors.text,
    fontSize: FontSizes.subtitle,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  explanation: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.xl,
  },
});
