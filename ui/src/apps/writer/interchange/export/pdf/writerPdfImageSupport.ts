// STATUS: PLATIN — WR-043: which images a PDF export can embed, and how
//
// The PDF exporter decoded **JPEG only** (`decodeJpegDataUrl`), while the Writer import produces
// PNG for every PNG/WebP source. A PNG therefore vanished from the PDF without a word, although
// it was visible on screen. This module answers that question once, for the exporter and for the
// surface that has to warn about what it cannot embed.
//
// PNG is embedded by **passthrough**: PDF's `FlateDecode` accepts the zlib stream and its
// `/Predictor 15` is defined as the PNG row filters, so the concatenated `IDAT` bytes can be used
// unchanged. That needs no inflate implementation, no dependency and no canvas. The colour types
// that PDF cannot express as a plain image (grey+alpha, RGBA) and interlaced PNGs are reported as
// unsupported instead of being dropped silently.

export interface WriterPdfJpegImage {
  readonly kind: 'jpeg';
  readonly bytes: Uint8Array;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface WriterPdfPngImage {
  readonly kind: 'png';
  /** Concatenated `IDAT` payload — a valid zlib stream. */
  readonly idat: Uint8Array;
  readonly widthPx: number;
  readonly heightPx: number;
  /** Components per pixel as the predictor must read them (1, 3 or 4). */
  readonly colors: 1 | 3;
  readonly colorSpace: '/DeviceGray' | '/DeviceRGB' | 'indexed';
  /** Palette for colour type 3, already expanded to RGB triples. */
  readonly palette?: Uint8Array;
}

export interface WriterPdfUnsupportedImage {
  readonly kind: 'unsupported';
  readonly reason: 'not-a-data-url' | 'webp' | 'png-alpha' | 'png-interlaced' | 'png-bit-depth' | 'png-palette-missing' | 'corrupt';
}

export type WriterPdfImageSource = WriterPdfJpegImage | WriterPdfPngImage | WriterPdfUnsupportedImage;

function decodeBase64DataUrl(dataUrl: string, mime: 'jpeg' | 'png'): Uint8Array | null {
  const pattern = mime === 'jpeg'
    ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/u
    : /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/u;
  const match = pattern.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = globalThis.atob(match[1]!);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function decodePng(bytes: Uint8Array): WriterPdfImageSource {
  if (bytes.length < 8 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    return { kind: 'unsupported', reason: 'corrupt' };
  }
  let offset = 8;
  let widthPx = 0;
  let heightPx = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let palette: Uint8Array | undefined;
  const idatParts: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    const dataStart = offset + 8;
    if (dataStart + length > bytes.length) break;
    const chunk = bytes.subarray(dataStart, dataStart + length);
    if (type === 'IHDR' && length >= 13) {
      widthPx = readUint32(chunk, 0);
      heightPx = readUint32(chunk, 4);
      bitDepth = chunk[8]!;
      colorType = chunk[9]!;
      interlace = chunk[12]!;
    } else if (type === 'PLTE') {
      palette = chunk;
    } else if (type === 'IDAT') {
      idatParts.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4; // skip CRC
  }

  if (widthPx <= 0 || heightPx <= 0 || idatParts.length === 0) return { kind: 'unsupported', reason: 'corrupt' };
  if (interlace !== 0) return { kind: 'unsupported', reason: 'png-interlaced' };
  if (bitDepth !== 8) return { kind: 'unsupported', reason: 'png-bit-depth' };
  if (colorType === 4 || colorType === 6) return { kind: 'unsupported', reason: 'png-alpha' };

  let total = 0;
  for (const part of idatParts) total += part.length;
  const idat = new Uint8Array(total);
  let written = 0;
  for (const part of idatParts) { idat.set(part, written); written += part.length; }

  if (colorType === 0) return { kind: 'png', idat, widthPx, heightPx, colors: 1, colorSpace: '/DeviceGray' };
  if (colorType === 2) return { kind: 'png', idat, widthPx, heightPx, colors: 3, colorSpace: '/DeviceRGB' };
  if (colorType === 3) {
    if (!palette || palette.length < 3) return { kind: 'unsupported', reason: 'png-palette-missing' };
    const entries = Math.min(256, Math.floor(palette.length / 3));
    const expanded = new Uint8Array(entries * 3);
    expanded.set(palette.subarray(0, entries * 3));
    return { kind: 'png', idat, widthPx, heightPx, colors: 1, colorSpace: 'indexed', palette: expanded };
  }
  return { kind: 'unsupported', reason: 'corrupt' };
}

/** Classifies one stored data URL for the PDF exporter. */
export function decodeWriterPdfImage(dataUrl: string): WriterPdfImageSource {
  if (dataUrl.startsWith('data:image/png;base64,')) {
    const bytes = decodeBase64DataUrl(dataUrl, 'png');
    return bytes ? decodePng(bytes) : { kind: 'unsupported', reason: 'corrupt' };
  }
  if (dataUrl.startsWith('data:image/jpeg;base64,')) {
    const bytes = decodeBase64DataUrl(dataUrl, 'jpeg');
    if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8
      || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
      return { kind: 'unsupported', reason: 'corrupt' };
    }
    return { kind: 'jpeg', bytes, widthPx: 0, heightPx: 0 };
  }
  if (dataUrl.startsWith('data:image/webp;base64,')) return { kind: 'unsupported', reason: 'webp' };
  return { kind: 'unsupported', reason: 'not-a-data-url' };
}

export interface WriterPdfImageSupport {
  readonly total: number;
  readonly embeddable: number;
  readonly unsupported: number;
}

/** How many images the PDF gets and how many it will not — never a silent drop. */
export function analyzeWriterPdfImageSupport(images: readonly { readonly dataUrl: string }[]): WriterPdfImageSupport {
  let embeddable = 0;
  let unsupported = 0;
  for (const image of images) {
    if (decodeWriterPdfImage(image.dataUrl).kind === 'unsupported') unsupported += 1;
    else embeddable += 1;
  }
  return { total: images.length, embeddable, unsupported };
}
