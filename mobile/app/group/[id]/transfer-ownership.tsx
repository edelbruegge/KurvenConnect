import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useGroups } from '@/context/groups-context';
import { getInitialsFromName } from '@/lib/map-supabase-profile';

export default function TransferGroupOwnershipScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { getGroupById, groupMembers, refreshGroupMembers, transferGroupOwnership, isGroupActionSubmitting } = useGroups();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const group = params.id ? getGroupById(params.id) : undefined;
  const isRemoteGroup = group?.source === 'supabase';
  const isOwner = isRemoteGroup && authUserId !== null && group.ownerId === authUserId;
  const remoteMembers = group ? groupMembers[group.id] : undefined;

  useEffect(() => {
    if (group && isRemoteGroup && isOwner) {
      refreshGroupMembers(group.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, isRemoteGroup, isOwner]);

  if (!group) {
    return <NotFoundView title="Gruppe nicht gefunden" message="Die angeforderte Gruppe konnte nicht gefunden werden." />;
  }

  if (!isOwner) {
    return <NotFoundView title="Kein Zugriff" message="Nur der Gruppeninhaber kann die Gruppeninhaberschaft übertragen." />;
  }

  if (remoteMembers === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={FeedColors.textPrimary} />
      </View>
    );
  }

  const eligibleMembers = remoteMembers.filter((member) => member.userId !== authUserId);

  const handleConfirm = async () => {
    if (!selectedUserId || isGroupActionSubmitting) {
      return;
    }

    setActionError(null);
    const { error } = await transferGroupOwnership(group.id, selectedUserId);

    if (error) {
      setActionError(error);
      return;
    }

    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Gruppeninhaberschaft übertragen</Text>
        <Text style={styles.subtitle}>Wähle ein Mitglied, das die Gruppe künftig als Inhaber verwaltet.</Text>

        {eligibleMembers.length === 0 ? (
          <Text style={styles.emptyText}>Diese Gruppe hat außer dir noch keine weiteren Mitglieder.</Text>
        ) : (
          eligibleMembers.map((member) => (
            <Pressable
              key={member.userId}
              onPress={() => {
                setActionError(null);
                setSelectedUserId(member.userId);
              }}
              style={[styles.row, selectedUserId === member.userId && styles.rowSelected]}
              accessibilityRole="button"
              accessibilityLabel={`${member.displayName} als neuen Gruppeninhaber auswählen`}
            >
              <Avatar initials={getInitialsFromName(member.displayName)} />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.displayName}</Text>
                <Text style={styles.memberMeta}>{member.role === 'admin' ? 'Admin' : 'Mitglied'}</Text>
              </View>
            </Pressable>
          ))
        )}

        {selectedUserId ? (
          <View style={styles.confirmBlock}>
            {actionError ? <Text style={styles.confirmError}>{actionError}</Text> : null}
            <Text style={styles.confirmText}>Möchtest du die Gruppeninhaberschaft wirklich übertragen?</Text>
            <Text style={styles.confirmHint}>
              Du bleibst anschließend Admin der Gruppe, bist aber nicht mehr Gruppeninhaber.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => void handleConfirm()}
                disabled={isGroupActionSubmitting}
                style={[styles.confirmButton, isGroupActionSubmitting && styles.actionButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Bestätigen"
              >
                <Text style={styles.confirmButtonText}>{isGroupActionSubmitting ? 'Wird übertragen …' : 'Bestätigen'}</Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedUserId(null)}
                disabled={isGroupActionSubmitting}
                style={[styles.cancelButton, isGroupActionSubmitting && styles.actionButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Abbrechen"
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FeedColors.background,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  title: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.subtitle,
    marginBottom: Spacing.md,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  rowSelected: {
    borderColor: ClubColors.border,
    backgroundColor: ClubColors.surface,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  memberMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  confirmBlock: {
    marginTop: Spacing.md,
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  confirmText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  confirmHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
  },
  confirmError: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  confirmButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.round,
    backgroundColor: ClubColors.primary,
  },
  confirmButtonText: {
    color: ClubColors.secondary,
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
    borderColor: FeedColors.cardBorder,
  },
  cancelButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
});
