import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { FeedPostsProvider } from '@/context/feed-posts-context';
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
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="create-post" options={{ title: 'Beitrag erstellen' }} />
            <Stack.Screen name="post/[id]" options={{ title: 'Beitrag' }} />
            <Stack.Screen name="edit-profile" options={{ title: 'Profil bearbeiten' }} />
            <Stack.Screen name="profile/[id]" options={{ title: 'Profil' }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </FeedPostsProvider>
      </ProfileProvider>
    </ThemeProvider>
  );
}
