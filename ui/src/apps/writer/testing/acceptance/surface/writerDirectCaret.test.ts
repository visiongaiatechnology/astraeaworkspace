// STATUS: PLATIN — Direct cursor geometry (ASTRAEA WRITER 50 V2 · M2, WR-006 … WR-009)
//
// The resolver is the whole *decision* of the direct cursor: where a click in the
// free writing area puts the caret, which alignment (if any) it may set, and how
// much vertical distance becomes a semantic `space_before`. It is pure, so these
// tests state the contract arithmetically — the DOM half (measurement, real click
// events, one visible caret) lives in `writerDirectCaretInteraction.test.tsx`.
import { describe, expect, it } from 'vitest';
import {
  isWriterMediaBand,
  resolveWriterColumnXRatio,
  resolveWriterDirectAlignment,
  resolveWriterDirectCaretTarget,
  writerCaretPxToPt,
  type WriterDirectCaretInput,
  type WriterMeasuredParagraphBox,
} from '../../../editing/caret/writerCaretTargeting';

const COLUMN = { top: 96, bottom: 1096, left: 96, right: 720 };
const LINE = 20;

function box(
  paragraphId: string,
  index: number,
  top: number,
  lines: number,
  textLength: number,
  marginBottomPx = 0,
): WriterMeasuredParagraphBox {
  return {
    paragraphId,
    index,
    top,
    bottom: top + lines * LINE,
    left: COLUMN.left,
    right: COLUMN.right,
    lineHeightPx: LINE,
    marginBottomPx,
    textLength,
  };
}

function input(overrides: Partial<WriterDirectCaretInput> = {}): WriterDirectCaretInput {
  return {
    measured: [box('p1', 0, 96, 2, 10)],
    pointer: { x: 400, y: 500 },
    column: COLUMN,
    columnIndex: 0,
    pageIndex: 0,
    zoom: 100,
    defaultLineHeightPx: LINE,
    paragraphCount: 1,
    intent: 'normal',
    ...overrides,
  };
}

describe('WR-006 — the click height decides the line, never the horizontal position', () => {
  it('snaps a click below the text to the next allowed line grid', () => {
    const target = resolveWriterDirectCaretTarget(input({ pointer: { x: 400, y: 300 } }));
    expect(target.kind).toBe('create-paragraph');
    if (target.kind !== 'create-paragraph') return;
    // Paragraph occupies 96…136 (two lines). y=300 is 164 px below its bottom:
    // floor(164 / 20) = 8 lines down.
    expect(target.lineIndex).toBe(8);
    expect(target.afterIndex).toBe(0);
  });

  it('stores the vertical distance as semantic points, not as empty lines', () => {
    const target = resolveWriterDirectCaretTarget(input({ pointer: { x: 400, y: 300 } }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
    // snapped line top = 136 + 8 × 20 = 296 → gap 160 px → 160 × 72/96 = 120 pt
    expect(target.spaceBeforePt).toBe(120);
  });

  it('keeps a click immediately below the text on the next line (gap 0)', () => {
    const target = resolveWriterDirectCaretTarget(input({ pointer: { x: 400, y: 140 } }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
    expect(target.lineIndex).toBe(0);
    expect(target.spaceBeforePt).toBe(0);
  });

  it('never lets the collapsed previous margin push the line below the stored distance', () => {
    // The previous paragraph carries 24 px of margin-bottom; a margin collapses to
    // the larger of the two, so the stored value has to win against it.
    const target = resolveWriterDirectCaretTarget(input({
      measured: [box('p1', 0, 96, 2, 10, 24)],
      pointer: { x: 400, y: 140 },
    }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
    expect(target.spaceBeforePt).toBe(18); // 24 px × 72/96
  });

  it('never claims more space than the page can still give', () => {
    const target = resolveWriterDirectCaretTarget(input({ pointer: { x: 400, y: 5000 } }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
    // WR-006/WR-007 (native M7 re-probe, hardened in round 4): the gap is strictly bounded by
    // the free space below the last paragraph minus the buffer the paginator also charges —
    // three line heights plus one default paragraph gap (76 px): 1096 − 136 − 76 = 884 px
    // → 663 pt. The old 705 pt filled the page exactly, so the paragraph was pushed to page 2.
    expect(target.spaceBeforePt).toBe(663);
  });

  it('stores no gap at all when the click is within two line heights', () => {
    // 34 px below the text is "the next line", not "a 20 pt gap".
    const target = resolveWriterDirectCaretTarget(input({ pointer: { x: 400, y: 170 } }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
    expect(target.lineIndex).toBe(1);
    expect(target.spaceBeforePt).toBe(0);
  });

  it('ignores the horizontal position for the *vertical* decision', () => {
    const left = resolveWriterDirectCaretTarget(input({ pointer: { x: 100, y: 300 } }));
    const right = resolveWriterDirectCaretTarget(input({ pointer: { x: 700, y: 300 } }));
    expect(left).toEqual(right);
  });

  it('divides the zoom out again, so the same physical line gives the same distance', () => {
    // At 125 % the page reports 1.25× the pixels for the same typographic gap.
    const at100 = resolveWriterDirectCaretTarget(input({ pointer: { x: 400, y: 300 } }));
    const at125 = resolveWriterDirectCaretTarget(input({
      zoom: 125,
      pointer: { x: 400, y: 136 + 160 * 1.25 },
      measured: [box('p1', 0, 96, 2, 10)],
    }));
    if (at100.kind !== 'create-paragraph' || at125.kind !== 'create-paragraph') {
      throw new Error('expected created paragraphs');
    }
    expect(at125.spaceBeforePt).toBeCloseTo(at100.spaceBeforePt, 0);
  });
});

describe('WR-006 — clicks on existing lines keep their character position', () => {
  it('puts the caret at the paragraph start when the first line is hit', () => {
    expect(resolveWriterDirectCaretTarget(input({ pointer: { x: 400, y: 100 } }))).toEqual({
      kind: 'focus-existing',
      paragraphId: 'p1',
      offset: 0,
      lineIndex: 0,
    });
  });

  it('puts the caret at the paragraph end when a later line is hit', () => {
    expect(resolveWriterDirectCaretTarget(input({ pointer: { x: 400, y: 125 } }))).toEqual({
      kind: 'focus-existing',
      paragraphId: 'p1',
      offset: 10,
      lineIndex: 1,
    });
  });

  it('goes above the text to the very first paragraph, not to page 1', () => {
    const target = resolveWriterDirectCaretTarget(input({
      measured: [box('p2', 1, 300, 2, 4)],
      pointer: { x: 400, y: 120 },
      pageIndex: 2,
    }));
    expect(target).toEqual({ kind: 'focus-existing', paragraphId: 'p2', offset: 0, lineIndex: 0 });
  });

  it('picks the closer neighbour in a gap between two paragraphs', () => {
    const measured = [box('a', 0, 96, 2, 10), box('b', 1, 200, 2, 6)];
    const closerBelow = resolveWriterDirectCaretTarget(input({ measured, pointer: { x: 400, y: 175 } }));
    expect(closerBelow).toMatchObject({ paragraphId: 'b', offset: 0 });
    const closerAbove = resolveWriterDirectCaretTarget(input({ measured, pointer: { x: 400, y: 160 } }));
    expect(closerAbove).toMatchObject({ paragraphId: 'a', offset: 10 });
  });
});

describe('WR-007 — the created paragraph is a normal flow paragraph', () => {
  it('appends after the last paragraph of the document', () => {
    const measured = [box('a', 0, 96, 1, 3), box('b', 1, 200, 1, 3)];
    const target = resolveWriterDirectCaretTarget(input({ measured, paragraphCount: 2, pointer: { x: 400, y: 700 } }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
    expect(target.afterIndex).toBe(1);
  });

  it('appends into an empty document', () => {
    const target = resolveWriterDirectCaretTarget(input({
      measured: [],
      paragraphCount: 0,
      pointer: { x: 400, y: 300 },
    }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
    expect(target.afterIndex).toBe(-1);
    expect(target.alignment).toBe('left');
    expect(target.spaceBeforePt).toBeGreaterThan(0);
  });

  it('never produces a negative distance', () => {
    const target = resolveWriterDirectCaretTarget(input({ pointer: { x: 400, y: 100 } }));
    if (target.kind !== 'create-paragraph') return;
    expect(target.spaceBeforePt).toBeGreaterThanOrEqual(0);
  });
});

describe('WR-SHELL-02 — an empty last paragraph absorbs the click instead of stacking ghosts', () => {
  it('focuses the empty paragraph below the text instead of creating a second one', () => {
    // Clicking below an 18-px empty paragraph used to create *another* empty paragraph with a
    // new gap; three clicks produced four mostly-empty pages.
    const target = resolveWriterDirectCaretTarget(input({
      measured: [box('p1', 0, 96, 1, 12), box('empty', 1, 160, 1, 0)],
      paragraphCount: 2,
      pointer: { x: 400, y: 600 },
    }));
    expect(target).toEqual({ kind: 'focus-existing', paragraphId: 'empty', offset: 0, lineIndex: 0 });
  });

  it('still creates a paragraph when the last paragraph carries text', () => {
    const target = resolveWriterDirectCaretTarget(input({
      measured: [box('p1', 0, 96, 2, 10)],
      pointer: { x: 400, y: 600 },
    }));
    expect(target.kind).toBe('create-paragraph');
  });

  it('anchors the follow-up paragraph directly below a measured image block', () => {
    // `anchorBottom` is the bottom of the paragraph **block**, which includes an anchored
    // image. A click just below the picture is within two line heights of the block end and
    // therefore must not add an artificial gap (WR-SHELL-02 b).
    const withImage = { ...box('p1', 0, 96, 1, 12), bottom: 96 + 220 };
    const target = resolveWriterDirectCaretTarget(input({
      measured: [withImage],
      pointer: { x: 400, y: 96 + 220 + 12 },
    }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
    expect(target.afterIndex).toBe(0);
    expect(target.spaceBeforePt).toBe(0);
  });

  it('creates a follow-up paragraph below an image even when the anchor paragraph text is empty (hasMedia: true, textLength: 0)', () => {
    /**
     * Native deadlock (round 5): the text is rendered **above** the picture inside the same
     * block. Absorbing the click into the empty anchor paragraph put the caret on line 0 — above
     * the image — and no paragraph below the picture was ever created. With `hasMedia` the
     * resolver must create the follow-up paragraph instead.
     */
    const imageOnly = {
      ...box('p1', 0, 96, 1, 0),
      bottom: 96 + 220,
      hasMedia: true,
    };
    const target = resolveWriterDirectCaretTarget(input({
      measured: [imageOnly],
      paragraphCount: 1,
      pointer: { x: 400, y: 96 + 220 + 10 },
    }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph below the image');
    expect(target.afterIndex).toBe(0);
    expect(target.spaceBeforePt).toBe(0);
  });

  it('does not focus the text above the image when the click lands inside the media band', () => {
    // The measured box spans the picture, so `inside` used to match and focus the paragraph
    // above it. Below the first line (and its 24 px minimum) the click belongs below the media.
    const imageOnly = {
      ...box('p1', 0, 96, 1, 0),
      bottom: 96 + 220,
      hasMedia: true,
    };
    const target = resolveWriterDirectCaretTarget(input({
      measured: [imageOnly],
      paragraphCount: 1,
      pointer: { x: 400, y: 96 + 120 },
    }));
    expect(target.kind).toBe('create-paragraph');
    if (target.kind !== 'create-paragraph') return;
    expect(target.afterIndex).toBe(0);
  });

  it('still focuses an empty paragraph that carries no media', () => {
    const emptyWithoutMedia = { ...box('p2', 1, 160, 1, 0), bottom: 160 + 220 };
    const target = resolveWriterDirectCaretTarget(input({
      measured: [box('p1', 0, 96, 1, 12), emptyWithoutMedia],
      paragraphCount: 2,
      pointer: { x: 400, y: 160 + 230 },
    }));
    expect(target).toEqual({ kind: 'focus-existing', paragraphId: 'p2', offset: 0, lineIndex: 0 });
  });
});

describe('native round 6 — the media block owns the click inside its own band', () => {
  it('prefers the media box when a taller neighbour contains the same height', () => {
    /**
     * `find` took the first box in top order. A picture that hangs into a following
     * paragraph's box therefore lost the hit test to the plain paragraph, the caret went to
     * its text — above the picture — and the caption was typed there.
     */
    const textAbove = box('p1', 0, 96, 1, 12);
    const imageBlock = { ...box('p2', 1, 130, 1, 0), bottom: 130 + 240, hasMedia: true };
    const tallNeighbour = { ...box('p3', 2, 140, 14, 200) };
    const target = resolveWriterDirectCaretTarget(input({
      measured: [textAbove, imageBlock, tallNeighbour],
      paragraphCount: 3,
      pointer: { x: 400, y: 200 },
    }));
    expect(target.kind).toBe('create-paragraph');
    if (target.kind !== 'create-paragraph') return;
    expect(target.afterIndex, 'der Folgeabsatz gehört unter das Bild').toBe(1);
  });

  it('reports the media band only below the first line, never on it', () => {
    const imageBlock = { ...box('p2', 1, 130, 1, 0), bottom: 130 + 240, hasMedia: true };
    expect(isWriterMediaBand(imageBlock, 130 + 1)).toBe(false);
    expect(isWriterMediaBand(imageBlock, 130 + 24)).toBe(false);
    expect(isWriterMediaBand(imageBlock, 130 + 25)).toBe(true);
    expect(isWriterMediaBand(imageBlock, 130 + 240)).toBe(true);
    // Below the block the band ends; there the generic "create after" rule applies.
    expect(isWriterMediaBand(imageBlock, 130 + 240 + 40)).toBe(false);
    // A paragraph without media has no band at all.
    expect(isWriterMediaBand({ ...imageBlock, hasMedia: false }, 200)).toBe(false);
  });
});

describe('WR-008 — only the deliberate intent may align, and only in three zones', () => {
  it('maps the X zones of the plan', () => {
    expect(resolveWriterDirectAlignment(0)).toBe('left');
    expect(resolveWriterDirectAlignment(0.1)).toBe('left');
    expect(resolveWriterDirectAlignment(0.34)).toBe('left');
    expect(resolveWriterDirectAlignment(0.35)).toBe('center');
    expect(resolveWriterDirectAlignment(0.5)).toBe('center');
    expect(resolveWriterDirectAlignment(0.64)).toBe('center');
    expect(resolveWriterDirectAlignment(0.65)).toBe('right');
    expect(resolveWriterDirectAlignment(0.9)).toBe('right');
    expect(resolveWriterDirectAlignment(1)).toBe('right');
  });

  it('clamps a hostile ratio instead of producing NaN', () => {
    expect(resolveWriterDirectAlignment(Number.NaN)).toBe('left');
    expect(resolveWriterDirectAlignment(-5)).toBe('left');
    expect(resolveWriterDirectAlignment(99)).toBe('right');
    expect(resolveWriterColumnXRatio(COLUMN, Number.NaN)).toBe(0);
    expect(resolveWriterColumnXRatio({ left: 0, right: 0 }, 10)).toBe(0);
  });

  it('always creates left-aligned on a single click, whatever the X position', () => {
    for (const x of [100, 400, 700]) {
      const target = resolveWriterDirectCaretTarget(input({ pointer: { x, y: 500 } }));
      if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
      expect(target.alignment, `x=${x}`).toBe('left');
    }
  });

  it('uses the X zone only for the explicit direct-align intent', () => {
    const samples: Array<[number, string]> = [[100, 'left'], [400, 'center'], [700, 'right']];
    for (const [x, expected] of samples) {
      const target = resolveWriterDirectCaretTarget(input({ pointer: { x, y: 500 }, intent: 'direct-align' }));
      if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
      expect(target.alignment, `x=${x}`).toBe(expected);
    }
  });
});

describe('WR-009 — page and column isolation', () => {
  it('resolves against the boxes of the clicked page only', () => {
    // The caller passes this page's boxes; an unknown page index must not change the
    // decision, and nothing falls back to the first paragraph of page 1.
    const target = resolveWriterDirectCaretTarget(input({
      pageIndex: 2,
      measured: [box('seite3-a', 7, 96, 1, 5)],
      pointer: { x: 400, y: 500 },
    }));
    if (target.kind !== 'create-paragraph') throw new Error('expected a created paragraph');
    expect(target.afterIndex).toBe(7);
  });
});

describe('WR-045 — hostile geometry never throws', () => {
  it('survives non-finite pointer and box values', () => {
    const target = resolveWriterDirectCaretTarget(input({
      pointer: { x: Number.NaN, y: Number.NaN },
      measured: [{
        paragraphId: 'p1',
        index: 0,
        top: Number.NaN,
        bottom: Number.NaN,
        left: Number.NaN,
        right: Number.NaN,
        lineHeightPx: Number.NaN,
        marginBottomPx: Number.NaN,
        textLength: 4,
      }],
    }));
    expect(['create-paragraph', 'focus-existing']).toContain(target.kind);
  });

  it('converts pixels to points without dividing by zero', () => {
    expect(writerCaretPxToPt(96, 0)).toBe(72);
    expect(writerCaretPxToPt(96, Number.NaN)).toBe(72);
    expect(writerCaretPxToPt(Number.NaN, 100)).toBe(0);
    expect(writerCaretPxToPt(120, 125)).toBe(72);
  });
});
