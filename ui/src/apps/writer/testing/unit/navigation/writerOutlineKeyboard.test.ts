// STATUS: DIAMANT VGT SUPREME — the outline answers the keys a tree promises (W-270, W-271)
//
// W-270: `role="tree"` was declared while nothing answered ArrowUp/ArrowDown/ArrowLeft/ArrowRight/Home/End.
// W-271: a heading could only be moved by dragging.
//
// The decision lives in a pure function, so the whole pattern is testable without a DOM — including the
// boundaries that are easy to get wrong (first child that is not a child, parent that is only a sibling,
// moving the last heading down).
import { describe, expect, it } from 'vitest';
import { resolveWriterOutlineKeyCommand, type WriterOutlineKeyboardItem } from '../../../navigation/writerOutlineKeyboard';

const outline: readonly WriterOutlineKeyboardItem[] = [
  { id: 'h1', level: 1 },      // 0
  { id: 'h1.1', level: 2 },    // 1
  { id: 'h1.1.1', level: 3 },  // 2
  { id: 'h1.2', level: 2 },    // 3
  { id: 'h2', level: 1 },      // 4
  { id: 'h2.1', level: 2 },    // 5
];

const press = (key: string, currentIndex: number, extra: Partial<Parameters<typeof resolveWriterOutlineKeyCommand>[0]> = {}) =>
  resolveWriterOutlineKeyCommand({ key, items: outline, currentIndex, ...extra });

describe('walking the outline', () => {
  it('moves down and up one item at a time', () => {
    expect(press('ArrowDown', 0)).toEqual({ kind: 'focus', index: 1 });
    expect(press('ArrowUp', 3)).toEqual({ kind: 'focus', index: 2 });
  });

  it('stops at the ends instead of wrapping', () => {
    // Wrapping would be surprising in a document outline: the reading position must not jump.
    expect(press('ArrowUp', 0)).toBeNull();
    expect(press('ArrowDown', 5)).toBeNull();
  });

  it('goes to the first child with ArrowRight, and only when there is one', () => {
    expect(press('ArrowRight', 0)).toEqual({ kind: 'focus', index: 1 });
    expect(press('ArrowRight', 1)).toEqual({ kind: 'focus', index: 2 });
    // `h1.2` (index 3) is followed by `h2` (index 4) at a *shallower* level — that is not a child.
    expect(press('ArrowRight', 3)).toBeNull();
    expect(press('ArrowRight', 5)).toBeNull();
  });

  it('goes to the parent with ArrowLeft, and ignores a mere sibling', () => {
    expect(press('ArrowLeft', 2)).toEqual({ kind: 'focus', index: 1 });
    expect(press('ArrowLeft', 3)).toEqual({ kind: 'focus', index: 0 });
    // From `h1.1` the previous item at the same level is `h1` — which is also its parent, so it counts.
    expect(press('ArrowLeft', 1)).toEqual({ kind: 'focus', index: 0 });
    // From `h2.1` the nearest shallower heading is `h2` — the same result by the parent rule.
    expect(press('ArrowLeft', 5)).toEqual({ kind: 'focus', index: 4 });
    // A top-level heading has no parent.
    expect(press('ArrowLeft', 4)).toBeNull();
  });

  it('jumps with Home and End', () => {
    expect(press('Home', 3)).toEqual({ kind: 'focus', index: 0 });
    expect(press('End', 0)).toEqual({ kind: 'focus', index: 5 });
    expect(press('Home', 0)).toBeNull();
    expect(press('End', 5)).toBeNull();
  });

  it('activates with Enter and with Space', () => {
    expect(press('Enter', 2)).toEqual({ kind: 'activate', index: 2 });
    expect(press(' ', 2)).toEqual({ kind: 'activate', index: 2 });
  });

  it('leaves unrelated keys alone so the page keeps them', () => {
    for (const key of ['Tab', 'Escape', 'a', 'PageDown', 'F5']) {
      expect(press(key, 1)).toBeNull();
    }
  });

  it('does nothing in an empty outline', () => {
    expect(resolveWriterOutlineKeyCommand({ key: 'ArrowDown', items: [], currentIndex: 0 })).toBeNull();
    expect(resolveWriterOutlineKeyCommand({ key: 'Enter', items: [], currentIndex: 0 })).toBeNull();
  });

  it('clamps an index outside the list instead of crashing', () => {
    // The list changes while the panel is open (a heading can be typed away).
    expect(press('Enter', 99)).toEqual({ kind: 'activate', index: 5 });
    expect(press('Enter', -4)).toEqual({ kind: 'activate', index: 0 });
  });
});

describe('moving a heading without a pointer — W-271', () => {
  it('moves a subtree up before its previous sibling', () => {
    // `h1.2` (index 3) belongs before `h1.1` (index 1) — and `reorder` inserts before the target.
    expect(press('ArrowUp', 3, { altKey: true })).toEqual({ kind: 'move', sourceIndex: 3, targetIndex: 1 });
  });

  it('moves a subtree down past the next sibling’s whole subtree', () => {
    // `h1.1` (with its child at index 2) moves after `h1.2` (index 3), i.e. before `h2` (index 4).
    expect(press('ArrowDown', 1, { altKey: true })).toEqual({ kind: 'move', sourceIndex: 1, targetIndex: 4 });
  });

  it('refuses to move the first heading up or the last subtree down', () => {
    expect(press('ArrowUp', 0, { altKey: true })).toBeNull();
    expect(press('ArrowDown', 4, { altKey: true })).toBeNull();
    // `h2.1` is the last item: there is no following subtree to move past.
    expect(press('ArrowDown', 5, { altKey: true })).toBeNull();
  });

  it('moves a top-level heading past its neighbour', () => {
    // `h2` (index 4, with `h2.1` at 5) moves before `h1` (index 0).
    expect(press('ArrowUp', 4, { altKey: true })).toEqual({ kind: 'move', sourceIndex: 4, targetIndex: 0 });
  });

  it('keeps the plain arrow behaviour when Alt is not held', () => {
    expect(press('ArrowUp', 3)).toEqual({ kind: 'focus', index: 2 });
    expect(press('ArrowDown', 1)).toEqual({ kind: 'focus', index: 2 });
  });
});
