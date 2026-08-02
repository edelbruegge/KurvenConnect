import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { ReportModal } from '@/components/reports/report-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useGroups } from '@/context/groups-context';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import { useReports } from '@/context/reports-context';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';

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
  } = useGroups();
  const { currentUser, getUserById } = useProfiles();
  const { hasReported } = useReports();
  const { isUserSuspended } = useModeration();
  const { isModeratedAway } = useSafetySelectors();
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const group = params.id ? getGroupById(params.id) : undefined;

  if (!group) {
    return <NotFoundView title="Gruppe nicht gefunden" message="Die angeforderte Gruppe konnte nicht gefunden werden." />;
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

  const handleJoinAction = () => {
    if (group.visibility === 'public') {
      joinGroup(group.id);
    } else {
      requestToJoin(group.id);
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
            <Text style={styles.membersRowText}>{group.memberIds.length} Mitglieder anzeigen</Text>
            <IconSymbol size={16} name="chevron.right" color={FeedColors.textSecondary} />
          </Pressable>

          {!isOwner ? (
            member ? (
              <Pressable
                onPress={() => leaveGroup(group.id)}
                style={[styles.actionButton, styles.actionButtonActive]}
                accessibilityRole="button"
                accessibilityLabel="Gruppe verlassen"
              >
                <Text style={[styles.actionButtonText, styles.actionButtonTextActive]}>Gruppe verlassen</Text>
              </Pressable>
            ) : isPending ? (
              <View style={[styles.actionButton, styles.actionButtonActive]}>
                <Text style={[styles.actionButtonText, styles.actionButtonTextActive]}>Anfrage ausstehend</Text>
              </View>
            ) : (
              <Pressable
                onPress={handleJoinAction}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel={group.visibility === 'public' ? 'Gruppe beitreten' : 'Beitrittsanfrage senden'}
              >
                <Text style={styles.actionButtonText}>{group.visibility === 'public' ? 'Beitreten' : 'Anfrage senden'}</Text>
              </Pressable>
            )
          ) : null}
        </View>

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
