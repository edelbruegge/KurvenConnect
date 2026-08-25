import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { usePushNotifications } from '@/context/push-notifications-context';

export function AccountSection() {
  const { user, signOut, deleteOwnAccount } = useAuth();
  const { deactivatePushTokenBeforeSignOut } = usePushNotifications();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [confirmingDeleteAccount, setConfirmingDeleteAccount] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const handleConfirmSignOut = async () => {
    setConfirmingSignOut(false);
    // Must run before signOut(): deactivate_push_token relies on auth.uid() still resolving to
    // this account server-side.
    await deactivatePushTokenBeforeSignOut();
    await signOut();
  };

  const handleConfirmDeleteAccount = async () => {
    if (isDeletingAccount) {
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    // Same ordering requirement as sign-out above: must run while auth.uid() still resolves.
    await deactivatePushTokenBeforeSignOut();
    const { error } = await deleteOwnAccount();
    setIsDeletingAccount(false);

    if (error) {
      // deleteOwnAccount() already calls signOut() regardless of outcome (see auth-context.tsx),
      // so on a genuine failure the user is logged out anyway -- surfacing this would show on a
      // screen they're about to leave. Kept for the rare case the screen re-renders before the
      // auth-state redirect kicks in.
      setDeleteAccountError(error);
      return;
    }

    setConfirmingDeleteAccount(false);
  };

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <IconSymbol size={18} name="person.fill" color={FeedColors.textPrimary} />
        <Text style={styles.sectionTitle}>Konto</Text>
      </View>
      <Text style={styles.email}>{user.email}</Text>

      {confirmingSignOut ? (
        <View style={styles.confirmBlock}>
          <Text style={styles.confirmText}>Möchtest du dich wirklich abmelden?</Text>
          <View style={styles.confirmActions}>
            <Pressable
              onPress={() => void handleConfirmSignOut()}
              style={styles.destructiveButton}
              accessibilityRole="button"
              accessibilityLabel="Abmelden bestätigen"
            >
              <Text style={styles.destructiveButtonText}>Abmelden bestätigen</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmingSignOut(false)}
              style={styles.cancelButton}
              accessibilityRole="button"
              accessibilityLabel="Abbrechen"
            >
              <Text style={styles.cancelButtonText}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setConfirmingSignOut(true)}
          style={styles.signOutButton}
          accessibilityRole="button"
          accessibilityLabel="Abmelden"
        >
          <IconSymbol size={16} name="xmark.circle.fill" color={StatusColors.error} />
          <Text style={styles.signOutButtonText}>Abmelden</Text>
        </Pressable>
      )}

      {deleteAccountError ? <Text style={styles.deleteErrorText}>{deleteAccountError}</Text> : null}

      {confirmingDeleteAccount ? (
        <View style={[styles.confirmBlock, styles.deleteConfirmBlock]}>
          <Text style={styles.confirmText}>
            Möchtest du dein Konto wirklich unwiderruflich löschen? Deine Beiträge, Fahrten,
            Treffpunkte, Gesuche, Nachrichten und Gruppenmitgliedschaften werden dauerhaft entfernt.
          </Text>
          <View style={styles.confirmActions}>
            <Pressable
              onPress={() => void handleConfirmDeleteAccount()}
              disabled={isDeletingAccount}
              style={[styles.destructiveButton, isDeletingAccount && styles.destructiveButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Konto endgültig löschen"
            >
              <Text style={styles.destructiveButtonText}>{isDeletingAccount ? 'Wird gelöscht …' : 'Endgültig löschen'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmingDeleteAccount(false)}
              disabled={isDeletingAccount}
              style={styles.cancelButton}
              accessibilityRole="button"
              accessibilityLabel="Abbrechen"
            >
              <Text style={styles.cancelButtonText}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setConfirmingDeleteAccount(true)}
          style={[styles.signOutButton, styles.deleteAccountButton]}
          accessibilityRole="button"
          accessibilityLabel="Konto löschen"
        >
          <IconSymbol size={16} name="trash.fill" color={StatusColors.error} />
          <Text style={styles.signOutButtonText}>Konto löschen</Text>
        </Pressable>
      )}
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
  email: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.md,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 44,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  signOutButtonText: {
    color: StatusColors.error,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  deleteAccountButton: {
    marginTop: Spacing.sm,
  },
  deleteConfirmBlock: {
    marginTop: Spacing.sm,
  },
  deleteErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginTop: Spacing.sm,
  },
  confirmBlock: {
    gap: Spacing.sm,
  },
  confirmText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  destructiveButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  destructiveButtonDisabled: {
    opacity: 0.5,
  },
  destructiveButtonText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  cancelButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
