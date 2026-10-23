// STATUS: GOLD — oracle tests for layer visibility, lock, ordering and layer moves with stable links.
import { describe, expect, it } from 'vitest';
import { DrawModelError } from '../../model/drawDocumentValidation';
import { buildDrawSvg } from '../../import-export/drawInterchangeCore';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import { routeDrawConnector } from '../../model/drawRoutingEngine';
import {
  countDrawLayerObjects,
  isDrawLayerOrderMutable,
  moveDrawObjectsToLayer,
  renameDrawLayer,
  resolvePageLayers,
  setDrawLayerLock,
  setDrawLayerPrintable,
  setDrawLayerVisibility,
  stepDrawLayerOrder,
} from '../../interactions/drawLayerEngine';
import { buildDrawModel, connectorFixture } from './drawInteractionFixtures';

function layeredModel() {
  return buildDrawModel({
    layers: [{ id: 'layer-main', name: 'Main' }, { id: 'layer-top', name: 'Top' }],
    objects: [
      { id: 'low', layerId: 'layer-main', x: 0, y: 0, width: 200, height: 200, zIndex: 0 },
      { id: 'high', layerId: 'layer-top', x: 50, y: 50, width: 100, height: 100, zIndex: 0 },
    ],
  });
}

describe('Draw layer engine', () => {
  it('resolves the page layer stack in page order and reports content counts', () => {
    const model = layeredModel();
    expect(resolvePageLayers(model, 'page-1').map((layer) => layer.id)).toEqual(['layer-main', 'layer-top']);
    expect(countDrawLayerObjects(model, 'page-1', 'layer-main')).toBe(1);
    expect(countDrawLayerObjects(model, 'page-1', 'layer-top')).toBe(1);
    expect(() => resolvePageLayers(model, 'page-9')).toThrowError(DrawModelError);
    expect(() => countDrawLayerObjects(model, 'page-9', 'layer-main')).toThrowError(DrawModelError);
  });

  it('hides a layer from both the canvas scene and the SVG export through one canonical rule', () => {
    const hidden = setDrawLayerVisibility(layeredModel(), 'layer-top', false);
    expect(projectDrawScene(hidden, 'page-1').byId.get('high')?.visible).toBe(false);
    const svg = buildDrawSvg(hidden, 'page-1');
    expect(svg).not.toContain('data-vgt-id="high"');
    expect(svg).toContain('data-vgt-id="low"');
    // Reopening the layer restores the object everywhere at once.
    const shown = setDrawLayerVisibility(hidden, 'layer-top', true);
    expect(projectDrawScene(shown, 'page-1').byId.get('high')?.visible).toBe(true);
    expect(buildDrawSvg(shown, 'page-1')).toContain('data-vgt-id="high"');
  });

  it('locks and unlocks a whole layer and keeps the printable flag independent', () => {
    const locked = setDrawLayerLock(layeredModel(), 'layer-top', true);
    const scene = projectDrawScene(locked, 'page-1');
    expect(scene.byId.get('high')?.locked).toBe(true);
    expect(scene.byId.get('low')?.locked).toBe(false);
    const notPrintable = setDrawLayerPrintable(locked, 'layer-top', false);
    expect(notPrintable.layers.find((layer) => layer.id === 'layer-top')?.printable).toBe(false);
    expect(() => setDrawLayerVisibility(notPrintable, 'layer-top', 'yes' as never)).toThrowError(DrawModelError);
    expect(() => renameDrawLayer(notPrintable, 'layer-top', '   ')).toThrowError(DrawModelError);
    expect(renameDrawLayer(notPrintable, 'layer-top', 'Annotations').layers.find((layer) => layer.id === 'layer-top')?.name)
      .toBe('Annotations');
  });

  it('steps layer order and stops at the ends instead of wrapping unexpectedly', () => {
    const model = layeredModel();
    expect(isDrawLayerOrderMutable(model, 'page-1', 'layer-main', -1)).toBe(false);
    expect(isDrawLayerOrderMutable(model, 'page-1', 'layer-main', 1)).toBe(true);
    const raised = stepDrawLayerOrder(model, 'page-1', 'layer-main', 1);
    expect(resolvePageLayers(raised, 'page-1').map((layer) => layer.id)).toEqual(['layer-top', 'layer-main']);
    expect(resolvePageLayers(raised, 'page-1').map((layer) => layer.order)).toEqual([0, 1]);
    // Paint order follows layer order immediately.
    expect(projectDrawScene(raised, 'page-1').entries.map((entry) => entry.object.id)).toEqual(['high', 'low']);
    expect(stepDrawLayerOrder(model, 'page-1', 'layer-main', -1)).toBe(model);
  });

  it('moves a selection to another layer and keeps connector links intact', () => {
    const model = buildDrawModel({
      layers: [{ id: 'layer-main' }, { id: 'layer-top' }],
      objects: [
        { id: 'source', layerId: 'layer-main', x: 0, y: 0, width: 20, height: 20 },
        { id: 'target', layerId: 'layer-main', x: 200, y: 0, width: 20, height: 20 },
        { id: 'edge', layerId: 'layer-main', type: 'connector', connector: connectorFixture('source', 'target') },
      ],
    });
    const before = routeDrawConnector(model.objects['edge']!.connector!, model.objects).path;
    const moved = moveDrawObjectsToLayer(model, ['source'], 'layer-top');
    expect(moved.model.objects['source']!.layerId).toBe('layer-top');
    expect(moved.movedIds).toEqual(['source']);
    // The connector itself stays behind, but its geometry is unchanged and still resolvable.
    expect(moved.model.objects['edge']!.layerId).toBe('layer-main');
    expect(routeDrawConnector(moved.model.objects['edge']!.connector!, moved.model.objects).path).toBe(before);
    // The target stays put too.
    expect(moved.model.objects['target']!.layerId).toBe('layer-main');
  });

  it('drags a connector along when both of its endpoints move', () => {
    const model = buildDrawModel({
      layers: [{ id: 'layer-main' }, { id: 'layer-top' }],
      objects: [
        { id: 'source', layerId: 'layer-main', x: 0, y: 0, width: 20, height: 20 },
        { id: 'target', layerId: 'layer-main', x: 200, y: 0, width: 20, height: 20 },
        { id: 'edge', layerId: 'layer-main', type: 'connector', connector: connectorFixture('source', 'target') },
      ],
    });
    const moved = moveDrawObjectsToLayer(model, ['source', 'target'], 'layer-top');
    expect([...moved.movedIds].sort()).toEqual(['edge', 'source', 'target']);
    expect(moved.model.objects['edge']!.layerId).toBe('layer-top');
  });

  it('refuses to move objects onto a locked layer', () => {
    const locked = setDrawLayerLock(layeredModel(), 'layer-top', true);
    expect(() => moveDrawObjectsToLayer(locked, ['low'], 'layer-top')).toThrowError(/layer-locked/u);
  });

  it('carries group children along when a container moves layers', () => {
    const base = buildDrawModel({
      layers: [{ id: 'layer-main' }, { id: 'layer-top' }],
      objects: [
        { id: 'child-a', layerId: 'layer-main', x: 0, y: 0, width: 10, height: 10 },
        { id: 'child-b', layerId: 'layer-main', x: 20, y: 0, width: 10, height: 10 },
        { id: 'group-x', layerId: 'layer-main', type: 'group', x: 0, y: 0, width: 30, height: 10, childIds: ['child-a', 'child-b'] },
      ],
    });
    const linked = {
      ...base,
      objects: {
        ...base.objects,
        'child-a': { ...base.objects['child-a']!, parentGroupId: 'group-x' },
        'child-b': { ...base.objects['child-b']!, parentGroupId: 'group-x' },
      },
    };
    const moved = moveDrawObjectsToLayer(linked, ['group-x'], 'layer-top');
    expect([...moved.movedIds].sort()).toEqual(['child-a', 'child-b', 'group-x']);
    for (const id of moved.movedIds) expect(moved.model.objects[id]!.layerId).toBe('layer-top');
  });

  it('rejects an empty or unknown selection rather than silently doing nothing', () => {
    const model = layeredModel();
    expect(() => moveDrawObjectsToLayer(model, [], 'layer-top')).toThrowError(DrawModelError);
    expect(() => moveDrawObjectsToLayer(model, ['ghost'], 'layer-top')).toThrowError(DrawModelError);
    expect(() => moveDrawObjectsToLayer(model, ['low'], 'layer-nope')).toThrowError(DrawModelError);
  });
});
