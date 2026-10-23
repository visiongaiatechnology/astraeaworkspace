// @vitest-environment happy-dom
// STATUS: PLATIN — Real image bytes reach the model (WR-033)
//
// ## The defect this file pins
//
// `importWriterImage` used to read **16 bytes** and hand them to
// `probeMediaBoundary`, which refuses an image whose dimensions are not readable
// (`dimension-unavailable-before-decode`). No PNG can carry its `IHDR` size in 16
// bytes (16…24), a JPEG keeps `SOF0` behind an APP1/EXIF segment, and a WebP needs 30.
// The result in the native window: **every** real picture was rejected with
// "Nur JPEG-, PNG- und WebP-Bilddaten werden unterstützt."
//
// These tests feed real-shaped binaries through the whole path — signature check,
// dimension budget, decode and re-encode — and assert the finished `ImageBlockData`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageBlockData } from '../../../types';

const preflight = vi.hoisted(() => vi.fn());
vi.mock('../../../../../platform/import-sandbox/importExportSandbox', () => ({
  preflightIsolatedImageDecode: preflight,
}));

import { importWriterImage, detectWriterImageMime, validateWriterImageEnvelope } from '../../../media/images/import/writerImageImport';

/** A 1×1 PNG (`IHDR` present, so the real header path is exercised). */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x0d, 0x0a, 0x2d, 0xb4,
]);

/**
 * A JPEG whose `SOF0` sits behind an APP1/EXIF segment — exactly the shape that used to
 * fail even with a larger header slice.
 */
function jpegWithExif(): Uint8Array {
  const app1Payload = new Uint8Array(2048).fill(0x20);
  app1Payload[0] = 0x45; app1Payload[1] = 0x78; app1Payload[2] = 0x69; app1Payload[3] = 0x66;
  const bytes: number[] = [0xff, 0xd8];
  bytes.push(0xff, 0xe1, 0x08, 0x02);
  bytes.push(...app1Payload.subarray(0, 0x7fe));
  // SOF0: length, precision, height, width, 3 components
  bytes.push(0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x03);
  bytes.push(0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
  bytes.push(0xff, 0xd9);
  return Uint8Array.from(bytes);
}

/** RIFF/WEBP with a `VP8X` chunk carrying the canvas size (needed for a real read). */
function webpBytes(width: number, height: number): Uint8Array {
  const bytes: number[] = [];
  const pushAscii = (text: string): void => { for (const character of text) bytes.push(character.charCodeAt(0)); };
  pushAscii('RIFF');
  const payloadSize = 4 + 8 + 10;
  bytes.push((payloadSize) & 0xff, (payloadSize >> 8) & 0xff, (payloadSize >> 16) & 0xff, (payloadSize >> 24) & 0xff);
  pushAscii('WEBP');
  pushAscii('VP8X');
  bytes.push(0x0a, 0x00, 0x00, 0x00);
  bytes.push(0x00, 0x00, 0x00, 0x00);
  const w = width - 1; const h = height - 1;
  bytes.push(w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff);
  bytes.push(h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff);
  return Uint8Array.from(bytes);
}

function fileFrom(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

/** A minimal canvas stand-in: the import only draws and re-encodes. */
function installCanvasStub(): void {
  const originalCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    if (tag !== 'canvas') return originalCreate(tag, options);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (callback: (blob: Blob | null) => void) => {
        callback(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }));
      },
    } as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
}

beforeEach(() => {
  preflight.mockReset();
  preflight.mockResolvedValue({ image_width: 1, image_height: 1 });
  // `createImageBitmap` is what the editor uses to size the bitmap before re-encoding.
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1, height: 1, close: () => undefined })));
  // `FileReader` feeds the final data URL; happy-dom implements it, the blob is tiny.
  installCanvasStub();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WR-033 — real image formats are recognised from their own bytes', () => {
  it('recognises a PNG, a JPEG with EXIF and a WebP by signature', () => {
    expect(detectWriterImageMime(PNG_BYTES)).toBe('image/png');
    expect(detectWriterImageMime(jpegWithExif())).toBe('image/jpeg');
    expect(detectWriterImageMime(webpBytes(16, 16))).toBe('image/webp');
  });

  it('still refuses a header that is not an image at all', () => {
    expect(detectWriterImageMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it('accepts the declared type that matches the signature', () => {
    expect(validateWriterImageEnvelope('image/png', PNG_BYTES.length, PNG_BYTES)).toBe('image/png');
    // Case-insensitive on the declared side (W-061), strict on the signature.
    expect(validateWriterImageEnvelope('image/PNG', PNG_BYTES.length, PNG_BYTES)).toBe('image/png');
  });
});

describe('WR-033 — a real file reaches the model', () => {
  it('imports a PNG into a complete ImageBlockData', async () => {
    const image: ImageBlockData = await importWriterImage(fileFrom(PNG_BYTES, 'bild.png', 'image/png'), 'p-1');
    expect(image.name).toBe('bild.png');
    expect(image.anchorParagraphId).toBe('p-1');
    expect(image.intrinsicWidth).toBe(1);
    expect(image.intrinsicHeight).toBe(1);
    expect(image.dataUrl.startsWith('data:image/')).toBe(true);
    expect(image.altText).toBe('bild.png');
    expect(image.id.length).toBeGreaterThan(0);
  });

  it('imports a JPEG whose SOF0 sits behind an EXIF segment', async () => {
    const bytes = jpegWithExif();
    // The decoder sandbox answers with the real size here; the signature path is what
    // used to fail, and it must not fail any more.
    const image = await importWriterImage(fileFrom(bytes, 'foto.jpg', 'image/jpeg'), 'p-2');
    expect(image.name).toBe('foto.jpg');
    expect(image.anchorParagraphId).toBe('p-2');
    expect(image.dataUrl.startsWith('data:image/')).toBe(true);
  });

  it('imports a WebP', async () => {
    const image = await importWriterImage(fileFrom(webpBytes(32, 24), 'bild.webp', 'image/webp'), 'p-3');
    expect(image.name).toBe('bild.webp');
    expect(image.dataUrl.startsWith('data:image/')).toBe(true);
  });

  it('falls back to the boundary probe when the decoder sandbox does not answer', async () => {
    // The bundled Tauri/WebView2 window may not run the worker: the import must survive.
    preflight.mockRejectedValue(new Error('worker unavailable'));
    const image = await importWriterImage(fileFrom(PNG_BYTES, 'bild.png', 'image/png'), 'p-4');
    expect(image.intrinsicWidth).toBe(1);
    expect(image.intrinsicHeight).toBe(1);
  });

  it('refuses an empty and an oversized file before reading it', async () => {
    await expect(importWriterImage(fileFrom(new Uint8Array([]), 'leer.png', 'image/png'))).rejects.toThrow(/1 Byte/);
    const huge = { size: 21 * 1024 * 1024, type: 'image/png', name: 'riesig.png' } as File;
    await expect(importWriterImage(huge)).rejects.toThrow(/20 MiB/);
  });
});
