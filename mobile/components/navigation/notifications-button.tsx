import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes } from '@/constants/theme';
import { useNotifications } from '@/context/notifications-context';

export function NotificationsButton() {
  const router = useRouter();
  const { getUnreadCount } = useNotifications();
  const unreadCount = getUnreadCount();

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Benachrichtigungen öffnen, ${unreadCount} ungelesen` : 'Benachrichtigungen öffnen'}
    >
      <IconSymbol size={24} name="bell.fill" color={FeedColors.textPrimary} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerPressed: {
    backgroundColor: ClubColors.surface,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: ClubColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
});
