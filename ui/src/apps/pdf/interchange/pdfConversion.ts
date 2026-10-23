// STATUS: DIAMANT VGT SUPREME — bounded structured-PDF conversion bridge.
// Foreign/native PDFs remain outside this bridge until the standards parser/renderer is available.

import type { PdfDocumentModel, PdfPageModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { createNewDocument } from '../../../edition/contracts/documentFactory';
import { exportDocx } from '../../../platform/interop/docx';
import { exportXlsx } from '../../../platform/interop/xlsx';
import { exportPptx } from '../../../platform/interop/pptx';
import { writeStoredZip } from '../../../platform/interop/zip';
import { buildStructuredPdfBytes } from './structuredPdfExport';
import { workspaceSourceToPdfPages } from '../integrations/pdfWorkspaceActions';
import { createPdfModelFromNormalizedJpegs, type PdfNormalizedJpegSource } from '../media/import/pdfImageImport';
import { structuredPdfBookmarks } from '../navigation/pdfStructuredNavigation';

export type PdfOfficeConversionFormat = 'docx' | 'xlsx' | 'pptx';
export type PdfTextConversionFormat = 'text' | 'html';
export type PdfConversionFormat = PdfOfficeConversionFormat | PdfTextConversionFormat;

export interface PdfConversionArtifact {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  sourcePages: number;
  warnings: string[];
}

export interface PdfBatchConversionInput {
  title: string;
  model: PdfDocumentModel;
}

export interface PdfBatchConversionResult {
  artifacts: PdfConversionArtifact[];
  totalInputPages: number;
  totalOutputBytes: number;
}

export const PDF_CONVERSION_LIMITS = Object.freeze({
  maxPagesPerDocument: 2_000,
  maxSectionsPerPage: 4_096,
  maxInputTextBytes: 32 * 1024 * 1024,
  maxBatchDocuments: 64,
  maxBatchPages: 10_000,
  maxBatchOutputBytes: 128 * 1024 * 1024,
  maxCellText: 32_000,
  maxCreationSources: 32,
  maxCreationPages: 10_000,
});

function safeName(title: string): string {
  return (title || 'document').replace(/\.(?:pdf|docx|xlsx|pptx|html|txt)$/iu, '').replace(/[^a-z0-9._-]+/giu, '_').slice(0, 120) || 'document';
}


const PDF_CREATION_SOURCE_KINDS = new Set(['Writer', 'Grid', 'Present', 'Notes', 'Whiteboard']);

export function isPdfCreationWorkspaceSource(document: WorkspaceDocument): boolean {
  return PDF_CREATION_SOURCE_KINDS.has(document.kind) || (document.kind === 'PdfStudio' && Boolean(document.pdfData?.pages?.length) && !document.pdfData?.rawPdfDataUrl);
}

function cloneCreationPages(document: WorkspaceDocument, sourceIndex: number): PdfPageModel[] {
  const pages = document.kind === 'PdfStudio'
    ? (() => {
        if (!document.pdfData) throw new Error('Structured PDF source is missing its canonical model.');
        assertStructuredModel(document.pdfData, document.title);
        return document.pdfData.pages;
      })()
    : workspaceSourceToPdfPages(document);
  const sourceKey = `${sourceIndex + 1}-${document.id.replace(/[^a-z0-9_-]/giu, '_').slice(0, 80)}`;
  return pages.map((page) => ({
    ...page,
    sections: page.sections.map((section, sectionIndex) => ({ ...section, id: `mix-${sourceKey}-section-${sectionIndex + 1}-${section.id}` })),
    images: page.images?.map((image, imageIndex) => ({ ...image, id: `mix-${sourceKey}-image-${imageIndex + 1}-${image.id}` })),
  }));
}

export function createPdfFromMixedSources(
  title: string,
  workspaceSources: readonly WorkspaceDocument[],
  imageSources: readonly PdfNormalizedJpegSource[] = [],
): PdfConversionArtifact {
  if (workspaceSources.length + imageSources.length < 1) throw new Error('PDF creation requires at least one workspace document or local image.');
  if (workspaceSources.length > PDF_CONVERSION_LIMITS.maxCreationSources) throw new Error('Workspace source count exceeds the PDF creation policy.');
  const pages: PdfPageModel[] = [];
  for (const [sourceIndex, document] of workspaceSources.entries()) {
    if (!isPdfCreationWorkspaceSource(document)) throw new Error(`${document.title}: unsupported PDF creation source kind ${document.kind}.`);
    pages.push(...cloneCreationPages(document, sourceIndex));
    if (pages.length > PDF_CONVERSION_LIMITS.maxCreationPages) throw new Error('PDF creation page budget exceeded.');
  }
  if (imageSources.length) {
    const imageModel = createPdfModelFromNormalizedJpegs(imageSources);
    pages.push(...imageModel.pages.map((page, index) => ({
      ...page,
      images: page.images?.map((image) => ({ ...image, id: `mix-image-${index + 1}-${image.id}` })),
    })));
  }
  if (pages.length < 1 || pages.length > PDF_CONVERSION_LIMITS.maxCreationPages) throw new Error('PDF creation page count exceeds policy.');
  const normalizedPages = pages.map((page, index) => ({ ...page, pageNumber: index + 1 }));
  const model: PdfDocumentModel = { numPages: normalizedPages.length, pages: normalizedPages, annotations: [], redactions: [] };
  const bytes = buildStructuredPdfBytes(title || 'Mixed source PDF', model, { taggedStructure: true, includeSrgbOutputIntent: true, language: 'en-US' });
  if (bytes.byteLength > PDF_CONVERSION_LIMITS.maxBatchOutputBytes) throw new Error('Created PDF exceeds the output-size policy.');
  return {
    fileName: `${safeName(title || 'mixed-source')}.pdf`,
    mimeType: 'application/pdf',
    bytes,
    sourcePages: normalizedPages.length,
    warnings: ['Workspace sources are semantically reflowed into PDF Studio pages; exact source-app coordinates are preserved only where the canonical source exposes them.'],
  };
}

function assertStructuredModel(model: PdfDocumentModel, label = 'PDF'): void {
  if (model.rawPdfDataUrl) throw new Error(`${label}: native PDF conversion requires the standards parser/renderer.`);
  if (!Array.isArray(model.pages) || model.pages.length < 1 || model.pages.length > PDF_CONVERSION_LIMITS.maxPagesPerDocument) {
    throw new Error(`${label}: page count exceeds the structured conversion policy.`);
  }
  let bytes = 0;
  for (const page of model.pages) {
    if (!Array.isArray(page.sections) || page.sections.length > PDF_CONVERSION_LIMITS.maxSectionsPerPage) {
      throw new Error(`${label}: page ${page.pageNumber} exceeds the section budget.`);
    }
    for (const section of page.sections) {
      bytes += new TextEncoder().encode(section.content).byteLength;
      if (bytes > PDF_CONVERSION_LIMITS.maxInputTextBytes) throw new Error(`${label}: text budget exceeded.`);
    }
  }
}

function pageLines(page: PdfPageModel): string[] {
  const lines: string[] = [];
  if (page.title.trim()) lines.push(page.title.trim());
  if (page.subtitle?.trim()) lines.push(page.subtitle.trim());
  for (const section of page.sections) {
    if (section.isRedacted) lines.push('[REDACTED]');
    else lines.push(section.content);
  }
  return lines;
}

function writerFromPdf(title: string, model: PdfDocumentModel): WorkspaceDocument {
  const doc = createNewDocument('Writer');
  doc.title = safeName(title);
  doc.objects = {};
  doc.root_object_ids = [];
  const objectId = `pdf-convert-writer-${Date.now()}`;
  let paragraphIndex = 0;
  const paragraphs = model.pages.flatMap((page) => {
    const output = [];
    output.push({
      id: `pdf-p-${++paragraphIndex}`,
      style: { heading_level: 1 as const, alignment: 'left' as const, line_height: 1.3, space_before: 10, space_after: 6 },
      spans: [{ text: page.title || `Page ${page.pageNumber}`, bold: true, font_size_pt: 18 }],
    });
    if (page.subtitle) output.push({
      id: `pdf-p-${++paragraphIndex}`,
      style: { alignment: 'left' as const, line_height: 1.4, space_before: 0, space_after: 6 },
      spans: [{ text: page.subtitle, italic: true }],
    });
    for (const section of page.sections) {
      output.push({
        id: `pdf-p-${++paragraphIndex}`,
        style: {
          ...(section.type === 'header' ? { heading_level: 2 as const } : {}),
          alignment: 'left' as const,
          line_height: 1.45,
          space_before: section.type === 'header' ? 8 : 0,
          space_after: 4,
        },
        spans: [{ text: section.isRedacted ? '[REDACTED]' : section.content, bold: section.type === 'header' || undefined }],
      });
    }
    return output;
  });
  doc.objects[objectId] = { type: 'TextBlock', data: { id: objectId, paragraphs } };
  doc.root_object_ids = [objectId];
  return doc;
}

function gridColumnName(index: number): string {
  let value = index + 1;
  let out = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

function gridFromPdf(title: string, model: PdfDocumentModel): WorkspaceDocument {
  const doc = createNewDocument('Grid');
  doc.title = safeName(title);
  doc.objects = {};
  doc.root_object_ids = [];
  const sheets = model.pages.map((page, pageIndex) => {
    const tableId = `pdf-convert-table-${pageIndex + 1}`;
    const cells: Record<string, { value: string }> = {};
    const rows = [
      ['Page', String(page.pageNumber)],
      ['Title', page.title],
      ['Subtitle', page.subtitle ?? ''],
      ...page.sections.map((section) => [section.type, section.isRedacted ? '[REDACTED]' : section.content]),
    ];
    rows.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
      const safe = String(value).slice(0, PDF_CONVERSION_LIMITS.maxCellText);
      cells[`${gridColumnName(colIndex)}${rowIndex + 1}`] = { value: safe };
    }));
    doc.objects[tableId] = { type: 'Table', data: { id: tableId, rows: Math.max(1, rows.length), cols: 2, cells } };
    doc.root_object_ids.push(tableId);
    return { id: `pdf-convert-sheet-${pageIndex + 1}`, name: (page.pageLabel || page.title || `Page ${page.pageNumber}`).slice(0, 80), tableObjectId: tableId };
  });
  doc.gridData = { sheets, activeSheetId: sheets[0]?.id };
  return doc;
}

function presentFromPdf(title: string, model: PdfDocumentModel): WorkspaceDocument {
  const doc = createNewDocument('Present');
  doc.title = safeName(title);
  doc.presentData = {
    theme: 'light',
    aspectRatio: '16:9',
    slides: model.pages.map((page, index) => ({
      id: `pdf-convert-slide-${index + 1}`,
      title: page.title || `Page ${page.pageNumber}`,
      subtitle: page.subtitle ?? '',
      category: 'PDF conversion',
      layout: 'bullet-list',
      bulletPoints: page.sections.map((section) => section.isRedacted ? '[REDACTED]' : section.content).slice(0, 200),
      speakerNotes: `Converted from structured PDF page ${page.pageNumber}.`,
    })),
  };
  return doc;
}

export function convertStructuredPdfToOffice(title: string, model: PdfDocumentModel, format: PdfOfficeConversionFormat): PdfConversionArtifact {
  assertStructuredModel(model);
  const warnings = [
    'Conversion extracts the structured PDF semantic model; exact PDF coordinates, fonts and unsupported graphics are not claimed as preserved.',
  ];
  if (format === 'docx') {
    const bytes = exportDocx(writerFromPdf(title, model));
    return { fileName: `${safeName(title)}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes, sourcePages: model.pages.length, warnings };
  }
  if (format === 'xlsx') {
    const bytes = exportXlsx(gridFromPdf(title, model));
    return { fileName: `${safeName(title)}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes, sourcePages: model.pages.length, warnings };
  }
  const bytes = exportPptx(presentFromPdf(title, model));
  return { fileName: `${safeName(title)}.pptx`, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes, sourcePages: model.pages.length, warnings };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

function conversionLinkHref(link: NonNullable<PdfPageModel['links']>[number], pageCount: number): string | null {
  if (link.target.kind === 'page') {
    return Number.isInteger(link.target.pageNumber) && link.target.pageNumber >= 1 && link.target.pageNumber <= pageCount
      ? `#pdf-page-${link.target.pageNumber}`
      : null;
  }
  try {
    const url = new URL(link.target.url);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function convertStructuredPdfToText(title: string, model: PdfDocumentModel, format: PdfTextConversionFormat): PdfConversionArtifact {
  assertStructuredModel(model);
  const invalidLinks = model.pages.reduce((count, page) => count + (page.links ?? []).filter((link) => !conversionLinkHref(link, model.pages.length)).length, 0);
  const warnings = invalidLinks ? [`${invalidLinks} invalid or non-HTTP(S) link target(s) were omitted by the conversion safety policy.`] : [];
  if (format === 'text') {
    const text = model.pages.map((page) => {
      const links = (page.links ?? []).map((link) => conversionLinkHref(link, model.pages.length)).filter((href): href is string => Boolean(href));
      return `${pageLines(page).join('\n')}${links.length ? `\nLinks:\n${links.join('\n')}` : ''}`;
    }).join('\n\n--- PAGE BREAK ---\n\n');
    const bytes = new TextEncoder().encode(text);
    return { fileName: `${safeName(title)}.txt`, mimeType: 'text/plain;charset=utf-8', bytes, sourcePages: model.pages.length, warnings };
  }
  const bookmarks = structuredPdfBookmarks(model);
  const navigation = bookmarks.length
    ? `<nav aria-label="PDF bookmarks"><ol>${bookmarks.map((bookmark) => `<li><a href="#pdf-page-${bookmark.pageNumber}">${escapeHtml(bookmark.title)}</a></li>`).join('')}</ol></nav>`
    : '';
  const body = model.pages.map((page) => {
    const sections = page.sections.map((section) => {
      const tag = section.type === 'header' ? 'h2' : section.type === 'callout' ? 'aside' : 'p';
      return `<${tag} data-section-id="${escapeHtml(section.id)}">${escapeHtml(section.isRedacted ? '[REDACTED]' : section.content)}</${tag}>`;
    }).join('');
    const links = (page.links ?? []).map((link, index) => {
      const href = conversionLinkHref(link, model.pages.length);
      if (!href) return '';
      const external = link.target.kind === 'url';
      return `<li><a href="${escapeHtml(href)}"${external ? ' rel="noopener noreferrer"' : ''}>${external ? `External link ${index + 1}` : `Go to page ${link.target.kind === 'page' ? link.target.pageNumber : '?'}`}</a></li>`;
    }).join('');
    const linksBlock = links ? `<aside aria-label="Page links"><ul>${links}</ul></aside>` : '';
    return `<article id="pdf-page-${page.pageNumber}" data-page="${page.pageNumber}"><h1>${escapeHtml(page.title || `Page ${page.pageNumber}`)}</h1>${page.subtitle ? `<p class="subtitle">${escapeHtml(page.subtitle)}</p>` : ''}${sections}${linksBlock}</article>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${navigation}${body}</body></html>`;
  return { fileName: `${safeName(title)}.html`, mimeType: 'text/html;charset=utf-8', bytes: new TextEncoder().encode(html), sourcePages: model.pages.length, warnings };
}

export function convertStructuredPdf(title: string, model: PdfDocumentModel, format: PdfConversionFormat): PdfConversionArtifact {
  return format === 'docx' || format === 'xlsx' || format === 'pptx'
    ? convertStructuredPdfToOffice(title, model, format)
    : convertStructuredPdfToText(title, model, format);
}

export function bundlePdfBatchArtifacts(result: PdfBatchConversionResult): Uint8Array {
  if (result.artifacts.length < 1 || result.artifacts.length > PDF_CONVERSION_LIMITS.maxBatchDocuments) throw new Error('Batch artifact count exceeds policy.');
  const names = new Set<string>();
  const entries = result.artifacts.map((artifact, index) => {
    const base = artifact.fileName || `artifact-${index + 1}`;
    let name = base;
    let suffix = 2;
    while (names.has(name)) {
      const dot = base.lastIndexOf('.');
      name = dot > 0 ? `${base.slice(0, dot)}-${suffix}${base.slice(dot)}` : `${base}-${suffix}`;
      suffix += 1;
    }
    names.add(name);
    return { name, data: artifact.bytes };
  });
  const zip = writeStoredZip(entries);
  if (zip.byteLength > PDF_CONVERSION_LIMITS.maxBatchOutputBytes + 8 * 1024 * 1024) throw new Error('Batch ZIP exceeds policy.');
  return zip;
}

export function batchConvertStructuredPdfs(inputs: readonly PdfBatchConversionInput[], format: PdfConversionFormat): PdfBatchConversionResult {
  if (!inputs.length) throw new Error('Batch conversion requires at least one document.');
  if (inputs.length > PDF_CONVERSION_LIMITS.maxBatchDocuments) throw new Error('Batch document count exceeds policy.');
  let totalInputPages = 0;
  let totalOutputBytes = 0;
  const artifacts: PdfConversionArtifact[] = [];
  for (const [index, input] of inputs.entries()) {
    assertStructuredModel(input.model, `Batch item ${index + 1}`);
    totalInputPages += input.model.pages.length;
    if (totalInputPages > PDF_CONVERSION_LIMITS.maxBatchPages) throw new Error('Batch page budget exceeded.');
    const artifact = convertStructuredPdf(input.title, input.model, format);
    totalOutputBytes += artifact.bytes.byteLength;
    if (totalOutputBytes > PDF_CONVERSION_LIMITS.maxBatchOutputBytes) throw new Error('Batch output budget exceeded.');
    artifacts.push(artifact);
  }
  return { artifacts, totalInputPages, totalOutputBytes };
}
