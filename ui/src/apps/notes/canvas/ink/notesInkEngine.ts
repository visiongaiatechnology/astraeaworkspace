// STATUS: DIAMANT VGT SUPREME — bounded local-first Notes ink domain and recognition adapters
import type {
  NoteInkDocument,
  NoteInkPoint,
  NoteInkPointerType,
  NoteInkStroke,
  NoteInkTool,
} from '../../../../shared/contracts/notes-pdf/workspaceNotes';

export const NOTE_INK_MAX_STROKES = 256;
export const NOTE_INK_MAX_POINTS_PER_STROKE = 4096;
export const NOTE_INK_MAX_TOTAL_POINTS = 48_000;
export const NOTE_INK_MAX_RECOGNIZED_TEXT = 16_384;
const MIN_CANVAS = 128;
const MAX_CANVAS = 8_192;

export interface InkPointerSample {
  x: number;
  y: number;
  t: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  pointerType?: string;
}

export interface InkPalmPolicy {
  rejectTouch: boolean;
  lastPenTimestamp: number;
  now: number;
  contactWidth: number;
  contactHeight: number;
  pointerType: string;
  isPrimary: boolean;
}

export interface InkShapeRecognition {
  shape: 'line' | 'rect' | 'ellipse';
  confidence: number;
}

export interface InkMathRecognition {
  text: '-' | '+' | '=' | '×';
  latex: '-' | '+' | '=' | '\\times';
  confidence: number;
}

interface WebHandwritingStrokeLike {
  addPoint(point: { x: number; y: number; t?: number }): void;
}
interface WebHandwritingDrawingLike {
  addStroke(stroke: WebHandwritingStrokeLike): void;
  getPrediction(): Promise<Array<{ text: string }>>;
}
interface WebHandwritingRecognizerLike {
  startDrawing(hints?: { recognitionType?: 'text' | 'per-character'; inputType?: 'mouse' | 'touch' | 'stylus'; alternatives?: number }): WebHandwritingDrawingLike;
  finish(): void;
}
interface NavigatorWithHandwriting {
  createHandwritingRecognizer?: (constraint: { languages: string[] }) => Promise<WebHandwritingRecognizerLike>;
}
interface GlobalWithHandwritingStroke {
  HandwritingStroke?: new () => WebHandwritingStrokeLike;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const round = (value: number): number => Math.round(value * 100) / 100;

function stableInkId(prefix: string): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') throw new Error('Cryptographic random UUID support is required for ink objects.');
  return `${prefix}-${crypto.randomUUID()}`;
}

function sanitizeColor(value: string): string {
  const color = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : '#60a5fa';
}

/**
 * **Die eine Übersetzung** von `PointerEvent.pointerType` in dieser Anwendung. Exportiert, damit die Ablagezone
 * (Paket 12) sie **benutzt** statt eine zweite zu schreiben: *ein zweites „unbekannt heißt Maus" wäre eine zweite
 * Wahrheit über dieselbe Zeigerart.*
 */
export function normalizePointerType(value: string | undefined): NoteInkPointerType {
  return value === 'touch' || value === 'pen' ? value : 'mouse';
}

function normalizePoint(point: NoteInkPoint, width: number, height: number): NoteInkPoint {
  return {
    x: round(clamp(point.x, 0, width)),
    y: round(clamp(point.y, 0, height)),
    t: round(clamp(point.t, 0, Number.MAX_SAFE_INTEGER)),
    pressure: round(clamp(point.pressure, 0, 1)),
    tiltX: round(clamp(point.tiltX, -90, 90)),
    tiltY: round(clamp(point.tiltY, -90, 90)),
  };
}

export function createEmptyNoteInkDocument(width = 640, height = 360): NoteInkDocument {
  return { version: 1, width: clamp(width, MIN_CANVAS, MAX_CANVAS), height: clamp(height, MIN_CANVAS, MAX_CANVAS), strokes: [] };
}

export function normalizeNoteInkDocument(source: NoteInkDocument | undefined, fallbackWidth = 640, fallbackHeight = 360): NoteInkDocument {
  const width = clamp(source?.width ?? fallbackWidth, MIN_CANVAS, MAX_CANVAS);
  const height = clamp(source?.height ?? fallbackHeight, MIN_CANVAS, MAX_CANVAS);
  const strokes: NoteInkStroke[] = [];
  let totalPoints = 0;
  for (const raw of (source?.strokes ?? []).slice(0, NOTE_INK_MAX_STROKES)) {
    if (totalPoints >= NOTE_INK_MAX_TOTAL_POINTS) break;
    const room = NOTE_INK_MAX_TOTAL_POINTS - totalPoints;
    const points = (raw.points ?? []).slice(0, Math.min(NOTE_INK_MAX_POINTS_PER_STROKE, room)).map((point) => normalizePoint(point, width, height));
    if (!points.length) continue;
    totalPoints += points.length;
    const tool: NoteInkTool = ['pen', 'highlighter', 'line', 'rect', 'ellipse'].includes(raw.tool) ? raw.tool : 'pen';
    strokes.push({
      id: raw.id || stableInkId('stroke'),
      tool,
      inputType: normalizePointerType(raw.inputType),
      points,
      color: sanitizeColor(raw.color),
      width: round(clamp(raw.width, 0.5, 48)),
      opacity: round(clamp(raw.opacity, 0.05, 1)),
    });
  }
  const recognition = source?.recognition?.text.trim()
    ? {
        text: source.recognition.text.trim().slice(0, NOTE_INK_MAX_RECOGNIZED_TEXT),
        engine: 'web-handwriting-api' as const,
        language: source.recognition.language.trim().slice(0, 32) || 'en',
        updatedAt: clamp(source.recognition.updatedAt, 0, Number.MAX_SAFE_INTEGER),
      }
    : undefined;
  return { version: 1, width, height, strokes, ...(recognition ? { recognition } : {}) };
}

export function pointFromPointerSample(sample: InkPointerSample): NoteInkPoint {
  return {
    x: sample.x,
    y: sample.y,
    t: sample.t,
    pressure: clamp(sample.pressure ?? (normalizePointerType(sample.pointerType) === 'mouse' ? 0.5 : 0), 0, 1),
    tiltX: clamp(sample.tiltX ?? 0, -90, 90),
    tiltY: clamp(sample.tiltY ?? 0, -90, 90),
  };
}

export function createNoteInkStroke(tool: NoteInkTool, sample: InkPointerSample, color: string, width: number): NoteInkStroke {
  return {
    id: stableInkId('stroke'),
    tool,
    inputType: normalizePointerType(sample.pointerType),
    points: [pointFromPointerSample(sample)],
    color: sanitizeColor(color),
    width: round(clamp(tool === 'highlighter' ? width * 4 : width, 0.5, 48)),
    opacity: tool === 'highlighter' ? 0.35 : 1,
  };
}

export function appendNoteInkPoint(stroke: NoteInkStroke, sample: InkPointerSample): NoteInkStroke {
  if (stroke.points.length >= NOTE_INK_MAX_POINTS_PER_STROKE) return stroke;
  const point = pointFromPointerSample(sample);
  const previous = stroke.points[stroke.points.length - 1];
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.65 && point.t - previous.t < 12) return stroke;
  if (stroke.tool === 'line' || stroke.tool === 'rect' || stroke.tool === 'ellipse') return { ...stroke, points: [stroke.points[0], point] };
  return { ...stroke, points: [...stroke.points, point] };
}

export function shouldAcceptInkPointer(policy: InkPalmPolicy): boolean {
  if (!policy.isPrimary) return false;
  if (policy.pointerType === 'pen') return true;
  if (policy.pointerType === 'touch') {
    if (policy.rejectTouch) return false;
    if (policy.now - policy.lastPenTimestamp < 800) return false;
    if (policy.contactWidth >= 28 || policy.contactHeight >= 28) return false;
  }
  return true;
}

function distToSegment(point: NoteInkPoint, a: NoteInkPoint, b: NoteInkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function eraseInkNear(document: NoteInkDocument, point: NoteInkPoint, radius = 18): NoteInkDocument {
  const state = normalizeNoteInkDocument(document);
  return {
    ...state,
    recognition: undefined,
    strokes: state.strokes.filter((stroke) => {
      if (stroke.points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= radius)) return false;
      for (let index = 1; index < stroke.points.length; index += 1) if (distToSegment(point, stroke.points[index - 1], stroke.points[index]) <= radius) return false;
      return true;
    }),
  };
}

function pointInPolygon(x: number, y: number, polygon: readonly NoteInkPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = ((a.y > y) !== (b.y > y)) && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function lassoSelectInkStrokeIds(document: NoteInkDocument, polygon: readonly NoteInkPoint[]): string[] {
  if (polygon.length < 3) return [];
  const state = normalizeNoteInkDocument(document);
  return state.strokes.filter((stroke) => {
    if (stroke.points.some((point) => pointInPolygon(point.x, point.y, polygon))) return true;
    const minX = Math.min(...stroke.points.map((point) => point.x));
    const maxX = Math.max(...stroke.points.map((point) => point.x));
    const minY = Math.min(...stroke.points.map((point) => point.y));
    const maxY = Math.max(...stroke.points.map((point) => point.y));
    return pointInPolygon((minX + maxX) / 2, (minY + maxY) / 2, polygon);
  }).map((stroke) => stroke.id);
}

export function translateInkStrokes(document: NoteInkDocument, ids: ReadonlySet<string>, dx: number, dy: number): NoteInkDocument {
  const state = normalizeNoteInkDocument(document);
  return {
    ...state,
    recognition: undefined,
    strokes: state.strokes.map((stroke) => ids.has(stroke.id) ? {
      ...stroke,
      points: stroke.points.map((point) => ({ ...point, x: clamp(point.x + dx, 0, state.width), y: clamp(point.y + dy, 0, state.height) })),
    } : stroke),
  };
}

export function deleteInkStrokes(document: NoteInkDocument, ids: ReadonlySet<string>): NoteInkDocument {
  const state = normalizeNoteInkDocument(document);
  return { ...state, recognition: undefined, strokes: state.strokes.filter((stroke) => !ids.has(stroke.id)) };
}

function strokeBounds(stroke: NoteInkStroke): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; diagonal: number } {
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX); const height = Math.max(1, maxY - minY);
  return { minX, minY, maxX, maxY, width, height, diagonal: Math.hypot(width, height) };
}

export function recognizeInkShape(stroke: NoteInkStroke): InkShapeRecognition | null {
  if (stroke.points.length < 2) return null;
  const bounds = strokeBounds(stroke);
  const first = stroke.points[0]; const last = stroke.points[stroke.points.length - 1];
  const lineError = Math.max(...stroke.points.map((point) => distToSegment(point, first, last))) / bounds.diagonal;
  if (lineError < 0.055) return { shape: 'line', confidence: Math.max(0.6, 1 - lineError * 5) };
  if (stroke.points.length < 6 || Math.hypot(last.x - first.x, last.y - first.y) > bounds.diagonal * 0.22) return null;
  const cx = (bounds.minX + bounds.maxX) / 2; const cy = (bounds.minY + bounds.maxY) / 2;
  const ellipseErrors = stroke.points.map((point) => Math.abs(Math.hypot((point.x - cx) / (bounds.width / 2), (point.y - cy) / (bounds.height / 2)) - 1));
  const ellipseError = ellipseErrors.reduce((sum, value) => sum + value, 0) / ellipseErrors.length;
  const perimeterErrors = stroke.points.map((point) => Math.min(Math.abs(point.x - bounds.minX), Math.abs(point.x - bounds.maxX), Math.abs(point.y - bounds.minY), Math.abs(point.y - bounds.maxY)) / Math.max(1, Math.min(bounds.width, bounds.height)));
  const rectError = perimeterErrors.reduce((sum, value) => sum + value, 0) / perimeterErrors.length;
  if (rectError < ellipseError * 0.8 && rectError < 0.11) return { shape: 'rect', confidence: Math.max(0.6, 1 - rectError * 3) };
  if (ellipseError < 0.23) return { shape: 'ellipse', confidence: Math.max(0.6, 1 - ellipseError) };
  return null;
}

export function convertInkStrokeToShape(document: NoteInkDocument, strokeId: string): NoteInkDocument {
  const state = normalizeNoteInkDocument(document);
  return {
    ...state,
    recognition: undefined,
    strokes: state.strokes.map((stroke) => {
      if (stroke.id !== strokeId || (stroke.tool !== 'pen' && stroke.tool !== 'highlighter')) return stroke;
      const result = recognizeInkShape(stroke);
      if (!result) return stroke;
      const bounds = strokeBounds(stroke);
      if (result.shape === 'line') return { ...stroke, tool: 'line', points: [stroke.points[0], stroke.points[stroke.points.length - 1]] };
      return { ...stroke, tool: result.shape, points: [{ ...stroke.points[0], x: bounds.minX, y: bounds.minY }, { ...stroke.points[stroke.points.length - 1], x: bounds.maxX, y: bounds.maxY }] };
    }),
  };
}

function lineVector(stroke: NoteInkStroke): { dx: number; dy: number; length: number; midX: number; midY: number } | null {
  if (stroke.points.length < 2) return null;
  const first = stroke.points[0]; const last = stroke.points[stroke.points.length - 1];
  const dx = last.x - first.x; const dy = last.y - first.y; const length = Math.hypot(dx, dy);
  return length > 8 ? { dx, dy, length, midX: (first.x + last.x) / 2, midY: (first.y + last.y) / 2 } : null;
}

export function recognizeSimpleMathInk(strokes: readonly NoteInkStroke[]): InkMathRecognition | null {
  const lines = strokes.map(lineVector).filter((value): value is NonNullable<ReturnType<typeof lineVector>> => Boolean(value));
  if (lines.length === 1) {
    const [line] = lines; const horizontal = Math.abs(line.dy) / line.length < 0.18;
    return horizontal ? { text: '-', latex: '-', confidence: 0.94 } : null;
  }
  if (lines.length !== 2) return null;
  const [a, b] = lines;
  const dot = Math.abs((a.dx * b.dx + a.dy * b.dy) / (a.length * b.length));
  const proximity = Math.hypot(a.midX - b.midX, a.midY - b.midY) / Math.max(a.length, b.length);
  const aHorizontal = Math.abs(a.dy) / a.length < 0.2; const bHorizontal = Math.abs(b.dy) / b.length < 0.2;
  if (aHorizontal && bHorizontal && proximity < 0.65) return { text: '=', latex: '=', confidence: 0.9 };
  if (dot < 0.3 && proximity < 0.35) return { text: '+', latex: '+', confidence: 0.9 };
  if (dot < 0.3 && proximity < 0.5) return { text: '×', latex: '\\times', confidence: 0.82 };
  return null;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function averageStrokeWidth(stroke: NoteInkStroke): number {
  if (!stroke.points.length) return stroke.width;
  const pressure = stroke.points.reduce((sum, point) => sum + point.pressure, 0) / stroke.points.length;
  const tilt = stroke.points.reduce((sum, point) => sum + Math.hypot(point.tiltX, point.tiltY), 0) / stroke.points.length;
  return round(clamp(stroke.width * (0.65 + pressure * 0.7 + Math.min(tilt, 90) / 900), 0.5, 64));
}

export function renderNoteInkSvg(document: NoteInkDocument, selectedIds: ReadonlySet<string> = new Set()): string {
  const state = normalizeNoteInkDocument(document);
  const parts = state.strokes.map((stroke) => {
    const color = xmlEscape(stroke.color); const width = averageStrokeWidth(stroke); const opacity = round(stroke.opacity);
    const selection = selectedIds.has(stroke.id) ? ' data-selected="true" stroke-dasharray="6 4"' : '';
    if ((stroke.tool === 'pen' || stroke.tool === 'highlighter') && stroke.points.length >= 1) {
      const d = stroke.points.map((point, index) => `${index ? 'L' : 'M'} ${round(point.x)} ${round(point.y)}`).join(' ');
      return `<path data-ink-id="${xmlEscape(stroke.id)}"${selection} d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (stroke.points.length < 2) return '';
    const a = stroke.points[0]; const b = stroke.points[stroke.points.length - 1];
    if (stroke.tool === 'line') return `<line data-ink-id="${xmlEscape(stroke.id)}"${selection} x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="round"/>`;
    const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y); const w = Math.abs(b.x - a.x); const h = Math.abs(b.y - a.y);
    if (stroke.tool === 'rect') return `<rect data-ink-id="${xmlEscape(stroke.id)}"${selection} x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="4" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}"/>`;
    return `<ellipse data-ink-id="${xmlEscape(stroke.id)}"${selection} cx="${round(x + w / 2)}" cy="${round(y + h / 2)}" rx="${round(w / 2)}" ry="${round(h / 2)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" data-vgt-ink-version="1" viewBox="0 0 ${state.width} ${state.height}" width="${state.width}" height="${state.height}">${parts}</svg>`;
}

export function noteInkSearchText(document: NoteInkDocument | undefined): string {
  return document?.recognition?.text.trim().slice(0, NOTE_INK_MAX_RECOGNIZED_TEXT) ?? '';
}

export async function recognizeNoteInkTextLocally(document: NoteInkDocument, language = 'en'): Promise<NoteInkDocument> {
  const state = normalizeNoteInkDocument(document);
  const nav = typeof navigator === 'undefined' ? null : navigator as unknown as NavigatorWithHandwriting;
  const globals = globalThis as unknown as GlobalWithHandwritingStroke;
  if (!nav?.createHandwritingRecognizer || !globals.HandwritingStroke) throw new Error('Local platform handwriting recognition is not available in this environment.');
  const safeLanguage = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language) ? language : 'en';
  const recognizer = await nav.createHandwritingRecognizer({ languages: [safeLanguage] });
  try {
    const pointer = state.strokes.find((stroke) => stroke.inputType)?.inputType ?? 'mouse';
    const drawing = recognizer.startDrawing({ recognitionType: 'text', inputType: pointer === 'pen' ? 'stylus' : pointer, alternatives: 2 });
    for (const stroke of state.strokes.filter((item) => item.tool === 'pen' || item.tool === 'highlighter')) {
      const webStroke = new globals.HandwritingStroke();
      for (const point of stroke.points) webStroke.addPoint({ x: point.x, y: point.y, t: point.t });
      drawing.addStroke(webStroke);
    }
    const predictions = await drawing.getPrediction();
    const text = predictions[0]?.text?.normalize('NFKC').trim().slice(0, NOTE_INK_MAX_RECOGNIZED_TEXT) ?? '';
    if (!text) throw new Error('The local handwriting recognizer returned no text.');
    return { ...state, recognition: { text, engine: 'web-handwriting-api', language: safeLanguage, updatedAt: Date.now() } };
  } finally {
    recognizer.finish();
  }
}
