import type { PdfDocumentModel } from '../../../shared/contracts/workspace';
import { buildStructuredPdfBytes, type StructuredPdfExportOptions } from '../interchange/structuredPdfExport';

export type PdfOptimizationPreset = 'screen' | 'print' | 'archive';

export interface PdfOptimizationObjectAuditEntry {
  objectId: number;
  byteLength: number;
  kind: 'catalog' | 'pages' | 'page' | 'font' | 'form-xobject' | 'annotation' | 'structure-root' | 'structure-element' | 'output-intent' | 'stream' | 'number-tree' | 'other';
  references: number[];
  reachable: boolean;
}

export interface PdfOptimizationAudit {
  byteLength: number;
  objectCount: number;
  reachableObjectCount: number;
  unreachableObjectIds: number[];
  duplicateResourceGroups: number[][];
  largestObjects: PdfOptimizationObjectAuditEntry[];
}

export interface PdfOptimizationPreview {
  previewId: string;
  preset: PdfOptimizationPreset;
  presetLabel: string;
  qualityImpact: 'lossless';
  baseline: PdfOptimizationAudit;
  optimized: PdfOptimizationAudit;
  byteDelta: number;
  byteDeltaPercent: number;
  warnings: string[];
}

export interface PdfOptimizationResult {
  bytes: Uint8Array;
  preview: PdfOptimizationPreview;
}

const MAX_STRUCTURED_PDF_BYTES = 128 * 1024 * 1024;
const MAX_OBJECTS = 100_000;
const MAX_REFERENCES_PER_OBJECT = 16_384;
const TOP_OBJECTS = 12;

const PRESETS: Record<PdfOptimizationPreset, { label: string; options: StructuredPdfExportOptions; warning?: string }> = {
  screen: {
    label: 'Screen',
    options: { taggedStructure: false, includeSrgbOutputIntent: false, deduplicateResources: true },
    warning: 'Screen preset keeps document content lossless but omits print/archive structure extras from the generated copy.',
  },
  print: {
    label: 'Print',
    options: { taggedStructure: true, includeSrgbOutputIntent: true, deduplicateResources: true },
    warning: 'Print preset adds tagged structure and the audited sRGB OutputIntent; this can increase file size.',
  },
  archive: {
    label: 'Archive',
    options: { taggedStructure: true, includeSrgbOutputIntent: true, deduplicateResources: true },
    warning: 'Archive preset is archive-friendly, not a PDF/A conformance claim. PDF/A remains a separate validation/conversion gate.',
  },
};

function assertStructuredModel(model: PdfDocumentModel): void {
  if (model.rawPdfDataUrl) throw new Error('Native PDF optimization requires the standards parser/renderer; structured optimizer refuses raw PDF bytes.');
  if (!Number.isInteger(model.numPages) || model.numPages < 0 || model.numPages > 10_000) throw new Error('Structured PDF page count exceeds optimization policy.');
  if (model.pages.length > 10_000) throw new Error('Structured PDF page array exceeds optimization policy.');
  for (const page of model.pages) {
    if (page.sections.length > 4_096) throw new Error(`Page ${page.pageNumber} exceeds the 4,096-section optimization budget.`);
  }
}

function assertAsciiGeneratedPdf(bytes: Uint8Array): string {
  if (!bytes.byteLength || bytes.byteLength > MAX_STRUCTURED_PDF_BYTES) throw new Error('Generated PDF exceeds the 128 MiB optimization audit budget.');
  for (let i = 0; i < bytes.byteLength; i += 1) {
    if (bytes[i] > 0x7f) throw new Error('Optimization audit accepts only Astraea ASCII-safe structured PDF serialization.');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text.startsWith('%PDF-1.4\n%VGTPDF\n')) throw new Error('Optimization audit only accepts Astraea structured PDF serialization.');
  return text;
}

function scrubPdfSyntax(body: string): string {
  let source = body;
  for (;;) {
    const start = source.indexOf('\nstream\n');
    if (start < 0) break;
    const end = source.indexOf('\nendstream', start + 8);
    if (end < 0) throw new Error('Generated PDF stream is missing endstream.');
    source = `${source.slice(0, start)}${' '.repeat(end + 10 - start)}${source.slice(end + 10)}`;
  }

  const chars = source.split('');
  let literalDepth = 0;
  let escaped = false;
  let hex = false;
  let comment = false;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1] ?? '';
    if (comment) {
      if (ch === '\n' || ch === '\r') comment = false;
      else chars[i] = ' ';
      continue;
    }
    if (literalDepth > 0) {
      chars[i] = ' ';
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '(') literalDepth += 1;
      else if (ch === ')') literalDepth -= 1;
      continue;
    }
    if (hex) {
      chars[i] = ' ';
      if (ch === '>') hex = false;
      continue;
    }
    if (ch === '%') { chars[i] = ' '; comment = true; continue; }
    if (ch === '(') { chars[i] = ' '; literalDepth = 1; escaped = false; continue; }
    if (ch === '<' && next === '<') { i += 1; continue; }
    if (ch === '<') { chars[i] = ' '; hex = true; continue; }
  }
  if (literalDepth || hex) throw new Error('Generated PDF contains unterminated literal/hex syntax.');
  return chars.join('');
}

function parseReferences(body: string, objectCount: number): number[] {
  const scrubbed = scrubPdfSyntax(body);
  const references = new Set<number>();
  const re = /(?:^|[^0-9])(\d{1,6})\s+0\s+R\b/g;
  for (const match of scrubbed.matchAll(re)) {
    const id = Number(match[1]);
    if (!Number.isInteger(id) || id < 1 || id > objectCount) throw new Error(`Generated PDF references invalid object ${match[1]}.`);
    references.add(id);
    if (references.size > MAX_REFERENCES_PER_OBJECT) throw new Error('Generated PDF object exceeds reference audit budget.');
  }
  return [...references].sort((a, b) => a - b);
}

function classifyObject(body: string): PdfOptimizationObjectAuditEntry['kind'] {
  if (/\/Type\s+\/Catalog\b/.test(body)) return 'catalog';
  if (/\/Type\s+\/Pages\b/.test(body)) return 'pages';
  if (/\/Type\s+\/Page\b/.test(body)) return 'page';
  if (/\/Type\s+\/Font\b/.test(body)) return 'font';
  if (/\/Subtype\s+\/Form\b/.test(body)) return 'form-xobject';
  if (/\/Type\s+\/Annot\b/.test(body)) return 'annotation';
  if (/\/Type\s+\/StructTreeRoot\b/.test(body)) return 'structure-root';
  if (/\/Type\s+\/StructElem\b/.test(body)) return 'structure-element';
  if (/\/Type\s+\/OutputIntent\b/.test(body)) return 'output-intent';
  if (/\bstream\b/.test(body)) return 'stream';
  if (/\/Nums\s*\[/.test(body)) return 'number-tree';
  return 'other';
}

function fnv1a64(bytes: Uint8Array, suffix: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * prime) & mask;
  for (const code of new TextEncoder().encode(suffix)) hash = ((hash ^ BigInt(code)) * prime) & mask;
  return hash.toString(16).padStart(16, '0');
}

export function auditStructuredPdfObjects(bytes: Uint8Array): PdfOptimizationAudit {
  const text = assertAsciiGeneratedPdf(bytes);
  const startxrefMarker = '\nstartxref\n';
  const marker = text.lastIndexOf(startxrefMarker);
  if (marker < 0 || !text.endsWith('\n%%EOF\n')) throw new Error('Generated PDF is missing final startxref/EOF.');
  const xrefTextStart = marker + startxrefMarker.length;
  const xrefLineEnd = text.indexOf('\n', xrefTextStart);
  if (xrefLineEnd < 0) throw new Error('Generated PDF has malformed startxref.');
  const xrefOffset = Number(text.slice(xrefTextStart, xrefLineEnd));
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 16 || xrefOffset >= marker) throw new Error('Generated PDF startxref is outside file bounds.');
  const xrefSlice = text.slice(xrefOffset);
  const headerMatch = /^xref\n0\s+(\d+)\n/.exec(xrefSlice);
  if (!headerMatch) throw new Error('Generated PDF xref table is malformed.');
  const xrefSize = Number(headerMatch[1]);
  const objectCount = xrefSize - 1;
  if (!Number.isInteger(objectCount) || objectCount < 1 || objectCount > MAX_OBJECTS) throw new Error('Generated PDF object count exceeds optimization audit policy.');
  const entriesStart = headerMatch[0].length;
  const entryLines = xrefSlice.slice(entriesStart).split('\n');
  if (entryLines.length < xrefSize) throw new Error('Generated PDF xref table is truncated.');
  const offsets: number[] = [];
  for (let index = 0; index < xrefSize; index += 1) {
    const line = entryLines[index];
    const match = /^(\d{10})\s+(\d{5})\s+([fn])\s$/.exec(line);
    if (!match) throw new Error(`Generated PDF xref entry ${index} is malformed.`);
    if (index === 0) {
      if (match[3] !== 'f') throw new Error('Generated PDF xref object zero must be free.');
      continue;
    }
    if (match[3] !== 'n' || match[2] !== '00000') throw new Error(`Generated PDF xref entry ${index} has unsupported generation/state.`);
    offsets[index] = Number(match[1]);
    if (!Number.isSafeInteger(offsets[index]) || offsets[index] <= 0 || offsets[index] >= xrefOffset) throw new Error(`Generated PDF xref offset ${index} is outside object area.`);
    if (index > 1 && offsets[index] <= offsets[index - 1]) throw new Error('Generated PDF xref offsets are not strictly increasing.');
  }

  const trailerStart = xrefSlice.indexOf('trailer\n');
  if (trailerStart < 0) throw new Error('Generated PDF trailer is missing.');
  const trailer = xrefSlice.slice(trailerStart, xrefSlice.indexOf('\nstartxref\n', trailerStart));
  const rootMatch = /\/Root\s+(\d+)\s+0\s+R\b/.exec(scrubPdfSyntax(trailer));
  const infoMatch = /\/Info\s+(\d+)\s+0\s+R\b/.exec(scrubPdfSyntax(trailer));
  if (!rootMatch) throw new Error('Generated PDF trailer has no Root reference.');
  const rootIds = [Number(rootMatch[1])];
  if (infoMatch) rootIds.push(Number(infoMatch[1]));

  const bodies = new Map<number, string>();
  const entries: PdfOptimizationObjectAuditEntry[] = [];
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    const start = offsets[objectId];
    const end = objectId === objectCount ? xrefOffset : offsets[objectId + 1];
    const block = text.slice(start, end);
    const prefix = `${objectId} 0 obj\n`;
    if (!block.startsWith(prefix) || !block.endsWith('\nendobj\n')) throw new Error(`Generated PDF object ${objectId} does not match xref boundaries.`);
    const body = block.slice(prefix.length, -8);
    bodies.set(objectId, body);
    entries.push({
      objectId,
      byteLength: end - start,
      kind: classifyObject(body),
      references: parseReferences(body, objectCount),
      reachable: false,
    });
  }

  const byId = new Map(entries.map((entry) => [entry.objectId, entry]));
  const queue = [...new Set(rootIds)];
  const reachable = new Set<number>();
  while (queue.length) {
    const id = queue.pop()!;
    if (reachable.has(id)) continue;
    const entry = byId.get(id);
    if (!entry) throw new Error(`Generated PDF root graph references missing object ${id}.`);
    reachable.add(id);
    for (const ref of entry.references) if (!reachable.has(ref)) queue.push(ref);
  }
  for (const entry of entries) entry.reachable = reachable.has(entry.objectId);

  const duplicateMap = new Map<string, number[]>();
  for (const entry of entries) {
    if (entry.kind !== 'font' && entry.kind !== 'form-xobject') continue;
    const body = bodies.get(entry.objectId)!;
    const key = `${entry.kind}:${body}`;
    const ids = duplicateMap.get(key) ?? [];
    ids.push(entry.objectId);
    duplicateMap.set(key, ids);
  }
  const duplicateResourceGroups = [...duplicateMap.values()].filter((ids) => ids.length > 1).map((ids) => [...ids]);
  const unreachableObjectIds = entries.filter((entry) => !entry.reachable).map((entry) => entry.objectId);
  return {
    byteLength: bytes.byteLength,
    objectCount,
    reachableObjectCount: reachable.size,
    unreachableObjectIds,
    duplicateResourceGroups,
    largestObjects: [...entries].sort((a, b) => b.byteLength - a.byteLength || a.objectId - b.objectId).slice(0, TOP_OBJECTS),
  };
}

export function previewPdfOptimization(
  title: string,
  model: PdfDocumentModel,
  preset: PdfOptimizationPreset,
): PdfOptimizationPreview {
  assertStructuredModel(model);
  const definition = PRESETS[preset];
  const baselineBytes = buildStructuredPdfBytes(title, model, { deduplicateResources: false });
  const optimizedBytes = buildStructuredPdfBytes(title, model, definition.options);
  const baseline = auditStructuredPdfObjects(baselineBytes);
  const optimized = auditStructuredPdfObjects(optimizedBytes);
  if (optimized.unreachableObjectIds.length) throw new Error(`Optimization failed closed: ${optimized.unreachableObjectIds.length} unreachable object(s) remain.`);
  if (optimized.duplicateResourceGroups.length) throw new Error(`Optimization failed closed: ${optimized.duplicateResourceGroups.length} duplicate resource group(s) remain.`);
  const byteDelta = optimized.byteLength - baseline.byteLength;
  const byteDeltaPercent = baseline.byteLength ? (byteDelta / baseline.byteLength) * 100 : 0;
  const warnings = [
    definition.warning,
    'This optimizer is lossless for supported structured PDF content. Unused Base-14 font resources are pruned automatically; lossy JPEG downsampling remains a separately confirmed track. Embedded font subsetting and linearization remain separate unimplemented capabilities.',
  ].filter((value): value is string => Boolean(value));
  return {
    previewId: fnv1a64(optimizedBytes, `${preset}:${baseline.byteLength}:${optimized.objectCount}`),
    preset,
    presetLabel: definition.label,
    qualityImpact: 'lossless',
    baseline,
    optimized,
    byteDelta,
    byteDeltaPercent,
    warnings,
  };
}

export function applyPdfOptimization(
  title: string,
  model: PdfDocumentModel,
  preset: PdfOptimizationPreset,
  confirmation: { confirmed: boolean; previewId: string },
): PdfOptimizationResult {
  if (!confirmation.confirmed || !confirmation.previewId) throw new Error('Optimization requires an explicit preview confirmation.');
  const preview = previewPdfOptimization(title, model, preset);
  if (preview.previewId !== confirmation.previewId) throw new Error('Optimization preview is stale; review the current document again before export.');
  const bytes = buildStructuredPdfBytes(title, model, PRESETS[preset].options);
  const audit = auditStructuredPdfObjects(bytes);
  if (audit.unreachableObjectIds.length || audit.duplicateResourceGroups.length) throw new Error('Optimization output failed final reachability/resource-deduplication verification.');
  return { bytes, preview };
}

export function optimizationPresetLabel(preset: PdfOptimizationPreset): string {
  return PRESETS[preset].label;
}
