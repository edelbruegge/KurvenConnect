import type { Conversation, ConversationReference, Message } from '@/data/messages';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

export type SupabaseConversationRow = {
  id: string;
  conversation_type: string;
  direct_key: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type SupabaseConversationMemberRow = {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
};

export type SupabaseMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  reference_type: string | null;
  reference_id: string | null;
  reference_title: string | null;
  created_at: string;
};

type ClientReferenceType = 'post' | 'trip' | 'meetup' | 'request' | 'profile';
type DbReferenceType = 'post' | 'trip' | 'meetup' | 'wanted_entry' | 'profile';

// The client's existing ConversationReference vocabulary (established long before this table
// existed) calls a Gesucht-reference 'request'; the database uses 'wanted_entry' to match the
// public.wanted_entries table name. This is the only place that vocabulary is translated —
// every other part of the app keeps using 'request' exactly as before.
export function clientReferenceTypeToDb(type: ClientReferenceType): DbReferenceType {
  return type === 'request' ? 'wanted_entry' : type;
}

function dbReferenceTypeToClient(type: string): ClientReferenceType | null {
  if (type === 'wanted_entry') return 'request';
  if (type === 'post' || type === 'trip' || type === 'meetup' || type === 'profile') return type;
  return null;
}

export function mapSupabaseMessageToMessage(row: SupabaseMessageRow): Message {
  const clientType = row.reference_type ? dbReferenceTypeToClient(row.reference_type) : null;
  const reference: ConversationReference =
    clientType && row.reference_id && row.reference_title
      ? ({ type: clientType, id: row.reference_id, title: row.reference_title } as ConversationReference)
      : null;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    text: row.content,
    createdAt: formatRelativeGermanTime(row.created_at),
    read: true,
    source: 'supabase',
    reference,
    createdAtIso: row.created_at,
  };
}

export function mapSupabaseConversationToConversation(
  row: SupabaseConversationRow,
  participantIds: [string, string],
  lastMessageText: string,
  unreadCount: number,
): Conversation {
  const lastMessageAtIso = row.last_message_at ?? row.created_at;

  return {
    id: row.id,
    participantIds,
    reference: null,
    lastMessageText,
    lastMessageAt: formatRelativeGermanTime(lastMessageAtIso),
    unreadCount,
    createdAt: formatRelativeGermanTime(row.created_at),
    source: 'supabase',
    lastMessageAtIso,
  };
}

/**
 * Counts messages in `messages` that are unread by `currentUserId`: sent by someone else, and
 * either there is no last-read timestamp yet or the message was created after it.
 */
export function computeUnreadCount(messages: Message[], lastReadAt: string | null, currentUserId: string): number {
  const lastReadMs = lastReadAt ? new Date(lastReadAt).getTime() : null;

  return messages.filter((message) => {
    if (message.senderId === currentUserId || !message.createdAtIso) {
      return false;
    }

    if (lastReadMs === null) {
      return true;
    }

    return new Date(message.createdAtIso).getTime() > lastReadMs;
  }).length;
}
