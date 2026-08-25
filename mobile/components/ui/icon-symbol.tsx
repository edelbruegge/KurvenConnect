// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Partial<Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  magnifyingglass: 'search',
  'car.fill': 'directions-car',
  'person.fill': 'person',
  plus: 'add',
  heart: 'favorite-border',
  'heart.fill': 'favorite',
  message: 'chat-bubble-outline',
  'xmark.circle.fill': 'cancel',
  'text.magnifyingglass': 'search-off',
  'square.and.pencil': 'edit',
  'shield.fill': 'shield',
  'mappin.and.ellipse': 'place',
  calendar: 'calendar-today',
  'tray.fill': 'inbox',
  'chevron.left': 'chevron-left',
  'person.badge.plus': 'person-add',
  'checkmark.circle.fill': 'check-circle',
  'doc.text.fill': 'article',
  'person.3.fill': 'groups',
  'line.3.horizontal': 'menu',
  'bell.fill': 'notifications-none',
  bookmark: 'bookmark-border',
  'bookmark.fill': 'bookmark',
  'clock.arrow.circlepath': 'history',
  ellipsis: 'more-vert',
  'flag.fill': 'flag',
  nosign: 'block',
  'sportscourt.fill': 'stadium',
  'square.grid.2x2.fill': 'dashboard',
  'person.fill.questionmark': 'person-search',
  photo: 'image',
  'trash.fill': 'delete',
} as const satisfies IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
