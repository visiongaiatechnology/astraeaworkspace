// STATUS: DIAMANT VGT SUPREME — bounded Notes image editing/OCR geometry domain
import type { NoteCanvasBlock, NoteImageAnnotation, NoteImageCrop, NoteImageOcrResult } from '../../../shared/contracts/workspace';
import type { OcrResult } from '../../../platform/media/ocr/localTextDetection';

export type NoteImageBlock = Extract<NoteCanvasBlock, { kind: 'image' }>;
export const NOTE_IMAGE_MAX_ANNOTATIONS = 128;
export const NOTE_IMAGE_MAX_OCR_TOKENS = 4_096;
export const NOTE_IMAGE_MAX_OCR_TEXT = 1_000_000;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const round = (value: number): number => Math.round(value * 10_000) / 10_000;

export function normalizeNoteImageCrop(crop: NoteImageCrop | undefined): NoteImageCrop {
  const x = clamp(crop?.x ?? 0, 0, 0.98);
  const y = clamp(crop?.y ?? 0, 0, 0.98);
  const width = clamp(crop?.width ?? 1, 0.02, 1 - x);
  const height = clamp(crop?.height ?? 1, 0.02, 1 - y);
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

export function normalizeNoteImageOcr(ocr: NoteImageOcrResult | undefined): NoteImageOcrResult | undefined {
  if (!ocr?.fullText.trim() || ocr.sourceWidth <= 0 || ocr.sourceHeight <= 0) return undefined;
  const sourceWidth = clamp(ocr.sourceWidth, 1, 8_192);
  const sourceHeight = clamp(ocr.sourceHeight, 1, 8_192);
  return {
    fullText: ocr.fullText.normalize('NFKC').slice(0, NOTE_IMAGE_MAX_OCR_TEXT),
    sourceWidth,
    sourceHeight,
    engine: 'shape-detection-text',
    updatedAt: clamp(ocr.updatedAt, 0, Number.MAX_SAFE_INTEGER),
    tokens: (ocr.tokens ?? []).slice(0, NOTE_IMAGE_MAX_OCR_TOKENS).map((token) => ({
      text: token.text.normalize('NFKC').slice(0, 16_384),
      box: {
        x: round(clamp(token.box.x, 0, sourceWidth)),
        y: round(clamp(token.box.y, 0, sourceHeight)),
        width: round(clamp(token.box.width, 0, sourceWidth)),
        height: round(clamp(token.box.height, 0, sourceHeight)),
      },
    })).filter((token) => token.text.trim().length > 0),
  };
}

export function normalizeNoteImageAnnotations(source: NoteImageAnnotation[] | undefined): NoteImageAnnotation[] {
  return (source ?? []).slice(0, NOTE_IMAGE_MAX_ANNOTATIONS).map((annotation) => ({
    id: annotation.id.slice(0, 160),
    kind: 'rect' as const,
    x: round(clamp(annotation.x, 0, 1)),
    y: round(clamp(annotation.y, 0, 1)),
    width: round(clamp(annotation.width, 0.005, 1 - clamp(annotation.x, 0, 1))),
    height: round(clamp(annotation.height, 0.005, 1 - clamp(annotation.y, 0, 1))),
    color: /^#[0-9a-f]{6}$/i.test(annotation.color) ? annotation.color.toLowerCase() : '#f87171',
  })).filter((annotation) => annotation.id.length > 0);
}

export function normalizeNoteImageBlock<T extends NoteImageBlock>(block: T): T {
  const rotation = block.rotation === 90 || block.rotation === 180 || block.rotation === 270 ? block.rotation : 0;
  return {
    ...block,
    altText: block.altText?.normalize('NFKC').slice(0, 2_048) ?? '',
    crop: normalizeNoteImageCrop(block.crop),
    rotation,
    ocr: normalizeNoteImageOcr(block.ocr),
    annotations: normalizeNoteImageAnnotations(block.annotations),
  } as T;
}

export function imageOcrFromResult(result: OcrResult): NoteImageOcrResult {
  return normalizeNoteImageOcr({
    fullText: result.fullText,
    sourceWidth: result.sourceWidth,
    sourceHeight: result.sourceHeight,
    engine: 'shape-detection-text',
    updatedAt: Date.now(),
    tokens: result.tokens.map((token) => ({ text: token.text, box: token.box })),
  }) ?? { fullText: '', tokens: [], sourceWidth: result.sourceWidth, sourceHeight: result.sourceHeight, engine: 'shape-detection-text', updatedAt: Date.now() };
}

export function rotateNoteImage(block: NoteImageBlock, direction: 'left' | 'right'): NoteImageBlock {
  const order = [0, 90, 180, 270] as const;
  const current = order.indexOf(block.rotation ?? 0);
  const next = direction === 'right' ? (current + 1) % order.length : (current + order.length - 1) % order.length;
  return normalizeNoteImageBlock({ ...block, rotation: order[next] });
}

export function createNoteImageAnnotation(x: number, y: number, width: number, height: number, color = '#f87171'): NoteImageAnnotation {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') throw new Error('Cryptographic random UUID support is required for image annotations.');
  return normalizeNoteImageAnnotations([{ id: `image-annotation-${crypto.randomUUID()}`, kind: 'rect', x, y, width, height, color }])[0];
}
