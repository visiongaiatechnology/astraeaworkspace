// STATUS: GOLD — bounds proof for the Draw spatial index against a brute-force oracle.
import { describe, expect, it } from 'vitest';
import { DrawModelError } from '../../model/drawDocumentValidation';
import { drawObjectWorldBounds, drawBoundsIntersect } from '../../interactions/drawGeometry';
import { projectDrawScene } from '../../interactions/drawSceneProjection';
import {
  MAX_DRAW_INDEX_CELLS,
  buildDrawSpatialIndex,
  queryDrawSpatialIndex,
  queryDrawSpatialIndexExact,
} from '../../interactions/drawSpatialIndex';
import { buildDrawModel } from './drawInteractionFixtures';

function grid(n: number, step: number) {
  const objects = [];
  for (let index = 0; index < n; index += 1) {
    objects.push({
      id: `shape-${index}`,
      x: (index % 25) * step,
      y: Math.floor(index / 25) * step,
      width: 40,
      height: 30,
      zIndex: index,
    });
  }
  return buildDrawModel({ objects });
}

describe('Draw spatial index', () => {
  it('never allocates more than the hard cell ceiling, even for a pathological page', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', x: 5_000_000, y: 5_000_000, width: 10, height: 10 },
      ],
    });
    const scene = projectDrawScene(model, 'page-1');
    const index = buildDrawSpatialIndex(scene, scene.entries);
    expect(index.columns * index.rows).toBeLessThanOrEqual(MAX_DRAW_INDEX_CELLS);
    expect(index.cells.size).toBeLessThanOrEqual(MAX_DRAW_INDEX_CELLS);
    // Both extremes stay findable even with a single coarse cell.
    const near = queryDrawSpatialIndexExact(index, scene, { x: 0, y: 0, width: 10, height: 10 }, 10);
    expect(near.map((entry) => entry.object.id)).toEqual(['a']);
    const far = queryDrawSpatialIndexExact(index, scene, { x: 5_000_000, y: 5_000_000, width: 10, height: 10 }, 10);
    expect(far.map((entry) => entry.object.id)).toEqual(['b']);
  });

  it('collapses the grid further when the requested target is too fine', () => {
    const model = buildDrawModel({
      objects: [
        { id: 'a', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', x: 1_000_000, y: 1_000_000, width: 10, height: 10 },
      ],
    });
    const scene = projectDrawScene(model, 'page-1');
    const index = buildDrawSpatialIndex(scene, scene.entries, MAX_DRAW_INDEX_CELLS);
    expect(index.columns * index.rows).toBeLessThanOrEqual(MAX_DRAW_INDEX_CELLS);
  });

  it('answers queries identically to a brute-force scan', () => {
    const model = grid(200, 90);
    const scene = projectDrawScene(model, 'page-1');
    const index = buildDrawSpatialIndex(scene, scene.entries);
    const rects = [
      { x: 0, y: 0, width: 200, height: 200 },
      { x: 800, y: 400, width: 300, height: 300 },
      { x: -500, y: -500, width: 100, height: 100 },
      { x: 100, y: 100, width: 1, height: 1 },
    ];
    for (const rect of rects) {
      const brute = scene.entries
        .filter((entry) => drawBoundsIntersect(drawObjectWorldBounds(entry.object), rect))
        .map((entry) => entry.object.id)
        .sort();
      const indexed = queryDrawSpatialIndexExact(index, scene, rect, scene.entries.length)
        .map((entry) => entry.object.id)
        .sort();
      expect(indexed, JSON.stringify(rect)).toEqual(brute);
    }
  });

  it('respects the query limit so marquee candidate sets stay bounded', () => {
    const model = grid(200, 90);
    const scene = projectDrawScene(model, 'page-1');
    const index = buildDrawSpatialIndex(scene, scene.entries);
    const all = queryDrawSpatialIndex(index, { x: 0, y: 0, width: 100_000, height: 100_000 }, 10_000);
    expect(all.length).toBe(200);
    const capped = queryDrawSpatialIndex(index, { x: 0, y: 0, width: 100_000, height: 100_000 }, 25);
    expect(capped.length).toBe(25);
    const exact = queryDrawSpatialIndexExact(index, scene, { x: 0, y: 0, width: 100_000, height: 100_000 }, 25);
    expect(exact.length).toBe(25);
  });

  it('returns ids without duplicates when a shape spans several cells', () => {
    const model = buildDrawModel({ objects: [{ id: 'wide', x: 0, y: 0, width: 2000, height: 10 }] });
    const scene = projectDrawScene(model, 'page-1');
    const index = buildDrawSpatialIndex(scene, scene.entries);
    const ids = queryDrawSpatialIndex(index, { x: 0, y: 0, width: 2000, height: 10 }, 100);
    expect(ids).toEqual(['wide']);
  });

  it('rejects an out-of-range target or limit instead of degrading silently', () => {
    const scene = projectDrawScene(grid(4, 10), 'page-1');
    expect(() => buildDrawSpatialIndex(scene, scene.entries, 0)).toThrowError(DrawModelError);
    expect(() => buildDrawSpatialIndex(scene, scene.entries, 1.5)).toThrowError(DrawModelError);
    const index = buildDrawSpatialIndex(scene, scene.entries);
    expect(() => queryDrawSpatialIndex(index, { x: 0, y: 0, width: 1, height: 1 }, 0)).toThrowError(DrawModelError);
  });

  it('stays fast enough for 500 shapes: 300 point queries under the frame budget', () => {
    const model = grid(500, 90);
    const scene = projectDrawScene(model, 'page-1');
    const started = performance.now();
    const index = buildDrawSpatialIndex(scene, scene.entries);
    for (let index2 = 0; index2 < 300; index2 += 1) {
      queryDrawSpatialIndexExact(index, scene, { x: index2 * 3, y: index2 * 2, width: 60, height: 40 }, 64);
    }
    const elapsed = performance.now() - started;
    // Measured headroom: this is a generous ceiling for 300 bounded queries in Node.
    expect(elapsed).toBeLessThan(2000);
  });
});
