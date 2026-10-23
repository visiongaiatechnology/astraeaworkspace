// STATUS: PLATIN — pure Present object selector (click, marquee, keyboard cycling, z-stack).
//
// Before this module the stage canvas carried a single `selectedSceneObjectId: string | null`.
// There was no marquee, no multi-select, no keyboard selection and no way to reach an object
// that is fully covered by another one. Every selection fact now comes from here so pointer and
// keyboard selection can never disagree.

import { presentObjectRect, rectContainsPoint, rectsIntersect, unionPresentRects, type PresentPercentRect } from './presentRect';
import { sortPresentLayers } from './presentScene';

export interface PresentSelectableObject {
  id: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  locked?: boolean;
  hidden?: boolean;
}

/** Upper bound for one selection. Documents are hostile input; a 100 000-object selection is a defect. */
export const PRESENT_MAX_SELECTION_SIZE = 512;

/**
 * Render order (bottom first): ascending `zIndex`, ties in document array order.
 * Delegates to `sortPresentLayers` so the canvas, the layers pane and the selector agree.
 */
export function presentSelectionOrder<T extends PresentSelectableObject>(objects: readonly T[]): T[] {
  return sortPresentLayers([...objects]);
}

/** Hidden objects are never selectable; locked objects are selectable (they can be inspected and unlocked). */
export function isPresentObjectSelectable(object: PresentSelectableObject): boolean {
  return object.hidden !== true;
}

/** Objects under a point, topmost first. Uses the rotation-aware bounding box. */
export function presentObjectsOverlappingPoint<T extends PresentSelectableObject>(
  objects: readonly T[],
  point: { xPercent: number; yPercent: number },
  aspectRatio?: number,
): T[] {
  const hits: T[] = [];
  for (const object of presentSelectionOrder(objects)) {
    if (!isPresentObjectSelectable(object)) continue;
    if (rectContainsPoint(presentObjectRect(object, aspectRatio), point)) hits.push(object);
  }
  return hits.reverse();
}

/** The object a plain click selects: topmost visible object under the point. */
export function hitTestPresentObject<T extends PresentSelectableObject>(
  objects: readonly T[],
  point: { xPercent: number; yPercent: number },
  aspectRatio?: number,
): T | null {
  return presentObjectsOverlappingPoint(objects, point, aspectRatio)[0] ?? null;
}

/**
 * Alt-click cycling: step one position down the stack at the point, wrapping at the bottom.
 * This is the only pointer path to an object that is completely covered by another one.
 */
export function pickPresentObjectInStack<T extends PresentSelectableObject>(
  objects: readonly T[],
  point: { xPercent: number; yPercent: number },
  currentId: string | null,
  aspectRatio?: number,
): T | null {
  const stack = presentObjectsOverlappingPoint(objects, point, aspectRatio);
  if (!stack.length) return null;
  const index = currentId ? stack.findIndex((candidate) => candidate.id === currentId) : -1;
  const next = stack[(index + 1) % stack.length];
  return next ?? null;
}

/** Marquee selection: every visible object whose bounding box intersects the drag rectangle. */
export function presentObjectsInMarquee<T extends PresentSelectableObject>(
  objects: readonly T[],
  rect: PresentPercentRect,
  aspectRatio?: number,
): T[] {
  return presentSelectionOrder(objects).filter(
    (object) => isPresentObjectSelectable(object) && rectsIntersect(presentObjectRect(object, aspectRatio), rect),
  );
}

/**
 * Drops ids that no longer exist or are hidden, removes duplicates, keeps render order and caps
 * the size. Called on every incoming selection so a stale id can never reach the inspector.
 */
export function normalizePresentSelection<T extends PresentSelectableObject>(
  objects: readonly T[],
  ids: readonly string[],
): string[] {
  const wanted = new Set(ids.slice(0, PRESENT_MAX_SELECTION_SIZE));
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const object of presentSelectionOrder(objects)) {
    if (!wanted.has(object.id) || seen.has(object.id) || !isPresentObjectSelectable(object)) continue;
    seen.add(object.id);
    normalized.push(object.id);
    if (normalized.length >= PRESENT_MAX_SELECTION_SIZE) break;
  }
  return normalized;
}

/**
 * Shift/Ctrl-click semantics: additive when `additive`, otherwise a plain replacement.
 * Clicking an already selected object with a modifier removes it, unless it is the only one.
 */
export function togglePresentSelection<T extends PresentSelectableObject>(
  objects: readonly T[],
  ids: readonly string[],
  id: string,
  additive: boolean,
): string[] {
  const current = normalizePresentSelection(objects, ids);
  const exists = objects.some((object) => object.id === id && isPresentObjectSelectable(object));
  if (!exists) return current;
  if (!additive) return [id];
  if (current.includes(id)) {
    const next = current.filter((candidate) => candidate !== id);
    return next.length ? next : current;
  }
  return normalizePresentSelection(objects, [...current, id]);
}

/**
 * Tab / Shift+Tab: moves the selection to the next or previous visible object in render order and
 * wraps around. With an empty selection, forward selects the bottom-most and backward the
 * top-most object, so the first Tab always selects something.
 */
export function cyclePresentSelection<T extends PresentSelectableObject>(
  objects: readonly T[],
  ids: readonly string[],
  direction: 1 | -1,
): string[] {
  const order = presentSelectionOrder(objects).filter(isPresentObjectSelectable);
  if (!order.length) return [];
  const current = normalizePresentSelection(objects, ids);
  const anchorId = current.length ? current[current.length - 1] : null;
  const anchorIndex = anchorId ? order.findIndex((object) => object.id === anchorId) : -1;
  if (anchorIndex < 0) return [direction === 1 ? order[0].id : order[order.length - 1].id];
  const nextIndex = (anchorIndex + direction + order.length) % order.length;
  return [order[nextIndex].id];
}

export function selectAllPresentObjects<T extends PresentSelectableObject>(objects: readonly T[]): string[] {
  return presentSelectionOrder(objects)
    .filter(isPresentObjectSelectable)
    .slice(0, PRESENT_MAX_SELECTION_SIZE)
    .map((object) => object.id);
}

/** Union bounding box of a selection, or `null` for an empty selection. */
export function presentSelectionBounds<T extends PresentSelectableObject>(
  objects: readonly T[],
  ids: readonly string[],
  aspectRatio?: number,
): PresentPercentRect | null {
  const wanted = new Set(normalizePresentSelection(objects, ids));
  if (!wanted.size) return null;
  return unionPresentRects(
    objects.filter((object) => wanted.has(object.id)).map((object) => presentObjectRect(object, aspectRatio)),
  );
}

/** The primary selection: the object the inspector binds to (last one added). */
export function presentSelectionPrimary<T extends PresentSelectableObject>(
  objects: readonly T[],
  ids: readonly string[],
): T | null {
  const normalized = normalizePresentSelection(objects, ids);
  if (!normalized.length) return null;
  const primaryId = normalized[normalized.length - 1];
  return objects.find((object) => object.id === primaryId) ?? null;
}

/** Human and screen-reader label for the current selection. Never colour-only. */
export function presentSelectionLabel<T extends PresentSelectableObject & { kind?: string; text?: string }>(
  objects: readonly T[],
  ids: readonly string[],
): string {
  const normalized = normalizePresentSelection(objects, ids);
  if (!normalized.length) return 'No object selected';
  if (normalized.length > 1) return `${normalized.length} objects selected`;
  const object = objects.find((candidate) => candidate.id === normalized[0]);
  if (!object) return 'No object selected';
  const kind = object.kind ?? 'object';
  const detail = typeof object.text === 'string' && object.text.trim() ? `: ${object.text.trim().slice(0, 60)}` : '';
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} object selected${detail}`;
}
