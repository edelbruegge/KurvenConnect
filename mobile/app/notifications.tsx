import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed/avatar';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useFeedPosts } from '@/context/feed-posts-context';
import { useGroups } from '@/context/groups-context';
import { useMessages } from '@/context/messages-context';
import { useModeration } from '@/context/moderation-context';
import { useNotifications } from '@/context/notifications-context';
import { useProfiles } from '@/context/profile-context';
import { useReports } from '@/context/reports-context';
import { getReportTargetTypeForPost } from '@/data/feed-posts';
import { getOtherParticipantId } from '@/data/messages';
import type { AppNotification, NotificationType } from '@/data/notifications';
import { CURRENT_USER_ID } from '@/data/users';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';
import { getNotificationDisplayContent } from '@/lib/map-supabase-notification';
import { resolveNotificationRoute } from '@/lib/notification-navigation';

const TRIP_REQUEST_NOTIFICATION_TYPES: NotificationType[] = ['trip_request_received', 'trip_request_accepted', 'trip_request_rejected'];

function getNotificationIcon(type: NotificationType): IconSymbolName {
  switch (type) {
    case 'post_like':
      return 'heart.fill';
    case 'post_comment':
      return 'message';
    case 'new_follower':
    case 'user_follow':
      return 'person.badge.plus';
    case 'trip_request':
    case 'trip_request_received':
      return 'car.fill';
    case 'trip_request_accepted':
      return 'checkmark.circle.fill';
    case 'trip_request_rejected':
      return 'xmark.circle.fill';
    case 'meetup_join':
    case 'meetup_leave':
    case 'meetup_joined':
    case 'meetup_left':
      return 'person.3.fill';
    case 'request_reply':
      return 'text.magnifyingglass';
    case 'new_message':
    case 'message_received':
    case 'group_message':
      return 'message';
    case 'group_join_request':
    case 'group_invitation':
      return 'person.badge.plus';
    case 'group_join_accepted':
      return 'checkmark.circle.fill';
    case 'group_join_rejected':
      return 'xmark.circle.fill';
    case 'group_admin_promoted':
    case 'group_admin_demoted':
    case 'group_ownership_transferred':
      return 'shield.fill';
    case 'group_member_removed':
      return 'nosign';
    case 'game_new_post':
    case 'game_new_trip':
    case 'game_new_meetup':
      return 'sportscourt.fill';
    case 'system':
      return 'bell.fill';
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    isRemoteNotificationsLoading,
    remoteNotificationsError,
    refreshRemoteNotifications,
    getRemoteActorDisplay,
  } = useNotifications();
  const { getConversationById, markConversationAsRead } = useMessages();
  const { getUserById } = useProfiles();
  const { getPostById } = useFeedPosts();
  const { isUserSuspended } = useModeration();
  const { isModeratedAway } = useSafetySelectors();
  const { isUserReported, hasReported } = useReports();
  const { getInvitationStatusForGroup, respondToGroupInvitation } = useGroups();
  const [respondingInvitationGroupId, setRespondingInvitationGroupId] = useState<string | null>(null);
  const [invitationRespondErrorByGroupId, setInvitationRespondErrorByGroupId] = useState<Record<string, string>>({});

  const shouldHideNotification = (notification: AppNotification): boolean => {
    if (notification.actorId && (isUserSuspended(notification.actorId) || isUserReported(notification.actorId))) {
      return true;
    }

    const reference = notification.reference;

    if (!reference) {
      return false;
    }

    if (reference.type === 'profile') {
      return isUserSuspended(reference.id) || isUserReported(reference.id);
    }

    if (reference.type === 'conversation') {
      const conversation = getConversationById(reference.id);
      const otherUserId = conversation ? getOtherParticipantId(conversation, CURRENT_USER_ID) : undefined;
      return otherUserId ? isUserSuspended(otherUserId) || isUserReported(otherUserId) : false;
    }

    if (reference.type === 'meetup') {
      const post = getPostById(reference.id);
      return post ? isModeratedAway('meetup', post.id, post.userId) || hasReported('meetup', post.id) : false;
    }

    if (reference.type === 'group') {
      // Group content moderation is a separate system not wired up here — never hide a group
      // notification through the post-moderation path below (getPostById would never resolve a
      // group id to a post anyway, but this makes the intent explicit rather than relying on that
      // fallthrough).
      return false;
    }

    const post = getPostById(reference.id);
    return post
      ? isModeratedAway(getReportTargetTypeForPost(post.category), post.id, post.userId) ||
          hasReported(getReportTargetTypeForPost(post.category), post.id)
      : false;
  };

  const visibleNotifications = notifications.filter((notification) => !shouldHideNotification(notification));

  const isUnread = (notification: AppNotification) => {
    if (notification.type === 'new_message' && notification.reference?.type === 'conversation') {
      const conversation = getConversationById(notification.reference.id);
      return conversation ? conversation.unreadCount > 0 : !notification.read;
    }

    return !notification.read;
  };

  const handleOpenNotification = (notification: AppNotification) => {
    markAsRead(notification.id);

    if (notification.reference?.type === 'conversation') {
      markConversationAsRead(notification.reference.id);
    }

    const route = resolveNotificationRoute(notification);

    if (route) {
      router.push({ pathname: route.pathname, params: route.params });
    }
  };

  // group_invitation: Annehmen/Ablehnen directly on the notification card (Vorgabe 16), not a
  // second notification screen. Looked up by group id (the notification's own reference_id) — see
  // the migration's own reasoning for why no separate invitation id ever needs to reach the client.
  const handleRespondToInvitation = async (groupId: string, response: 'accepted' | 'declined') => {
    if (respondingInvitationGroupId) {
      return;
    }

    setRespondingInvitationGroupId(groupId);
    setInvitationRespondErrorByGroupId((current) => ({ ...current, [groupId]: '' }));

    const { error } = await respondToGroupInvitation(groupId, response);

    setRespondingInvitationGroupId(null);

    if (error) {
      // Buttons re-activate (respondingInvitationGroupId cleared above) and the notification stays
      // exactly as it was — never silently disappears on a failed accept/decline (Vorgabe 37).
      setInvitationRespondErrorByGroupId((current) => ({ ...current, [groupId]: error }));
      return;
    }
  };

  const hasUnread = visibleNotifications.some((notification) => isUnread(notification));

  const errorBanner = remoteNotificationsError ? (
    <View style={styles.remoteErrorBanner}>
      <Text style={styles.remoteErrorText}>{remoteNotificationsError}</Text>
      <Pressable onPress={refreshRemoteNotifications} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
        <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {visibleNotifications.length === 0 ? (
        <View style={styles.emptyState}>
          {errorBanner}
          <IconSymbol size={40} name="bell.fill" color={FeedColors.textSecondary} />
          <Text style={styles.emptyTitle}>
            {isRemoteNotificationsLoading ? 'Benachrichtigungen werden geladen …' : 'Noch keine Benachrichtigungen.'}
          </Text>
          <Text style={styles.emptyText}>Hier erscheinen künftig Aktivitäten rund um deine Inhalte.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {errorBanner}
          {hasUnread ? (
            <Pressable onPress={markAllAsRead} style={styles.markAllButton} accessibilityRole="button" accessibilityLabel="Alle als gelesen markieren">
              <Text style={styles.markAllButtonText}>Alle als gelesen markieren</Text>
            </Pressable>
          ) : null}

          {visibleNotifications.map((notification) => {
            const unread = isUnread(notification);
            const actor = notification.actorId
              ? notification.source === 'supabase'
                ? getRemoteActorDisplay(notification.actorId)
                : getUserById(notification.actorId)
              : undefined;
            // getRemoteActorDisplay always returns a fallback object (initials '?') instead of
            // undefined when the actor profile is unresolved — treat that the same as "no actor"
            // here, so the ride-request text below falls back to its own "Jemand" wording rather
            // than ever showing a placeholder name.
            const actorDisplayName = actor && actor.initials !== '?' ? actor.displayName : undefined;

            const isTripRequestNotification = TRIP_REQUEST_NOTIFICATION_TYPES.includes(notification.type);
            const tripPost =
              isTripRequestNotification && notification.reference?.type === 'trip' ? getPostById(notification.reference.id) : undefined;
            const tripRoute = tripPost?.tripDetails
              ? { departure: tripPost.tripDetails.departure, destination: tripPost.tripDetails.destination }
              : undefined;

            const display = getNotificationDisplayContent(notification, { actorDisplayName, tripRoute });

            // group_invitation: the notification's own reference is always { type: 'group', id:
            // groupId } (see the migration) — invitation status is resolved independently via
            // GroupsContext, not from the (immutable) notification row itself, so it stays correct
            // across app restarts and after a response in a previous session.
            const isGroupInvitation = notification.type === 'group_invitation';
            const invitationGroupId = isGroupInvitation && notification.reference?.type === 'group' ? notification.reference.id : undefined;
            const invitationStatus = invitationGroupId ? getInvitationStatusForGroup(invitationGroupId) : null;
            const isPendingInvitation = isGroupInvitation && invitationStatus === 'pending';
            const isRespondingToThisInvitation = invitationGroupId !== undefined && respondingInvitationGroupId === invitationGroupId;
            const invitationRespondError = invitationGroupId ? invitationRespondErrorByGroupId[invitationGroupId] : undefined;

            const handleRowPress = () => {
              if (isGroupInvitation && invitationStatus !== 'accepted') {
                // Pending: nothing to open yet, the buttons below are the only actions. Declined/
                // cancelled: never grants access, so there is nothing to navigate to either.
                markAsRead(notification.id);
                return;
              }

              handleOpenNotification(notification);
            };

            return (
              <Pressable key={notification.id} onPress={handleRowPress} style={styles.row}>
                {actor ? (
                  <Avatar initials={actor.initials} avatarUrl={actor.avatarUrl} size={36} />
                ) : (
                  <View style={styles.iconBubble}>
                    <IconSymbol size={18} name={getNotificationIcon(notification.type)} color={ClubColors.text} />
                  </View>
                )}
                <View style={styles.rowContent}>
                  {display.title ? <Text style={[styles.notificationTitle, unread && styles.textUnread]}>{display.title}</Text> : null}
                  <Text style={[styles.text, unread && styles.textUnread]}>{display.body}</Text>
                  <Text style={styles.time}>{notification.createdAt}</Text>

                  {isPendingInvitation && invitationGroupId ? (
                    <View style={styles.invitationActionsBlock}>
                      {invitationRespondError ? <Text style={styles.invitationErrorText}>{invitationRespondError}</Text> : null}
                      <View style={styles.invitationButtonRow}>
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            void handleRespondToInvitation(invitationGroupId, 'accepted');
                          }}
                          disabled={isRespondingToThisInvitation}
                          style={[styles.invitationAcceptButton, isRespondingToThisInvitation && styles.invitationButtonDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel="Einladung annehmen"
                        >
                          <Text style={styles.invitationAcceptButtonText}>Annehmen</Text>
                        </Pressable>
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            void handleRespondToInvitation(invitationGroupId, 'declined');
                          }}
                          disabled={isRespondingToThisInvitation}
                          style={[styles.invitationDeclineButton, isRespondingToThisInvitation && styles.invitationButtonDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel="Einladung ablehnen"
                        >
                          <Text style={styles.invitationDeclineButtonText}>Ablehnen</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : isGroupInvitation && invitationStatus === 'accepted' ? (
                    <Text style={styles.invitationResolvedText}>Einladung angenommen · Gruppe öffnen</Text>
                  ) : isGroupInvitation && (invitationStatus === 'declined' || invitationStatus === 'cancelled') ? (
                    <Text style={styles.invitationResolvedText}>
                      {invitationStatus === 'declined' ? 'Einladung abgelehnt' : 'Einladung zurückgezogen'}
                    </Text>
                  ) : null}
                </View>
                {unread ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            );
          })}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  markAllButton: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.sm,
  },
  markAllButtonText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
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
    gap: Spacing.sm,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ClubColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  notificationTitle: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: 2,
  },
  text: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    lineHeight: 20,
  },
  textUnread: {
    color: FeedColors.textPrimary,
    fontWeight: '600',
  },
  time: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  invitationActionsBlock: {
    marginTop: Spacing.sm,
  },
  invitationErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.xs,
  },
  invitationButtonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  invitationAcceptButton: {
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ClubColors.primary,
  },
  invitationAcceptButtonText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  invitationDeclineButton: {
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  invitationDeclineButtonText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  invitationButtonDisabled: {
    opacity: 0.5,
  },
  invitationResolvedText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ClubColors.primary,
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
    marginBottom: Spacing.xs,
  },
  emptyText: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 20,
  },
});
