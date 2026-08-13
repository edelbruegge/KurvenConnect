import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth-context';
import {
  seedConversations,
  seedMessages,
  type Conversation,
  type ConversationReference,
  type Message,
} from '@/data/messages';
import { CURRENT_USER_ID } from '@/data/users';
import { getInitialsFromName } from '@/lib/map-supabase-profile';
import {
  clientReferenceTypeToDb,
  computeUnreadCount,
  mapSupabaseConversationToConversation,
  mapSupabaseMessageToMessage,
  type SupabaseConversationRow,
  type SupabaseMessageRow,
} from '@/lib/map-supabase-message';
import { mapMessageError, mapRealtimeError } from '@/lib/message-errors';
import { supabase } from '@/lib/supabase';

type AuthorDisplay = { displayName: string; initials: string; avatarUrl?: string };

// A minimal structural view of the postgres_changes INSERT payload — only the fields this
// handler actually reads. Avoids importing @supabase/realtime-js's payload types directly (a
// transitive dependency of @supabase/supabase-js, not declared in package.json); the real
// payload supabase-js hands us is always assignable to this shape.
type RealtimeMessageInsertPayload = {
  new: Record<string, unknown>;
};

type RealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'reconnecting' | 'error' | 'closed';

type NewRemoteConversationInput = {
  otherUserId: string;
  reference?: ConversationReference;
};

type NewRemoteMessageInput = {
  conversationId: string;
  content: string;
  reference?: ConversationReference;
};

type MessagesContextValue = {
  conversations: Conversation[];
  getConversationById: (id: string) => Conversation | undefined;
  getMessagesForConversation: (conversationId: string) => Message[];
  getMessageById: (messageId: string) => Message | undefined;
  getOrCreateConversation: (otherUserId: string, reference?: ConversationReference) => string;
  sendMessage: (conversationId: string, text: string) => void;
  markConversationAsRead: (conversationId: string) => void;
  getTotalUnreadCount: () => number;

  // Supabase-backed direct conversations.
  remoteConversations: Conversation[];
  isRemoteConversationsLoading: boolean;
  remoteConversationsError: string | null;
  refreshRemoteConversations: () => void;
  remoteMessagesByConversationId: Record<string, Message[]>;
  loadRemoteMessages: (conversationId: string) => void;
  isRemoteMessagesLoading: (conversationId: string) => boolean;
  remoteMessagesError: (conversationId: string) => string | null;
  getRemoteParticipantDisplay: (userId: string) => AuthorDisplay;
  getOrCreateDirectConversation: (input: NewRemoteConversationInput) => Promise<{ conversationId: string | null; error: string | null }>;
  sendRemoteMessage: (input: NewRemoteMessageInput) => Promise<{ error: string | null }>;
  markRemoteConversationRead: (conversationId: string) => Promise<void>;
  unreadConversationCount: number;

  // Realtime synchronization for newly inserted messages.
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  realtimeStatus: RealtimeStatus;
  realtimeError: string | null;
  retryRealtime: () => void;
};

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

const MESSAGE_CONTENT_MAX_LENGTH = 2000;
const CONVERSATIONS_OVERVIEW_MESSAGES_LIMIT = 300;
const CONVERSATION_MESSAGES_LIMIT = 100;

const CONVERSATIONS_SELECT_COLUMNS = 'id, conversation_type, direct_key, created_by, created_at, updated_at, last_message_at';
const CONVERSATION_MEMBERS_SELECT_COLUMNS = 'conversation_id, user_id, joined_at, last_read_at';
const MESSAGES_SELECT_COLUMNS = 'id, conversation_id, sender_id, content, reference_type, reference_id, reference_title, created_at';

const NOT_SIGNED_IN_ERROR = 'Bitte melde dich an, um das zu tun.';
const UNKNOWN_PARTICIPANT_DISPLAY: AuthorDisplay = { displayName: 'Unbekanntes Mitglied', initials: '?' };

function getConversationTimeMs(conversation: Conversation): number {
  return conversation.lastMessageAtIso ? new Date(conversation.lastMessageAtIso).getTime() : 0;
}

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;

  const [localConversations, setLocalConversations] = useState<Conversation[]>(seedConversations);
  const [localMessages, setLocalMessages] = useState<Message[]>(seedMessages);

  const [remoteConversations, setRemoteConversations] = useState<Conversation[]>([]);
  const [remoteParticipantProfiles, setRemoteParticipantProfiles] = useState<Record<string, AuthorDisplay>>({});
  const [isRemoteConversationsLoading, setIsRemoteConversationsLoading] = useState(false);
  const [remoteConversationsError, setRemoteConversationsError] = useState<string | null>(null);
  const [conversationsReloadToken, setConversationsReloadToken] = useState(0);

  const [remoteMessagesByConversationId, setRemoteMessagesByConversationId] = useState<Record<string, Message[]>>({});
  const [isRemoteMessagesLoadingByConversationId, setIsRemoteMessagesLoadingByConversationId] = useState<Record<string, boolean>>({});
  const [remoteMessagesErrorByConversationId, setRemoteMessagesErrorByConversationId] = useState<Record<string, string | null>>({});

  const inFlightSendConversationIds = useRef<Set<string>>(new Set());
  const inFlightGetOrCreateOtherUserIds = useRef<Set<string>>(new Set());
  const messagesRequestSeq = useRef<Record<string, number>>({});

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle');
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [realtimeReconnectToken, setRealtimeReconnectToken] = useState(0);
  const conversationsRefreshScheduledRef = useRef(false);

  // "Latest ref" mirrors so the realtime subscription effect (and its AppState companion) can
  // stay on a stable dependency list — [authUserId, realtimeReconnectToken] — without tearing
  // down and rebuilding the channel every time a chat is opened/closed or the status changes.
  const activeConversationIdRef = useRef<string | null>(null);
  const realtimeStatusRef = useRef<RealtimeStatus>('idle');

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    realtimeStatusRef.current = realtimeStatus;
  }, [realtimeStatus]);

  useEffect(() => {
    if (!isRemoteConversationsLoading) {
      conversationsRefreshScheduledRef.current = false;
    }
  }, [isRemoteConversationsLoading]);

  useEffect(() => {
    if (!authUserId) {
      // Signed out (or account switched away from): never keep showing stale remote content.
      setRemoteConversations([]);
      setRemoteParticipantProfiles({});
      setRemoteMessagesByConversationId({});
      setIsRemoteMessagesLoadingByConversationId({});
      setRemoteMessagesErrorByConversationId({});
      setIsRemoteConversationsLoading(false);
      setRemoteConversationsError(null);
      setActiveConversationId(null);
      inFlightSendConversationIds.current.clear();
      inFlightGetOrCreateOtherUserIds.current.clear();
      messagesRequestSeq.current = {};
      conversationsRefreshScheduledRef.current = false;
      return;
    }

    let isCurrent = true;
    setIsRemoteConversationsLoading(true);
    setRemoteConversationsError(null);

    (async () => {
      const { data: membershipRows, error: membershipError } = await supabase
        .from('conversation_members')
        .select(CONVERSATION_MEMBERS_SELECT_COLUMNS)
        .eq('user_id', authUserId);

      if (!isCurrent) return;

      if (membershipError) {
        setRemoteConversationsError(mapMessageError(membershipError));
        setRemoteConversations([]);
        setIsRemoteConversationsLoading(false);
        return;
      }

      const memberships = membershipRows ?? [];

      if (memberships.length === 0) {
        setRemoteConversations([]);
        setIsRemoteConversationsLoading(false);
        return;
      }

      const conversationIds = memberships.map((row) => row.conversation_id);
      const myLastReadByConversationId = new Map<string, string | null>(
        memberships.map((row) => [row.conversation_id, row.last_read_at]),
      );

      const [conversationsResult, membersResult] = await Promise.all([
        supabase.from('conversations').select(CONVERSATIONS_SELECT_COLUMNS).in('id', conversationIds),
        supabase.from('conversation_members').select(CONVERSATION_MEMBERS_SELECT_COLUMNS).in('conversation_id', conversationIds),
      ]);

      if (!isCurrent) return;

      if (conversationsResult.error) {
        setRemoteConversationsError(mapMessageError(conversationsResult.error));
        setRemoteConversations([]);
        setIsRemoteConversationsLoading(false);
        return;
      }

      if (membersResult.error) {
        setRemoteConversationsError(mapMessageError(membersResult.error));
        setRemoteConversations([]);
        setIsRemoteConversationsLoading(false);
        return;
      }

      const conversationRows = (conversationsResult.data ?? []) as SupabaseConversationRow[];
      const memberRows = membersResult.data ?? [];

      const otherUserIdByConversationId = new Map<string, string>();
      memberRows.forEach((row) => {
        if (row.user_id !== authUserId) {
          otherUserIdByConversationId.set(row.conversation_id, row.user_id);
        }
      });

      const otherUserIds = Array.from(new Set(Array.from(otherUserIdByConversationId.values())));

      const { data: profileRows, error: profilesError } =
        otherUserIds.length > 0
          ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', otherUserIds)
          : { data: [], error: null };

      if (!isCurrent) return;

      if (profilesError) {
        setRemoteConversationsError(mapMessageError(profilesError));
        setRemoteConversations([]);
        setIsRemoteConversationsLoading(false);
        return;
      }

      const participantDisplayById: Record<string, AuthorDisplay> = {};
      (profileRows ?? []).forEach((row: { id: string; display_name: string | null; avatar_url: string | null }) => {
        const displayName = row.display_name?.trim() || 'Neues Mitglied';
        participantDisplayById[row.id] = { displayName, initials: getInitialsFromName(displayName), avatarUrl: row.avatar_url ?? undefined };
      });

      // A single, capped query covers both the last-message preview and the unread count for
      // every conversation in this overview — never an unbounded scan of every message ever
      // sent, matching the "kontrollierte Abfrage" requirement.
      const { data: messageRows, error: messagesError } = await supabase
        .from('messages')
        .select(MESSAGES_SELECT_COLUMNS)
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(CONVERSATIONS_OVERVIEW_MESSAGES_LIMIT);

      if (!isCurrent) return;

      if (messagesError) {
        setRemoteConversationsError(mapMessageError(messagesError));
        setRemoteConversations([]);
        setIsRemoteConversationsLoading(false);
        return;
      }

      const mappedMessages = ((messageRows ?? []) as SupabaseMessageRow[]).map(mapSupabaseMessageToMessage);
      const messagesByConversationId = new Map<string, Message[]>();
      const lastMessageByConversationId = new Map<string, Message>();

      mappedMessages.forEach((message) => {
        const list = messagesByConversationId.get(message.conversationId) ?? [];
        list.push(message);
        messagesByConversationId.set(message.conversationId, list);

        if (!lastMessageByConversationId.has(message.conversationId)) {
          // Rows arrived newest-first, so the first one seen per conversation is the latest.
          lastMessageByConversationId.set(message.conversationId, message);
        }
      });

      const mappedConversations = conversationRows.map((row) => {
        const otherUserId = otherUserIdByConversationId.get(row.id) ?? authUserId;
        const lastMessage = lastMessageByConversationId.get(row.id);
        const unreadCount = computeUnreadCount(
          messagesByConversationId.get(row.id) ?? [],
          myLastReadByConversationId.get(row.id) ?? null,
          authUserId,
        );

        return mapSupabaseConversationToConversation(row, [authUserId, otherUserId], lastMessage?.text ?? '', unreadCount);
      });

      mappedConversations.sort((a, b) => getConversationTimeMs(b) - getConversationTimeMs(a));

      setRemoteParticipantProfiles((current) => ({ ...current, ...participantDisplayById }));
      setRemoteConversations(mappedConversations);
      setIsRemoteConversationsLoading(false);
    })();

    return () => {
      isCurrent = false;
    };
  }, [authUserId, conversationsReloadToken]);

  const refreshRemoteConversations = () => {
    setConversationsReloadToken((token) => token + 1);
  };

  const loadRemoteMessages = (conversationId: string) => {
    if (!authUserId) {
      return;
    }

    const seq = (messagesRequestSeq.current[conversationId] ?? 0) + 1;
    messagesRequestSeq.current[conversationId] = seq;

    setIsRemoteMessagesLoadingByConversationId((current) => ({ ...current, [conversationId]: true }));
    setRemoteMessagesErrorByConversationId((current) => ({ ...current, [conversationId]: null }));

    supabase
      .from('messages')
      .select(MESSAGES_SELECT_COLUMNS)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(CONVERSATION_MESSAGES_LIMIT)
      .then(({ data, error }) => {
        if (messagesRequestSeq.current[conversationId] !== seq) {
          // A newer request (or a sign-out) has already taken over.
          return;
        }

        if (error) {
          setRemoteMessagesErrorByConversationId((current) => ({ ...current, [conversationId]: mapMessageError(error) }));
          setIsRemoteMessagesLoadingByConversationId((current) => ({ ...current, [conversationId]: false }));
          return;
        }

        const mapped = ((data ?? []) as SupabaseMessageRow[]).map(mapSupabaseMessageToMessage);
        setRemoteMessagesByConversationId((current) => ({ ...current, [conversationId]: mapped }));
        setIsRemoteMessagesLoadingByConversationId((current) => ({ ...current, [conversationId]: false }));
      });
  };

  const isRemoteMessagesLoading = (conversationId: string) => isRemoteMessagesLoadingByConversationId[conversationId] ?? false;
  const remoteMessagesError = (conversationId: string) => remoteMessagesErrorByConversationId[conversationId] ?? null;
  const getRemoteParticipantDisplay = (userId: string): AuthorDisplay => remoteParticipantProfiles[userId] ?? UNKNOWN_PARTICIPANT_DISPLAY;

  // Central handler for every realtime INSERT event on public.messages, regardless of which
  // conversation it belongs to (RLS already restricts delivery to conversations the current
  // account is a member of — see the migration's SELECT policy). Reads authUserId directly from
  // the render this closure was captured in; the "latest ref" wrapper below is what keeps that
  // read fresh without resubscribing the channel.
  const handleRealtimeMessageInsert = (payload: RealtimeMessageInsertPayload) => {
    if (!authUserId) {
      return;
    }

    const row = payload.new;
    const isValidRow =
      row &&
      typeof row.id === 'string' &&
      typeof row.conversation_id === 'string' &&
      typeof row.sender_id === 'string' &&
      typeof row.content === 'string' &&
      typeof row.created_at === 'string';

    if (!isValidRow) {
      if (__DEV__) {
        console.error('[messages:realtime] invalid INSERT payload', payload);
      }
      return;
    }

    const message = mapSupabaseMessageToMessage(row as unknown as SupabaseMessageRow);
    const isOwnMessage = message.senderId === authUserId;
    const isActiveConversation = activeConversationIdRef.current === message.conversationId;

    let alreadyKnown = false;

    setRemoteMessagesByConversationId((current) => {
      const existing = current[message.conversationId] ?? [];

      if (existing.some((entry) => entry.id === message.id)) {
        alreadyKnown = true;
        return current;
      }

      const next = [...existing, message].sort((a, b) => (a.createdAtIso ?? '').localeCompare(b.createdAtIso ?? ''));
      return { ...current, [message.conversationId]: next };
    });

    // Duplicate of a message this client already knows about (typically its own just-sent
    // message, already applied via sendRemoteMessage's insert().select() response) — stop here,
    // no unread bump, no conversation-preview update, no phantom re-application.
    if (alreadyKnown) {
      return;
    }

    let conversationKnown = true;

    setRemoteConversations((current) => {
      const index = current.findIndex((conversation) => conversation.id === message.conversationId);

      if (index === -1) {
        conversationKnown = false;
        return current;
      }

      const conversation = current[index];
      const shouldCountAsUnread = !isOwnMessage && !isActiveConversation;
      const next = [...current];
      next[index] = {
        ...conversation,
        lastMessageText: message.text,
        lastMessageAt: message.createdAt,
        lastMessageAtIso: message.createdAtIso,
        unreadCount: shouldCountAsUnread ? conversation.unreadCount + 1 : conversation.unreadCount,
      };
      return next;
    });

    if (!conversationKnown && !conversationsRefreshScheduledRef.current) {
      // A message for a conversation this session hasn't loaded yet — resync from the server
      // instead of fabricating a conversation with guessed participants. Guarded so a burst of
      // events for the same unseen conversation can't trigger a refresh loop.
      conversationsRefreshScheduledRef.current = true;
      refreshRemoteConversations();
    }

    if (isActiveConversation && !isOwnMessage) {
      void markRemoteConversationRead(message.conversationId);
    }
  };

  const handleRealtimeMessageInsertRef = useRef(handleRealtimeMessageInsert);
  handleRealtimeMessageInsertRef.current = handleRealtimeMessageInsert;

  useEffect(() => {
    if (!authUserId) {
      setRealtimeStatus('idle');
      setRealtimeError(null);
      return;
    }

    let isCurrent = true;
    setRealtimeStatus((current) => (current === 'error' || current === 'closed' ? 'reconnecting' : 'connecting'));
    setRealtimeError(null);

    const channel = supabase
      .channel(`messages:${authUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (!isCurrent) return;
          handleRealtimeMessageInsertRef.current(payload);
        },
      )
      .subscribe((status, err) => {
        if (!isCurrent) return;

        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('subscribed');
          setRealtimeError(null);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('error');
          setRealtimeError(mapRealtimeError(err ?? new Error(status)));
        } else if (status === 'CLOSED') {
          setRealtimeStatus((current) => (current === 'error' ? current : 'closed'));
        }
      });

    return () => {
      isCurrent = false;
      void supabase.removeChannel(channel);
    };
  }, [authUserId, realtimeReconnectToken]);

  const retryRealtime = () => {
    if (!authUserId) {
      return;
    }

    setRealtimeStatus('reconnecting');
    setRealtimeError(null);
    setRealtimeReconnectToken((token) => token + 1);
  };

  // Single, provider-level AppState listener (MessagesProvider is mounted exactly once at the
  // app root, so this is the only such listener that ever exists).
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const subscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground = /inactive|background/.test(appStateRef.current) && nextState === 'active';
      appStateRef.current = nextState;

      if (!cameToForeground || !authUserId) {
        return;
      }

      if (realtimeStatusRef.current !== 'subscribed') {
        retryRealtime();
      }

      refreshRemoteConversations();

      if (activeConversationIdRef.current) {
        loadRemoteMessages(activeConversationIdRef.current);
      }
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  const getOrCreateDirectConversation = async (
    input: NewRemoteConversationInput,
  ): Promise<{ conversationId: string | null; error: string | null }> => {
    if (!authUserId) {
      return { conversationId: null, error: NOT_SIGNED_IN_ERROR };
    }

    if (inFlightGetOrCreateOtherUserIds.current.has(input.otherUserId)) {
      return { conversationId: null, error: null };
    }

    inFlightGetOrCreateOtherUserIds.current.add(input.otherUserId);

    try {
      const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { p_other_user_id: input.otherUserId });

      if (error) {
        return { conversationId: null, error: mapMessageError(error) };
      }

      const row = data as SupabaseConversationRow;

      setRemoteConversations((current) => {
        if (current.some((conversation) => conversation.id === row.id)) {
          return current;
        }

        return [mapSupabaseConversationToConversation(row, [authUserId, input.otherUserId], '', 0), ...current];
      });

      // Guarantees eventual full consistency (correct preview/unread) even for a reused
      // conversation this session hadn't loaded yet — a single, bounded resync, not a loop.
      refreshRemoteConversations();

      return { conversationId: row.id, error: null };
    } finally {
      inFlightGetOrCreateOtherUserIds.current.delete(input.otherUserId);
    }
  };

  const sendRemoteMessage = async (input: NewRemoteMessageInput): Promise<{ error: string | null }> => {
    if (!authUserId) {
      return { error: NOT_SIGNED_IN_ERROR };
    }

    const trimmedContent = input.content.trim();

    if (!trimmedContent) {
      return { error: 'Bitte gib eine Nachricht ein.' };
    }

    if (trimmedContent.length > MESSAGE_CONTENT_MAX_LENGTH) {
      return { error: `Deine Nachricht darf höchstens ${MESSAGE_CONTENT_MAX_LENGTH} Zeichen lang sein.` };
    }

    if (inFlightSendConversationIds.current.has(input.conversationId)) {
      return { error: null };
    }

    inFlightSendConversationIds.current.add(input.conversationId);

    try {
      const payload: Record<string, unknown> = {
        conversation_id: input.conversationId,
        sender_id: authUserId,
        content: trimmedContent,
      };

      if (input.reference) {
        payload.reference_type = clientReferenceTypeToDb(input.reference.type);
        payload.reference_id = input.reference.id;
        payload.reference_title = input.reference.title;
      }

      const { data, error } = await supabase.from('messages').insert(payload).select(MESSAGES_SELECT_COLUMNS).single();

      if (error) {
        return { error: mapMessageError(error) };
      }

      const newMessage = mapSupabaseMessageToMessage(data as SupabaseMessageRow);

      setRemoteMessagesByConversationId((current) => ({
        ...current,
        [input.conversationId]: [...(current[input.conversationId] ?? []), newMessage],
      }));

      setRemoteConversations((current) =>
        current.map((conversation) =>
          conversation.id === input.conversationId
            ? {
                ...conversation,
                lastMessageText: newMessage.text,
                lastMessageAt: newMessage.createdAt,
                lastMessageAtIso: newMessage.createdAtIso,
              }
            : conversation,
        ),
      );

      return { error: null };
    } finally {
      inFlightSendConversationIds.current.delete(input.conversationId);
    }
  };

  const markRemoteConversationRead = async (conversationId: string): Promise<void> => {
    if (!authUserId) {
      return;
    }

    setRemoteConversations((current) =>
      current.map((conversation) => (conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation)),
    );

    await supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', authUserId);
  };

  const conversations = useMemo(() => {
    const remoteSorted = [...remoteConversations].sort((a, b) => getConversationTimeMs(b) - getConversationTimeMs(a));
    const seenIds = new Set<string>();
    const merged: Conversation[] = [];

    for (const conversation of [...remoteSorted, ...localConversations]) {
      if (seenIds.has(conversation.id)) continue;
      seenIds.add(conversation.id);
      merged.push(conversation);
    }

    return merged;
  }, [remoteConversations, localConversations]);

  const unreadConversationCount = useMemo(() => conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0), [conversations]);

  const getConversationById = (id: string) => conversations.find((conversation) => conversation.id === id);

  const getMessagesForConversation = (conversationId: string): Message[] => {
    const conversation = getConversationById(conversationId);

    if (conversation?.source === 'supabase') {
      return remoteMessagesByConversationId[conversationId] ?? [];
    }

    return localMessages.filter((message) => message.conversationId === conversationId);
  };

  const getMessageById = (messageId: string): Message | undefined => {
    const localMatch = localMessages.find((message) => message.id === messageId);

    if (localMatch) {
      return localMatch;
    }

    for (const messages of Object.values(remoteMessagesByConversationId)) {
      const found = messages.find((message) => message.id === messageId);
      if (found) return found;
    }

    return undefined;
  };

  const getOrCreateConversation = (otherUserId: string, reference: ConversationReference = null): string => {
    const existing = localConversations.find(
      (conversation) =>
        conversation.participantIds.includes(CURRENT_USER_ID) && conversation.participantIds.includes(otherUserId),
    );

    if (existing) {
      return existing.id;
    }

    const newConversation: Conversation = {
      id: `conversation-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      participantIds: [CURRENT_USER_ID, otherUserId],
      reference,
      lastMessageText: '',
      lastMessageAt: 'gerade eben',
      unreadCount: 0,
      createdAt: 'gerade eben',
    };

    setLocalConversations((current) => [newConversation, ...current]);

    return newConversation.id;
  };

  const sendMessage = (conversationId: string, text: string) => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      return;
    }

    const newMessage: Message = {
      id: `message-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      senderId: CURRENT_USER_ID,
      text: trimmedText,
      createdAt: 'gerade eben',
      read: true,
    };

    setLocalMessages((current) => [...current, newMessage]);

    setLocalConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, lastMessageText: trimmedText, lastMessageAt: 'gerade eben' }
          : conversation,
      ),
    );
  };

  const markConversationAsRead = (conversationId: string) => {
    const conversation = getConversationById(conversationId);

    if (conversation?.source === 'supabase') {
      void markRemoteConversationRead(conversationId);
      return;
    }

    setLocalMessages((current) =>
      current.map((message) =>
        message.conversationId === conversationId && message.senderId !== CURRENT_USER_ID ? { ...message, read: true } : message,
      ),
    );

    setLocalConversations((current) =>
      current.map((conversation) => (conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation)),
    );
  };

  const getTotalUnreadCount = () => unreadConversationCount;

  const value = useMemo(
    () => ({
      conversations,
      getConversationById,
      getMessagesForConversation,
      getMessageById,
      getOrCreateConversation,
      sendMessage,
      markConversationAsRead,
      getTotalUnreadCount,
      remoteConversations,
      isRemoteConversationsLoading,
      remoteConversationsError,
      refreshRemoteConversations,
      remoteMessagesByConversationId,
      loadRemoteMessages,
      isRemoteMessagesLoading,
      remoteMessagesError,
      getRemoteParticipantDisplay,
      getOrCreateDirectConversation,
      sendRemoteMessage,
      markRemoteConversationRead,
      unreadConversationCount,
      activeConversationId,
      setActiveConversationId,
      realtimeStatus,
      realtimeError,
      retryRealtime,
    }),
    [
      conversations,
      localMessages,
      remoteConversations,
      isRemoteConversationsLoading,
      remoteConversationsError,
      remoteMessagesByConversationId,
      isRemoteMessagesLoadingByConversationId,
      remoteMessagesErrorByConversationId,
      remoteParticipantProfiles,
      unreadConversationCount,
      authUserId,
      activeConversationId,
      realtimeStatus,
      realtimeError,
    ],
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages() {
  const context = useContext(MessagesContext);

  if (!context) {
    throw new Error('useMessages must be used within a MessagesProvider');
  }

  return context;
}
