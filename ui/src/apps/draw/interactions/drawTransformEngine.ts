// STATUS: PLATIN — pure rotation-aware Draw resize/rotate geometry (objects in, objects out).
import type { DrawObject, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import {
  assertDrawResizeHandle,
  drawObjectCenter,
  handleAnchor,
  handleWorldPoint,
  localToWorld,
  normalizeDegrees,
  oppositeHandle,
  rotatePointAround,
  snapDegrees,
  worldDeltaToLocalDelta,
  type DrawResizeHandle,
} from './drawGeometry';import { DrawModelError, assertDrawObject, finite } from '../model/drawDocumentValidation';

/** Smallest box the resize engine will produce; keeps `assertDrawObject` (width/height >= 0) safe. */
export const MIN_DRAW_OBJECT_SIZE = 1;

export interface DrawResizeOptions {
  /** Hold-SHIFT behaviour from the acceptance scenario: preserve the source aspect ratio. */
  readonly keepAspect?: boolean;
  /** Grow/shrink around the object centre instead of the opposite grip. */
  readonly fromCenter?: boolean;
  readonly minSize?: number;
  /** Grid/guide snapping applied to the dragged grip in world space. */
  readonly snap?: (point: DrawPoint) => DrawPoint;
}

export interface DrawRotateOptions {
  /** Snap step in degrees, e.g. 15 with SHIFT. 0 disables snapping. */
  readonly snapStep?: number;
  /** Rotation origin; defaults to the object centre. */
  readonly center?: DrawPoint;
}

function resolveMinSize(options: DrawResizeOptions | undefined): number {
  const minSize = options?.minSize ?? MIN_DRAW_OBJECT_SIZE;
  if (typeof minSize !== 'number' || !Number.isFinite(minSize) || minSize <= 0 || minSize > 1_000_000) {
    throw new DrawModelError('resize-min-size-invalid');
  }
  return minSize;
}

function assertPointArgument(value: unknown, code: string): asserts value is DrawPoint {
  if (typeof value !== 'object' || value === null) throw new DrawModelError(code);
  finite((value as DrawPoint).x, code);
  finite((value as DrawPoint).y, code);
}

/**
 * Resizes `object` by dragging `handle` to `target` (world coordinates).
 *
 * Derivation (all coordinates are in the object's own unrotated frame `L`, whose origin is the
 * current `x,y` and whose basis is rotated by `object.rotation`):
 *
 *   `c = (w/2, h/2)` is the centre, `f` the L-coordinate of the grip that must not move, and
 *   `span = R⁻¹(target − fixedWorld)`. Because a world displacement rotates into a local
 *   displacement unchanged, `L(target) = span + f`. The new box is therefore the L-space rectangle
 *   spanning `f` and `span + f`; edge grips keep the perpendicular extent, centre-anchored resizes
 *   stay symmetric about `c`.
 *
 * The new world centre is then the world position of the new box's L-space centre, evaluated with
 * the *original* object, so the fixed grip is preserved exactly even at arbitrary rotations.
 */
export function resizeDrawObjectTo(
  object: DrawObject,
  handle: DrawResizeHandle,
  target: DrawPoint,
  options?: DrawResizeOptions,
): DrawObject {
  assertDrawObject(object);
  assertDrawResizeHandle(handle);
  assertPointArgument(target, 'resize-target-invalid');
  const minSize = resolveMinSize(options);
  const fromCenter = options?.fromCenter === true;

  const width = object.width;
  const height = object.height;
  const center = { x: width / 2, y: height / 2 };
  const fixed: DrawPoint = fromCenter
    ? center
    : {
      x: width * handleAnchor(oppositeHandle(handle)).x,
      y: height * handleAnchor(oppositeHandle(handle)).y,
    };
  const fixedWorld = fromCenter ? drawObjectCenter(object) : handleWorldPoint(object, oppositeHandle(handle));

  const grip = options?.snap ? options.snap(target) : target;
  const span = worldDeltaToLocalDelta({ x: grip.x - fixedWorld.x, y: grip.y - fixedWorld.y }, object.rotation);
  const moving = { x: span.x + fixed.x, y: span.y + fixed.y };

  const horizontalOnly = handle === 'e' || handle === 'w';
  const verticalOnly = handle === 'n' || handle === 's';
  const cornerHandle = !horizontalOnly && !verticalOnly;

  let minX = 0;
  let maxX = width;
  let minY = 0;
  let maxY = height;

  if (fromCenter) {
    const halfX = verticalOnly ? width / 2 : Math.abs(moving.x - center.x);
    const halfY = horizontalOnly ? height / 2 : Math.abs(moving.y - center.y);
    minX = center.x - halfX;
    maxX = center.x + halfX;
    minY = center.y - halfY;
    maxY = center.y + halfY;
  } else {
    if (!verticalOnly) {
      minX = Math.min(fixed.x, moving.x);
      maxX = Math.max(fixed.x, moving.x);
    }
    if (!horizontalOnly) {
      minY = Math.min(fixed.y, moving.y);
      maxY = Math.max(fixed.y, moving.y);
    }
  }

  if (options?.keepAspect && cornerHandle) {
    const ratio = height === 0 ? 1 : width / height;
    let nextWidth = maxX - minX;
    let nextHeight = maxY - minY;
    if (nextWidth / Math.max(nextHeight, Number.EPSILON) > ratio) nextWidth = nextHeight * ratio;
    else nextHeight = nextWidth / ratio;
    if (nextWidth < minSize) { nextWidth = minSize; nextHeight = minSize / ratio; }
    if (nextHeight < minSize) { nextHeight = minSize; nextWidth = minSize * ratio; }
    if (fromCenter) {
      minX = center.x - nextWidth / 2;
      maxX = center.x + nextWidth / 2;
      minY = center.y - nextHeight / 2;
      maxY = center.y + nextHeight / 2;
    } else {
      if (fixed.x <= moving.x) { minX = fixed.x; maxX = fixed.x + nextWidth; } else { maxX = fixed.x; minX = fixed.x - nextWidth; }
      if (fixed.y <= moving.y) { minY = fixed.y; maxY = fixed.y + nextHeight; } else { maxY = fixed.y; minY = fixed.y - nextHeight; }
    }
  }

  // Grow the dragged axis away from the anchor rather than allowing a zero-area box.
  if (cornerHandle || horizontalOnly) {
    if (maxX - minX < minSize) {
      if (fromCenter) { minX = center.x - minSize / 2; maxX = center.x + minSize / 2; }
      else if (fixed.x <= moving.x) maxX = minX + minSize;
      else minX = maxX - minSize;
    }
  }
  if (cornerHandle || verticalOnly) {
    if (maxY - minY < minSize) {
      if (fromCenter) { minY = center.y - minSize / 2; maxY = center.y + minSize / 2; }
      else if (fixed.y <= moving.y) maxY = minY + minSize;
      else minY = maxY - minSize;
    }
  }

  const newWidth = maxX - minX;
  const newHeight = maxY - minY;
  const localCenter = { x: minX + newWidth / 2, y: minY + newHeight / 2 };
  const worldCenter = localToWorld(object, localCenter);

  return {
    ...object,
    x: worldCenter.x - newWidth / 2,
    y: worldCenter.y - newHeight / 2,
    width: newWidth,
    height: newHeight,
  };
}

/**
 * Backwards-compatible convenience wrapper: applies a world-space `delta` to the current grip
 * position and delegates to `resizeDrawObjectTo`.
 */
export function resizeDrawObject(
  object: DrawObject,
  handle: DrawResizeHandle,
  delta: DrawPoint,
  options?: DrawResizeOptions,
): DrawObject {
  assertPointArgument(delta, 'resize-delta-invalid');
  const grip = handleWorldPoint(object, handle);
  return resizeDrawObjectTo(object, handle, { x: grip.x + delta.x, y: grip.y + delta.y }, options);
}

/** Angle in degrees from `center` to `pointer`, measured like SVG `rotate()` (clockwise on screen). */
export function angleFromCenter(center: DrawPoint, pointer: DrawPoint): number {
  assertPointArgument(center, 'rotate-pointer-invalid');
  assertPointArgument(pointer, 'rotate-pointer-invalid');
  if (center.x === pointer.x && center.y === pointer.y) throw new DrawModelError('rotate-pointer-degenerate');
  return normalizeDegrees((Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI);
}

/**
 * Rotates `object` so its top edge follows `pointer`. The rotation grip starts on the top edge, so
 * the pointer angle is offset by 90 degrees before snapping.
 */
export function rotateDrawObjectTo(object: DrawObject, pointer: DrawPoint, options?: DrawRotateOptions): DrawObject {
  assertDrawObject(object);
  assertPointArgument(pointer, 'rotate-pointer-invalid');
  const step = options?.snapStep ?? 0;
  if (typeof step !== 'number' || !Number.isFinite(step) || step < 0 || step > 360) {
    throw new DrawModelError('rotate-snap-invalid');
  }
  const origin = options?.center ?? drawObjectCenter(object);
  const absolute = normalizeDegrees(angleFromCenter(origin, pointer) + 90);
  const rotation = step > 0 ? snapDegrees(absolute, step) : absolute;
  const result: DrawObject = { ...object, rotation };
  if (options?.center) {
    const originalCenter = drawObjectCenter(object);
    const movedCenter = rotatePointAround(originalCenter, options.center, rotation);
    result.x = object.x + (movedCenter.x - originalCenter.x);
    result.y = object.y + (movedCenter.y - originalCenter.y);
  }
  return result;
}

/** Pure translate used by drag and arrow-key movement. Rotation is untouched by design. */
export function translateDrawObject(object: DrawObject, delta: DrawPoint): DrawObject {
  assertDrawObject(object);
  assertPointArgument(delta, 'translate-delta-invalid');
  return { ...object, x: object.x + delta.x, y: object.y + delta.y };
}

/**
 * Nudges `object` and reports the world-space delta that snapping accepted, so the caller can draw
 * alignment feedback without running the snap rule a second time.
 */
export function translateDrawObjectSnapped(
  object: DrawObject,
  delta: DrawPoint,
  snap: (point: DrawPoint) => DrawPoint,
): { readonly object: DrawObject; readonly applied: DrawPoint; readonly snapped: boolean } {
  if (typeof snap !== 'function') throw new DrawModelError('snap-function-invalid');
  assertPointArgument(delta, 'translate-delta-invalid');
  const target = snap({ x: object.x + delta.x, y: object.y + delta.y });
  const applied = { x: target.x - object.x, y: target.y - object.y };
  return {
    object: translateDrawObject(object, applied),
    applied,
    snapped: applied.x !== delta.x || applied.y !== delta.y,
  };
}
