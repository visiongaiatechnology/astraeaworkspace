// STATUS: GOLD — hand-written oracles for Draw hit-testing, group resolution and marquee selection.
import { describe, expect, it } from 'vitest';
import { DrawModelError } from '../../model/drawDocumentValidation';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import { buildDrawSpatialIndex } from '../../interactions/drawSpatialIndex';
import {
  DRAW_HIT_CANDIDATE_LIMIT,
  DRAW_ROTATE_HANDLE_OFFSET,
  expandDrawSelection,
  hitTestDrawScene,
  hitTestDrawSceneAll,
  hitTestDrawSelectionAdorner,
  isDrawResizeHandleHit,
  marqueeDrawSelection,
  resolveDrawSelectionRoot,
  rotateHandleWorld,
} from '../../interactions/drawHitTest';
import { buildDrawModel, connectorFixture, overlappingModel } from './drawInteractionFixtures';

function sceneOf(model: ReturnType<typeof buildDrawModel>) {
  return projectDrawScene(model, 'page-1');
}

describe('Draw hit testing', () => {
  it('returns the topmost object in canonical paint order', () => {
    const scene = sceneOf(overlappingModel());
    // (60,60) is inside `low`, `high`, `hidden-shape` and `locked-shape`.
    expect(hitTestDrawScene(scene, { x: 60, y: 60 })?.objectId).toBe('high');
    // Only `low` covers (10,10).
    expect(hitTestDrawScene(scene, { x: 10, y: 10 })?.objectId).toBe('low');
    expect(hitTestDrawScene(scene, { x: 1000, y: 100 })).toBeNull();
  });

  it('skips hidden and locked objects unless explicitly included', () => {
    const scene = sceneOf(overlappingModel());
    const hidden = hitTestDrawScene(scene, { x: 75, y: 75 }, { includeHidden: true, includeLocked: true });
    expect(hidden?.objectId).toBe('locked-shape');
    const ids = hitTestDrawSceneAll(scene, { x: 60, y: 60 }).map((hit) => hit.objectId);
    expect(ids).toEqual(['high', 'low']);
    expect(ids).not.toContain('hidden-shape');
    expect(ids).not.toContain('locked-shape');
  });

  it('resolves a hit on a grouped child to the outer group and expands it back on demand', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'child-a', x: 0, y: 0, width: 50, height: 50 },
        { id: 'child-b', x: 60, y: 0, width: 50, height: 50 },
        { id: 'group-1', type: 'group', x: 0, y: 0, width: 110, height: 50, zIndex: 9, childIds: ['child-a', 'child-b'] },
      ],
    });
    // Fixture must declare the parent link both ways; rebuild through the canonical grouper instead.
    const linked = {
      ...model,
      objects: {
        ...model.objects,
        'child-a': { ...model.objects['child-a']!, parentGroupId: 'group-1' },
        'child-b': { ...model.objects['child-b']!, parentGroupId: 'group-1' },
      },
    };
    const scene = sceneOf(linked);
    expect(resolveDrawSelectionRoot(scene, 'child-a')).toBe('group-1');
    expect(hitTestDrawScene(scene, { x: 10, y: 10 })?.objectId).toBe('group-1');
    expect(hitTestDrawScene(scene, { x: 10, y: 10 }, { groupSelect: false })?.objectId).toBe('child-a');
    expect(expandDrawSelection(scene, ['group-1']).sort()).toEqual(['child-a', 'child-b', 'group-1']);
  });

  it('hit-tests rotated shapes by their real outline, not by the axis-aligned box', () => {
    const model = buildDrawModel({ objects: [{ id: 'rotated', x: 0, y: 0, width: 100, height: 20, rotation: 90 }] });
    const scene = sceneOf(model);
    expect(hitTestDrawScene(scene, { x: 50, y: -30 })?.objectId).toBe('rotated');
    expect(hitTestDrawScene(scene, { x: 10, y: 8 })).toBeNull();
  });

  it('hit-tests connectors along their routed polyline', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'source', x: 0, y: 0, width: 20, height: 20 },
        { id: 'target', x: 200, y: 0, width: 20, height: 20 },
        { id: 'edge', type: 'connector', connector: connectorFixture('source', 'target', 'depends on') },
      ],
    });
    const scene = sceneOf(model);
    const paths = new Map([['edge', [{ x: 20, y: 10 }, { x: 200, y: 10 }]]]);
    expect(hitTestDrawScene(scene, { x: 100, y: 10 }, { connectorPaths: paths })?.objectId).toBe('edge');
    expect(hitTestDrawScene(scene, { x: 100, y: 60 }, { connectorPaths: paths })).toBeNull();
    // Without a routed path the connector is not clickable, so it never shadows real shapes.
    expect(hitTestDrawScene(scene, { x: 100, y: 10 })).toBeNull();
  });

  it('prefers resize/rotate adorners over the body underneath them', () => {
    const model = buildDrawModel({ objects: [{ id: 'shape', x: 0, y: 0, width: 100, height: 60 }] });
    const scene = sceneOf(model);
    const corner = hitTestDrawSelectionAdorner(scene, ['shape'], { x: 0, y: 0 }, { tolerance: 8 });
    expect(corner?.region).toBe('handle');
    expect(isDrawResizeHandleHit(corner)).toBe(true);
    expect(corner?.handle).toBe('nw');

    const rotate = rotateHandleWorld(scene.byId.get('shape')!.object);
    expect(rotate).toEqual({ x: 50, y: -DRAW_ROTATE_HANDLE_OFFSET });
    expect(hitTestDrawSelectionAdorner(scene, ['shape'], rotate, { tolerance: 8 })?.region).toBe('rotate');
    // A point inside the body but away from every grip is not an adorner hit.
    expect(hitTestDrawSelectionAdorner(scene, ['shape'], { x: 50, y: 30 }, { tolerance: 8 })).toBeNull();
  });

  it('gives no resize grips to connectors, whose geometry belongs to the routing engine', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'source', x: 0, y: 0, width: 20, height: 20 },
        { id: 'target', x: 200, y: 0, width: 20, height: 20 },
        { id: 'edge', type: 'connector', connector: connectorFixture('source', 'target') },
      ],
    });
    const scene = sceneOf(model);
    expect(hitTestDrawSelectionAdorner(scene, ['edge'], { x: 0, y: 0 }, { tolerance: 8 })?.objectId).not.toBe('edge');
  });

  it('marquee selection requires containment and can intersect instead', () => {
    const scene = sceneOf(overlappingModel());
    const contained = marqueeDrawSelection(scene, { x: -10, y: -10, width: 230, height: 230 }, { mode: 'contain' });
    expect(contained).toEqual(['low', 'high']);
    // A group container is not a marquee target of its own; it is reached through its children.
    const outsideOnly = marqueeDrawSelection(scene, { x: 880, y: 680, width: 100, height: 100 }, { mode: 'contain' });
    expect(outsideOnly).toEqual(['outside']);
    const intersecting = marqueeDrawSelection(scene, { x: 40, y: 40, width: 10, height: 10 }, { mode: 'intersect' });
    expect(intersecting).toEqual(['low', 'high']);
    const none = marqueeDrawSelection(scene, { x: 500, y: 500, width: 10, height: 10 }, { mode: 'intersect' });
    expect(none).toEqual([]);
  });

  it('bounds the candidate set so a huge page cannot be scanned without limit', () => {
    const objects = [];
    for (let index = 0; index < DRAW_HIT_CANDIDATE_LIMIT + 40; index += 1) {
      objects.push({ id: `s-${index}`, x: index, y: 0, width: 1, height: 1, zIndex: index });
    }
    const model = buildDrawModel({ objects });
    const scene = sceneOf(model);
    const index = buildDrawSpatialIndex(scene, scene.entries);
    const hits = hitTestDrawSceneAll(scene, { x: 10_000, y: 10_000 }, { candidateLimit: 32 });
    expect(hits).toEqual([]);
    const bounded = hitTestDrawScene(scene, { x: 10_000, y: 10_000 }, { index, candidateLimit: 32 });
    expect(bounded).toBeNull();
  });

  it('fails closed on invalid coordinates and tolerances', () => {
    const scene = sceneOf(overlappingModel());
    expect(() => hitTestDrawScene(scene, { x: Number.NaN, y: 0 })).toThrowError(DrawModelError);
    expect(() => hitTestDrawScene(scene, { x: 0, y: 0 }, { tolerance: -1 })).toThrowError(DrawModelError);
    expect(() => hitTestDrawScene(scene, { x: 0, y: 0 }, { tolerance: 10_000 })).toThrowError(DrawModelError);
    expect(() => hitTestDrawScene(scene, { x: 0, y: 0 }, { candidateLimit: 0 })).toThrowError(DrawModelError);
  });
});
