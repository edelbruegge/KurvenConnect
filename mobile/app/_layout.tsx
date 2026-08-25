import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { HeaderBackButton } from '@/components/navigation/header-back-button';
import { MatchLockScreen } from '@/components/match-lock/match-lock-screen';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { ActiveClubProvider } from '@/context/active-club-context';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { BlocksProvider } from '@/context/blocks-context';
import { FeedPostsProvider } from '@/context/feed-posts-context';
import { GameFollowsProvider } from '@/context/game-follows-context';
import { GamesProvider } from '@/context/games-context';
import { GroupsProvider } from '@/context/groups-context';
import { MatchLockProvider, useMatchLock } from '@/context/match-lock-context';
import { MessagesProvider } from '@/context/messages-context';
import { ModerationProvider } from '@/context/moderation-context';
import { NotificationsProvider } from '@/context/notifications-context';
import { ProfileProvider, useProfiles } from '@/context/profile-context';
import { PushNotificationsProvider } from '@/context/push-notifications-context';
import { ReportsProvider } from '@/context/reports-context';
import { SavedProvider } from '@/context/saved-context';
import { StadiumHistoryProvider } from '@/context/stadium-history-context';
import { StadiumStatsProvider } from '@/context/stadium-stats-context';
import { UserWarningsProvider } from '@/context/user-warnings-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isSupabaseConfigured, SUPABASE_NOT_CONFIGURED_MESSAGE } from '@/lib/supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthLoadingScreen() {
  return (
    <SafeAreaView style={styles.loadingSafeArea}>
      <View style={styles.loadingContent}>
        <ActivityIndicator size="large" color={FeedColors.textPrimary} />
      </View>
    </SafeAreaView>
  );
}

function SupabaseNotConfiguredScreen() {
  return (
    <SafeAreaView style={styles.loadingSafeArea}>
      <View style={styles.loadingContent}>
        <Text style={styles.notConfiguredText}>{SUPABASE_NOT_CONFIGURED_MESSAGE}</Text>
      </View>
    </SafeAreaView>
  );
}

// A failed own-profile fetch (network/Supabase error, not "no row exists") must never be silently
// treated the same as "onboarding not needed" -- without this, ownProfile stays null exactly like
// the genuine missing-row edge case, and the guard below would let the user fall straight through
// into the main app with no profile loaded and no indication anything went wrong. Shown only once
// isOwnProfileLoading has settled with a real error, never during a normal brief loading flash.
function ProfileLoadErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <SafeAreaView style={styles.loadingSafeArea}>
      <View style={styles.loadingContent}>
        <Text style={styles.notConfiguredText}>{error}</Text>
        <Pressable onPress={onRetry} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();
  const { ownProfile, isOwnProfileLoading, ownProfileError, refreshOwnProfile } = useProfiles();
  const { status: matchLockStatus, lockedGame } = useMatchLock();

  if (!isSupabaseConfigured) {
    return <SupabaseNotConfiguredScreen />;
  }

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  // Avoid a flash of the main app before a needed redirect into onboarding: wait for the own
  // profile to have loaded once auth is settled. ownProfile === null (e.g. the rare missing-row
  // edge case, see createMissingOwnProfile) is deliberately NOT treated as needing onboarding --
  // that stays a separate, already-handled fallback in app/(tabs)/profile.tsx.
  if (isAuthenticated && isOwnProfileLoading) {
    return <AuthLoadingScreen />;
  }

  // A genuine fetch error is NOT the same situation as "no profile row exists" -- both used to
  // leave ownProfile === null and fall straight through to the main app below, silently skipping
  // the onboarding decision entirely and leaving the user on a blank/incomplete profile with no way
  // to retry. Only fires once loading has actually finished with a real error.
  if (isAuthenticated && ownProfile === null && ownProfileError) {
    return <ProfileLoadErrorScreen error={ownProfileError} onRetry={refreshOwnProfile} />;
  }

  const needsOnboarding = isAuthenticated && ownProfile !== null && !ownProfile.onboardingCompletedAt;

  // Match Lock gate -- placed after onboarding is resolved (onboarding must always stay reachable
  // for a user who hasn't completed it yet, though in practice a not-yet-onboarded user has no
  // favorite_team_id set and could never be locked anyway) and before the <Stack> renders at all,
  // mirroring AuthLoadingScreen's own early-return above. This is what makes the lock unavoidable
  // for direct/deep-link routes too (Vorgabe 4/22) -- Expo Router mounts this whole component
  // before resolving which specific route to render, exactly like the existing !isAuthenticated
  // guard already relies on.
  if (isAuthenticated && !needsOnboarding) {
    if (matchLockStatus === 'initializing') {
      return <AuthLoadingScreen />;
    }
    if (matchLockStatus === 'locked') {
      return <MatchLockScreen game={lockedGame} />;
    }
  }

  return (
    <>
      <Stack>
        <Stack.Protected guard={isAuthenticated && needsOnboarding}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={isAuthenticated && !needsOnboarding}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="create-post"
            options={{ title: 'Beitrag erstellen', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="create-group"
            options={{ title: 'Gruppe erstellen', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="post/[id]"
            options={{ title: 'Beitrag', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="trip/[id]/requests"
            options={{ title: 'Anfragen verwalten', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="meetup/[id]"
            options={{ title: 'Treffpunkt', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="stadion/[module]"
            options={{ title: 'Stadion', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="stadion/karte"
            options={{ title: 'Stadionkarte', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="stadium/[id]"
            options={{ title: 'Stadion', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="matchday/[id]"
            options={{ title: 'Spieltag', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="messages"
            options={{ title: 'Nachrichten', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="messages/[id]"
            options={{ title: 'Nachricht', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="notifications"
            options={{ title: 'Benachrichtigungen', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="group/[id]"
            options={{ title: 'Gruppe', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="group/[id]/members"
            options={{ title: 'Mitglieder', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen name="group/[id]/chat" options={{ headerShown: false }} />
          <Stack.Screen
            name="group/[id]/edit"
            options={{ title: 'Gruppe bearbeiten', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="group/[id]/transfer-ownership"
            options={{ title: 'Inhaberschaft übertragen', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="saved"
            options={{ title: 'Gespeichert', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="activity"
            options={{ title: 'Meine Aktivitäten', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="blocked-users"
            options={{ title: 'Blockierte Nutzer', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="settings"
            options={{ title: 'Einstellungen', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="moderation/index"
            options={{ title: 'Moderation', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="moderation/[id]"
            options={{ title: 'Meldung', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="edit-profile"
            options={{ title: 'Profil bearbeiten', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="profile/[id]"
            options={{ title: 'Profil', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="profile/[id]/followers"
            options={{ title: 'Follower', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
          <Stack.Screen
            name="profile/[id]/following"
            options={{ title: 'Gefolgt', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
          />
        </Stack.Protected>

        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
        </Stack.Protected>

        {/* Outside every Stack.Protected guard on purpose: reachable both from the unauthenticated
            register screen's consent checkbox and from the signed-in profile's "Konto" section. */}
        <Stack.Screen
          name="legal/datenschutz"
          options={{ title: 'Datenschutzerklärung', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
        />
        <Stack.Screen
          name="legal/impressum"
          options={{ title: 'Impressum', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
        />
        <Stack.Screen
          name="legal/nutzungsbedingungen"
          options={{ title: 'Nutzungsbedingungen', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
        />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <ProfileProvider>
          <MatchLockProvider>
          <GamesProvider>
            <ActiveClubProvider>
              <FeedPostsProvider>
                <StadiumHistoryProvider>
                  <StadiumStatsProvider>
                  <MessagesProvider>
                    <NotificationsProvider>
                      <PushNotificationsProvider>
                        <GroupsProvider>
                          <SavedProvider>
                            <GameFollowsProvider>
                              <ReportsProvider>
                                <BlocksProvider>
                                  <ModerationProvider>
                                    <UserWarningsProvider>
                                      <RootNavigator />
                                    </UserWarningsProvider>
                                  </ModerationProvider>
                                </BlocksProvider>
                              </ReportsProvider>
                            </GameFollowsProvider>
                          </SavedProvider>
                        </GroupsProvider>
                      </PushNotificationsProvider>
                    </NotificationsProvider>
                  </MessagesProvider>
                  </StadiumStatsProvider>
                </StadiumHistoryProvider>
              </FeedPostsProvider>
            </ActiveClubProvider>
          </GamesProvider>
          </MatchLockProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  loadingSafeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  notConfiguredText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: Spacing.lg,
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
});
