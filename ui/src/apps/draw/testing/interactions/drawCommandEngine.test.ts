// STATUS: GOLD — oracle tests for Draw edit commands, including the bounded snap counter-check.
import { describe, expect, it } from 'vitest';
import type { DrawDocumentModel } from '../../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, assertDrawDocument, snapDrawPoint } from '../../model/drawDocumentEngine';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import { routeDrawConnector } from '../../model/drawRoutingEngine';
import {
  alignDrawObjects,
  applyDrawStylePatch,
  applyDrawZOrder,
  currentSelectionBounds,
  deleteDrawObjects,
  groupDrawSelection,
  insertDrawStencil,
  moveDrawObjects,
  resizeDrawObjects,
  rotateDrawObjects,
  setDrawObjectText,
  setDrawObjectsLocked,
  snapDrawPointBounded,
  ungroupDrawSelection,
} from '../../interactions/drawCommandEngine';
import { buildDrawModel, connectorFixture } from './drawInteractionFixtures';

function pair() {
  return buildDrawModel({
    viewport: { snapToGrid: false, snapToShapes: false, snapToGuides: false },
    objects: [
      { id: 'a', x: 100, y: 100, width: 80, height: 40, zIndex: 0, text: 'A' },
      { id: 'b', x: 400, y: 100, width: 80, height: 40, zIndex: 1, text: 'B' },
      { id: 'pinned', x: 700, y: 700, width: 40, height: 40, zIndex: 2, locked: true },
    ],
  });
}

describe('Draw move commands', () => {
  it('moves the selection and reports the applied delta', () => {
    const model = pair();
    const result = moveDrawObjects(model, ['a'], { x: 50, y: -20 });
    expect(result.model.objects['a']).toMatchObject({ x: 150, y: 80, width: 80, height: 40 });
    expect(result.model.objects['b']).toMatchObject({ x: 400, y: 100 });
    expect(result.applied).toEqual({ x: 50, y: -20 });
    expect(result.snapped).toBe(false);
    assertDrawDocument(result.model);
    // The canonical document revision advances so persistence sees a new revision.
    expect(result.model.revision).toBeGreaterThan(model.revision);
  });

  it('snaps a move to the grid and reports that it snapped', () => {
    const model = buildDrawModel({
      viewport: { snapToGrid: true, snapToShapes: false, snapToGuides: false, gridSize: 16, snapTolerance: 8 },
      objects: [{ id: 'a', x: 100, y: 100, width: 80, height: 40 }],
    });
    const result = moveDrawObjects(model, ['a'], { x: 13, y: 3 });
    expect(result.snapped).toBe(true);
    expect(result.model.objects['a']!.x % 16).toBe(0);
    expect(result.model.objects['a']!.y % 16).toBe(0);
  });

  it('refuses to move a locked object', () => {
    expect(() => moveDrawObjects(pair(), ['pinned'], { x: 10, y: 0 })).toThrowError(/object-locked/u);
  });

  it('refuses an empty selection instead of reporting success', () => {
    expect(() => moveDrawObjects(pair(), [], { x: 10, y: 0 })).toThrowError(DrawModelError);
  });

  it('bounded snapping agrees with the canonical unbounded snap rule', () => {
    // Build a large page so the bounded path is taken, then compare both implementations.
    const objects = [];
    for (let index = 0; index < 400; index += 1) {
      objects.push({
        id: `s-${index}`,
        x: (index % 20) * 60,
        y: Math.floor(index / 20) * 60,
        width: 40,
        height: 30,
        zIndex: index,
      });
    }
    const model: DrawDocumentModel = buildDrawModel({
      viewport: { snapToGrid: true, snapToShapes: true, snapToGuides: true, gridSize: 16, snapTolerance: 8 },
      guides: [{ id: 'guide-x', axis: 'x', position: 137 }, { id: 'guide-y', axis: 'y', position: 251 }],
      objects,
    });
    const probes = [{ x: 137, y: 251 }, { x: 130, y: 248 }, { x: 60, y: 60 }, { x: 61, y: 58 }, { x: 1000, y: 1000 }];
    for (const probe of probes) {
      const bounded = snapDrawPointBounded(model, 'page-1', probe, new Set(['s-0']), 8);
      const unbounded = snapDrawPoint(model, 'page-1', probe, new Set(['s-0']));
      expect(bounded, JSON.stringify(probe)).toEqual(unbounded);
    }
  });

  it('keeps connector geometry live when a connected node moves', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'source', x: 0, y: 0, width: 20, height: 20 },
        { id: 'target', x: 200, y: 0, width: 20, height: 20 },
        { id: 'edge', type: 'connector', connector: connectorFixture('source', 'target') },
      ],
    });
    const before = routeDrawConnector(model.objects['edge']!.connector!, model.objects).path;
    const moved = moveDrawObjects(model, ['target'], { x: 0, y: 120 }).model;
    const after = routeDrawConnector(moved.objects['edge']!.connector!, moved.objects).path;
    expect(after).not.toBe(before);
    expect(after.startsWith('M 20 10')).toBe(true);
  });
});

describe('Draw resize / rotate / text commands', () => {
  it('commits a resize through the document engine and stays valid', () => {
    const model = pair();
    const next = resizeDrawObjects(model, 'a', 'se', { x: 260, y: 220 });
    expect(next.objects['a']).toMatchObject({ x: 100, y: 100, width: 160, height: 120 });
    assertDrawDocument(next);
  });

  it('commits a rotation and preserves the centre', () => {
    const model = pair();
    const next = rotateDrawObjects(model, 'a', { x: 300, y: 120 });
    expect(next.objects['a']!.rotation).toBeCloseTo(90, 6);
    expect(next.objects['a']!.x).toBe(100);
    expect(next.objects['a']!.y).toBe(100);
    assertDrawDocument(next);
  });

  it('does not expose resize or rotate for a group, which owns no body box', () => {
    const grouped = groupDrawSelection(pair(), ['a', 'b']);
    const groupId = Object.values(grouped.objects).find((object) => object.type === 'group')!.id;
    expect(() => resizeDrawObjects(grouped, groupId, 'se', { x: 0, y: 0 })).toThrowError(DrawModelError);
    expect(() => rotateDrawObjects(grouped, groupId, { x: 0, y: 0 })).toThrowError(DrawModelError);
  });

  it('commits direct text editing and keeps the run styling', () => {
    const model = pair();
    const next = setDrawObjectText(model, 'a', 'Renamed node');
    const object = next.objects['a']!;
    expect(object.richText?.runs).toHaveLength(1);
    expect(object.richText?.runs[0]?.text).toBe('Renamed node');
    assertDrawDocument(next);
    // Empty text is legal and clears the label without deleting the shape.
    const cleared = setDrawObjectText(model, 'a', '');
    expect(cleared.objects['a']!.richText?.runs[0]?.text).toBe('');
    expect(() => setDrawObjectText(model, 'ghost', 'x')).toThrowError(DrawModelError);
    expect(() => setDrawObjectText(model, 'pinned', 'x')).toThrowError(/object-locked/u);
  });
});

describe('Draw structural commands', () => {
  it('deletes the selection together with the connectors that depend on it', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'source', x: 0, y: 0, width: 20, height: 20 },
        { id: 'target', x: 200, y: 0, width: 20, height: 20 },
        { id: 'edge', type: 'connector', connector: connectorFixture('source', 'target') },
      ],
    });
    const next = deleteDrawObjects(model, ['source']);
    expect(next.objects['source']).toBeUndefined();
    expect(next.objects['edge']).toBeUndefined();
    expect(next.objects['target']).toBeDefined();
    assertDrawDocument(next);
  });

  it('refuses to delete a locked object', () => {
    expect(() => deleteDrawObjects(pair(), ['pinned'])).toThrowError(/object-locked/u);
  });

  it('groups and ungroups a selection, and keeps children addressable', () => {
    const model = pair();
    const grouped = groupDrawSelection(model, ['a', 'b']);
    const group = Object.values(grouped.objects).find((object) => object.type === 'group')!;
    expect(group.childIds?.sort()).toEqual(['a', 'b']);
    expect(grouped.objects['a']!.parentGroupId).toBe(group.id);
    assertDrawDocument(grouped);

    const ungrouped = ungroupDrawSelection(grouped, [group.id]);
    expect(ungrouped.objects[group.id]).toBeUndefined();
    expect(ungrouped.objects['a']!.parentGroupId).toBeUndefined();
    assertDrawDocument(ungrouped);
  });

  it('refuses to group fewer than two objects', () => {
    expect(() => groupDrawSelection(pair(), ['a'])).toThrowError(/group-needs-two-objects/u);
    expect(() => ungroupDrawSelection(pair(), ['a'])).toThrowError(/group-missing/u);
  });

  it('applies z-order actions through the canonical reorder rule', () => {
    const model = pair();
    const front = applyDrawZOrder(model, ['a'], 'front');
    expect(front.objects['a']!.zIndex).toBeGreaterThan(front.objects['b']!.zIndex);
    const back = applyDrawZOrder(model, ['b'], 'back');
    expect(back.objects['b']!.zIndex).toBeLessThan(back.objects['a']!.zIndex);
    expect(projectDrawScene(front, 'page-1').entries.map((entry) => entry.object.id)).toEqual(['b', 'pinned', 'a']);
    assertDrawDocument(front);
  });

  it('patches vector style on shapes and only opacity on other object kinds', () => {
    const model = pair();
    const styled = applyDrawStylePatch(model, ['a'], { fill: '#ff0000', strokeWidth: 4 });
    expect(styled.objects['a']!.vector?.style.fill).toBe('#ff0000');
    expect(styled.objects['a']!.vector?.style.strokeWidth).toBe(4);
    const opacified = applyDrawStylePatch(model, ['a'], { opacity: 0.5 });
    expect(opacified.objects['a']!.vector?.style.opacity).toBe(0.5);
    // Unvalidated colour sinks stay rejected by the canonical style normalizer.
    expect(() => applyDrawStylePatch(model, ['a'], { fill: 'url(#evil)' })).toThrowError(DrawModelError);
    expect(() => applyDrawStylePatch(model, ['a'], { fill: '#12345' })).toThrowError(DrawModelError);
    expect(() => applyDrawStylePatch(model, ['a'], { fill: 'javascript:alert(1)' })).toThrowError(DrawModelError);
    // Named CSS colours are accepted by the canonical pattern.
    expect(applyDrawStylePatch(model, ['a'], { fill: 'tomato' }).objects['a']!.vector?.style.fill).toBe('tomato');
  });

  it('locks and unlocks explicitly', () => {
    const locked = setDrawObjectsLocked(pair(), ['a'], true);
    expect(locked.objects['a']!.locked).toBe(true);
    expect(() => moveDrawObjects(locked, ['a'], { x: 1, y: 1 })).toThrowError(/object-locked/u);
    const unlocked = setDrawObjectsLocked(locked, ['a'], false);
    expect(unlocked.objects['a']!.locked).toBe(false);
    expect(() => setDrawObjectsLocked(pair(), ['a'], 'yes' as never)).toThrowError(DrawModelError);
  });

  it('aligns a selection by delegating to the canonical transform engine', () => {
    const model = pair();
    const aligned = alignDrawObjects(model, ['a', 'b'], 'align-top');
    expect(aligned.objects['a']!.y).toBe(100);
    expect(aligned.objects['b']!.y).toBe(100);
    const nudged = alignDrawObjects(model, ['a'], 'nudge', { x: 5, y: 5 });
    expect(nudged.objects['a']).toMatchObject({ x: 105, y: 105 });
  });

  it('inserts a library shape on the requested layer and reports selection bounds', () => {
    const model = pair();
    const inserted = insertDrawStencil(model, 'draw-core-shapes:decision', { x: 250, y: 250 }, 'layer-main', { idSeed: 'seed' });
    const created = Object.values(inserted.objects).find((object) => object.id.startsWith('seed-'));
    expect(created).toBeDefined();
    expect(created).toMatchObject({ x: 250, y: 250, layerId: 'layer-main' });
    expect(created!.zIndex).toBeGreaterThan(model.objects['pinned']!.zIndex);
    assertDrawDocument(inserted);
    expect(currentSelectionBounds(inserted, [created!.id])).toEqual({
      x: 250, y: 250, width: created!.width, height: created!.height,
    });
    expect(currentSelectionBounds(model, ['ghost'])).toBeNull();
    expect(() => insertDrawStencil(model, 'draw-core-shapes:decision', { x: 0, y: 0 }, 'layer-nope')).toThrowError(DrawModelError);
  });
});
