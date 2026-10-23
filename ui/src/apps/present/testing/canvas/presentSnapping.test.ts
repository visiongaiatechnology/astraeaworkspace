// BATCH-PRESENT — snapping and smart guides (Paket 8, 10). Hand-written oracle.
import { describe, expect, it } from 'vitest';
import {
  PRESENT_DEFAULT_SNAP_TOLERANCE_PERCENT,
  computePresentSnapGeometry,
} from '../../canvas/model/presentSnapping';
import { snapPresentGeometry, snapPresentGeometryWithGuides } from '../../canvas/model/presentScene';
import { presentAspectRatioValue } from '../../canvas/model/presentRect';
import type { PresentSceneObject } from '../../../../shared/contracts/workspace';

const shape = (patch: Partial<PresentSceneObject> & { id: string }): PresentSceneObject =>
  ({
    kind: 'shape',
    shape: 'rectangle',
    fillColor: '#000',
    strokeColor: '#fff',
    strokeWidth: 1,
    xPercent: 0,
    yPercent: 0,
    widthPercent: 20,
    heightPercent: 10,
    zIndex: 1,
    ...patch,
  }) as PresentSceneObject;

describe('Present snapping', () => {
  it('snaps to the nearest slide target, not to the first one inside the tolerance window', () => {
    // Right edge sits at 100; centre target is (100-20)/2 = 40. x=39.6 is 0.4 from the centre
    // target and 60.4 from the left edge, so the centre must win even though 0 is checked first.
    const outcome = computePresentSnapGeometry({ xPercent: 39.6, yPercent: 50, widthPercent: 20, heightPercent: 10 });
    expect(outcome.xPercent).toBe(40);
    expect(outcome.guides).toEqual([{ axis: 'x', positionPercent: 40, kind: 'slide-center', sourceId: undefined }]);
  });

  it('snaps to another object edge and centre and names the source object in the guide', () => {
    const neighbour = shape({ id: 'neighbour', xPercent: 50, yPercent: 0, widthPercent: 30, heightPercent: 10 });
    const outcome = computePresentSnapGeometry(
      { xPercent: 50.4, yPercent: 70, widthPercent: 20, heightPercent: 10 },
      { candidates: [neighbour] },
    );
    expect(outcome.xPercent).toBe(50);
    expect(outcome.guides.find((guide) => guide.axis === 'x')).toEqual({
      axis: 'x',
      positionPercent: 50,
      kind: 'object-edge',
      sourceId: 'neighbour',
    });
  });

  it('snaps to the centre of a neighbour', () => {
    const neighbour = shape({ id: 'n', xPercent: 10, yPercent: 0, widthPercent: 40, heightPercent: 10 });
    const outcome = computePresentSnapGeometry(
      { xPercent: 19.8, yPercent: 70, widthPercent: 20, heightPercent: 10 },
      { candidates: [neighbour] },
    );
    // Neighbour centre is 30; a 20-wide object centred on it sits at 20.
    expect(outcome.xPercent).toBe(20);
    expect(outcome.guides.find((guide) => guide.axis === 'x')?.kind).toBe('object-center');
  });

  it('is zoom independent: the same percent input snaps identically for every slide size', () => {
    for (const ratio of ['16:9', '16:10', '4:3', 'A4']) {
      const outcome = computePresentSnapGeometry(
        { xPercent: 39.4, yPercent: 50, widthPercent: 20, heightPercent: 10 },
        { tolerancePercent: 1, aspectRatio: presentAspectRatioValue(ratio) },
      );
      expect(outcome.xPercent, ratio).toBe(40);
    }
  });

  it('leaves a position alone outside the tolerance window and can snap to a grid', () => {
    const far = computePresentSnapGeometry({ xPercent: 30, yPercent: 30, widthPercent: 20, heightPercent: 10 });
    expect(far.xPercent).toBe(30);
    expect(far.guides).toEqual([]);
    expect(far.snappedX).toBe(false);
    const grid = computePresentSnapGeometry(
      { xPercent: 23.1, yPercent: 23.1, widthPercent: 20, heightPercent: 10 },
      { gridPercent: 5, tolerancePercent: 0.1 },
    );
    expect(grid.xPercent).toBe(25);
    expect(grid.yPercent).toBe(25);
    expect(grid.guides.every((guide) => guide.kind === 'grid')).toBe(true);
  });

  it('rejects malformed input instead of producing NaN geometry', () => {
    const outcome = computePresentSnapGeometry(
      { xPercent: Number.NaN, yPercent: Number.NaN, widthPercent: Number.NaN, heightPercent: Number.NaN },
      { tolerancePercent: Number.NaN, aspectRatio: Number.NaN },
    );
    expect(Number.isFinite(outcome.xPercent)).toBe(true);
    expect(Number.isFinite(outcome.yPercent)).toBe(true);
  });

  it('keeps the legacy snapPresentGeometry entry point and normalises the result', () => {
    const object = shape({ id: 'a', xPercent: 39.6, yPercent: 0 });
    expect(snapPresentGeometry(object, PRESENT_DEFAULT_SNAP_TOLERANCE_PERCENT).xPercent).toBe(40);
    expect(snapPresentGeometry(object, { candidates: [] }).xPercent).toBe(40);
    const withGuides = snapPresentGeometryWithGuides(object, { tolerancePercent: 1.5 });
    expect(withGuides.guides[0]?.positionPercent).toBe(40);
    expect(withGuides.object.xPercent).toBe(40);
  });
});
