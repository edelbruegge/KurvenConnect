const GENERIC_ERROR_MESSAGE = 'Das hat leider nicht funktioniert. Bitte versuche es erneut.';
const NETWORK_ERROR_MESSAGE = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.';
const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';

/**
 * Translates Postgrest/Supabase errors from `user_follows` queries into short, user-facing
 * German text. Never surfaces the raw technical message in the UI.
 */
export function mapFollowError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  // A blocked-in-either-direction follow attempt fails the INSERT's own RLS check (WITH CHECK
  // ... not are_users_blocked(...)) -- Postgrest reports that as a generic row-level security
  // violation, same text as "not authorized" below, so this branch is what actually surfaces the
  // specific, understandable message for that case.
  if (message.includes('row-level security') || message.includes('permission denied') || message.includes('not authorized')) {
    return 'Diese Aktion ist derzeit nicht möglich.';
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('duplicate key') || message.includes('already exists')) {
    return 'Du folgst diesem Nutzer bereits.';
  }

  if (message.includes('foreign key') || message.includes('not found')) {
    return 'Dieses Profil existiert nicht mehr.';
  }

  if (message.includes('network') || message.includes('fetch') || message.includes('failed to connect') || message.includes('timeout')) {
    return NETWORK_ERROR_MESSAGE;
  }

  if (
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('could not find the table') ||
    (message.includes('function') && message.includes('does not exist'))
  ) {
    return 'Diese Funktion ist noch nicht eingerichtet. Bitte versuche es später erneut.';
  }

  return GENERIC_ERROR_MESSAGE;
}
