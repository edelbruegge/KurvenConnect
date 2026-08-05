const GENERIC_ERROR_MESSAGE = 'Das hat leider nicht funktioniert. Bitte versuche es erneut.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';

/**
 * Translates Postgrest/Supabase errors from `conversations`/`conversation_members`/`messages`
 * queries and the `get_or_create_direct_conversation` function into short, user-facing German
 * text. Never surfaces the raw technical message in the UI.
 */
export function mapMessageError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[messages]', rawMessage);
  }

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('row-level security') || message.includes('permission denied') || message.includes('not authorized')) {
    return 'Du bist nicht berechtigt, diese Unterhaltung zu öffnen.';
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('cannot start a conversation with yourself')) {
    return 'Du kannst dir nicht selbst eine Nachricht senden.';
  }

  if (message.includes('other profile not found') || message.includes('own profile not found')) {
    return 'Dieses Profil konnte nicht gefunden werden.';
  }

  if (message.includes('other user is required')) {
    return 'Diese Unterhaltung konnte nicht gestartet werden.';
  }

  if (message.includes('foreign key') && message.includes('conversation_id')) {
    return 'Diese Unterhaltung konnte nicht gefunden werden.';
  }

  if (message.includes('duplicate key') || message.includes('already exists')) {
    return 'Diese Unterhaltung existiert bereits.';
  }

  if (message.includes('content') && (message.includes('check') || message.includes('constraint'))) {
    return 'Die Nachricht konnte nicht gesendet werden.';
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
    return 'Diese Funktion ist noch nicht eingerichtet.';
  }

  return GENERIC_ERROR_MESSAGE;
}

const REALTIME_INTERRUPTED_MESSAGE = 'Die Live-Aktualisierung ist derzeit unterbrochen. Du kannst den Chat weiterhin verwenden.';

/**
 * Translates Supabase Realtime channel/subscription errors (CHANNEL_ERROR, TIMED_OUT, a
 * publication the table hasn't been added to yet, a dropped auth session mid-subscription, ...)
 * into a single short, non-blocking German status message. Never surfaces raw WebSocket/Phoenix
 * details in the UI — those are only logged in development.
 */
export function mapRealtimeError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');

  if (__DEV__) {
    console.error('[messages:realtime]', rawMessage);
  }

  return REALTIME_INTERRUPTED_MESSAGE;
}
