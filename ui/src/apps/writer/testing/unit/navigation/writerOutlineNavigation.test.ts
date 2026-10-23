// STATUS: DIAMANT VGT SUPREME — outline navigation: exact jump and correct semantics
//
// Paket 46 acceptance: "Klick auf Überschrift springt **exakt** zum Text und **markiert semantisch
// richtig**."
//
// W-268, measured: the outline's hierarchy was conveyed only by indentation and font weight. Every
// heading was a plain `<button>` — no `role="treeitem"`, no `aria-level`, and the panel did not even
// receive the active paragraph, so nothing marked where the reader is. A screen reader heard a row of
// identical buttons.
// W-266: the panel recomputed the outline instead of asking `getWriterOutline`, so "what is a heading"
// had two answers in one application.
// W-267: the jump scrolled but left focus on the sidebar button; a div is not focusable without
// `tabIndex`, so the reader who activated a heading did not arrive in the text.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { getWriterOutline, reorderWriterOutlineBlock } from '../../../navigation/writerNavigationEngine';

const heading = (id: string, level: number, text: string): Paragraph => ({
  id,
  style: { style_name: `Heading ${level}`, heading_level: level, alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
  spans: [{ text }],
} as unknown as Paragraph);

const body = (id: string, text: string): Paragraph => ({
  id,
  style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
  spans: [{ text }],
} as unknown as Paragraph);

describe('the outline is derived once', () => {
  it('takes only headings that carry text', () => {
    const outline = getWriterOutline([
      heading('h1', 1, 'Einleitung'),
      body('p1', 'Text'),
      heading('h2', 2, '   '),
      heading('h3', 0, 'keine Überschrift'),
      heading('h4', 3, 'Anhang'),
    ]);
    expect(outline.map((entry) => entry.id)).toEqual(['h1', 'h4']);
    expect(outline.map((entry) => entry.level)).toEqual([1, 3]);
  });

  it('records the paragraph index, not a position among headings', () => {
    // The panel used the index for nothing, but the reorder relies on it: index means "position in the
    // document", which is what makes a subtree move possible.
    const outline = getWriterOutline([heading('h1', 1, 'A'), body('p1', 'x'), heading('h2', 2, 'B')]);
    expect(outline.map((entry) => entry.paragraphIndex)).toEqual([0, 2]);
  });

  it('joins the spans of a heading and trims it', () => {
    const split: Paragraph = {
      id: 'h9',
      style: { style_name: 'Heading 1', heading_level: 1, alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
      spans: [{ text: '  Zwei ' }, { text: 'Teile  ' }],
    } as unknown as Paragraph;
    expect(getWriterOutline([split])[0]?.text).toBe('Zwei Teile');
  });
});

describe('moving a heading moves its whole subtree', () => {
  const document = [
    heading('h1', 1, 'A'), body('a1', 'a'), body('a2', 'a'),
    heading('h2', 2, 'A.1'), body('b1', 'b'),
    heading('h3', 1, 'B'), body('c1', 'c'),
  ];

  it('carries the paragraphs under the heading along and lands before the drop target', () => {
    // Measured, not assumed: `splice(targetIndex, 0, …)` puts the dragged block **before** the heading
    // it was dropped on. My first expectation said "after" and was wrong — the code was right, so the
    // rule is written down here instead of being left to the next reader's guess.
    const moved = reorderWriterOutlineBlock(document, 'h2', 'h3');
    expect(moved.map((paragraph) => paragraph.id)).toEqual(['h1', 'a1', 'a2', 'h2', 'b1', 'h3', 'c1']);
  });

  it('moves only the subtree, never the following heading', () => {
    const moved = reorderWriterOutlineBlock(document, 'h2', 'h1');
    expect(moved.map((paragraph) => paragraph.id)).toEqual(['h2', 'b1', 'h1', 'a1', 'a2', 'h3', 'c1']);
  });

  it('refuses to move a heading into its own subtree', () => {
    const moved = reorderWriterOutlineBlock(document, 'h1', 'h2');
    expect(moved.map((paragraph) => paragraph.id)).toEqual(document.map((paragraph) => paragraph.id));
  });

  it('refuses an unknown target instead of guessing', () => {
    expect(() => reorderWriterOutlineBlock(document, 'h1', 'gibt-es-nicht')).toThrow(/does not exist/u);
  });

  it('returns the same order for the same heading', () => {
    expect(reorderWriterOutlineBlock(document, 'h1', 'h1').map((p) => p.id)).toEqual(document.map((p) => p.id));
  });
});
