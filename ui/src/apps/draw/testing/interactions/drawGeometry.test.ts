// STATUS: GOLD — hand-written oracles for the pure Draw geometry primitives.
import { describe, expect, it } from 'vitest';
import { DrawModelError } from '../../model/drawDocumentValidation';
import {
  DRAW_RESIZE_HANDLES,
  boundsOfPoints,
  distanceToSegment,
  drawBoundsContain,
  drawBoundsIntersect,
  drawObjectCorners,
  drawObjectWorldBounds,
  expandDrawBounds,
  handleAnchor,
  handleWorldPoint,
  localToWorld,
  normalizeDegrees,
  normalizedBounds,
  oppositeHandle,
  pointInDrawBounds,
  pointInDrawObject,
  roundToStep,
  rotatePointAround,
  snapDegrees,
  worldDeltaToLocalDelta,
} from '../../interactions/drawGeometry';

const box = { x: 100, y: 200, width: 80, height: 40, rotation: 0 };

describe('Draw geometry primitives', () => {
  it('exposes exactly the eight clockwise resize handles required by package 03', () => {
    expect([...DRAW_RESIZE_HANDLES]).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
    expect(handleAnchor('nw')).toEqual({ x: 0, y: 0 });
    expect(handleAnchor('se')).toEqual({ x: 1, y: 1 });
    expect(handleAnchor('n')).toEqual({ x: 0.5, y: 0 });
    expect(handleAnchor('w')).toEqual({ x: 0, y: 0.5 });
    for (const handle of DRAW_RESIZE_HANDLES) {
      const opposite = oppositeHandle(handle);
      expect(opposite).not.toBe(handle);
      expect(oppositeHandle(opposite)).toBe(handle);
      expect(handleWorldPoint(box, handle)).toEqual(localToWorld(box, {
        x: box.width * handleAnchor(handle).x,
        y: box.height * handleAnchor(handle).y,
      }));
    }
    expect(handleWorldPoint(box, 'nw')).toEqual({ x: 100, y: 200 });
    expect(handleWorldPoint(box, 'se')).toEqual({ x: 180, y: 240 });
    expect(handleWorldPoint(box, 'e')).toEqual({ x: 180, y: 220 });
  });

  it('rotates 90 degrees clockwise around a centre without drift', () => {
    const center = { x: 0, y: 0 };
    const rotated = rotatePointAround({ x: 10, y: 0 }, center, 90);
    expect(rotated.x).toBeCloseTo(0, 10);
    expect(rotated.y).toBeCloseTo(10, 10);
    expect(rotatePointAround(rotated, center, -90).x).toBeCloseTo(10, 10);
  });

  it('round-trips world deltas through the inverse rotation', () => {
    for (const rotation of [0, 30, 45, 90, 180, 270, -37.5]) {
      const local = worldDeltaToLocalDelta({ x: 13, y: -7 }, rotation);
      const back = rotatePointAround(local, { x: 0, y: 0 }, rotation);
      expect(back.x).toBeCloseTo(13, 9);
      expect(back.y).toBeCloseTo(-7, 9);
    }
  });

  it('places rotated corners on the circle around the object centre', () => {
    const rotated = { x: 0, y: 0, width: 100, height: 100, rotation: 45 };
    const corners = drawObjectCorners(rotated);
    expect(corners).toHaveLength(4);
    const center = { x: 50, y: 50 };
    for (const corner of corners) {
      expect(Math.hypot(corner.x - center.x, corner.y - center.y)).toBeCloseTo(Math.hypot(50, 50), 9);
    }
    // 45-degree rotation puts the top-left corner directly above the centre.
    expect(corners[0]!.x).toBeCloseTo(50, 9);
    expect(corners[0]!.y).toBeCloseTo(50 - Math.hypot(50, 50), 9);
    const world = drawObjectWorldBounds(rotated);
    expect(world.width).toBeCloseTo(Math.hypot(100, 100), 9);
    expect(world.x).toBeCloseTo(50 - Math.hypot(50, 50), 9);
  });

  it('hit-tests inside rotated boxes and rejects points outside them', () => {
    const rotated = { x: 0, y: 0, width: 100, height: 20, rotation: 90 };
    // Rotated 90 degrees around (50,10): the box now spans x in [40,60], y in [-40,60].
    expect(pointInDrawObject(rotated, { x: 50, y: -30 })).toBe(true);
    expect(pointInDrawObject(rotated, { x: 50, y: 40 })).toBe(true);
    expect(pointInDrawObject(rotated, { x: 5, y: 5 })).toBe(false);
    expect(pointInDrawObject(rotated, { x: 70, y: 10 })).toBe(false);
    expect(pointInDrawObject(rotated, { x: 70, y: 10 }, 15)).toBe(true);
  });

  it('normalizes bounds, containment and intersection independently of corner order', () => {
    expect(normalizedBounds({ x: 10, y: 10 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(boundsOfPoints([{ x: 5, y: 5 }, { x: -5, y: 12 }])).toEqual({ x: -5, y: 5, width: 10, height: 7 });
    const outer = { x: 0, y: 0, width: 100, height: 100 };
    expect(drawBoundsContain(outer, { x: 10, y: 10, width: 10, height: 10 })).toBe(true);
    expect(drawBoundsContain(outer, { x: 95, y: 95, width: 10, height: 10 })).toBe(false);
    expect(drawBoundsIntersect(outer, { x: 95, y: 95, width: 10, height: 10 })).toBe(true);
    expect(drawBoundsIntersect(outer, { x: 101, y: 0, width: 10, height: 10 })).toBe(false);
    expect(expandDrawBounds(outer, 5)).toEqual({ x: -5, y: -5, width: 110, height: 110 });
    expect(pointInDrawBounds({ x: 100, y: 100 }, outer)).toBe(true);
    expect(pointInDrawBounds({ x: 101, y: 100 }, outer)).toBe(false);
    expect(pointInDrawBounds({ x: 101, y: 100 }, outer, 2)).toBe(true);
  });

  it('measures point-to-segment distance including degenerate segments', () => {
    expect(distanceToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5, 10);
    expect(distanceToSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5, 10);
    expect(distanceToSegment({ x: 0, y: 3 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(3, 10);
  });

  it('normalizes and snaps angles deterministically', () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(450)).toBe(90);
    expect(snapDegrees(-7, 15)).toBe(0);
    expect(snapDegrees(8, 15)).toBe(15);
    expect(snapDegrees(350, 15)).toBe(345);
    expect(roundToStep(17, 16)).toBe(16);
  });

  it('rejects non-finite geometry instead of silently producing NaN', () => {
    expect(() => localToWorld({ ...box, rotation: Number.NaN }, { x: 0, y: 0 })).toThrowError(DrawModelError);
    expect(() => pointInDrawObject({ x: 0, y: 0, width: -1, height: 1, rotation: 0 }, { x: 0, y: 0 })).toThrowError(DrawModelError);
    expect(() => normalizedBounds({ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 })).toThrowError(DrawModelError);
    expect(() => boundsOfPoints([])).toThrowError(DrawModelError);
    expect(() => expandDrawBounds({ x: 0, y: 0, width: 1, height: 1 }, -1)).toThrowError(DrawModelError);
    expect(() => normalizeDegrees(Number.NaN)).toThrowError(DrawModelError);
  });
});
