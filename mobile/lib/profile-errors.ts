const GENERIC_ERROR_MESSAGE = 'Dein Profil konnte nicht geladen werden. Bitte versuche es erneut.';
const NETWORK_ERROR_MESSAGE = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.';

/**
 * Translates Postgrest/Supabase errors from `profiles` queries into short, user-facing
 * German text. Never surfaces the raw technical message in the UI.
 */
export function mapProfileError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return 'Du bist nicht berechtigt, dieses Profil zu ändern.';
  }

  if (message.includes('network') || message.includes('fetch') || message.includes('failed to connect') || message.includes('timeout')) {
    return NETWORK_ERROR_MESSAGE;
  }

  return GENERIC_ERROR_MESSAGE;
}
