import { describe, expect, it } from 'vitest';
import {
  WHITEBOARD_MARQUEE_MAX_SELECTION,
  WHITEBOARD_MARQUEE_MIN_SIZE,
  isWhiteboardMarqueeActive,
  marqueeWhiteboardSelection,
  normalizeWhiteboardMarquee,
  whiteboardItemMatchesMarquee,
} from '../../selection/whiteboardMarqueeEngine';
import type { WhiteboardItem } from '../../types';
import { WHITEBOARD_MAX_ITEMS } from '../../viewport/whiteboardViewportEngine';

const item = (overrides: Partial<WhiteboardItem> & { id: string }): WhiteboardItem => ({
  type: 'process',
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  text: '',
  ...overrides,
});

const rect = { x: 0, y: 0, width: 400, height: 400 };

describe('Whiteboard marquee band normalization', () => {
  it('normalizes both drag directions into a positive-extent band', () => {
    expect(normalizeWhiteboardMarquee({ x: 10, y: 20 }, { x: 50, y: 80 })).toEqual({ x: 10, y: 20, width: 40, height: 60 });
    expect(normalizeWhiteboardMarquee({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 60 });
  });

  it('collapses non-finite drag points to an empty, inactive band', () => {
    const band = normalizeWhiteboardMarquee({ x: Number.NaN, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 4 });
    expect(band).toEqual({ x: 0, y: 0, width: 0, height: 4 });
    expect(isWhiteboardMarqueeActive(band)).toBe(false);
  });

  it('treats sub-threshold jitter as a click and a real drag as a marquee', () => {
    expect(isWhiteboardMarqueeActive({ x: 0, y: 0, width: WHITEBOARD_MARQUEE_MIN_SIZE - 1, height: 2 })).toBe(false);
    expect(isWhiteboardMarqueeActive({ x: 0, y: 0, width: WHITEBOARD_MARQUEE_MIN_SIZE, height: 0 })).toBe(true);
  });
});

describe('Whiteboard marquee membership rule', () => {
  it('applies containment by default and intersection on request', () => {
    const inside = item({ id: 'inside', x: 20, y: 20 });
    const overlapping = item({ id: 'overlap', x: 380, y: 20 });
    expect(whiteboardItemMatchesMarquee(inside, rect, 'contain')).toBe(true);
    expect(whiteboardItemMatchesMarquee(overlapping, rect, 'contain')).toBe(false);
    expect(whiteboardItemMatchesMarquee(overlapping, rect, 'intersect')).toBe(true);
  });

  it('never matches a connector, because a connector stores no geometry of its own', () => {
    const connector = item({ id: 'edge', type: 'connector', fromId: 'a', toId: 'b', width: 1, height: 1 });
    expect(whiteboardItemMatchesMarquee(connector, rect, 'intersect')).toBe(false);
    expect(marqueeWhiteboardSelection([connector], rect)).toEqual({ ok: true, ids: [] });
  });

  it('fails closed on non-finite or empty geometry instead of guessing a match', () => {
    expect(whiteboardItemMatchesMarquee(item({ id: 'bad', x: Number.NaN }), rect)).toBe(false);
    expect(whiteboardItemMatchesMarquee(item({ id: 'zero', width: 0 }), rect)).toBe(false);
  });
});

describe('Whiteboard marquee selection resolution', () => {
  it('returns contained objects in canonical paint order (bottom first)', () => {
    const result = marqueeWhiteboardSelection([
      item({ id: 'top', zIndex: 9 }),
      item({ id: 'bottom', zIndex: 1 }),
      item({ id: 'middle' }),
    ], rect);
    expect(result).toEqual({ ok: true, ids: ['middle', 'bottom', 'top'] });
  });

  it('excludes hidden and locked objects unless they are explicitly requested', () => {
    const items = [
      item({ id: 'hidden', hidden: true }),
      item({ id: 'locked', locked: true }),
      item({ id: 'visible' }),
    ];
    expect(marqueeWhiteboardSelection(items, rect)).toEqual({ ok: true, ids: ['visible'] });
    expect(marqueeWhiteboardSelection(items, rect, { includeHidden: true, includeLocked: true }))
      .toEqual({ ok: true, ids: ['hidden', 'locked', 'visible'] });
  });

  it('pulls in every member of a group so a group can never be half-selected', () => {
    const result = marqueeWhiteboardSelection([
      item({ id: 'a', groupId: 'g1' }),
      item({ id: 'b', groupId: 'g1', x: 900 }),
      item({ id: 'c' }),
    ], { x: 0, y: 0, width: 150, height: 150 });
    // `a` and `c` are inside the band; `b` is dragged in because it shares the group with `a`.
    expect(result).toEqual({ ok: true, ids: ['a', 'c', 'b'] });
  });

  it('rejects a band that would exceed the selection ceiling instead of truncating it', () => {
    const items = Array.from({ length: 12 }, (_value, index) => item({ id: `n-${index}` }));
    const result = marqueeWhiteboardSelection(items, rect, { maxSelection: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('narrow the band');
  });

  it('rejects a board above the object ceiling', () => {
    const oversized = new Array<WhiteboardItem>(WHITEBOARD_MAX_ITEMS + 1);
    expect(marqueeWhiteboardSelection(oversized, rect).ok).toBe(false);
  });

  it('keeps the documented hard selection ceiling', () => {
    expect(WHITEBOARD_MARQUEE_MAX_SELECTION).toBe(4096);
  });
});
