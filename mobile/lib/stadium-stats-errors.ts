const GENERIC_ERROR_MESSAGE = 'Die Stadionstatistik konnte nicht geladen werden.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';
const NOT_SET_UP_MESSAGE = 'Diese Funktion ist noch nicht eingerichtet.';

/**
 * Translates Postgrest/Supabase errors from get_user_stadium_stats() into short, user-facing
 * German text. Mirrors lib/stadium-errors.ts's mapStadiumHistoryError exactly.
 */
export function mapStadiumStatsError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[stadium-stats]', rawMessage);
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
