import { describe, expect, it } from 'vitest';
import { calculateCanvasBounds, estimateMemoryFootprint, WhiteboardSpatialIndex } from '../../rendering/whiteboardSpatialIndexEngine';
import { WHITEBOARD_MAX_ITEMS } from '../../types';
import type { WhiteboardItem } from '../../types';

const item = (id: string, x: number, y = 0, width = 20, height = 20): WhiteboardItem => ({
  id,
  type: 'shape',
  x,
  y,
  width,
  height,
  text: id,
});

describe('Whiteboard spatial index boundaries', () => {
  it('rejects invalid cell sizes before creating an unusable index', () => {
    for (const cellSize of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001]) {
      expect(() => new WhiteboardSpatialIndex(cellSize)).toThrow(RangeError);
    }
    expect(new WhiteboardSpatialIndex(1).getActiveCellCount()).toBe(0);
  });

  it('keeps rebuild atomic when duplicate identities or excess records are supplied', () => {
    const index = new WhiteboardSpatialIndex(16);
    const original = item('original', -10);
    index.rebuild([original]);

    expect(() => index.rebuild([item('duplicate', 0), item('duplicate', 100)])).toThrow('unique, non-empty item IDs');
    expect(index.queryPoint(-5, 5)).toEqual([original]);

    const oversized = new Array<WhiteboardItem>(WHITEBOARD_MAX_ITEMS + 1);
    expect(() => index.rebuild(oversized)).toThrow('item ceiling exceeded');
    expect(() => calculateCanvasBounds(oversized)).toThrow('item ceiling exceeded');
    expect(() => estimateMemoryFootprint(oversized)).toThrow('item ceiling exceeded');
    expect(index.queryPoint(-5, 5)).toEqual([original]);
  });

  it('replaces an incrementally inserted identity without leaving stale cell memberships', () => {
    const index = new WhiteboardSpatialIndex(16);
    const initial = item('moving', 0);
    const moved = item('moving', 640);
    index.insert(initial);
    index.insert(moved);

    expect(index.queryPoint(5, 5)).toEqual([]);
    expect(index.queryPoint(645, 5)).toEqual([moved]);
    expect(index.getActiveCellCount()).toBe(4);
  });

  it('falls back to bounded item scanning for huge viewports and rejects invalid queries', () => {
    const index = new WhiteboardSpatialIndex(1);
    const near = item('near', 250_000, -250_000);
    const far = item('far', 800_000, 800_000);
    index.rebuild([near, far]);

    expect(index.queryViewport({ minX: -1_000_000, minY: -1_000_000, maxX: 1_000_000, maxY: 1_000_000 }))
      .toEqual([near, far]);
    expect(index.queryViewport({ minX: 10, minY: 0, maxX: 0, maxY: 10 })).toEqual([]);
    expect(index.queryViewport({ minX: Number.NaN, minY: 0, maxX: 1, maxY: 1 })).toEqual([]);
    expect(index.queryPoint(Number.NaN, 0)).toEqual([]);
  });

  it('keeps oversized items queryable and removes their fallback entry', () => {
    const index = new WhiteboardSpatialIndex(1);
    const oversized = item('oversized', 0, 0, 100, 100);
    index.insert(oversized);

    expect(index.queryPoint(50, 50)).toEqual([oversized]);
    expect(index.queryPoint(150, 150)).toEqual([]);
    index.remove(oversized.id);
    expect(index.queryPoint(50, 50)).toEqual([]);
    expect(index.getActiveCellCount()).toBe(0);
  });
});
