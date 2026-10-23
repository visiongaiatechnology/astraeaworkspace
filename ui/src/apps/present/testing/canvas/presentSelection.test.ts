// BATCH-PRESENT — object selector contract (Paket 8, 10).
// The oracle values are written by hand from the requested behaviour, not read back from the code.
import { describe, expect, it } from 'vitest';
import {
  PRESENT_MAX_SELECTION_SIZE,
  cyclePresentSelection,
  hitTestPresentObject,
  normalizePresentSelection,
  pickPresentObjectInStack,
  presentObjectsInMarquee,
  presentObjectsOverlappingPoint,
  presentSelectionBounds,
  presentSelectionLabel,
  presentSelectionPrimary,
  selectAllPresentObjects,
  togglePresentSelection,
  type PresentSelectableObject,
} from '../../canvas/model/presentSelection';
import { presentAspectRatioValue, presentObjectRect } from '../../canvas/model/presentRect';

const object = (patch: Partial<PresentSelectableObject> & { id: string }): PresentSelectableObject => ({
  xPercent: 0,
  yPercent: 0,
  widthPercent: 20,
  heightPercent: 10,
  zIndex: 1,
  ...patch,
});

describe('Present object selector', () => {
  it('selects the topmost object by z-order and falls back to document order on a z tie', () => {
    const bottom = object({ id: 'bottom', zIndex: 1 });
    const tieEarlier = object({ id: 'tie-earlier', zIndex: 5 });
    const tieLater = object({ id: 'tie-later', zIndex: 5 });
    const objects = [bottom, tieEarlier, tieLater];
    // Hand-written expectation: z 5 wins over z 1; between two z=5 objects the one rendered last wins.
    expect(hitTestPresentObject(objects, { xPercent: 5, yPercent: 5 })?.id).toBe('tie-later');
    expect(presentObjectsOverlappingPoint(objects, { xPercent: 5, yPercent: 5 }).map((o) => o.id)).toEqual([
      'tie-later',
      'tie-earlier',
      'bottom',
    ]);
  });

  it('never selects a hidden object and reports an empty hit outside every object', () => {
    const objects = [object({ id: 'a' }), object({ id: 'hidden', hidden: true })];
    expect(hitTestPresentObject(objects, { xPercent: 1, yPercent: 1 })?.id).toBe('a');
    expect(hitTestPresentObject(objects, { xPercent: 90, yPercent: 90 })).toBeNull();
  });

  it('expands the hit box for rotated objects because percent space is anisotropic', () => {
    const rotated = object({ id: 'r', xPercent: 40, yPercent: 40, widthPercent: 20, heightPercent: 20, rotation: 45 });
    const rect = presentObjectRect(rotated, presentAspectRatioValue('16:9'));
    // 16:9 physical box is 20*1.7778 x 20 = 35.56 x 20 percent-units; at 45 deg the boxed extent is
    // (35.56+20)/sqrt(2) = 39.27 percent-units wide and 39.27 high, i.e. 22.09 percent of the width.
    expect(rect.widthPercent).toBeCloseTo(22.09, 1);
    expect(rect.heightPercent).toBeCloseTo(39.27, 1);
    // A point above the unrotated box but inside the rotated bounding box is a hit.
    expect(hitTestPresentObject([rotated], { xPercent: 50, yPercent: 31 })?.id).toBe('r');
  });

  it('marquee-selects only intersecting visible objects', () => {
    const objects = [
      object({ id: 'inside', xPercent: 10, yPercent: 10 }),
      object({ id: 'outside', xPercent: 80, yPercent: 80 }),
      object({ id: 'hidden', xPercent: 12, yPercent: 12, hidden: true }),
    ];
    const ids = presentObjectsInMarquee(objects, { xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 30 }).map((o) => o.id);
    expect(ids).toEqual(['inside']);
  });

  it('cycles through the z-stack at a point so a covered object stays reachable', () => {
    const objects = [object({ id: 'low', zIndex: 1 }), object({ id: 'high', zIndex: 9 })];
    expect(pickPresentObjectInStack(objects, { xPercent: 1, yPercent: 1 }, null)?.id).toBe('high');
    expect(pickPresentObjectInStack(objects, { xPercent: 1, yPercent: 1 }, 'high')?.id).toBe('low');
    expect(pickPresentObjectInStack(objects, { xPercent: 1, yPercent: 1 }, 'low')?.id).toBe('high');
  });

  it('cycles the keyboard selection forward and backward with wrap-around', () => {
    const objects = [object({ id: 'a', zIndex: 1 }), object({ id: 'b', zIndex: 2 }), object({ id: 'c', zIndex: 3 })];
    expect(cyclePresentSelection(objects, [], 1)).toEqual(['a']);
    expect(cyclePresentSelection(objects, [], -1)).toEqual(['c']);
    expect(cyclePresentSelection(objects, ['b'], 1)).toEqual(['c']);
    expect(cyclePresentSelection(objects, ['c'], 1)).toEqual(['a']);
    expect(cyclePresentSelection(objects, ['a'], -1)).toEqual(['c']);
  });

  it('toggles an additive selection but never leaves the selection empty', () => {
    const objects = [object({ id: 'a' }), object({ id: 'b' })];
    expect(togglePresentSelection(objects, ['a'], 'b', true)).toEqual(['a', 'b']);
    expect(togglePresentSelection(objects, ['a', 'b'], 'b', true)).toEqual(['a']);
    expect(togglePresentSelection(objects, ['a'], 'a', true)).toEqual(['a']);
    expect(togglePresentSelection(objects, ['a'], 'b', false)).toEqual(['b']);
    expect(togglePresentSelection(objects, ['a'], 'missing', true)).toEqual(['a']);
  });

  it('normalises a selection: drops unknown and hidden ids, dedupes, keeps render order, caps size', () => {
    const objects = [object({ id: 'a', zIndex: 2 }), object({ id: 'b', zIndex: 1 }), object({ id: 'c', hidden: true })];
    expect(normalizePresentSelection(objects, ['a', 'a', 'ghost', 'c'])).toEqual(['a']);
    expect(normalizePresentSelection(objects, ['a', 'b'])).toEqual(['b', 'a']);
    const many = Array.from({ length: PRESENT_MAX_SELECTION_SIZE + 25 }, (_, index) => object({ id: `o-${index}` }));
    expect(normalizePresentSelection(many, many.map((item) => item.id)).length).toBe(PRESENT_MAX_SELECTION_SIZE);
    expect(selectAllPresentObjects(many).length).toBe(PRESENT_MAX_SELECTION_SIZE);
  });

  it('reports union bounds, primary object and a colour-free selection label', () => {
    const objects = [object({ id: 'a', xPercent: 10, yPercent: 10 }), object({ id: 'b', xPercent: 40, yPercent: 30 })];
    expect(presentSelectionBounds(objects, ['a', 'b'])).toEqual({ xPercent: 10, yPercent: 10, widthPercent: 50, heightPercent: 30 });
    expect(presentSelectionBounds(objects, [])).toBeNull();
    expect(presentSelectionPrimary(objects, ['a', 'b'])?.id).toBe('b');
    expect(presentSelectionLabel(objects, [])).toBe('No object selected');
    expect(presentSelectionLabel(objects, ['a', 'b'])).toBe('2 objects selected');
  });
});
