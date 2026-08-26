import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { mapAvatarError } from '@/lib/avatar-errors';
import { generateUuidV4 } from '@/lib/post-media';
import { supabase } from '@/lib/supabase';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_TARGET_SIZE = 512;

export type PickedAvatarImage = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Opens the media library picker for exactly one still image. `allowsEditing`/`aspect: [1, 1]`
 * give a native square-crop UI on platforms that support it (iOS/Android) -- a free UX bonus, but
 * not load-bearing: processAvatarImage() below guarantees an exact 1:1 result regardless, since
 * expo-image-picker's web implementation does not implement allowsEditing/aspect at all (verified
 * in its source -- neither prop is even referenced there), so web needs the guarantee anyway.
 */
export async function pickAvatarImage(): Promise<{ image: PickedAvatarImage | null; error: string | null }> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      image: null,
      error:
        Platform.OS === 'web'
          ? 'Der Zugriff auf deine Dateien wurde nicht erlaubt.'
          : 'Der Zugriff auf deine Mediathek wurde nicht erlaubt. Du kannst das in den Geräteeinstellungen ändern.',
    };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });

  if (result.canceled || result.assets.length === 0) {
    return { image: null, error: null };
  }

  const asset = result.assets[0];
  return { image: { uri: asset.uri, width: asset.width, height: asset.height }, error: null };
}

/**
 * Guarantees a square, reasonably sized, compressed JPEG regardless of what the picker returned
 * (native crop UI may not have run at all on web, and even where it did run, this makes the
 * output deterministic instead of trusting OS-specific crop behavior). Center-crops to the
 * largest possible square first, then resizes to AVATAR_TARGET_SIZE -- never upscales past the
 * source resolution beyond that fixed target, never ships a multi-megapixel phone photo as-is.
 */
export async function processAvatarImage(image: PickedAvatarImage): Promise<{ uri: string | null; error: string | null }> {
  try {
    const size = Math.min(image.width, image.height);
    const originX = Math.round((image.width - size) / 2);
    const originY = Math.round((image.height - size) / 2);

    const result = await ImageManipulator.manipulateAsync(
      image.uri,
      [{ crop: { originX, originY, width: size, height: size } }, { resize: { width: AVATAR_TARGET_SIZE, height: AVATAR_TARGET_SIZE } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );

    return { uri: result.uri, error: null };
  } catch (manipulationError) {
    return { uri: null, error: mapAvatarError(manipulationError) };
  }
}

/** Uploads an already-processed (square, resized, compressed) avatar image and returns its public URL. */
export async function uploadAvatarImage(params: { authUserId: string; uri: string }): Promise<{ url: string | null; error: string | null }> {
  const { authUserId, uri } = params;
  const storagePath = `${authUserId}/${generateUuidV4()}.jpg`;

  let arrayBuffer: ArrayBuffer;
  try {
    const response = await fetch(uri);
    arrayBuffer = await response.arrayBuffer();
  } catch (fetchError) {
    return { url: null, error: mapAvatarError(fetchError) };
  }

  const uploadResult = await supabase.storage.from(AVATAR_BUCKET).upload(storagePath, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: false,
    // Same reasoning as post-media.ts's own upload call: storagePath is a fresh UUID every time
    // (upsert: false guarantees it's never overwritten in place), so this exact URL's content is
    // permanently immutable -- safe to cache for a full year instead of Supabase's 1-hour default,
    // cutting repeated-view egress with zero staleness risk.
    cacheControl: '31536000',
  });

  if (uploadResult.error) {
    return { url: null, error: mapAvatarError(uploadResult.error) };
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
  return { url: data.publicUrl, error: null };
}

/**
 * Reverse-resolves a stored avatar_url back to its Storage path, but only if it genuinely belongs
 * to the given user's own folder in the avatars bucket -- an external URL, another user's avatar,
 * or no avatar at all all safely resolve to null. Used exclusively to clean up the *previous*
 * avatar after a successful replace/remove -- never to derive a path to delete on a guess.
 */
export function extractOwnAvatarStoragePath(url: string | null | undefined, authUserId: string): string | null {
  if (!url) return null;

  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;

  const path = url.slice(markerIndex + marker.length).split('?')[0];
  const ownerSegment = path.split('/')[0];

  return ownerSegment === authUserId ? path : null;
}

/** Best-effort deletion of a single avatar Storage object -- used for cleanup paths. Never throws. */
export async function removeAvatarFile(storagePath: string): Promise<void> {
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([storagePath]);
  } catch {
    // Cleanup is best-effort: a failure here must never surface as a user-facing error on top of
    // whatever already-successful avatar change triggered it (Vorgabe 23).
  }
}
