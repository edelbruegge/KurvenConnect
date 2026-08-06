const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NOT_SET_UP_MESSAGE = 'Diese Funktion ist noch nicht eingerichtet.';

/**
 * Translates Postgrest/Supabase errors from public.user_blocks inserts/deletes into short,
 * user-facing German text. `action` picks the right generic fallback wording — never surfaces
 * the raw technical message, and never reveals which direction a block exists in.
 */
export function mapBlockError(error: unknown, action: 'block' | 'unblock'): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[blocks]', rawMessage);
  }

  const genericMessage = action === 'block' ? 'Der Nutzer konnte nicht blockiert werden.' : 'Die Blockierung konnte nicht aufgehoben werden.';

  if (!message) {
    return genericMessage;
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
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
