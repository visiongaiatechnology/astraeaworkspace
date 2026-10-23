// STATUS: PLATIN — bounded Draw layer operations composed from the canonical document engine.
import type { DrawDocumentModel, DrawLayer, DrawObject, DrawObjectId } from '../../../shared/contracts/draw/workspaceDraw';
import {
  DrawModelError,
  assertDrawDocument,
  reorderDrawLayers,
  transactDraw,
  upsertDrawLayer,
} from '../model/drawDocumentEngine';
import { MAX_OBJECTS, safeId } from '../model/drawDocumentValidation';
import { projectDrawScene } from './drawSceneProjection';
import { expandDrawSelection } from './drawHitTest';

export function resolvePageLayers(model: DrawDocumentModel, pageId: string = model.activePageId): DrawLayer[] {
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  return page.layerIds
    .map((id) => model.layers.find((layer) => layer.id === id))
    .filter((layer): layer is DrawLayer => Boolean(layer));
}

function requireLayer(model: DrawDocumentModel, layerId: string): DrawLayer {
  safeId(layerId, 'layer-id-invalid');
  const layer = model.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new DrawModelError('layer-missing');
  return layer;
}

function pageOfLayer(model: DrawDocumentModel, layerId: string, preferredPageId?: string): string {
  if (preferredPageId) {
    const page = model.pages.find((candidate) => candidate.id === preferredPageId);
    if (page && page.layerIds.includes(layerId)) return page.id;
  }
  const page = model.pages.find((candidate) => candidate.layerIds.includes(layerId));
  if (!page) throw new DrawModelError('layer-page-missing');
  return page.id;
}

/** Uses the canonical `upsertDrawLayer` writer so layer facts keep exactly one owner. */
export function setDrawLayerVisibility(model: DrawDocumentModel, layerId: string, visible: boolean): DrawDocumentModel {
  if (typeof visible !== 'boolean') throw new DrawModelError('layer-visibility-invalid');
  const layer = requireLayer(model, layerId);
  return upsertDrawLayer(model, { ...layer, visible }, [pageOfLayer(model, layerId)]);
}

export function setDrawLayerLock(model: DrawDocumentModel, layerId: string, locked: boolean): DrawDocumentModel {
  if (typeof locked !== 'boolean') throw new DrawModelError('layer-lock-invalid');
  const layer = requireLayer(model, layerId);
  return upsertDrawLayer(model, { ...layer, locked }, [pageOfLayer(model, layerId)]);
}

export function setDrawLayerPrintable(model: DrawDocumentModel, layerId: string, printable: boolean): DrawDocumentModel {
  if (typeof printable !== 'boolean') throw new DrawModelError('layer-printable-invalid');
  const layer = requireLayer(model, layerId);
  return upsertDrawLayer(model, { ...layer, printable }, [pageOfLayer(model, layerId)]);
}

export function renameDrawLayer(model: DrawDocumentModel, layerId: string, name: string): DrawDocumentModel {
  const layer = requireLayer(model, layerId);
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 512) throw new DrawModelError('layer-name-invalid');
  return upsertDrawLayer(model, { ...layer, name }, [pageOfLayer(model, layerId)]);
}

/** Moves a page layer one step up (`direction: 1`) or down (`-1`) in the paint stack. */
export function stepDrawLayerOrder(
  model: DrawDocumentModel,
  pageId: string,
  layerId: string,
  direction: 1 | -1,
): DrawDocumentModel {
  assertDrawDocument(model);
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const index = page.layerIds.indexOf(layerId);
  if (index < 0) throw new DrawModelError('layer-missing');
  const target = index + direction;
  if (target < 0 || target >= page.layerIds.length) return model;
  const ordered = [...page.layerIds];
  const [moved] = ordered.splice(index, 1);
  if (moved === undefined) throw new DrawModelError('layer-missing');
  ordered.splice(target, 0, moved);
  return reorderDrawLayers(model, pageId, ordered);
}

export interface DrawLayerMoveResult {
  readonly model: DrawDocumentModel;
  readonly movedIds: readonly DrawObjectId[];
}

/**
 * Moves a selection (including group descendants and connectors whose both endpoints move) onto
 * another layer of the same page. Connector endpoints are ids, so links stay stable across the move.
 */
export function moveDrawObjectsToLayer(
  model: DrawDocumentModel,
  ids: readonly DrawObjectId[],
  layerId: string,
): DrawLayerMoveResult {
  assertDrawDocument(model);
  const layer = requireLayer(model, layerId);
  if (layer.locked) throw new DrawModelError('layer-locked');
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_OBJECTS) throw new DrawModelError('selection-empty');
  const pageId = pageOfLayer(model, layerId);

  const scene = projectDrawScene(model, pageId);
  const roots = ids.filter((id) => scene.byId.has(id));
  if (roots.length === 0) throw new DrawModelError('selection-empty');
  const expanded = new Set(expandDrawSelection(scene, roots));
  for (const id of expanded) {
    const entry = scene.byId.get(id);
    if (!entry) throw new DrawModelError('selection-stale');
    if (entry.locked) throw new DrawModelError('object-locked');
  }
  for (const [objectId, object] of Object.entries(model.objects)) {
    if (object.type !== 'connector' || !object.connector) continue;
    if (object.pageId !== pageId) continue;
    if (expanded.has(object.connector.from.objectId) && expanded.has(object.connector.to.objectId)) expanded.add(objectId);
  }

  const next = transactDraw(model, (draft) => {
    for (const id of expanded) {
      const object = draft.objects[id];
      if (!object) continue;
      object.layerId = layerId;
    }
  });
  return { model: next, movedIds: [...expanded] };
}

/** Objects that would move together with `id`, used by the layer panel counts. */
export function countDrawLayerObjects(model: DrawDocumentModel, pageId: string, layerId: string): number {
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  let count = 0;
  for (const id of page.objectIds) {
    const object: DrawObject | undefined = model.objects[id];
    if (object && object.layerId === layerId) count += 1;
  }
  return count;
}

export function isDrawLayerOrderMutable(model: DrawDocumentModel, pageId: string, layerId: string, direction: 1 | -1): boolean {
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const index = page.layerIds.indexOf(layerId);
  if (index < 0) return false;
  const target = index + direction;
  return target >= 0 && target < page.layerIds.length;
}
