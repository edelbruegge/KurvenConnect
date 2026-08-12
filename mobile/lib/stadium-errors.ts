const GENERIC_ERROR_MESSAGE = 'Deine Stadionkarte konnte nicht geladen werden.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';
const NOT_SET_UP_MESSAGE = 'Diese Funktion ist noch nicht eingerichtet.';

/**
 * Translates Postgrest/Supabase errors from get_my_visited_stadiums()/get_my_matchday_history()
 * into short, user-facing German text. Never surfaces the raw technical message in the UI.
 */
export function mapStadiumHistoryError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[stadium-history]', rawMessage);
  }

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return NOT_SET_UP_MESSAGE;
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

  return GENERIC_ERROR_MESSAGE;
}
