import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { HeaderBackButton } from '@/components/navigation/header-back-button';
import { FeedColors, FontSizes, Spacing } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { BlocksProvider } from '@/context/blocks-context';
import { FeedPostsProvider } from '@/context/feed-posts-context';
import { GamesProvider } from '@/context/games-context';
import { GroupsProvider } from '@/context/groups-context';
import { MessagesProvider } from '@/context/messages-context';
import { ModerationProvider } from '@/context/moderation-context';
import { NotificationsProvider } from '@/context/notifications-context';
import { ProfileProvider } from '@/context/profile-context';
import { PushNotificationsProvider } from '@/context/push-notifications-context';
import { ReportsProvider } from '@/context/reports-context';
import { SavedProvider } from '@/context/saved-context';
import { StadiumHistoryProvider } from '@/context/stadium-history-context';
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

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  if (!isSupabaseConfigured) {
    return <SupabaseNotConfiguredScreen />;
  }

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  return (
    <>
      <Stack>
        <Stack.Protected guard={isAuthenticated}>
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
            name="moderation/demo"
            options={{ title: 'Moderation – lokale Demo', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
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
          <FeedPostsProvider>
            <GamesProvider>
              <StadiumHistoryProvider>
                <MessagesProvider>
                  <NotificationsProvider>
                    <PushNotificationsProvider>
                      <GroupsProvider>
                        <SavedProvider>
                          <ReportsProvider>
                            <BlocksProvider>
                              <ModerationProvider>
                                <UserWarningsProvider>
                                  <RootNavigator />
                                </UserWarningsProvider>
                              </ModerationProvider>
                            </BlocksProvider>
                          </ReportsProvider>
                        </SavedProvider>
                      </GroupsProvider>
                    </PushNotificationsProvider>
                  </NotificationsProvider>
                </MessagesProvider>
              </StadiumHistoryProvider>
            </GamesProvider>
          </FeedPostsProvider>
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
});
