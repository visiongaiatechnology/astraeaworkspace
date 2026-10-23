import { secureRandomId } from '../../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME
// Deterministic, bounded multi-object manipulation engine for Astraea Whiteboard.

import type { WhiteboardConnectorAnchor, WhiteboardGuide } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import {
  clampCoordinate,
  clampDimension,
  WHITEBOARD_MAX_DIMENSION,
} from '../viewport/whiteboardViewportEngine';
import { computeWhiteboardSmartSnap, type WhiteboardSnapGuideLine } from './whiteboardSnapGuideEngine';

export type WhiteboardAlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type WhiteboardDistributeMode = 'horizontal' | 'vertical';

export interface WhiteboardSnapOptions {
  gridSize: number;
  snapToGrid: boolean;
  snapToGuides: boolean;
  guides: WhiteboardGuide[];
  threshold?: number;
}

export interface WhiteboardStyleSnapshot {
  color?: WhiteboardItem['color'];
  shape?: WhiteboardItem['shape'];
  ink?: Pick<NonNullable<WhiteboardItem['ink']>, 'color' | 'width' | 'opacity' | 'arrowStart' | 'arrowEnd'>;
}

export interface WhiteboardConnectorPoint {
  x: number;
  y: number;
  anchor: Exclude<WhiteboardConnectorAnchor, 'auto'>;
}

const CONNECTOR_ANCHORS: WhiteboardConnectorAnchor[] = ['auto', 'top', 'right', 'bottom', 'left'];
const MOVE_AXES = ['free', 'horizontal', 'vertical'] as const;
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clampZ = (value: number) => Math.max(-1_000_000, Math.min(1_000_000, Math.trunc(finite(value, 0))));
const boundedId = (value: unknown, max = 256) => typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined;

export const normalizeRotation = (value: number) => {
  let normalized = finite(value, 0) % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return Math.round(normalized * 100) / 100;
};

const makeId = (prefix: string) => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? `${prefix}-${crypto.randomUUID()}`
  : secureRandomId(prefix);

export function sanitizeWhiteboardObjectLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = value.trim().slice(0, 2048);
  if (/^vgt:\/\/workspace\/[a-z0-9/_?=&.%:-]+$/i.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.toString();
  } catch {
    // Invalid URLs are rejected fail-closed.
  }
  return undefined;
}

export function normalizeWhiteboardManipulationMetadata(item: WhiteboardItem): WhiteboardItem {
  const rawConstraints = item.constraints;
  const moveAxis = MOVE_AXES.includes(rawConstraints?.moveAxis as (typeof MOVE_AXES)[number])
    ? rawConstraints?.moveAxis
    : 'free';
  const constraints = rawConstraints ? {
    moveAxis,
    lockAspectRatio: rawConstraints.lockAspectRatio === true,
    minWidth: rawConstraints.minWidth === undefined ? undefined : clampDimension(rawConstraints.minWidth),
    minHeight: rawConstraints.minHeight === undefined ? undefined : clampDimension(rawConstraints.minHeight),
    maxWidth: rawConstraints.maxWidth === undefined ? undefined : clampDimension(rawConstraints.maxWidth),
    maxHeight: rawConstraints.maxHeight === undefined ? undefined : clampDimension(rawConstraints.maxHeight),
    keepInsideFrameId: boundedId(rawConstraints.keepInsideFrameId),
  } : undefined;
  const fromAnchor = CONNECTOR_ANCHORS.includes(item.fromAnchor as WhiteboardConnectorAnchor) ? item.fromAnchor : undefined;
  const toAnchor = CONNECTOR_ANCHORS.includes(item.toAnchor as WhiteboardConnectorAnchor) ? item.toAnchor : undefined;
  return {
    ...item,
    rotation: item.rotation === undefined ? undefined : normalizeRotation(item.rotation),
    locked: item.locked === true || undefined,
    hidden: item.hidden === true || undefined,
    groupId: boundedId(item.groupId),
    zIndex: item.zIndex === undefined ? undefined : clampZ(item.zIndex),
    linkUri: sanitizeWhiteboardObjectLink(item.linkUri),
    constraints,
    fromAnchor,
    toAnchor,
  };
}

export function snapWhiteboardPoint(
  x: number,
  y: number,
  options: WhiteboardSnapOptions,
): { x: number; y: number } {
  let snappedX = clampCoordinate(x);
  let snappedY = clampCoordinate(y);
  const threshold = Math.max(1, Math.min(40, finite(options.threshold ?? 8, 8)));
  const grid = Math.max(8, Math.min(256, finite(options.gridSize, 24)));
  if (options.snapToGrid) {
    snappedX = Math.round(snappedX / grid) * grid;
    snappedY = Math.round(snappedY / grid) * grid;
  }
  if (options.snapToGuides) {
    for (const guide of options.guides.slice(0, 256)) {
      if (guide.axis === 'x' && Math.abs(guide.position - snappedX) <= threshold) snappedX = guide.position;
      if (guide.axis === 'y' && Math.abs(guide.position - snappedY) <= threshold) snappedY = guide.position;
    }
  }
  return { x: clampCoordinate(snappedX), y: clampCoordinate(snappedY) };
}

export function expandSelectionForGroup(items: readonly WhiteboardItem[], ids: readonly string[]): string[] {
  const selected = new Set(ids);
  const groups = new Set(
    items.filter((item) => selected.has(item.id) && item.groupId).map((item) => item.groupId!),
  );
  if (groups.size > 0) {
    for (const item of items) if (item.groupId && groups.has(item.groupId)) selected.add(item.id);
  }
  return [...selected];
}

export function enforceWhiteboardDiagramConstraints(
  items: WhiteboardItem[],
  ids?: ReadonlySet<string>,
): WhiteboardItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items.map((item) => {
    if (ids && !ids.has(item.id)) return item;
    const frameId = item.constraints?.keepInsideFrameId;
    if (!frameId || item.type === 'frame' || item.type === 'connector') return item;
    const frame = byId.get(frameId);
    if (!frame || frame.type !== 'frame' || frame.id === item.id) return item;
    const width = Math.min(item.width, Math.max(1, frame.width));
    const height = Math.min(item.height, Math.max(1, frame.height));
    const maxX = frame.x + frame.width - width;
    const maxY = frame.y + frame.height - height;
    return {
      ...item,
      width: clampDimension(width),
      height: clampDimension(height),
      x: clampCoordinate(Math.max(frame.x, Math.min(maxX, item.x))),
      y: clampCoordinate(Math.max(frame.y, Math.min(maxY, item.y))),
    };
  });
}

export function moveWhiteboardSelection(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  primaryId: string,
  targetX: number,
  targetY: number,
  snap: WhiteboardSnapOptions,
): WhiteboardItem[] {
  const primary = items.find((item) => item.id === primaryId);
  if (!primary || primary.locked) return items;
  const snapped = snapWhiteboardPoint(targetX, targetY, snap);
  const dx = snapped.x - primary.x;
  const dy = snapped.y - primary.y;
  if (dx === 0 && dy === 0) return items;
  const moved = items.map((item) => {
    if (!ids.has(item.id) || item.locked || item.type === 'connector') return item;
    const axis = item.constraints?.moveAxis ?? 'free';
    return {
      ...item,
      x: clampCoordinate(item.x + (axis === 'vertical' ? 0 : dx)),
      y: clampCoordinate(item.y + (axis === 'horizontal' ? 0 : dy)),
    };
  });
  return enforceWhiteboardDiagramConstraints(moved, ids);
}

export interface WhiteboardDragSnapInput {
  readonly items: WhiteboardItem[];
  readonly ids: ReadonlySet<string>;
  readonly primaryId: string;
  readonly targetX: number;
  readonly targetY: number;
  readonly snap: WhiteboardSnapOptions;
  /** Enables object-to-object alignment/spacing feedback (default true). */
  readonly smartGuides?: boolean;
  readonly smartThreshold?: number;
}

export interface WhiteboardDragSnapResult {
  readonly items: WhiteboardItem[];
  /** Guide lines to draw for this frame; empty when nothing aligned. */
  readonly guides: WhiteboardSnapGuideLine[];
  /** Final (already snapped) position of the dragged primary object. */
  readonly x: number;
  readonly y: number;
}

/**
 * The one drag rule of the Whiteboard: grid/manual-guide snapping first, then object-to-object smart
 * alignment and equal spacing on top of it, then the canonical move + constraint pass. Both the
 * pointer drag and the keyboard move go through here, so a shape can never be snapped by two rules.
 */
export function applyWhiteboardDragSnap(input: WhiteboardDragSnapInput): WhiteboardDragSnapResult {
  const primary = input.items.find((item) => item.id === input.primaryId);
  if (!primary || primary.locked) return { items: input.items, guides: [], x: primary?.x ?? input.targetX, y: primary?.y ?? input.targetY };
  const base = snapWhiteboardPoint(input.targetX, input.targetY, input.snap);
  if (input.smartGuides === false) {
    return {
      items: moveWhiteboardSelection(input.items, input.ids, input.primaryId, base.x, base.y, {
        gridSize: input.snap.gridSize, snapToGrid: false, snapToGuides: false, guides: [],
      }),
      guides: [],
      x: base.x,
      y: base.y,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const item of input.items) {
    if (!input.ids.has(item.id) || item.type === 'connector') continue;
    if (![item.x, item.y, item.width, item.height].every(Number.isFinite)) continue;
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }
  if (!Number.isFinite(minX)) {
    return {
      items: moveWhiteboardSelection(input.items, input.ids, input.primaryId, base.x, base.y, {
        gridSize: input.snap.gridSize, snapToGrid: false, snapToGuides: false, guides: [],
      }),
      guides: [],
      x: base.x,
      y: base.y,
    };
  }

  const offsetX = base.x - primary.x;
  const offsetY = base.y - primary.y;
  const smart = computeWhiteboardSmartSnap({
    movingBounds: { minX: minX + offsetX, minY: minY + offsetY, maxX: maxX + offsetX, maxY: maxY + offsetY },
    candidates: input.items.filter((item) => !input.ids.has(item.id)),
    excludedIds: [...input.ids],
    threshold: input.smartThreshold,
  });
  const targetX = base.x + (smart.x - (minX + offsetX));
  const targetY = base.y + (smart.y - (minY + offsetY));
  return {
    items: moveWhiteboardSelection(input.items, input.ids, input.primaryId, targetX, targetY, {
      gridSize: input.snap.gridSize, snapToGrid: false, snapToGuides: false, guides: [],
    }),
    guides: smart.lines,
    x: targetX,
    y: targetY,
  };
}

export function resizeWhiteboardItem(item: WhiteboardItem, width: number, height: number): WhiteboardItem {
  if (item.locked || item.type === 'connector') return item;
  const constraints = item.constraints;
  const minWidth = Math.max(1, finite(constraints?.minWidth ?? 20, 20));
  const minHeight = Math.max(1, finite(constraints?.minHeight ?? 20, 20));
  const maxWidth = Math.min(
    WHITEBOARD_MAX_DIMENSION,
    Math.max(minWidth, finite(constraints?.maxWidth ?? WHITEBOARD_MAX_DIMENSION, WHITEBOARD_MAX_DIMENSION)),
  );
  const maxHeight = Math.min(
    WHITEBOARD_MAX_DIMENSION,
    Math.max(minHeight, finite(constraints?.maxHeight ?? WHITEBOARD_MAX_DIMENSION, WHITEBOARD_MAX_DIMENSION)),
  );
  let nextWidth = Math.max(minWidth, Math.min(maxWidth, finite(width, item.width)));
  let nextHeight = Math.max(minHeight, Math.min(maxHeight, finite(height, item.height)));
  if (constraints?.lockAspectRatio && item.width > 0 && item.height > 0) {
    const aspect = item.width / item.height;
    if (Math.abs(nextWidth - item.width) >= Math.abs(nextHeight - item.height)) nextHeight = nextWidth / aspect;
    else nextWidth = nextHeight * aspect;
    nextWidth = Math.max(minWidth, Math.min(maxWidth, nextWidth));
    nextHeight = Math.max(minHeight, Math.min(maxHeight, nextHeight));
  }
  return { ...item, width: clampDimension(nextWidth), height: clampDimension(nextHeight) };
}

export function resizeWhiteboardSelection(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  factor: number,
): WhiteboardItem[] {
  const safeFactor = Math.max(0.05, Math.min(20, finite(factor, 1)));
  const resized = items.map((item) => ids.has(item.id)
    ? resizeWhiteboardItem(item, item.width * safeFactor, item.height * safeFactor)
    : item);
  return enforceWhiteboardDiagramConstraints(resized, ids);
}

export function rotateWhiteboardSelection(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  delta: number,
): WhiteboardItem[] {
  return items.map((item) => ids.has(item.id) && !item.locked && item.type !== 'connector'
    ? { ...item, rotation: normalizeRotation((item.rotation ?? 0) + delta) }
    : item);
}

export function groupWhiteboardSelection(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  groupId = makeId('wb-group'),
): WhiteboardItem[] {
  const eligible = items.filter((item) => ids.has(item.id) && !item.locked && item.type !== 'connector');
  if (eligible.length < 2) return items;
  const eligibleIds = new Set(eligible.map((item) => item.id));
  return items.map((item) => eligibleIds.has(item.id) ? { ...item, groupId } : item);
}

export function ungroupWhiteboardSelection(items: WhiteboardItem[], ids: ReadonlySet<string>): WhiteboardItem[] {
  const groups = new Set(
    items.filter((item) => ids.has(item.id) && item.groupId && !item.locked).map((item) => item.groupId!),
  );
  return items.map((item) => item.groupId && groups.has(item.groupId) && !item.locked
    ? { ...item, groupId: undefined }
    : item);
}

export function setWhiteboardSelectionLocked(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  locked: boolean,
): WhiteboardItem[] {
  return items.map((item) => ids.has(item.id) ? { ...item, locked: locked || undefined } : item);
}

export function setWhiteboardSelectionHidden(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  hidden: boolean,
): WhiteboardItem[] {
  return items.map((item) => ids.has(item.id) ? { ...item, hidden: hidden || undefined } : item);
}

export function showAllWhiteboardObjects(items: WhiteboardItem[]): WhiteboardItem[] {
  return items.map((item) => item.hidden ? { ...item, hidden: undefined } : item);
}

function selectionBounds(items: readonly WhiteboardItem[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function alignWhiteboardSelection(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  mode: WhiteboardAlignMode,
): WhiteboardItem[] {
  const selected = items.filter((item) => ids.has(item.id) && !item.locked && item.type !== 'connector');
  if (selected.length < 2) return items;
  const bounds = selectionBounds(selected);
  const aligned = items.map((item) => {
    if (!ids.has(item.id) || item.locked || item.type === 'connector') return item;
    let x = item.x;
    let y = item.y;
    if (mode === 'left') x = bounds.minX;
    if (mode === 'center') x = bounds.cx - item.width / 2;
    if (mode === 'right') x = bounds.maxX - item.width;
    if (mode === 'top') y = bounds.minY;
    if (mode === 'middle') y = bounds.cy - item.height / 2;
    if (mode === 'bottom') y = bounds.maxY - item.height;
    return { ...item, x: clampCoordinate(x), y: clampCoordinate(y) };
  });
  return enforceWhiteboardDiagramConstraints(aligned, ids);
}

export function distributeWhiteboardSelection(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  mode: WhiteboardDistributeMode,
): WhiteboardItem[] {
  const selected = items
    .filter((item) => ids.has(item.id) && !item.locked && item.type !== 'connector')
    .sort((a, b) => mode === 'horizontal' ? a.x - b.x : a.y - b.y);
  if (selected.length < 3) return items;
  const first = selected[0];
  const last = selected[selected.length - 1];
  const totalSize = selected.reduce((sum, item) => sum + (mode === 'horizontal' ? item.width : item.height), 0);
  const span = mode === 'horizontal'
    ? (last.x + last.width) - first.x
    : (last.y + last.height) - first.y;
  const gap = (span - totalSize) / (selected.length - 1);
  const targets = new Map<string, number>();
  let cursor = mode === 'horizontal' ? first.x : first.y;
  for (const item of selected) {
    targets.set(item.id, cursor);
    cursor += (mode === 'horizontal' ? item.width : item.height) + gap;
  }
  const distributed = items.map((item) => {
    const target = targets.get(item.id);
    if (target === undefined) return item;
    return mode === 'horizontal'
      ? { ...item, x: clampCoordinate(target) }
      : { ...item, y: clampCoordinate(target) };
  });
  return enforceWhiteboardDiagramConstraints(distributed, ids);
}

export function layerWhiteboardSelection(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  direction: 'front' | 'back',
): WhiteboardItem[] {
  const selected = items
    .filter((item) => ids.has(item.id) && !item.locked && item.type !== 'connector')
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.id.localeCompare(b.id));
  if (selected.length === 0) return items;
  const current = items.map((item) => item.zIndex ?? 0);
  const firstZ = direction === 'front'
    ? Math.min(1_000_000 - selected.length, Math.max(0, ...current) + 1)
    : Math.max(-1_000_000, Math.min(0, ...current) - selected.length);
  const target = new Map(selected.map((item, index) => [item.id, clampZ(firstZ + index)]));
  return items.map((item) => target.has(item.id) ? { ...item, zIndex: target.get(item.id) } : item);
}

function cloneWhiteboardItem(item: WhiteboardItem): WhiteboardItem {
  return {
    ...item,
    ink: item.ink ? { ...item.ink, points: item.ink.points.map((point) => ({ ...point })) } : undefined,
    shape: item.shape ? { ...item.shape } : undefined,
    icon: item.icon ? { ...item.icon } : undefined,
    table: item.table ? { columns: [...item.table.columns], rows: item.table.rows.map((row) => [...row]) } : undefined,
    card: item.card ? { ...item.card, tags: item.card.tags ? [...item.card.tags] : undefined } : undefined,
    document: item.document ? { ...item.document } : undefined,
    chart: item.chart ? { ...item.chart, labels: [...item.chart.labels], values: [...item.chart.values] } : undefined,
    code: item.code ? { ...item.code } : undefined,
    media: item.media ? { ...item.media } : undefined,
    reaction: item.reaction ? { ...item.reaction } : undefined,
    constraints: item.constraints ? { ...item.constraints } : undefined,
  };
}

export function duplicateWhiteboardSelection(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  offset = 32,
): { items: WhiteboardItem[]; newIds: string[] } {
  const source = items.filter((item) => ids.has(item.id));
  if (source.length === 0) return { items, newIds: [] };
  const remap = new Map(source.map((item) => [item.id, makeId(`copy-${item.type}`)]));
  const groupRemap = new Map<string, string>();
  const clones = source.map((item) => {
    if (item.groupId && !groupRemap.has(item.groupId)) groupRemap.set(item.groupId, makeId('wb-group'));
    const clone = cloneWhiteboardItem(item);
    clone.id = remap.get(item.id)!;
    clone.x = clampCoordinate(item.x + offset);
    clone.y = clampCoordinate(item.y + offset);
    clone.groupId = item.groupId ? groupRemap.get(item.groupId) : undefined;
    clone.fromId = item.fromId ? (remap.get(item.fromId) ?? item.fromId) : undefined;
    clone.toId = item.toId ? (remap.get(item.toId) ?? item.toId) : undefined;
    if (clone.constraints?.keepInsideFrameId) {
      clone.constraints.keepInsideFrameId = remap.get(clone.constraints.keepInsideFrameId)
        ?? clone.constraints.keepInsideFrameId;
    }
    return clone;
  });
  return {
    items: enforceWhiteboardDiagramConstraints([...items, ...clones], new Set(clones.map((item) => item.id))),
    newIds: clones.map((item) => item.id),
  };
}

export function captureWhiteboardStyle(item: WhiteboardItem): WhiteboardStyleSnapshot {
  return {
    color: item.color,
    shape: item.shape ? { ...item.shape } : undefined,
    ink: item.ink ? {
      color: item.ink.color,
      width: item.ink.width,
      opacity: item.ink.opacity,
      arrowStart: item.ink.arrowStart,
      arrowEnd: item.ink.arrowEnd,
    } : undefined,
  };
}

export function applyWhiteboardStyle(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  style: WhiteboardStyleSnapshot,
): WhiteboardItem[] {
  return items.map((item) => {
    if (!ids.has(item.id) || item.locked) return item;
    const next = { ...item };
    if (style.color && item.type === 'sticky') next.color = style.color;
    if (style.shape && item.type === 'shape') next.shape = { ...style.shape };
    if (style.ink && item.type === 'ink' && item.ink) next.ink = { ...item.ink, ...style.ink };
    return next;
  });
}

export function setWhiteboardObjectLink(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  link: string | undefined,
): WhiteboardItem[] {
  const safe = sanitizeWhiteboardObjectLink(link);
  return items.map((item) => ids.has(item.id) && !item.locked ? { ...item, linkUri: safe } : item);
}

export function setWhiteboardConstraints(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  patch: Partial<NonNullable<WhiteboardItem['constraints']>>,
): WhiteboardItem[] {
  const patched = items.map((item) => ids.has(item.id) && !item.locked
    ? normalizeWhiteboardManipulationMetadata({ ...item, constraints: { ...item.constraints, ...patch } })
    : item);
  return enforceWhiteboardDiagramConstraints(patched, ids);
}

export function setWhiteboardConnectorAnchors(
  items: WhiteboardItem[],
  ids: ReadonlySet<string>,
  patch: { fromAnchor?: WhiteboardConnectorAnchor; toAnchor?: WhiteboardConnectorAnchor },
): WhiteboardItem[] {
  return items.map((item) => {
    if (!ids.has(item.id) || item.type !== 'connector' || item.locked) return item;
    return normalizeWhiteboardManipulationMetadata({
      ...item,
      fromAnchor: patch.fromAnchor ?? item.fromAnchor ?? 'auto',
      toAnchor: patch.toAnchor ?? item.toAnchor ?? 'auto',
    });
  });
}

function chooseAutoAnchor(item: WhiteboardItem, toward: { x: number; y: number }): Exclude<WhiteboardConnectorAnchor, 'auto'> {
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  const dx = toward.x - centerX;
  const dy = toward.y - centerY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

export function resolveWhiteboardConnectorPoint(
  item: WhiteboardItem,
  anchor: WhiteboardConnectorAnchor | undefined,
  toward: { x: number; y: number },
): WhiteboardConnectorPoint {
  const resolved = !anchor || anchor === 'auto' ? chooseAutoAnchor(item, toward) : anchor;
  if (resolved === 'left') return { x: item.x, y: item.y + item.height / 2, anchor: resolved };
  if (resolved === 'right') return { x: item.x + item.width, y: item.y + item.height / 2, anchor: resolved };
  if (resolved === 'top') return { x: item.x + item.width / 2, y: item.y, anchor: resolved };
  return { x: item.x + item.width / 2, y: item.y + item.height, anchor: 'bottom' };
}

export function resolveWhiteboardConnectorEndpoints(
  connector: WhiteboardItem,
  items: readonly WhiteboardItem[],
): { from: WhiteboardConnectorPoint; to: WhiteboardConnectorPoint } | null {
  if (connector.type !== 'connector') return null;
  const fromItem = items.find((item) => item.id === connector.fromId);
  const toItem = items.find((item) => item.id === connector.toId);
  if (!fromItem || !toItem || fromItem.hidden || toItem.hidden) return null;
  const fromCenter = { x: fromItem.x + fromItem.width / 2, y: fromItem.y + fromItem.height / 2 };
  const toCenter = { x: toItem.x + toItem.width / 2, y: toItem.y + toItem.height / 2 };
  return {
    from: resolveWhiteboardConnectorPoint(fromItem, connector.fromAnchor, toCenter),
    to: resolveWhiteboardConnectorPoint(toItem, connector.toAnchor, fromCenter),
  };
}
