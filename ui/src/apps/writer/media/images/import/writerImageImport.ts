// STATUS: PLATIN — Bounded, signature-verified Writer image import
import type { WriterImageBlockData } from '../../../../../shared/contracts/workspace';
import { preflightIsolatedImageDecode } from '../../../../../platform/import-sandbox/importExportSandbox';
import { probeMediaBoundary } from '../../../../../platform/media/index';

export type SupportedWriterImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * The image types the import accepts. One definition for the file picker's
 * `accept` attribute, the drop filter and the signature check, so a file cannot
 * be offered by the picker and refused on drop.
 */
export const SUPPORTED_WRITER_IMAGE_MIMES: readonly SupportedWriterImageMime[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** Value for an `<input type="file" accept>` that matches the supported set. */
export const WRITER_IMAGE_ACCEPT_ATTRIBUTE = SUPPORTED_WRITER_IMAGE_MIMES.join(',');

export function isSupportedWriterImageMime(value: string | undefined): value is SupportedWriterImageMime {
  if (!value) return false;
  return (SUPPORTED_WRITER_IMAGE_MIMES as readonly string[]).includes(value);
}

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_DECODE_BYTES = 256 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 24 * 1024 * 1024;
const MAX_OUTPUT_EDGE_PX = 4_096;

/**
 * W-062: the pixel limit is **derived** from the memory budget instead of being a second, unrelated
 * number.
 *
 * The old code carried `MAX_PIXEL_COUNT = 40_000_000` next to `MAX_DECODE_BYTES`; the two could drift
 * apart and neither explained the other. One RGBA frame costs 4 bytes per pixel, and decoding is
 * bounded at 1.5 frames (the decoder's working copy). The pixel limit is therefore exactly what the
 * memory budget allows — change the budget and the limit follows, with no second constant to forget.
 */
const BYTES_PER_RGBA_PIXEL = 4;
const DECODE_WORKING_COPY_FACTOR = 1.5;
const MAX_PIXEL_COUNT = Math.floor(MAX_DECODE_BYTES / (BYTES_PER_RGBA_PIXEL * DECODE_WORKING_COPY_FACTOR));

export class WriterImageImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriterImageImportError';
  }
}

/**
 * The image type a byte sequence really is.
 *
 * `probeMediaBoundary` is the authority, but it refuses an image whose dimensions are
 * not readable yet (`dimension-unavailable-before-decode`). That is right for a
 * *decoder* hand-off and wrong for a **signature check**: a short header can never
 * carry the PNG `IHDR` size (bytes 16…24), and a real JPEG keeps its `SOF0` behind an
 * optional `APP1`/EXIF segment of several kilobytes. Asking the full probe about a
 * truncated header therefore rejected **every real file** (native M7 probe).
 *
 * The fallback checks the magic bytes only and never invents dimensions; it answers
 * the question the envelope check actually asks.
 */
export function detectWriterImageMime(header: Uint8Array): SupportedWriterImageMime | null {
  try {
    const probe = probeMediaBoundary(header);
    return isSupportedWriterImageMime(probe.mimeType) ? probe.mimeType : null;
  } catch {
    if (header.length >= 8
      && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
      && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a) {
      return 'image/png';
    }
    if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return 'image/jpeg';
    }
    if (header.length >= 12
      && header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46
      && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) {
      return 'image/webp';
    }
    return null;
  }
}

export function validateWriterImageEnvelope(
  declaredMime: string,
  sizeBytes: number,
  header: Uint8Array
): SupportedWriterImageMime {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_SOURCE_BYTES) {
    throw new WriterImageImportError('Das Bild muss zwischen 1 Byte und 20 MiB groß sein.');
  }
  const detectedMime = detectWriterImageMime(header);
  if (detectedMime === null) {
    throw new WriterImageImportError('Nur JPEG-, PNG- und WebP-Bilddaten werden unterstützt.');
  }
  // W-061: `File.type` is not guaranteed lower case (`image/PNG` is legal HTTP and happens with
  // hand-built files, drag sources and some OS integrations). The signature check stays strict; only
  // the comparison of the **declared** string becomes case-insensitive. A genuinely different type is
  // still refused, so this does not weaken the check.
  if (declaredMime.toLowerCase() !== detectedMime) {
    throw new WriterImageImportError('Dateityp und Bildsignatur stimmen nicht überein.');
  }
  return detectedMime;
}

export function validateWriterImageDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new WriterImageImportError('Das Bild besitzt ungültige Abmessungen.');
  }
  const pixels = width * height;
  const estimatedDecodeBytes = pixels * 4 * 1.5;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_PIXEL_COUNT || estimatedDecodeBytes > MAX_DECODE_BYTES) {
    throw new WriterImageImportError('Das Bild überschreitet die sichere Pixel- oder Speichergrenze.');
  }
}

function encodeCanvas(canvas: HTMLCanvasElement, mime: SupportedWriterImageMime): Promise<Blob> {
  const outputMime = mime === 'image/png' ? 'image/png' : mime;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new WriterImageImportError('Das Bild konnte nicht sicher neu kodiert werden.'));
          return;
        }
        resolve(blob);
      },
      outputMime,
      outputMime === 'image/png' ? undefined : 0.9
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new WriterImageImportError('Das neu kodierte Bild konnte nicht gelesen werden.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new WriterImageImportError('Das neu kodierte Bild besitzt kein gültiges Datenformat.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function importWriterImage(
  file: File,
  anchorParagraphId?: string
): Promise<WriterImageBlockData> {
  /**
   * Order matters: **size first, then one read of the whole file**.
   *
   * The envelope check used to receive only 16 bytes, which no PNG, JPEG or WebP can
   * satisfy — every real picture was refused with "Nur JPEG-, PNG- und WebP-Bilddaten
   * werden unterstützt." (native M7 probe). The bytes are read once and reused for the
   * signature check and, when the decoder sandbox is unavailable, for the dimension
   * probe.
   */
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_SOURCE_BYTES) {
    throw new WriterImageImportError('Das Bild muss zwischen 1 Byte und 20 MiB groß sein.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedMime = validateWriterImageEnvelope(file.type, file.size, bytes);

  /**
   * The measured size is the fallback when the sandboxed decoder does not answer.
   *
   * In the bundled Tauri/WebView2 window the worker is not guaranteed to come up; the
   * import must still work there. `probeMediaBoundary` reads the real dimensions from
   * the full bytes for PNG and WebP and from the `SOF` marker for JPEG, so the pixel
   * budget stays enforced even on that path.
   */
  let measuredWidth = 0;
  let measuredHeight = 0;
  try {
    const isolated = await preflightIsolatedImageDecode(file);
    measuredWidth = isolated.image_width ?? 0;
    measuredHeight = isolated.image_height ?? 0;
    validateWriterImageDimensions(measuredWidth, measuredHeight);
  } catch (sandboxError: unknown) {
    const probe = probeMediaBoundary(bytes, detectedMime);
    measuredWidth = probe.dimensions?.widthPx ?? 0;
    measuredHeight = probe.dimensions?.heightPx ?? 0;
    validateWriterImageDimensions(measuredWidth, measuredHeight);
    // The sandbox is an extra barrier, not the source of truth: the boundary probe
    // above has already bounded the file and its pixel budget.
    void sandboxError;
  }

  const bitmap = await createImageBitmap(file);

  try {
    validateWriterImageDimensions(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_OUTPUT_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const outputWidth = Math.max(1, Math.round(bitmap.width * scale));
    const outputHeight = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d', { alpha: detectedMime !== 'image/jpeg' });
    if (context === null) {
      throw new WriterImageImportError('Für den Bildimport ist kein sicherer Canvas-Kontext verfügbar.');
    }
    context.drawImage(bitmap, 0, 0, outputWidth, outputHeight);
    const encoded = await encodeCanvas(canvas, detectedMime);
    if (encoded.size <= 0 || encoded.size > MAX_OUTPUT_BYTES) {
      throw new WriterImageImportError('Das neu kodierte Bild überschreitet die sichere Ausgabegrenze.');
    }

    return {
      id: crypto.randomUUID(),
      name: file.name,
      dataUrl: await blobToDataUrl(encoded),
      intrinsicWidth: outputWidth,
      intrinsicHeight: outputHeight,
      widthPercent: 70,
      alignment: 'center',
      altText: file.name,
      anchorParagraphId,
    };
  } finally {
    bitmap.close();
  }
}
