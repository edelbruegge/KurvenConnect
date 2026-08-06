const GENERIC_ERROR_MESSAGE = 'Das hat leider nicht funktioniert. Bitte versuche es erneut.';
const NETWORK_ERROR_MESSAGE = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.';
const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';

/**
 * Translates Postgrest/Supabase errors from `trips`/`trip_likes`/`trip_requests` queries into
 * short, user-facing German text. Never surfaces the raw technical message in the UI.
 */
export function mapTripError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('row-level security') || message.includes('permission denied') || message.includes('not authorized')) {
    return 'Du bist nicht berechtigt, diese Aktion durchzuführen.';
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('blocked')) {
    return 'Diese Aktion ist derzeit nicht möglich.';
  }

  if (message.includes('trip request not found')) {
    return 'Die Anfrage konnte nicht mehr gefunden werden.';
  }

  if (message.includes('no seats available')) {
    return 'Für diese Fahrt ist kein Platz mehr verfügbar.';
  }

  if (message.includes('no longer pending') || message.includes('can no longer be cancelled')) {
    return 'Der Status der Anfrage hat sich bereits geändert.';
  }

  if (message.includes('duplicate key') || message.includes('already exists')) {
    return 'Du hast diese Fahrt bereits angefragt oder geliked.';
  }

  if (message.includes('seats_available')) {
    return 'Bitte gib eine gültige Anzahl freier Plätze ein.';
  }

  if ((message.includes('foreign key') && message.includes('trip_id')) || message.includes('trip not found')) {
    return 'Diese Fahrt existiert nicht mehr.';
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
    return 'Diese Funktion ist noch nicht eingerichtet. Bitte versuche es später erneut.';
  }

  return GENERIC_ERROR_MESSAGE;
}
