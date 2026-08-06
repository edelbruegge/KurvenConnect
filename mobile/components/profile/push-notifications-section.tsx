import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { usePushNotifications } from '@/context/push-notifications-context';

export function PushNotificationsSection() {
  const { pushStatus, pushError, isPushSupported, requestAndRegisterPush, disablePush, retryPushRegistration } = usePushNotifications();

  if (!isPushSupported) {
    return (
      <View style={styles.section}>
        <View style={styles.titleRow}>
          <IconSymbol size={18} name="bell.fill" color={FeedColors.textPrimary} />
          <Text style={styles.sectionTitle}>Push-Benachrichtigungen</Text>
        </View>
        <Text style={styles.description}>
          Auf diesem Gerät oder in dieser Umgebung sind Push-Benachrichtigungen aktuell nicht verfügbar.
        </Text>
      </View>
    );
  }

  let statusText: string | null = null;
  let actionLabel: string | null = null;
  let onAction: (() => void) | null = null;

  if (pushStatus === 'not_determined') {
    actionLabel = 'Push-Benachrichtigungen aktivieren';
    onAction = () => void requestAndRegisterPush();
  } else if (pushStatus === 'denied') {
    statusText = 'In den Geräteeinstellungen erlauben.';
  } else if (pushStatus === 'registering') {
    statusText = 'Wird eingerichtet …';
  } else if (pushStatus === 'registered') {
    statusText = 'Aktiviert für dieses Gerät.';
    actionLabel = 'Deaktivieren';
    onAction = () => void disablePush();
  } else if (pushStatus === 'error') {
    statusText = pushError ?? 'Etwas ist schiefgelaufen.';
    actionLabel = 'Erneut versuchen';
    onAction = () => void retryPushRegistration();
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <IconSymbol size={18} name="bell.fill" color={FeedColors.textPrimary} />
        <Text style={styles.sectionTitle}>Push-Benachrichtigungen</Text>
      </View>
      <Text style={styles.description}>Erhalte wichtige Hinweise auch, wenn Kurvenconnect geschlossen ist.</Text>
      {statusText ? <Text style={[styles.statusText, pushStatus === 'error' && styles.statusTextError]}>{statusText}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.actionButton} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  description: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  statusText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: Spacing.xs,
  },
  statusTextError: {
    color: StatusColors.error,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: Spacing.sm,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
    backgroundColor: FeedColors.cardBackground,
  },
  actionButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
