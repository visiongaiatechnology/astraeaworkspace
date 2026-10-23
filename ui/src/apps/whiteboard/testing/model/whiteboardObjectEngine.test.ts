import { describe, expect, it } from 'vitest';
import {
  isWhiteboardRasterImageWithinDecodeBudget,
  readWhiteboardRasterImageDimensions,
  validateEmbeddedMediaSignature,
  validateRasterImageSignature,
  WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES,
  WHITEBOARD_IMAGE_MAX_BYTES,
} from '../../model/whiteboardObjectEngine';

describe('Whiteboard local-file signature validation', () => {
  it('validates bounded PNG and WebP headers against the declared file size', () => {
    const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const webpHeader = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

    expect(validateRasterImageSignature(pngHeader, 'image/png', 64)).toBe(true);
    expect(validateRasterImageSignature(webpHeader, 'image/webp', 64)).toBe(true);
    expect(validateRasterImageSignature(pngHeader, 'image/png', 7)).toBe(false);
    expect(validateRasterImageSignature(pngHeader, 'image/jpeg', 64)).toBe(false);
  });

  it('reads PNG dimensions from bounded headers before image decoding', () => {
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(header.buffer);
    view.setUint32(16, 4096, false);
    view.setUint32(20, 4096, false);
    const dimensions = readWhiteboardRasterImageDimensions(header, 'image/png');

    expect(dimensions).toEqual({ width: 4096, height: 4096 });
    expect(dimensions && isWhiteboardRasterImageWithinDecodeBudget(dimensions)).toBe(true);
    view.setUint32(16, 6001, false);
    view.setUint32(20, 4000, false);
    const oversized = readWhiteboardRasterImageDimensions(header, 'image/png');
    expect(oversized && isWhiteboardRasterImageWithinDecodeBudget(oversized)).toBe(false);
  });

  it('cross-checks JPEG start and end markers without loading the full file into memory', () => {
    const jpegHeader = Uint8Array.from([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00]);
    const jpegTrailer = Uint8Array.from([0xff, 0xd9]);

    expect(validateRasterImageSignature(jpegHeader, 'image/jpeg', 128, jpegTrailer)).toBe(true);
    expect(validateRasterImageSignature(jpegHeader, 'image/jpeg', 128, Uint8Array.from([0, 0]))).toBe(false);
    expect(validateRasterImageSignature(jpegHeader, 'image/jpeg', WHITEBOARD_IMAGE_MAX_BYTES + 1, jpegTrailer)).toBe(false);
  });

  it('finds JPEG dimensions from bounded frame headers and rejects malformed segments', () => {
    const header = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0xe8, 0x07, 0xd0,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    ]);
    expect(readWhiteboardRasterImageDimensions(header, 'image/jpeg')).toEqual({ width: 2000, height: 1000 });
    expect(readWhiteboardRasterImageDimensions(header.slice(0, 8), 'image/jpeg')).toBeNull();
  });

  it('reads WebP extended-canvas dimensions without starting the browser decoder', () => {
    const header = new Uint8Array(30);
    header.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    header[24] = 0x87;
    header[25] = 0x13;
    header[27] = 0x87;
    header[28] = 0x13;
    const dimensions = readWhiteboardRasterImageDimensions(header, 'image/webp');

    expect(dimensions).toEqual({ width: 5000, height: 5000 });
    expect(dimensions && isWhiteboardRasterImageWithinDecodeBudget(dimensions)).toBe(false);
  });

  it('validates media signatures from a bounded prefix and enforces the full file-size limit', () => {
    const mp4Header = Uint8Array.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);

    expect(validateEmbeddedMediaSignature(mp4Header, 'video/mp4', 1024)).toBe(true);
    expect(validateEmbeddedMediaSignature(mp4Header, 'video/mp4', WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES + 1)).toBe(false);
    expect(validateEmbeddedMediaSignature(mp4Header, 'application/octet-stream', 1024)).toBe(false);
  });
});
