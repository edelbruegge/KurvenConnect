const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NOT_SET_UP_MESSAGE = 'Diese Funktion ist noch nicht eingerichtet.';
const NOT_AUTHORIZED_MESSAGE = 'Du bist nicht berechtigt, diese Aktion auszuführen.';
const BLOCKED_MESSAGE = 'Diese Aktion ist derzeit nicht möglich.';

/**
 * Translates Postgrest/Supabase errors from the group RPCs (create_group, join_public_group,
 * request_private_group_join, manage_group_join_request, cancel_group_join_request, leave_group,
 * get_my_groups, get_group_suggestions, get_group_detail, update_group, remove_group_member,
 * promote_group_member, demote_group_admin, transfer_group_ownership) into short, user-facing
 * German text. `context` picks the right generic fallback wording. Never surfaces the raw
 * technical message in the UI.
 */
export function mapGroupError(
  error: unknown,
  context:
    | 'load'
    | 'create'
    | 'join'
    | 'request'
    | 'manage'
    | 'cancel'
    | 'leave'
    | 'update'
    | 'removeMember'
    | 'promote'
    | 'demote'
    | 'transferOwnership'
    | 'invite'
    | 'respond'
    | 'cancelInvitation',
): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[group]', rawMessage);
  }

  const genericMessage =
    context === 'load'
      ? 'Die Gruppen konnten nicht geladen werden.'
      : context === 'create'
        ? 'Die Gruppe konnte nicht erstellt werden.'
        : context === 'join'
          ? 'Der Beitritt konnte nicht gespeichert werden.'
          : context === 'request'
            ? 'Die Beitrittsanfrage konnte nicht gesendet werden.'
            : context === 'manage'
              ? 'Die Anfrage konnte nicht bearbeitet werden.'
              : context === 'cancel'
                ? 'Die Anfrage konnte nicht zurückgezogen werden.'
                : context === 'leave'
                  ? 'Die Gruppe konnte nicht verlassen werden.'
                  : context === 'update'
                    ? 'Die Gruppe konnte nicht aktualisiert werden.'
                    : context === 'removeMember'
                      ? 'Das Mitglied konnte nicht entfernt werden.'
                      : context === 'promote' || context === 'demote'
                        ? 'Die Adminrechte konnten nicht geändert werden.'
                        : context === 'transferOwnership'
                          ? 'Die Gruppeninhaberschaft konnte nicht übertragen werden.'
                          : context === 'invite'
                            ? 'Die Einladung konnte nicht gesendet werden.'
                            : context === 'respond'
                              ? 'Die Einladung konnte nicht bearbeitet werden.'
                              : 'Die Einladung konnte nicht zurückgezogen werden.';

  if (!message) {
    return genericMessage;
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('blocked:')) {
    return BLOCKED_MESSAGE;
  }

  if (message.includes('invalid name') || message.includes('name too long')) {
    return 'Bitte gib einen gültigen Gruppennamen ein.';
  }

  if (message.includes('description too long')) {
    return 'Die Beschreibung ist zu lang.';
  }

  if (message.includes('invalid visibility')) {
    return 'Bitte wähle eine gültige Sichtbarkeit.';
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

  if (message.includes('cannot invite yourself')) {
    return 'Du kannst dich nicht selbst einladen.';
  }

  if (message.includes('invitee not found')) {
    return 'Dieser Nutzer wurde nicht gefunden.';
  }

  if (message.includes('invitation already pending')) {
    return 'Dieser Nutzer wurde bereits eingeladen.';
  }

  if (message.includes('invitation not found')) {
    return 'Diese Einladung ist nicht mehr verfügbar.';
  }

  if (message.includes('invitation already resolved')) {
    return 'Diese Einladung wurde bereits bearbeitet.';
  }

  if (message.includes('invalid response')) {
    return 'Ungültige Antwort auf die Einladung.';
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

  if (
    message.includes('not a group admin') ||
    message.includes('not the group owner') ||
    message.includes('not authorized') ||
    message.includes('row-level security') ||
    message.includes('permission denied')
  ) {
    return NOT_AUTHORIZED_MESSAGE;
  }

  if (message.includes('owner cannot leave the group')) {
    return 'Als Gruppenadmin kannst du die Gruppe derzeit nicht verlassen.';
  }

  if (message.includes('cannot remove owner')) {
    return 'Der Gruppeninhaber kann nicht entfernt werden.';
  }

  if (message.includes('cannot demote owner') || message.includes('target is owner')) {
    return 'Der Gruppeninhaber kann nicht verändert werden.';
  }

  if (message.includes('use leave_group instead') || message.includes('cannot transfer to yourself')) {
    return 'Diese Aktion ist für dich selbst nicht möglich.';
  }

  if (message.includes('target already admin')) {
    return 'Dieses Mitglied ist bereits Admin.';
  }

  if (message.includes('target not admin')) {
    return 'Dieses Mitglied ist kein Admin.';
  }

  if (message.includes('target not a member')) {
    return 'Dieses Mitglied ist nicht mehr Teil der Gruppe.';
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
