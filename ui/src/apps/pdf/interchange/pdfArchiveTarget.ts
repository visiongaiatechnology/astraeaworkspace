// STATUS: VGT PDF Studio — constrained, fail-closed PDF/A-2b raster archive target for structured documents.
// This is intentionally separate from the normal tagged/interactive export. It preserves visual appearance
// by rasterizing each canonical structured page locally, then serializing a minimal font-free archival PDF.

import type { PdfDocumentModel } from '../../../shared/contracts/workspace';
import { getPdfSrgbIccProfile } from '../../../shared/pdf/output-intents/pdfSrgbIccProfile';
import {
  browserPdfRasterRenderAdapter,
  structuredPdfPageToSvg,
  type PdfRasterRenderAdapter,
} from './raster/pdfStructuredRasterExport';

export interface PdfA2bArchiveOptions {
  dpi?: number;
  jpegQuality?: number;
  language?: string;
}

export interface PdfA2bPreflightReport {
  valid: boolean;
  checks: string[];
  failures: string[];
  pageCount: number;
  rasterized: true;
  textSemanticsPreserved: false;
}

/**
 * A stable identity for an archive warning — W-299.
 *
 * The warnings used to be matched **by array position** in the dialog: `warnings[index]` was looked up in a
 * parallel list of localized strings. That works until a warning is added, removed or reordered, and then
 * the user reads the wrong sentence — or a generic one, because the engine's own text was discarded.
 * A code travels with the meaning, so the interface can translate it and can still show the engine's own
 * sentence for a code it does not know yet.
 */
export type PdfA2bArchiveWarningCode =
  | 'rasterized-pages'
  | 'flattened-semantics'
  | 'certification-absent';

export interface PdfA2bArchiveWarning {
  readonly code: PdfA2bArchiveWarningCode;
  /** The engine's own sentence, in English: for logs, and for a code the interface does not know. */
  readonly detail: string;
}

export interface PdfA2bArchiveResult {
  bytes: Uint8Array;
  report: PdfA2bPreflightReport;
  warnings: readonly PdfA2bArchiveWarning[];
}

const MAX_ARCHIVE_PAGES = 2_000;
const MAX_PAGE_PIXELS = 40_000_000;
const MAX_TOTAL_PIXELS = 200_000_000;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MIN_DPI = 144;
const MAX_DPI = 300;

const encoder = new TextEncoder();
const byteLength = (value: string): number => encoder.encode(value).byteLength;

function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] ?? char));
}

function pdfEscape(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/\(/gu, '\\(').replace(/\)/gu, '\\)').replace(/[\r\n]/gu, ' ');
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const value of bytes) out += value.toString(16).padStart(2, '0').toUpperCase();
  return out;
}

function normalizedLanguage(input?: string): string {
  const value = (input ?? 'en-US').normalize('NFKC').trim();
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,3}$/u.test(value)) throw new Error('PDF/A language must be a bounded BCP-47 style tag.');
  return value;
}

function buildXmp(title: string): string {
  const safeTitle = xmlEscape((title || 'Astraea PDF Studio Archive').normalize('NFC').slice(0, 512));
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">` +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${safeTitle}</rdf:li></rdf:Alt></dc:title>` +
    `<pdf:Producer>VGT Workspace PDF Studio</pdf:Producer>` +
    `<xmp:CreatorTool>Astraea PDF Studio</xmp:CreatorTool>` +
    `<pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>` +
    `</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;
}

function streamBody(dictionary: string, data: string): string {
  return `<< ${dictionary} /Length ${byteLength(data)} >>\nstream\n${data}endstream`;
}

function assertStructuredModel(model: PdfDocumentModel): void {
  if (model.rawPdfDataUrl) throw new Error('PDF/A archive conversion for arbitrary native PDFs requires the standards renderer; structured documents only.');
  if (!Array.isArray(model.pages) || model.pages.length < 1 || model.pages.length > MAX_ARCHIVE_PAGES) throw new Error('PDF/A archive page count exceeds policy.');
  if (model.numPages !== model.pages.length) throw new Error('PDF/A archive page count is inconsistent.');
}

export function preflightPdfA2bArchive(bytes: Uint8Array, expectedPages?: number): PdfA2bPreflightReport {
  const checks: string[] = [];
  const failures: string[] = [];
  const fail = (condition: boolean, success: string, failure: string): void => {
    if (condition) checks.push(success); else failures.push(failure);
  };
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 512 || bytes.byteLength > MAX_ARCHIVE_BYTES) {
    return { valid: false, checks, failures: ['PDF/A archive byte-size boundary violation'], pageCount: 0, rasterized: true, textSemanticsPreserved: false };
  }
  const text = new TextDecoder('latin1').decode(bytes);
  const pageCount = (text.match(/\/Type\s*\/Page\b/gu) ?? []).length;
  fail(text.startsWith('%PDF-1.7\n'), 'PDF 1.7 header', 'PDF/A-2 archive requires PDF 1.7 header');
  fail(text.includes('xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"'), 'PDF/A XMP namespace', 'PDF/A identification namespace missing');
  fail(text.includes('<pdfaid:part>2</pdfaid:part>'), 'PDF/A part 2 declaration', 'PDF/A part 2 declaration missing');
  fail(text.includes('<pdfaid:conformance>B</pdfaid:conformance>'), 'PDF/A conformance B declaration', 'PDF/A conformance B declaration missing');
  fail(/\/Type\s*\/Metadata\s*\/Subtype\s*\/XML/u.test(text), 'XMP metadata stream', 'XMP metadata stream missing');
  fail(/\/Metadata\s+\d+\s+0\s+R/u.test(text), 'catalog metadata reference', 'Catalog metadata reference missing');
  fail(/\/OutputIntents\s*\[/u.test(text), 'output intent reference', 'PDF/A OutputIntent reference missing');
  fail(/\/Type\s*\/OutputIntent\b/u.test(text) && /\/S\s*\/GTS_PDFA1\b/u.test(text), 'PDF/A OutputIntent dictionary', 'PDF/A OutputIntent dictionary invalid');
  fail(/\/DestOutputProfile\s+\d+\s+0\s+R/u.test(text), 'ICC profile reference', 'ICC destination profile missing');
  fail(/\/N\s+3\b/u.test(text) && /\/Alternate\s*\/DeviceRGB\b/u.test(text), 'RGB ICC declaration', 'RGB ICC profile declaration missing');
  fail(!/\/Type\s*\/Font\b/u.test(text), 'font-free raster archive', 'Archive unexpectedly contains font resources');
  fail(!/(?:^|\s)(?:Tj|TJ)(?:\s|$)/mu.test(text), 'no raw text operators', 'Archive unexpectedly contains text-show operators');
  fail(!/\/Encrypt\b/u.test(text), 'not encrypted', 'PDF/A archive must not be encrypted');
  fail(!/\/(?:JavaScript|JS|Launch|RichMedia|Movie|EmbeddedFile|AcroForm|OCProperties)\b/u.test(text), 'no forbidden active/hidden constructs', 'Archive contains forbidden active or hidden constructs');
  fail(pageCount > 0 && (expectedPages === undefined || pageCount === expectedPages), 'page count', 'PDF/A archive page count mismatch');
  fail(/startxref\s+\d+\s+%%EOF\s*$/u.test(text), 'xref/trailer terminator', 'PDF/A archive trailer/xref terminator missing');
  return { valid: failures.length === 0, checks, failures, pageCount, rasterized: true, textSemanticsPreserved: false };
}

export async function buildStructuredPdfA2bArchive(
  title: string,
  model: PdfDocumentModel,
  options: PdfA2bArchiveOptions = {},
  adapter: PdfRasterRenderAdapter = browserPdfRasterRenderAdapter,
): Promise<PdfA2bArchiveResult> {
  assertStructuredModel(model);
  const dpi = Number.isFinite(options.dpi) ? Number(options.dpi) : 200;
  const jpegQuality = Number.isFinite(options.jpegQuality) ? Number(options.jpegQuality) : 0.92;
  const language = normalizedLanguage(options.language);
  if (dpi < MIN_DPI || dpi > MAX_DPI) throw new Error(`PDF/A archive DPI must be between ${MIN_DPI} and ${MAX_DPI}.`);
  if (jpegQuality < 0.75 || jpegQuality > 1) throw new Error('PDF/A archive JPEG quality must be between 0.75 and 1.0.');

  const objects: string[] = [];
  const add = (body: string): number => { objects.push(body); return objects.length; };
  const catalogId = add('');
  const pagesId = add('');

  const icc = getPdfSrgbIccProfile();
  const iccData = `${hex(icc)}>\n`;
  const iccId = add(streamBody('/N 3 /Alternate /DeviceRGB /Filter /ASCIIHexDecode', iccData));
  const outputIntentId = add(`<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB) /Info (sRGB IEC61966-2.1 compatible) /DestOutputProfile ${iccId} 0 R >>`);
  const xmp = `${buildXmp(title)}\n`;
  const metadataId = add(streamBody('/Type /Metadata /Subtype /XML', xmp));

  const pageIds: number[] = [];
  let totalPixels = 0;
  let estimatedEncodedBytes = 0;
  for (const page of model.pages) {
    const presentation = structuredPdfPageToSvg(model, page);
    const widthPx = Math.max(1, Math.round((presentation.widthPt / 72) * dpi));
    const heightPx = Math.max(1, Math.round((presentation.heightPt / 72) * dpi));
    const pixels = widthPx * heightPx;
    if (pixels > MAX_PAGE_PIXELS) throw new Error(`PDF/A archive page ${page.pageNumber} exceeds the raster pixel budget.`);
    totalPixels += pixels;
    if (totalPixels > MAX_TOTAL_PIXELS) throw new Error('PDF/A archive total raster pixel budget exceeded.');
    const frame = await adapter.rasterizeSvg({ svg: presentation.svg, widthPx, heightPx, jpegQuality });
    if (frame.rgba.byteLength !== pixels * 4 || frame.jpeg.byteLength < 64) throw new Error(`PDF/A archive raster adapter returned invalid page ${page.pageNumber} data.`);
    estimatedEncodedBytes += frame.jpeg.byteLength * 2;
    if (estimatedEncodedBytes > MAX_ARCHIVE_BYTES) throw new Error('PDF/A archive encoded image budget exceeded.');
    const imageData = `${hex(frame.jpeg)}>\n`;
    const imageId = add(streamBody(`/Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode]`, imageData));
    const content = `q\n${presentation.widthPt.toFixed(4)} 0 0 ${presentation.heightPt.toFixed(4)} 0 0 cm\n/Im${page.pageNumber} Do\nQ\n`;
    const contentId = add(streamBody('', content));
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${presentation.widthPt.toFixed(4)} ${presentation.heightPt.toFixed(4)}] /Resources << /XObject << /Im${page.pageNumber} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /Metadata ${metadataId} 0 R /OutputIntents [${outputIntentId} 0 R] /Lang (${pdfEscape(language)}) >>`;
  const infoId = add('<< /Producer (VGT Workspace PDF Studio) >>');

  let pdf = '%PDF-1.7\n%VGT-PDFA-2B\n';
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = encoder.encode(pdf);
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error('PDF/A archive output byte budget exceeded.');
  const report = preflightPdfA2bArchive(bytes, model.pages.length);
  if (!report.valid) throw new Error(`PDF/A-2b archive preflight failed: ${report.failures.join('; ')}`);
  return {
    bytes,
    report,
    warnings: [
      {
        code: 'rasterized-pages',
        detail: 'Archive conversion rasterizes visible structured pages to eliminate unembedded-font dependencies.',
      },
      {
        code: 'flattened-semantics',
        detail: 'Interactive forms, links, annotations, searchable text and semantic tags are flattened into the archival page image.',
      },
      {
        code: 'certification-absent',
        detail: 'This is a constrained PDF/A-2b target with deterministic local preflight; external certification remains a separate organizational process.',
      },
    ],
  };
}
