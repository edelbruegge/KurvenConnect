import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { HeaderBackButton } from '@/components/navigation/header-back-button';
import { FeedPostsProvider } from '@/context/feed-posts-context';
import { MessagesProvider } from '@/context/messages-context';
import { NotificationsProvider } from '@/context/notifications-context';
import { ProfileProvider } from '@/context/profile-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ProfileProvider>
        <FeedPostsProvider>
          <MessagesProvider>
            <NotificationsProvider>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="create-post"
                  options={{ title: 'Beitrag erstellen', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
                />
                <Stack.Screen
                  name="post/[id]"
                  options={{ title: 'Beitrag', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
                />
                <Stack.Screen
                  name="meetup/[id]"
                  options={{ title: 'Treffpunkt', headerLeft: () => <HeaderBackButton />, headerBackVisible: false }}
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
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
              <StatusBar style="auto" />
            </NotificationsProvider>
          </MessagesProvider>
        </FeedPostsProvider>
      </ProfileProvider>
    </ThemeProvider>
  );
}
