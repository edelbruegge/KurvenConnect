import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { mapPostMediaError } from '@/lib/post-media-errors';
import { supabase } from '@/lib/supabase';

export const POST_MEDIA_BUCKET = 'post-media';
export const MAX_POST_IMAGES = 4;
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// Longest edge a post image is ever stored at. 1600px already fills a typical phone screen width
// several times over -- comfortably "good resolution" for a feed image people view on a phone,
// while a raw modern smartphone photo (often 3000-4000px+) shrinks by several times over. Aspect
// ratio is always preserved (unlike the square-cropped avatar); a source image already smaller
// than this is only re-compressed, never upscaled.
const MAX_POST_IMAGE_DIMENSION = 1600;
const POST_IMAGE_COMPRESSION_QUALITY = 0.8;

// Signed URLs are refreshed on every load (bulk feed fetch + realtime insert), so this only needs
// to comfortably outlive a single screen visit -- not a long-lived cache lifetime.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type PickedPostImage = {
  uri: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
};

export type PostMediaRow = {
  id: string;
  post_id: string;
  owner_id: string;
  storage_path: string;
  position: number;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

export const POST_MEDIA_SELECT_COLUMNS = 'id, post_id, owner_id, storage_path, position, mime_type, width, height, created_at';

// RFC4122 v4 UUID, used only as a collision-free filename segment for Storage paths -- not a
// security token, so crypto.randomUUID() (native on modern Hermes/all browsers) is preferred when
// present, with a Math.random()-based fallback so this never hard-depends on it being available.
// Avoids adding expo-crypto or a uuid package for this one call site. Exported for reuse by
// lib/avatar-media.ts, which needs the exact same collision-free-filename behavior.
export function generateUuidV4(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Downscales to at most MAX_POST_IMAGE_DIMENSION on the longest edge (aspect ratio preserved, never
 * upscaled) and re-compresses as JPEG -- same purpose and shape as avatar-media.ts's
 * processAvatarImage, minus the square crop. Runs once per picked image, right after picking (same
 * point in the flow avatars already process at), so everything downstream (the 6 MB/format guard
 * above already ran on the original asset; the actual upload always sees the already-shrunk file).
 */
async function processPostImage(image: {
  uri: string;
  width: number | null;
  height: number | null;
}): Promise<{ uri: string; width: number; height: number } | null> {
  try {
    const actions: ImageManipulator.Action[] = [];

    if (image.width && image.height && Math.max(image.width, image.height) > MAX_POST_IMAGE_DIMENSION) {
      const scale = MAX_POST_IMAGE_DIMENSION / Math.max(image.width, image.height);
      actions.push({ resize: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) } });
    }

    const result = await ImageManipulator.manipulateAsync(image.uri, actions, {
      compress: POST_IMAGE_COMPRESSION_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return { uri: result.uri, width: result.width, height: result.height };
  } catch {
    return null;
  }
}

/**
 * Opens the media library picker, limited to still images and to the number of remaining slots
 * (out of MAX_POST_IMAGES). Handles permission requests/denials (with a clear German message, no
 * crash) uniformly for native and web -- on web, expo-image-picker uses a plain `<input
 * type="file">` under the hood and the permission call resolves trivially, no separate branch
 * needed. Assets that fail the MIME-type or size check, or that fail to compress, are dropped with
 * an explanatory message instead of being silently included.
 */
export async function pickPostImages(remainingSlots: number): Promise<{ images: PickedPostImage[]; error: string | null }> {
  if (remainingSlots <= 0) {
    return { images: [], error: null };
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      images: [],
      error:
        Platform.OS === 'web'
          ? 'Der Zugriff auf deine Dateien wurde nicht erlaubt.'
          : 'Der Zugriff auf deine Mediathek wurde nicht erlaubt. Du kannst das in den Geräteeinstellungen ändern.',
    };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remainingSlots,
    quality: 0.8,
  });

  if (result.canceled) {
    return { images: [], error: null };
  }

  const images: PickedPostImage[] = [];
  let hadInvalidAsset = false;

  for (const asset of result.assets.slice(0, remainingSlots)) {
    const mimeType = asset.mimeType ?? '';

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      hadInvalidAsset = true;
      continue;
    }

    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      hadInvalidAsset = true;
      continue;
    }

    const processed = await processPostImage({ uri: asset.uri, width: asset.width || null, height: asset.height || null });

    if (!processed) {
      hadInvalidAsset = true;
      continue;
    }

    // Always JPEG after processing (manipulateAsync's SaveFormat.JPEG above), regardless of the
    // original format -- fileSize is intentionally left null rather than the original asset's
    // now-inaccurate byte count; nothing downstream reads it after this point.
    images.push({
      uri: processed.uri,
      mimeType: 'image/jpeg',
      width: processed.width,
      height: processed.height,
      fileSize: null,
    });
  }

  return {
    images,
    error: hadInvalidAsset ? 'Ein oder mehrere Bilder wurden übersprungen (nicht unterstütztes Format, größer als 6 MB oder ein Fehler bei der Verarbeitung).' : null,
  };
}

/**
 * Uploads one already-picked image to Storage and, only once the upload succeeded, inserts its
 * public.post_media row. Never inserts a row for a file that isn't actually there -- on a
 * mid-flight failure after a successful upload, the just-uploaded object is removed again so no
 * orphaned file is left behind.
 */
export async function uploadPostImage(params: {
  authUserId: string;
  postId: string;
  position: number;
  image: PickedPostImage;
}): Promise<{ mediaRow: PostMediaRow | null; error: string | null }> {
  const { authUserId, postId, position, image } = params;
  const mediaId = generateUuidV4();
  const storagePath = `${authUserId}/${postId}/${mediaId}.${extensionForMimeType(image.mimeType)}`;

  let arrayBuffer: ArrayBuffer;
  try {
    const response = await fetch(image.uri);
    arrayBuffer = await response.arrayBuffer();
  } catch (fetchError) {
    return { mediaRow: null, error: mapPostMediaError(fetchError) };
  }

  const uploadResult = await supabase.storage.from(POST_MEDIA_BUCKET).upload(storagePath, arrayBuffer, {
    contentType: image.mimeType,
    upsert: false,
    // storagePath is a fresh UUID every time (never reused/overwritten -- upsert: false above
    // guarantees that), so this exact URL's content can never change. A 1-year cache lets the
    // device/CDN stop re-downloading an already-seen image on every reload instead of hitting
    // Supabase egress again for identical bytes -- pure bandwidth savings, no staleness risk.
    cacheControl: '31536000',
  });

  if (uploadResult.error) {
    return { mediaRow: null, error: mapPostMediaError(uploadResult.error) };
  }

  const insertResult = await supabase
    .from('post_media')
    .insert({
      post_id: postId,
      owner_id: authUserId,
      storage_path: storagePath,
      position,
      mime_type: image.mimeType,
      width: image.width,
      height: image.height,
    })
    .select(POST_MEDIA_SELECT_COLUMNS)
    .single();

  if (insertResult.error) {
    await removePostMediaFile(storagePath);
    return { mediaRow: null, error: mapPostMediaError(insertResult.error) };
  }

  return { mediaRow: insertResult.data as PostMediaRow, error: null };
}

/** Best-effort deletion of a single Storage object -- used for cleanup paths. Never throws. */
export async function removePostMediaFile(storagePath: string): Promise<void> {
  try {
    await supabase.storage.from(POST_MEDIA_BUCKET).remove([storagePath]);
  } catch {
    // Cleanup is best-effort: a failure here must never surface as a user-facing error on top
    // of whatever original failure triggered it.
  }
}

export async function getPostMediaSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(POST_MEDIA_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return error ? null : data.signedUrl;
}

/** Batched signed-url resolution for N storage paths in a single Storage API call (no N+1). */
export async function getPostMediaSignedUrls(storagePaths: string[]): Promise<Record<string, string>> {
  if (storagePaths.length === 0) {
    return {};
  }

  const { data, error } = await supabase.storage.from(POST_MEDIA_BUCKET).createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    return {};
  }

  const urlByPath: Record<string, string> = {};
  data.forEach((entry) => {
    if (entry.path && entry.signedUrl) {
      urlByPath[entry.path] = entry.signedUrl;
    }
  });
  return urlByPath;
}
