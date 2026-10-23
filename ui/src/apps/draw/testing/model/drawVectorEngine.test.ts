import { describe, expect, it } from 'vitest';
import type { DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import {
  createNonDestructiveBooleanObject,
  createVectorShape,
  DEFAULT_DRAW_STYLE,
  objectBounds,
  reorderZ,
  transformDrawObjects,
  updateVectorStyle,
} from '../../model/drawVectorEngine';

function shape(id: string, x: number, options: { width?: number; locked?: boolean; pageId?: string } = {}): DrawObject {
  return createVectorShape({
    id,
    pageId: options.pageId ?? 'page-1',
    layerId: 'layer-1',
    name: `Shape ${id}`,
    x,
    y: 12,
    width: options.width ?? 20,
    height: 10,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: options.locked ?? false,
    zIndex: x,
    vector: { kind: 'rectangle' },
  });
}

describe('Draw vector engine', () => {
  it('creates normalized shapes and blocks SVG URL paint values', () => {
    const sourcePoint = { x: 1, y: 2 };
    const created = createVectorShape({
      ...shape('shape-safe', 1),
      vector: { kind: 'freehand', style: { fill: 'violet' }, points: [sourcePoint] },
    });

    expect(created.vector?.style.fill).toBe('violet');
    expect(created.vector?.style.stroke).toBe(DEFAULT_DRAW_STYLE.stroke);
    expect(created.vector?.points).toEqual([{ x: 1, y: 2 }]);
    expect(created.vector?.points?.[0]).not.toBe(sourcePoint);
    expect(Object.isFrozen(DEFAULT_DRAW_STYLE)).toBe(true);
    expect(Object.isFrozen(DEFAULT_DRAW_STYLE.dash)).toBe(true);
    expect(() => createVectorShape({
      ...shape('shape-hostile', 1),
      vector: { kind: 'rectangle', style: { fill: 'url(javascript:alert(1))' } },
    })).toThrow(/style-color-invalid/u);
  });

  it('updates styles immutably and validates patches', () => {
    const original = shape('shape-style', 3);
    const updated = updateVectorStyle(original, { stroke: '#334155', strokeWidth: 4 });

    expect(updated.vector?.style.stroke).toBe('#334155');
    expect(updated.vector?.style.strokeWidth).toBe(4);
    expect(updated).not.toBe(original);
    expect(original.vector?.style.stroke).toBe(DEFAULT_DRAW_STYLE.stroke);
    expect(() => updateVectorStyle(original, { fill: 'url(https://attacker.invalid/a.svg#x)' })).toThrow(/style-color-invalid/u);
    expect(() => updateVectorStyle(original, { strokeWidth: Number.NaN })).toThrow(/style-stroke-width-invalid/u);
  });

  it('transforms bounded object sets, preserving locked objects and source records', () => {
    const input = [shape('shape-a', 10), shape('shape-lock', 40, { locked: true, width: 20 }), shape('shape-c', 100)];
    const aligned = transformDrawObjects(input, 'align-left');
    const nudged = transformDrawObjects(input, 'nudge', { x: 2, y: -3 });

    expect(aligned.map((object) => object.x)).toEqual([10, 40, 10]);
    expect(nudged.map((object) => [object.x, object.y])).toEqual([[12, 9], [40, 12], [102, 9]]);
    expect(input.map((object) => object.x)).toEqual([10, 40, 100]);
    expect(() => transformDrawObjects(input, 'unknown' as never)).toThrow(/transform-operation-invalid/u);
    expect(() => transformDrawObjects([shape('shape-edge', 1_000_000_000)], 'nudge', { x: 1_000_000_000, y: 0 }))
      .toThrow(/object-geometry-invalid/u);
  });

  it('distributes editable objects deterministically around locked anchors', () => {
    const input = [shape('shape-a', 0), shape('shape-b', 10), shape('shape-lock', 50, { locked: true }), shape('shape-d', 90)];
    const distributed = transformDrawObjects(input, 'distribute-x');

    expect(distributed.map((object) => object.x)).toEqual([0, 25, 50, 90]);
  });

  it('reorders z values and rejects stale selection identities', () => {
    const input = [shape('shape-a', 0), shape('shape-b', 1), shape('shape-c', 2)];
    const reordered = reorderZ(input, ['shape-a'], 'front');

    expect(reordered.map((object) => object.id)).toEqual(['shape-b', 'shape-c', 'shape-a']);
    expect(reordered.map((object) => object.zIndex)).toEqual([0, 1, 2]);
    expect(() => reorderZ(input, ['missing'], 'front')).toThrow(/z-order-object-missing/u);
    expect(() => reorderZ(input, ['shape-a', 'shape-a'], 'front')).toThrow(/z-order-selection-duplicate/u);
  });

  it('creates boolean source references only within one page and layer', () => {
    const sources = [shape('shape-a', 0), shape('shape-b', 15, { width: 30 })];
    const compound = createNonDestructiveBooleanObject('shape-union', 'page-1', 'layer-1', sources, 'union', 4);

    expect(compound.vector?.compound).toEqual({ operation: 'union', sourceObjectIds: ['shape-a', 'shape-b'], sourceRevision: 4 });
    expect(objectBounds(compound)).toEqual({ x: 0, y: 12, width: 45, height: 10 });
    expect(() => createNonDestructiveBooleanObject('shape-cross', 'page-1', 'layer-1', [
      sources[0], shape('shape-other-page', 20, { pageId: 'page-2' }),
    ], 'union', 4)).toThrow(/boolean-source-invalid/u);
  });
});
