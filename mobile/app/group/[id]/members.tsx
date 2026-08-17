import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { InviteUserCard } from '@/components/groups/invite-user-card';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { ConnectionsList } from '@/components/profile/connections-list';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useGroups } from '@/context/groups-context';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import { isPlausibleRemoteGroupId } from '@/data/groups';
import type { UserProfile } from '@/data/users';
import { getInitialsFromName } from '@/lib/map-supabase-profile';
import { supabase } from '@/lib/supabase';

type PendingAction = { type: 'remove' | 'promote' | 'demote'; userId: string };

type InviteSearchResult = { id: string; display_name: string | null; location: string | null; avatar_url: string | null };

export default function GroupMembersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const {
    getGroupById,
    groupMembers,
    groupMembersError,
    refreshGroupMembers,
    fetchGroupDetail,
    removeGroupMember,
    promoteGroupMember,
    demoteGroupAdmin,
    isGroupActionSubmitting,
    pendingInvitationsByGroup,
    refreshPendingInvitationsForGroup,
    cancelGroupInvitation,
  } = useGroups();
  const { getUserById } = useProfiles();
  const { isUserSuspended } = useModeration();

  const [isCheckingGroupDetail, setIsCheckingGroupDetail] = useState(false);
  const [groupDetailError, setGroupDetailError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // "Mitglieder einladen" — a local, isolated search (never shares state with the main Suchen tab's
  // global search context). Uses search_team_profiles() (search_profiles' own name-match logic +
  // get_fan_discovery's own team filter, see the migration) so results are scoped to the group's
  // own club, not every registered user worldwide.
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<InviteSearchResult[]>([]);
  const [isInviteSearching, setIsInviteSearching] = useState(false);
  const [inviteSearchError, setInviteSearchError] = useState<string | null>(null);
  const [cancelInvitationError, setCancelInvitationError] = useState<string | null>(null);
  const [cancellingInviteeId, setCancellingInviteeId] = useState<string | null>(null);

  const group = params.id ? getGroupById(params.id) : undefined;
  const isRemoteGroup = group?.source === 'supabase';
  const remoteMembers = group ? groupMembers[group.id] : undefined;

  // A subgroup may only invite people who are already members of its parent group (Vorgabe 9) --
  // the RPC enforces this regardless, but proactively loading the parent's member list lets the UI
  // show *why* a found candidate can't be invited instead of a mysterious failure after tapping
  // "Einladen". Loaded on demand only, same "never eagerly for every group" convention as the
  // group's own member list.
  const isSubgroupInvite = isRemoteGroup && group?.groupType === 'subgroup' && Boolean(group.parentGroupId);
  const parentMembers = isSubgroupInvite && group?.parentGroupId ? groupMembers[group.parentGroupId] : undefined;

  useEffect(() => {
    if (group && isRemoteGroup) {
      refreshGroupMembers(group.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, isRemoteGroup]);

  useEffect(() => {
    if (isSubgroupInvite && group?.parentGroupId) {
      refreshGroupMembers(group.parentGroupId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubgroupInvite, group?.parentGroupId]);

  const trimmedInviteQuery = inviteQuery.trim();
  const MIN_INVITE_QUERY_LENGTH = 2;

  const runInviteSearch = (query: string) => {
    if (!group?.clubId) {
      setInviteSearchError('Die Vereinszugehörigkeit dieser Gruppe konnte nicht ermittelt werden.');
      setInviteResults([]);
      return;
    }

    setIsInviteSearching(true);
    setInviteSearchError(null);

    supabase
      .rpc('search_team_profiles', { p_team_id: group.clubId, p_query: query, p_limit: 10 })
      .then(({ data, error }) => {
        setIsInviteSearching(false);

        if (error) {
          setInviteSearchError('Die Suche konnte nicht durchgeführt werden.');
          setInviteResults([]);
          return;
        }

        setInviteResults((data ?? []) as InviteSearchResult[]);
      });
  };

  useEffect(() => {
    if (trimmedInviteQuery.length < MIN_INVITE_QUERY_LENGTH) {
      setInviteResults([]);
      setInviteSearchError(null);
      return;
    }

    const timeout = setTimeout(() => runInviteSearch(trimmedInviteQuery), 300);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedInviteQuery]);

  // Same "not found" vs. "not a member" distinction as app/group/[id].tsx — a removed member
  // navigating (or already sitting) here must see a specific "kein Mitglied" message, not a
  // generic not-found one. Never runs for a local seed id.
  useEffect(() => {
    if (group || !params.id || !isPlausibleRemoteGroupId(params.id)) {
      return;
    }

    let isCurrent = true;
    setIsCheckingGroupDetail(true);
    setGroupDetailError(null);

    fetchGroupDetail(params.id).then(({ error }) => {
      if (!isCurrent) return;

      setIsCheckingGroupDetail(false);

      if (error) {
        setGroupDetailError(error);
      }
    });

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, group?.id]);

  // Computed unconditionally at top level (not inside the isRemoteGroup branch below) so the
  // pending-invitations load effect right after it can depend on it per the Rules of Hooks.
  const viewerCanInvite = isRemoteGroup && authUserId !== null && (group?.ownerId === authUserId || group?.myRole === 'admin');
  const pendingInvitations = group ? (pendingInvitationsByGroup[group.id] ?? []) : [];

  useEffect(() => {
    if (group && viewerCanInvite) {
      refreshPendingInvitationsForGroup(group.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, viewerCanInvite]);

  const handleCancelInvitation = async (inviteeId: string) => {
    if (!group || cancellingInviteeId) {
      return;
    }

    setCancellingInviteeId(inviteeId);
    setCancelInvitationError(null);
    const { error } = await cancelGroupInvitation(group.id, inviteeId);
    setCancellingInviteeId(null);

    if (error) {
      setCancelInvitationError(error);
    }
  };

  if (!group) {
    if (isCheckingGroupDetail) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={FeedColors.textPrimary} />
        </View>
      );
    }

    const isMembershipError = groupDetailError === 'Du bist kein Mitglied dieser Gruppe.';

    return (
      <NotFoundView
        title={isMembershipError ? 'Kein Zugriff' : 'Gruppe nicht gefunden'}
        message={groupDetailError ?? 'Die angeforderte Gruppe konnte nicht gefunden werden.'}
      />
    );
  }

  if (isRemoteGroup) {
    if (remoteMembers === undefined) {
      if (groupMembersError) {
        return <NotFoundView title="Mitglieder nicht verfügbar" message={groupMembersError} />;
      }

      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={FeedColors.textPrimary} />
        </View>
      );
    }

    const viewerIsOwner = authUserId !== null && group.ownerId === authUserId;
    const viewerIsAdmin = group.myRole === 'admin';

    const handleRequestAction = (type: PendingAction['type'], userId: string) => {
      setActionError(null);
      setPendingAction({ type, userId });
    };

    const handleCancelAction = () => {
      setPendingAction(null);
    };

    const handleConfirmAction = async () => {
      if (!pendingAction || isGroupActionSubmitting) {
        return;
      }

      const { type, userId } = pendingAction;
      setActionError(null);

      const { error } =
        type === 'remove'
          ? await removeGroupMember(group.id, userId)
          : type === 'promote'
            ? await promoteGroupMember(group.id, userId)
            : await demoteGroupAdmin(group.id, userId);

      if (error) {
        setActionError(error);
        return;
      }

      setPendingAction(null);
    };

    const confirmText: Record<PendingAction['type'], string> = {
      remove: 'Möchtest du dieses Mitglied wirklich aus der Gruppe entfernen?',
      promote: 'Möchtest du diesem Mitglied Adminrechte geben?',
      demote: 'Möchtest du diesem Nutzer die Adminrechte entziehen?',
    };

    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {viewerCanInvite ? (
            <View style={styles.inviteCard}>
              <Text style={styles.inviteCardTitle}>Mitglieder einladen</Text>
              {isSubgroupInvite ? (
                <Text style={styles.inviteSubgroupHint}>Nur Mitglieder der Hauptgruppe können in diese Untergruppe eingeladen werden.</Text>
              ) : null}
              <View style={styles.inviteSearchBar}>
                <TextInput
                  value={inviteQuery}
                  onChangeText={setInviteQuery}
                  placeholder="Nach Namen suchen …"
                  placeholderTextColor={FeedColors.textSecondary}
                  style={styles.inviteSearchInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>

              {isInviteSearching ? (
                <View style={styles.inviteLoadingRow}>
                  <ActivityIndicator size="small" color={FeedColors.textSecondary} />
                </View>
              ) : inviteSearchError ? (
                <View>
                  <Text style={styles.confirmError}>{inviteSearchError}</Text>
                  <Pressable
                    onPress={() => runInviteSearch(trimmedInviteQuery)}
                    accessibilityRole="button"
                    accessibilityLabel="Suche erneut versuchen"
                  >
                    <Text style={styles.inviteRetryText}>Erneut versuchen</Text>
                  </Pressable>
                </View>
              ) : trimmedInviteQuery.length >= MIN_INVITE_QUERY_LENGTH ? (
                (() => {
                  const memberIds = new Set((remoteMembers ?? []).map((entry) => entry.userId));
                  const pendingInviteeIds = new Set(pendingInvitations.map((entry) => entry.inviteeId));
                  // Eligibility is filtered *after* the real global search, never by pre-narrowing
                  // the search itself (Vorgabe 8) -- self and existing members are excluded outright
                  // (an invite there would never make sense), a subgroup's non-parent-members stay
                  // in the list but get a disabledReason on their card instead (Vorgabe 9).
                  const candidates = inviteResults.filter((result) => result.id !== authUserId && !memberIds.has(result.id));
                  const parentMemberIds = parentMembers ? new Set(parentMembers.map((entry) => entry.userId)) : null;

                  return candidates.length === 0 ? (
                    <Text style={styles.inviteEmptyText}>Keine passenden Nutzer gefunden.</Text>
                  ) : (
                    candidates.map((result) => (
                      <InviteUserCard
                        key={result.id}
                        groupId={group.id}
                        user={{
                          id: result.id,
                          displayName: result.display_name?.trim() || 'Neues Mitglied',
                          avatarUrl: result.avatar_url ?? undefined,
                          location: result.location ?? undefined,
                        }}
                        alreadyInvited={pendingInviteeIds.has(result.id)}
                        disabledReason={parentMemberIds && !parentMemberIds.has(result.id) ? 'Noch kein Mitglied der Hauptgruppe' : undefined}
                      />
                    ))
                  );
                })()
              ) : null}

              {pendingInvitations.length > 0 ? (
                <>
                  <Text style={styles.pendingInvitationsTitle}>Ausstehende Einladungen</Text>
                  {cancelInvitationError ? <Text style={styles.confirmError}>{cancelInvitationError}</Text> : null}
                  {pendingInvitations.map((invitation) => (
                    <View key={invitation.inviteeId} style={styles.pendingInvitationRow}>
                      <Avatar initials={getInitialsFromName(invitation.displayName)} avatarUrl={invitation.avatarUrl} />
                      <Text style={styles.pendingInvitationName} numberOfLines={1}>
                        {invitation.displayName}
                      </Text>
                      <Pressable
                        onPress={() => void handleCancelInvitation(invitation.inviteeId)}
                        disabled={cancellingInviteeId === invitation.inviteeId}
                        accessibilityRole="button"
                        accessibilityLabel={`Einladung an ${invitation.displayName} zurückziehen`}
                      >
                        <Text style={styles.pendingInvitationCancelText}>
                          {cancellingInviteeId === invitation.inviteeId ? 'Wird zurückgezogen …' : 'Zurückziehen'}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          ) : null}

          {remoteMembers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Diese Gruppe hat noch keine Mitglieder.</Text>
            </View>
          ) : (
            <>
              {remoteMembers.map((member) => {
              const isMemberOwner = member.userId === group.ownerId;
              const isOwnRow = member.userId === authUserId;

              const menuActions = isOwnRow || isMemberOwner
                ? []
                : viewerIsOwner
                  ? member.role === 'admin'
                    ? [
                        { key: 'demote', label: 'Adminrechte entziehen', icon: 'nosign' as const, onPress: () => handleRequestAction('demote', member.userId) },
                        { key: 'remove', label: 'Aus Gruppe entfernen', icon: 'nosign' as const, destructive: true, onPress: () => handleRequestAction('remove', member.userId) },
                      ]
                    : [
                        { key: 'promote', label: 'Zum Admin machen', icon: 'shield.fill' as const, onPress: () => handleRequestAction('promote', member.userId) },
                        { key: 'remove', label: 'Aus Gruppe entfernen', icon: 'nosign' as const, destructive: true, onPress: () => handleRequestAction('remove', member.userId) },
                      ]
                  : viewerIsAdmin && member.role === 'member'
                    ? [{ key: 'remove', label: 'Aus Gruppe entfernen', icon: 'nosign' as const, destructive: true, onPress: () => handleRequestAction('remove', member.userId) }]
                    : [];

              return (
                <View key={member.userId}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/profile/[id]', params: { id: member.userId } })}
                    style={styles.row}
                    accessibilityLabel={`Profil von ${member.displayName} öffnen`}
                  >
                    <Avatar initials={getInitialsFromName(member.displayName)} avatarUrl={member.avatarUrl} />
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.displayName}</Text>
                      <Text style={styles.memberMeta}>Mitglied seit {member.joinedAt}</Text>
                    </View>
                    <View style={[styles.roleBadge, (isMemberOwner || member.role === 'admin') && styles.roleBadgeAdmin]}>
                      <Text style={[styles.roleBadgeText, (isMemberOwner || member.role === 'admin') && styles.roleBadgeTextAdmin]}>
                        {isMemberOwner ? 'Gruppeninhaber' : member.role === 'admin' ? 'Admin' : 'Mitglied'}
                      </Text>
                    </View>
                    {menuActions.length > 0 ? (
                      <OverflowMenu accessibilityLabel={`Weitere Aktionen zu ${member.displayName}`} actions={menuActions} />
                    ) : null}
                  </Pressable>

                  {pendingAction?.userId === member.userId ? (
                    <View style={styles.confirmBlock}>
                      {actionError ? <Text style={styles.confirmError}>{actionError}</Text> : null}
                      <Text style={styles.confirmText}>{confirmText[pendingAction.type]}</Text>
                      <View style={styles.confirmActions}>
                        <Pressable
                          onPress={() => void handleConfirmAction()}
                          disabled={isGroupActionSubmitting}
                          style={[styles.confirmButton, isGroupActionSubmitting && styles.actionButtonDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel="Bestätigen"
                        >
                          <Text style={styles.confirmButtonText}>{isGroupActionSubmitting ? 'Wird gespeichert …' : 'Bestätigen'}</Text>
                        </Pressable>
                        <Pressable
                          onPress={handleCancelAction}
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
                </View>
              );
              })}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const members = group.memberIds
    .map((memberId) => getUserById(memberId))
    .filter((profile): profile is UserProfile => profile !== undefined)
    .filter((profile) => !isUserSuspended(profile.id));

  return <ConnectionsList users={members} emptyMessage="Diese Gruppe hat noch keine Mitglieder." />;
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
  inviteCard: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  inviteCardTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  inviteSearchBar: {
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    marginBottom: Spacing.sm,
  },
  inviteSearchInput: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  inviteLoadingRow: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  inviteEmptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  inviteSubgroupHint: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
  },
  inviteRetryText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
  pendingInvitationsTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  pendingInvitationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  pendingInvitationName: {
    flex: 1,
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  pendingInvitationCancelText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    fontWeight: '600',
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
  },
  memberInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
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
  roleBadge: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  roleBadgeAdmin: {
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  roleBadgeText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  roleBadgeTextAdmin: {
    color: ClubColors.text,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmBlock: {
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
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
