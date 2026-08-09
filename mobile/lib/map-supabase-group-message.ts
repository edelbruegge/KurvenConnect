import type { GroupMessage } from '@/data/groups';
import { formatRelativeGermanTime } from '@/lib/map-supabase-post';

// A raw row from public.group_messages (send_group_message()/get_group_messages()). Sender display
// info is resolved separately via GroupsContext's groupMembers/a batch profiles fetch, same pattern
// used everywhere else in this project — never embedded in the RPC response.
export type SupabaseGroupMessageRow = {
  id: string;
  group_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  client_message_id: string | null;
};

export function mapSupabaseGroupMessageRow(row: SupabaseGroupMessageRow): GroupMessage {
  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    text: row.body,
    createdAt: formatRelativeGermanTime(row.created_at),
    createdAtIso: row.created_at,
    clientMessageId: row.client_message_id ?? undefined,
    source: 'supabase',
  };
}
