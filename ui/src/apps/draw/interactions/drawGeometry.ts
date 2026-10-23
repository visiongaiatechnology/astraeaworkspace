// STATUS: PLATIN — pure rotation-aware Draw geometry primitives (no React, no model mutation).
import type { DrawBounds, DrawObject, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, assertPoint, finite } from '../model/drawDocumentValidation';

/** The eight resize grips required by Draw package 03, in clockwise order. */
export const DRAW_RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type DrawResizeHandle = (typeof DRAW_RESIZE_HANDLES)[number];

const HANDLE_SET: ReadonlySet<string> = new Set(DRAW_RESIZE_HANDLES);

export function isDrawResizeHandle(value: unknown): value is DrawResizeHandle {
  return typeof value === 'string' && HANDLE_SET.has(value);
}

export function assertDrawResizeHandle(value: unknown): asserts value is DrawResizeHandle {
  if (!isDrawResizeHandle(value)) throw new DrawModelError('resize-handle-invalid');
}

/** Fraction of the object box that the handle is anchored to, in object-local space. */
export function handleAnchor(handle: DrawResizeHandle): DrawPoint {
  assertDrawResizeHandle(handle);
  const x = handle === 'nw' || handle === 'w' || handle === 'sw' ? 0 : handle === 'n' || handle === 's' ? 0.5 : 1;
  const y = handle === 'nw' || handle === 'n' || handle === 'ne' ? 0 : handle === 'e' || handle === 'w' ? 0.5 : 1;
  return { x, y };
}

/** The grip diagonally opposite `handle`: the point that must not move while resizing. */
export function oppositeHandle(handle: DrawResizeHandle): DrawResizeHandle {
  assertDrawResizeHandle(handle);
  const flipped = DRAW_RESIZE_HANDLES[(DRAW_RESIZE_HANDLES.indexOf(handle) + 4) % DRAW_RESIZE_HANDLES.length];
  return flipped;
}

export function toRadians(degrees: number): number {
  return (finite(degrees, 'angle-invalid') * Math.PI) / 180;
}

export function rotatePointAround(origin: DrawPoint, center: DrawPoint, degrees: number): DrawPoint {
  assertPoint(origin, 'point-invalid');
  assertPoint(center, 'point-invalid');
  const radians = toRadians(degrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = origin.x - center.x;
  const dy = origin.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** Rotates a world-space delta into the object's unrotated local frame (inverse of `rotation`). */
export function worldDeltaToLocalDelta(vector: DrawPoint, rotation: number): DrawPoint {
  assertPoint(vector, 'point-invalid');
  const radians = toRadians(rotation);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: vector.x * cos + vector.y * sin, y: -vector.x * sin + vector.y * cos };
}

export function drawObjectCenter(object: Pick<DrawObject, 'x' | 'y' | 'width' | 'height'>): DrawPoint {
  assertBox(object);
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

function assertBox(object: Pick<DrawObject, 'x' | 'y' | 'width' | 'height'>): void {
  finite(object.x, 'object-box-invalid');
  finite(object.y, 'object-box-invalid');
  finite(object.width, 'object-box-invalid');
  finite(object.height, 'object-box-invalid');
  if (object.width < 0 || object.height < 0) throw new DrawModelError('object-box-invalid');
}

/** World-space position of a local coordinate inside the object box, honouring rotation. */
export function localToWorld(
  object: Pick<DrawObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  local: DrawPoint,
): DrawPoint {
  assertPoint(local, 'point-invalid');
  const center = drawObjectCenter(object);
  const rotated = rotatePointAround(
    { x: object.x + local.x - center.x, y: object.y + local.y - center.y },
    { x: 0, y: 0 },
    object.rotation,
  );
  return { x: center.x + rotated.x, y: center.y + rotated.y };
}

/** World-space position of a resize grip or the rotation grip. */
export function handleWorldPoint(
  object: Pick<DrawObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  handle: DrawResizeHandle,
): DrawPoint {
  const anchor = handleAnchor(handle);
  return localToWorld(object, { x: object.width * anchor.x, y: object.height * anchor.y });
}

/** The four rotated corners of the object box, clockwise from the unrotated top-left. */
export function drawObjectCorners(
  object: Pick<DrawObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
): [DrawPoint, DrawPoint, DrawPoint, DrawPoint] {
  return [
    localToWorld(object, { x: 0, y: 0 }),
    localToWorld(object, { x: object.width, y: 0 }),
    localToWorld(object, { x: object.width, y: object.height }),
    localToWorld(object, { x: 0, y: object.height }),
  ];
}

export function normalizedBounds(a: DrawPoint, b: DrawPoint): DrawBounds {
  assertPoint(a, 'bounds-point-invalid');
  assertPoint(b, 'bounds-point-invalid');
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function normalizeDrawBounds(bounds: DrawBounds): DrawBounds {
  if (typeof bounds !== 'object' || bounds === null) throw new DrawModelError('bounds-invalid');
  return normalizedBounds(
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  );
}

export function boundsOfPoints(points: readonly DrawPoint[]): DrawBounds {
  if (!Array.isArray(points) || points.length === 0) throw new DrawModelError('bounds-points-empty');
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    assertPoint(point, 'bounds-point-invalid');
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Axis-aligned world bounds that fully contain the possibly rotated object. */
export function drawObjectWorldBounds(
  object: Pick<DrawObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
): DrawBounds {
  assertBox(object);
  if (object.rotation === 0) return { x: object.x, y: object.y, width: object.width, height: object.height };
  return boundsOfPoints(drawObjectCorners(object));
}

export function expandDrawBounds(bounds: DrawBounds, amount: number): DrawBounds {
  finite(amount, 'bounds-expansion-invalid');
  if (amount < 0) throw new DrawModelError('bounds-expansion-invalid');
  return { x: bounds.x - amount, y: bounds.y - amount, width: bounds.width + amount * 2, height: bounds.height + amount * 2 };
}

export function pointInDrawBounds(point: DrawPoint, bounds: DrawBounds, tolerance = 0): boolean {
  assertPoint(point, 'point-invalid');
  return point.x >= bounds.x - tolerance
    && point.x <= bounds.x + bounds.width + tolerance
    && point.y >= bounds.y - tolerance
    && point.y <= bounds.y + bounds.height + tolerance;
}

export function drawBoundsIntersect(a: DrawBounds, b: DrawBounds): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

export function drawBoundsContain(outer: DrawBounds, inner: DrawBounds): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

export function pointInDrawPolygon(point: DrawPoint, polygon: readonly DrawPoint[]): boolean {
  assertPoint(point, 'point-invalid');
  if (!Array.isArray(polygon) || polygon.length < 3) throw new DrawModelError('polygon-invalid');
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const before = polygon[previous];
    if (!current || !before) throw new DrawModelError('polygon-invalid');
    const crosses = (current.y > point.y) !== (before.y > point.y)
      && point.x < ((before.x - current.x) * (point.y - current.y)) / (before.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Rotation-aware containment test used by pointer hit-testing. `tolerance` grows the box outward
 * so that thin shapes and 1px strokes stay clickable.
 */
export function pointInDrawObject(
  object: Pick<DrawObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  point: DrawPoint,
  tolerance = 0,
): boolean {
  assertPoint(point, 'point-invalid');
  assertBox(object);
  if (tolerance < 0) throw new DrawModelError('tolerance-invalid');
  const center = drawObjectCenter(object);
  const local = rotatePointAround(point, center, -object.rotation);
  const minX = object.x - tolerance;
  const minY = object.y - tolerance;
  return local.x >= minX
    && local.x <= object.x + object.width + tolerance
    && local.y >= minY
    && local.y <= object.y + object.height + tolerance;
}

export function distanceToSegment(point: DrawPoint, start: DrawPoint, end: DrawPoint): number {
  assertPoint(point, 'point-invalid');
  assertPoint(start, 'point-invalid');
  assertPoint(end, 'point-invalid');
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const raw = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, raw));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function distanceToPolyline(point: DrawPoint, points: readonly DrawPoint[]): number {
  if (!Array.isArray(points) || points.length === 0) throw new DrawModelError('polyline-empty');
  if (points.length === 1) {
    const only = points[0]!;
    return Math.hypot(point.x - only.x, point.y - only.y);
  }
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, distanceToSegment(point, points[index - 1]!, points[index]!));
  }
  return best;
}

/** Collapses negative zero so geometry comparisons and serialization stay stable. */
function collapseZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function roundToStep(value: number, step: number): number {
  finite(value, 'round-value-invalid');
  finite(step, 'round-step-invalid');
  if (step <= 0) throw new DrawModelError('round-step-invalid');
  return collapseZero(Math.round(value / step) * step);
}

/** Normalizes an arbitrary angle into [0, 360). */
export function normalizeDegrees(degrees: number): number {
  finite(degrees, 'angle-invalid');
  const wrapped = degrees % 360;
  return collapseZero(wrapped < 0 ? wrapped + 360 : wrapped);
}

export function snapDegrees(degrees: number, step: number): number {
  if (step <= 0) throw new DrawModelError('round-step-invalid');
  return normalizeDegrees(roundToStep(degrees, step));
}
