const GENERIC_ERROR_MESSAGE = 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.';
const NETWORK_ERROR_MESSAGE = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.';

/**
 * Translates known Supabase Auth error messages into short, user-facing German text.
 * Never surfaces the raw technical message or a stack trace in the UI.
 */
export function mapAuthError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const message = rawMessage.toLowerCase();

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('invalid login credentials')) {
    return 'E-Mail-Adresse oder Passwort ist falsch.';
  }

  if (message.includes('user already registered') || message.includes('already registered')) {
    return 'Diese E-Mail-Adresse ist bereits registriert.';
  }

  if (message.includes('email not confirmed')) {
    return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
  }

  if (message.includes('password') && (message.includes('short') || message.includes('at least') || message.includes('6 characters'))) {
    return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  }

  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Zu viele Versuche. Bitte versuche es später erneut.';
  }

  if (message.includes('email') && (message.includes('invalid') || message.includes('valid email'))) {
    return 'Bitte gib eine gültige E-Mail-Adresse ein.';
  }

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to connect') ||
    message.includes('timeout')
  ) {
    return NETWORK_ERROR_MESSAGE;
  }

  return GENERIC_ERROR_MESSAGE;
}
