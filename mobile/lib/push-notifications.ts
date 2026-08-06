import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const INSTALLATION_ID_STORAGE_KEY = '@kurvenconnect/push-installation-id';
const ANDROID_CHANNEL_ID = 'default';

/**
 * The single gate every push feature goes through. `false` here must always mean "quietly do
 * nothing" — never a crash and never a false "push is on" message. Covers: web (no native push
 * module), a simulator/emulator (no real push token), Expo Go (remote push was removed from Expo
 * Go — see Expo SDK 53+ changelog), and a project that isn't EAS-linked yet (no projectId, so
 * getExpoPushTokenAsync cannot run).
 */
export function isPushSupported(): boolean {
  if (Platform.OS === 'web') {
    return false;
  }

  if (!Device.isDevice) {
    return false;
  }

  if (Constants.appOwnership === 'expo') {
    return false;
  }

  return Boolean(getEasProjectId());
}

function getEasProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
}

/**
 * A random, privacy-friendly per-installation identifier — not a hardware identifier (no IMEI,
 * serial number, MAC address, or vendor ID). Generated once and persisted locally; a reinstall
 * gets a new one, which is intentional (this identifies the app installation, not the physical
 * device).
 */
export async function getOrCreateInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_ID_STORAGE_KEY);

  if (existing) {
    return existing;
  }

  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const generated = `install-${Date.now().toString(36)}-${random}`;
  await AsyncStorage.setItem(INSTALLATION_ID_STORAGE_KEY, generated);
  return generated;
}

let isHandlerConfigured = false;

/**
 * Configures how an incoming push is presented while the app is in the foreground, and (Android
 * only) the notification channel it's delivered through. Safe to call multiple times — only
 * takes effect once. Never called on web.
 */
export function configureNotificationHandler(): void {
  if (isHandlerConfigured || Platform.OS === 'web') {
    return;
  }

  isHandlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Wichtige Hinweise',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

export async function getPushPermissionStatus(): Promise<Notifications.PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function requestPushPermission(): Promise<Notifications.PermissionStatus> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status;
}

export async function getExpoPushToken(): Promise<string> {
  const projectId = getEasProjectId();

  if (!projectId) {
    throw new Error('EAS project is not configured (missing extra.eas.projectId)');
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/**
 * Upserts the current device's Expo push token for the signed-in user via the
 * register_push_token RPC (SECURITY DEFINER — see supabase/migrations/20260806120000_create_push_tokens.sql).
 * Reassigns/reactivates the row if this device's token already belongs to a different account.
 */
export async function registerCurrentDevicePushToken(expoPushToken: string): Promise<void> {
  const deviceId = await getOrCreateInstallationId();

  const { error } = await supabase.rpc('register_push_token', {
    p_expo_push_token: expoPushToken,
    p_device_id: deviceId,
    p_platform: Platform.OS,
    p_app_version: Constants.expoConfig?.version ?? null,
    p_device_name: Device.deviceName ?? null,
  });

  if (error) {
    throw error;
  }
}

/**
 * Deactivates the current device's token for the currently signed-in user. Must be called while
 * a session still exists (auth.uid() is evaluated server-side) — in particular, before
 * supabase.auth.signOut(), not after.
 */
export async function unregisterCurrentDevicePushToken(expoPushToken: string): Promise<void> {
  const { error } = await supabase.rpc('deactivate_push_token', { p_expo_push_token: expoPushToken });

  if (error) {
    throw error;
  }
}

export function addNotificationReceivedListener(
  listener: (event: Notifications.Notification) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(listener);
}

export function addNotificationResponseReceivedListener(
  listener: (event: Notifications.NotificationResponse) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  const response = await Notifications.getLastNotificationResponseAsync();

  if (response) {
    await Notifications.clearLastNotificationResponseAsync();
  }

  return response ?? null;
}
