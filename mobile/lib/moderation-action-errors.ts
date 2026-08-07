const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NOT_SET_UP_MESSAGE = 'Diese Funktion ist noch nicht eingerichtet.';
const NOT_AUTHORIZED_MESSAGE = 'Du bist nicht berechtigt, diese Aktion auszuführen.';

/**
 * Translates Postgrest/Supabase errors from apply_report_action/restore_restricted_content/
 * acknowledge_user_warning into short, user-facing German text. `context` picks the right generic
 * fallback wording. Never surfaces the raw technical message in the UI.
 */
export function mapModerationActionError(error: unknown, context: 'action' | 'restore' | 'warning' | 'acknowledge' | 'load'): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[moderation-action]', rawMessage);
  }

  const genericMessage =
    context === 'restore'
      ? 'Der Inhalt konnte nicht wiederhergestellt werden.'
      : context === 'acknowledge'
        ? 'Die Verwarnung konnte nicht aktualisiert werden.'
        : context === 'warning'
          ? 'Die Verwarnung konnte nicht gespeichert werden.'
          : context === 'load'
            ? 'Die ausgeblendeten Inhalte konnten nicht geladen werden.'
            : 'Die Moderationsmaßnahme konnte nicht gespeichert werden.';

  if (!message) {
    return genericMessage;
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (
    message.includes('not a moderator') ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('not authorized')
  ) {
    return NOT_AUTHORIZED_MESSAGE;
  }

  if (message.includes('report not found') || message.includes('already actioned')) {
    return 'Diese Meldung wurde bereits bearbeitet.';
  }

  if (message.includes('cannot be globally hidden')) {
    return 'Dieser Inhalt kann nicht global moderiert werden.';
  }

  if (message.includes('already hidden')) {
    return 'Dieser Inhalt wurde bereits ausgeblendet.';
  }

  if (message.includes('target not found')) {
    return 'Dieser Inhalt ist nicht mehr verfügbar.';
  }

  if (message.includes('cannot warn yourself')) {
    return 'Du kannst dich nicht selbst verwarnen.';
  }

  if (message.includes('restriction not found')) {
    return 'Dieser Inhalt ist nicht mehr verfügbar.';
  }

  if (message.includes('restriction already lifted')) {
    return 'Dieser Inhalt ist bereits wiederhergestellt.';
  }

  if (message.includes('warning not found')) {
    return 'Diese Verwarnung ist nicht mehr verfügbar.';
  }

  if (message.includes('too long')) {
    return 'Bitte kürze deinen Text.';
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
