const GENERIC_ERROR_MESSAGE = 'Das hat leider nicht funktioniert. Bitte versuche es erneut.';
const NETWORK_ERROR_MESSAGE = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.';
const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';

/**
 * Translates Postgrest/Supabase errors from `meetups`/`meetup_likes`/`meetup_attendees`
 * queries and the `join_meetup`/`leave_meetup` functions into short, user-facing German text.
 * Never surfaces the raw technical message in the UI.
 */
export function mapMeetupError(error: unknown): string {
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

  if (message.includes('meetup not found')) {
    return 'Dieser Treffpunkt existiert nicht mehr.';
  }

  if (message.includes('organizer cannot join')) {
    return 'Als Organisator kannst du deinem eigenen Treffpunkt nicht beitreten.';
  }

  if (message.includes('already attending')) {
    return 'Du nimmst bereits an diesem Treffpunkt teil.';
  }

  if (message.includes('fully booked')) {
    return 'Dieser Treffpunkt ist bereits ausgebucht.';
  }

  if (message.includes('not attending this meetup')) {
    return 'Du nimmst an diesem Treffpunkt nicht teil.';
  }

  if (message.includes('duplicate key') || message.includes('already exists')) {
    return 'Du hast diesen Treffpunkt bereits geliked.';
  }

  if (message.includes('max_attendees')) {
    return 'Bitte gib eine gültige maximale Teilnehmerzahl ein.';
  }

  if (message.includes('foreign key') && message.includes('meetup_id')) {
    return 'Dieser Treffpunkt existiert nicht mehr.';
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
