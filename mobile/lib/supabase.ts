import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const SUPABASE_NOT_CONFIGURED_MESSAGE = 'Supabase ist noch nicht konfiguriert. Prüfe die Umgebungsvariablen.';

if (!isSupabaseConfigured) {
  // Never log the actual values here — only that they are missing.
  console.error(SUPABASE_NOT_CONFIGURED_MESSAGE);
}

// Expo Router's web build renders an initial pass in Node (no `window`), where
// AsyncStorage's web backend (which relies on window/localStorage) would throw. Route
// storage access through a guard so session recovery only touches AsyncStorage once a
// real browser (or native) runtime is available.
const isBrowserOrNative = Platform.OS !== 'web' || typeof window !== 'undefined';

const supabaseStorage = {
  getItem: (key: string) => (isBrowserOrNative ? AsyncStorage.getItem(key) : Promise.resolve(null)),
  setItem: (key: string, value: string) => (isBrowserOrNative ? AsyncStorage.setItem(key, value) : Promise.resolve()),
  removeItem: (key: string) => (isBrowserOrNative ? AsyncStorage.removeItem(key) : Promise.resolve()),
};

// Module-level singleton: created exactly once, reused by every screen via this import.
// createClient() throws synchronously on an empty URL, which would crash the whole app
// at import time — fall back to harmless placeholder values when unconfigured so the app
// can still boot and show SUPABASE_NOT_CONFIGURED_MESSAGE instead of a bundler crash.
export const supabase = createClient(supabaseUrl || 'https://placeholder.invalid', supabasePublishableKey || 'placeholder-key', {
  auth: {
    storage: supabaseStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Only relevant on web, where a confirmation/OAuth redirect can carry the session in the URL.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
