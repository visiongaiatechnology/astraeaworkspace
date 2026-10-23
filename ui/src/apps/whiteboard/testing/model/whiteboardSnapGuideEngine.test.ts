import { describe, expect, it } from 'vitest';
import {
  WHITEBOARD_MAX_SMART_GUIDE_LINES,
  WHITEBOARD_SMART_GUIDE_THRESHOLD,
  computeWhiteboardSmartSnap,
} from '../../model/whiteboardSnapGuideEngine';
import { applyWhiteboardDragSnap, snapWhiteboardPoint } from '../../model/whiteboardManipulationEngine';
import type { WhiteboardItem } from '../../types';

const box = (id: string, x: number, y: number, width = 100, height = 60): WhiteboardItem => ({
  id, type: 'process', x, y, width, height, text: '',
});

describe('Whiteboard smart alignment guides', () => {
  it('snaps a dragged object to a neighbour edge and reports the guide line', () => {
    const result = computeWhiteboardSmartSnap({
      movingBounds: { minX: 104, minY: 300, maxX: 204, maxY: 360 },
      candidates: [box('reference', 100, 300)],
    });
    expect(result.x).toBe(100);
    expect(result.snappedX).toBe(true);
    const xGuide = result.lines.find((line) => line.axis === 'x');
    expect(xGuide).toMatchObject({ position: 100, kind: 'align-left' });
    expect(xGuide!.from).toBeLessThanOrEqual(300);
    expect(xGuide!.to).toBeGreaterThanOrEqual(360);
    // Both edges line up here, so the y axis legitimately reports its own guide as well.
    expect(result.lines.find((line) => line.axis === 'y')).toMatchObject({ position: 300, kind: 'align-top' });
  });

  it('aligns centres and middles as well as edges', () => {
    // Centre-to-centre: the moving centre sits 2px right of the reference centre, edges are far away.
    const centred = computeWhiteboardSmartSnap({
      movingBounds: { minX: 22, minY: 400, maxX: 82, maxY: 460 },
      candidates: [box('reference', 0, 0, 100, 60)],
      detectSpacing: false,
    });
    expect(centred.x).toBe(20);
    expect(centred.lines.find((line) => line.axis === 'x')).toMatchObject({ position: 50, kind: 'align-center' });

    const middle = computeWhiteboardSmartSnap({
      movingBounds: { minX: 500, minY: 104, maxX: 600, maxY: 164 },
      candidates: [box('reference', 400, 100, 100, 60)],
      detectSpacing: false,
    });
    expect(middle.y).toBe(100);
    expect(middle.lines.find((line) => line.axis === 'y')).toMatchObject({ position: 100, kind: 'align-top' });
  });

  it('does nothing when the nearest reference is beyond the threshold', () => {
    const result = computeWhiteboardSmartSnap({
      movingBounds: { minX: 100 + WHITEBOARD_SMART_GUIDE_THRESHOLD + 5, minY: 300, maxX: 100 + WHITEBOARD_SMART_GUIDE_THRESHOLD + 15, maxY: 360 },
      candidates: [box('reference', 100, 1_000, 100, 60)],
      detectSpacing: false,
    });
    expect(result.snappedX).toBe(false);
    expect(result.snappedY).toBe(false);
    expect(result.lines).toEqual([]);
  });

  it('reproduces an existing row gap and reports the distance', () => {
    const result = computeWhiteboardSmartSnap({
      movingBounds: { minX: 277, minY: 0, maxX: 377, maxY: 60 },
      candidates: [box('left', 0, 0, 100, 60), box('right', 140, 0, 100, 60)],
    });
    expect(result.x).toBe(280);
    expect(result.lines.some((line) => line.kind === 'equal-spacing' && line.gap === 40)).toBe(true);
  });

  it('ignores connectors, hidden objects and the excluded selection itself', () => {
    const candidates: WhiteboardItem[] = [
      box('self', 96, 300),
      { ...box('edge', 0, 0), type: 'connector' },
      { ...box('hidden', 97, 300), hidden: true },
    ];
    const result = computeWhiteboardSmartSnap({
      movingBounds: { minX: 100, minY: 300, maxX: 200, maxY: 360 },
      candidates,
      excludedIds: ['self'],
      detectSpacing: false,
    });
    expect(result.lines).toEqual([]);
    expect(result.x).toBe(100);
  });

  it('bounds the number of emitted guide lines', () => {
    const candidates = Array.from({ length: 40 }, (_value, index) => box(`ref-${index}`, 100, index * 60));
    const result = computeWhiteboardSmartSnap({
      movingBounds: { minX: 100, minY: 0, maxX: 200, maxY: 60 },
      candidates,
      maxLines: 2,
    });
    expect(result.lines.length).toBeLessThanOrEqual(2);
    expect(WHITEBOARD_MAX_SMART_GUIDE_LINES).toBeGreaterThanOrEqual(2);
  });
});

describe('Whiteboard drag snap pipeline', () => {
  it('applies grid snapping first and object alignment on top of it', () => {
    const items: WhiteboardItem[] = [box('moving', 100, 300), box('reference', 99, 40)];
    const grid = snapWhiteboardPoint(105, 300, { gridSize: 24, snapToGrid: true, snapToGuides: false, guides: [] });
    expect(grid.x).toBe(96);
    const result = applyWhiteboardDragSnap({
      items,
      ids: new Set(['moving']),
      primaryId: 'moving',
      targetX: 105,
      targetY: 300,
      snap: { gridSize: 24, snapToGrid: true, snapToGuides: false, guides: [] },
    });
    const moved = result.items.find((entry) => entry.id === 'moving');
    expect(moved?.x).toBe(99);
    expect(result.x).toBe(99);
    expect(result.guides.length).toBeGreaterThan(0);
  });

  it('returns no guides and the plain snapped position when smart guides are disabled', () => {
    const items: WhiteboardItem[] = [box('moving', 100, 300), box('reference', 99, 40)];
    const result = applyWhiteboardDragSnap({
      items,
      ids: new Set(['moving']),
      primaryId: 'moving',
      targetX: 105,
      targetY: 300,
      snap: { gridSize: 24, snapToGrid: true, snapToGuides: false, guides: [] },
      smartGuides: false,
    });
    expect(result.guides).toEqual([]);
    expect(result.x).toBe(96);
  });

  it('never moves a locked primary object', () => {
    const items: WhiteboardItem[] = [{ ...box('moving', 100, 300), locked: true }];
    const result = applyWhiteboardDragSnap({
      items,
      ids: new Set(['moving']),
      primaryId: 'moving',
      targetX: 400,
      targetY: 400,
      snap: { gridSize: 24, snapToGrid: false, snapToGuides: false, guides: [] },
    });
    expect(result.items).toBe(items);
    expect(result.x).toBe(100);
  });
});
