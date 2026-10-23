// STATUS: DIAMANT VGT SUPREME — exact preflight for Astraea structured PDF production copies.
// This module deliberately does NOT claim PDF/A conformance; it proves only the checks it can establish.

import type { PdfDocumentModel, PdfPageBox } from '../../../../shared/contracts/workspace';
import { buildStructuredPdfBytes } from '../../interchange/structuredPdfExport';

const MAX_PREFLIGHT_BYTES = 64 * 1024 * 1024;
const MAX_PAGES = 10_000;
const MAX_SECTIONS = 200_000;

export type PdfPreflightSeverity = 'error' | 'warning' | 'info';

export interface PdfPreflightIssue {
  code: string;
  severity: PdfPreflightSeverity;
  message: string;
}

export interface PdfPrintProductionReport {
  byteLength: number;
  pageCount: number;
  language: string;
  tagged: boolean;
  readingOrderDeterministic: boolean;
  headingSemantics: boolean;
  tableSemantics: boolean;
  imageAltTextComplete: boolean;
  embeddedFonts: boolean;
  fontObjectCount: number;
  embeddedFontProgramCount: number;
  pageBoxesValid: boolean;
  outputIntentPresent: boolean;
  srgbProfilePresent: boolean;
  colorManaged: boolean;
  issues: PdfPreflightIssue[];
}

export interface PdfPrintProductionCopy {
  bytes: Uint8Array;
  report: PdfPrintProductionReport;
}

function normalizeLanguage(input: string): string {
  const language = input.trim();
  if (!language || language.length > 64 || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(language)) {
    throw new Error('Document language must be a bounded BCP-47 language tag such as en-US or de-DE.');
  }
  return language;
}

function ascii(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_PREFLIGHT_BYTES) throw new Error('Structured PDF preflight exceeds the 64 MiB safety budget.');
  return new TextDecoder('latin1').decode(bytes);
}

function countMatches(text: string, pattern: RegExp): number {
  let count = 0;
  pattern.lastIndex = 0;
  while (pattern.exec(text)) {
    count += 1;
    if (count > 1_000_000) throw new Error('PDF preflight token count exceeded the safety budget.');
  }
  pattern.lastIndex = 0;
  return count;
}

function validBox(box: PdfPageBox | undefined): boolean {
  if (!box) return true;
  return [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0;
}

function containsBox(outer: PdfPageBox, inner: PdfPageBox | undefined): boolean {
  if (!inner) return true;
  const epsilon = 0.01;
  return inner.x >= outer.x - epsilon
    && inner.y >= outer.y - epsilon
    && inner.x + inner.width <= outer.x + outer.width + epsilon
    && inner.y + inner.height <= outer.y + outer.height + epsilon;
}

function modelPageBoxesValid(model: PdfDocumentModel): boolean {
  return model.pages.every((page) => {
    const media = page.mediaBox ?? { x: 0, y: 0, width: 595.28, height: 841.89 };
    if (!validBox(media) || !validBox(page.cropBox) || !validBox(page.trimBox) || !validBox(page.bleedBox) || !validBox(page.artBox)) return false;
    return containsBox(media, page.cropBox)
      && containsBox(media, page.trimBox)
      && containsBox(media, page.bleedBox)
      && containsBox(media, page.artBox);
  });
}

function enforceModelBounds(model: PdfDocumentModel): void {
  if (model.pages.length < 1 || model.pages.length > MAX_PAGES) throw new Error('PDF page count is outside the production preflight bounds.');
  let sections = 0;
  const ids = new Set<string>();
  for (const page of model.pages) {
    sections += page.sections.length;
    if (sections > MAX_SECTIONS) throw new Error('PDF section count exceeds the production preflight budget.');
    for (const section of page.sections) {
      if (!section.id || ids.has(section.id)) throw new Error('PDF structure contains a missing or duplicate section ID.');
      ids.add(section.id);
    }
  }
}

export function inspectStructuredPrintProduction(
  model: PdfDocumentModel,
  bytes: Uint8Array,
  languageInput: string,
): PdfPrintProductionReport {
  enforceModelBounds(model);
  const language = normalizeLanguage(languageInput);
  const text = ascii(bytes);
  const tagged = /\/StructTreeRoot\b/u.test(text) && /\/MarkInfo\s*<<[^>]*\/Marked\s+true/u.test(text);
  const headingSemantics = /\/S\s*\/H1\b/u.test(text) && (!model.pages.some((page) => page.sections.some((section) => section.type === 'header')) || /\/S\s*\/H2\b/u.test(text));
  const hasTables = model.pages.some((page) => page.sections.some((section) => section.type === 'table'));
  const tableSemantics = !hasTables || (/\/S\s*\/Table\b/u.test(text) && /\/S\s*\/TR\b/u.test(text) && /\/S\s*\/TD\b/u.test(text));
  const images = model.pages.flatMap((page) => page.images ?? []);
  const figureCount = countMatches(text, /\/S\s*\/Figure\b/gu);
  const altCount = countMatches(text, /\/Alt\s*\(/gu);
  const imageAltTextComplete = images.length === 0 || (images.every((image) => Boolean(image.altText?.trim())) && figureCount >= images.length && altCount >= images.length);
  const readingOrderDeterministic = model.pages.every((page, index) => page.pageNumber === index + 1)
    && /\/ParentTree\b/u.test(text)
    && model.pages.every((_page, index) => new RegExp(`/StructParents\\s+${index}\\b`, 'u').test(text));
  const fontObjectCount = countMatches(text, /\/Type\s*\/Font\b/gu);
  const embeddedFontProgramCount = countMatches(text, /\/FontFile(?:2|3)?\b/gu);
  const embeddedFonts = fontObjectCount === 0 || embeddedFontProgramCount >= fontObjectCount;
  const pageBoxesValid = modelPageBoxesValid(model);
  const outputIntentPresent = /\/OutputIntents\s*\[/u.test(text) && /\/DestOutputProfile\b/u.test(text);
  const srgbProfilePresent = outputIntentPresent && /\/OutputConditionIdentifier\s*\(sRGB\)/u.test(text);
  const colorManaged = srgbProfilePresent && !/\/DeviceCMYK\b/u.test(text);

  const issues: PdfPreflightIssue[] = [];
  if (!tagged) issues.push({ code: 'structure.untagged', severity: 'error', message: 'Logical tagged-PDF structure is missing.' });
  if (!readingOrderDeterministic) issues.push({ code: 'structure.reading-order', severity: 'error', message: 'Deterministic page/MCID reading order could not be proven.' });
  if (!headingSemantics) issues.push({ code: 'structure.headings', severity: 'error', message: 'Heading semantics are incomplete.' });
  if (!tableSemantics) issues.push({ code: 'structure.tables', severity: 'error', message: 'Table/TR/TD semantics are incomplete.' });
  if (!imageAltTextComplete) issues.push({ code: 'accessibility.image-alt', severity: 'error', message: 'One or more image objects lack tagged Figure/Alt text semantics.' });
  if (!embeddedFonts) issues.push({ code: 'fonts.unembedded', severity: 'warning', message: `Font programs are not fully embedded (${embeddedFontProgramCount}/${fontObjectCount}); archival profiles must remain fail-closed.` });
  if (!pageBoxesValid) issues.push({ code: 'boxes.invalid', severity: 'error', message: 'One or more Crop/Trim/Bleed/Art boxes fall outside the page MediaBox or have invalid geometry.' });
  if (!outputIntentPresent) issues.push({ code: 'color.output-intent', severity: 'error', message: 'No ICC OutputIntent is embedded.' });
  if (!colorManaged) issues.push({ code: 'color.management', severity: 'warning', message: 'The generated color path is not proven to be consistently sRGB-managed.' });
  if (!new RegExp(`/Lang\\s*\\(${language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'u').test(text)) {
    issues.push({ code: 'accessibility.language', severity: 'error', message: 'Catalog language does not match the selected document language.' });
  }

  return {
    byteLength: bytes.byteLength,
    pageCount: model.pages.length,
    language,
    tagged,
    readingOrderDeterministic,
    headingSemantics,
    tableSemantics,
    imageAltTextComplete,
    embeddedFonts,
    fontObjectCount,
    embeddedFontProgramCount,
    pageBoxesValid,
    outputIntentPresent,
    srgbProfilePresent,
    colorManaged,
    issues,
  };
}

export function buildStructuredPrintProductionCopy(
  title: string,
  model: PdfDocumentModel,
  language: string,
): PdfPrintProductionCopy {
  const normalizedLanguage = normalizeLanguage(language);
  const bytes = buildStructuredPdfBytes(title, model, {
    taggedStructure: true,
    includeSrgbOutputIntent: true,
    language: normalizedLanguage,
  });
  const report = inspectStructuredPrintProduction(model, bytes, normalizedLanguage);
  if (report.issues.some((issue) => issue.severity === 'error')) {
    throw new Error(`Print-production export failed preflight: ${report.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join(' ')}`);
  }
  return { bytes, report };
}
