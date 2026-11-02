// Shrink — and where necessary convert — a photograph in the browser before it
// is uploaded.
//
// WHY THIS EXISTS
// Evidence is required on every grade dispute, and almost every student will
// photograph a returned paper on a phone. Two things go wrong without help:
//
//   Size    A modern phone photo is routinely 4-8 MB, over the evidence limit.
//           Telling a student to shrink it is useless advice on a phone.
//   Format  iPhones save HEIC by default, which no major browser can display
//           and which the system therefore cannot show to a reviewer.
//
// Both are fixed here rather than explained to the user.
//
// HOW HEIC IS HANDLED WITHOUT A LIBRARY
// HEIC only ever comes from Apple devices, and Apple devices can decode it --
// Safari reads HEIC, and on iOS every browser is WebKit underneath. So the
// device that creates the problem is the device that can solve it, and a
// canvas round-trip is enough. A decoding library would add megabytes of WASM
// to serve the rare leftover case: a HEIC copied to a Windows PC and uploaded
// through Chrome. That case falls back to a clear message instead.
//
// This never returns something unusable: any failure returns the original file
// and lets the validator speak. A resize problem must not become an upload
// problem.

const DEFAULT_MAX_EDGE = 2000;
const DEFAULT_QUALITY = 0.85;

const HEIC_TYPES = ['image/heic', 'image/heif'];

export const isHeic = (file) => {
  const type = (file?.type || '').toLowerCase();
  if (HEIC_TYPES.includes(type)) return true;
  return /\.(heic|heif)$/i.test(file?.name || '');
};

const looksLikeImage = (file) => {
  const type = (file?.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  // File managers sometimes report no type at all; the extension is then the
  // only thing left to go on, and a real photo should still be processed.
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file?.name || '');
};

/**
 * Decode to something canvas can draw.
 *
 * Two strategies on purpose. createImageBitmap is faster and applies EXIF
 * rotation, but its HEIC support varies even on Safari; an <img> element is the
 * older, broader path. Trying both is the difference between "works on iPhone"
 * and "works on some iPhones".
 */
async function decodeImage(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
  } catch {
    // Fall through to the <img> path.
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = url;
    });
    if (img.decode) {
      try { await img.decode(); } catch { /* already loaded; onload was enough */ }
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url)
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export async function downscaleImage(file, { maxEdge = DEFAULT_MAX_EDGE, quality = DEFAULT_QUALITY } = {}) {
  if (!file || !looksLikeImage(file)) return file;

  const heic = isHeic(file);
  const decoded = await decodeImage(file);

  // Could not decode: a HEIC on a non-Apple browser, or a corrupt file. Hand
  // back the original and let describeEvidenceFile() explain it properly.
  if (!decoded) return file;

  try {
    const longest = Math.max(decoded.width, decoded.height);
    if (!longest) return file;

    const scale = Math.min(1, maxEdge / longest);
    const width = Math.round(decoded.width * scale);
    const height = Math.round(decoded.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(decoded.source, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;

    // HEIC compresses far better than JPEG, so the converted file is often
    // LARGER than the original. Returning the original on that basis would
    // hand back a file nothing can display -- for a format conversion, size is
    // not the point. The size guard applies only when the input was already in
    // a format we accept.
    if (!heic && blob.size >= file.size) return file;

    const renamed = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], renamed, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    decoded.release?.();
  }
}
