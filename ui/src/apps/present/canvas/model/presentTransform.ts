// STATUS: PLATIN — pure keyboard/command transforms for a Present object selection.
//
// Every essential canvas action in Paket 4/5/8/9 has a keyboard path here: move, resize, rotate,
// flip, delete, lock, hide. The drag gestures on the stage canvas and the keyboard commands in
// `presentEditorCommands` both end up in these functions, so pointer and keyboard can never
// diverge. A multi-object move clamps the *delta*, not each object, so relative offsets survive
// at the slide edge.

import type { PresentObjectGeometry, PresentSceneObject } from '../../../../shared/contracts/workspace';
import { readPresentFlip, withPresentFlip } from './presentObjectExtensions';
import { normalizePresentGeometry } from './presentScene';
import { normalizePresentSelection } from './presentSelection';

export type PresentTransformableObject = PresentObjectGeometry & { id: string };

export const PRESENT_NUDGE_STEP_PERCENT = 0.25;
export const PRESENT_NUDGE_COARSE_STEP_PERCENT = 2;
export const PRESENT_RESIZE_STEP_PERCENT = 1;
export const PRESENT_ROTATE_STEP_DEG = 5;
export const PRESENT_ROTATE_COARSE_STEP_DEG = 15;
export const PRESENT_MIN_OBJECT_WIDTH_PERCENT = 2;
export const PRESENT_MIN_OBJECT_HEIGHT_PERCENT = 2;

/**
 * PR-006 (M1) — the handle that drives a resize.
 *
 * The eight values are exactly the eight affordances the selected object renders (`resize-nw` …
 * `resize-w`). `'se'` is the historical bottom-right handle and therefore the default of
 * `resizePresentSelection`, so every pre-PR-006 call site keeps its behaviour bit for bit.
 */
export type PresentResizeCorner = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const PRESENT_RESIZE_CORNERS: readonly PresentResizeCorner[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface PresentResizeOptions {
  /** Handle that was grabbed; omitted means the historical bottom-right resize. */
  corner?: PresentResizeCorner;
  /**
   * Shift held at pointer-down. On a **corner** handle the resize then keeps the start aspect
   * ratio; on an edge handle Shift is deliberately ignored (an edge can only change one axis).
   */
  shift?: boolean;
}

function resolveResizeCorner(corner: PresentResizeCorner | undefined): PresentResizeCorner {
  return corner && PRESENT_RESIZE_CORNERS.includes(corner) ? corner : 'se';
}

/**
 * Resizes one object from a handle, keeping the opposite corner/edge fixed.
 *
 * The moving edge is expressed as a sign: `xSign < 0` means the west edge moves, `xSign > 0` the
 * east edge; `0` means the axis is not part of the gesture. Clamping happens against the anchored
 * edge, so a drag can never push the object out of the slide by moving its ungrabbed side.
 */
function resizePresentObjectFromHandle<T extends PresentTransformableObject>(
  object: T,
  dxPercent: number,
  dyPercent: number,
  corner: PresentResizeCorner,
  shift: boolean,
): T {
  const startX = object.xPercent;
  const startY = object.yPercent;
  const startWidth = object.widthPercent;
  const startHeight = object.heightPercent;
  const right = startX + startWidth;
  const bottom = startY + startHeight;
  const xSign = corner.includes('w') ? -1 : corner.includes('e') ? 1 : 0;
  const ySign = corner.includes('n') ? -1 : corner.includes('s') ? 1 : 0;
  if (xSign === 0 && ySign === 0) return object;

  // Largest size that still keeps the unchanged edge inside the slide (0..100 %).
  const widthLimit = xSign > 0 ? 100 - startX : right;
  const heightLimit = ySign > 0 ? 100 - startY : bottom;

  let widthPercent = startWidth;
  let heightPercent = startHeight;

  if (shift && xSign !== 0 && ySign !== 0) {
    // Aspect lock: one uniform scale, driven by the axis the pointer moved more (relatively).
    const scaleX = (startWidth + xSign * dxPercent) / startWidth;
    const scaleY = (startHeight + ySign * dyPercent) / startHeight;
    let scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    const minScale = Math.max(
      PRESENT_MIN_OBJECT_WIDTH_PERCENT / startWidth,
      PRESENT_MIN_OBJECT_HEIGHT_PERCENT / startHeight,
    );
    const maxScale = Math.min(widthLimit / startWidth, heightLimit / startHeight);
    scale = Math.min(maxScale, Math.max(minScale, scale));
    widthPercent = startWidth * scale;
    heightPercent = startHeight * scale;
  } else {
    if (xSign !== 0) {
      widthPercent = Math.min(
        widthLimit,
        Math.max(PRESENT_MIN_OBJECT_WIDTH_PERCENT, startWidth + xSign * dxPercent),
      );
    }
    if (ySign !== 0) {
      heightPercent = Math.min(
        heightLimit,
        Math.max(PRESENT_MIN_OBJECT_HEIGHT_PERCENT, startHeight + ySign * dyPercent),
      );
    }
  }

  const xPercent = xSign > 0 ? startX : xSign < 0 ? right - widthPercent : startX;
  const yPercent = ySign > 0 ? startY : ySign < 0 ? bottom - heightPercent : startY;
  if (
    xPercent === startX &&
    yPercent === startY &&
    widthPercent === startWidth &&
    heightPercent === startHeight
  ) {
    return object;
  }
  return normalizePresentGeometry({ ...object, xPercent, yPercent, widthPercent, heightPercent }) as T;
}

export interface PresentTransformResult<T> {
  objects: T[];
  changedIds: string[];
  skippedLockedIds: string[];
  /** Axis that could not move because the selection already touches a slide edge. */
  blockedAxes: Array<'x' | 'y'>;
}

function emptyResult<T>(objects: readonly T[]): PresentTransformResult<T> {
  return { objects: [...objects], changedIds: [], skippedLockedIds: [], blockedAxes: [] };
}

function resolveTargets<T extends PresentTransformableObject>(objects: readonly T[], ids: readonly string[]) {
  const selected = new Set(normalizePresentSelection(objects as never, ids));
  const selectedIds = objects.filter((object) => selected.has(object.id)).map((object) => object.id);
  const unlocked: T[] = [];
  const skippedLockedIds: string[] = [];
  for (const object of objects) {
    if (!selected.has(object.id)) continue;
    if (object.locked) skippedLockedIds.push(object.id);
    else unlocked.push(object);
  }
  return { selectedIds, unlocked, skippedLockedIds };
}

/**
 * Moves the whole selection by the requested delta. The delta is clamped once for the selection
 * bounding box, so objects keep their relative offsets instead of collapsing at the slide edge.
 */
export function nudgePresentSelection<T extends PresentTransformableObject>(
  objects: readonly T[],
  ids: readonly string[],
  dxPercent: number,
  dyPercent: number,
): PresentTransformResult<T> {
  const { selectedIds, unlocked, skippedLockedIds } = resolveTargets(objects, ids);
  if (!selectedIds.length) return emptyResult(objects);
  if (!unlocked.length) return { ...emptyResult(objects), skippedLockedIds };

  let dx = Number.isFinite(dxPercent) ? dxPercent : 0;
  let dy = Number.isFinite(dyPercent) ? dyPercent : 0;
  const blockedAxes: Array<'x' | 'y'> = [];

  const minX = Math.min(...unlocked.map((object) => object.xPercent));
  const maxRight = Math.max(...unlocked.map((object) => object.xPercent + object.widthPercent));
  if (dx < 0) dx = Math.max(dx, -minX);
  else if (dx > 0) dx = Math.min(dx, 100 - maxRight);
  if (dx !== (Number.isFinite(dxPercent) ? dxPercent : 0)) blockedAxes.push('x');

  const minY = Math.min(...unlocked.map((object) => object.yPercent));
  const maxBottom = Math.max(...unlocked.map((object) => object.yPercent + object.heightPercent));
  if (dy < 0) dy = Math.max(dy, -minY);
  else if (dy > 0) dy = Math.min(dy, 100 - maxBottom);
  if (dy !== (Number.isFinite(dyPercent) ? dyPercent : 0)) blockedAxes.push('y');

  const changedIds: string[] = [];
  const next = objects.map((object) => {
    if (!selectedIds.includes(object.id) || object.locked) return object;
    if (dx === 0 && dy === 0) return object;
    changedIds.push(object.id);
    return normalizePresentGeometry({ ...object, xPercent: object.xPercent + dx, yPercent: object.yPercent + dy }) as T;
  });
  return { objects: next, changedIds, skippedLockedIds, blockedAxes };
}

/**
 * Grows/shrinks every unlocked selected object.
 *
 * Backwards compatible: without `options` the historical bottom-right ("se") behaviour is kept —
 * `dx` widens and `dy` heightens while the top-left corner stays fixed. PR-006 passes the grabbed
 * handle (`corner`) and the Shift state (`shift`), which turns the same pure function into the
 * eight-handle, anchor-preserving, optionally aspect-locked resize of the canvas.
 */
export function resizePresentSelection<T extends PresentTransformableObject>(
  objects: readonly T[],
  ids: readonly string[],
  dxPercent: number,
  dyPercent: number,
  options: PresentResizeOptions = {},
): PresentTransformResult<T> {
  const { selectedIds, unlocked, skippedLockedIds } = resolveTargets(objects, ids);
  if (!selectedIds.length) return emptyResult(objects);
  if (!unlocked.length) return { ...emptyResult(objects), skippedLockedIds };
  const dx = Number.isFinite(dxPercent) ? dxPercent : 0;
  const dy = Number.isFinite(dyPercent) ? dyPercent : 0;
  const corner = resolveResizeCorner(options.corner);
  const shift = Boolean(options.shift);
  const changedIds: string[] = [];
  const next = objects.map((object) => {
    if (!selectedIds.includes(object.id) || object.locked) return object;
    const resized = resizePresentObjectFromHandle(object, dx, dy, corner, shift);
    if (resized === object) return object;
    changedIds.push(object.id);
    return resized;
  });
  return { objects: next, changedIds, skippedLockedIds, blockedAxes: [] };
}

/**
 * Rotates every unlocked selected object. The new angle is folded into (-180, 180] *before*
 * `normalizePresentGeometry` clamps it to -360..360: without the fold, rotating past 360 clamped
 * back to exactly 360 and every further rotate in that direction was a dead key.
 */
export function rotatePresentSelection<T extends PresentTransformableObject>(
  objects: readonly T[],
  ids: readonly string[],
  deltaDeg: number,
): PresentTransformResult<T> {
  const { selectedIds, unlocked, skippedLockedIds } = resolveTargets(objects, ids);
  if (!selectedIds.length || !unlocked.length || !Number.isFinite(deltaDeg) || deltaDeg === 0) {
    return { ...emptyResult(objects), skippedLockedIds };
  }
  const changedIds: string[] = [];
  const next = objects.map((object) => {
    if (!selectedIds.includes(object.id) || object.locked) return object;
    changedIds.push(object.id);
    return normalizePresentGeometry({
      ...object,
      rotation: presentRotationDegrees((object.rotation ?? 0) + deltaDeg),
    }) as T;
  });
  return { objects: next, changedIds, skippedLockedIds, blockedAxes: [] };
}

/** Mirrors every unlocked selected object across its own centre line. */
export function flipPresentSelection<T extends PresentTransformableObject>(
  objects: readonly T[],
  ids: readonly string[],
  axis: 'x' | 'y',
): PresentTransformResult<T> {
  const { selectedIds, unlocked, skippedLockedIds } = resolveTargets(objects, ids);
  if (!selectedIds.length || !unlocked.length) return { ...emptyResult(objects), skippedLockedIds };
  const changedIds: string[] = [];
  const next = objects.map((object) => {
    if (!selectedIds.includes(object.id) || object.locked) return object;
    changedIds.push(object.id);
    const current = readPresentFlip(object);
    return withPresentFlip(object, {
      flipX: axis === 'x' ? !current.flipX : current.flipX,
      flipY: axis === 'y' ? !current.flipY : current.flipY,
    }) as T;
  });
  return { objects: next, changedIds, skippedLockedIds, blockedAxes: [] };
}

/** Lock/unlock is allowed on locked objects too - otherwise a locked object could never be freed. */
export function setPresentSelectionLocked<T extends PresentTransformableObject>(
  objects: readonly T[],
  ids: readonly string[],
  locked: boolean,
): PresentTransformResult<T> {
  const selected = new Set(normalizePresentSelection(objects as never, ids));
  if (!selected.size) return emptyResult(objects);
  const changedIds: string[] = [];
  const next = objects.map((object) => {
    if (!selected.has(object.id) || Boolean(object.locked) === locked) return object;
    changedIds.push(object.id);
    return { ...object, locked } as T;
  });
  return { objects: next, changedIds, skippedLockedIds: [], blockedAxes: [] };
}

export function setPresentSelectionHidden<T extends PresentTransformableObject>(
  objects: readonly T[],
  ids: readonly string[],
  hidden: boolean,
): PresentTransformResult<T> {
  const selected = new Set(normalizePresentSelection(objects as never, ids));
  if (!selected.size) return emptyResult(objects);
  const changedIds: string[] = [];
  const next = objects.map((object) => {
    if (!selected.has(object.id) || Boolean(object.hidden) === hidden) return object;
    changedIds.push(object.id);
    return { ...object, hidden } as T;
  });
  return { objects: next, changedIds, skippedLockedIds: [], blockedAxes: [] };
}

/**
 * Deletes the selection. Locked objects are refused (fail-closed) - the user has to unlock first,
 * which the result reports so the UI can say why nothing disappeared.
 */
export function deletePresentSelection<T extends PresentTransformableObject>(
  objects: readonly T[],
  ids: readonly string[],
): PresentTransformResult<T> {
  const selected = new Set(normalizePresentSelection(objects as never, ids));
  if (!selected.size) return emptyResult(objects);
  const removed: T[] = [];
  const skippedLockedIds: string[] = [];
  for (const object of objects) {
    if (!selected.has(object.id)) continue;
    if (object.locked) skippedLockedIds.push(object.id);
    else removed.push(object);
  }
  const removedIds = new Set(removed.map((object) => object.id));
  return {
    objects: objects.filter((object) => !removedIds.has(object.id)),
    changedIds: removed.map((object) => object.id),
    skippedLockedIds,
    blockedAxes: [],
  };
}

/** Degrees rendered for the inspector/aria label, folded into (-180, 180]. */
export function presentRotationDegrees(rotation: number | undefined): number {
  const value = Number.isFinite(rotation ?? 0) ? (rotation ?? 0) : 0;
  const folded = ((value % 360) + 360) % 360;
  return folded > 180 ? folded - 360 : folded;
}

export function presentRotationLabel(rotation: number | undefined): string {
  return `${Math.round(presentRotationDegrees(rotation))}°`;
}

/** Convenience view for the inspector: are all selected objects locked? */
export function presentSelectionLockState(objects: readonly PresentSceneObject[], ids: readonly string[]): 'none' | 'some' | 'all' {
  const selected = new Set(normalizePresentSelection(objects as never, ids));
  const targets = objects.filter((object) => selected.has(object.id));
  if (!targets.length) return 'none';
  const locked = targets.filter((object) => object.locked).length;
  if (locked === 0) return 'none';
  return locked === targets.length ? 'all' : 'some';
}
