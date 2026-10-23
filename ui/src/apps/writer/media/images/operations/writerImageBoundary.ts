// STATUS: DIAMANT VGT SUPREME — one boundary for the size and text rules of Writer images
//
// Findings closed by this module (all three are "a limit existed only on one side"):
//
//   W-057  `wrapMode` is optional. The layout always resolved a mode from `placement`, but the field
//          was only written when a flow button was pressed — so two images that look identical stored
//          different data. The canonical resolution now lives here and is applied on **write**, so the
//          stored document says what the layout does.
//   W-063  a per-image size limit (24 MiB) existed, a limit for the **sum** of images in one document
//          did not. A document could grow without bound by adding images one at a time.
//   W-065  alt text was optional and unvalidated: no length check, no requirement, no prompt.
//
// This is deliberately one module: before it, the same question ("what is this image allowed to be?")
// was answered in the import path, in the layout and in the save path, each with its own rules.
import type { WriterImageBlockData, WriterTextWrapMode } from '../../../../../shared/contracts/workspace';

/** The largest single image the import may produce. Mirrors `MAX_OUTPUT_BYTES` of the import. */
export const WRITER_IMAGE_MAX_OUTPUT_BYTES = 24 * 1024 * 1024;

/**
 * The largest **sum** of image payload bytes one document may carry (W-063).
 *
 * Three maximum-sized images fit; a fourth is refused. The number is chosen so that the bound is
 * reachable in normal work but still bounds the document: without it the sum was unbounded.
 */
export const WRITER_IMAGE_MAX_DOCUMENT_BYTES = 3 * WRITER_IMAGE_MAX_OUTPUT_BYTES;

/** Alt text is a description, not a paragraph. Longer text belongs in the caption. */
export const WRITER_IMAGE_MAX_ALT_TEXT_LENGTH = 250;

/** Same bound the media objects use for their captions, so one document has one caption length. */
export const WRITER_IMAGE_MAX_CAPTION_LENGTH = 1024;

/**
 * The wrap mode the layout actually uses, including the `placement` fallback.
 *
 * This is the **single** resolution of that question. It used to exist twice (here and in
 * `writerMediaOperations.resolveMediaWrapStyles`); both now call this function, and
 * `writerImageWrapModeSingleDefinition.contract.test.mjs` fails if a second copy appears.
 */
export function resolveWriterImageWrapMode(image: WriterImageBlockData): WriterTextWrapMode {
  return image.wrapMode
    ?? (image.placement === 'float-left' || image.placement === 'float-right' ? 'square' : 'inline');
}

/**
 * The image as it must be **stored** (W-057).
 *
 * Only one thing is added: the field the layout would have resolved anyway. The function is idempotent
 * and pure, and it does not touch any other field — normalising on write must not rewrite data the user
 * set.
 */
export function normalizeWriterImageForWrite(image: WriterImageBlockData): WriterImageBlockData {
  const wrapMode = resolveWriterImageWrapMode(image);
  if (image.wrapMode === wrapMode) return image;
  return { ...image, wrapMode };
}

/** The same normalisation for a whole list, keeping object identity where the image is already canonical. */
export function normalizeWriterImagesForWrite(images: readonly WriterImageBlockData[]): WriterImageBlockData[] {
  return images.map(normalizeWriterImageForWrite);
}

/**
 * The payload bytes of one image, measured on the **stored** form.
 *
 * A data URL carries base64 (4 characters per 3 bytes) plus a short header. The header is included, so
 * the estimate is an upper bound rather than an under-count.
 */
export function measureWriterImageBytes(image: Pick<WriterImageBlockData, 'dataUrl'>): number {
  const dataUrl = image.dataUrl ?? '';
  const commaIndex = dataUrl.indexOf(',');
  const payload = commaIndex >= 0 ? dataUrl.length - commaIndex - 1 : dataUrl.length;
  return Math.ceil(payload * 3 / 4) + Math.max(0, commaIndex + 1);
}

/** How many bytes the document's images occupy in total. */
export function measureWriterDocumentImageBytes(images: readonly WriterImageBlockData[]): number {
  return images.reduce((total, image) => total + measureWriterImageBytes(image), 0);
}

export interface WriterImageBudget {
  readonly usedBytes: number;
  readonly limitBytes: number;
  readonly remainingBytes: number;
  readonly overBudget: boolean;
}

/** The remaining image budget of a document, for the surface that has to show it. */
export function resolveWriterImageBudget(
  images: readonly WriterImageBlockData[],
  limitBytes: number = WRITER_IMAGE_MAX_DOCUMENT_BYTES,
): WriterImageBudget {
  const usedBytes = measureWriterDocumentImageBytes(images);
  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    overBudget: usedBytes > limitBytes,
  };
}

/**
 * True when adding `candidate` would exceed the document budget (W-063).
 *
 * Callers refuse the insert with `WriterImageImportError`; nothing already in the document is removed,
 * so the check can never destroy existing content.
 */
export function wouldExceedWriterImageBudget(
  existing: readonly WriterImageBlockData[],
  candidate: Pick<WriterImageBlockData, 'dataUrl'>,
  limitBytes: number = WRITER_IMAGE_MAX_DOCUMENT_BYTES,
): boolean {
  return measureWriterDocumentImageBytes(existing) + measureWriterImageBytes(candidate) > limitBytes;
}

/**
 * True when the stored payload is a real inline image data URL (WR-045).
 *
 * The write path checked the **size** and the alt text but never the scheme: any string —
 * `javascript:`, `https://…`, a bare path — could be stored as an image source, and every
 * renderer would happily put it into `src`. Only `data:image/<raster>;base64,…` is accepted,
 * which is exactly what the import produces; anything else is treated as missing content.
 */
export function isWriterImageDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length > WRITER_IMAGE_MAX_OUTPUT_BYTES) return false;
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/u.test(value);
}

/**
 * Why an image may not be stored, or `null` when it may (WR-045).
 *
 * The write path calls this before a document change, so a malformed or hostile payload is
 * refused at the boundary instead of being persisted and rendered later.
 */
export function refuseWriterImageForWrite(image: Pick<WriterImageBlockData, 'dataUrl' | 'name'>): string | null {
  if (!isWriterImageDataUrl(image.dataUrl)) {
    return `Bild „${image.name || 'ohne Namen'}“ hat keine gültige Inline-Bildquelle (data:image/…;base64).`;
  }
  if (measureWriterImageBytes(image) > WRITER_IMAGE_MAX_OUTPUT_BYTES) {
    return 'Das Bild überschreitet die sichere Ausgabegrenze.';
  }
  return null;
}

export type WriterImageAltTextVerdict =
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false; readonly message: string };

/**
 * Validates alt text (W-065).
 *
 * Optional stays optional — an image without a description is legal — but text that is present must be
 * usable: whitespace-only becomes "absent" instead of an invisible description, and an over-long text is
 * refused **by name** instead of being silently truncated.
 */
export function validateWriterImageAltText(value: string | undefined | null): WriterImageAltTextVerdict {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) return { ok: true, value: undefined };
  if (trimmed.length > WRITER_IMAGE_MAX_ALT_TEXT_LENGTH) {
    return {
      ok: false,
      message: `Alternativtext darf höchstens ${WRITER_IMAGE_MAX_ALT_TEXT_LENGTH} Zeichen lang sein.`,
    };
  }
  return { ok: true, value: trimmed };
}

/** The same verdict for a caption, so the dialog applies one rule to both text fields. */
export function validateWriterImageCaption(value: string | undefined | null): WriterImageAltTextVerdict {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) return { ok: true, value: undefined };
  if (trimmed.length > WRITER_IMAGE_MAX_CAPTION_LENGTH) {
    return {
      ok: false,
      message: `Bildunterschrift darf höchstens ${WRITER_IMAGE_MAX_CAPTION_LENGTH} Zeichen lang sein.`,
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * Why an image carries no alt text, phrased as the question the dialog has to ask (W-065).
 *
 * The import always fills `altText` from the file name, so this only fires for images from an older
 * document or from an import that produced a nameless file. `null` means the caller does not need to
 * ask anything, which is the normal case.
 */
export function writerImageAltTextPrompt(image: WriterImageBlockData): string | null {
  const verdict = validateWriterImageAltText(image.altText);
  if (!verdict.ok) return verdict.message;
  if (verdict.value !== undefined) return null;
  return 'Diesem Bild fehlt ein Alternativtext. Ohne Beschreibung ist es für Screenreader stumm.';
}
