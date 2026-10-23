import { secureRandomId } from '../../../shared/crypto/secureRandom';
import { inspectBoundedForeignXml } from '../../../shared/interoperability/xml';
// STATUS: PLATIN
// Bounded canonical rich-object model for Astraea Whiteboard.

import type { WhiteboardObjectType } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { clampCoordinate, clampDimension, WHITEBOARD_MAX_DIMENSION } from '../viewport/whiteboardViewportEngine';
import { normalizeRotation, sanitizeWhiteboardObjectLink } from './whiteboardManipulationEngine';
import { normalizeWhiteboardItemTextStyle } from './whiteboardTextStyleEngine';

export const WHITEBOARD_OBJECT_TEXT_LIMIT = 20_000;
export const WHITEBOARD_TABLE_MAX_ROWS = 64;
export const WHITEBOARD_TABLE_MAX_COLS = 32;
export const WHITEBOARD_CHART_MAX_VALUES = 256;
export const WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES = 80 * 1024 * 1024;
export const WHITEBOARD_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const WHITEBOARD_SVG_MAX_BYTES = 2 * 1024 * 1024;
export const WHITEBOARD_IMAGE_HEADER_SCAN_MAX_BYTES = 2 * 1024 * 1024;
export const WHITEBOARD_IMAGE_MAX_DIMENSION = 16_384;
export const WHITEBOARD_IMAGE_MAX_PIXELS = 24_000_000;

export type WhiteboardRichObjectType = Extract<WhiteboardObjectType, 'shape' | 'icon' | 'table' | 'card' | 'document' | 'chart' | 'code' | 'media' | 'reaction'>;

const trim = (value: unknown, max = 512) => String(value ?? '').replace(/\0/g, '').slice(0, max);
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value).toLowerCase() : fallback;
const createId = (prefix: string) => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? `${prefix}-${crypto.randomUUID()}`
  : secureRandomId(prefix);

export function createDefaultWhiteboardRichObject(type: WhiteboardRichObjectType, x: number, y: number): WhiteboardItem {
  const base = { id: createId(`wb-${type}`), type, x: clampCoordinate(x), y: clampCoordinate(y), width: 260, height: 150, text: '' } as WhiteboardItem;
  switch (type) {
    case 'shape': return { ...base, width: 180, height: 120, shape: { kind: 'ellipse', fill: '#0f172a', stroke: '#38bdf8', strokeWidth: 2 }, text: 'Shape' };
    case 'icon': return { ...base, width: 150, height: 130, icon: { name: 'server', label: 'Server' }, text: 'Server' };
    case 'table': return { ...base, width: 360, height: 210, table: { columns: ['Owner', 'Status', 'Priority'], rows: [['Platform', 'Active', 'High'], ['Security', 'Review', 'High'], ['UX', 'Planned', 'Medium']] }, text: 'Table' };
    case 'card': return { ...base, width: 280, height: 160, card: { cardKind: 'task', title: 'Workspace task', subtitle: 'Canonical task card', status: 'In progress', tags: ['whiteboard'] }, text: 'Workspace task' };
    case 'document': return { ...base, width: 300, height: 180, document: { documentKind: 'Writer', title: 'Linked document', excerpt: 'Document card ready for a stable Workspace reference.' }, text: 'Linked document' };
    case 'chart': return { ...base, width: 320, height: 210, chart: { chartKind: 'bar', title: 'Data widget', labels: ['A', 'B', 'C', 'D'], values: [42, 67, 51, 83] }, text: 'Data widget' };
    case 'code': return { ...base, width: 360, height: 220, code: { language: 'typescript', code: "const secure = true;\nreturn workspace.persist(secure);" }, text: 'Code snippet' };
    case 'media': return { ...base, width: 360, height: 220, media: { mediaKind: 'audio', mime: '', name: 'Local media' }, text: 'Local media' };
    case 'reaction': return { ...base, width: 150, height: 92, reaction: { emoji: '👍', label: 'Agree', count: 0 }, text: 'Agree' };
  }
}

export function normalizeWhiteboardRichObject(item: WhiteboardItem): WhiteboardItem {
  const minWidth = Math.max(1, Math.min(WHITEBOARD_MAX_DIMENSION, finite(item.constraints?.minWidth, 20)));
  const minHeight = Math.max(1, Math.min(WHITEBOARD_MAX_DIMENSION, finite(item.constraints?.minHeight, 20)));
  const maxWidth = Math.max(minWidth, Math.min(WHITEBOARD_MAX_DIMENSION, finite(item.constraints?.maxWidth, WHITEBOARD_MAX_DIMENSION)));
  const maxHeight = Math.max(minHeight, Math.min(WHITEBOARD_MAX_DIMENSION, finite(item.constraints?.maxHeight, WHITEBOARD_MAX_DIMENSION)));
  const normalized: WhiteboardItem = {
    ...item, x: clampCoordinate(item.x), y: clampCoordinate(item.y), width: clampDimension(item.width), height: clampDimension(item.height), text: trim(item.text, WHITEBOARD_OBJECT_TEXT_LIMIT),
    rotation: normalizeRotation(finite(item.rotation, 0)), hidden: item.hidden === true, groupId: trim(item.groupId, 120) || undefined,
    zIndex: Math.max(-1_000_000, Math.min(1_000_000, Math.trunc(finite(item.zIndex, 0)))), linkUri: sanitizeWhiteboardObjectLink(item.linkUri),
    constraints: item.constraints ? { moveAxis: ['free','horizontal','vertical'].includes(item.constraints.moveAxis ?? '') ? item.constraints.moveAxis : 'free', lockAspectRatio: item.constraints.lockAspectRatio === true, minWidth, minHeight, maxWidth, maxHeight, keepInsideFrameId: item.constraints.keepInsideFrameId?.slice(0, 256) } : undefined,
  };
  if (item.shape) normalized.shape = { kind: ['rectangle','rounded-rectangle','ellipse','diamond','triangle'].includes(item.shape.kind) ? item.shape.kind : 'rectangle', fill: safeColor(item.shape.fill, '#0f172a'), stroke: safeColor(item.shape.stroke, '#38bdf8'), strokeWidth: Math.max(.5, Math.min(24, finite(item.shape.strokeWidth, 2))) } as typeof item.shape;
  if (item.icon) normalized.icon = { name: ['server','database','cloud','shield','user','globe'].includes(item.icon.name) ? item.icon.name : 'server', label: trim(item.icon.label, 120) } as typeof item.icon;
  if (item.table) normalized.table = { columns: item.table.columns.slice(0, WHITEBOARD_TABLE_MAX_COLS).map((value) => trim(value, 160)), rows: item.table.rows.slice(0, WHITEBOARD_TABLE_MAX_ROWS).map((row) => row.slice(0, WHITEBOARD_TABLE_MAX_COLS).map((value) => trim(value, 500))) };
  if (item.card) normalized.card = { cardKind: item.card.cardKind === 'task' ? 'task' : 'generic', title: trim(item.card.title, 240), subtitle: trim(item.card.subtitle, 500) || undefined, status: trim(item.card.status, 80) || undefined, tags: item.card.tags?.slice(0, 16).map((tag) => trim(tag, 48)), sourceUri: sanitizeWorkspaceUri(item.card.sourceUri) };
  if (item.document) normalized.document = { documentKind: trim(item.document.documentKind, 64), title: trim(item.document.title, 240), excerpt: trim(item.document.excerpt, 4000), sourceUri: sanitizeWorkspaceUri(item.document.sourceUri) };
  if (item.chart) { const length = Math.min(item.chart.values.length, item.chart.labels.length, WHITEBOARD_CHART_MAX_VALUES); normalized.chart = { chartKind: ['bar','line','donut'].includes(item.chart.chartKind) ? item.chart.chartKind : 'bar', title: trim(item.chart.title, 240), labels: item.chart.labels.slice(0, length).map((value) => trim(value, 80)), values: item.chart.values.slice(0, length).map((value) => Math.max(-1e12, Math.min(1e12, finite(value, 0))) ) } as typeof item.chart; }
  if (item.code) normalized.code = { language: trim(item.code.language, 64), code: trim(item.code.code, WHITEBOARD_OBJECT_TEXT_LIMIT) };
  if (item.media) normalized.media = { mediaKind: item.media.mediaKind === 'video' ? 'video' : 'audio', mime: trim(item.media.mime, 100), name: trim(item.media.name, 240), dataUrl: sanitizeEmbeddedMediaDataUrl(item.media.dataUrl, item.media.mime) };
  if (item.reaction) normalized.reaction = { emoji: trim(item.reaction.emoji, 16), label: trim(item.reaction.label, 80), count: Math.max(0, Math.min(1_000_000, Math.floor(finite(item.reaction.count, 0)))) };
  // Typography travels in the same canonical object as everything else; bounded by the style engine.
  return normalizeWhiteboardItemTextStyle(normalized);
}

export function sanitizeWorkspaceUri(value?: string): string | undefined {
  if (!value) return undefined;
  const uri = trim(value, 2048);
  return /^vgt:\/\/workspace\/[a-z0-9/_?=&.%:-]+$/i.test(uri) ? uri : undefined;
}

export function sanitizeEmbeddedMediaDataUrl(value: string | undefined, declaredMime: string): string | undefined {
  if (!value) return undefined;
  const allowed = ['audio/mpeg','audio/wav','audio/ogg','video/mp4','video/webm'];
  if (!allowed.includes(declaredMime)) return undefined;
  const prefix = `data:${declaredMime};base64,`;
  if (!value.startsWith(prefix)) return undefined;
  const encoded = value.slice(prefix.length);
  if (encoded.length > Math.ceil(WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES * 4 / 3) + 16 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return undefined;
  return value;
}

export function validateEmbeddedMediaSignature(bytes: Uint8Array, mime: string, totalSize = bytes.length): boolean {
  if (bytes.length === 0 || bytes.length > WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES || totalSize <= 0 || totalSize > WHITEBOARD_EMBEDDED_MEDIA_MAX_BYTES) return false;
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));
  if (mime === 'video/mp4') return totalSize >= 12 && bytes.length >= 12 && ascii(4,4) === 'ftyp';
  if (mime === 'video/webm') return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (mime === 'audio/wav') return bytes.length >= 12 && ascii(0,4) === 'RIFF' && ascii(8,4) === 'WAVE';
  if (mime === 'audio/ogg') return bytes.length >= 4 && ascii(0,4) === 'OggS';
  if (mime === 'audio/mpeg') return bytes.length >= 3 && (ascii(0,3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  return false;
}

export function validateRasterImageSignature(
  bytes: Uint8Array,
  mime: string,
  totalSize = bytes.length,
  trailingBytes = bytes,
): boolean {
  if (bytes.length === 0 || bytes.length > WHITEBOARD_IMAGE_MAX_BYTES || totalSize <= 0 || totalSize > WHITEBOARD_IMAGE_MAX_BYTES) return false;
  if (mime === 'image/png') return totalSize >= 8 && bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value,index)=>bytes[index]===value);
  if (mime === 'image/jpeg') return totalSize >= 4 && bytes.length >= 2 && trailingBytes.length >= 2 && bytes[0]===0xff && bytes[1]===0xd8 && trailingBytes[trailingBytes.length-2]===0xff && trailingBytes[trailingBytes.length-1]===0xd9;
  if (mime === 'image/webp') return totalSize >= 12 && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  return false;
}

export interface WhiteboardRasterImageDimensions {
  width: number;
  height: number;
}

const JPEG_START_OF_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readJpegDimensions(header: Uint8Array): WhiteboardRasterImageDimensions | null {
  if (header.length < 4 || header[0] !== 0xff || header[1] !== 0xd8) return null;
  let offset = 2;
  let markerCount = 0;
  while (offset < header.length && markerCount < 4096) {
    markerCount += 1;
    if (header[offset] !== 0xff) return null;
    while (header[offset] === 0xff) offset += 1;
    const marker = header[offset];
    offset += 1;
    if (marker === undefined || marker === 0x00 || marker === 0xda || marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > header.length) return null;
    const segmentLength = (header[offset] << 8) | header[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > header.length) return null;
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      const height = (header[offset + 3] << 8) | header[offset + 4];
      const width = (header[offset + 5] << 8) | header[offset + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

export function readWhiteboardRasterImageDimensions(
  header: Uint8Array,
  mime: string,
): WhiteboardRasterImageDimensions | null {
  if (header.length > WHITEBOARD_IMAGE_HEADER_SCAN_MAX_BYTES) return null;
  if (mime === 'image/png') {
    if (header.length < 24 || !validateRasterImageSignature(header, mime, Math.max(24, header.length))) return null;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (mime === 'image/jpeg') return readJpegDimensions(header);
  if (mime !== 'image/webp' || header.length < 30 || !validateRasterImageSignature(header, mime, Math.max(30, header.length))) return null;

  const chunkType = String.fromCharCode(...header.slice(12, 16));
  if (chunkType === 'VP8X') {
    const width = 1 + header[24] + (header[25] << 8) + (header[26] << 16);
    const height = 1 + header[27] + (header[28] << 8) + (header[29] << 16);
    return { width, height };
  }
  if (chunkType === 'VP8 ' && header[23] === 0x9d && header[24] === 0x01 && header[25] === 0x2a) {
    const width = ((header[26] | (header[27] << 8)) & 0x3fff);
    const height = ((header[28] | (header[29] << 8)) & 0x3fff);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunkType === 'VP8L' && header[20] === 0x2f) {
    const bits = (header[21] | (header[22] << 8) | (header[23] << 16) | (header[24] << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function isWhiteboardRasterImageWithinDecodeBudget(dimensions: WhiteboardRasterImageDimensions): boolean {
  return Number.isSafeInteger(dimensions.width)
    && Number.isSafeInteger(dimensions.height)
    && dimensions.width > 0
    && dimensions.height > 0
    && dimensions.width <= WHITEBOARD_IMAGE_MAX_DIMENSION
    && dimensions.height <= WHITEBOARD_IMAGE_MAX_DIMENSION
    && dimensions.width * dimensions.height <= WHITEBOARD_IMAGE_MAX_PIXELS;
}

const SVG_ALLOWED_TAGS = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','clippath','lineargradient','radialgradient','stop','pattern','marker']);
export function sanitizeWhiteboardSvgSource(source: string): string | null {
  if (!source || new TextEncoder().encode(source).length > WHITEBOARD_SVG_MAX_BYTES) return null;
  try { inspectBoundedForeignXml(source, { maxBytes: WHITEBOARD_SVG_MAX_BYTES, maxDepth: 64, maxElements: 10_000 }); } catch { return null; }
  const compact = source.replace(/\0/g,'').trim().replace(/^<\?xml[^?]*\?>\s*/i, '');
  if (!/^<svg\b/i.test(compact) || !/<\/svg>\s*$/i.test(compact)) return null;
  if (/<\s*(script|foreignobject|iframe|image|use|style|a|audio|video|object|embed)\b/i.test(compact)) return null;
  const withoutLocalPaintRefs = compact.replace(/url\(\s*#[A-Za-z_][\w:.-]*\s*\)/gi, '');
  if (/\bon[a-z]+\s*=|javascript:|data:text\/html|\b(?:href|xlink:href)\s*=|url\s*\(|@import|<!doctype|<!entity/i.test(withoutLocalPaintRefs)) return null;
  const tags = [...compact.matchAll(/<\/?\s*([a-zA-Z][\w:-]*)\b/g)].map((match) => match[1].toLowerCase());
  if (tags.some((tag) => !SVG_ALLOWED_TAGS.has(tag))) return null;
  return compact;
}
