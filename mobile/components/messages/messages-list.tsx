import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useMessages } from '@/context/messages-context';
import { useProfiles } from '@/context/profile-context';
import { getOtherParticipantId, type Conversation } from '@/data/messages';
import { CURRENT_USER_ID } from '@/data/users';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';

export function MessagesList() {
  const router = useRouter();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const { conversations, getRemoteParticipantDisplay, realtimeStatus, realtimeError, retryRealtime } = useMessages();
  const { getUserById } = useProfiles();
  const { canMessageUser } = useSafetySelectors();

  const myIdForConversation = (conversation: Conversation) => (conversation.source === 'supabase' ? authUserId : CURRENT_USER_ID);

  const ownConversations = conversations.filter((conversation) => {
    const myId = myIdForConversation(conversation);

    if (conversation.source === 'supabase') {
      // Remote conversations are already scoped to the signed-in user via RLS.
      if (!myId) return false;
    } else if (!conversation.participantIds.includes(CURRENT_USER_ID)) {
      return false;
    }

    const otherUserId = myId ? getOtherParticipantId(conversation, myId) : undefined;
    return !otherUserId || canMessageUser(otherUserId);
  });

  const handleOpenConversation = (conversationId: string) => {
    router.push({ pathname: '/messages/[id]', params: { id: conversationId } });
  };

  if (ownConversations.length === 0) {
    return (
      <View style={styles.emptyState}>
        <IconSymbol size={40} name="message" color={FeedColors.textSecondary} />
        <Text style={styles.emptyTitle}>Noch keine Unterhaltungen.</Text>
        <Text style={styles.emptyText}>
          Starte eine Unterhaltung über ein Profil, eine Fahrt, einen Treffpunkt oder ein Gesuch.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {realtimeStatus === 'error' ? (
        <View style={styles.realtimeBanner}>
          <Text style={styles.realtimeBannerText}>{realtimeError ?? 'Live-Aktualisierung unterbrochen'}</Text>
          <Pressable onPress={retryRealtime} accessibilityRole="button" accessibilityLabel="Erneut verbinden">
            <Text style={styles.realtimeBannerRetry}>Erneut verbinden</Text>
          </Pressable>
        </View>
      ) : null}
      {ownConversations.map((conversation) => {
        const myId = myIdForConversation(conversation);
        const otherUserId = myId ? getOtherParticipantId(conversation, myId) : undefined;
        const otherUser =
          conversation.source === 'supabase' && otherUserId ? getRemoteParticipantDisplay(otherUserId) : otherUserId ? getUserById(otherUserId) : undefined;
        const isUnread = conversation.unreadCount > 0;

        return (
          <Pressable
            key={conversation.id}
            onPress={() => handleOpenConversation(conversation.id)}
            style={styles.row}
          >
            <Avatar initials={otherUser?.initials ?? '?'} />
            <View style={styles.rowContent}>
              <View style={styles.rowHeader}>
                <Text style={[styles.name, isUnread && styles.nameUnread]} numberOfLines={1}>
                  {otherUser?.displayName ?? 'Unbekannter Nutzer'}
                </Text>
                <Text style={styles.time}>{conversation.lastMessageAt}</Text>
              </View>
              {conversation.reference ? (
                <Text style={styles.reference} numberOfLines={1}>
                  Zu: {conversation.reference.title}
                </Text>
              ) : null}
              <Text style={[styles.preview, isUnread && styles.previewUnread]} numberOfLines={1}>
                {conversation.lastMessageText || 'Noch keine Nachrichten.'}
              </Text>
            </View>
            {isUnread ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  realtimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    backgroundColor: FeedColors.cardBackground,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  realtimeBannerText: {
    flex: 1,
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
  },
  realtimeBannerRetry: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '700',
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
  rowContent: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  nameUnread: {
    fontWeight: '700',
  },
  time: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    marginLeft: Spacing.sm,
  },
  reference: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    marginTop: 2,
  },
  preview: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    marginTop: 2,
  },
  previewUnread: {
    color: FeedColors.textPrimary,
    fontWeight: '600',
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    backgroundColor: ClubColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: ClubColors.secondary,
    fontSize: FontSizes.badge,
    fontWeight: '700',
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
