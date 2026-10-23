// STATUS: PLATIN
// Bounded marquee (rubber-band) resolution for the canonical Whiteboard object model.
//
// Draw already implements the same *rule* in `apps/draw/interactions/drawHitTest.ts`
// (`marqueeDrawSelection`): rectangular band, containment by default, result ordered by the canonical
// paint order. It is deliberately re-implemented here instead of imported, because Draw's version is
// defined over a `DrawScene` (`DrawSceneEntry`, `paintIndex`, layer `visible`/`locked` flags, groups
// as their own objects with `childIds`), while a Whiteboard scene is a flat `WhiteboardItem[]` with
// `zIndex`/`hidden`/`locked` and groups expressed as a shared `groupId` tag. Reusing Draw's function
// would require adapting every Whiteboard marquee pass into a parallel `DrawScene` — a third object
// model, which is exactly the duplication this module exists to prevent. The *convention* is shared;
// the scene adapter is not.
//
// Connectors are never marquee-selected: a Whiteboard connector stores no geometry of its own
// (`x`/`y`/`width`/`height` are placeholders) — its shape is the routed path produced by
// `buildWhiteboardConnectorPaths`. A coarse selection band must not pretend to contain a curve it
// never measured, so connectors stay pointer-selectable through their routed path only.

import { expandSelectionForGroup } from '../model/whiteboardManipulationEngine';
import type { WhiteboardItem } from '../types';
import { WHITEBOARD_MAX_COORDINATE, WHITEBOARD_MAX_ITEMS } from '../viewport/whiteboardViewportEngine';

/** A band narrower than this in both axes is treated as a click, not a marquee. */
export const WHITEBOARD_MARQUEE_MIN_SIZE = 6;
/** Hard ceiling for one marquee commit; exceeding it fails closed instead of truncating silently. */
export const WHITEBOARD_MARQUEE_MAX_SELECTION = 4096;

export type WhiteboardMarqueeMode = 'contain' | 'intersect';

export interface WhiteboardMarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WhiteboardMarqueeOptions {
  /** `contain` (default) selects fully enclosed objects, `intersect` selects touched objects. */
  readonly mode?: WhiteboardMarqueeMode;
  readonly includeLocked?: boolean;
  readonly includeHidden?: boolean;
  readonly maxSelection?: number;
}

export type WhiteboardMarqueeResult =
  | { readonly ok: true; readonly ids: string[] }
  | { readonly ok: false; readonly reason: string };

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const clampExtent = (value: number): number => Math.min(Math.abs(value), WHITEBOARD_MAX_COORDINATE * 2);

/** Turns two drag points into a positive-extent band. Non-finite input collapses to an empty band. */
export function normalizeWhiteboardMarquee(
  start: { x: number; y: number },
  current: { x: number; y: number },
): WhiteboardMarqueeRect {
  const startX = finite(start?.x);
  const startY = finite(start?.y);
  const currentX = finite(current?.x);
  const currentY = finite(current?.y);
  return {
    x: Math.min(startX, currentX),
    y: Math.min(startY, currentY),
    width: clampExtent(currentX - startX),
    height: clampExtent(currentY - startY),
  };
}

/** True once the band is wide or tall enough to be a marquee instead of a click. */
export function isWhiteboardMarqueeActive(rect: WhiteboardMarqueeRect): boolean {
  const width = Math.max(0, finite(rect?.width));
  const height = Math.max(0, finite(rect?.height));
  return Math.max(width, height) >= WHITEBOARD_MARQUEE_MIN_SIZE;
}

function itemHasFiniteBounds(item: WhiteboardItem): boolean {
  return Number.isFinite(item.x) && Number.isFinite(item.y)
    && Number.isFinite(item.width) && Number.isFinite(item.height)
    && item.width > 0 && item.height > 0;
}

/**
 * Single geometry rule for marquee membership. Objects with non-finite or empty geometry never match
 * (fail closed), and connectors are excluded because their stored box is not their rendered shape.
 */
export function whiteboardItemMatchesMarquee(
  item: WhiteboardItem,
  rect: WhiteboardMarqueeRect,
  mode: WhiteboardMarqueeMode = 'contain',
): boolean {
  if (!item || item.type === 'connector') return false;
  if (!itemHasFiniteBounds(item)) return false;
  const left = finite(rect?.x);
  const top = finite(rect?.y);
  const right = left + Math.max(0, finite(rect?.width));
  const bottom = top + Math.max(0, finite(rect?.height));
  const itemRight = item.x + item.width;
  const itemBottom = item.y + item.height;
  if (mode === 'intersect') {
    return item.x < right && itemRight > left && item.y < bottom && itemBottom > top;
  }
  return item.x >= left && item.y >= top && itemRight <= right && itemBottom <= bottom;
}

/**
 * Resolves the selection ids for one marquee band in canonical paint order (bottom-first, exactly the
 * order `buildWhiteboardRenderProjection` paints in). Group members are pulled in so a group can
 * never be partially selected by a band.
 */
export function marqueeWhiteboardSelection(
  items: readonly WhiteboardItem[],
  rect: WhiteboardMarqueeRect,
  options: WhiteboardMarqueeOptions = {},
): WhiteboardMarqueeResult {
  if (!Array.isArray(items) || items.length > WHITEBOARD_MAX_ITEMS) {
    return { ok: false, reason: `Board object ceiling exceeded (${WHITEBOARD_MAX_ITEMS.toLocaleString()} objects).` };
  }
  const maxSelection = Math.max(1, Math.min(
    WHITEBOARD_MARQUEE_MAX_SELECTION,
    Number.isFinite(options.maxSelection) ? Math.trunc(options.maxSelection as number) : WHITEBOARD_MARQUEE_MAX_SELECTION,
  ));
  const mode = options.mode === 'intersect' ? 'intersect' : 'contain';
  const matched: WhiteboardItem[] = [];
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || item.id.length === 0) continue;
    if (!options.includeHidden && item.hidden) continue;
    if (!options.includeLocked && item.locked) continue;
    if (!whiteboardItemMatchesMarquee(item, rect, mode)) continue;
    matched.push(item);
    if (matched.length > maxSelection) {
      return { ok: false, reason: `Marquee selection exceeds ${maxSelection.toLocaleString()} objects; narrow the band.` };
    }
  }
  matched.sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0) || left.id.localeCompare(right.id));
  const expanded = expandSelectionForGroup(items as WhiteboardItem[], matched.map((item) => item.id))
    .filter((id) => options.includeHidden || !items.some((item) => item.id === id && item.hidden));
  if (expanded.length > maxSelection) {
    return { ok: false, reason: `Marquee selection exceeds ${maxSelection.toLocaleString()} objects; narrow the band.` };
  }
  return { ok: true, ids: expanded };
}
