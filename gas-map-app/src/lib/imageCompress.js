/**
 * Resize & re-encode photos in the browser for faster uploads and smaller API payloads.
 * Falls back to the original file if decode or canvas fails (e.g. some HEIC on desktop).
 */

const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.82;
const TARGET_MAX_BYTES = 900 * 1024; // aim under ~1.2MB base64 for API limits

function stripExtension(name) {
  const n = String(name || 'photo').replace(/\.[^.]+$/, '');
  return n || 'photo';
}

/**
 * @param {File} file
 * @param {{ maxEdge?: number, quality?: number, maxBytes?: number }} [opts]
 * @returns {Promise<File>}
 */
export async function compressImageFile(file, opts = {}) {
  if (!file || typeof file.size !== 'number') return file;
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  let quality = opts.quality ?? DEFAULT_QUALITY;
  const maxBytes = opts.maxBytes ?? TARGET_MAX_BYTES;

  const type = String(file.type || '').toLowerCase();
  if (!type.startsWith('image/')) return file;

  // Tiny JPEGs: skip work
  if (file.size < 180 * 1024 && type === 'image/jpeg') return file;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const { width, height } = bitmap;
      if (width < 2 || height < 2) return file;

      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, w, h);

      let blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      );
      if (!blob) return file;

      // If still large, step down quality a few times
      let attempts = 0;
      while (blob.size > maxBytes && quality > 0.45 && attempts < 5) {
        quality -= 0.08;
        attempts += 1;
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality)
        );
        if (!blob) return file;
      }

      const outName = `${stripExtension(file.name)}.jpg`;
      return new File([blob], outName, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    } finally {
      bitmap.close?.();
    }
  } catch {
    return file;
  }
}
