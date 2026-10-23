// STATUS: PLATIN — Draw edit commands; every mutation is delegated to an existing canonical engine.
import type {
  DrawBounds, DrawDocumentModel, DrawObject, DrawObjectId, DrawPoint, DrawVectorStyle,
} from '../../../shared/contracts/draw/workspaceDraw';
import {
  DrawModelError,
  addDrawObjectsToGroup,
  assertDrawDocument,
  groupDrawObjects,
  removeDrawObjects,
  selectionBounds,
  snapDrawPoint,
  ungroupDrawObject,
  upsertDrawObject,
} from '../model/drawDocumentEngine';
import { MAX_OBJECTS, safeId } from '../model/drawDocumentValidation';
import {
  reorderZ,
  setVectorShadow,
  transformDrawObjects,
  updateVectorStyle,
  type TransformOperation,
  type ZOrderAction,
} from '../model/drawVectorEngine';
import { projectDrawScene, type DrawScene } from './drawSceneProjection';
import { expandDrawSelection, resolveDrawSelectionRoot } from './drawHitTest';
import {
  resizeDrawObjectTo,
  rotateDrawObjectTo,
  translateDrawObject,
  type DrawResizeOptions,
  type DrawRotateOptions,
} from './drawTransformEngine';
import type { DrawResizeHandle } from './drawGeometry';
import { setDrawObjectPlainText, applyDrawObjectTypography, type DrawTextEditOptions, type DrawTypographyPatch } from './drawTextLayout';
import { instantiateDrawStencil } from './drawStencilCatalog';
import { buildDrawSpatialIndex, queryDrawSpatialIndex } from './drawSpatialIndex';

export interface DrawCommandOptions {
  /** Extra objects that must be ignored by snapping, on top of the selection itself. */
  readonly ignoreIds?: ReadonlySet<DrawObjectId>;
  /**
   * Set to false for keyboard nudges: the arrow-key step is already grid-derived, so re-snapping
   * would silently shrink the move and make the keyboard path non-deterministic.
   */
  readonly snap?: boolean;
}

function requireScene(model: DrawDocumentModel, pageId: string): DrawScene {
  return projectDrawScene(model, pageId);
}

function writableIds(scene: DrawScene, ids: readonly DrawObjectId[]): DrawObjectId[] {
  if (!Array.isArray(ids) || ids.length === 0) throw new DrawModelError('selection-empty');
  if (ids.length > MAX_OBJECTS) throw new DrawModelError('selection-limit');
  const expanded = expandDrawSelection(scene, ids.filter((id) => scene.byId.has(id)));
  if (expanded.length === 0) throw new DrawModelError('selection-empty');
  for (const id of expanded) {
    const entry = scene.byId.get(id);
    if (!entry) throw new DrawModelError('selection-stale');
    if (entry.locked) throw new DrawModelError('object-locked');
  }
  return expanded;
}

function upsertMany(model: DrawDocumentModel, objects: readonly DrawObject[]): DrawDocumentModel {
  let next = model;
  for (const object of objects) next = upsertDrawObject(next, object);
  return next;
}

/**
 * Bounded snap candidate view: the page's object list is narrowed with the spatial index before the
 * canonical `snapDrawPoint` rule runs, so behaviour is identical while the work stays bounded.
 */
export function snapDrawPointBounded(
  model: DrawDocumentModel,
  pageId: string,
  point: DrawPoint,
  movingIds: ReadonlySet<DrawObjectId>,
  tolerance: number,
): DrawPoint {
  const scene = requireScene(model, pageId);
  if (scene.entries.length <= 64) return snapDrawPoint(model, pageId, point, movingIds);

  const index = buildDrawSpatialIndex(scene, scene.entries);
  const near = queryDrawSpatialIndex(
    index,
    { x: point.x - tolerance, y: point.y - tolerance, width: tolerance * 2, height: tolerance * 2 },
    scene.entries.length,
  );
  const candidateIds = new Set(near);
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const narrowed = { ...page, objectIds: page.objectIds.filter((id) => candidateIds.has(id)) };
  const view: DrawDocumentModel = { ...model, pages: model.pages.map((candidate) => (candidate.id === pageId ? narrowed : candidate)) };
  return snapDrawPoint(view, pageId, point, movingIds);
}

export interface DrawMoveResult {
  readonly model: DrawDocumentModel;
  readonly applied: DrawPoint;
  readonly snapped: boolean;
}

/** Drag / arrow-key translation. Returns the delta snapping actually accepted. */
export function moveDrawObjects(
  model: DrawDocumentModel,
  ids: readonly DrawObjectId[],
  delta: DrawPoint,
  options?: DrawCommandOptions,
): DrawMoveResult {
  assertDrawDocument(model);
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) throw new DrawModelError('translate-delta-invalid');
  const pageId = model.activePageId;
  const scene = requireScene(model, pageId);
  const moving = writableIds(scene, ids);
  const movingSet = new Set(moving);
  for (const id of options?.ignoreIds ?? []) movingSet.add(id);

  const anchor = scene.byId.get(moving[0]!);
  if (!anchor) throw new DrawModelError('selection-stale');
  const snappingEnabled = options?.snap !== false
    && (model.viewport.snapToGrid || model.viewport.snapToShapes || model.viewport.snapToGuides);
  const tolerance = Math.max(0, model.viewport.snapTolerance);
  const target = { x: anchor.object.x + delta.x, y: anchor.object.y + delta.y };
  const snapped = snappingEnabled
    ? snapDrawPointBounded(model, pageId, target, movingSet, tolerance)
    : target;
  const applied = { x: snapped.x - anchor.object.x, y: snapped.y - anchor.object.y };

  const objects = moving
    .map((id) => scene.byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => translateDrawObject(entry.object, applied));
  return {
    model: upsertMany(model, objects),
    applied,
    snapped: applied.x !== delta.x || applied.y !== delta.y,
  };
}

export function resizeDrawObjects(
  model: DrawDocumentModel,
  objectId: DrawObjectId,
  handle: DrawResizeHandle,
  target: DrawPoint,
  options?: DrawResizeOptions,
): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const expanded = writableIds(scene, [objectId]);
  if (expanded.length !== 1) throw new DrawModelError('resize-group-unsupported');
  const entry = scene.byId.get(objectId);
  if (!entry) throw new DrawModelError('selection-stale');
  const resized = resizeDrawObjectTo(entry.object, handle, target, options);
  return upsertDrawObject(model, resized);
}

export function rotateDrawObjects(
  model: DrawDocumentModel,
  objectId: DrawObjectId,
  pointer: DrawPoint,
  options?: DrawRotateOptions,
): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const expanded = writableIds(scene, [objectId]);
  if (expanded.length !== 1) throw new DrawModelError('rotate-group-unsupported');
  const entry = scene.byId.get(objectId);
  if (!entry) throw new DrawModelError('selection-stale');
  return upsertDrawObject(model, rotateDrawObjectTo(entry.object, pointer, options));
}

export function deleteDrawObjects(model: DrawDocumentModel, ids: readonly DrawObjectId[]): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const roots = [...new Set(ids.map((id) => resolveDrawSelectionRoot(scene, id)).filter((id) => scene.byId.has(id)))];
  if (roots.length === 0) throw new DrawModelError('selection-empty');
  // Deletion is allowed for locked objects only through an explicit unlock; fail closed instead.
  for (const id of roots) {
    const entry = scene.byId.get(id);
    if (entry?.locked) throw new DrawModelError('object-locked');
  }
  return removeDrawObjects(model, roots);
}

export function groupDrawSelection(model: DrawDocumentModel, ids: readonly DrawObjectId[], name?: string): DrawDocumentModel {
  assertDrawDocument(model);
  const scene: DrawScene = requireScene(model, model.activePageId);
  const roots = [...new Set(ids.map((id) => resolveDrawSelectionRoot(scene, id)))];
  const writable = writableIds(scene, roots);
  if (writable.length < 2) throw new DrawModelError('group-needs-two-objects');
  const bounds = selectionBounds(model, writable);
  const page = model.pages.find((candidate) => candidate.id === model.activePageId);
  if (!page) throw new DrawModelError('page-missing');
  const highest = page.objectIds.reduce((maximum, id) => Math.max(maximum, model.objects[id]?.zIndex ?? -1), -1);
  const first = scene.byId.get(writable[0]!);
  if (!first) throw new DrawModelError('selection-stale');
  const label = name && name.trim().length > 0
    ? name.trim()
    : `Group ${Object.values(model.objects).filter((object) => object.type === 'group').length + 1}`;
  const container: DrawObject = {
    id: `group-${model.revision + 1}-${writable.length}`,
    pageId: model.activePageId,
    layerId: first.object.layerId,
    type: 'group',
    name: label,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: highest + 1,
  };
  return groupDrawObjects(model, container, writable);
}

export function ungroupDrawSelection(model: DrawDocumentModel, ids: readonly DrawObjectId[]): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const groupIds = ids.filter((id) => scene.byId.get(id)?.object.type === 'group');
  if (groupIds.length === 0) throw new DrawModelError('group-missing');
  let next = model;
  for (const id of groupIds) next = ungroupDrawObject(next, id);
  return next;
}

export function applyDrawZOrder(
  model: DrawDocumentModel,
  ids: readonly DrawObjectId[],
  action: ZOrderAction,
): DrawDocumentModel {
  assertDrawDocument(model);
  const page = model.pages.find((candidate) => candidate.id === model.activePageId);
  if (!page) throw new DrawModelError('page-missing');
  const scene = requireScene(model, model.activePageId);
  const targets = ids.filter((id) => scene.byId.has(id));
  if (targets.length === 0) throw new DrawModelError('selection-empty');
  const pageObjects = page.objectIds
    .map((id) => model.objects[id])
    .filter((object): object is DrawObject => Boolean(object));
  const reordered = reorderZ(pageObjects, targets, action);
  return upsertMany(model, reordered);
}

export function applyDrawStylePatch(
  model: DrawDocumentModel,
  ids: readonly DrawObjectId[],
  patch: Partial<DrawVectorStyle>,
): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const targets = ids.filter((id) => scene.byId.has(id));
  if (targets.length === 0) throw new DrawModelError('selection-empty');
  const objects: DrawObject[] = [];
  for (const id of targets) {
    const entry = scene.byId.get(id);
    if (!entry) continue;
    if (entry.locked) throw new DrawModelError('object-locked');
    if (entry.object.type === 'shape' && entry.object.vector) {
      objects.push(updateVectorStyle(entry.object, patch));
    } else if (typeof patch.opacity === 'number') {
      objects.push({ ...entry.object, opacity: patch.opacity });
    } else {
      throw new DrawModelError('shape-required');
    }
  }
  if (objects.length === 0) throw new DrawModelError('shape-required');
  return upsertMany(model, objects);
}

/** Shape Style Inspector: applies a typography patch through the canonical rich-text writers. */
export function applyDrawTypographyPatch(
  model: DrawDocumentModel,
  ids: readonly DrawObjectId[],
  patch: DrawTypographyPatch,
): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const targets = ids.filter((id) => scene.byId.has(id));
  if (targets.length === 0) throw new DrawModelError('selection-empty');
  const objects: DrawObject[] = [];
  for (const id of targets) {
    const entry = scene.byId.get(id);
    if (!entry) continue;
    if (entry.locked) throw new DrawModelError('object-locked');
    if (entry.object.type === 'connector' || entry.object.type === 'group') throw new DrawModelError('shape-required');
    objects.push(applyDrawObjectTypography(entry.object, patch));
  }
  return upsertMany(model, objects);
}

/** Shape Style Inspector: sets or clears the drop shadow via the canonical style normalizer. */
export function applyDrawShadowPatch(
  model: DrawDocumentModel,
  ids: readonly DrawObjectId[],
  shadow: DrawVectorStyle['shadow'] | undefined,
): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const targets = ids.filter((id) => scene.byId.has(id));
  if (targets.length === 0) throw new DrawModelError('selection-empty');
  const objects: DrawObject[] = [];
  for (const id of targets) {
    const entry = scene.byId.get(id);
    if (!entry) continue;
    if (entry.locked) throw new DrawModelError('object-locked');
    if (entry.object.type !== 'shape' || !entry.object.vector) throw new DrawModelError('shape-required');
    objects.push(setVectorShadow(entry.object, shadow));
  }
  return upsertMany(model, objects);
}

/** Adds the current selection to an existing container (group) without creating a second group. */
export function addDrawSelectionToGroup(
  model: DrawDocumentModel,
  groupId: DrawObjectId,
  ids: readonly DrawObjectId[],
): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const groupEntry = scene.byId.get(groupId);
  if (!groupEntry || groupEntry.object.type !== 'group') throw new DrawModelError('group-missing');
  if (groupEntry.locked) throw new DrawModelError('object-locked');
  const children = ids.filter((id) => id !== groupId && scene.byId.has(id));
  if (children.length === 0) throw new DrawModelError('selection-empty');
  for (const id of children) {
    const entry = scene.byId.get(id);
    if (!entry) throw new DrawModelError('selection-stale');
    if (entry.locked) throw new DrawModelError('object-locked');
  }
  const expanded = expandDrawSelection(scene, children).filter((id) => id !== groupId);
  return addDrawObjectsToGroup(model, groupId, expanded);
}

export function setDrawObjectsLocked(  model: DrawDocumentModel,
  ids: readonly DrawObjectId[],
  locked: boolean,
): DrawDocumentModel {
  assertDrawDocument(model);
  if (typeof locked !== 'boolean') throw new DrawModelError('object-lock-invalid');
  const scene = requireScene(model, model.activePageId);
  const targets = ids.filter((id) => scene.byId.has(id));
  if (targets.length === 0) throw new DrawModelError('selection-empty');
  const objects = targets
    .map((id) => scene.byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => ({ ...entry.object, locked }));
  return upsertMany(model, objects);
}

/** Commits text typed directly on the canvas; reuses the canonical rich-text normalizer. */
export function setDrawObjectText(
  model: DrawDocumentModel,
  objectId: DrawObjectId,
  text: string,
  options?: DrawTextEditOptions,
): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const entry = scene.byId.get(objectId);
  if (!entry) throw new DrawModelError('selection-stale');
  if (entry.locked) throw new DrawModelError('object-locked');
  return upsertDrawObject(model, setDrawObjectPlainText(entry.object, text, options));
}

export function alignDrawObjects(
  model: DrawDocumentModel,
  ids: readonly DrawObjectId[],
  operation: TransformOperation,
  amount?: DrawPoint,
): DrawDocumentModel {
  assertDrawDocument(model);
  const scene = requireScene(model, model.activePageId);
  const targets = writableIds(scene, ids);
  const objects = targets
    .map((id) => scene.byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => entry.object);
  const transformed = operation === 'nudge'
    ? transformDrawObjects(objects, operation, amount ?? { x: 0, y: 0 })
    : transformDrawObjects(objects, operation);
  return upsertMany(model, transformed);
}

export function insertDrawStencil(
  model: DrawDocumentModel,
  stencilId: string,
  position: DrawPoint,
  layerId: string,
  options?: { readonly idSeed?: string },
): DrawDocumentModel {
  assertDrawDocument(model);
  const object = instantiateDrawStencil(model, stencilId, model.activePageId, layerId, position, options);
  return upsertDrawObject(model, object);
}

/** Page bounds of the current selection, used by the toolbar readout. */
export function currentSelectionBounds(model: DrawDocumentModel, ids: readonly DrawObjectId[]): DrawBounds | null {
  const scene = requireScene(model, model.activePageId);
  const present = ids.filter((id) => scene.byId.has(id));
  if (present.length === 0) return null;
  return selectionBounds(model, present);
}

export { safeId };
