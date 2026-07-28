import React, { createContext, useContext, useMemo, useState } from 'react';

import {
  seedConversations,
  seedMessages,
  type Conversation,
  type ConversationReference,
  type Message,
} from '@/data/messages';
import { CURRENT_USER_ID } from '@/data/users';

type MessagesContextValue = {
  conversations: Conversation[];
  getConversationById: (id: string) => Conversation | undefined;
  getMessagesForConversation: (conversationId: string) => Message[];
  getOrCreateConversation: (otherUserId: string, reference?: ConversationReference) => string;
  sendMessage: (conversationId: string, text: string) => void;
  markConversationAsRead: (conversationId: string) => void;
  getTotalUnreadCount: () => number;
};

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>(seedConversations);
  const [messages, setMessages] = useState<Message[]>(seedMessages);

  const getConversationById = (id: string) => conversations.find((conversation) => conversation.id === id);

  const getMessagesForConversation = (conversationId: string) =>
    messages.filter((message) => message.conversationId === conversationId);

  const getOrCreateConversation = (otherUserId: string, reference: ConversationReference = null): string => {
    const existing = conversations.find(
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

    setConversations((current) => [newConversation, ...current]);

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

    setMessages((current) => [...current, newMessage]);

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, lastMessageText: trimmedText, lastMessageAt: 'gerade eben' }
          : conversation,
      ),
    );
  };

  const markConversationAsRead = (conversationId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.conversationId === conversationId && message.senderId !== CURRENT_USER_ID
          ? { ...message, read: true }
          : message,
      ),
    );

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    );
  };

  const getTotalUnreadCount = () => conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  const value = useMemo(
    () => ({
      conversations,
      getConversationById,
      getMessagesForConversation,
      getOrCreateConversation,
      sendMessage,
      markConversationAsRead,
      getTotalUnreadCount,
    }),
    [conversations, messages],
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
