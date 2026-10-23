// STATUS: PLATIN — bounded Draw content transforms with runtime input validation.
import type {
  DrawHyperlink,
  DrawObject,
  DrawReviewAnnotation,
  DrawRichText,
  DrawTableData,
  DrawTextRun,
} from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from './drawDocumentEngine';

const MAX_TEXT = 1_000_000;
const MAX_RUNS = 20_000;
const MAX_TABLE_CELLS = 250_000;
const MAX_TABLE_TEXT = 8_000_000;
const MAX_ANNOTATIONS = 10_000;
const MAX_ANNOTATION_TEXT = 8_000_000;
const MAX_LINK_LENGTH = 4_096;
const MAX_STYLE_NAME = 512;

const clone = <T>(value: T): T => structuredClone(value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string' || value.length > maximum) throw new DrawModelError(code);
  return value;
}

function optionalString(value: unknown, maximum: number, code: string): void {
  if (value !== undefined && (typeof value !== 'string' || value.length > maximum)) {
    throw new DrawModelError(code);
  }
}

function optionalBoolean(value: unknown, code: string): void {
  if (value !== undefined && typeof value !== 'boolean') throw new DrawModelError(code);
}

function finiteNumber(value: unknown, code: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new DrawModelError(code);
  return value;
}

function normalizeTextRun(value: unknown): DrawTextRun {
  if (!isRecord(value)) throw new DrawModelError('richtext-run-invalid');
  const text = boundedString(value.text, MAX_TEXT, 'richtext-run-invalid');
  optionalBoolean(value.bold, 'richtext-run-invalid');
  optionalBoolean(value.italic, 'richtext-run-invalid');
  optionalBoolean(value.underline, 'richtext-run-invalid');
  optionalString(value.fontFamily, MAX_STYLE_NAME, 'richtext-run-invalid');
  optionalString(value.color, 128, 'richtext-run-invalid');

  if (value.fontSize !== undefined) {
    const fontSize = finiteNumber(value.fontSize, 'font-size-invalid');
    if (fontSize < 4 || fontSize > 512) throw new DrawModelError('font-size-invalid');
  }

  return clone({ ...value, text }) as DrawTextRun;
}

export function normalizeDrawRichText(value: DrawRichText): DrawRichText {
  if (!isRecord(value) || !Array.isArray(value.runs)) throw new DrawModelError('richtext-invalid');
  if (value.runs.length > MAX_RUNS) throw new DrawModelError('richtext-run-limit');
  if (value.autoFit !== 'none' && value.autoFit !== 'shrink' && value.autoFit !== 'resize-shape') {
    throw new DrawModelError('richtext-autofit-invalid');
  }
  if (value.verticalAlign !== 'top' && value.verticalAlign !== 'middle' && value.verticalAlign !== 'bottom') {
    throw new DrawModelError('richtext-alignment-invalid');
  }
  optionalString(value.styleName, MAX_STYLE_NAME, 'richtext-style-invalid');

  const padding = value.padding;
  if (!isRecord(padding)) throw new DrawModelError('text-padding-invalid');
  const normalizedPadding = {
    top: finiteNumber(padding.top, 'text-padding-invalid'),
    right: finiteNumber(padding.right, 'text-padding-invalid'),
    bottom: finiteNumber(padding.bottom, 'text-padding-invalid'),
    left: finiteNumber(padding.left, 'text-padding-invalid'),
  };
  if (Object.values(normalizedPadding).some((amount) => amount < 0 || amount > 4_096)) {
    throw new DrawModelError('text-padding-invalid');
  }

  const rotation = finiteNumber(value.rotation, 'text-rotation-invalid');
  if (Math.abs(rotation) > 36_000) throw new DrawModelError('text-rotation-invalid');

  let totalText = 0;
  const runs = Array.from(value.runs, (run) => {
    const normalizedRun = normalizeTextRun(run);
    totalText += normalizedRun.text.length;
    if (totalText > MAX_TEXT) throw new DrawModelError('richtext-size-limit');
    return normalizedRun;
  });

  return { ...clone(value), runs, padding: normalizedPadding, rotation };
}

export function setObjectRichText(object: DrawObject, text: DrawRichText): DrawObject {
  if (!isRecord(object)) throw new DrawModelError('object-invalid');
  return { ...clone(object), richText: normalizeDrawRichText(text) };
}

export function autoFitDrawText(
  object: DrawObject,
  measure: (text: string, fontSize: number) => { width: number; height: number },
): DrawObject {
  if (!isRecord(object)) throw new DrawModelError('object-invalid');
  if (!object.richText) return clone(object);

  const richText = normalizeDrawRichText(object.richText);
  const width = finiteNumber(object.width, 'text-bounds-invalid');
  const height = finiteNumber(object.height, 'text-bounds-invalid');
  if (width < 0 || height < 0) throw new DrawModelError('text-bounds-invalid');

  const text = richText.runs.map((run) => run.text).join('');
  const initialSize = Math.max(4, Math.min(512, richText.runs[0]?.fontSize ?? 14));
  const availableWidth = Math.max(1, width - richText.padding.left - richText.padding.right);
  const availableHeight = Math.max(1, height - richText.padding.top - richText.padding.bottom);
  const measured = measure(text, initialSize);
  if (!isRecord(measured)) throw new DrawModelError('text-measurement-invalid');
  const measuredWidth = finiteNumber(measured.width, 'text-measurement-invalid');
  const measuredHeight = finiteNumber(measured.height, 'text-measurement-invalid');
  if (measuredWidth < 0 || measuredHeight < 0) throw new DrawModelError('text-measurement-invalid');

  const next = clone(object);
  next.richText = richText;
  if (richText.autoFit === 'resize-shape') {
    next.width = Math.max(width, measuredWidth + richText.padding.left + richText.padding.right);
    next.height = Math.max(height, measuredHeight + richText.padding.top + richText.padding.bottom);
  } else if (
    richText.autoFit === 'shrink'
    && (measuredWidth > availableWidth || measuredHeight > availableHeight)
  ) {
    const widthRatio = measuredWidth === 0 ? 1 : availableWidth / measuredWidth;
    const heightRatio = measuredHeight === 0 ? 1 : availableHeight / measuredHeight;
    const ratio = Math.min(widthRatio, heightRatio, 1);
    next.richText.runs = richText.runs.map((run) => ({
      ...run,
      fontSize: Math.max(4, (run.fontSize ?? initialSize) * ratio),
    }));
  }
  return next;
}

export function normalizeDrawTable(table: DrawTableData): DrawTableData {
  if (!isRecord(table) || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
    throw new DrawModelError('table-invalid');
  }
  if (
    table.columns.length < 1
    || table.columns.length > 512
    || table.rows.length > 100_000
    || table.columns.length * table.rows.length > MAX_TABLE_CELLS
  ) {
    throw new DrawModelError('table-size-limit');
  }

  let totalText = 0;
  const columns = Array.from(table.columns, (column) => {
    const normalized = boundedString(column, 512, 'table-cell-size-limit');
    totalText += normalized.length;
    return normalized;
  });
  const rows = Array.from(table.rows, (row) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new DrawModelError('table-column-mismatch');
    }
    return Array.from(row, (cell) => {
      const normalized = boundedString(cell, 32_768, 'table-cell-size-limit');
      totalText += normalized.length;
      if (totalText > MAX_TABLE_TEXT) throw new DrawModelError('table-text-limit');
      return normalized;
    });
  });

  if (!Number.isInteger(table.headerRows) || table.headerRows < 0 || table.headerRows > rows.length) {
    throw new DrawModelError('table-header-invalid');
  }
  optionalString(table.styleName, MAX_STYLE_NAME, 'table-style-invalid');
  return { ...clone(table), columns, rows };
}

export function setObjectTable(object: DrawObject, table: DrawTableData): DrawObject {
  if (!isRecord(object)) throw new DrawModelError('object-invalid');
  return { ...clone(object), table: normalizeDrawTable(table) };
}

function validateAnnotation(value: unknown): asserts value is DrawReviewAnnotation {
  if (!isRecord(value)) throw new DrawModelError('annotation-invalid');
  if (
    typeof value.id !== 'string'
    || !/^[A-Za-z0-9._:@-]{1,128}$/u.test(value.id)
    || (value.kind !== 'comment' && value.kind !== 'note' && value.kind !== 'review-marker')
    || typeof value.text !== 'string'
    || value.text.length > 32_768
    || !Number.isSafeInteger(value.createdAt)
    || (value.createdAt as number) < 0
  ) {
    throw new DrawModelError('annotation-invalid');
  }
  optionalString(value.author, MAX_STYLE_NAME, 'annotation-invalid');
  optionalBoolean(value.resolved, 'annotation-invalid');
}

export function addDrawAnnotation(object: DrawObject, annotation: DrawReviewAnnotation): DrawObject {
  if (!isRecord(object)) throw new DrawModelError('object-invalid');
  const existing = object.annotations ?? [];
  if (!Array.isArray(existing)) throw new DrawModelError('annotation-list-invalid');
  if (existing.length >= MAX_ANNOTATIONS) throw new DrawModelError('annotation-limit');

  const ids = new Set<string>();
  let totalText = 0;
  for (const entry of existing) {
    validateAnnotation(entry);
    if (ids.has(entry.id)) throw new DrawModelError('annotation-duplicate');
    ids.add(entry.id);
    totalText += entry.text.length;
  }
  validateAnnotation(annotation);
  if (ids.has(annotation.id)) throw new DrawModelError('annotation-duplicate');
  if (totalText + annotation.text.length > MAX_ANNOTATION_TEXT) {
    throw new DrawModelError('annotation-text-limit');
  }

  return { ...clone(object), annotations: [...clone(existing), clone(annotation)] };
}

function validateWorkspaceLink(uri: string): void {
  const prefix = 'vgt://workspace/';
  if (!uri.startsWith(prefix)) throw new DrawModelError('workspace-link-invalid');
  const segments = uri.slice(prefix.length).split('/');
  if (
    segments.length < 2
    || !['document', 'page', 'record'].includes(segments[0] ?? '')
    || segments.some((segment) => (
      segment.length < 1
      || segment.length > 128
      || segment === '.'
      || segment === '..'
      || !/^[A-Za-z0-9._:@-]+$/u.test(segment)
    ))
  ) {
    throw new DrawModelError('workspace-link-invalid');
  }
}

export function resolveDrawHyperlink(
  link: DrawHyperlink,
  policy: { allowExternalHttps: boolean },
): { action: 'workspace' | 'external'; uri: string } {
  if (!isRecord(link) || typeof link.uri !== 'string') throw new DrawModelError('link-invalid');
  if (link.uri.length > MAX_LINK_LENGTH) throw new DrawModelError('link-too-long');
  optionalString(link.label, MAX_STYLE_NAME, 'link-invalid');
  if (!isRecord(policy) || typeof policy.allowExternalHttps !== 'boolean') {
    throw new DrawModelError('external-link-policy-invalid');
  }

  if (link.kind === 'workspace') {
    validateWorkspaceLink(link.uri);
    return { action: 'workspace', uri: link.uri };
  }
  if (link.kind !== 'external') throw new DrawModelError('link-kind-invalid');
  if (!policy.allowExternalHttps) throw new DrawModelError('external-link-policy-denied');

  let url: URL;
  try {
    url = new URL(link.uri);
  } catch {
    throw new DrawModelError('external-link-invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new DrawModelError('external-link-invalid');
  }
  return { action: 'external', uri: url.toString() };
}
