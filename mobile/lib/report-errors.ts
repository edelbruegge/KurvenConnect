const GENERIC_ERROR_MESSAGE = 'Der Inhalt konnte nicht gemeldet werden.';
const NO_SESSION_MESSAGE = 'Bitte melde dich an, um das zu tun.';
const NETWORK_ERROR_MESSAGE = 'Bitte prüfe deine Internetverbindung.';
const NOT_SET_UP_MESSAGE = 'Diese Funktion ist noch nicht eingerichtet.';

/**
 * Translates Postgrest/Supabase errors from the create_report RPC into short, user-facing German
 * text. Never surfaces the raw technical message in the UI.
 */
export function mapReportError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (__DEV__) {
    console.error('[reports]', rawMessage);
  }

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('already reported') || message.includes('duplicate key') || message.includes('reports_unique_pending_target')) {
    return 'Du hast diesen Inhalt bereits gemeldet.';
  }

  if (message.includes('target not found') || message.includes('invalid target type') || message.includes('target id is required')) {
    return 'Der Inhalt ist nicht mehr verfügbar.';
  }

  if (message.includes('cannot report your own content')) {
    return 'Diese Aktion ist derzeit nicht möglich.';
  }

  if (message.includes('row-level security') || message.includes('permission denied') || message.includes('not authorized')) {
    return 'Diese Aktion ist derzeit nicht möglich.';
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

  return GENERIC_ERROR_MESSAGE;
}
