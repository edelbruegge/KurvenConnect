const GENERIC_ERROR_MESSAGE = 'Das Bild konnte nicht hochgeladen werden. Bitte versuche es erneut.';
const NETWORK_ERROR_MESSAGE = 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.';
const NO_SESSION_MESSAGE = 'Bitte melde dich erneut an, um das zu tun.';

/**
 * Translates Supabase Storage / `post_media` errors into short, user-facing German text. Never
 * surfaces the raw technical message in the UI. Mirrors lib/post-errors.ts's shape/style.
 */
export function mapPostMediaError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const message = rawMessage.toLowerCase();

  if (!message) {
    return GENERIC_ERROR_MESSAGE;
  }

  if (message.includes('row-level security') || message.includes('permission denied') || message.includes('not authorized')) {
    return 'Du bist nicht berechtigt, dieses Bild hochzuladen.';
  }

  if (message.includes('jwt') || message.includes('not authenticated') || message.includes('no session')) {
    return NO_SESSION_MESSAGE;
  }

  if (message.includes('exceeded the maximum allowed size') || message.includes('payload too large') || message.includes('file size')) {
    return 'Das Bild ist zu groß (maximal 6 MB pro Bild).';
  }

  if (message.includes('mime type') || message.includes('not supported')) {
    return 'Dieses Bildformat wird nicht unterstützt. Bitte verwende JPEG, PNG oder WebP.';
  }

  if (message.includes('duplicate') || message.includes('already exists')) {
    return 'Dieses Bild wurde bereits hochgeladen.';
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

  if (message.includes('bucket not found')) {
    return 'Der Bild-Speicher ist noch nicht eingerichtet. Bitte versuche es später erneut.';
  }

  return GENERIC_ERROR_MESSAGE;
}
