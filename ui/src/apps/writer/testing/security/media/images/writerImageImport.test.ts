// STATUS: PLATIN — Writer image import security boundary tests
import { describe, expect, it } from 'vitest';
import {
  WriterImageImportError,
  detectWriterImageMime,
  validateWriterImageDimensions,
  validateWriterImageEnvelope,
} from '../../../../media/images/import/writerImageImport';

describe('Writer image import validation', () => {
  const pngHeader = new Uint8Array(24);
  pngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  pngHeader.set([0x49, 0x48, 0x44, 0x52], 12);
  pngHeader.set([0, 0, 0, 1, 0, 0, 0, 1], 16);
  const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
  const webpHeader = new Uint8Array(30);
  webpHeader.set([0x52, 0x49, 0x46, 0x46], 0);
  webpHeader.set([0x57, 0x45, 0x42, 0x50], 8);
  webpHeader.set([0x56, 0x50, 0x38, 0x58], 12);

  it('detects supported formats from independent magic bytes', () => {
    expect(detectWriterImageMime(jpegHeader)).toBe('image/jpeg');
    expect(detectWriterImageMime(pngHeader)).toBe('image/png');
    expect(detectWriterImageMime(webpHeader)).toBe('image/webp');
  });

  it('rejects a MIME declaration that disagrees with the file signature', () => {
    expect(() => validateWriterImageEnvelope(
      'image/png',
      1_024,
      jpegHeader
    )).toThrow(WriterImageImportError);
  });

  it('rejects empty and oversized source files before decoding', () => {
    const jpeg = jpegHeader;
    expect(() => validateWriterImageEnvelope('image/jpeg', 0, jpeg)).toThrow(/20 MiB/);
    expect(() => validateWriterImageEnvelope('image/jpeg', 20 * 1024 * 1024 + 1, jpeg)).toThrow(/20 MiB/);
  });

  it('rejects decompression-sized pixel bombs', () => {
    expect(() => validateWriterImageDimensions(20_000, 20_000)).toThrow(/Pixel- oder Speichergrenze/);
    expect(() => validateWriterImageDimensions(4_000, 3_000)).not.toThrow();
  });
});
