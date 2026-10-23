// STATUS: PLATIN — Image drop path: the supported set and the fail-closed drop
//
// Dropping a file on a page has a default action: the WebView navigates to the
// file and the application is gone. Both the `dragover` and the `drop` handler
// therefore have to cancel the event for **every** drop, not only for recognised
// images. The type decision moved into one shared definition so the picker cannot
// offer a type the drop refuses.
import { describe, expect, it } from 'vitest';
import {
  isSupportedWriterImageMime,
  SUPPORTED_WRITER_IMAGE_MIMES,
  WRITER_IMAGE_ACCEPT_ATTRIBUTE,
} from '../../../media/images/import/writerImageImport';

describe('Writer supported image types', () => {
  it('accepts exactly JPEG, PNG and WebP', () => {
    expect(isSupportedWriterImageMime('image/jpeg')).toBe(true);
    expect(isSupportedWriterImageMime('image/png')).toBe(true);
    expect(isSupportedWriterImageMime('image/webp')).toBe(true);
  });

  it('rejects other image types instead of claiming they work', () => {
    for (const mime of ['image/svg+xml', 'image/gif', 'image/bmp', 'image/avif', 'image/tiff']) {
      expect(isSupportedWriterImageMime(mime)).toBe(false);
    }
  });

  it('rejects non-images and empty values', () => {
    for (const mime of ['application/pdf', 'text/plain', 'application/octet-stream', '', undefined]) {
      expect(isSupportedWriterImageMime(mime)).toBe(false);
    }
  });

  it('is case sensitive like the MIME registry', () => {
    expect(isSupportedWriterImageMime('IMAGE/PNG')).toBe(false);
  });

  it('derives the picker attribute from the same list', () => {
    expect(WRITER_IMAGE_ACCEPT_ATTRIBUTE).toBe('image/jpeg,image/png,image/webp');
    expect(WRITER_IMAGE_ACCEPT_ATTRIBUTE.split(',')).toEqual([...SUPPORTED_WRITER_IMAGE_MIMES]);
  });
});
