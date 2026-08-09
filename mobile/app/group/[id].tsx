import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { ReportModal } from '@/components/reports/report-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import { useReports } from '@/context/reports-context';
import { getGroupMemberCount, isPlausibleRemoteGroupId } from '@/data/groups';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';
import { supabase } from '@/lib/supabase';

export default function GroupDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const {
    getGroupById,
    isMember,
    joinGroup,
    leaveGroup,
    requestToJoin,
    getJoinRequestStatus,
    getPendingRequestsForGroup,
    acceptJoinRequest,
    rejectJoinRequest,
    incomingJoinRequests,
    refreshIncomingRequestsForGroup,
    isGroupActionSubmitting,
    fetchGroupDetail,
  } = useGroups();
  const { currentUser, getUserById } = useProfiles();
  const { hasReported } = useReports();
  const { isUserSuspended } = useModeration();
  const { isModeratedAway } = useSafetySelectors();
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [requestActionError, setRequestActionError] = useState<string | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [remoteMemberNames, setRemoteMemberNames] = useState<Record<string, string>>({});
  const [isCheckingGroupDetail, setIsCheckingGroupDetail] = useState(false);
  const [groupDetailError, setGroupDetailError] = useState<string | null>(null);

  const group = params.id ? getGroupById(params.id) : undefined;
  const isRemoteAdmin = group?.source === 'supabase' && group.myRole === 'admin';

  // A remote group not already resolvable locally (i.e. not among the ones the account is a
  // member of, per get_my_groups()) gets one targeted get_group_detail() lookup — this is what
  // distinguishes "this group doesn't exist" from "you are not a member of it" precisely, without
  // granting a general existence-check for arbitrary ids. Never runs for a local seed id.
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

  useEffect(() => {
    if (isRemoteAdmin && group) {
      refreshIncomingRequestsForGroup(group.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemoteAdmin, group?.id]);

  const remoteIncoming = group && isRemoteAdmin ? (incomingJoinRequests[group.id] ?? []) : [];

  const unresolvedRequesterIdsKey = remoteIncoming.map((request) => request.requesterId).filter((id) => !remoteMemberNames[id]).sort().join(',');

  useEffect(() => {
    const ids = unresolvedRequesterIdsKey ? unresolvedRequesterIdsKey.split(',') : [];

    if (ids.length === 0) {
      return;
    }

    let isCurrent = true;

    supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids)
      .then(({ data }) => {
        if (!isCurrent) return;

        const map: Record<string, string> = {};
        ((data ?? []) as { id: string; display_name: string | null }[]).forEach((row) => {
          map[row.id] = row.display_name?.trim() || 'Neues Mitglied';
        });
        setRemoteMemberNames((current) => ({ ...current, ...map }));
      });

    return () => {
      isCurrent = false;
    };
  }, [unresolvedRequesterIdsKey]);

  if (!group) {
    if (isCheckingGroupDetail) {
      return (
        <SafeAreaView style={styles.loadingSafeArea}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={FeedColors.textPrimary} />
          </View>
        </SafeAreaView>
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

  if (isModeratedAway('group', group.id, group.ownerId)) {
    return <NotFoundView title="Inhalt nicht verfügbar" message="Dieser Inhalt wurde moderativ ausgeblendet." />;
  }

  const isOwner = group.ownerId === currentUser.id;
  const member = isMember(group.id);
  const requestStatus = getJoinRequestStatus(group.id);
  const isPending = requestStatus === 'pending';
  const pendingRequests = (isOwner ? getPendingRequestsForGroup(group.id) : []).filter(
    (request) => !isUserSuspended(request.userId),
  );

  const handleOpenMembers = () => {
    router.push({ pathname: '/group/[id]/members', params: { id: group.id } });
  };

  const handleOpenChat = () => {
    router.push({ pathname: '/group/[id]/chat', params: { id: group.id } });
  };

  const handleJoinAction = () => {
    if (group.visibility === 'public') {
      joinGroup(group.id);
    } else {
      requestToJoin(group.id);
    }
  };

  const handleLeaveGroup = async () => {
    if (isLeaving) {
      return;
    }

    setIsLeaving(true);
    setLeaveError(null);
    const { error } = await leaveGroup(group.id);
    setIsLeaving(false);

    if (error) {
      setLeaveError(error);
      return;
    }

    router.back();
  };

  const handleManageRemoteRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (processingRequestId) {
      return;
    }

    setProcessingRequestId(requestId);
    setRequestActionError(null);
    const { error } = action === 'accept' ? await acceptJoinRequest(requestId) : await rejectJoinRequest(requestId);
    setProcessingRequestId(null);

    if (error) {
      setRequestActionError(error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{group.name}</Text>
            {isOwner ? (
              <View style={styles.ownerBadge}>
                <Text style={styles.ownerBadgeText}>Inhaber</Text>
              </View>
            ) : (
              <View style={styles.visibilityBadge}>
                <Text style={styles.visibilityBadgeText}>{group.visibility === 'public' ? 'Öffentlich' : 'Privat'}</Text>
              </View>
            )}
            {!isOwner ? (
              <OverflowMenu
                accessibilityLabel="Weitere Aktionen zu dieser Gruppe"
                actions={[
                  {
                    key: 'report-group',
                    label: hasReported('group', group.id) ? 'Bereits gemeldet' : 'Gruppe melden',
                    icon: 'flag.fill',
                    disabled: hasReported('group', group.id),
                    onPress: () => setReportModalVisible(true),
                  },
                ]}
              />
            ) : null}
          </View>
          <Text style={styles.meta}>
            {group.clubName}
            {group.city ? ` · ${group.city}` : ''}
          </Text>
          <Text style={styles.description}>{group.description}</Text>

          <Pressable onPress={handleOpenMembers} style={styles.membersRow} accessibilityRole="button" accessibilityLabel="Mitglieder anzeigen">
            <IconSymbol size={16} name="person.3.fill" color={FeedColors.textSecondary} />
            <Text style={styles.membersRowText}>{getGroupMemberCount(group)} Mitglieder anzeigen</Text>
            <IconSymbol size={16} name="chevron.right" color={FeedColors.textSecondary} />
          </Pressable>

          {member ? (
            <Pressable onPress={handleOpenChat} style={styles.chatButton} accessibilityRole="button" accessibilityLabel="Gruppenchat öffnen">
              <IconSymbol size={18} name="message" color={ClubColors.secondary} />
              <Text style={styles.chatButtonText}>Chat öffnen</Text>
            </Pressable>
          ) : null}

          {leaveError ? <Text style={styles.errorText}>{leaveError}</Text> : null}

          {!isOwner ? (
            member ? (
              <Pressable
                onPress={() => void handleLeaveGroup()}
                disabled={isLeaving}
                style={[styles.actionButton, styles.actionButtonActive, isLeaving && styles.actionButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Gruppe verlassen"
              >
                <Text style={[styles.actionButtonText, styles.actionButtonTextActive]}>
                  {isLeaving ? 'Wird verlassen …' : 'Gruppe verlassen'}
                </Text>
              </Pressable>
            ) : group.source === 'local' && isPending ? (
              <View style={[styles.actionButton, styles.actionButtonActive]}>
                <Text style={[styles.actionButtonText, styles.actionButtonTextActive]}>Anfrage ausstehend</Text>
              </View>
            ) : group.source === 'local' ? (
              <Pressable
                onPress={handleJoinAction}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel={group.visibility === 'public' ? 'Gruppe beitreten' : 'Beitrittsanfrage senden'}
              >
                <Text style={styles.actionButtonText}>{group.visibility === 'public' ? 'Beitreten' : 'Anfrage senden'}</Text>
              </Pressable>
            ) : null
          ) : null}
        </View>

        {group.source === 'supabase' && isRemoteAdmin ? (
          <View style={styles.requestsCard}>
            <Text style={styles.requestsTitle}>Beitrittsanfragen</Text>
            {requestActionError ? <Text style={styles.errorText}>{requestActionError}</Text> : null}
            {remoteIncoming.length === 0 ? (
              <Text style={styles.meta}>Aktuell keine offenen Anfragen.</Text>
            ) : (
              remoteIncoming.map((request) => (
                <View key={request.id} style={styles.requestRow}>
                  <Avatar initials={(remoteMemberNames[request.requesterId] ?? '?').slice(0, 1)} />
                  <Text style={styles.requestName}>{remoteMemberNames[request.requesterId] ?? 'Unbekanntes Mitglied'}</Text>
                  <View style={styles.requestActions}>
                    <Pressable
                      onPress={() => void handleManageRemoteRequest(request.id, 'accept')}
                      disabled={isGroupActionSubmitting && processingRequestId === request.id}
                      style={styles.acceptButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Anfrage von ${remoteMemberNames[request.requesterId] ?? 'Nutzer'} annehmen`}
                    >
                      <Text style={styles.acceptButtonText}>Annehmen</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleManageRemoteRequest(request.id, 'reject')}
                      disabled={isGroupActionSubmitting && processingRequestId === request.id}
                      style={styles.rejectButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Anfrage von ${remoteMemberNames[request.requesterId] ?? 'Nutzer'} ablehnen`}
                    >
                      <Text style={styles.rejectButtonText}>Ablehnen</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {isOwner && pendingRequests.length > 0 ? (
          <View style={styles.requestsCard}>
            <Text style={styles.requestsTitle}>Beitrittsanfragen</Text>
            {pendingRequests.map((request) => {
              const requester = getUserById(request.userId);

              return (
                <View key={request.id} style={styles.requestRow}>
                  <Avatar initials={requester?.initials ?? '?'} />
                  <Text style={styles.requestName}>{requester?.displayName ?? 'Unbekannter Nutzer'}</Text>
                  <View style={styles.requestActions}>
                    <Pressable
                      onPress={() => acceptJoinRequest(request.id)}
                      style={styles.acceptButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Anfrage von ${requester?.displayName ?? 'Nutzer'} annehmen`}
                    >
                      <Text style={styles.acceptButtonText}>Annehmen</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => rejectJoinRequest(request.id)}
                      style={styles.rejectButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Anfrage von ${requester?.displayName ?? 'Nutzer'} ablehnen`}
                    >
                      <Text style={styles.rejectButtonText}>Ablehnen</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        title="Gruppe melden"
        targetType="group"
        targetId={group.id}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingSafeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  card: {
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    color: FeedColors.textPrimary,
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  ownerBadge: {
    backgroundColor: ClubColors.surface,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  ownerBadgeText: {
    color: ClubColors.text,
    fontSize: FontSizes.badge,
    fontWeight: '700',
  },
  visibilityBadge: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  visibilityBadgeText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    fontWeight: '600',
  },
  meta: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.subtitle,
    marginTop: 4,
  },
  description: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 22,
    marginTop: Spacing.md,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  membersRowText: {
    flex: 1,
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  chatButton: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingVertical: Spacing.sm,
  },
  chatButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  actionButton: {
    marginTop: Spacing.md,
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  actionButtonActive: {
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
  },
  actionButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  actionButtonTextActive: {
    color: ClubColors.text,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginTop: Spacing.sm,
  },
  requestsCard: {
    marginTop: Spacing.md,
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    padding: Spacing.md,
  },
  requestsTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  requestName: {
    flex: 1,
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  acceptButton: {
    backgroundColor: ClubColors.primary,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  acceptButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  rejectButton: {
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  rejectButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
});
