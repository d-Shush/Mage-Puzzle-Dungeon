import { IMAGE_MAX } from '../core/catalog';
import { fail, ok, type Result } from '../core/types';

/** Side of the square picture stored with a room, in pixels. */
const SIZE = 320;

/**
 * Turn a picked file into a small square JPEG data URL: centre-cropped to a
 * square and scaled down to SIZE px, so it fits a room tile and keeps the
 * save file (and cloud sync) small.
 */
export async function loadRoomImage(file: File): Promise<Result<string>> {
  if (!file.type.startsWith('image/')) return fail(`${file.name} is not an image`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return fail(`${file.name} could not be read as an image`);
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    if (!side) return fail(`${file.name} is empty`);
    const out = Math.min(SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fail('This browser cannot resize images');
    // Dark backdrop for transparent pictures (JPEG has no transparency).
    ctx.fillStyle = '#0e0a14';
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
    for (const quality of [0.85, 0.7, 0.5]) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= IMAGE_MAX) return ok(url);
    }
    return fail(`${file.name} is too detailed to store. Try a simpler picture.`);
  } finally {
    bitmap.close();
  }
}
