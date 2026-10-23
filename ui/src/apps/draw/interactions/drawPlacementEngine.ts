// STATUS: PLATIN — pure Draw drag-and-drop placement maths and fail-closed drop-target resolution.
//
// The canvas is a scaled SVG: a pointer arrives in client pixels, the page is measured in world units.
// All of that translation lives here so the component only forwards raw pointer data, and a drop is
// validated before it mutates the document (locked/missing layer ⇒ stable error code, no partial edit).
import type { DrawDocumentModel, DrawObjectId, DrawPoint, DrawStencilDefinition } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, assertDrawDocument } from '../model/drawDocumentValidation';
import { insertDrawStencil } from './drawCommandEngine';
import { findDrawStencil } from './drawStencilCatalog';
import { projectDrawScene } from './drawSceneProjection';
import { pointInDrawBounds } from './drawGeometry';

/** Payload MIME used by the shape library when starting a drag. */
export const DRAW_STENCIL_MIME = 'application/x-astraea-draw-stencil';

export interface DrawViewportTransform {
  /** Screen-space rectangle of the page element, in CSS pixels. */
  readonly rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  /** Page size in world units. */
  readonly pageWidth: number;
  readonly pageHeight: number;
}

function assertTransform(transform: DrawViewportTransform): void {
  const { rect, pageWidth, pageHeight } = transform;
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) throw new DrawModelError('viewport-rect-invalid');
  if (!Number.isFinite(rect.width) || rect.width <= 0 || !Number.isFinite(rect.height) || rect.height <= 0) {
    throw new DrawModelError('viewport-rect-invalid');
  }
  if (!Number.isFinite(pageWidth) || pageWidth <= 0 || !Number.isFinite(pageHeight) || pageHeight <= 0) {
    throw new DrawModelError('viewport-page-invalid');
  }
}

/** Client pixels → page (world) units. Independent of how the zoom is implemented. */
export function clientToPagePoint(
  client: { readonly clientX: number; readonly clientY: number },
  transform: DrawViewportTransform,
): DrawPoint {
  if (!Number.isFinite(client.clientX) || !Number.isFinite(client.clientY)) throw new DrawModelError('pointer-invalid');
  assertTransform(transform);
  const scaleX = transform.pageWidth / transform.rect.width;
  const scaleY = transform.pageHeight / transform.rect.height;
  return {
    x: (client.clientX - transform.rect.left) * scaleX,
    y: (client.clientY - transform.rect.top) * scaleY,
  };
}

/** Page (world) units → client pixels; the inverse used to place the direct text editor. */
export function pageToClientPoint(point: DrawPoint, transform: DrawViewportTransform): DrawPoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new DrawModelError('pointer-invalid');
  assertTransform(transform);
  const scaleX = transform.rect.width / transform.pageWidth;
  const scaleY = transform.rect.height / transform.pageHeight;
  return {
    x: transform.rect.left + point.x * scaleX,
    y: transform.rect.top + point.y * scaleY,
  };
}

/** Pointer travel below this many client pixels counts as a click, not a drag. */
export const DRAW_DRAG_THRESHOLD_PX = 3;

export function isDrawDragGesture(
  start: { readonly clientX: number; readonly clientY: number },
  current: { readonly clientX: number; readonly clientY: number },
  threshold: number = DRAW_DRAG_THRESHOLD_PX,
): boolean {
  if (!Number.isFinite(threshold) || threshold < 0) throw new DrawModelError('drag-threshold-invalid');
  return Math.hypot(current.clientX - start.clientX, current.clientY - start.clientY) >= threshold;
}

export interface DrawPlacement {
  readonly pageId: string;
  readonly layerId: string;
  /** Top-left position after centring the stencil on the drop point and clamping it onto the page. */
  readonly position: DrawPoint;
}

/** Keeps a placed object inside the page so a drop can never create unreachable geometry. */
export function clampDrawPlacement(
  point: DrawPoint,
  size: { readonly width: number; readonly height: number },
  page: { readonly width: number; readonly height: number },
): DrawPoint {
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  const maxX = Math.max(0, page.width - width);
  const maxY = Math.max(0, page.height - height);
  return {
    x: Math.min(Math.max(0, point.x - width / 2), maxX),
    y: Math.min(Math.max(0, point.y - height / 2), maxY),
  };
}

/**
 * Resolves where a stencil may be dropped. Throws (fail closed) when the page is missing, the layer is
 * not part of the page, or the layer is locked.
 */
export function resolveDrawPlacement(
  model: DrawDocumentModel,
  dropPoint: DrawPoint,
  stencil: Pick<DrawStencilDefinition, 'objectTemplate'>,
  options?: { readonly pageId?: string; readonly layerId?: string },
): DrawPlacement {
  assertDrawDocument(model);
  if (!Number.isFinite(dropPoint.x) || !Number.isFinite(dropPoint.y)) throw new DrawModelError('stencil-position-invalid');
  const pageId = options?.pageId ?? model.activePageId;
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const layerId = options?.layerId ?? page.layerIds[0];
  if (!layerId || !page.layerIds.includes(layerId)) throw new DrawModelError('object-layer-missing');
  const layer = model.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new DrawModelError('layer-missing');
  if (layer.locked) throw new DrawModelError('layer-locked');
  return {
    pageId,
    layerId,
    position: clampDrawPlacement(dropPoint, { width: stencil.objectTemplate.width, height: stencil.objectTemplate.height }, page),
  };
}

export interface DrawDropResult {
  readonly model: DrawDocumentModel;
  readonly objectId: DrawObjectId;
  readonly placement: DrawPlacement;
}

/**
 * Places a stencil from the shape library at a drop point. Reuses `insertDrawStencil` (which reuses
 * `createVectorShape`) so the inserted object is built by exactly one code path.
 */
export function dropDrawStencil(
  model: DrawDocumentModel,
  stencilId: string,
  dropPoint: DrawPoint,
  options?: { readonly pageId?: string; readonly layerId?: string; readonly idSeed?: string },
): DrawDropResult {
  const stencil = findDrawStencil(model, stencilId);
  const placement = resolveDrawPlacement(model, dropPoint, stencil, options);
  const next = insertDrawStencil(model, stencilId, placement.position, placement.layerId, {
    idSeed: options?.idSeed,
  });
  const objectId = Object.keys(next.objects).find((id) => !model.objects[id]);
  if (!objectId) throw new DrawModelError('stencil-insert-failed');
  return { model: next, objectId, placement };
}

/** Reads a stencil id out of a drop event's data transfer payload; `null` when it is not ours. */
export function readDrawStencilDragPayload(get: (mime: string) => string, types: readonly string[]): string | null {
  if (!types.includes(DRAW_STENCIL_MIME)) return null;
  const value = get(DRAW_STENCIL_MIME);
  return value.length > 0 && value.length <= 256 ? value : null;
}

/**
 * Outermost container (a real `group` object) whose bounds contain `point`, topmost first.
 *
 * Containment is a *group* fact in this model, so a dropped object becomes a child through the
 * canonical `addDrawObjectsToGroup` writer rather than gaining a second, shape-based container rule.
 * The scan is bounded by the page's object list.
 */
export function findDrawContainerAt(
  model: DrawDocumentModel,
  point: DrawPoint,
  options?: { readonly pageId?: string },
): DrawObjectId | null {
  assertDrawDocument(model);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new DrawModelError('stencil-position-invalid');
  const pageId = options?.pageId ?? model.activePageId;
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const scene = projectDrawScene(model, pageId);
  for (const entry of scene.hitOrder) {
    const object = entry.object;
    if (object.type !== 'group') continue;
    if (!entry.visible) continue;
    if (!pointInDrawBounds(point, object)) continue;
    return object.id;
  }
  return null;
}
