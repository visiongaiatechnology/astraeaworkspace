// STATUS: GOLD — proves layer order and layer visibility actually govern Draw paint and hit order.
import { describe, expect, it } from 'vitest';
import { DrawModelError } from '../../model/drawDocumentValidation';
import { buildDrawSvg } from '../../import-export/drawInterchangeCore';
import { projectDrawPageObjects, projectDrawScene, sceneSelectableEntries } from '../../interactions/drawSceneProjection';
import { buildDrawModel, overlappingModel } from './drawInteractionFixtures';

describe('Draw scene projection', () => {
  it('orders paint by page layerIds first and zIndex second', () => {
    const model = buildDrawModel({
      layers: [{ id: 'layer-back' }, { id: 'layer-front' }],
      objects: [
        // Deliberately inverted zIndex: layer order must win.
        { id: 'front-low', layerId: 'layer-front', zIndex: 0, x: 0, y: 0 },
        { id: 'back-high', layerId: 'layer-back', zIndex: 99, x: 0, y: 0 },
        { id: 'front-high', layerId: 'layer-front', zIndex: 5, x: 0, y: 0 },
      ],
    });

    const scene = projectDrawScene(model, 'page-1');
    expect(scene.entries.map((entry) => entry.object.id)).toEqual(['back-high', 'front-low', 'front-high']);
    expect(scene.hitOrder.map((entry) => entry.object.id)).toEqual(['front-high', 'front-low', 'back-high']);
  });

  it('breaks zIndex ties by id so paint order is total and deterministic', () => {
    const model = buildDrawModel({
      layers: [{ id: 'layer-main' }],
      objects: [
        { id: 'b', zIndex: 3, x: 0, y: 0 },
        { id: 'a', zIndex: 3, x: 0, y: 0 },
        { id: 'c', zIndex: 3, x: 0, y: 0 },
      ],
    });
    expect(projectDrawScene(model, 'page-1').entries.map((entry) => entry.object.id)).toEqual(['a', 'b', 'c']);
  });

  it('marks objects on hidden layers as invisible and excludes them from selection candidates', () => {
    const model = overlappingModel();
    const scene = projectDrawScene(model, 'page-1');
    expect(scene.byId.get('hidden-shape')?.visible).toBe(false);
    expect(scene.byId.get('low')?.visible).toBe(true);
    expect(sceneSelectableEntries(scene).map((entry) => entry.object.id)).not.toContain('hidden-shape');
    // Hidden objects still exist in the projection so panels can list them.
    expect(scene.byId.has('hidden-shape')).toBe(true);
  });

  it('treats a locked layer as locking every object on it', () => {
    const scene = projectDrawScene(overlappingModel(), 'page-1');
    expect(scene.byId.get('locked-shape')?.locked).toBe(true);
    expect(scene.byId.get('locked-shape')?.layerLocked).toBe(true);
    expect(scene.byId.get('low')?.locked).toBe(false);
  });

  it('treats fully transparent objects as not painted', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'solid', opacity: 1, x: 0, y: 0 },
        { id: 'ghost', opacity: 0, x: 0, y: 0 },
      ],
    });
    const scene = projectDrawScene(model, 'page-1');
    expect(scene.byId.get('ghost')?.visible).toBe(false);
    expect(scene.byId.get('solid')?.visible).toBe(true);
  });

  it('scopes the object record to a single page instead of the whole document', () => {
    const model = buildDrawModel({
      twoPages: true,
      layers: [[{ id: 'layer-main' }], [{ id: 'layer-main' }]],
      objects: [
        { id: 'on-page-1', pageId: 'page-1', layerId: 'layer-main', x: 0, y: 0 },
        { id: 'on-page-2', pageId: 'page-2', layerId: 'layer-main', x: 0, y: 0 },
      ],
    });
    expect(Object.keys(projectDrawPageObjects(model, 'page-1'))).toEqual(['on-page-1']);
    expect(Object.keys(projectDrawPageObjects(model, 'page-2'))).toEqual(['on-page-2']);
    expect(Object.keys(model.objects)).toHaveLength(2);
  });

  it('fails closed for an unknown page instead of rendering an empty scene', () => {
    expect(() => projectDrawScene(overlappingModel(), 'page-nope')).toThrowError(DrawModelError);
    expect(() => projectDrawPageObjects(overlappingModel(), 'page-nope')).toThrowError(DrawModelError);
  });

  it('drives SVG export through the same layer order, so an export cannot disagree with the canvas', () => {
    const model = buildDrawModel({
      layers: [{ id: 'layer-back' }, { id: 'layer-front' }],
      objects: [
        { id: 'back-high', layerId: 'layer-back', zIndex: 99, x: 0, y: 0 },
        { id: 'front-low', layerId: 'layer-front', zIndex: 0, x: 10, y: 10 },
      ],
    });
    const svg = buildDrawSvg(model, 'page-1');
    expect(svg.indexOf('data-vgt-id="back-high"')).toBeLessThan(svg.indexOf('data-vgt-id="front-low"'));

    const hidden = buildDrawModel({
      layers: [{ id: 'layer-main' }, { id: 'layer-hidden', visible: false }],
      objects: [
        { id: 'visible-shape', layerId: 'layer-main', x: 0, y: 0 },
        { id: 'hidden-shape', layerId: 'layer-hidden', x: 0, y: 0 },
      ],
    });
    const hiddenSvg = buildDrawSvg(hidden, 'page-1');
    expect(hiddenSvg).not.toContain('data-vgt-id="hidden-shape"');
    expect(hiddenSvg).toContain('data-vgt-id="visible-shape"');
  });
});
