const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NOT_SET_UP_MESSAGE = 'Diese Funktion ist noch nicht eingerichtet.';
const NOT_AUTHORIZED_MESSAGE = 'Du bist nicht berechtigt, diesen Bereich zu öffnen.';

/**
 * Translates Postgrest/Supabase errors from is_current_user_moderator/get_moderation_reports/
 * review_report into short, user-facing German text. `context` picks the right generic fallback
 * wording. Never surfaces the raw technical message in the UI.
 */
export function mapModerationError(error: unknown, context: 'load' | 'review'): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[moderation]', rawMessage);
  }

  const genericMessage = context === 'load' ? 'Die Meldungen konnten nicht geladen werden.' : 'Die Moderationsentscheidung konnte nicht gespeichert werden.';

  if (!message) {
    return genericMessage;
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (
    message.includes('not a moderator') ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('not authorized')
  ) {
    return NOT_AUTHORIZED_MESSAGE;
  }

  if (message.includes('report not found')) {
    return 'Diese Meldung ist nicht mehr verfügbar.';
  }

  if (message.includes('already reviewed')) {
    return 'Diese Meldung wurde bereits bearbeitet.';
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
