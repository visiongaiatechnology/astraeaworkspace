// STATUS: DIAMANT VGT SUPREME — Astraea Draw document/page/layer/group engine
import type {
  DrawBounds, DrawDocumentModel, DrawGuide, DrawLayer, DrawObject, DrawObjectId,
  DrawPage, DrawPoint, DrawStencilDefinition, DrawStencilLibrary,
} from '../../../shared/contracts/draw/workspaceDraw';

import {
  MAX_PAGES, MAX_LAYERS, MAX_OBJECTS, MAX_STENCIL_LIBRARIES, MIN_GRID, MAX_GRID, MAX_GUIDES,
  DrawModelError, finite, bounded, safeId, safeText, isRecord, assertBoolean, assertUniqueIds,
  collectIds, assertPoint, assertDrawObject, assertStencilLibrary, assertDrawDocument,
} from './drawDocumentValidation';
export { DrawModelError, assertDrawDocument };

const MAX_STENCIL_BYTES = 8 * 1024 * 1024;
function assertUtf8Size(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new DrawModelError('stencil-serialized-invalid');
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index += 1; }
      else bytes += 3;
    } else bytes += 3;
    if (bytes > MAX_STENCIL_BYTES) throw new DrawModelError('stencil-library-too-large');
  }
}
function serializeStencil(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    assertUtf8Size(serialized);
    return serialized;
  } catch (error) {
    if (error instanceof DrawModelError) throw error;
    throw new DrawModelError('stencil-serialization-invalid');
  }
}
const clone = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    throw new DrawModelError('clone-failed');
  }
};

function defaultLayer(): DrawLayer {
  return { id: 'layer-main', name: 'Main', visible: true, locked: false, printable: true, order: 0 };
}
function defaultPage(): DrawPage {
  return { id: 'page-1', name: 'Page 1', width: 1122, height: 793, orientation: 'landscape', printableBounds: { x: 32, y: 32, width: 1058, height: 729 }, objectIds: [], layerIds: ['layer-main'] };
}
export function createEmptyDrawDocument(): DrawDocumentModel {
  const page = defaultPage();
  return {
    schemaVersion: 1,
    canvasMode: 'pages',
    activePageId: page.id,
    pages: [page],
    layers: [defaultLayer()],
    objects: {},
    viewport: { zoom: 1, panX: 0, panY: 0, showMiniMap: true, showGrid: true, gridSize: 16, showRulers: true, guides: [], snapToGrid: true, snapToShapes: true, snapToGuides: true, snapTolerance: 8 },
    stencils: [],
    dataBindings: [],
    revision: 1,
  };
}

export function transactDraw(model: DrawDocumentModel, mutate: (draft: DrawDocumentModel) => void): DrawDocumentModel {
  assertDrawDocument(model);
  if (typeof mutate !== 'function') throw new DrawModelError('mutation-invalid');
  const draft = clone(model);
  mutate(draft);
  const currentRevision = Math.max(model.revision, draft.revision);
  if (!Number.isSafeInteger(currentRevision) || currentRevision >= Number.MAX_SAFE_INTEGER) throw new DrawModelError('revision-exhausted');
  draft.revision = currentRevision + 1;
  assertDrawDocument(draft);
  return draft;
}

export function addDrawPage(model: DrawDocumentModel, page: DrawPage): DrawDocumentModel {
  return transactDraw(model, (draft) => { if (draft.pages.length >= MAX_PAGES) throw new DrawModelError('page-limit'); draft.pages.push(clone(page)); draft.activePageId = page.id; });
}
export function reorderDrawPages(model: DrawDocumentModel, orderedIds: readonly string[]): DrawDocumentModel {
  if (orderedIds.length !== model.pages.length || new Set(orderedIds).size !== orderedIds.length) throw new DrawModelError('page-order-invalid');
  const byId = new Map(model.pages.map((page) => [page.id, page]));
  if (orderedIds.some((id) => !byId.has(id))) throw new DrawModelError('page-order-unknown');
  return transactDraw(model, (draft) => { const m = new Map(draft.pages.map((p) => [p.id, p])); draft.pages = orderedIds.map((id) => m.get(id)!); });
}
export function upsertDrawLayer(model: DrawDocumentModel, layer: DrawLayer, pageIds: readonly string[]): DrawDocumentModel {
  if (!isRecord(layer)) throw new DrawModelError('layer-invalid');
  safeId(layer.id, 'layer-id-invalid');
  safeText(layer.name, 'layer-name-invalid');
  assertBoolean(layer.visible, 'layer-visibility-invalid');
  assertBoolean(layer.locked, 'layer-lock-invalid');
  assertBoolean(layer.printable, 'layer-printable-invalid');
  finite(layer.order, 'layer-order-invalid');
  const targetPageIds = assertUniqueIds(pageIds, MAX_PAGES, 'layer-page-list-invalid');
  return transactDraw(model, (draft) => {
    const idx = draft.layers.findIndex((candidate) => candidate.id === layer.id);
    if (idx >= 0) draft.layers[idx] = clone(layer); else { if (draft.layers.length >= MAX_LAYERS) throw new DrawModelError('layer-limit'); draft.layers.push(clone(layer)); }
    for (const pageId of targetPageIds) { const page = draft.pages.find((p) => p.id === pageId); if (!page) throw new DrawModelError('layer-page-missing'); if (!page.layerIds.includes(layer.id)) page.layerIds.push(layer.id); }
  });
}
export function reorderDrawLayers(model: DrawDocumentModel, pageId: string, orderedLayerIds: readonly string[]): DrawDocumentModel {
  return transactDraw(model, (draft) => { const page = draft.pages.find((p) => p.id === pageId); if (!page) throw new DrawModelError('page-missing'); if (new Set(orderedLayerIds).size !== orderedLayerIds.length || orderedLayerIds.some((id) => !page.layerIds.includes(id))) throw new DrawModelError('layer-order-invalid'); page.layerIds = [...orderedLayerIds]; draft.layers.forEach((layer) => { const i = page.layerIds.indexOf(layer.id); if (i >= 0) layer.order = i; }); });
}
export function upsertDrawObject(model: DrawDocumentModel, object: DrawObject): DrawDocumentModel {
  assertDrawObject(object);
  return transactDraw(model, (draft) => {
    const page = draft.pages.find((candidate) => candidate.id === object.pageId);
    if (!page) throw new DrawModelError('object-page-missing');
    if (!page.layerIds.includes(object.layerId)) throw new DrawModelError('object-layer-missing');
    const existing = draft.objects[object.id];
    if (existing && existing.type !== object.type) throw new DrawModelError('object-identity-type-change');
    if (existing && existing.pageId !== object.pageId) {
      if (existing.parentGroupId || (existing.type === 'group' && existing.childIds?.length)) throw new DrawModelError('grouped-object-move-invalid');
      const oldPage = draft.pages.find((candidate) => candidate.id === existing.pageId);
      if (!oldPage) throw new DrawModelError('object-page-missing');
      oldPage.objectIds = oldPage.objectIds.filter((id) => id !== object.id);
    }
    draft.objects[object.id] = clone(object);
    if (!page.objectIds.includes(object.id)) page.objectIds.push(object.id);
  });
}
export function removeDrawObjects(model: DrawDocumentModel, ids: readonly DrawObjectId[]): DrawDocumentModel {
  const removing = collectIds(ids, MAX_OBJECTS, 'object-removal-list-invalid');
  return transactDraw(model, (draft) => {
    for (const [id, object] of Object.entries(draft.objects)) {
      if (object.type === 'connector' && object.connector && (removing.has(object.connector.from.objectId) || removing.has(object.connector.to.objectId))) removing.add(id);
    }
    for (const id of removing) delete draft.objects[id];
    for (const page of draft.pages) page.objectIds = page.objectIds.filter((id) => !removing.has(id));
    for (const object of Object.values(draft.objects)) {
      if (object.childIds) object.childIds = object.childIds.filter((id) => !removing.has(id));
      if (object.parentGroupId && removing.has(object.parentGroupId)) delete object.parentGroupId;
    }
    draft.dataBindings = draft.dataBindings.filter((binding) => !removing.has(binding.objectId));
  });
}

export function groupDrawObjects(model: DrawDocumentModel, group: DrawObject, childIds: readonly string[]): DrawDocumentModel {
  assertDrawObject(group);
  const childrenToGroup = assertUniqueIds(childIds, MAX_OBJECTS, 'group-invalid');
  if (group.type !== 'group' || childrenToGroup.size < 1) throw new DrawModelError('group-invalid');
  return transactDraw(model, (draft) => {
    if (draft.objects[group.id]) throw new DrawModelError('group-object-exists');
    const page = draft.pages.find((p) => p.id === group.pageId); if (!page) throw new DrawModelError('group-page-missing');
    const children = [...childrenToGroup].map((id) => draft.objects[id]);
    if (children.some((child) => !child || child.pageId !== group.pageId)) throw new DrawModelError('group-cross-page');
    draft.objects[group.id] = { ...clone(group), childIds: [...childrenToGroup] };
    if (!page.objectIds.includes(group.id)) page.objectIds.push(group.id);
    for (const child of children) {
      if (!child) throw new DrawModelError('group-child-missing');
      if (child.parentGroupId) {
        const previousParent = draft.objects[child.parentGroupId];
        if (!previousParent || previousParent.type !== 'group') throw new DrawModelError('group-parent-invalid');
        previousParent.childIds = (previousParent.childIds ?? []).filter((id) => id !== child.id);
      }
      child.parentGroupId = group.id;
    }
  });
}

/**
 * Adds objects to an **existing** group/container. `groupDrawObjects` can only create a new group, so
 * dropping a shape onto a container needs this second entry point; it applies the same rules
 * (same page, no self-parenting, re-parenting detaches from the previous group).
 */
export function addDrawObjectsToGroup(
  model: DrawDocumentModel,
  groupId: string,
  childIds: readonly DrawObjectId[],
): DrawDocumentModel {
  const group = model.objects[safeId(groupId, 'group-id-invalid')];
  if (!group || group.type !== 'group') throw new DrawModelError('group-missing');
  const childrenToAdd = assertUniqueIds(childIds, MAX_OBJECTS, 'group-invalid');
  if (childrenToAdd.has(groupId)) throw new DrawModelError('group-self-reference');
  if (childrenToAdd.size === 0) throw new DrawModelError('group-invalid');
  return transactDraw(model, (draft) => {
    const target = draft.objects[groupId];
    if (!target || target.type !== 'group') throw new DrawModelError('group-missing');
    for (const id of childrenToAdd) {
      const child = draft.objects[id];
      if (!child) throw new DrawModelError('group-child-missing');
      if (child.pageId !== target.pageId) throw new DrawModelError('group-cross-page');
      if (child.type === 'connector') throw new DrawModelError('group-connector-invalid');
      if (child.parentGroupId === groupId) continue;
      if (child.parentGroupId) {
        const previousParent = draft.objects[child.parentGroupId];
        if (!previousParent || previousParent.type !== 'group') throw new DrawModelError('group-parent-invalid');
        previousParent.childIds = (previousParent.childIds ?? []).filter((id2) => id2 !== child.id);
      }
      child.parentGroupId = groupId;
      if (!target.childIds) target.childIds = [];
      if (!target.childIds.includes(child.id)) target.childIds.push(child.id);
    }
    // Guard against a cycle introduced by a stale parent chain.
    const visited = new Set<string>([groupId]);
    let current = target.parentGroupId;
    while (current) {
      if (visited.has(current)) throw new DrawModelError('group-cycle');
      visited.add(current);
      current = draft.objects[current]?.parentGroupId;
    }
  });
}

export function ungroupDrawObject(model: DrawDocumentModel, groupId: string): DrawDocumentModel {  safeId(groupId);
  const group = model.objects[groupId]; if (!group || group.type !== 'group') throw new DrawModelError('group-missing');
  if (Object.values(model.objects).some((object) => object.type === 'connector' && object.connector && (object.connector.from.objectId === groupId || object.connector.to.objectId === groupId))) {
    throw new DrawModelError('group-has-connected-connectors');
  }
  return transactDraw(model, (draft) => {
    const current = draft.objects[groupId];
    for (const id of current.childIds ?? []) if (draft.objects[id]) delete draft.objects[id].parentGroupId;
    if (current.parentGroupId) {
      const parent = draft.objects[current.parentGroupId];
      if (parent?.type === 'group') parent.childIds = (parent.childIds ?? []).filter((id) => id !== groupId);
    }
    delete draft.objects[groupId];
    for (const page of draft.pages) page.objectIds = page.objectIds.filter((id) => id !== groupId);
  });
}

export function setDrawGuides(model: DrawDocumentModel, guides: readonly DrawGuide[]): DrawDocumentModel {
  if (!Array.isArray(guides) || guides.length > MAX_GUIDES) throw new DrawModelError('guide-limit');
  const guideIds = new Set<string>();
  for (const guide of guides) {
    if (!isRecord(guide)) throw new DrawModelError('guide-invalid');
    const id = safeId(guide.id, 'guide-id-invalid');
    if (guideIds.has(id)) throw new DrawModelError('guide-id-duplicate');
    guideIds.add(id);
    if (guide.axis !== 'x' && guide.axis !== 'y') throw new DrawModelError('guide-axis-invalid');
    finite(guide.position as number, 'guide-position');
  }
  return transactDraw(model, (draft) => { draft.viewport.guides = clone([...guides]); });
}

/**
 * Guide creation/removal/move. `setDrawGuides` remains the only validator and writer, so a guide keeps
 * exactly one owner; these helpers only build the next immutable list.
 */
export function addDrawGuide(model: DrawDocumentModel, axis: 'x' | 'y', position: number): DrawDocumentModel {
  safeId(model.activePageId, 'page-id-invalid');
  if (axis !== 'x' && axis !== 'y') throw new DrawModelError('guide-axis-invalid');
  finite(position, 'guide-position');
  if (model.viewport.guides.length >= MAX_GUIDES) throw new DrawModelError('guide-limit');
  const ids = new Set(model.viewport.guides.map((guide) => guide.id));
  let index = model.viewport.guides.length + 1;
  let id = `guide-${axis}-${index}`;
  while (ids.has(id)) { index += 1; id = `guide-${axis}-${index}`; }
  return setDrawGuides(model, [...model.viewport.guides, { id, axis, position }]);
}

export function removeDrawGuide(model: DrawDocumentModel, guideId: string): DrawDocumentModel {
  safeId(guideId, 'guide-id-invalid');
  if (!model.viewport.guides.some((guide) => guide.id === guideId)) throw new DrawModelError('guide-missing');
  return setDrawGuides(model, model.viewport.guides.filter((guide) => guide.id !== guideId));
}

export function moveDrawGuide(model: DrawDocumentModel, guideId: string, position: number): DrawDocumentModel {
  safeId(guideId, 'guide-id-invalid');
  finite(position, 'guide-position');
  if (!model.viewport.guides.some((guide) => guide.id === guideId)) throw new DrawModelError('guide-missing');
  return setDrawGuides(model, model.viewport.guides.map((guide) => (guide.id === guideId ? { ...guide, position } : { ...guide })));
}

export function snapDrawPoint(model: DrawDocumentModel, pageId: string, point: DrawPoint, movingObjectIds: ReadonlySet<string> = new Set()): DrawPoint {
  safeId(pageId, 'page-id-invalid');
  assertPoint(point, 'snap-point-invalid');
  if (!(movingObjectIds instanceof Set)) throw new DrawModelError('moving-object-set-invalid');
  const page = model.pages.find((p) => p.id === pageId); if (!page) throw new DrawModelError('page-missing');
  const v = model.viewport;
  const tolerance = bounded(v.snapTolerance, 0, 256, 'snap-range');
  const gridSize = bounded(v.gridSize, MIN_GRID, MAX_GRID, 'grid-range');
  let x = point.x, y = point.y, xDelta = tolerance + Number.EPSILON, yDelta = tolerance + Number.EPSILON;
  const considerX = (candidate: number): void => {
    const delta = Math.abs(candidate - point.x);
    if (delta <= tolerance && delta < xDelta) { x = candidate; xDelta = delta; }
  };
  const considerY = (candidate: number): void => {
    const delta = Math.abs(candidate - point.y);
    if (delta <= tolerance && delta < yDelta) { y = candidate; yDelta = delta; }
  };
  if (v.snapToGrid) { considerX(Math.round(point.x / gridSize) * gridSize); considerY(Math.round(point.y / gridSize) * gridSize); }
  if (v.snapToGuides) for (const guide of v.guides) (guide.axis === 'x' ? considerX : considerY)(guide.position);
  if (v.snapToShapes) for (const id of page.objectIds) {
    if (movingObjectIds.has(id)) continue;
    const object = model.objects[id];
    if (!object || object.type === 'connector') continue;
    considerX(object.x); considerX(object.x + object.width / 2); considerX(object.x + object.width);
    considerY(object.y); considerY(object.y + object.height / 2); considerY(object.y + object.height);
  }
  return { x, y };
}

export function selectionBounds(model: DrawDocumentModel, ids: readonly string[]): DrawBounds {
  if (!Array.isArray(ids) || ids.length > MAX_OBJECTS) throw new DrawModelError('selection-limit');
  if (!ids.length) throw new DrawModelError('selection-empty');
  let x1 = Number.POSITIVE_INFINITY, y1 = Number.POSITIVE_INFINITY;
  let x2 = Number.NEGATIVE_INFINITY, y2 = Number.NEGATIVE_INFINITY;
  for (const rawId of ids) {
    const id = safeId(rawId, 'selection-id-invalid');
    const object = model.objects[id];
    if (!object) continue;
    x1 = Math.min(x1, object.x);
    y1 = Math.min(y1, object.y);
    x2 = Math.max(x2, object.x + object.width);
    y2 = Math.max(y2, object.y + object.height);
  }
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) throw new DrawModelError('selection-empty');
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function installStencilLibrary(model: DrawDocumentModel, library: DrawStencilLibrary): DrawDocumentModel {
  assertDrawDocument(model);
  assertStencilLibrary(library);
  serializeStencil(library);
  if (model.stencils.length >= MAX_STENCIL_LIBRARIES && !model.stencils.some((candidate) => candidate.id === library.id)) throw new DrawModelError('stencil-library-limit');
  return transactDraw(model, (draft) => {
    const i = draft.stencils.findIndex((candidate) => candidate.id === library.id);
    if (i >= 0) draft.stencils[i] = clone(library);
    else draft.stencils.push(clone(library));
  });
}
export function exportStencilLibrary(model: DrawDocumentModel, libraryId: string): string {
  assertDrawDocument(model);
  safeId(libraryId);
  const library = model.stencils.find((candidate) => candidate.id === libraryId);
  if (!library) throw new DrawModelError('stencil-library-missing');
  return serializeStencil({ format: 'VGT_DRAW_STENCIL_V1', library });
}
export function importStencilLibrary(serialized: string): DrawStencilLibrary {
  assertUtf8Size(serialized);
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new DrawModelError('stencil-format-invalid');
  }
  if (!isRecord(parsed) || parsed.format !== 'VGT_DRAW_STENCIL_V1') throw new DrawModelError('stencil-format-invalid');
  assertStencilLibrary(parsed.library);
  return clone(parsed.library);
}
export function searchStencils(model: DrawDocumentModel, query: string, category?: string): DrawStencilDefinition[] {
  safeText(query, 'stencil-query-invalid');
  if (category !== undefined) safeText(category, 'stencil-category-invalid');
  const q = query.trim().toLocaleLowerCase('en-US'); const out: DrawStencilDefinition[] = [];
  for (const library of model.stencils) for (const stencil of library.stencils) {
    if (category && stencil.category !== category) continue;
    const hay = `${stencil.name} ${stencil.category} ${stencil.tags.join(' ')}`.toLocaleLowerCase('en-US'); if (!q || hay.includes(q)) out.push(clone(stencil)); if (out.length >= 512) return out;
  }
  return out;
}
