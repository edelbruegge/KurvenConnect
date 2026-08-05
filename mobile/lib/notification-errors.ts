const GENERIC_ERROR_MESSAGE = 'Die Benachrichtigungen konnten nicht geladen werden.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';

/**
 * Translates Postgrest/Supabase errors from `notifications` queries and the
 * `mark_notification_read`/`mark_all_notifications_read` functions into short, user-facing
 * German text. Never surfaces the raw technical message in the UI.
 */
export function mapNotificationError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[notifications]', rawMessage);
  }

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('row-level security') || message.includes('permission denied') || message.includes('not authorized')) {
    return 'Du bist nicht berechtigt, diese Benachrichtigung zu öffnen.';
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('notification not found')) {
    return 'Diese Benachrichtigung konnte nicht gefunden werden.';
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

  return 'Die Benachrichtigung konnte nicht aktualisiert werden.';
}

const REALTIME_INTERRUPTED_MESSAGE = 'Die Live-Aktualisierung ist derzeit unterbrochen.';

/**
 * Translates Supabase Realtime channel/subscription errors for the notifications channel into a
 * single short, non-blocking German status message. Never surfaces raw WebSocket/Phoenix details
 * in the UI — those are only logged in development.
 */
export function mapNotificationRealtimeError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');

  if (__DEV__) {
    console.error('[notifications:realtime]', rawMessage);
  }

  return REALTIME_INTERRUPTED_MESSAGE;
}
