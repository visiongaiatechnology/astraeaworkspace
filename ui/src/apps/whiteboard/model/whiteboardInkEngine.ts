import { secureRandomId } from '../../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME
// Bounded local-first vector ink engine for Astraea Whiteboard.

import type {
  WhiteboardInkData,
  WhiteboardInkPoint,
  WhiteboardInkPointerType,
  WhiteboardInkPreset,
  WhiteboardInkRecognizedShape,
} from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { clampCoordinate, clampDimension } from '../viewport/whiteboardViewportEngine';

export const WHITEBOARD_INK_MAX_POINTS_PER_STROKE = 4096;
export const WHITEBOARD_INK_MAX_ERASER_SAMPLES = 512;
export const WHITEBOARD_INK_HISTORY_LIMIT = 64;

export interface WhiteboardInkPointerSample {
  x: number;
  y: number;
  t: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  pointerType?: string;
}

export interface WhiteboardInkDraft {
  id: string;
  preset: WhiteboardInkPreset;
  inputType: WhiteboardInkPointerType;
  points: WhiteboardInkPoint[];
  color: string;
  width: number;
  opacity: number;
  arrowStart: boolean;
  arrowEnd: boolean;
}

export interface WhiteboardInkFinalizeOptions {
  straightLine: boolean;
  recognizeShape: boolean;
  preserveId?: string;
}

export interface WhiteboardInkHistoryEntry {
  documentId: string;
  affectedIds: string[];
  before: WhiteboardItem[];
  after: WhiteboardItem[];
}

export function createWhiteboardInkHistoryEntry(documentId: string, beforeItems: readonly WhiteboardItem[], afterItems: readonly WhiteboardItem[]): WhiteboardInkHistoryEntry | null {
  const before = new Map(beforeItems.filter((item) => item.type === 'ink').map((item) => [item.id, item]));
  const after = new Map(afterItems.filter((item) => item.type === 'ink').map((item) => [item.id, item]));
  const affectedIds: string[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) if (before.get(id) !== after.get(id)) affectedIds.push(id);
  if (!affectedIds.length) return null;
  const affected = new Set(affectedIds);
  return {
    documentId,
    affectedIds,
    before: beforeItems.filter((item) => item.type === 'ink' && affected.has(item.id)),
    after: afterItems.filter((item) => item.type === 'ink' && affected.has(item.id)),
  };
}

export function applyWhiteboardInkHistoryEntry(items: readonly WhiteboardItem[], documentId: string, entry: WhiteboardInkHistoryEntry, direction: 'undo' | 'redo'): WhiteboardItem[] {
  if (entry.documentId !== documentId) return [...items];
  const affected = new Set(entry.affectedIds);
  const replacements = direction === 'undo' ? entry.before : entry.after;
  // Only ink IDs created/changed by the gesture are replaced. Non-ink edits made later remain intact.
  return [...items.filter((item) => !(item.type === 'ink' && affected.has(item.id))), ...replacements];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const round = (value: number) => Math.round(value * 100) / 100;
/**
 * Die **eine** Übersetzung eines Zeigertyps (Paket 11 braucht sie ebenfalls: die Ablagezone nennt ihre
 * Eingabeart in Worten). *Zwei Übersetzungen desselben Zeigertyps wären zwei Wahrheiten.*
 */
export const normalizePointerType = (value?: string): WhiteboardInkPointerType => value === 'pen' || value === 'touch' ? value : 'mouse';
const sanitizeColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : '#60a5fa';

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return secureRandomId(prefix);
}

export function inkPointFromSample(sample: WhiteboardInkPointerSample): WhiteboardInkPoint {
  const pointerType = normalizePointerType(sample.pointerType);
  return {
    x: clampCoordinate(sample.x),
    y: clampCoordinate(sample.y),
    t: clamp(sample.t, 0, Number.MAX_SAFE_INTEGER),
    pressure: round(clamp(sample.pressure ?? (pointerType === 'mouse' ? 0.5 : 0), 0, 1)),
    tiltX: round(clamp(sample.tiltX ?? 0, -90, 90)),
    tiltY: round(clamp(sample.tiltY ?? 0, -90, 90)),
  };
}

export function createInkDraft(
  preset: WhiteboardInkPreset,
  sample: WhiteboardInkPointerSample,
  color: string,
  width: number,
  arrowStart = false,
  arrowEnd = false
): WhiteboardInkDraft {
  const baseWidth = clamp(width, 0.5, 48);
  return {
    id: randomId('ink'),
    preset,
    inputType: normalizePointerType(sample.pointerType),
    points: [inkPointFromSample(sample)],
    color: sanitizeColor(color),
    width: round(preset === 'highlighter' ? Math.max(8, baseWidth * 4) : preset === 'pencil' ? Math.max(0.75, baseWidth * 0.7) : baseWidth),
    opacity: preset === 'highlighter' ? 0.28 : preset === 'pencil' ? 0.72 : 1,
    arrowStart,
    arrowEnd,
  };
}

export function appendInkDraftPoint(draft: WhiteboardInkDraft, sample: WhiteboardInkPointerSample): WhiteboardInkDraft {
  if (draft.points.length >= WHITEBOARD_INK_MAX_POINTS_PER_STROKE) return draft;
  const point = inkPointFromSample(sample);
  const previous = draft.points[draft.points.length - 1];
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.55 && point.t - previous.t < 12) return draft;
  return { ...draft, points: [...draft.points, point] };
}

function smoothPoints(points: readonly WhiteboardInkPoint[]): WhiteboardInkPoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const out: WhiteboardInkPoint[] = [{ ...points[0] }];
  for (let index = 1; index < points.length - 1; index += 1) {
    const a = points[index - 1]; const b = points[index]; const c = points[index + 1];
    const next = {
      x: round(a.x * 0.2 + b.x * 0.6 + c.x * 0.2),
      y: round(a.y * 0.2 + b.y * 0.6 + c.y * 0.2),
      t: b.t,
      pressure: round(a.pressure * 0.15 + b.pressure * 0.7 + c.pressure * 0.15),
      tiltX: round(a.tiltX * 0.15 + b.tiltX * 0.7 + c.tiltX * 0.15),
      tiltY: round(a.tiltY * 0.15 + b.tiltY * 0.7 + c.tiltY * 0.15),
    };
    const previous = out[out.length - 1];
    if (Math.hypot(next.x - previous.x, next.y - previous.y) >= 0.45) out.push(next);
  }
  out.push({ ...points[points.length - 1] });
  return out.slice(0, WHITEBOARD_INK_MAX_POINTS_PER_STROKE);
}

function strokeBounds(points: readonly WhiteboardInkPoint[]) {
  let minX = points[0]?.x ?? 0; let maxX = minX; let minY = points[0]?.y ?? 0; let maxY = minY;
  for (const point of points) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); }
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function distanceToSegment(point: WhiteboardInkPoint, a: WhiteboardInkPoint, b: WhiteboardInkPoint): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function recognizeWhiteboardInkShape(points: readonly WhiteboardInkPoint[]): { shape: WhiteboardInkRecognizedShape; confidence: number } | null {
  if (points.length < 2) return null;
  const bounds = strokeBounds(points); const diagonal = Math.hypot(bounds.width, bounds.height);
  const first = points[0]; const last = points[points.length - 1];
  let lineError = 0;
  for (const point of points) lineError = Math.max(lineError, distanceToSegment(point, first, last));
  const normalizedLineError = lineError / Math.max(1, diagonal);
  if (normalizedLineError < 0.055) return { shape: 'line', confidence: Math.max(0.6, 1 - normalizedLineError * 5) };
  if (points.length < 6 || Math.hypot(last.x - first.x, last.y - first.y) > diagonal * 0.22) return null;
  const cx = (bounds.minX + bounds.maxX) / 2; const cy = (bounds.minY + bounds.maxY) / 2;
  let ellipseError = 0; let rectError = 0;
  for (const point of points) {
    ellipseError += Math.abs(Math.hypot((point.x - cx) / (bounds.width / 2), (point.y - cy) / (bounds.height / 2)) - 1);
    rectError += Math.min(Math.abs(point.x - bounds.minX), Math.abs(point.x - bounds.maxX), Math.abs(point.y - bounds.minY), Math.abs(point.y - bounds.maxY)) / Math.max(1, Math.min(bounds.width, bounds.height));
  }
  ellipseError /= points.length; rectError /= points.length;
  if (rectError < ellipseError * 0.8 && rectError < 0.11) return { shape: 'rect', confidence: Math.max(0.6, 1 - rectError * 3) };
  if (ellipseError < 0.23) return { shape: 'ellipse', confidence: Math.max(0.6, 1 - ellipseError) };
  return null;
}

export function finalizeInkDraft(draft: WhiteboardInkDraft, options: WhiteboardInkFinalizeOptions): WhiteboardItem | null {
  if (draft.points.length < 2) return null;
  let points = smoothPoints(draft.points);
  let recognizedShape: WhiteboardInkRecognizedShape | undefined;
  if (options.straightLine) {
    points = [points[0], points[points.length - 1]];
    recognizedShape = 'line';
  } else if (options.recognizeShape) {
    recognizedShape = recognizeWhiteboardInkShape(points)?.shape;
  }
  const bounds = strokeBounds(points);
  const padding = Math.max(8, draft.width * 1.5);
  const x = clampCoordinate(bounds.minX - padding);
  const y = clampCoordinate(bounds.minY - padding);
  const localPoints = points.map((point) => ({ ...point, x: round(point.x - x), y: round(point.y - y) }));
  const ink: WhiteboardInkData = {
    preset: draft.preset,
    inputType: draft.inputType,
    points: localPoints,
    color: sanitizeColor(draft.color),
    width: round(clamp(draft.width, 0.5, 48)),
    opacity: round(clamp(draft.opacity, 0.05, 1)),
    arrowStart: draft.arrowStart || undefined,
    arrowEnd: draft.arrowEnd || undefined,
    recognizedShape,
  };
  return {
    id: options.preserveId || draft.id,
    type: 'ink',
    x,
    y,
    width: clampDimension(bounds.width + padding * 2),
    height: clampDimension(bounds.height + padding * 2),
    text: '',
    ink,
  };
}

export function inkPathData(points: readonly WhiteboardInkPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${round(points[0].x)} ${round(points[0].y)}`;
  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]; const next = points[index + 1];
    const midX = round((current.x + next.x) / 2); const midY = round((current.y + next.y) / 2);
    path += ` Q ${round(current.x)} ${round(current.y)} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  path += ` L ${round(last.x)} ${round(last.y)}`;
  return path;
}

export function effectiveInkWidth(ink: WhiteboardInkData): number {
  if (!ink.points.length) return ink.width;
  let pressure = 0; let tilt = 0;
  for (const point of ink.points) { pressure += point.pressure; tilt += Math.hypot(point.tiltX, point.tiltY); }
  pressure /= ink.points.length; tilt /= ink.points.length;
  return round(clamp(ink.width * (0.72 + pressure * 0.56 + Math.min(tilt, 90) / 1200), 0.5, 64));
}

function globalInkPoints(item: WhiteboardItem): WhiteboardInkPoint[] {
  return (item.ink?.points ?? []).map((point) => ({ ...point, x: point.x + item.x, y: point.y + item.y }));
}

function sampledPath(points: readonly WhiteboardInkPoint[], limit = WHITEBOARD_INK_MAX_ERASER_SAMPLES): WhiteboardInkPoint[] {
  if (points.length <= limit) return points.map((point) => ({ ...point }));
  const step = Math.ceil(points.length / limit); const out: WhiteboardInkPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push({ ...points[i] });
  if (out[out.length - 1] !== points[points.length - 1]) out.push({ ...points[points.length - 1] });
  return out;
}

function nearPath(point: WhiteboardInkPoint, path: readonly WhiteboardInkPoint[], radius: number): boolean {
  for (const sample of path) if (Math.hypot(point.x - sample.x, point.y - sample.y) <= radius) return true;
  return false;
}

export function eraseWhiteboardInk(
  items: WhiteboardItem[],
  eraserPoints: readonly WhiteboardInkPoint[],
  radius: number,
  mode: 'point' | 'object'
): WhiteboardItem[] {
  const path = sampledPath(eraserPoints);
  if (!path.length) return items;
  const safeRadius = clamp(radius, 2, 200);
  const out: WhiteboardItem[] = [];
  for (const item of items) {
    if (item.locked) { out.push(item); continue; }
    // Ink erasers never delete non-ink canvas objects. "Object" means the whole ink stroke object.
    if (item.type !== 'ink' || !item.ink?.points.length) { out.push(item); continue; }
    const global = globalInkPoints(item);
    if (mode === 'object') {
      let touched = false;
      for (const point of global) { if (nearPath(point, path, safeRadius)) { touched = true; break; } }
      if (!touched) out.push(item);
      continue;
    }
    const segments: WhiteboardInkPoint[][] = []; let current: WhiteboardInkPoint[] = [];
    for (const point of global) {
      if (nearPath(point, path, safeRadius)) {
        if (current.length >= 2) segments.push(current);
        current = [];
      } else current.push(point);
    }
    if (current.length >= 2) segments.push(current);
    if (segments.length === 1 && segments[0].length === global.length) { out.push(item); continue; }
    segments.forEach((segment, index) => {
      const draft: WhiteboardInkDraft = { id: index === 0 ? item.id : randomId('ink'), preset: item.ink!.preset, inputType: item.ink!.inputType, points: segment, color: item.ink!.color, width: item.ink!.width, opacity: item.ink!.opacity, arrowStart: Boolean(item.ink!.arrowStart && index === 0), arrowEnd: Boolean(item.ink!.arrowEnd && index === segments.length - 1) };
      const split = finalizeInkDraft(draft, { straightLine: false, recognizeShape: false, preserveId: index === 0 ? item.id : undefined });
      if (split) out.push(split);
    });
  }
  return out;
}

function pointInPolygon(point: WhiteboardInkPoint, polygon: readonly WhiteboardInkPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]; const b = polygon[j];
    const crosses = ((a.y > point.y) !== (b.y > point.y)) && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function lassoSelectInkItems(items: readonly WhiteboardItem[], polygon: readonly WhiteboardInkPoint[]): string[] {
  if (polygon.length < 3) return [];
  return items.filter((item) => item.type === 'ink' && item.ink?.points.length).filter((item) => {
    const points = globalInkPoints(item);
    return points.some((point) => pointInPolygon(point, polygon)) || pointInPolygon({ ...points[0], x: item.x + item.width / 2, y: item.y + item.height / 2 }, polygon);
  }).map((item) => item.id);
}

export function translateInkItems(items: WhiteboardItem[], ids: ReadonlySet<string>, dx: number, dy: number): WhiteboardItem[] {
  return items.map((item) => ids.has(item.id) && item.type === 'ink' && !item.locked ? { ...item, x: clampCoordinate(item.x + dx), y: clampCoordinate(item.y + dy) } : item);
}
