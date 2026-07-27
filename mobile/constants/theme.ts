/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

import type { FeedPostCategory } from '@/data/feed-posts';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
};

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  round: 999,
};

export const FontSizes = {
  title: 24,
  subtitle: 13,
  body: 14,
  meta: 12,
  badge: 11,
  avatar: 14,
};

export const FeedColors = {
  background: '#050505',
  cardBackground: '#111827',
  cardBorder: '#1F2937',
  imagePlaceholder: '#1F2937',
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  badgeText: '#050505',
};

/**
 * Farben des aktuell ausgewählten Vereins (Arminia Bielefeld: Schwarz-Weiß).
 * Alle Varianten leiten sich aus `primary` ab, damit Buttons, aktive Zustände
 * und Kategorie-Chips konsistent bleiben statt verstreuter Einzelfarben.
 */
export const ClubColors = {
  primary: '#FFFFFF',
  secondary: '#050505',
  surface: 'rgba(255, 255, 255, 0.12)',
  border: 'rgba(255, 255, 255, 0.35)',
  text: '#FFFFFF',
} as const;

export const CategoryLabels: Record<FeedPostCategory, string> = {
  Beitrag: 'Beitrag',
  Fahrt: 'Fahrt',
  Gesuch: 'Gesucht',
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
