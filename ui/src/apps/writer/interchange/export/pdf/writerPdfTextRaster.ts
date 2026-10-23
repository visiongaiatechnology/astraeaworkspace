// STATUS: DIAMANT VGT SUPREME — browser-native Unicode/BiDi/CJK shaping to PDF stencil masks.
import { getPrimaryDirection } from '../../../layout/typography/writerTextShaping';

export interface WriterPdfTextRasterRequest {
  text: string;
  fontFamily?: string;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
}

export interface WriterPdfTextMask {
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
  baselineFromBottomPt: number;
  packedMaskHex: string;
}

export type WriterPdfTextRasterizer = (request: WriterPdfTextRasterRequest) => WriterPdfTextMask;

const MAX_TEXT_LENGTH = 16_384;
const MAX_MASK_PIXELS = 4_000_000;
const PIXELS_PER_POINT = 2;

function safeFontFamily(input?: string): string {
  const normalized = (input ?? '').normalize('NFKC').trim().slice(0, 96);
  if (!normalized || /[\r\n{};]/u.test(normalized)) return 'sans-serif';
  return normalized.replace(/["\\]/gu, '');
}

function maskToHex(alpha: Uint8ClampedArray, width: number, height: number): string {
  const rowBytes = Math.ceil(width / 8);
  const bytes = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alphaIndex = (y * width + x) * 4 + 3;
      if ((alpha[alphaIndex] ?? 0) < 48) continue;
      bytes[y * rowBytes + Math.floor(x / 8)] |= 0x80 >>> (x % 8);
    }
  }
  let hex = '';
  for (const value of bytes) hex += value.toString(16).padStart(2, '0').toUpperCase();
  return `${hex}>`;
}

export function createBrowserWriterPdfTextRasterizer(): WriterPdfTextRasterizer | undefined {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return undefined;
  const probe = document.createElement('canvas');
  if (!probe.getContext('2d')) return undefined;

  return (request: WriterPdfTextRasterRequest): WriterPdfTextMask => {
    const text = request.text.normalize('NFC');
    if (!text || text.length > MAX_TEXT_LENGTH) throw new Error('PDF text rasterization boundary violation');
    const fontSizePt = Math.max(5, Math.min(144, request.fontSizePt));
    const fontSizePx = fontSizePt * PIXELS_PER_POINT;
    const family = safeFontFamily(request.fontFamily);
    const style = request.italic ? 'italic ' : '';
    const weight = request.bold ? '700 ' : '400 ';
    const font = `${style}${weight}${fontSizePx}px "${family}", sans-serif`;
    const direction = getPrimaryDirection(text);

    const measureCanvas = document.createElement('canvas');
    const measure = measureCanvas.getContext('2d', { willReadFrequently: true });
    if (!measure) throw new Error('Canvas 2D text shaping is unavailable');
    measure.font = font;
    measure.direction = direction;
    measure.textAlign = direction === 'rtl' ? 'right' : 'left';
    measure.textBaseline = 'alphabetic';
    const metrics = measure.measureText(text);
    const ascent = Math.max(fontSizePx * 0.82, metrics.actualBoundingBoxAscent || 0);
    const descent = Math.max(fontSizePx * 0.22, metrics.actualBoundingBoxDescent || 0);
    const padding = Math.max(2, Math.ceil(fontSizePx * 0.12));
    const widthPx = Math.max(1, Math.ceil(metrics.width) + padding * 2);
    const heightPx = Math.max(1, Math.ceil(ascent + descent) + padding * 2);
    if (widthPx * heightPx > MAX_MASK_PIXELS) throw new Error('PDF text mask exceeds pixel safety ceiling');

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D text shaping is unavailable');
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.font = font;
    ctx.direction = direction;
    ctx.textAlign = direction === 'rtl' ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000000';
    const x = direction === 'rtl' ? widthPx - padding : padding;
    const baseline = padding + ascent;
    ctx.fillText(text, x, baseline);
    const pixels = ctx.getImageData(0, 0, widthPx, heightPx).data;

    return {
      widthPx,
      heightPx,
      widthPt: widthPx / PIXELS_PER_POINT,
      heightPt: heightPx / PIXELS_PER_POINT,
      baselineFromBottomPt: (heightPx - baseline) / PIXELS_PER_POINT,
      packedMaskHex: maskToHex(pixels, widthPx, heightPx),
    };
  };
}
