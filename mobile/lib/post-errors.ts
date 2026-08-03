const GENERIC_ERROR_MESSAGE = 'Das hat leider nicht funktioniert. Bitte versuche es erneut.';
const NETWORK_ERROR_MESSAGE = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.';
const NO_SESSION_MESSAGE = 'Bitte melde dich erneut an, um das zu tun.';

/**
 * Translates Postgrest/Supabase errors from `posts`/`post_comments`/`post_likes` queries
 * into short, user-facing German text. Never surfaces the raw technical message in the UI.
 */
export function mapPostError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return 'Du bist nicht berechtigt, diese Aktion durchzuführen.';
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('duplicate key') || message.includes('already exists')) {
    return 'Das hast du bereits getan.';
  }

  if (message.includes('foreign key') && message.includes('post_id')) {
    return 'Dieser Beitrag existiert nicht mehr.';
  }

  if (message.includes('network') || message.includes('fetch') || message.includes('failed to connect') || message.includes('timeout')) {
    return NETWORK_ERROR_MESSAGE;
  }

  if ((message.includes('relation') && message.includes('does not exist')) || message.includes('could not find the table')) {
    return 'Diese Funktion ist noch nicht eingerichtet. Bitte versuche es später erneut.';
  }

  return GENERIC_ERROR_MESSAGE;
}
