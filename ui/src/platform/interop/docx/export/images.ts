// STATUS: DIAMANT VGT SUPREME — images in the DOCX export, which had none
//
// Paket 48 acceptance: "Geschäftsbrief mit Überschriften, Tabelle, **Bild**, mehrseitigem Text und
// PDF/DOCX erstellen."
//
// W-288, measured before this file existed: the DOCX exporter wrote paragraphs, equations and tables —
// and **no images at all**. The only `images` in the whole `platform/interop/docx` tree was
// `importer.ts: images: []` on the import side. No `w:drawing`, no `media/…` part, no relationship. The
// PDF export, by contrast, renders images (`writerPdfExport` lines 151/288/412). A business letter
// therefore lost its picture on the DOCX way out, silently — the same document exported twice gave two
// different documents.
//
// Decisions written down here rather than left implicit:
//   • only `data:image/<type>;base64,` can be embedded; anything else **throws** with the image name.
//     Dropping content silently is the defect this file removes, so an unembeddable image is an error,
//     not a shrug.
//   • everything is bounded (count, per-image bytes, total bytes) like the rest of the interop layer.
//   • the width rule is the PDF's rule (`widthPercent` clamped to 20–100 % of the text column) so the
//     two exports cannot disagree about how large a picture is.
import type { WriterImageBlockData } from '../../../../shared/contracts/workspace';
import type { WriterTextWrapMode } from '../../../../shared/contracts/writer/workspaceWriterMedia';
import { escapeXml } from '../../../../shared/interoperability/xml';

/** OOXML measures in English Metric Units: 914 400 EMU per inch, i.e. 9 525 per pixel at 96 dpi. */
export const EMU_PER_PIXEL = 9_525;
/** 1 mm = 36000 EMU. */
export const EMU_PER_MILLIMETER = 36_000;

export const MAX_DOCX_IMAGES = 256;
export const MAX_DOCX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_DOCX_IMAGE_TOTAL_BYTES = 64 * 1024 * 1024;

interface ImageFormat {
  readonly extension: string;
  readonly contentType: string;
}

const IMAGE_FORMATS: Readonly<Record<string, ImageFormat>> = Object.freeze({
  'image/png': { extension: 'png', contentType: 'image/png' },
  'image/jpeg': { extension: 'jpg', contentType: 'image/jpeg' },
  'image/jpg': { extension: 'jpg', contentType: 'image/jpeg' },
  'image/gif': { extension: 'gif', contentType: 'image/gif' },
  'image/webp': { extension: 'webp', contentType: 'image/webp' },
  'image/bmp': { extension: 'bmp', contentType: 'image/bmp' },
});

/** One embedded picture: the package part, plus the drawing that points at it. */
export interface DocxImagePart {
  readonly relationshipId: string;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly extension: string;
}

export interface DocxImageResource {
  readonly image: WriterImageBlockData;
  readonly relationshipId: string;
  readonly widthEmu: number;
  readonly heightEmu: number;
}

export interface DocxImagePackage {
  readonly parts: readonly DocxImagePart[];
  readonly resources: readonly DocxImageResource[];
  /** Extensions that need a `<Default Extension=…>` entry in `[Content_Types].xml`. */
  readonly extensions: readonly string[];
}

export class DocxImageExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxImageExportError';
  }
}

/**
 * How an error refers to one image — W-297.
 *
 * The export blocked on a foreign image format and said **what** was wrong ("unterstützt das Bildformat
 * image/webp nicht") but never **which** image, so in a document with thirty pictures the user had to guess.
 * The subject names the image by its own name (or its alternative text as a fallback, or plainly "ohne
 * Namen") and by its position.
 *
 * It deliberately never contains the data URL: an error message travels into logs and dialogs, and a base64
 * image inside one is both a leak and unreadable.
 */
function describeImage(image: WriterImageBlockData, index: number, total: number): string {
  const name = image.name?.normalize('NFC').trim() || image.altText?.normalize('NFC').trim() || 'ohne Namen';
  return `Bild „${name}" (${index + 1} von ${total})`;
}

/** Bytes of a base64 data URL, or a reason why they cannot be had. `subject` names the image (W-297). */
function decodeImageDataUrl(dataUrl: string, subject: string): { bytes: Uint8Array; format: ImageFormat } {
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.*)$/isu.exec(dataUrl.trim());
  if (!match) {
    throw new DocxImageExportError(`${subject}: DOCX-Export kann nur Bilder aus Daten-URLs einbetten.`);
  }
  const mimeType = match[1]!.toLowerCase();
  const format = IMAGE_FORMATS[mimeType];
  if (!format) {
    throw new DocxImageExportError(`${subject}: DOCX-Export unterstützt das Bildformat ${mimeType} nicht.`);
  }
  const payload = match[2]!.replace(/\s+/gu, '');
  if (payload.length === 0) throw new DocxImageExportError(`${subject}: Das Bild enthält keine Daten.`);
  let binary: string;
  try {
    binary = atob(payload);
  } catch {
    throw new DocxImageExportError(`${subject}: Die Bilddaten sind kein gültiges Base64.`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.byteLength > MAX_DOCX_IMAGE_BYTES) {
    throw new DocxImageExportError(`${subject}: Das Bild ist für den DOCX-Export zu groß.`);
  }
  return { bytes, format };
}

/**
 * The size a picture gets on the page, in EMU.
 *
 * The width rule is the PDF's (`writerPdfExport.ts:274`): the requested share of the text column,
 * clamped to 20–100 %. The height follows the intrinsic aspect ratio; a picture without usable
 * dimensions falls back to a square of the same width instead of producing a zero-height drawing,
 * which Word refuses.
 */
export function resolveDocxImageSizeEmu(
  image: WriterImageBlockData,
  textColumnWidthMm: number,
): { widthEmu: number; heightEmu: number } {
  const share = Math.min(1, Math.max(0.2, (Number.isFinite(image.widthPercent) ? image.widthPercent : 100) / 100));
  const widthMm = Math.max(1, textColumnWidthMm) * share;
  const widthEmu = Math.round(widthMm * EMU_PER_MILLIMETER);
  const intrinsicWidth = Number.isFinite(image.intrinsicWidth) ? image.intrinsicWidth : 0;
  const intrinsicHeight = Number.isFinite(image.intrinsicHeight) ? image.intrinsicHeight : 0;
  const ratio = intrinsicWidth > 0 && intrinsicHeight > 0 ? intrinsicHeight / intrinsicWidth : 1;
  return { widthEmu, heightEmu: Math.round(widthEmu * ratio) };
}

/**
 * Collect the package parts for every anchorable image.
 *
 * `firstRelationshipId` is the next free `rId` in `word/_rels/document.xml.rels`; the caller owns the
 * numbering because header and footer parts already use some of it.
 */
export function collectDocxImagePackage(
  images: readonly WriterImageBlockData[],
  textColumnWidthMm: number,
  firstRelationshipId: number,
): DocxImagePackage {
  if (images.length > MAX_DOCX_IMAGES) {
    throw new DocxImageExportError(`DOCX-Export unterstützt höchstens ${MAX_DOCX_IMAGES} Bilder je Dokument.`);
  }
  const parts: DocxImagePart[] = [];
  const resources: DocxImageResource[] = [];
  const extensions = new Set<string>();
  let totalBytes = 0;
  images.forEach((image, index) => {
    // W-297: every message from here on names the image, so a blocked export is actionable.
    const subject = describeImage(image, index, images.length);
    const { bytes, format } = decodeImageDataUrl(image.dataUrl ?? '', subject);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_DOCX_IMAGE_TOTAL_BYTES) {
      throw new DocxImageExportError(`${subject}: Die Bilder des Dokuments sind für den DOCX-Export zusammen zu groß.`);
    }
    const relationshipId = `rId${firstRelationshipId + index}`;
    const name = `media/image${index + 1}.${format.extension}`;
    parts.push({ relationshipId, name, bytes, contentType: format.contentType, extension: format.extension });
    const { widthEmu, heightEmu } = resolveDocxImageSizeEmu(image, textColumnWidthMm);
    resources.push({ image, relationshipId, widthEmu, heightEmu });
    extensions.add(format.extension);
  });
  return { parts, resources, extensions: [...extensions] };
}

const DRAWING_NS = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function alignmentXml(alignment: WriterImageBlockData['alignment']): string {
  if (alignment === 'center') return '<w:pPr><w:jc w:val="center"/></w:pPr>';
  if (alignment === 'right') return '<w:pPr><w:jc w:val="right"/></w:pPr>';
  return '';
}

/**
 * The picture itself — shared by the inline and the anchored form.
 *
 * Kept in one place on purpose: inline and floating drawings differ in their positioning wrapper, never in
 * the picture inside it. Two copies of this would be two definitions of one fact, and the project has paid
 * for that mistake often enough.
 */
function graphicXml(
  resource: DocxImageResource,
  drawingId: number,
  name: string,
  description: string,
): string {
  const { relationshipId, widthEmu, heightEmu } = resource;
  return `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${drawingId}" name="${name}" descr="${description}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
}

const EMU_PER_MILLIMETER_EXPORT = 36_000;
/** Word's own default distances around a floating picture: a tenth of an inch left and right. */
const DEFAULT_SIDE_DISTANCE_MM = 3.2;

/** A distance the model asks for, or the default — never a negative or absurd value. */
function wrapDistanceEmu(value: number | undefined, fallbackMm: number): number {
  const millimetres = Number.isFinite(value) ? Math.max(0, Math.min(100, value as number)) : fallbackMm;
  return Math.round(millimetres * EMU_PER_MILLIMETER_EXPORT);
}

/**
 * The wrap element for an anchored picture (W-290).
 *
 * `wrapTight` and `wrapThrough` require a `wp:wrapPolygon` in the schema, and a polygon needs at least two
 * points. The Writer model carries no pixel outline of a picture, so the honest polygon for it is the full
 * rectangle — which is exactly what a tight wrap around a rectangular picture means. Anything finer would
 * be invented data.
 */
function wrapXml(mode: WriterTextWrapMode | undefined): string {
  const effective = mode === undefined || mode === 'inline' ? 'square' : mode;
  if (effective === 'top-bottom') return '<wp:wrapTopAndBottom/>';
  if (effective === 'behind-text' || effective === 'in-front-of-text') return '<wp:wrapNone/>';
  const polygon = '<wp:wrapPolygon edited="0"><wp:start x="0" y="0"/><wp:lineTo x="0" y="21600"/><wp:lineTo x="21600" y="21600"/><wp:lineTo x="21600" y="0"/><wp:lineTo x="0" y="0"/></wp:wrapPolygon>';
  if (effective === 'tight') return `<wp:wrapTight wrapText="bothSides">${polygon}</wp:wrapTight>`;
  if (effective === 'through') return `<wp:wrapThrough wrapText="bothSides">${polygon}</wp:wrapThrough>`;
  return '<wp:wrapSquare wrapText="bothSides"/>';
}

/**
 * One picture as an **anchored** (floating) drawing, so the text flows around it — W-290.
 *
 * Measured before this existed: `float-left` and `float-right` were exported as `<wp:inline>`, so a picture
 * the author had placed beside the text pushed the text down instead. The finding called the model
 * incomplete ("a floating picture would need positioning data the Writer model does not carry per page") —
 * but it does: `placement`, `wrapMode` and the four wrap distances are all there, and a float needs no page
 * coordinates, only a position relative to the column and the paragraph.
 *
 * The child order is the schema's (`simplePos`, `positionH`, `positionV`, `extent`, `effectExtent`, the wrap
 * element, `docPr`, `cNvGraphicFramePr`, `graphic`); Word rejects `CT_Anchor` otherwise.
 * `relativeHeight` is the z-order and must be unique per drawing, so the drawing id is used.
 */
function anchorXml(
  resource: DocxImageResource,
  drawingId: number,
  name: string,
  description: string,
): string {
  const { image, widthEmu, heightEmu } = resource;
  const behind = image.wrapMode === 'behind-text' ? '1' : '0';
  const align = image.placement === 'float-right' ? 'right' : 'left';
  const distT = wrapDistanceEmu(image.wrapDistanceTopMm, 0);
  const distB = wrapDistanceEmu(image.wrapDistanceBottomMm, 0);
  const distL = wrapDistanceEmu(image.wrapDistanceLeftMm, DEFAULT_SIDE_DISTANCE_MM);
  const distR = wrapDistanceEmu(image.wrapDistanceRightMm, DEFAULT_SIDE_DISTANCE_MM);
  return `<w:drawing ${DRAWING_NS}><wp:anchor distT="${distT}" distB="${distB}" distL="${distL}" distR="${distR}" simplePos="0" relativeHeight="${drawingId}" behindDoc="${behind}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>${align}</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${wrapXml(image.wrapMode)}<wp:docPr id="${drawingId}" name="${name}" descr="${description}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>${graphicXml(resource, drawingId, name, description)}</wp:anchor></w:drawing>`;
}

/**
 * One picture in its own paragraph — floating when the author floated it, inline otherwise.
 *
 * The namespaces are declared on `<w:drawing>` itself so the document element stays as it was. A floating
 * picture gets no `<w:jc>`: its position is explicit, and a paragraph alignment on top of it would move it a
 * second time.
 */
export function imageToWordXml(resource: DocxImageResource, drawingId: number): string {
  const { image, widthEmu, heightEmu } = resource;
  const name = escapeXml(image.name || `Bild ${drawingId}`);
  const description = escapeXml(image.altText || image.name || 'Bild');
  const caption = (image.caption ?? '').trim();
  const floating = image.placement === 'float-left' || image.placement === 'float-right';
  const drawing = floating
    ? anchorXml(resource, drawingId, name, description)
    : `<w:drawing ${DRAWING_NS}><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${drawingId}" name="${name}" descr="${description}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>${graphicXml(resource, drawingId, name, description)}</wp:inline></w:drawing>`;
  const picture = `<w:p>${floating ? '' : alignmentXml(image.alignment)}<w:r>${drawing}</w:r></w:p>`;
  if (!caption) return picture;
  const captionIsAbove = image.captionPosition === 'above';
  const captionXml = `<w:p><w:pPr><w:jc w:val="${image.alignment === 'right' ? 'right' : image.alignment === 'center' ? 'center' : 'left'}"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(caption)}</w:t></w:r></w:p>`;
  return captionIsAbove ? `${captionXml}${picture}` : `${picture}${captionXml}`;
}
