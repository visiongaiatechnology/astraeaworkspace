// STATUS: PLATIN — the single canonical Draw paint-order / visibility resolution for every renderer.
import type {
  DrawDocumentModel, DrawLayer, DrawObject, DrawObjectId, DrawPageId,
} from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, assertDrawDocument, safeId } from '../model/drawDocumentValidation';

export interface DrawSceneEntry {
  readonly object: DrawObject;
  /** 0-based position in canonical paint order (ascending: painted first, behind). */
  readonly paintIndex: number;
  /** True when the owning layer is visible and the object is not fully transparent. */
  readonly visible: boolean;
  /** True when the object itself or its owning layer is locked. */
  readonly locked: boolean;
  readonly layerLocked: boolean;
}

export interface DrawScene {
  readonly pageId: DrawPageId;
  readonly width: number;
  readonly height: number;
  /** Canonical paint order, ascending. */
  readonly entries: readonly DrawSceneEntry[];
  /** Derived from `entries`: topmost first. Never computed by a second ordering rule. */
  readonly hitOrder: readonly DrawSceneEntry[];
  readonly byId: ReadonlyMap<DrawObjectId, DrawSceneEntry>;
  readonly layers: readonly DrawLayer[];
  readonly layerOrder: ReadonlyMap<string, number>;
}

/**
 * Canonical per-page object record. Connector routing, hit-testing and rendering all consume this
 * so no code path has to walk objects belonging to other pages.
 */
export function projectDrawPageObjects(
  model: DrawDocumentModel,
  pageId: DrawPageId = model.activePageId,
): Record<DrawObjectId, DrawObject> {
  assertDrawDocument(model);
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const record: Record<DrawObjectId, DrawObject> = {};
  for (const id of page.objectIds) {
    const object = model.objects[id];
    if (object && object.pageId === page.id) record[id] = object;
  }
  return record;
}

/**
 * Resolves paint order from the page's `layerIds` (the authoritative per-page layer stack) and then
 * from `zIndex` inside each layer. Objects whose layer is missing from the page are appended after
 * the known layers so an inconsistent document can never silently hide content.
 */
export function projectDrawScene(
  model: DrawDocumentModel,
  pageId: DrawPageId = model.activePageId,
): DrawScene {
  assertDrawDocument(model);
  safeId(pageId, 'page-id-invalid');
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');

  const layers = page.layerIds
    .map((id) => model.layers.find((layer) => layer.id === id))
    .filter((layer): layer is DrawLayer => Boolean(layer));
  const layerOrder = new Map<string, number>();
  layers.forEach((layer, index) => layerOrder.set(layer.id, index));

  const pageObjects: DrawObject[] = [];
  for (const id of page.objectIds) {
    const object = model.objects[id];
    if (object) pageObjects.push(object);
  }

  const rank = (object: DrawObject): number => layerOrder.get(object.layerId) ?? layers.length;
  const ordered = [...pageObjects].sort((left, right) => rank(left) - rank(right)
    || left.zIndex - right.zIndex
    || left.id.localeCompare(right.id));

  const entries = ordered.map((object, paintIndex): DrawSceneEntry => {
    const layer = model.layers.find((candidate) => candidate.id === object.layerId);
    const layerLocked = layer ? layer.locked : true;
    return {
      object,
      paintIndex,
      visible: (layer ? layer.visible : false) && object.opacity > 0,
      locked: object.locked || layerLocked,
      layerLocked,
    };
  });

  return {
    pageId: page.id,
    width: page.width,
    height: page.height,
    entries,
    hitOrder: [...entries].reverse(),
    byId: new Map(entries.map((entry) => [entry.object.id, entry])),
    layers,
    layerOrder,
  };
}

/** Objects that take part in pointer hit-testing: visible and not locked. */
export function sceneSelectableEntries(scene: DrawScene): DrawSceneEntry[] {
  return scene.hitOrder.filter((entry) => entry.visible);
}
