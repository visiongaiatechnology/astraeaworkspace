// STATUS: DIAMANT VGT SUPREME — a DOCX round trip must not lose its pictures (W-307)
//
// W-307, measured: `exportDocx` writes the image part and the drawing, and `importDocx` returned
// `images: []` — the importer never looked at a `w:drawing`. Opening a document the application had just
// exported therefore lost **every picture, silently**. The text survived, which is what made it dangerous:
// the file looked complete.
//
// This module reads them back. It is pure: XML in, bytes in, model out — no DOM, no zip handling, no I/O,
// so every rule below is unit-testable.
//
// What it reads (ECMA-376):
//   • `<wp:inline>`            → `placement: 'block'`, `wrapMode: 'inline'`
//   • `<wp:anchor>`            → `float-left` / `float-right` from `wp:positionH/wp:align`, and the wrap from
//                                `wp:wrapSquare` / `wrapTight` / `wrapThrough` / `wrapTopAndBottom` /
//                                `wp:wrapNone` (with `behindDoc` deciding behind or in front of the text)
//   • `wp:extent`              → the display size, mapped back to the model's percentage
//   • `wp:docPr` `name`/`descr`→ the image name and its alternative text
//   • `wp:anchor` `distT/B/L/R`→ the wrap distances in millimetres
//
// What it deliberately does **not** do: throw on a drawing it cannot model. A Word document may contain
// charts, shapes, SmartArt, text boxes and VML; refusing the whole file because of an unknown drawing would
// make the importer useless for real documents. Such drawings are skipped, and a *picture* whose media part
// is genuinely missing from the package is reported in `missingMedia` instead of vanishing quietly.

import type { WriterImageBlockData, WriterTextWrapMode } from '../../../../shared/contracts/writer/workspaceWriterMedia';
import { extractStartTags, readAttribute } from '../../../../shared/interoperability/xml';
import { blocks } from './xmlParsing';

/** English Metric Units per millimetre — the same constant the exporter uses. */
const EMU_PER_MILLIMETER = 36_000;
/** A picture may not claim more than the whole text column, nor less than a fifth of it. */
const MIN_WIDTH_PERCENT = 20;
const MAX_WIDTH_PERCENT = 100;
/** More pictures than this in one document are not read (the exporter refuses to write more, too). */
const MAX_IMPORTED_IMAGES = 256;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

export interface DocxImageImportInput {
  /** The `w:p` blocks in document order — the same list the paragraphs were parsed from. */
  readonly paragraphXmlBlocks: readonly string[];
  /** Ids of those paragraphs, in the same order, so an image can point back at its anchor. */
  readonly paragraphIds: readonly string[];
  /** `rId` → part target (`media/image1.png`), from `word/_rels/document.xml.rels`. */
  readonly relationshipTargets: ReadonlyMap<string, string>;
  /** Every part of the package, so the media bytes can be found. */
  readonly entries: ReadonlyMap<string, Uint8Array>;
  /** Width of the text column in millimetres, to turn the display size back into a percentage. */
  readonly textColumnWidthMm: number;
}

export interface DocxImageImportResult {
  readonly images: readonly WriterImageBlockData[];
  /** Drawings that are pictures but whose media part is not in the package — never dropped in silence. */
  readonly missingMedia: readonly string[];
}

function numberAttribute(tag: string, name: string): number | null {
  const raw = readAttribute(tag, name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** EMU → millimetres, rounded to a tenth so the model does not carry noise. */
function emuToMillimetres(value: number | null): number | undefined {
  if (value === null) return undefined;
  return Math.round((value / EMU_PER_MILLIMETER) * 10) / 10;
}

/** `<w:jc w:val="center"/>` of the surrounding paragraph, or `left` as Word's own default. */
function paragraphAlignment(paragraphXml: string): WriterImageBlockData['alignment'] {
  const value = readAttribute(extractStartTags(paragraphXml, 'jc')[0] ?? '', 'val')?.toLowerCase() ?? '';
  if (value === 'center') return 'center';
  if (value === 'right' || value === 'end') return 'right';
  return 'left';
}

/** The wrap mode an anchored drawing asks for. */
function anchorWrapMode(anchorXml: string): WriterTextWrapMode {
  if (/<[^>]*wrapTight\b/u.test(anchorXml)) return 'tight';
  if (/<[^>]*wrapThrough\b/u.test(anchorXml)) return 'through';
  if (/<[^>]*wrapTopAndBottom\b/u.test(anchorXml)) return 'top-bottom';
  if (/<[^>]*wrapNone\b/u.test(anchorXml)) {
    const behind = readAttribute(extractStartTags(anchorXml, 'anchor')[0] ?? '', 'behindDoc');
    return behind === '1' || behind === 'true' ? 'behind-text' : 'in-front-of-text';
  }
  return 'square';
}

/** `<wp:positionH><wp:align>right</wp:align>` decides which side the picture floats to. */
function anchorPlacement(anchorXml: string): WriterImageBlockData['placement'] {
  const horizontal = blocks(anchorXml, 'positionH')[0] ?? '';
  const align = (blocks(horizontal, 'align')[0] ?? '').replace(/<[^>]*>/gu, '').trim().toLowerCase();
  return align === 'right' || align === 'end' ? 'float-right' : 'float-left';
}

function mimeTypeOf(target: string): string | null {
  const extension = target.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? null;
}

function toDataUrl(mimeType: string, bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function parseDocxImages(input: DocxImageImportInput): DocxImageImportResult {
  const images: WriterImageBlockData[] = [];
  const missingMedia: string[] = [];
  const column = Math.max(1, input.textColumnWidthMm);

  input.paragraphXmlBlocks.forEach((paragraphXml, paragraphIndex) => {
    if (images.length >= MAX_IMPORTED_IMAGES) return;
    const anchorParagraphId = input.paragraphIds[paragraphIndex];
    for (const drawing of blocks(paragraphXml, 'drawing')) {
      const inline = blocks(drawing, 'inline')[0];
      const anchor = blocks(drawing, 'anchor')[0];
      const body = inline ?? anchor;
      if (!body) continue;

      // Only pictures have a `a:blip`; charts, shapes and SmartArt are left alone on purpose.
      const blip = extractStartTags(drawing, 'blip')[0];
      const relationshipId = blip ? readAttribute(blip, 'embed') : null;
      if (!relationshipId) continue;

      const target = input.relationshipTargets.get(relationshipId);
      // The relationship map already holds the resolved package path (`word/media/image1.png`).
      const partName = target ?? '';
      const bytes = partName ? input.entries.get(partName) : undefined;
      const mimeType = target ? mimeTypeOf(target) : null;
      if (!target || !bytes || !mimeType) {
        missingMedia.push(partName || relationshipId);
        continue;
      }

      const extent = extractStartTags(body, 'extent')[0] ?? '';
      const widthEmu = numberAttribute(extent, 'cx');
      const heightEmu = numberAttribute(extent, 'cy');
      const widthMm = widthEmu === null ? column : widthEmu / EMU_PER_MILLIMETER;
      const heightMm = heightEmu === null ? widthMm : heightEmu / EMU_PER_MILLIMETER;
      const percent = Math.round((widthMm / column) * 100);
      const documentProperties = extractStartTags(drawing, 'docPr')[0] ?? '';
      const name = (readAttribute(documentProperties, 'name') ?? '').trim();
      const description = (readAttribute(documentProperties, 'descr') ?? '').trim();

      images.push({
        id: `docx-image-${images.length + 1}`,
        name: name || `Bild ${images.length + 1}`,
        dataUrl: toDataUrl(mimeType, bytes),
        // A DOCX does not carry the pixel size of a picture, only how large it is displayed. The aspect
        // ratio is what the export uses to derive the height again, so it is preserved exactly.
        intrinsicWidth: Math.max(1, Math.round(widthMm)),
        intrinsicHeight: Math.max(1, Math.round(heightMm)),
        widthPercent: Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, percent)),
        alignment: paragraphAlignment(paragraphXml),
        altText: description || undefined,
        anchorParagraphId,
        placement: anchor ? anchorPlacement(anchor) : 'block',
        wrapMode: anchor ? anchorWrapMode(anchor) : 'inline',
        wrapDistanceTopMm: emuToMillimetres(numberAttribute(body, 'distT')),
        wrapDistanceBottomMm: emuToMillimetres(numberAttribute(body, 'distB')),
        wrapDistanceLeftMm: emuToMillimetres(numberAttribute(body, 'distL')),
        wrapDistanceRightMm: emuToMillimetres(numberAttribute(body, 'distR')),
      });
      if (images.length >= MAX_IMPORTED_IMAGES) return;
    }
  });

  return { images, missingMedia };
}
