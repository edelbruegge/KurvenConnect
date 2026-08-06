const GENERIC_ERROR_MESSAGE = 'Push-Benachrichtigungen konnten nicht eingerichtet werden. Bitte versuche es erneut.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NO_SESSION_MESSAGE = 'Bitte melde dich an, um Push-Benachrichtigungen zu aktivieren.';

/**
 * Translates errors from the push-token registration/deactivation RPCs and the underlying
 * expo-notifications calls into short, user-facing German text. Never surfaces a raw token,
 * Postgrest message, or native error string in the UI.
 */
export function mapPushError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[push]', rawMessage);
  }

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('row-level security') || message.includes('permission denied') || message.includes('not authorized')) {
    return 'Du bist nicht berechtigt, diesen Push-Token zu ändern.';
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
    return 'Push-Benachrichtigungen sind auf diesem Server noch nicht eingerichtet.';
  }

  return GENERIC_ERROR_MESSAGE;
}
