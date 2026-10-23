// BATCH-PRESENT — keyboard/command transforms (Paket 5, 8). Hand-written oracle.
import { describe, expect, it } from 'vitest';
import type { PresentSceneObject } from '../../../../shared/contracts/workspace';
import {
  PRESENT_MIN_OBJECT_HEIGHT_PERCENT,
  PRESENT_NUDGE_STEP_PERCENT,
  deletePresentSelection,
  flipPresentSelection,
  presentRotationLabel,
  nudgePresentSelection,
  resizePresentSelection,
  rotatePresentSelection,
  setPresentSelectionHidden,
  setPresentSelectionLocked,
} from '../../canvas/model/presentTransform';
import { readPresentFlip, presentFlipTransform } from '../../canvas/model/presentObjectExtensions';

const text = (patch: Partial<PresentSceneObject> & { id: string }): PresentSceneObject =>
  ({
    kind: 'text',
    text: 'x',
    fontSizePt: 18,
    color: '#ffffff',
    xPercent: 0,
    yPercent: 0,
    widthPercent: 20,
    heightPercent: 10,
    zIndex: 1,
    ...patch,
  }) as PresentSceneObject;

describe('Present selection transforms', () => {
  it('nudges a multi-object selection by one shared delta so relative offsets survive the slide edge', () => {
    const objects = [text({ id: 'a', xPercent: 10, yPercent: 10 }), text({ id: 'b', xPercent: 40, yPercent: 10 })];
    // The selection spans 10..60, so a -0.25 step is unblocked and both objects keep their 30 % gap.
    const left = nudgePresentSelection(objects, ['a', 'b'], -PRESENT_NUDGE_STEP_PERCENT, 0);
    expect(left.changedIds).toEqual(['a', 'b']);
    expect(left.objects.map((o) => o.xPercent)).toEqual([9.75, 39.75]);
    // Moving +100 must clamp the *delta* to 40 for both, keeping the 30 % gap.
    const clamped = nudgePresentSelection(objects, ['a', 'b'], 100, 0);
    expect(clamped.objects.map((o) => o.xPercent)).toEqual([50, 80]);
    expect(clamped.changedIds).toEqual(['a', 'b']);
    expect(clamped.blockedAxes).toEqual(['x']);
  });

  it('reports a blocked axis when the selection already touches the slide edge', () => {
    const objects = [text({ id: 'a', xPercent: 0, yPercent: 0 })];
    const blocked = nudgePresentSelection(objects, ['a'], -1, 0);
    expect(blocked.changedIds).toEqual([]);
    expect(blocked.blockedAxes).toEqual(['x']);
    expect(blocked.objects[0].xPercent).toBe(0);
  });

  it('skips locked objects for geometry changes and reports them', () => {
    const objects = [text({ id: 'a' }), text({ id: 'locked', locked: true })];
    const moved = nudgePresentSelection(objects, ['a', 'locked'], 1, 1);
    expect(moved.changedIds).toEqual(['a']);
    expect(moved.skippedLockedIds).toEqual(['locked']);
    expect(moved.objects.find((o) => o.id === 'locked')?.xPercent).toBe(0);
  });

  it('resizes and rotates, folding the new angle so rotation never gets stuck at the clamp', () => {
    const objects = [text({ id: 'a', xPercent: 10, yPercent: 10, widthPercent: 20, heightPercent: 10 })];
    expect(resizePresentSelection(objects, ['a'], 4, 3).objects[0].widthPercent).toBe(24);
    expect(resizePresentSelection(objects, ['a'], 4, 3).objects[0].heightPercent).toBe(13);
    expect(resizePresentSelection(objects, ['a'], -100, -100).objects[0].heightPercent).toBe(PRESENT_MIN_OBJECT_HEIGHT_PERCENT);
    expect(rotatePresentSelection(objects, ['a'], 90).objects[0].rotation).toBe(90);
    // 350 + 20 folds to 10 instead of clamping at 360, and 360 + 5 folds to 5 instead of 360.
    expect(rotatePresentSelection([{ ...objects[0], rotation: 350 }], ['a'], 20).objects[0].rotation).toBe(10);
    expect(rotatePresentSelection([{ ...objects[0], rotation: 360 }], ['a'], 5).objects[0].rotation).toBe(5);
    expect(rotatePresentSelection([{ ...objects[0], rotation: 0 }], ['a'], -5).objects[0].rotation).toBe(-5);
    expect(presentRotationLabel(370)).toBe('10°');
    expect(presentRotationLabel(-10)).toBe('-10°');
    expect(presentRotationLabel(undefined)).toBe('0°');
  });

  it('flips horizontally and vertically and renders the mirror transform', () => {
    const objects = [text({ id: 'a' })];
    const flippedX = flipPresentSelection(objects, ['a'], 'x').objects[0];
    expect(readPresentFlip(flippedX)).toEqual({ flipX: true, flipY: false });
    expect(presentFlipTransform(flippedX)).toBe('scaleX(-1) scaleY(1)');
    const twice = flipPresentSelection([flippedX], ['a'], 'x').objects[0];
    expect(readPresentFlip(twice)).toEqual({ flipX: false, flipY: false });
    expect(presentFlipTransform(twice)).toBe('');
    expect(readPresentFlip(flipPresentSelection(objects, ['a'], 'y').objects[0])).toEqual({ flipX: false, flipY: true });
  });

  it('refuses to delete locked objects instead of deleting them silently', () => {
    const objects = [text({ id: 'a' }), text({ id: 'locked', locked: true })];
    const result = deletePresentSelection(objects, ['a', 'locked']);
    expect(result.objects.map((o) => o.id)).toEqual(['locked']);
    expect(result.changedIds).toEqual(['a']);
    expect(result.skippedLockedIds).toEqual(['locked']);
  });

  it('locks and hides a whole selection, and unlocking a locked object stays possible', () => {
    const objects = [text({ id: 'a' }), text({ id: 'b' })];
    const locked = setPresentSelectionLocked(objects, ['a', 'b'], true);
    expect(locked.objects.every((o) => o.locked)).toBe(true);
    const unlocked = setPresentSelectionLocked(locked.objects, ['a', 'b'], false);
    expect(unlocked.objects.every((o) => !o.locked)).toBe(true);
    expect(unlocked.changedIds).toEqual(['a', 'b']);
    const hidden = setPresentSelectionHidden(objects, ['a'], true);
    expect(hidden.objects.find((o) => o.id === 'a')?.hidden).toBe(true);
    expect(hidden.objects.find((o) => o.id === 'b')?.hidden).toBeUndefined();
  });

  it('ignores an unknown or empty id list without mutating the input', () => {
    const objects = [text({ id: 'a' })];
    const result = nudgePresentSelection(objects, ['ghost'], 5, 5);
    expect(result.changedIds).toEqual([]);
    expect(result.objects[0]).toBe(objects[0]);
  });
});
