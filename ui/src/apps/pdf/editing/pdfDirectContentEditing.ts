// STATUS: DIAMANT VGT SUPREME
// Bounded direct-content editing core for Astraea structured PDFs.
// Arbitrary native PDFs remain preserve-only until the standards parser/renderer adapter is available.

import type {
  PdfBase14Font,
  PdfDocumentModel,
  PdfImageCrop,
  PdfLinkObject,
  PdfPageBox,
  PdfPageImage,
  PdfSectionModel,
  PdfTextStyle,
  PdfVectorObject,
} from '../../../shared/contracts/workspace';

const MAX_PAGES = 10_000;
const MAX_SECTIONS_PER_PAGE = 4_096;
const MAX_IMAGES_PER_PAGE = 64;
const MAX_VECTORS_PER_PAGE = 4_096;
const MAX_LINKS_PER_PAGE = 4_096;
const MAX_TEXT_CHARS = 2 * 1024 * 1024;
const MAX_FONT_NAME = 128;
const MAX_URL_LENGTH = 2_048;
const MAX_JPEG_BYTES = 16 * 1024 * 1024;

export interface PdfFontResolution {
  requested: string;
  resolved: PdfBase14Font;
  substituted: boolean;
  reason?: string;
}

export interface PdfEditFidelityReport {
  exactStructuredEditing: boolean;
  nativePdfPreservedOnly: boolean;
  fontSubstitutions: PdfFontResolution[];
  warnings: string[];
}

export interface PdfTextBlockDraft {
  id?: string;
  type?: PdfSectionModel['type'];
  content: string;
  bounds?: PdfPageBox;
  style?: PdfTextStyle;
  zIndex?: number;
}

const HELVETICA_WIDTHS: Record<string, number> = {
  ' ':278,'!':278,'"':355,'#':556,'$':556,'%':889,'&':667,"'":191,'(':333,')':333,'*':389,'+':584,',':278,'-':333,'.':278,'/':278,
  ':':278,';':278,'<':584,'=':584,'>':584,'?':556,'@':1015,'[':278,'\\':278,']':278,'^':469,'_':556,'`':333,'{':334,'|':260,'}':334,'~':584,
};
const TIMES_WIDTHS: Record<string, number> = {
  ' ':250,'!':333,'"':408,'#':500,'$':500,'%':833,'&':778,"'":180,'(':333,')':333,'*':500,'+':564,',':250,'-':333,'.':250,'/':278,
  ':':278,';':278,'<':564,'=':564,'>':564,'?':444,'@':921,'[':333,'\\':278,']':333,'^':469,'_':500,'`':333,'{':480,'|':200,'}':480,'~':541,
};

const HELVETICA_UPPER = [667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611];
const HELVETICA_LOWER = [556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500];
const TIMES_UPPER = [722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611];
const TIMES_LOWER = [444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444];

const glyphWidth = (font: PdfBase14Font, ch: string): number => {
  if (font === 'Courier') return 600;
  if (/^[0-9]$/u.test(ch)) return font === 'Times-Roman' ? 500 : 556;
  const upper = ch.charCodeAt(0) - 65;
  if (upper >= 0 && upper < 26) return (font === 'Times-Roman' ? TIMES_UPPER : HELVETICA_UPPER)[upper];
  const lower = ch.charCodeAt(0) - 97;
  if (lower >= 0 && lower < 26) return (font === 'Times-Roman' ? TIMES_LOWER : HELVETICA_LOWER)[lower];
  const table = font === 'Times-Roman' ? TIMES_WIDTHS : HELVETICA_WIDTHS;
  const base = table[ch] ?? 556;
  return font === 'Helvetica-Bold' ? Math.round(base * 1.03) : base;
};

const assertFinite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
};

const boundedText = (value: string, max: number, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const normalized = value.replace(/\r\n?/g, '\n');
  if (normalized.length > max) throw new Error(`${label} exceeds the ${max.toLocaleString()} character policy.`);
  return normalized;
};

const pageBox = (model: PdfDocumentModel, pageNumber: number): PdfPageBox => {
  const page = model.pages.find((candidate) => candidate.pageNumber === pageNumber);
  if (!page) throw new Error(`PDF page ${pageNumber} does not exist.`);
  return page.mediaBox ?? { x: 0, y: 0, width: 595.28, height: 841.89 };
};

export const clampPdfBox = (box: PdfPageBox, media: PdfPageBox): PdfPageBox => {
  const x = assertFinite(box.x, 'x');
  const y = assertFinite(box.y, 'y');
  const width = assertFinite(box.width, 'width');
  const height = assertFinite(box.height, 'height');
  if (width <= 0 || height <= 0) throw new Error('Object bounds must have positive width and height.');
  const left = Math.max(media.x, Math.min(media.x + media.width, x));
  const bottom = Math.max(media.y, Math.min(media.y + media.height, y));
  const right = Math.max(left + 0.1, Math.min(media.x + media.width, x + width));
  const top = Math.max(bottom + 0.1, Math.min(media.y + media.height, y + height));
  return { x: left, y: bottom, width: right - left, height: top - bottom };
};

export const resolvePdfBase14Font = (requestedRaw: string | undefined, bold = false): PdfFontResolution => {
  const requested = boundedText((requestedRaw ?? '').trim() || (bold ? 'Helvetica-Bold' : 'Helvetica'), MAX_FONT_NAME, 'Font name');
  const key = requested.toLowerCase().replace(/[\s_-]+/g, '');
  let resolved: PdfBase14Font;
  if (key.includes('courier') || key.includes('mono')) resolved = 'Courier';
  else if (key.includes('times') || key.includes('serif') || key.includes('georgia')) resolved = 'Times-Roman';
  else if (bold || key.includes('bold')) resolved = 'Helvetica-Bold';
  else resolved = 'Helvetica';
  const direct = ['helvetica','helveticabold','timesroman','courier'].includes(key);
  return {
    requested,
    resolved,
    substituted: !direct,
    ...(!direct ? { reason: `Font "${requested}" is unavailable in the bounded Base-14 export path; substituted with ${resolved}.` } : {}),
  };
};

export const measurePdfBase14Text = (text: string, font: PdfBase14Font, fontSize: number): number => {
  const size = Math.max(1, Math.min(144, assertFinite(fontSize, 'Font size')));
  let units = 0;
  for (const ch of boundedText(text, MAX_TEXT_CHARS, 'Text')) units += glyphWidth(font, ch);
  return units * size / 1000;
};

export const reflowPdfText = (textRaw: string, maxWidth: number, style: PdfTextStyle = {}): string[] => {
  const text = boundedText(textRaw, MAX_TEXT_CHARS, 'Text');
  const width = Math.max(1, assertFinite(maxWidth, 'Reflow width'));
  const resolution = resolvePdfBase14Font(style.requestedFont ?? style.resolvedFont, style.resolvedFont === 'Helvetica-Bold');
  const fontSize = Math.max(4, Math.min(144, style.fontSize ?? 10));
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/u).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || measurePdfBase14Text(candidate, resolution.resolved, fontSize) <= width) {
        current = candidate;
        continue;
      }
      lines.push(current);
      if (measurePdfBase14Text(word, resolution.resolved, fontSize) <= width) { current = word; continue; }
      let fragment = '';
      for (const ch of word) {
        const next = fragment + ch;
        if (fragment && measurePdfBase14Text(next, resolution.resolved, fontSize) > width) {
          lines.push(fragment);
          fragment = ch;
        } else fragment = next;
      }
      current = fragment;
    }
    if (current) lines.push(current);
  }
  return lines;
};

const validateModel = (model: PdfDocumentModel): void => {
  if (model.rawPdfDataUrl) throw new Error('Direct structured editing is unavailable for arbitrary native PDFs. Exact edit fidelity cannot be proven; use preserve-only mode.');
  if (model.pages.length > MAX_PAGES) throw new Error('PDF exceeds the page editing budget.');
};

const uniqueId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

export function upsertPdfTextBlock(model: PdfDocumentModel, pageNumber: number, draft: PdfTextBlockDraft): PdfDocumentModel {
  validateModel(model);
  const media = pageBox(model, pageNumber);
  const content = boundedText(draft.content, MAX_TEXT_CHARS, 'Text block');
  const id = boundedText(draft.id?.trim() || uniqueId('pdf-text'), 256, 'Text block id');
  const resolved = resolvePdfBase14Font(draft.style?.requestedFont ?? draft.style?.resolvedFont, draft.type === 'header');
  const style: PdfTextStyle = {
    ...draft.style,
    requestedFont: draft.style?.requestedFont ?? resolved.requested,
    resolvedFont: resolved.resolved,
    fontSize: Math.max(4, Math.min(144, draft.style?.fontSize ?? (draft.type === 'header' ? 13 : 10))),
    lineHeight: Math.max(0.8, Math.min(3, draft.style?.lineHeight ?? 1.35)),
  };
  const bounds = draft.bounds ? clampPdfBox(draft.bounds, media) : undefined;
  return {
    ...model,
    pages: model.pages.map((page) => {
      if (page.pageNumber !== pageNumber) return page;
      const existingIndex = page.sections.findIndex((section) => section.id === id);
      const section: PdfSectionModel = {
        ...(existingIndex >= 0 ? page.sections[existingIndex] : {} as PdfSectionModel),
        id,
        type: draft.type ?? (existingIndex >= 0 ? page.sections[existingIndex].type : 'paragraph'),
        content,
        ...(bounds ? { bounds } : {}),
        style,
        zIndex: Math.max(-10_000, Math.min(10_000, Math.trunc(draft.zIndex ?? (existingIndex >= 0 ? page.sections[existingIndex].zIndex ?? 0 : 0)))),
      };
      const sections = [...page.sections];
      if (existingIndex >= 0) sections[existingIndex] = section;
      else {
        if (sections.length >= MAX_SECTIONS_PER_PAGE) throw new Error(`Page ${pageNumber} exceeds the text-block editing budget.`);
        sections.push(section);
      }
      return { ...page, sections };
    }),
  };
}

export function deletePdfTextBlock(model: PdfDocumentModel, pageNumber: number, sectionId: string): PdfDocumentModel {
  validateModel(model);
  return {
    ...model,
    pages: model.pages.map((page) => page.pageNumber === pageNumber ? { ...page, sections: page.sections.filter((section) => section.id !== sectionId) } : page),
    annotations: model.annotations.filter((annotation) => !(annotation.page === pageNumber && annotation.sectionId === sectionId)),
  };
}

const normalizeCrop = (crop: PdfImageCrop | undefined): PdfImageCrop | undefined => {
  if (!crop) return undefined;
  const left = Math.max(0, Math.min(0.99, assertFinite(crop.left, 'Crop left')));
  const top = Math.max(0, Math.min(0.99, assertFinite(crop.top, 'Crop top')));
  const right = Math.max(0, Math.min(0.99, assertFinite(crop.right, 'Crop right')));
  const bottom = Math.max(0, Math.min(0.99, assertFinite(crop.bottom, 'Crop bottom')));
  if (left + right >= 0.99 || top + bottom >= 0.99) throw new Error('Image crop removes the entire image.');
  return { left, top, right, bottom };
};

const assertJpegDataUrl = (dataUrl: string): void => {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl);
  if (!match) throw new Error('Replacement image must be a normalized local JPEG data URL.');
  if (match[1].length > Math.ceil(MAX_JPEG_BYTES * 4 / 3) + 8) throw new Error('Replacement image exceeds the encoded-size policy.');
};

export function insertPdfImage(model: PdfDocumentModel, pageNumber: number, image: Omit<PdfPageImage, 'id' | 'mimeType'> & { id?: string }): PdfDocumentModel {
  validateModel(model);
  const media = pageBox(model, pageNumber);
  assertJpegDataUrl(image.dataUrl);
  if (!Number.isInteger(image.widthPx) || !Number.isInteger(image.heightPx) || image.widthPx < 1 || image.heightPx < 1 || image.widthPx > 32_768 || image.heightPx > 32_768) throw new Error('Image dimensions exceed policy.');
  const normalized: PdfPageImage = {
    ...image,
    id: boundedText(image.id?.trim() || uniqueId('pdf-image'), 256, 'Image id'),
    mimeType: 'image/jpeg',
    bounds: clampPdfBox(image.bounds, media),
    crop: normalizeCrop(image.crop),
    rotation: image.rotation ?? 0,
    zIndex: Math.max(-10_000, Math.min(10_000, Math.trunc(image.zIndex ?? 0))),
    altText: image.altText !== undefined ? boundedText(image.altText, 2_000, 'Image alt text') : undefined,
  };
  return {
    ...model,
    pages: model.pages.map((page) => {
      if (page.pageNumber !== pageNumber) return page;
      const images = [...(page.images ?? [])];
      if (images.length >= MAX_IMAGES_PER_PAGE) throw new Error(`Page ${pageNumber} exceeds the image editing budget.`);
      if (images.some((candidate) => candidate.id === normalized.id)) throw new Error(`Image id ${normalized.id} already exists on page ${pageNumber}.`);
      images.push(normalized);
      return { ...page, images };
    }),
  };
}

export function updatePdfImage(model: PdfDocumentModel, pageNumber: number, imageId: string, patch: Partial<Pick<PdfPageImage, 'dataUrl' | 'widthPx' | 'heightPx' | 'bounds' | 'altText' | 'crop' | 'rotation' | 'zIndex'>>): PdfDocumentModel {
  validateModel(model);
  const media = pageBox(model, pageNumber);
  return {
    ...model,
    pages: model.pages.map((page) => {
      if (page.pageNumber !== pageNumber) return page;
      const images = (page.images ?? []).map((image) => {
        if (image.id !== imageId) return image;
        if (patch.dataUrl) assertJpegDataUrl(patch.dataUrl);
        const widthPx = patch.widthPx ?? image.widthPx;
        const heightPx = patch.heightPx ?? image.heightPx;
        if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx < 1 || heightPx < 1 || widthPx > 32_768 || heightPx > 32_768) throw new Error('Replacement image dimensions exceed policy.');
        return {
          ...image,
          ...patch,
          widthPx,
          heightPx,
          bounds: patch.bounds ? clampPdfBox(patch.bounds, media) : image.bounds,
          crop: normalizeCrop(patch.crop ?? image.crop),
          rotation: patch.rotation ?? image.rotation ?? 0,
          zIndex: Math.max(-10_000, Math.min(10_000, Math.trunc(patch.zIndex ?? image.zIndex ?? 0))),
          altText: patch.altText !== undefined ? boundedText(patch.altText, 2_000, 'Image alt text') : image.altText,
        };
      });
      if (!images.some((image) => image.id === imageId)) throw new Error(`Image ${imageId} does not exist on page ${pageNumber}.`);
      return { ...page, images };
    }),
  };
}

export function upsertPdfVector(model: PdfDocumentModel, pageNumber: number, vector: PdfVectorObject): PdfDocumentModel {
  validateModel(model);
  const media = pageBox(model, pageNumber);
  const normalized: PdfVectorObject = {
    ...vector,
    id: boundedText(vector.id?.trim() || uniqueId('pdf-vector'), 256, 'Vector id'),
    bounds: clampPdfBox(vector.bounds, media),
    strokeColor: /^#[0-9a-fA-F]{6}$/u.test(vector.strokeColor) ? vector.strokeColor : '#000000',
    fillColor: vector.fillColor && /^#[0-9a-fA-F]{6}$/u.test(vector.fillColor) ? vector.fillColor : undefined,
    lineWidth: Math.max(0.1, Math.min(50, vector.lineWidth ?? 1)),
    zIndex: Math.max(-10_000, Math.min(10_000, Math.trunc(vector.zIndex ?? 0))),
  };
  return {
    ...model,
    pages: model.pages.map((page) => {
      if (page.pageNumber !== pageNumber) return page;
      const vectors = [...(page.vectors ?? [])];
      const index = vectors.findIndex((item) => item.id === normalized.id);
      if (index >= 0) vectors[index] = normalized;
      else {
        if (vectors.length >= MAX_VECTORS_PER_PAGE) throw new Error(`Page ${pageNumber} exceeds the vector-object editing budget.`);
        vectors.push(normalized);
      }
      return { ...page, vectors };
    }),
  };
}

export function deletePdfVector(model: PdfDocumentModel, pageNumber: number, vectorId: string): PdfDocumentModel {
  validateModel(model);
  return { ...model, pages: model.pages.map((page) => page.pageNumber === pageNumber ? { ...page, vectors: (page.vectors ?? []).filter((item) => item.id !== vectorId) } : page) };
}

const normalizeLink = (link: PdfLinkObject, pageCount: number, media: PdfPageBox): PdfLinkObject => {
  const id = boundedText(link.id?.trim() || uniqueId('pdf-link'), 256, 'Link id');
  if (link.target.kind === 'url') {
    const raw = boundedText(link.target.url.trim(), MAX_URL_LENGTH, 'Link URL');
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('PDF links may target only HTTP(S) URLs or internal pages.');
    if (parsed.username || parsed.password) throw new Error('Credential-bearing PDF URLs are forbidden.');
    return { id, bounds: clampPdfBox(link.bounds, media), target: { kind: 'url', url: parsed.toString() } };
  }
  if (!Number.isInteger(link.target.pageNumber) || link.target.pageNumber < 1 || link.target.pageNumber > pageCount) throw new Error('Internal PDF link page is outside the document.');
  return { id, bounds: clampPdfBox(link.bounds, media), target: { kind: 'page', pageNumber: link.target.pageNumber } };
};

export function upsertPdfLink(model: PdfDocumentModel, pageNumber: number, link: PdfLinkObject): PdfDocumentModel {
  validateModel(model);
  const media = pageBox(model, pageNumber);
  const normalized = normalizeLink(link, model.pages.length, media);
  return {
    ...model,
    pages: model.pages.map((page) => {
      if (page.pageNumber !== pageNumber) return page;
      const links = [...(page.links ?? [])];
      const index = links.findIndex((item) => item.id === normalized.id);
      if (index >= 0) links[index] = normalized;
      else {
        if (links.length >= MAX_LINKS_PER_PAGE) throw new Error(`Page ${pageNumber} exceeds the link editing budget.`);
        links.push(normalized);
      }
      return { ...page, links };
    }),
  };
}

export function deletePdfLink(model: PdfDocumentModel, pageNumber: number, linkId: string): PdfDocumentModel {
  validateModel(model);
  return { ...model, pages: model.pages.map((page) => page.pageNumber === pageNumber ? { ...page, links: (page.links ?? []).filter((item) => item.id !== linkId) } : page) };
}

export function inspectPdfEditFidelity(model: PdfDocumentModel): PdfEditFidelityReport {
  const fontSubstitutions: PdfFontResolution[] = [];
  for (const page of model.pages) {
    for (const section of page.sections) {
      if (!section.style?.requestedFont) continue;
      const resolved = resolvePdfBase14Font(section.style.requestedFont, section.type === 'header');
      if (resolved.substituted) fontSubstitutions.push(resolved);
    }
  }
  const native = Boolean(model.rawPdfDataUrl);
  const warnings = native
    ? ['Exact edit fidelity is unavailable for arbitrary imported PDFs until the standards parser/renderer adapter is active. Native bytes remain preserve-only.']
    : fontSubstitutions.map((entry) => entry.reason!).filter(Boolean);
  return { exactStructuredEditing: !native, nativePdfPreservedOnly: native, fontSubstitutions, warnings };
}
