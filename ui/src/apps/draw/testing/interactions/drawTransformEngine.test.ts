// STATUS: GOLD — hand-computed oracles for the eight-handle resize and rotation geometry.
import { describe, expect, it } from 'vitest';
import type { DrawObject } from '../../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from '../../model/drawDocumentValidation';
import {
  angleFromCenter,
  resizeDrawObject,
  resizeDrawObjectTo,
  rotateDrawObjectTo,
  translateDrawObject,
  translateDrawObjectSnapped,
} from '../../interactions/drawTransformEngine';
import { drawObjectCorners, drawObjectWorldBounds, handleWorldPoint } from '../../interactions/drawGeometry';

function shape(overrides: Partial<DrawObject> = {}): DrawObject {
  return {
    id: 'shape',
    pageId: 'page-1',
    layerId: 'layer-main',
    type: 'shape',
    name: 'shape',
    x: 100,
    y: 200,
    width: 80,
    height: 40,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    zIndex: 0,
    ...overrides,
  };
}

describe('Draw resize geometry (package 03)', () => {
  it('moves exactly one edge for edge grips and leaves the opposite edge fixed', () => {
    const source = shape();
    const east = resizeDrawObjectTo(source, 'e', { x: 220, y: 999 });
    expect(east).toMatchObject({ x: 100, y: 200, width: 120, height: 40 });

    const west = resizeDrawObjectTo(source, 'w', { x: 60, y: -999 });
    expect(west).toMatchObject({ x: 60, y: 200, width: 120, height: 40 });

    const north = resizeDrawObjectTo(source, 'n', { x: -999, y: 150 });
    expect(north).toMatchObject({ x: 100, y: 150, width: 80, height: 90 });

    const south = resizeDrawObjectTo(source, 's', { x: 999, y: 260 });
    expect(south).toMatchObject({ x: 100, y: 200, width: 80, height: 60 });
  });

  it('keeps the opposite corner pinned for every one of the eight grips', () => {
    const source = shape();
    const targets: Record<string, { x: number; y: number }> = {
      nw: { x: 60, y: 160 },
      n: { x: 140, y: 160 },
      ne: { x: 220, y: 160 },
      e: { x: 220, y: 220 },
      se: { x: 220, y: 280 },
      s: { x: 140, y: 280 },
      sw: { x: 60, y: 280 },
      w: { x: 60, y: 220 },
    };
    const opposite: Record<string, string> = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };
    for (const [handle, target] of Object.entries(targets)) {
      const before = handleWorldPoint(source, opposite[handle] as never);
      const resized = resizeDrawObjectTo(source, handle as never, target);
      const after = handleWorldPoint(resized, opposite[handle] as never);
      expect(after.x, handle).toBeCloseTo(before.x, 9);
      expect(after.y, handle).toBeCloseTo(before.y, 9);
      // The dragged grip lands on the requested target.
      const dragged = handleWorldPoint(resized, handle as never);
      expect(dragged.x, `${handle}.x`).toBeCloseTo(target.x, 9);
      expect(dragged.y, `${handle}.y`).toBeCloseTo(target.y, 9);
    }
  });

  it('pins the opposite corner in world space even when the shape is rotated', () => {
    for (const rotation of [15, 30, 45, 90, 137, 270]) {
      const source = shape({ rotation });
      const fixedBefore = handleWorldPoint(source, 'nw');
      const grip = handleWorldPoint(source, 'se');
      // Drag outward by exactly the current corner-to-corner vector, which doubles both extents.
      const target = { x: grip.x + (grip.x - fixedBefore.x), y: grip.y + (grip.y - fixedBefore.y) };
      const resized = resizeDrawObjectTo(source, 'se', target);
      const fixedAfter = handleWorldPoint(resized, 'nw');
      expect(fixedAfter.x, `rotation ${rotation}`).toBeCloseTo(fixedBefore.x, 8);
      expect(fixedAfter.y, `rotation ${rotation}`).toBeCloseTo(fixedBefore.y, 8);
      const dragged = handleWorldPoint(resized, 'se');
      expect(dragged.x, `rotation ${rotation}`).toBeCloseTo(target.x, 8);
      expect(dragged.y, `rotation ${rotation}`).toBeCloseTo(target.y, 8);
      expect(resized.rotation).toBe(rotation);
      expect(resized.width).toBeCloseTo(source.width * 2, 8);
      expect(resized.height).toBeCloseTo(source.height * 2, 8);
    }
  });

  it('keeps the anchor fixed in world space when a grip is dragged past it', () => {
    const source = shape();
    // Drag the south-east grip above and left of the north-west grip.
    const resized = resizeDrawObjectTo(source, 'se', { x: 80, y: 210 });
    expect(resized).toMatchObject({ x: 80, y: 200, width: 20, height: 10 });
    // The anchor (100,200) is still occupied by the box, now as its north-east corner.
    expect(handleWorldPoint(resized, 'ne')).toEqual({ x: 100, y: 200 });
    // And the dragged grip sits on the requested target, now as the south-west corner.
    expect(handleWorldPoint(resized, 'sw')).toEqual({ x: 80, y: 210 });
  });

  it('preserves the source aspect ratio for corner grips under keepAspect', () => {
    const source = shape({ width: 80, height: 40 });
    const free = resizeDrawObjectTo(source, 'se', { x: 400, y: 500 });
    expect(free.width / free.height).not.toBeCloseTo(2, 2);
    const locked = resizeDrawObjectTo(source, 'se', { x: 400, y: 500 }, { keepAspect: true });
    expect(locked.width / locked.height).toBeCloseTo(2, 9);
    expect(locked.x).toBeCloseTo(100, 9);
    expect(locked.y).toBeCloseTo(200, 9);
    // Edge grips keep their single-axis behaviour regardless of keepAspect.
    const edgeLocked = resizeDrawObjectTo(source, 'e', { x: 220, y: 999 }, { keepAspect: true });
    expect(edgeLocked).toMatchObject({ width: 120, height: 40 });
  });

  it('never produces a degenerate box, and clamps at the minimum size', () => {
    const source = shape();
    const collapsed = resizeDrawObjectTo(source, 'se', { x: 100, y: 200 });
    expect(collapsed.width).toBeGreaterThanOrEqual(1);
    expect(collapsed.height).toBeGreaterThanOrEqual(1);
    const past = resizeDrawObjectTo(source, 'se', { x: -500, y: -500 }, { minSize: 4 });
    expect(past.width).toBeGreaterThanOrEqual(4);
    expect(past.height).toBeGreaterThanOrEqual(4);
    expect(Number.isFinite(past.x)).toBe(true);
  });

  it('grows symmetrically around the centre in fromCenter mode', () => {
    const source = shape();
    // Centre x = 140; dragging the east grip to 200 gives a half-extent of 60, so width 120, x 80.
    const grown = resizeDrawObjectTo(source, 'e', { x: 200, y: 220 }, { fromCenter: true });
    expect(grown.x).toBeCloseTo(80, 9);
    expect(grown.width).toBeCloseTo(120, 9);
    expect(grown.height).toBe(40);
    expect(grown.y).toBeCloseTo(200, 9);
    const grownBoth = resizeDrawObjectTo(source, 'se', { x: 200, y: 260 }, { fromCenter: true });
    expect(grownBoth.width).toBeCloseTo(120, 9);
    expect(grownBoth.height).toBeCloseTo(80, 9);
    expect(grownBoth.x).toBeCloseTo(80, 9);
    expect(grownBoth.y).toBeCloseTo(180, 9);
  });

  it('applies the snap function in world space before measuring the box', () => {
    const source = shape();
    const snapped = resizeDrawObjectTo(
      source,
      'e',
      { x: 217, y: 220 },
      { snap: (point) => ({ x: Math.round(point.x / 16) * 16, y: point.y }) },
    );
    expect(snapped.width).toBeCloseTo(224 - 100, 9);
  });

  it('re-exported delta wrapper agrees with the target-based entry point', () => {
    const source = shape();
    const grip = handleWorldPoint(source, 'se');
    const viaDelta = resizeDrawObject(source, 'se', { x: 30, y: -10 });
    const viaTarget = resizeDrawObjectTo(source, 'se', { x: grip.x + 30, y: grip.y - 10 });
    expect(viaDelta).toEqual(viaTarget);
  });

  it('rejects unknown handles and non-finite targets', () => {
    expect(() => resizeDrawObjectTo(shape(), 'middle' as never, { x: 0, y: 0 })).toThrowError(DrawModelError);
    expect(() => resizeDrawObjectTo(shape(), 'se', { x: Number.NaN, y: 0 })).toThrowError(DrawModelError);
    expect(() => resizeDrawObjectTo(shape(), 'se', { x: 0, y: Number.POSITIVE_INFINITY })).toThrowError(DrawModelError);
    expect(() => resizeDrawObject(shape(), 'se', { x: 0, y: 0 }, { minSize: 0 })).toThrowError(DrawModelError);
  });
});

describe('Draw rotation geometry (package 03)', () => {
  it('maps pointer angles to SVG rotation with the grip starting at the top edge', () => {
    const source = shape();
    // Pointer straight above the centre -> rotation 0.
    expect(rotateDrawObjectTo(source, { x: 140, y: 100 }).rotation).toBeCloseTo(0, 6);
    // Pointer to the right of the centre -> 90 degrees.
    expect(rotateDrawObjectTo(source, { x: 300, y: 220 }).rotation).toBeCloseTo(90, 6);
    expect(rotateDrawObjectTo(source, { x: 140, y: 400 }).rotation).toBeCloseTo(180, 6);
    expect(rotateDrawObjectTo(source, { x: 0, y: 220 }).rotation).toBeCloseTo(270, 6);
  });

  it('snaps rotation to the requested step', () => {
    const source = shape();
    const free = rotateDrawObjectTo(source, { x: 240, y: 140 });
    expect(free.rotation).toBeGreaterThan(0);
    const snapped = rotateDrawObjectTo(source, { x: 240, y: 140 }, { snapStep: 15 });
    expect(snapped.rotation % 15).toBe(0);
    const quarter = rotateDrawObjectTo(source, { x: 240, y: 140 }, { snapStep: 90 });
    expect([0, 90, 180, 270]).toContain(quarter.rotation);
  });

  it('keeps the box centre when rotating about the default centre', () => {
    const source = shape();
    const rotated = rotateDrawObjectTo(source, { x: 300, y: 220 });
    expect(rotated.x).toBe(source.x);
    expect(rotated.y).toBe(source.y);
    expect(rotated.width).toBe(source.width);
    expect(rotated.height).toBe(source.height);
  });

  it('keeps the requested origin fixed when rotating about an external pivot', () => {
    const source = shape();
    const pivot = { x: 100, y: 200 };
    const rotated = rotateDrawObjectTo(source, { x: 300, y: 200 }, { center: pivot });
    const before = drawObjectCorners(source);
    const after = drawObjectCorners(rotated);
    for (let index = 0; index < 4; index += 1) {
      const radiusBefore = Math.hypot(before[index]!.x - pivot.x, before[index]!.y - pivot.y);
      const radiusAfter = Math.hypot(after[index]!.x - pivot.x, after[index]!.y - pivot.y);
      expect(radiusAfter).toBeCloseTo(radiusBefore, 8);
    }
  });

  it('keeps rotated world bounds consistent with the corners', () => {
    const source = shape({ rotation: 37 });
    const bounds = drawObjectWorldBounds(source);
    for (const corner of drawObjectCorners(source)) {
      expect(corner.x).toBeGreaterThanOrEqual(bounds.x - 1e-9);
      expect(corner.y).toBeGreaterThanOrEqual(bounds.y - 1e-9);
      expect(corner.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-9);
      expect(corner.y).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-9);
    }
  });

  it('rejects a degenerate pointer and out-of-range snap steps', () => {
    const source = shape();
    expect(() => angleFromCenter({ x: 1, y: 1 }, { x: 1, y: 1 })).toThrowError(DrawModelError);
    expect(() => rotateDrawObjectTo(source, { x: 1, y: 1 }, { snapStep: -1 })).toThrowError(DrawModelError);
    expect(() => rotateDrawObjectTo(source, { x: 1, y: 1 }, { snapStep: 400 })).toThrowError(DrawModelError);
  });
});

describe('Draw translation', () => {
  it('translates without touching size or rotation', () => {
    const moved = translateDrawObject(shape({ rotation: 20 }), { x: 5, y: -7 });
    expect(moved).toMatchObject({ x: 105, y: 193, width: 80, height: 40, rotation: 20 });
  });

  it('reports the snapped delta that snapping actually accepted', () => {
    const result = translateDrawObjectSnapped(shape(), { x: 13, y: 3 }, (point) => ({
      x: Math.round(point.x / 16) * 16,
      y: Math.round(point.y / 16) * 16,
    }));
    expect(result.snapped).toBe(true);
    // 113 -> 112 and 203 -> 208 on a 16-unit grid.
    expect(result.applied).toEqual({ x: 12, y: 8 });
    expect(result.object.x).toBe(112);
    expect(result.object.y).toBe(208);
  });

  it('reports no snapping when the cursor already sits on the candidate', () => {
    const result = translateDrawObjectSnapped(shape({ x: 112, y: 208 }), { x: 0, y: 0 }, (point) => point);
    expect(result.snapped).toBe(false);
    expect(result.applied).toEqual({ x: 0, y: 0 });
  });
});
