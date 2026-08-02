import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '@/components/feed/avatar';
import { NotFoundView } from '@/components/navigation/not-found-view';
import { ReportModal } from '@/components/reports/report-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing } from '@/constants/theme';
import { useBlocks } from '@/context/blocks-context';
import { useMessages } from '@/context/messages-context';
import { useModeration } from '@/context/moderation-context';
import { useProfiles } from '@/context/profile-context';
import { useReports } from '@/context/reports-context';
import { getOtherParticipantId } from '@/data/messages';
import type { ReportTargetType } from '@/data/reports';
import { CURRENT_USER_ID } from '@/data/users';
import { useSafetySelectors } from '@/hooks/use-safety-selectors';

export default function MessageConversationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { conversations, getMessagesForConversation, sendMessage, markConversationAsRead } = useMessages();
  const { getUserById } = useProfiles();
  const { hasReported } = useReports();
  const { isBlocked, blockUser, unblockUser } = useBlocks();
  const { isContentModerationHidden } = useModeration();
  const { canMessageUser } = useSafetySelectors();
  const [draftText, setDraftText] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string; title: string } | null>(null);

  const conversation = params.id ? conversations.find((entry) => entry.id === params.id) : undefined;
  const isParticipant = conversation?.participantIds.includes(CURRENT_USER_ID) ?? false;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (conversation && isParticipant) {
      markConversationAsRead(conversation.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  if (!conversation || !isParticipant) {
    return <NotFoundView title="Unterhaltung nicht gefunden" message="Die angeforderte Unterhaltung konnte nicht gefunden werden." />;
  }

  const otherUserId = getOtherParticipantId(conversation, CURRENT_USER_ID);
  const otherUser = otherUserId ? getUserById(otherUserId) : undefined;
  const messages = getMessagesForConversation(conversation.id).filter(
    (message) => !isContentModerationHidden('message', message.id),
  );
  const reference = conversation.reference;
  const referencePathname = reference?.type === 'meetup' ? '/meetup/[id]' : '/post/[id]';
  const isPersonallyBlocked = otherUserId ? isBlocked(otherUserId) : false;
  const isChatLocked = otherUserId ? !canMessageUser(otherUserId) : false;

  const handleAuthorPress = () => {
    if (otherUserId) {
      router.push({ pathname: '/profile/[id]', params: { id: otherUserId } });
    }
  };

  const handleReferencePress = () => {
    if (reference) {
      router.push({ pathname: referencePathname, params: { id: reference.id } });
    }
  };

  const handleSend = () => {
    if (!draftText.trim()) {
      return;
    }

    sendMessage(conversation.id, draftText);
    setDraftText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const isSendValid = draftText.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Pressable
                onPress={handleAuthorPress}
                style={styles.userBlock}
                accessibilityRole="button"
                accessibilityLabel={`Profil von ${otherUser?.displayName ?? 'Nutzer'} öffnen`}
              >
                <Avatar initials={otherUser?.initials ?? '?'} />
                <Text style={styles.userName}>{otherUser?.displayName ?? 'Unbekannter Nutzer'}</Text>
              </Pressable>
              {otherUserId ? (
                <OverflowMenu
                  accessibilityLabel="Weitere Aktionen zu diesem Nutzer"
                  actions={[
                    {
                      key: 'report-user',
                      label: hasReported('user', otherUserId) ? 'Bereits gemeldet' : 'Nutzer melden',
                      icon: 'flag.fill',
                      disabled: hasReported('user', otherUserId),
                      onPress: () => setReportTarget({ type: 'user', id: otherUserId, title: 'Nutzer melden' }),
                    },
                    {
                      key: 'block-user',
                      label: isBlocked(otherUserId) ? 'Nutzer entsperren' : 'Nutzer blockieren',
                      icon: 'nosign',
                      destructive: !isBlocked(otherUserId),
                      onPress: () => (isBlocked(otherUserId) ? unblockUser(otherUserId) : blockUser(otherUserId)),
                    },
                  ]}
                />
              ) : null}
            </View>
            {reference ? (
              <Pressable onPress={handleReferencePress} style={styles.referenceChip} accessibilityRole="button" accessibilityLabel={`Zu: ${reference.title} öffnen`}>
                <Text style={styles.referenceChipText} numberOfLines={1}>
                  {reference.title}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.messagesContainer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 ? (
              <Text style={styles.emptyMessages}>Noch keine Nachrichten. Schreib die erste Nachricht.</Text>
            ) : (
              messages.map((message) => {
                const isOwn = message.senderId === CURRENT_USER_ID;

                return (
                  <View key={message.id} style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
                    <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                      <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{message.text}</Text>
                    </View>
                    <View style={styles.bubbleFooter}>
                      <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>{message.createdAt}</Text>
                      {!isOwn ? (
                        <OverflowMenu
                          accessibilityLabel="Weitere Aktionen zu dieser Nachricht"
                          actions={[
                            {
                              key: 'report-message',
                              label: hasReported('message', message.id) ? 'Bereits gemeldet' : 'Nachricht melden',
                              icon: 'flag.fill',
                              disabled: hasReported('message', message.id),
                              onPress: () => setReportTarget({ type: 'message', id: message.id, title: 'Nachricht melden' }),
                            },
                          ]}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {isChatLocked ? (
            <View style={styles.lockedBanner}>
              <IconSymbol size={18} name="nosign" color={FeedColors.textSecondary} />
              <Text style={styles.lockedBannerText}>
                {isPersonallyBlocked
                  ? `Du hast ${otherUser?.displayName ?? 'diesen Nutzer'} blockiert. Entsperre ihn, um wieder Nachrichten zu schreiben.`
                  : `${otherUser?.displayName ?? 'Dieser Nutzer'} wurde lokal moderativ gesperrt. Nachrichten sind derzeit nicht möglich.`}
              </Text>
            </View>
          ) : (
            <View style={styles.composer}>
              <TextInput
                value={draftText}
                onChangeText={setDraftText}
                placeholder="Nachricht schreiben…"
                placeholderTextColor={FeedColors.textSecondary}
                multiline
                style={styles.composerInput}
              />
              <Pressable
                onPress={handleSend}
                disabled={!isSendValid}
                style={[styles.sendButton, !isSendValid && styles.sendButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Nachricht senden"
              >
                <Text style={styles.sendButtonText}>Senden</Text>
              </Pressable>
            </View>
          )}

          {keyboardVisible ? (
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.closeKeyboardButton} accessibilityRole="button" accessibilityLabel="Tastatur schließen">
              <Text style={styles.closeKeyboardButtonText}>Fertig</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </KeyboardAvoidingView>
      {reportTarget ? (
        <ReportModal
          visible
          onClose={() => setReportTarget(null)}
          title={reportTarget.title}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: FeedColors.cardBorder,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  userName: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  referenceChip: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    backgroundColor: ClubColors.surface,
    borderWidth: 1,
    borderColor: ClubColors.border,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  referenceChipText: {
    color: ClubColors.text,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  messagesContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    flexGrow: 1,
  },
  emptyMessages: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  bubbleRow: {
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  bubbleRowOwn: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  bubbleOther: {
    backgroundColor: FeedColors.imagePlaceholder,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  bubbleOwn: {
    backgroundColor: ClubColors.primary,
  },
  bubbleText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    lineHeight: 20,
  },
  bubbleTextOwn: {
    color: ClubColors.secondary,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  bubbleTime: {
    color: FeedColors.textSecondary,
    fontSize: 11,
  },
  bubbleTimeOwn: {
    textAlign: 'right',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
    backgroundColor: FeedColors.imagePlaceholder,
  },
  lockedBannerText: {
    flex: 1,
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    lineHeight: 18,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    color: FeedColors.textPrimary,
  },
  sendButton: {
    backgroundColor: FeedColors.textPrimary,
    borderRadius: Radii.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: FeedColors.background,
    fontSize: FontSizes.meta,
    fontWeight: '700',
  },
  closeKeyboardButton: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.xl + 60,
    backgroundColor: FeedColors.cardBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.round,
    borderWidth: 1,
    borderColor: FeedColors.cardBorder,
  },
  closeKeyboardButtonText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
  },
});
