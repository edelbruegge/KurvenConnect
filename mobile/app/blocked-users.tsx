import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useBlocks } from '@/context/blocks-context';
import { useProfiles } from '@/context/profile-context';
import { getInitialsFromName, mapSupabaseProfileRow, type SupabaseProfileRow } from '@/lib/map-supabase-profile';
import { supabase } from '@/lib/supabase';

const PROFILE_SELECT_COLUMNS = 'id, display_name, club, location, bio, avatar_url, created_at, updated_at';

type BlockedProfileDisplay = {
  id: string;
  displayName: string;
  initials: string;
  club: string;
  location: string;
  source: 'local' | 'supabase';
  avatarUrl?: string;
};

const UNKNOWN_BLOCKED_PROFILE = { displayName: 'Unbekanntes Mitglied', initials: '?', club: '', location: '', avatarUrl: undefined as string | undefined };

export default function BlockedUsersScreen() {
  const { blockedUsers, unblockUser, unblockRemoteUser, isRemoteBlocksLoading, remoteBlocksError, refreshRemoteBlocks } = useBlocks();
  const { getUserById } = useProfiles();
  const [remoteProfiles, setRemoteProfiles] = useState<
    Record<string, { displayName: string; initials: string; club: string; location: string; avatarUrl?: string }>
  >({});
  const [pendingUnblockUserId, setPendingUnblockUserId] = useState<string | null>(null);
  const [unblockError, setUnblockError] = useState<string | null>(null);

  const unresolvedRemoteIdsKey = blockedUsers
    .filter((entry) => entry.source === 'supabase' && !getUserById(entry.userId))
    .map((entry) => entry.userId)
    .sort()
    .join(',');

  useEffect(() => {
    const ids = unresolvedRemoteIdsKey ? unresolvedRemoteIdsKey.split(',') : [];

    if (ids.length === 0) {
      setRemoteProfiles({});
      return;
    }

    let isCurrent = true;

    supabase
      .from('profiles')
      .select(PROFILE_SELECT_COLUMNS)
      .in('id', ids)
      .then(({ data }) => {
        if (!isCurrent) return;

        const map: Record<string, { displayName: string; initials: string; club: string; location: string; avatarUrl?: string }> = {};
        ((data ?? []) as SupabaseProfileRow[]).forEach((row) => {
          const mapped = mapSupabaseProfileRow(row);
          map[row.id] = {
            displayName: mapped.displayName,
            initials: getInitialsFromName(mapped.displayName),
            club: mapped.club ?? '',
            location: mapped.location ?? '',
            avatarUrl: mapped.avatarUrl ?? undefined,
          };
        });
        setRemoteProfiles(map);
      });

    return () => {
      isCurrent = false;
    };
  }, [unresolvedRemoteIdsKey]);

  const blockedProfiles: BlockedProfileDisplay[] = blockedUsers.map((entry) => {
    const localProfile = getUserById(entry.userId);

    if (localProfile) {
      return {
        id: entry.userId,
        displayName: localProfile.displayName,
        initials: localProfile.initials,
        club: localProfile.club,
        location: localProfile.location,
        source: entry.source ?? 'local',
        avatarUrl: localProfile.avatarUrl,
      };
    }

    const remoteProfile = remoteProfiles[entry.userId] ?? UNKNOWN_BLOCKED_PROFILE;

    return {
      id: entry.userId,
      displayName: remoteProfile.displayName,
      initials: remoteProfile.initials,
      club: remoteProfile.club,
      location: remoteProfile.location,
      source: entry.source ?? 'supabase',
      avatarUrl: remoteProfile.avatarUrl,
    };
  });

  const handleUnblockPress = async (entry: BlockedProfileDisplay) => {
    if (pendingUnblockUserId) {
      return;
    }

    if (entry.source !== 'supabase') {
      unblockUser(entry.id);
      return;
    }

    setPendingUnblockUserId(entry.id);
    setUnblockError(null);
    const { error } = await unblockRemoteUser(entry.id);
    setPendingUnblockUserId(null);

    if (error) {
      setUnblockError(error);
    }
  };

  const errorBanner = remoteBlocksError ? (
    <View style={styles.remoteErrorBanner}>
      <Text style={styles.remoteErrorText}>{remoteBlocksError}</Text>
      <Pressable onPress={refreshRemoteBlocks} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
        <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {blockedProfiles.length === 0 ? (
        <View style={styles.emptyState}>
          {errorBanner}
          <IconSymbol size={40} name="nosign" color={FeedColors.textSecondary} />
          <Text style={styles.emptyTitle}>
            {isRemoteBlocksLoading ? 'Blockierungen werden geladen …' : 'Du hast noch keine Nutzer blockiert.'}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {errorBanner}
          {unblockError ? <Text style={styles.unblockErrorText}>{unblockError}</Text> : null}
          {blockedProfiles.map((profile) => (
            <View key={profile.id} style={styles.row}>
              <Avatar initials={profile.initials} avatarUrl={profile.avatarUrl} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{profile.displayName}</Text>
                <Text style={styles.rowMeta}>
                  {profile.club}
                  {profile.location ? ` · ${profile.location}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => void handleUnblockPress(profile)}
                disabled={pendingUnblockUserId === profile.id}
                style={[styles.unblockButton, pendingUnblockUserId === profile.id && styles.unblockButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel={`${profile.displayName} entsperren`}
              >
                <Text style={styles.unblockButtonText}>{pendingUnblockUserId === profile.id ? 'Wird bearbeitet …' : 'Entsperren'}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  remoteErrorBanner: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Spacing.sm,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  remoteErrorText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.xs,
  },
  remoteErrorRetry: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  unblockErrorText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
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
  rowInfo: {
    flex: 1,
  },
  rowName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  rowMeta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  unblockButton: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  unblockButtonDisabled: {
    opacity: 0.5,
  },
  unblockButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
