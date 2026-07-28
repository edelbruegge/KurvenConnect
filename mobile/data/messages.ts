import type { FeedPost } from './feed-posts';
import { CURRENT_USER_ID } from './users';

export type ConversationReference =
  | {
      type: 'trip';
      id: string;
      title: string;
    }
  | {
      type: 'meetup';
      id: string;
      title: string;
    }
  | {
      type: 'post';
      id: string;
      title: string;
    }
  | {
      type: 'request';
      id: string;
      title: string;
    }
  | null;

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  read: boolean;
};

export type Conversation = {
  id: string;
  participantIds: string[];
  reference: ConversationReference;
  lastMessageText: string;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
};

export function getConversationReferenceForPost(post: FeedPost): ConversationReference {
  if (post.category === 'Fahrt' && post.tripDetails) {
    return { type: 'trip', id: post.id, title: `${post.tripDetails.departure} → ${post.tripDetails.destination}` };
  }

  if (post.category === 'Treffpunkt' && post.meetupDetails) {
    return { type: 'meetup', id: post.id, title: post.meetupDetails.title };
  }

  if (post.category === 'Gesuch' && post.requestDetails) {
    return { type: 'request', id: post.id, title: post.requestDetails.requestedService };
  }

  const title = post.description.length > 48 ? `${post.description.slice(0, 45)}…` : post.description;
  return { type: 'post', id: post.id, title };
}

export function getOtherParticipantId(conversation: Conversation, currentUserId: string): string | undefined {
  return conversation.participantIds.find((id) => id !== currentUserId);
}

export const seedConversations: Conversation[] = [
  {
    id: 'conversation-1',
    participantIds: [CURRENT_USER_ID, 'user-mina-k'],
    reference: { type: 'meetup', id: '6', title: 'Treffen vor dem Heimspiel' },
    lastMessageText: 'Klingt gut, ich freu mich schon!',
    lastMessageAt: 'vor 8 Min.',
    unreadCount: 1,
    createdAt: 'vor 1 Std.',
  },
  {
    id: 'conversation-2',
    participantIds: [CURRENT_USER_ID, 'user-david-s'],
    reference: { type: 'trip', id: '3', title: 'Münster Hauptbahnhof → Stadionplatz' },
    lastMessageText: 'Perfekt, bis Samstag am Bahnhof.',
    lastMessageAt: 'vor 1 Tag',
    unreadCount: 0,
    createdAt: 'vor 2 Tagen',
  },
];

export const seedMessages: Message[] = [
  {
    id: 'message-1-1',
    conversationId: 'conversation-1',
    senderId: 'user-mina-k',
    text: 'Hi! Kommst du auch zum Treffen vor dem Heimspiel?',
    createdAt: 'vor 20 Min.',
    read: true,
  },
  {
    id: 'message-1-2',
    conversationId: 'conversation-1',
    senderId: CURRENT_USER_ID,
    text: 'Ja klar, bin dabei!',
    createdAt: 'vor 15 Min.',
    read: true,
  },
  {
    id: 'message-1-3',
    conversationId: 'conversation-1',
    senderId: 'user-mina-k',
    text: 'Klingt gut, ich freu mich schon!',
    createdAt: 'vor 8 Min.',
    read: false,
  },
  {
    id: 'message-2-1',
    conversationId: 'conversation-2',
    senderId: CURRENT_USER_ID,
    text: 'Hast du am Samstag noch einen Platz frei?',
    createdAt: 'vor 2 Tagen',
    read: true,
  },
  {
    id: 'message-2-2',
    conversationId: 'conversation-2',
    senderId: 'user-david-s',
    text: 'Ja, passt noch einer rein.',
    createdAt: 'vor 1 Tag',
    read: true,
  },
  {
    id: 'message-2-3',
    conversationId: 'conversation-2',
    senderId: CURRENT_USER_ID,
    text: 'Perfekt, bis Samstag am Bahnhof.',
    createdAt: 'vor 1 Tag',
    read: true,
  },
];
