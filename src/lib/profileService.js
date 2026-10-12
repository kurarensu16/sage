import { supabase } from './supabase';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const AVATAR_EDGE = 512;

// Mirrors update_own_contact_number: returns +639XXXXXXXXX, null for empty, or undefined if invalid.
export function normalizeContactNumber(value) {
  const digits = String(value ?? '').replace(/[\s()-]/g, '');
  if (!digits) return null;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\+639\d{9}$/.test(digits)) return digits;
  return undefined;
}

// +639171234567 -> 0917 123 4567
export function formatContactNumber(value) {
  if (!value || !/^\+639\d{9}$/.test(value)) return value || '';
  const local = `0${value.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

export async function updateContactNumber(value) {
  const { data, error } = await supabase.rpc('update_own_contact_number', { p_contact_number: value ?? '' });
  if (error) throw error;
  return data;
}

export async function getAvatarUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}

// Center-crops to a square and scales to 512px so phone photos stay well under the limit.
async function prepareAvatar(file) {
  if (!AVATAR_TYPES.includes(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_EDGE;
  canvas.height = AVATAR_EDGE;
  canvas.getContext('2d').drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, AVATAR_EDGE, AVATAR_EDGE
  );
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('This image could not be processed. Try a different photo.');
  if (blob.size > AVATAR_MAX_BYTES) throw new Error('The photo must be 2 MB or smaller.');
  return blob;
}

export async function uploadAvatar(userId, file, previousPath = null) {
  const blob = await prepareAvatar(file);
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;
  try {
    await setAvatarPath(path);
  } catch (err) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    throw err;
  }
  if (previousPath && previousPath !== path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
  }
  return path;
}

export async function removeAvatar(currentPath) {
  await setAvatarPath(null);
  if (currentPath) await supabase.storage.from(AVATAR_BUCKET).remove([currentPath]);
}

async function setAvatarPath(path) {
  const { error } = await supabase.rpc('set_own_avatar_path', { p_avatar_path: path });
  if (error) throw error;
}
