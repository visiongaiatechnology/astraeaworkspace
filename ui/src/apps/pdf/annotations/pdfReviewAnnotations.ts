// STATUS: DIAMANT VGT SUPREME
// Canonical, bounded PDF review-annotation domain. No renderer assumptions live here.
import { toOwnedArrayBuffer } from '../../../shared/binary/ownedBufferSource';

import type {
  PdfAnnotation,
  PdfAnnotationAttachment,
  PdfAnnotationMeasurement,
  PdfAnnotationPoint,
  PdfAnnotationReply,
  PdfAnnotationReviewStatus,
  PdfAnnotationType,
  PdfDocumentModel,
} from '../../../shared/contracts/workspace';

export const PDF_REVIEW_LIMITS = Object.freeze({
  maxAnnotations: 10_000,
  maxTextChars: 32_000,
  maxRepliesPerAnnotation: 512,
  maxInkPoints: 4_096,
  maxAttachmentBytes: 8 * 1024 * 1024,
  maxSummaryBytes: 16 * 1024 * 1024,
});

const SAFE_FILE_NAME = /[^a-zA-Z0-9._ ()\-+@]/g;
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const SAFE_MIME = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const ALLOWED_TYPES = new Set<PdfAnnotationType>([
  'highlight', 'comment', 'strike', 'underline', 'text-insert', 'text-replace', 'ink', 'shape',
  'text-box', 'callout', 'stamp', 'file-attachment', 'measurement',
]);
const ALLOWED_STATUS = new Set<PdfAnnotationReviewStatus>(['open', 'accepted', 'rejected', 'completed', 'cancelled']);
const ALLOWED_SHAPES = new Set<NonNullable<PdfAnnotation['shapeKind']>>(['rectangle', 'ellipse', 'line', 'arrow']);
const ALLOWED_UNITS = new Set<PdfAnnotationMeasurement['unit']>(['mm', 'cm', 'm', 'in', 'ft', 'pt']);

export type PdfAnnotationSort = 'newest' | 'oldest' | 'page' | 'author' | 'type';

export interface PdfAnnotationViewFilter {
  query?: string;
  page?: number | 'all';
  type?: PdfAnnotationType | 'all';
  status?: PdfAnnotationReviewStatus | 'all';
  author?: string | 'all';
  sort?: PdfAnnotationSort;
}

export interface PdfReviewAnnotationDraft {
  page: number;
  sectionId?: string;
  type: PdfAnnotationType;
  text: string;
  color: string;
  author: string;
  targetText?: string;
  replacementText?: string;
  points?: PdfAnnotationPoint[];
  shapeKind?: PdfAnnotation['shapeKind'];
  bounds?: PdfAnnotation['bounds'];
  stampLabel?: string;
  attachment?: PdfAnnotationAttachment;
  measurement?: PdfAnnotationMeasurement;
}

function boundedText(value: unknown, max: number = PDF_REVIEW_LIMITS.maxTextChars): string {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').slice(0, max) : '';
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#38bdf8';
}

function normalizePoints(points: unknown): PdfAnnotationPoint[] | undefined {
  if (!Array.isArray(points) || points.length === 0) return undefined;
  return points.slice(0, PDF_REVIEW_LIMITS.maxInkPoints).flatMap((raw): PdfAnnotationPoint[] => {
    if (!raw || typeof raw !== 'object') return [];
    const point = raw as Record<string, unknown>;
    const normalized: PdfAnnotationPoint = {
      x: boundedNumber(point.x, 0, 1, 0),
      y: boundedNumber(point.y, 0, 1, 0),
    };
    if (typeof point.pressure === 'number') normalized.pressure = boundedNumber(point.pressure, 0, 1, 0.5);
    return [normalized];
  });
}

function normalizeBounds(bounds: unknown): PdfAnnotation['bounds'] {
  if (!bounds || typeof bounds !== 'object') return undefined;
  const raw = bounds as Record<string, unknown>;
  const x = boundedNumber(raw.x, 0, 1, 0.1);
  const y = boundedNumber(raw.y, 0, 1, 0.1);
  return {
    x,
    y,
    width: Math.min(1 - x, boundedNumber(raw.width, 0.01, 1, 0.3)),
    height: Math.min(1 - y, boundedNumber(raw.height, 0.01, 1, 0.1)),
  };
}

function normalizeMeasurement(measurement: unknown): PdfAnnotationMeasurement | undefined {
  if (!measurement || typeof measurement !== 'object') return undefined;
  const raw = measurement as Record<string, unknown>;
  if (!ALLOWED_UNITS.has(raw.unit as PdfAnnotationMeasurement['unit'])) return undefined;
  return {
    value: boundedNumber(raw.value, 0, 1_000_000_000, 0),
    unit: raw.unit as PdfAnnotationMeasurement['unit'],
    ...(raw.scaleLabel ? { scaleLabel: boundedText(raw.scaleLabel, 256) } : {}),
  };
}

function normalizeReplies(replies: unknown, now: number): PdfAnnotationReply[] | undefined {
  if (!Array.isArray(replies) || replies.length === 0) return undefined;
  const normalized = replies.slice(0, PDF_REVIEW_LIMITS.maxRepliesPerAnnotation).flatMap((raw): PdfAnnotationReply[] => {
    if (!raw || typeof raw !== 'object') return [];
    const reply = raw as Record<string, unknown>;
    const text = boundedText(reply.text);
    if (!text.trim()) return [];
    return [{
      id: stableRandomId('reply-import'),
      text,
      author: boundedText(reply.author || 'Imported Reviewer', 256),
      createdAt: boundedNumber(reply.createdAt, 0, now, now),
    }];
  });
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeAttachmentMetadata(value: unknown): PdfAnnotationAttachment | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const fileName = boundedText(raw.fileName, 255).replace(SAFE_FILE_NAME, '_') || 'attachment.bin';
  const byteLength = boundedNumber(raw.byteLength, 0, PDF_REVIEW_LIMITS.maxAttachmentBytes, 0);
  const sha256 = typeof raw.sha256 === 'string' && SHA256_HEX.test(raw.sha256) ? raw.sha256.toLowerCase() : '';
  const mimeType = typeof raw.mimeType === 'string' && SAFE_MIME.test(raw.mimeType) ? raw.mimeType : 'application/octet-stream';
  if (byteLength <= 0 || !sha256) return undefined;
  return { fileName, mimeType, byteLength, sha256 };
}

function stableRandomId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function validateDraftSpecifics(draft: PdfReviewAnnotationDraft): void {
  if (!ALLOWED_TYPES.has(draft.type)) throw new Error('Unsupported PDF annotation type.');
  if (draft.type === 'ink' && (!draft.points || draft.points.length < 2)) throw new Error('Ink annotations require at least two points.');
  if (draft.type === 'shape' && (!draft.shapeKind || !ALLOWED_SHAPES.has(draft.shapeKind) || !draft.bounds)) {
    throw new Error('Shape annotations require a supported shape and bounds.');
  }
  if ((draft.type === 'text-box' || draft.type === 'callout') && !draft.bounds) throw new Error('Text box/callout annotations require bounds.');
  if (draft.type === 'stamp' && !draft.stampLabel?.trim()) throw new Error('Stamp annotations require a label.');
  if (draft.type === 'file-attachment' && !draft.attachment?.dataUrl) throw new Error('File attachment annotations require a local payload.');
  if (draft.type === 'measurement' && !draft.measurement) throw new Error('Measurement annotations require a value and unit.');
  if (draft.type === 'text-replace' && !draft.replacementText?.trim()) throw new Error('Replacement markup requires replacement text.');
}

export function addPdfReviewAnnotation(model: PdfDocumentModel, draft: PdfReviewAnnotationDraft): PdfDocumentModel {
  if (model.annotations.length >= PDF_REVIEW_LIMITS.maxAnnotations) throw new Error('PDF annotation limit reached.');
  if (!Number.isInteger(draft.page) || draft.page < 1 || draft.page > model.pages.length) {
    throw new Error('Annotation page is outside the document.');
  }
  validateDraftSpecifics(draft);
  const now = Date.now();
  const points = normalizePoints(draft.points);
  const bounds = normalizeBounds(draft.bounds);
  const measurement = normalizeMeasurement(draft.measurement);
  const annotation: PdfAnnotation = {
    id: stableRandomId('anno'),
    page: draft.page,
    type: draft.type,
    text: boundedText(draft.text),
    color: normalizeColor(draft.color),
    author: boundedText(draft.author || 'Local User', 256),
    createdAt: now,
    modifiedAt: now,
    status: 'open',
    ...(draft.sectionId ? { sectionId: boundedText(draft.sectionId, 512) } : {}),
    ...(draft.targetText ? { targetText: boundedText(draft.targetText) } : {}),
    ...(draft.replacementText ? { replacementText: boundedText(draft.replacementText) } : {}),
    ...(points ? { points } : {}),
    ...(draft.shapeKind && ALLOWED_SHAPES.has(draft.shapeKind) ? { shapeKind: draft.shapeKind } : {}),
    ...(bounds ? { bounds } : {}),
    ...(draft.stampLabel ? { stampLabel: boundedText(draft.stampLabel, 256) } : {}),
    ...(draft.attachment ? { attachment: draft.attachment } : {}),
    ...(measurement ? { measurement } : {}),
  };
  return { ...model, annotations: [...model.annotations, annotation] };
}

export function replyToPdfAnnotation(
  model: PdfDocumentModel,
  annotationId: string,
  text: string,
  author = 'Local User'
): PdfDocumentModel {
  const replyText = boundedText(text);
  if (!replyText.trim()) throw new Error('Reply cannot be empty.');
  let found = false;
  const annotations = model.annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;
    found = true;
    const replies = annotation.replies ?? [];
    if (replies.length >= PDF_REVIEW_LIMITS.maxRepliesPerAnnotation) throw new Error('Reply limit reached for this annotation.');
    return {
      ...annotation,
      replies: [
        ...replies,
        { id: stableRandomId('reply'), text: replyText, author: boundedText(author, 256), createdAt: Date.now() },
      ],
      modifiedAt: Date.now(),
    };
  });
  if (!found) throw new Error('Annotation not found.');
  return { ...model, annotations };
}

export function setPdfAnnotationStatus(
  model: PdfDocumentModel,
  annotationId: string,
  status: PdfAnnotationReviewStatus
): PdfDocumentModel {
  if (!ALLOWED_STATUS.has(status)) throw new Error('Unsupported annotation review status.');
  let found = false;
  const annotations = model.annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;
    found = true;
    return { ...annotation, status, modifiedAt: Date.now() };
  });
  if (!found) throw new Error('Annotation not found.');
  return { ...model, annotations };
}

export async function createPdfAnnotationAttachment(file: File): Promise<PdfAnnotationAttachment> {
  if (file.size <= 0 || file.size > PDF_REVIEW_LIMITS.maxAttachmentBytes) throw new Error('Attachment must be between 1 byte and 8 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) throw new Error('Attachment size changed while reading.');
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
  const fileName = (file.name || 'attachment.bin').replace(SAFE_FILE_NAME, '_').slice(0, 255) || 'attachment.bin';
  const mimeType = SAFE_MIME.test(file.type) ? file.type : 'application/octet-stream';
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
  }
  return { fileName, mimeType, byteLength: bytes.length, sha256, dataUrl: `data:${mimeType};base64,${btoa(binary)}` };
}

export async function verifyPdfAnnotationAttachment(attachment: PdfAnnotationAttachment): Promise<boolean> {
  if (!attachment.dataUrl || !SHA256_HEX.test(attachment.sha256)) return false;
  const marker = ';base64,';
  const index = attachment.dataUrl.indexOf(marker);
  if (!attachment.dataUrl.startsWith('data:') || index < 6) return false;
  let bytes: Uint8Array;
  try {
    const binary = atob(attachment.dataUrl.slice(index + marker.length));
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return false;
  }
  if (bytes.length !== attachment.byteLength || bytes.length > PDF_REVIEW_LIMITS.maxAttachmentBytes) return false;
  const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', toOwnedArrayBuffer(bytes))), (value) => value.toString(16).padStart(2, '0')).join('');
  return actual === attachment.sha256.toLowerCase();
}

function normalizeImportedAnnotation(raw: unknown, maxPage: number): PdfAnnotation | null {
  if (!raw || typeof raw !== 'object' || maxPage < 1) return null;
  const item = raw as Record<string, unknown>;
  if (!ALLOWED_TYPES.has(item.type as PdfAnnotationType)) return null;
  const page = boundedNumber(item.page, 1, maxPage, 1);
  if (!Number.isInteger(page)) return null;
  const now = Date.now();
  const status = ALLOWED_STATUS.has(item.status as PdfAnnotationReviewStatus)
    ? (item.status as PdfAnnotationReviewStatus)
    : 'open';
  const points = normalizePoints(item.points);
  const bounds = normalizeBounds(item.bounds);
  const measurement = normalizeMeasurement(item.measurement);
  const replies = normalizeReplies(item.replies, now);
  const attachment = normalizeAttachmentMetadata(item.attachment);
  const shapeKind = ALLOWED_SHAPES.has(item.shapeKind as NonNullable<PdfAnnotation['shapeKind']>)
    ? (item.shapeKind as NonNullable<PdfAnnotation['shapeKind']>)
    : undefined;
  return {
    id: stableRandomId('anno-import'),
    page,
    type: item.type as PdfAnnotationType,
    text: boundedText(item.text),
    color: normalizeColor(item.color),
    author: boundedText(item.author || 'Imported Reviewer', 256),
    createdAt: boundedNumber(item.createdAt, 0, now, now),
    modifiedAt: boundedNumber(item.modifiedAt, 0, now, now),
    status,
    ...(typeof item.sectionId === 'string' ? { sectionId: boundedText(item.sectionId, 512) } : {}),
    ...(typeof item.targetText === 'string' ? { targetText: boundedText(item.targetText) } : {}),
    ...(typeof item.replacementText === 'string' ? { replacementText: boundedText(item.replacementText) } : {}),
    ...(typeof item.stampLabel === 'string' ? { stampLabel: boundedText(item.stampLabel, 256) } : {}),
    ...(points ? { points } : {}),
    ...(bounds ? { bounds } : {}),
    ...(measurement ? { measurement } : {}),
    ...(replies ? { replies } : {}),
    ...(shapeKind ? { shapeKind } : {}),
    ...(attachment ? { attachment } : {}),
  };
}

export function filterAndSortPdfAnnotations(
  annotations: readonly PdfAnnotation[],
  filter: PdfAnnotationViewFilter
): PdfAnnotation[] {
  const query = boundedText(filter.query, 512).trim().toLocaleLowerCase();
  const author = filter.author && filter.author !== 'all' ? boundedText(filter.author, 256) : '';
  const visible = annotations.filter((annotation) => {
    if (filter.page !== undefined && filter.page !== 'all' && annotation.page !== filter.page) return false;
    if (filter.type && filter.type !== 'all' && annotation.type !== filter.type) return false;
    if (filter.status && filter.status !== 'all' && (annotation.status ?? 'open') !== filter.status) return false;
    if (author && (annotation.author ?? '') !== author) return false;
    if (!query) return true;
    const haystack = [
      annotation.text,
      annotation.author,
      annotation.type,
      annotation.status,
      annotation.targetText,
      annotation.replacementText,
      annotation.stampLabel,
      annotation.attachment?.fileName,
      annotation.attachment?.mimeType,
      annotation.measurement ? `${annotation.measurement.value} ${annotation.measurement.unit} ${annotation.measurement.scaleLabel ?? ''}` : '',
      ...(annotation.replies ?? []).flatMap((reply) => [reply.author, reply.text]),
    ].filter(Boolean).join('\n').toLocaleLowerCase();
    return haystack.includes(query);
  });
  const sort = filter.sort ?? 'newest';
  return [...visible].sort((a, b) => {
    if (sort === 'oldest') return (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.page - b.page;
    if (sort === 'page') return a.page - b.page || (b.modifiedAt ?? b.createdAt ?? 0) - (a.modifiedAt ?? a.createdAt ?? 0);
    if (sort === 'author') return (a.author ?? '').localeCompare(b.author ?? '') || a.page - b.page;
    if (sort === 'type') return a.type.localeCompare(b.type) || a.page - b.page;
    return (b.modifiedAt ?? b.createdAt ?? 0) - (a.modifiedAt ?? a.createdAt ?? 0) || b.page - a.page;
  });
}

export function exportPdfAnnotationSummary(model: PdfDocumentModel): Uint8Array {
  const payload = {
    schema: 'vgt.pdf.annotation-summary/v1',
    exportedAt: new Date().toISOString(),
    annotations: model.annotations.map(({ attachment, ...annotation }) => ({
      ...annotation,
      ...(attachment
        ? { attachment: { fileName: attachment.fileName, mimeType: attachment.mimeType, byteLength: attachment.byteLength, sha256: attachment.sha256 } }
        : {}),
    })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  if (bytes.length > PDF_REVIEW_LIMITS.maxSummaryBytes) throw new Error('Annotation summary exceeds 16 MiB.');
  return bytes;
}

export function importPdfAnnotationSummary(model: PdfDocumentModel, bytes: Uint8Array): PdfDocumentModel {
  if (bytes.length <= 0 || bytes.length > PDF_REVIEW_LIMITS.maxSummaryBytes) throw new Error('Annotation summary must be between 1 byte and 16 MiB.');
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let parsed: { schema?: unknown; annotations?: unknown };
  try {
    parsed = JSON.parse(decoded) as { schema?: unknown; annotations?: unknown };
  } catch {
    throw new Error('Annotation summary is not valid JSON.');
  }
  if (parsed.schema !== 'vgt.pdf.annotation-summary/v1' || !Array.isArray(parsed.annotations)) {
    throw new Error('Unsupported annotation summary schema.');
  }
  if (parsed.annotations.length > PDF_REVIEW_LIMITS.maxAnnotations) throw new Error('Annotation summary contains too many entries.');
  const imported = parsed.annotations
    .map((entry) => normalizeImportedAnnotation(entry, model.pages.length))
    .filter((entry): entry is PdfAnnotation => Boolean(entry));
  if (model.annotations.length + imported.length > PDF_REVIEW_LIMITS.maxAnnotations) throw new Error('Annotation limit would be exceeded.');
  return { ...model, annotations: [...model.annotations, ...imported] };
}
