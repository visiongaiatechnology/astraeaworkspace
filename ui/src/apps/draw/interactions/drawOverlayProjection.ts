// STATUS: PLATIN — pure projection of selection adorners, guides and interaction feedback to render data.
import type { DrawBounds, DrawObject, DrawObjectId, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import {
  DRAW_RESIZE_HANDLES,
  drawObjectWorldBounds,
  expandDrawBounds,
  handleWorldPoint,
  localToWorld,
  normalizedBounds,
  type DrawResizeHandle,
} from './drawGeometry';
import { DRAW_ROTATE_HANDLE_OFFSET, resolveDrawSelectionRoot } from './drawHitTest';
import type { DrawScene } from './drawSceneProjection';
import { DrawModelError } from '../model/drawDocumentValidation';

export interface DrawAdornerHandle {
  readonly handle: DrawResizeHandle;
  readonly x: number;
  readonly y: number;
}

export interface DrawSelectionAdorner {
  readonly objectId: DrawObjectId;
  readonly bounds: DrawBounds;
  readonly worldBounds: DrawBounds;
  readonly rotation: number;
  readonly handles: readonly DrawAdornerHandle[];
  /** `null` for connectors and group containers, which have no reorientable body box here. */
  readonly rotateHandle: DrawPoint | null;
  readonly locked: boolean;
  readonly summary: string;
}

export interface DrawMarqueeAdorner {
  readonly bounds: DrawBounds;
  readonly objectCount: number;
  readonly additive: boolean;
}

export interface DrawAlignmentGuide {
  readonly axis: 'x' | 'y';
  readonly position: number;
}

export interface DrawOverlayProjection {
  readonly selection: readonly DrawSelectionAdorner[];
  readonly primary: DrawSelectionAdorner | null;
  readonly marquee: DrawMarqueeAdorner | null;
  readonly guides: readonly DrawAlignmentGuide[];
  readonly hoverOutline: DrawBounds | null;
}

/** Adorners for a single object, including its eight grips and the rotation grip. */
export function projectDrawObjectAdorner(scene: DrawScene, objectId: DrawObjectId): DrawSelectionAdorner | null {
  const entry = scene.byId.get(objectId);
  if (!entry) return null;
  const object = entry.object;
  const transformable = object.type !== 'connector' && object.type !== 'group';
  const handles: DrawAdornerHandle[] = transformable
    ? DRAW_RESIZE_HANDLES.map((handle) => {
      const point = handleWorldPoint(object, handle);
      return { handle, x: point.x, y: point.y };
    })
    : [];
  return {
    objectId,
    bounds: { x: object.x, y: object.y, width: object.width, height: object.height },
    worldBounds: drawObjectWorldBounds(object),
    rotation: object.rotation,
    handles,
    rotateHandle: transformable ? localToWorld(object, { x: object.width / 2, y: -DRAW_ROTATE_HANDLE_OFFSET }) : null,
    locked: entry.locked,
    summary: object.name,
  };
}

/**
 * Full overlay for the current interaction. Connector-only selections get no resize grips because
 * connector geometry is owned by the routing engine, not by an x/y/width/height box.
 */
export function projectDrawOverlay(
  scene: DrawScene,
  selection: readonly DrawObjectId[],
  options?: {
    readonly hoverId?: DrawObjectId | null;
    readonly marquee?: DrawBounds | null;
    readonly marqueeCount?: number;
    readonly marqueeAdditive?: boolean;
    readonly guides?: readonly DrawAlignmentGuide[];
  },
): DrawOverlayProjection {
  const roots = [...new Set(selection.map((id) => resolveDrawSelectionRoot(scene, id)))];
  const adorners: DrawSelectionAdorner[] = [];
  for (const id of roots) {
    const adorner = projectDrawObjectAdorner(scene, id);
    if (adorner) adorners.push(adorner);
  }
  const resizable = adorners.filter((adorner) => scene.byId.get(adorner.objectId)?.object.type !== 'connector');
  const primary = resizable.length === 1 ? resizable[0]! : null;

  const hoverEntry = options?.hoverId ? scene.byId.get(options.hoverId) : undefined;
  const marquee = options?.marquee
    ? {
      bounds: normalizedBounds(
        { x: options.marquee.x, y: options.marquee.y },
        { x: options.marquee.x + options.marquee.width, y: options.marquee.y + options.marquee.height },
      ),
      objectCount: options.marqueeCount ?? 0,
      additive: options.marqueeAdditive === true,
    }
    : null;

  return {
    selection: adorners,
    primary,
    marquee,
    guides: options?.guides ?? [],
    hoverOutline: hoverEntry && !selection.includes(hoverEntry.object.id)
      ? drawObjectWorldBounds(hoverEntry.object)
      : null,
  };
}

/** Union bounds of the selection, expanded by `padding`, used for the multi-select frame. */
export function projectSelectionFrame(bounds: readonly DrawBounds[], padding = 0): DrawBounds | null {
  if (bounds.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const box of bounds) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  return expandDrawBounds({ x: left, y: top, width: right - left, height: bottom - top }, padding);
}

/**
 * Turns a before/after object pair into the alignment guides that explain a snap. The values come
 * from geometry the snap already produced, so no second snapping rule exists in the UI layer.
 */
export function alignmentGuidesForSnap(
  before: Pick<DrawObject, 'x' | 'y' | 'width' | 'height'>,
  after: Pick<DrawObject, 'x' | 'y' | 'width' | 'height'>,
): DrawAlignmentGuide[] {
  const guides: DrawAlignmentGuide[] = [];
  if (before.x !== after.x) {
    guides.push({ axis: 'x', position: after.x });
    guides.push({ axis: 'x', position: after.x + after.width });
  }
  if (before.y !== after.y) {
    guides.push({ axis: 'y', position: after.y });
    guides.push({ axis: 'y', position: after.y + after.height });
  }
  return guides;
}

export function projectViewportGuides(guides: readonly { axis: 'x' | 'y'; position: number }[]): DrawAlignmentGuide[] {
  if (!Array.isArray(guides)) throw new DrawModelError('guide-list-invalid');
  return guides
    .filter((guide) => Number.isFinite(guide.position) && (guide.axis === 'x' || guide.axis === 'y'))
    .map((guide) => ({ axis: guide.axis, position: guide.position }));
}
