import { describe, expect, it } from 'vitest';
import type { DrawDocumentModel, DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import {
  DrawModelError,
  assertDrawDocument,
  createEmptyDrawDocument,
  exportStencilLibrary,
  groupDrawObjects,
  importStencilLibrary,
  installStencilLibrary,
  removeDrawObjects,
  selectionBounds,
  snapDrawPoint,
  transactDraw,
  ungroupDrawObject,
  upsertDrawObject,
} from '../../model/drawDocumentEngine';

function createObject(id: string, pageId = 'page-1', type: DrawObject['type'] = 'shape'): DrawObject {
  const object: DrawObject = {
    id,
    pageId,
    layerId: 'layer-main',
    type,
    name: id,
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
  };
  if (type === 'connector') object.connector = {
    from: { objectId: 'shape-a', anchor: 'auto' },
    to: { objectId: 'shape-b', anchor: 'auto' },
    route: 'straight',
    autoRoute: false,
    waypoints: [],
    obstacleAvoidance: false,
    routingPriority: 0,
    crossingStyle: 'none',
    semantic: {},
    arrowStart: 'none',
    arrowEnd: 'none',
  };
  return object;
}

function createModel(objects: DrawObject[] = []): DrawDocumentModel {
  const model = createEmptyDrawDocument();
  return {
    ...model,
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    pages: model.pages.map((page) => ({ ...page, objectIds: objects.map((object) => object.id) })),
  };
}

function createTwoPageModel(): DrawDocumentModel {
  const model = createEmptyDrawDocument();
  const secondPage = {
    ...model.pages[0],
    id: 'page-2',
    name: 'Page 2',
    objectIds: [],
    printableBounds: { ...model.pages[0].printableBounds },
  };
  return { ...model, pages: [...model.pages, secondPage] };
}

describe('Draw document model validation', () => {
  it('accepts the canonical empty document without mutating it', () => {
    const model = createEmptyDrawDocument();
    const before = structuredClone(model);

    expect(() => assertDrawDocument(model)).not.toThrow();
    expect(model).toEqual(before);
  });

  it('rejects out-of-range zoom, non-finite bounds, and malformed runtime records as DrawModelError', () => {
    const invalidZoom = createEmptyDrawDocument();
    invalidZoom.viewport.zoom = 100;
    expect(() => assertDrawDocument(invalidZoom)).toThrowError(DrawModelError);

    const base = createEmptyDrawDocument();
    const invalidBounds = {
      ...base,
      pages: [{ ...base.pages[0], printableBounds: { ...base.pages[0].printableBounds, width: Number.NaN } }],
    };
    expect(() => assertDrawDocument(invalidBounds)).toThrowError(DrawModelError);

    expect(() => assertDrawDocument({ pages: null } as unknown as DrawDocumentModel)).toThrowError(DrawModelError);
    expect(() => assertDrawDocument({ ...createEmptyDrawDocument(), pages: [null] } as unknown as DrawDocumentModel)).toThrowError(DrawModelError);
  });

  it('rejects duplicated cross-page ownership and cyclic group ancestry', () => {
    const duplicated = createModel([createObject('shape-a')]);
    duplicated.pages.push({
      ...duplicated.pages[0],
      id: 'page-2',
      name: 'Page 2',
      objectIds: ['shape-a'],
      printableBounds: { ...duplicated.pages[0].printableBounds },
    });
    expect(() => assertDrawDocument(duplicated)).toThrow('object-multiple-pages');

    const groupA = { ...createObject('group-a', 'page-1', 'group'), childIds: ['group-b'] };
    const groupB = { ...createObject('group-b', 'page-1', 'group'), childIds: ['group-a'] };
    groupA.parentGroupId = 'group-b';
    groupB.parentGroupId = 'group-a';
    const cyclic = createModel([groupA, groupB]);
    expect(() => assertDrawDocument(cyclic)).toThrow('group-cycle');
  });
});

describe('Draw document transactions and object lifecycle', () => {
  it('commits one immutable revision and leaves the source untouched on success or failure', () => {
    const model = createEmptyDrawDocument();
    const result = transactDraw(model, (draft) => { draft.viewport.panX = 24; });

    expect(result.revision).toBe(model.revision + 1);
    expect(result.viewport.panX).toBe(24);
    expect(model.viewport.panX).toBe(0);
    expect(() => transactDraw(model, () => { throw new DrawModelError('mutation-rejected'); })).toThrow('mutation-rejected');
    expect(model.revision).toBe(1);
  });

  it('moves an object between pages while maintaining exactly one page membership', () => {
    const model = createTwoPageModel();
    const withObject = upsertDrawObject(model, createObject('shape-a'));
    const moved = upsertDrawObject(withObject, { ...withObject.objects['shape-a'], pageId: 'page-2' });

    expect(withObject.pages[0].objectIds).toEqual(['shape-a']);
    expect(moved.pages[0].objectIds).toEqual([]);
    expect(moved.pages[1].objectIds).toEqual(['shape-a']);
    expect(moved.objects['shape-a'].pageId).toBe('page-2');
    expect(model.pages[0].objectIds).toEqual([]);
  });

  it('deletes connectors and data bindings that would otherwise point to removed objects', () => {
    const first = createObject('shape-a');
    const second = createObject('shape-b');
    const connector = createObject('connector-1', 'page-1', 'connector');
    const model = createModel([first, second, connector]);
    model.dataBindings = [{
      id: 'binding-1',
      objectId: 'shape-a',
      sourceKind: 'grid-range',
      sourceUri: 'vgt://workspace/document/grid-doc/object/table-1',
      mode: 'live',
      rules: [],
    }];

    const result = removeDrawObjects(model, ['shape-a']);
    expect(Object.keys(result.objects)).toEqual(['shape-b']);
    expect(result.pages[0].objectIds).toEqual(['shape-b']);
    expect(result.dataBindings).toEqual([]);
    expect(model.pages[0].objectIds).toEqual(['shape-a', 'shape-b', 'connector-1']);
  });

  it('reparents nested groups and refuses to ungroup a connector target', () => {
    const model = createModel([createObject('shape-a')]);
    const inner = groupDrawObjects(model, createObject('group-inner', 'page-1', 'group'), ['shape-a']);
    const outer = groupDrawObjects(inner, createObject('group-outer', 'page-1', 'group'), ['group-inner']);

    expect(outer.objects['group-inner'].parentGroupId).toBe('group-outer');
    expect(() => ungroupDrawObject(outer, 'group-inner')).not.toThrow();
    const withTarget = upsertDrawObject(outer, createObject('shape-b'));
    const connector = createObject('connector-1', 'page-1', 'connector');
    connector.connector!.from.objectId = 'group-outer';
    const withConnector = upsertDrawObject(withTarget, connector);
    expect(() => ungroupDrawObject(withConnector, 'group-outer')).toThrow('group-has-connected-connectors');
  });
});

describe('Draw geometry and stencil boundaries', () => {
  it('computes selection bounds iteratively for the full object selection cap', () => {
    const model = createModel([createObject('shape-a')]);
    const selection = new Array<string>(100_000).fill('shape-a');
    expect(selectionBounds(model, selection)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('snaps finite points using a validated grid and tolerance', () => {
    const model = createEmptyDrawDocument();
    expect(snapDrawPoint(model, 'page-1', { x: 9, y: 7 })).toEqual({ x: 16, y: 0 });
    expect(() => snapDrawPoint(model, 'page-1', { x: Number.NaN, y: 0 })).toThrowError(DrawModelError);
  });

  it('roundtrips valid stencil libraries and rejects malformed or oversized JSON', () => {
    const model = createEmptyDrawDocument();
    const library = { id: 'library-1', name: 'Shapes', version: 1, stencils: [] };
    const installed = installStencilLibrary(model, library);

    expect(importStencilLibrary(exportStencilLibrary(installed, library.id))).toEqual(library);
    expect(() => importStencilLibrary('{"format":"VGT_DRAW_STENCIL_V1","library":{"id":"x","name":"y","version":1,"stencils":null}}')).toThrowError(DrawModelError);
    const oversized = '"' + 'é'.repeat(4 * 1024 * 1024 + 1) + '"';
    expect(() => importStencilLibrary(oversized)).toThrow('stencil-library-too-large');
  });
});
