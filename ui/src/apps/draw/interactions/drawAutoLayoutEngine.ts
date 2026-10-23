// STATUS: PLATIN — deterministic Draw auto layout for an existing page (no manual position is lost).
//
// The layout algorithm itself lives in `drawAutoDiagramEngine`; this module only feeds the page's own
// objects in as rows and writes the resulting geometry back onto those same objects. Identity, style,
// rich text, layer and stacking order are preserved, and because connector geometry is routed from the
// live model, every connector follows the new arrangement without extra work.
import type { DrawDocumentModel, DrawObject, DrawObjectId } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, assertDrawDocument, transactDraw } from '../model/drawDocumentEngine';
import { generateDeterministicDiagram, type AutoDiagramRow } from '../model/drawAutoDiagramEngine';
import { projectDrawScene } from './drawSceneProjection';

/** Margin from the page corner that a generated layout is aligned to. */
export const DRAW_LAYOUT_MARGIN = 32;

export interface DrawAutoLayoutOptions {
  readonly pageId?: string;
  readonly layout?: 'table' | 'hierarchy';
}

export interface DrawAutoLayoutResult {
  readonly model: DrawDocumentModel;
  readonly movedIds: readonly DrawObjectId[];
}

/**
 * Parent relation used by the hierarchical layout: the source of a connector becomes the parent of its
 * target. Only shapes on the same page participate; cycles cannot appear because each node keeps at
 * most one parent (first connector in paint order wins, deterministically).
 */
function parentsFromConnectors(model: DrawDocumentModel, pageId: string): Map<DrawObjectId, DrawObjectId> {
  const scene = projectDrawScene(model, pageId);
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const parents = new Map<DrawObjectId, DrawObjectId>();
  for (const id of page.objectIds) {
    const object = model.objects[id];
    if (!object || object.type !== 'connector' || !object.connector) continue;
    const from = object.connector.from.objectId;
    const to = object.connector.to.objectId;
    if (!scene.byId.has(from) || !scene.byId.has(to)) continue;
    if (from === to || parents.has(to)) continue;
    parents.set(to, from);
  }
  return parents;
}

/**
 * Re-arranges every shape of a page with the deterministic generator. `layout: 'hierarchy'` uses the
 * page's connector graph, `'table'` a plain grid. Fails closed on an empty page instead of emitting an
 * empty edit that would still push an undo entry.
 */
export function layoutDrawPage(
  model: DrawDocumentModel,
  options?: DrawAutoLayoutOptions,
): DrawAutoLayoutResult {
  assertDrawDocument(model);
  const pageId = options?.pageId ?? model.activePageId;
  const layout = options?.layout ?? 'table';
  if (layout !== 'table' && layout !== 'hierarchy') throw new DrawModelError('auto-diagram-layout-invalid');
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');

  const scene = projectDrawScene(model, pageId);
  const shapes = scene.entries.map((entry) => entry.object).filter((object) => object.type === 'shape');
  if (shapes.length === 0) throw new DrawModelError('auto-layout-empty');
  const layerId = shapes[0]!.layerId;
  if (!page.layerIds.includes(layerId)) throw new DrawModelError('object-layer-missing');

  const parents = layout === 'hierarchy' ? parentsFromConnectors(model, pageId) : new Map<DrawObjectId, DrawObjectId>();
  const rows: AutoDiagramRow[] = shapes.map((object) => {
    const parentId = parents.get(object.id);
    return {
      id: object.id,
      label: object.name,
      ...(parentId === undefined ? {} : { parentId }),
    };
  });

  const generated = generateDeterministicDiagram(rows, pageId, layerId, layout);
  const geometry = new Map<DrawObjectId, Pick<DrawObject, 'x' | 'y' | 'width' | 'height'>>();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const object of generated) {
    const sourceRowId = object.customProperties?.sourceRowId;
    if (typeof sourceRowId !== 'string') throw new DrawModelError('auto-layout-row-missing');
    geometry.set(sourceRowId, { x: object.x, y: object.y, width: object.width, height: object.height });
    minX = Math.min(minX, object.x);
    minY = Math.min(minY, object.y);
  }
  if (geometry.size !== shapes.length) throw new DrawModelError('auto-layout-row-mismatch');

  const offsetX = DRAW_LAYOUT_MARGIN - minX;
  const offsetY = DRAW_LAYOUT_MARGIN - minY;
  const movedIds: DrawObjectId[] = [];
  const next = transactDraw(model, (draft) => {
    for (const object of shapes) {
      const box = geometry.get(object.id);
      if (!box) throw new DrawModelError('auto-layout-row-missing');
      const target = draft.objects[object.id];
      if (!target) throw new DrawModelError('selection-stale');
      // Clamp horizontally/vertically so no generated node leaves the page entirely.
      const x = Math.max(0, Math.min(box.x + offsetX, Math.max(0, page.width - box.width)));
      const y = Math.max(0, Math.min(box.y + offsetY, Math.max(0, page.height - box.height)));
      if (x === target.x && y === target.y && box.width === target.width && box.height === target.height) continue;
      target.x = x;
      target.y = y;
      target.width = box.width;
      target.height = box.height;
      movedIds.push(object.id);
    }
  });
  if (movedIds.length === 0) return { model, movedIds: [] };
  return { model: next, movedIds };
}
