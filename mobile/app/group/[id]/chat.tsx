import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { NotFoundView } from '@/components/navigation/not-found-view';
import { ClubColors, FeedColors, FontSizes, Radii, Spacing, StatusColors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useGroups } from '@/context/groups-context';
import { useProfiles } from '@/context/profile-context';
import { isPlausibleRemoteGroupId } from '@/data/groups';
import { CURRENT_USER_ID } from '@/data/users';
import { dismissKeyboardOnNative } from '@/lib/dismiss-keyboard';
import { supabase } from '@/lib/supabase';

export default function GroupChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const {
    getGroupById,
    isMember,
    getLocalGroupMessages,
    sendLocalGroupMessage,
    remoteGroupMessagesByGroupId,
    isGroupMessagesLoading,
    groupMessagesErrorFor,
    loadGroupMessages,
    sendGroupMessage,
    markGroupRead,
    setActiveGroupId,
    groupMembers,
    refreshGroupMembers,
    groupMessagesRealtimeStatus,
    retryGroupMessagesRealtime,
    fetchGroupDetail,
  } = useGroups();
  const { getUserById } = useProfiles();
  const [draftText, setDraftText] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const isAtBottomRef = useRef(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [unresolvedNames, setUnresolvedNames] = useState<Record<string, string>>({});
  const [isCheckingGroupDetail, setIsCheckingGroupDetail] = useState(false);
  const [groupDetailError, setGroupDetailError] = useState<string | null>(null);

  const group = params.id ? getGroupById(params.id) : undefined;
  const isRemoteGroup = group?.source === 'supabase';
  const member = group ? isMember(group.id) : false;
  const myId = isRemoteGroup ? authUserId : CURRENT_USER_ID;

  // Same "not found" vs. "not a member" distinction as app/group/[id].tsx — a member removed
  // while this chat is open must see "Du bist kein Mitglied dieser Gruppe.", not a generic
  // not-found message. Never runs for a local seed id.
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
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (group && isRemoteGroup && member) {
      loadGroupMessages(group.id);
      refreshGroupMembers(group.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, isRemoteGroup, member]);

  useEffect(() => {
    if (group && isRemoteGroup && member) {
      setActiveGroupId(group.id);
      void markGroupRead(group.id);
    }

    return () => {
      setActiveGroupId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, isRemoteGroup, member]);

  const remoteMessages = group && isRemoteGroup ? (remoteGroupMessagesByGroupId[group.id] ?? []) : [];
  const localMessages = group && !isRemoteGroup ? getLocalGroupMessages(group.id) : [];
  const messages = isRemoteGroup ? remoteMessages : localMessages;
  const isLoadingMessages = group && isRemoteGroup ? isGroupMessagesLoading(group.id) : false;
  const messagesError = group && isRemoteGroup ? groupMessagesErrorFor(group.id) : null;

  const memberDisplayNameById: Record<string, string> = {};
  (group ? (groupMembers[group.id] ?? []) : []).forEach((entry) => {
    memberDisplayNameById[entry.userId] = entry.displayName;
  });

  const resolveSenderName = (senderId: string): string => {
    if (!isRemoteGroup) {
      return getUserById(senderId)?.displayName ?? 'Unbekanntes Mitglied';
    }

    return memberDisplayNameById[senderId] ?? unresolvedNames[senderId] ?? 'Unbekanntes Mitglied';
  };

  const unresolvedSenderIdsKey = isRemoteGroup
    ? [...new Set(messages.map((message) => message.senderId).filter((id) => !memberDisplayNameById[id] && !unresolvedNames[id]))]
        .sort()
        .join(',')
    : '';

  useEffect(() => {
    const ids = unresolvedSenderIdsKey ? unresolvedSenderIdsKey.split(',') : [];

    if (ids.length === 0) {
      return;
    }

    let isCurrent = true;

    Promise.resolve(
      supabase.from('profiles').select('id, display_name').in('id', ids),
    )
      .then(({ data }) => {
        if (!isCurrent) return;

        const map: Record<string, string> = {};
        ((data ?? []) as { id: string; display_name: string | null }[]).forEach((row) => {
          map[row.id] = row.display_name?.trim() || 'Unbekanntes Mitglied';
        });
        setUnresolvedNames((current) => ({ ...current, ...map }));
      })
      .catch(() => {
        // Best-effort stub resolution -- see blocked-users.tsx's identical comment.
      });

    return () => {
      isCurrent = false;
    };
  }, [unresolvedSenderIdsKey]);

  if (!group) {
    if (isCheckingGroupDetail) {
      return (
        <SafeAreaView style={styles.safeArea}>
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

  if (!member) {
    return <NotFoundView title="Kein Zugriff" message="Du bist kein Mitglied dieser Gruppe." />;
  }

  const handleSend = async () => {
    if (!draftText.trim() || isSending) {
      return;
    }

    if (!isRemoteGroup) {
      sendLocalGroupMessage(group.id, draftText);
      setDraftText('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      return;
    }

    setIsSending(true);
    setSendError(null);
    const { error } = await sendGroupMessage(group.id, draftText);
    setIsSending(false);

    if (error) {
      setSendError(error);
      return;
    }

    setDraftText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const isSendValid = draftText.trim().length > 0 && !isSending;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboardOnNative}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Zurück zur Gruppe"
              style={styles.headerBack}
            >
              <Text style={styles.headerBackText}>‹ {group.name}</Text>
            </Pressable>
            {isRemoteGroup && groupMessagesRealtimeStatus === 'error' ? (
              <View style={styles.realtimeBanner}>
                <Text style={styles.realtimeBannerText}>Live-Aktualisierung unterbrochen</Text>
                <Pressable onPress={retryGroupMessagesRealtime} accessibilityRole="button" accessibilityLabel="Erneut verbinden">
                  <Text style={styles.realtimeBannerRetry}>Erneut verbinden</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.messagesContainer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
              isAtBottomRef.current = distanceFromBottom < 80;
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (isAtBottomRef.current) {
                scrollRef.current?.scrollToEnd({ animated: true });
              }
            }}
          >
            {messagesError ? (
              <View style={styles.remoteErrorBanner}>
                <Text style={styles.remoteErrorText}>{messagesError}</Text>
                <Pressable onPress={() => loadGroupMessages(group.id)} accessibilityRole="button" accessibilityLabel="Erneut versuchen">
                  <Text style={styles.remoteErrorRetry}>Erneut versuchen</Text>
                </Pressable>
              </View>
            ) : null}

            {messages.length === 0 ? (
              <Text style={styles.emptyMessages}>
                {isLoadingMessages ? 'Nachrichten werden geladen …' : 'Noch keine Nachrichten. Schreib die erste Nachricht.'}
              </Text>
            ) : (
              messages.map((message) => {
                const isOwn = myId != null && message.senderId === myId;

                return (
                  <View key={message.id} style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
                    {!isOwn ? <Text style={styles.senderName}>{resolveSenderName(message.senderId)}</Text> : null}
                    <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                      <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{message.text}</Text>
                    </View>
                    <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>{message.createdAt}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.composer}>
            {sendError ? <Text style={styles.sendErrorText}>{sendError}</Text> : null}
            <View style={styles.composerRow}>
              <TextInput
                value={draftText}
                onChangeText={setDraftText}
                placeholder="Nachricht an die Gruppe…"
                placeholderTextColor={FeedColors.textSecondary}
                multiline
                style={styles.composerInput}
              />
              <Pressable
                onPress={() => void handleSend()}
                disabled={!isSendValid}
                style={[styles.sendButton, !isSendValid && styles.sendButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Nachricht senden"
              >
                <Text style={styles.sendButtonText}>{isSending ? 'Wird gesendet …' : 'Senden'}</Text>
              </Pressable>
            </View>
          </View>

          {keyboardVisible ? (
            <Pressable onPress={dismissKeyboardOnNative} style={styles.closeKeyboardButton} accessibilityRole="button" accessibilityLabel="Tastatur schließen">
              <Text style={styles.closeKeyboardButtonText}>Fertig</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FeedColors.background,
  },
  loadingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: FeedColors.cardBorder,
  },
  headerBack: {
    alignSelf: 'flex-start',
  },
  headerBackText: {
    color: FeedColors.textPrimary,
    fontSize: FontSizes.body,
    fontWeight: '700',
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
  senderName: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.meta,
    fontWeight: '600',
    marginBottom: 2,
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
  bubbleTime: {
    color: FeedColors.textSecondary,
    fontSize: FontSizes.badge,
    marginTop: 2,
  },
  bubbleTimeOwn: {
    textAlign: 'right',
  },
  composer: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: FeedColors.cardBorder,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  sendErrorText: {
    color: StatusColors.error,
    fontSize: FontSizes.meta,
    marginBottom: Spacing.sm,
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
  realtimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    backgroundColor: FeedColors.imagePlaceholder,
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
