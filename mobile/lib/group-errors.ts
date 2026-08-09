const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NOT_SET_UP_MESSAGE = 'Diese Funktion ist noch nicht eingerichtet.';
const NOT_AUTHORIZED_MESSAGE = 'Du bist nicht berechtigt, diese Aktion auszuführen.';
const BLOCKED_MESSAGE = 'Diese Aktion ist derzeit nicht möglich.';

/**
 * Translates Postgrest/Supabase errors from the group RPCs (join_public_group,
 * request_private_group_join, manage_group_join_request, cancel_group_join_request, leave_group,
 * get_my_groups, get_group_suggestions) into short, user-facing German text. `context` picks the
 * right generic fallback wording. Never surfaces the raw technical message in the UI.
 */
export function mapGroupError(error: unknown, context: 'load' | 'join' | 'request' | 'manage' | 'cancel' | 'leave'): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[group]', rawMessage);
  }

  const genericMessage =
    context === 'load'
      ? 'Die Gruppen konnten nicht geladen werden.'
      : context === 'join'
        ? 'Der Beitritt konnte nicht gespeichert werden.'
        : context === 'request'
          ? 'Die Beitrittsanfrage konnte nicht gesendet werden.'
          : context === 'manage'
            ? 'Die Anfrage konnte nicht bearbeitet werden.'
            : context === 'cancel'
              ? 'Die Anfrage konnte nicht zurückgezogen werden.'
              : 'Die Gruppe konnte nicht verlassen werden.';

  if (!message) {
    return genericMessage;
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('blocked:')) {
    return BLOCKED_MESSAGE;
  }

  if (message.includes('group not found')) {
    return 'Diese Gruppe ist nicht mehr verfügbar.';
  }

  if (message.includes('group is private')) {
    return 'Diese Gruppe ist privat. Du kannst nur eine Beitrittsanfrage senden.';
  }

  if (message.includes('group is public')) {
    return 'Diese Gruppe ist öffentlich. Du kannst direkt beitreten.';
  }

  if (message.includes('already a member')) {
    return 'Du bist bereits Mitglied dieser Gruppe.';
  }

  if (message.includes('request already exists')) {
    return 'Du hast bereits eine offene Anfrage für diese Gruppe gesendet.';
  }

  if (message.includes('request not found')) {
    return 'Diese Anfrage ist nicht mehr verfügbar.';
  }

  if (message.includes('request already reviewed')) {
    return 'Diese Anfrage wurde bereits bearbeitet.';
  }

  if (message.includes('not a group admin') || message.includes('row-level security') || message.includes('permission denied')) {
    return NOT_AUTHORIZED_MESSAGE;
  }

  if (message.includes('owner cannot leave the group')) {
    return 'Als Gruppenadmin kannst du die Gruppe derzeit nicht verlassen.';
  }

  if (message.includes('not a member')) {
    return 'Du bist kein Mitglied dieser Gruppe.';
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
