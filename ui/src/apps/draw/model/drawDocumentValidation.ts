// STATUS: PLATIN — Draw document runtime validation and integrity checks
import type { DrawBounds, DrawDocumentModel, DrawGuide, DrawLayer, DrawObject, DrawPage, DrawStencilDefinition, DrawStencilLibrary } from '../../../shared/contracts/draw/workspaceDraw';
export const MAX_PAGES = 512;
export const MAX_LAYERS = 256;
export const MAX_OBJECTS = 100_000;
export const MAX_STENCIL_LIBRARIES = 64;
export const MAX_STENCILS_PER_LIBRARY = 4096;
export const MAX_TEXT = 512;
export const MIN_PAGE = 32;
export const MAX_PAGE = 200_000;
export const MIN_GRID = 2;
export const MAX_GRID = 4096;
export const MAX_GUIDES = 2048;

export class DrawModelError extends Error {
  constructor(readonly code: string) { super(`Draw model rejected: ${code}`); this.name = 'DrawModelError'; }
}

export const finite = (v: number, code: string): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new DrawModelError(code); return v; };
export const bounded = (v: number, min: number, max: number, code: string): number => {
  const value = finite(v, code);
  if (value < min || value > max) throw new DrawModelError(code);
  return value;
};
export const safeId = (id: unknown, code = 'invalid-id'): string => {
  if (typeof id !== 'string' || id.length < 1 || id.length > 128 || !/^[A-Za-z0-9._:@-]+$/.test(id)) throw new DrawModelError(code);
  return id;
};
export const safeText = (value: unknown, code = 'text-too-long'): string => {
  if (typeof value !== 'string' || value.length > MAX_TEXT) throw new DrawModelError(code);
  return value;
};
export const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => 'value' in descriptor);
  } catch {
    return false;
  }
};
export const assertBoolean = (value: unknown, code: string): void => { if (typeof value !== 'boolean') throw new DrawModelError(code); };
export const assertUniqueIds = (values: unknown, maximum: number, code: string): Set<string> => {
  if (!Array.isArray(values) || values.length > maximum) throw new DrawModelError(code);
  const ids = new Set<string>();
  for (const value of values) {
    const id = safeId(value, code);
    if (ids.has(id)) throw new DrawModelError(code);
    ids.add(id);
  }
  return ids;
};
export const collectIds = (values: unknown, maximum: number, code: string): Set<string> => {
  if (!Array.isArray(values) || values.length > maximum) throw new DrawModelError(code);
  const ids = new Set<string>();
  for (const value of values) ids.add(safeId(value, code));
  return ids;
};

export function assertPoint(value: unknown, code: string): void {
  if (!isRecord(value)) throw new DrawModelError(code);
  finite(value.x as number, code);
  finite(value.y as number, code);
}

export function assertDrawConnector(value: unknown): asserts value is NonNullable<DrawObject['connector']> {
  if (!isRecord(value) || !isRecord(value.from) || !isRecord(value.to)) throw new DrawModelError('connector-data-missing');
  const connector = value as unknown as NonNullable<DrawObject['connector']>;
  for (const endpoint of [connector.from, connector.to]) {
    safeId(endpoint.objectId, 'connector-endpoint-invalid');
    if (!['auto', 'top', 'right', 'bottom', 'left'].includes(endpoint.anchor) && !(typeof endpoint.anchor === 'string' && /^point:[A-Za-z0-9._:@-]{1,64}$/.test(endpoint.anchor))) {
      throw new DrawModelError('connector-anchor-invalid');
    }
  }
  if (!['straight', 'orthogonal', 'curved', 'custom'].includes(connector.route)) throw new DrawModelError('connector-route-invalid');
  assertBoolean(connector.autoRoute, 'connector-auto-route-invalid');
  assertBoolean(connector.obstacleAvoidance, 'connector-obstacle-avoidance-invalid');
  if (!['none', 'jump'].includes(connector.crossingStyle)) throw new DrawModelError('connector-crossing-style-invalid');
  if (!['none', 'triangle', 'open', 'diamond', 'circle'].includes(connector.arrowStart) || !['none', 'triangle', 'open', 'diamond', 'circle'].includes(connector.arrowEnd)) {
    throw new DrawModelError('connector-arrowhead-invalid');
  }
  bounded(connector.routingPriority, 0, 10_000, 'connector-priority-invalid');
  if (!Array.isArray(connector.waypoints) || connector.waypoints.length > MAX_OBJECTS) throw new DrawModelError('connector-waypoint-limit');
  for (const point of connector.waypoints) assertPoint(point, 'connector-waypoint-invalid');
  if (!isRecord(connector.semantic)) throw new DrawModelError('connector-semantic-invalid');
  for (const field of ['label', 'cardinalityFrom', 'cardinalityTo', 'relationshipType'] as const) {
    const text = connector.semantic[field];
    if (text !== undefined) safeText(text, 'connector-semantic-invalid');
  }
  if (connector.semantic.metadata !== undefined) {
    if (!isRecord(connector.semantic.metadata) || Object.keys(connector.semantic.metadata).length > 128) throw new DrawModelError('connector-metadata-invalid');
    for (const [key, item] of Object.entries(connector.semantic.metadata)) { safeId(key, 'connector-metadata-invalid'); safeText(item, 'connector-metadata-invalid'); }
  }
}

export function assertDrawObject(value: unknown, key?: string): asserts value is DrawObject {
  if (!isRecord(value)) throw new DrawModelError('object-invalid');
  const object = value as unknown as DrawObject;
  safeId(object.id, 'invalid-object-id');
  if (key !== undefined && safeId(key) !== object.id) throw new DrawModelError('object-key-id-mismatch');
  safeId(object.pageId, 'object-page-invalid');
  safeId(object.layerId, 'object-layer-invalid');
  safeText(object.name, 'object-name-invalid');
  if (!['shape', 'connector', 'group', 'frame'].includes(object.type)) throw new DrawModelError('object-type-invalid');
  for (const value of [object.x, object.y, object.width, object.height, object.rotation, object.opacity, object.zIndex]) finite(value, 'object-nonfinite');
  if (object.width < 0 || object.height < 0 || object.opacity < 0 || object.opacity > 1) throw new DrawModelError('object-range');
  assertBoolean(object.flipX, 'object-flip-invalid');
  assertBoolean(object.flipY, 'object-flip-invalid');
  assertBoolean(object.locked, 'object-lock-invalid');
  if (object.parentGroupId !== undefined) safeId(object.parentGroupId, 'group-parent-invalid');
  if (object.childIds !== undefined) {
    assertUniqueIds(object.childIds, MAX_OBJECTS, 'group-child-invalid');
    if (object.type !== 'group' && object.childIds.length > 0) throw new DrawModelError('group-child-type-invalid');
  }
  if (object.type === 'connector') assertDrawConnector(object.connector);
  else if (object.connector !== undefined) throw new DrawModelError('connector-type-invalid');
}

function assertDataBinding(value: unknown): asserts value is DrawDocumentModel['dataBindings'][number] {
  if (!isRecord(value)) throw new DrawModelError('data-binding-invalid');
  const binding = value as unknown as DrawDocumentModel['dataBindings'][number];
  safeId(binding.id, 'binding-id-invalid');
  safeId(binding.objectId, 'binding-object-invalid');
  if (!['grid-range', 'database-record', 'database-query', 'task', 'project', 'insight', 'external-approved'].includes(binding.sourceKind)) {
    throw new DrawModelError('binding-source-invalid');
  }
  if (!['live', 'frozen', 'broken'].includes(binding.mode)) throw new DrawModelError('binding-mode-invalid');
  safeText(binding.sourceUri, 'binding-uri-invalid');
  if (binding.sourceDocumentId !== undefined) safeId(binding.sourceDocumentId, 'binding-document-invalid');
  if (binding.selector !== undefined) safeText(binding.selector, 'binding-selector-invalid');
  if (!Array.isArray(binding.rules) || binding.rules.length > 256) throw new DrawModelError('binding-rule-limit');
  const ruleIds = new Set<string>();
  for (const rawRule of binding.rules) {
    if (!isRecord(rawRule)) throw new DrawModelError('binding-rule-invalid');
    const rule = rawRule as unknown as DrawDocumentModel['dataBindings'][number]['rules'][number];
    safeId(rule.id, 'binding-rule-invalid');
    if (ruleIds.has(rule.id)) throw new DrawModelError('binding-rule-duplicate');
    ruleIds.add(rule.id);
    safeId(rule.sourceField, 'binding-rule-invalid');
    if (!['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'truthy'].includes(rule.operator)) throw new DrawModelError('binding-rule-invalid');
    if (!['fill', 'stroke', 'icon', 'badge', 'data-bar', 'label', 'tooltip', 'x', 'y', 'width', 'height'].includes(rule.target)) throw new DrawModelError('binding-rule-invalid');
    if (typeof rule.value !== 'string' && typeof rule.value !== 'number') throw new DrawModelError('binding-rule-invalid');
    if (typeof rule.value === 'string') safeText(rule.value, 'binding-rule-invalid'); else finite(rule.value, 'binding-rule-invalid');
    if (rule.compareValue !== undefined) {
      if (typeof rule.compareValue === 'string') safeText(rule.compareValue, 'binding-rule-invalid');
      else if (typeof rule.compareValue === 'number') finite(rule.compareValue, 'binding-rule-invalid');
      else if (typeof rule.compareValue !== 'boolean') throw new DrawModelError('binding-rule-invalid');
    }
    assertBoolean(rule.allowGeometryMutation, 'binding-rule-invalid');
  }
  if (binding.frozenSnapshot !== undefined) {
    if (!isRecord(binding.frozenSnapshot) || Object.keys(binding.frozenSnapshot).length > 512) throw new DrawModelError('binding-snapshot-invalid');
    for (const [key, item] of Object.entries(binding.frozenSnapshot)) {
      safeId(key, 'binding-snapshot-invalid');
      if (item === null || typeof item === 'boolean') continue;
      if (typeof item === 'string') safeText(item, 'binding-snapshot-invalid');
      else finite(item as number, 'binding-snapshot-invalid');
    }
  }
  for (const version of [binding.lastSourceVersion, binding.lastRefreshAt]) {
    if (version !== undefined && (!Number.isSafeInteger(version) || version < 0)) throw new DrawModelError('binding-version-invalid');
  }
  if (binding.mode === 'frozen' && binding.frozenSnapshot === undefined) throw new DrawModelError('frozen-snapshot-missing');
  if (binding.mode !== 'frozen' && binding.frozenSnapshot !== undefined) throw new DrawModelError('unexpected-frozen-snapshot');
}

export function assertStencilLibrary(value: unknown): asserts value is DrawStencilLibrary {
  if (!isRecord(value)) throw new DrawModelError('stencil-library-invalid');
  const library = value as unknown as DrawStencilLibrary;
  safeId(library.id, 'stencil-library-id-invalid');
  safeText(library.name, 'stencil-library-name-invalid');
  if (!Number.isSafeInteger(library.version) || library.version < 1) throw new DrawModelError('stencil-library-version-invalid');
  if (!Array.isArray(library.stencils) || library.stencils.length > MAX_STENCILS_PER_LIBRARY) throw new DrawModelError('stencil-limit');
  const ids = new Set<string>();
  for (const rawStencil of library.stencils) {
    if (!isRecord(rawStencil)) throw new DrawModelError('stencil-invalid');
    const stencil = rawStencil as unknown as DrawStencilDefinition;
    safeId(stencil.id, 'stencil-id-invalid');
    if (ids.has(stencil.id)) throw new DrawModelError('stencil-id-duplicate');
    ids.add(stencil.id);
    if (stencil.libraryId !== library.id) throw new DrawModelError('stencil-library-mismatch');
    safeText(stencil.category, 'stencil-category-invalid');
    safeText(stencil.name, 'stencil-name-invalid');
    if (!Array.isArray(stencil.tags) || stencil.tags.length > 64) throw new DrawModelError('stencil-tags-invalid');
    for (const tag of stencil.tags) safeText(tag, 'stencil-tags-invalid');
    if (!isRecord(stencil.objectTemplate)) throw new DrawModelError('stencil-template-invalid');
    assertDrawObject({
      ...stencil.objectTemplate,
      id: 'stencil-template',
      pageId: 'stencil-page',
      layerId: 'stencil-layer',
      zIndex: 0,
    }, 'stencil-template');
  }
}
export function assertDrawDocument(model: DrawDocumentModel): void {
  if (!isRecord(model) || model.schemaVersion !== 1) throw new DrawModelError('unsupported-schema');
  if (!['infinite', 'pages'].includes(model.canvasMode)) throw new DrawModelError('canvas-mode-invalid');
  if (!Array.isArray(model.pages) || model.pages.length < 1 || model.pages.length > MAX_PAGES) throw new DrawModelError('page-limit');
  if (!Array.isArray(model.layers) || model.layers.length < 1 || model.layers.length > MAX_LAYERS) throw new DrawModelError('layer-limit');
  if (!isRecord(model.objects) || !isRecord(model.viewport)) throw new DrawModelError('document-structure-invalid');
  if (!Array.isArray(model.dataBindings) || model.dataBindings.length > MAX_OBJECTS) throw new DrawModelError('data-binding-limit');
  if (!Array.isArray(model.stencils) || model.stencils.length > MAX_STENCIL_LIBRARIES) throw new DrawModelError('stencil-library-limit');
  if (!Number.isSafeInteger(model.revision) || model.revision < 1) throw new DrawModelError('revision-invalid');

  const pages = new Map<string, DrawPage>();
  const pageObjectOwners = new Map<string, string>();
  const pageLayerMembership = new Map<string, Set<string>>();
  for (const rawPage of model.pages as unknown[]) {
    if (!isRecord(rawPage)) throw new DrawModelError('page-invalid');
    const page = rawPage as unknown as DrawPage;
    const id = safeId(page.id, 'page-id-invalid');
    safeText(page.name, 'page-name-invalid');
    if (pages.has(id)) throw new DrawModelError('duplicate-page-id');
    bounded(page.width, MIN_PAGE, MAX_PAGE, 'page-width');
    bounded(page.height, MIN_PAGE, MAX_PAGE, 'page-height');
    if (!['portrait', 'landscape'].includes(page.orientation)) throw new DrawModelError('page-orientation-invalid');
    if (!isRecord(page.printableBounds)) throw new DrawModelError('printable-bounds-invalid');
    const printable = page.printableBounds as unknown as DrawBounds;
    const px = finite(printable.x, 'printable-bounds-invalid');
    const py = finite(printable.y, 'printable-bounds-invalid');
    const pw = finite(printable.width, 'printable-bounds-invalid');
    const ph = finite(printable.height, 'printable-bounds-invalid');
    if (px < 0 || py < 0 || pw <= 0 || ph <= 0 || px + pw > page.width || py + ph > page.height) throw new DrawModelError('invalid-printable-bounds');
    const objectIds = assertUniqueIds(page.objectIds, MAX_OBJECTS, 'page-object-invalid');
    const layerIds = assertUniqueIds(page.layerIds, MAX_LAYERS, 'page-layer-invalid');
    for (const objectId of objectIds) {
      if (pageObjectOwners.has(objectId)) throw new DrawModelError('object-multiple-pages');
      if (pageObjectOwners.size >= MAX_OBJECTS) throw new DrawModelError('object-limit');
      pageObjectOwners.set(objectId, id);
    }
    pageLayerMembership.set(id, layerIds);
    pages.set(id, page);
  }

  safeId(model.activePageId, 'invalid-active-page');
  if (!pages.has(model.activePageId)) throw new DrawModelError('active-page-missing');
  const layers = new Map<string, DrawLayer>();
  for (const rawLayer of model.layers as unknown[]) {
    if (!isRecord(rawLayer)) throw new DrawModelError('layer-invalid');
    const layer = rawLayer as unknown as DrawLayer;
    const id = safeId(layer.id, 'layer-id-invalid');
    safeText(layer.name, 'layer-name-invalid');
    assertBoolean(layer.visible, 'layer-visibility-invalid');
    assertBoolean(layer.locked, 'layer-lock-invalid');
    assertBoolean(layer.printable, 'layer-printable-invalid');
    finite(layer.order, 'layer-order-invalid');
    if (layers.has(id)) throw new DrawModelError('duplicate-layer-id');
    layers.set(id, layer);
  }
  for (const [pageId, layerIds] of pageLayerMembership) for (const layerId of layerIds) {
    if (!layers.has(layerId)) throw new DrawModelError('page-layer-missing');
    if (!pages.has(pageId)) throw new DrawModelError('page-missing');
  }

  const entries = Object.entries(model.objects);
  if (entries.length > MAX_OBJECTS) throw new DrawModelError('object-limit');
  const objects = new Map<string, DrawObject>();
  for (const [key, rawObject] of entries) {
    assertDrawObject(rawObject, key);
    const object = rawObject as DrawObject;
    const page = pages.get(object.pageId);
    if (!page) throw new DrawModelError('object-page-missing');
    if (!layers.has(object.layerId) || !pageLayerMembership.get(page.id)?.has(object.layerId)) throw new DrawModelError('object-layer-missing');
    if (pageObjectOwners.get(object.id) !== page.id) throw new DrawModelError('object-page-membership-invalid');
    objects.set(object.id, object);
  }
  for (const objectId of pageObjectOwners.keys()) if (!objects.has(objectId)) throw new DrawModelError('page-object-missing');

  for (const [id, object] of objects) {
    if (object.parentGroupId !== undefined) {
      const parent = objects.get(object.parentGroupId);
      if (!parent || parent.type !== 'group' || !parent.childIds?.includes(id) || parent.pageId !== object.pageId) throw new DrawModelError('group-parent-invalid');
    }
    if (object.type === 'group') for (const childId of object.childIds ?? []) {
      const child = objects.get(childId);
      if (!child || child.parentGroupId !== id || child.pageId !== object.pageId) throw new DrawModelError('group-child-invalid');
    }
    if (object.type === 'connector' && object.connector) {
      const from = objects.get(object.connector.from.objectId);
      const to = objects.get(object.connector.to.objectId);
      if (!from || !to) throw new DrawModelError('connector-endpoint-missing');
      if (from.type === 'connector' || to.type === 'connector') throw new DrawModelError('connector-endpoint-type-invalid');
      if (from.pageId !== object.pageId || to.pageId !== object.pageId) throw new DrawModelError('connector-page-mismatch');
    }
  }
  const groupVisitState = new Map<string, 1 | 2>();
  for (const [id, object] of objects) {
    if (groupVisitState.has(id)) continue;
    const path: string[] = [];
    let current: DrawObject | undefined = object;
    while (current && !groupVisitState.has(current.id)) {
      groupVisitState.set(current.id, 1);
      path.push(current.id);
      current = current.parentGroupId ? objects.get(current.parentGroupId) : undefined;
    }
    if (current && groupVisitState.get(current.id) === 1) throw new DrawModelError('group-cycle');
    for (const pathId of path) groupVisitState.set(pathId, 2);
  }

  const viewport = model.viewport;
  bounded(viewport.zoom, 0.05, 64, 'zoom-range');
  finite(viewport.panX, 'viewport-pan-invalid');
  finite(viewport.panY, 'viewport-pan-invalid');
  assertBoolean(viewport.showMiniMap, 'viewport-option-invalid');
  assertBoolean(viewport.showGrid, 'viewport-option-invalid');
  assertBoolean(viewport.showRulers, 'viewport-option-invalid');
  assertBoolean(viewport.snapToGrid, 'viewport-option-invalid');
  assertBoolean(viewport.snapToShapes, 'viewport-option-invalid');
  assertBoolean(viewport.snapToGuides, 'viewport-option-invalid');
  bounded(viewport.gridSize, MIN_GRID, MAX_GRID, 'grid-range');
  bounded(viewport.snapTolerance, 0, 256, 'snap-range');
  const guideIds = new Set<string>();
  if (!Array.isArray(viewport.guides) || viewport.guides.length > MAX_GUIDES) throw new DrawModelError('guide-limit');
  for (const rawGuide of viewport.guides as unknown[]) {
    if (!isRecord(rawGuide)) throw new DrawModelError('guide-invalid');
    const guide = rawGuide as unknown as DrawGuide;
    safeId(guide.id, 'guide-id-invalid');
    if (guideIds.has(guide.id)) throw new DrawModelError('guide-id-duplicate');
    guideIds.add(guide.id);
    if (guide.axis !== 'x' && guide.axis !== 'y') throw new DrawModelError('guide-axis-invalid');
    finite(guide.position, 'guide-position');
  }

  const bindingIds = new Set<string>();
  for (const rawBinding of model.dataBindings as unknown[]) {
    assertDataBinding(rawBinding);
    const binding = rawBinding as DrawDocumentModel['dataBindings'][number];
    if (bindingIds.has(binding.id)) throw new DrawModelError('duplicate-binding-id');
    bindingIds.add(binding.id);
    if (!objects.has(binding.objectId)) throw new DrawModelError('binding-object-missing');
  }
  const libraryIds = new Set<string>();
  for (const rawLibrary of model.stencils as unknown[]) {
    assertStencilLibrary(rawLibrary);
    const library = rawLibrary as DrawStencilLibrary;
    if (libraryIds.has(library.id)) throw new DrawModelError('stencil-library-duplicate');
    libraryIds.add(library.id);
  }
}

