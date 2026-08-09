const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NOT_SET_UP_MESSAGE = 'Diese Funktion ist noch nicht eingerichtet.';
const NOT_MEMBER_MESSAGE = 'Du bist kein Mitglied dieser Gruppe.';
const GROUP_GONE_MESSAGE = 'Diese Gruppe ist nicht mehr verfügbar.';

/**
 * Translates Postgrest/Supabase errors from the group message RPCs (send_group_message,
 * get_group_messages, mark_group_read) into short, user-facing German text. `context` picks the
 * right generic fallback wording. Never surfaces the raw technical message in the UI.
 */
export function mapGroupMessageError(error: unknown, context: 'load' | 'send' | 'markRead'): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[group-messages]', rawMessage);
  }

  const genericMessage =
    context === 'load'
      ? 'Die Nachrichten konnten nicht geladen werden.'
      : context === 'send'
        ? 'Die Nachricht konnte nicht gesendet werden.'
        : 'Der Lesestatus konnte nicht aktualisiert werden.';

  if (!message) {
    return genericMessage;
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('group not found')) {
    return GROUP_GONE_MESSAGE;
  }

  if (message.includes('not a member') || message.includes('row-level security') || message.includes('permission denied')) {
    return NOT_MEMBER_MESSAGE;
  }

  if (message.includes('empty message')) {
    return 'Bitte gib eine Nachricht ein.';
  }

  if (message.includes('message too long')) {
    return 'Deine Nachricht ist zu lang (max. 2000 Zeichen).';
  }

  if (message.includes('network') || message.includes('fetch') || message.includes('failed to connect') || message.includes('timeout')) {
    return NETWORK_ERROR_MESSAGE;
  }

  if (
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('could not find the table') ||
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist'))
  ) {
    return NOT_SET_UP_MESSAGE;
  }

  return genericMessage;
}
