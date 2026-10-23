// STATUS: PLATIN — Writer caret targeting contracts (empty page, end of document, columns)
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  clampWriterCaretOffset,
  resolveNearestWriterParagraphAnchor,
  resolveWriterEndOfDocumentTarget,
  resolveWriterFragmentLocalCaret,
  resolveWriterPageClickTarget,
  resolveWriterStructuralCaret,
  writerFragmentOwnsCaret,
  writerParagraphTextLength,
} from '../../../../editing/caret/writerCaretTargeting';

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

describe('Writer caret targeting', () => {
  describe('page click resolution', () => {
    it('requests the first paragraph when an empty document is clicked', () => {
      expect(resolveWriterPageClickTarget({
        paragraphs: [],
        pageParagraphIds: [],
        nearestParagraphId: null,
      })).toEqual({ kind: 'create-paragraph', paragraphId: null, offset: 0 });
      expect(resolveWriterEndOfDocumentTarget([])).toEqual({
        kind: 'create-paragraph',
        paragraphId: null,
        offset: 0,
      });
    });

    it('places the caret at the end of the paragraph above the click', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta gamma')];
      expect(resolveWriterPageClickTarget({
        paragraphs,
        pageParagraphIds: ['p1', 'p2'],
        nearestParagraphId: 'p2',
      })).toEqual({ kind: 'focus-existing', paragraphId: 'p2', offset: 10 });
    });

    it('falls back to the start of the first paragraph on the clicked page', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta'), paragraph('p3', 'Gamma')];
      // Page 2 renders p2 and p3; a click above them must not jump back to p1.
      expect(resolveWriterPageClickTarget({
        paragraphs,
        pageParagraphIds: ['p2', 'p3'],
        nearestParagraphId: null,
      })).toEqual({ kind: 'focus-existing', paragraphId: 'p2', offset: 0 });
    });

    it('continues at the end of the document on a page that renders no paragraph', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      expect(resolveWriterPageClickTarget({
        paragraphs,
        pageParagraphIds: [],
        nearestParagraphId: null,
      })).toEqual({ kind: 'focus-existing', paragraphId: 'p2', offset: 4 });
    });

    it('ignores an unknown anchor id and still picks a paragraph on the page', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      expect(resolveWriterPageClickTarget({
        paragraphs,
        pageParagraphIds: ['p2'],
        nearestParagraphId: 'missing',
      })).toEqual({ kind: 'focus-existing', paragraphId: 'p2', offset: 0 });
    });

    it('treats a page whose ids are unknown as a page without text', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      expect(resolveWriterPageClickTarget({
        paragraphs,
        pageParagraphIds: ['ghost'],
        nearestParagraphId: null,
      })).toEqual({ kind: 'focus-existing', paragraphId: 'p2', offset: 4 });
    });
  });

  describe('end of document', () => {
    it('targets the end of the last paragraph', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Ωmega')];
      expect(resolveWriterEndOfDocumentTarget(paragraphs)).toEqual({
        kind: 'focus-existing',
        paragraphId: 'p2',
        offset: 5,
      });
    });

    it('counts characters across formatting spans, not only the first span', () => {
      const split: Paragraph = {
        id: 'p1',
        style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
        spans: [{ text: 'Alpha', bold: true }, { text: ' Beta', italic: true }],
      };
      expect(writerParagraphTextLength(split)).toBe(10);
      expect(resolveWriterEndOfDocumentTarget([split])).toMatchObject({ offset: 10 });
    });
  });

  describe('offset guarding', () => {
    it('clamps hostile caret offsets into the text range', () => {
      expect(clampWriterCaretOffset(-5, 10)).toBe(0);
      expect(clampWriterCaretOffset(4.9, 10)).toBe(4);
      expect(clampWriterCaretOffset(999, 10)).toBe(10);
      expect(clampWriterCaretOffset(Number.NaN, 10)).toBe(0);
      expect(clampWriterCaretOffset(Number.POSITIVE_INFINITY, 10)).toBe(0);
      expect(clampWriterCaretOffset(3, Number.NaN)).toBe(0);
    });

    it('normalizes structural caret offsets to non-negative integers', () => {
      expect(resolveWriterStructuralCaret('p1', -3)).toEqual({
        kind: 'focus-existing',
        paragraphId: 'p1',
        offset: 0,
      });
      expect(resolveWriterStructuralCaret('p1', 2.7)).toEqual({
        kind: 'focus-existing',
        paragraphId: 'p1',
        offset: 2,
      });
    });
  });

  describe('nearest paragraph above the pointer', () => {
    const anchors = [
      { paragraphId: 'p1', top: 100 },
      { paragraphId: 'p2', top: 200 },
      { paragraphId: 'p3', top: 300 },
    ];

    it('selects the paragraph directly above the pointer', () => {
      expect(resolveNearestWriterParagraphAnchor(anchors, 250)).toBe('p2');
      expect(resolveNearestWriterParagraphAnchor(anchors, 300)).toBe('p3');
      expect(resolveNearestWriterParagraphAnchor(anchors, 999)).toBe('p3');
    });

    it('returns null when the pointer is above every paragraph', () => {
      expect(resolveNearestWriterParagraphAnchor(anchors, 99)).toBeNull();
    });

    it('ignores empty ids and non-finite measurements', () => {
      expect(resolveNearestWriterParagraphAnchor([
        { paragraphId: '', top: 100 },
        { paragraphId: 'p2', top: Number.NaN },
        { paragraphId: 'p3', top: 50 },
      ], 200)).toBe('p3');
      expect(resolveNearestWriterParagraphAnchor(anchors, Number.NaN)).toBeNull();
      expect(resolveNearestWriterParagraphAnchor([], 500)).toBeNull();
    });

    it('feeds the page-click resolver into a usable caret', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      const nearest = resolveNearestWriterParagraphAnchor(
        [{ paragraphId: 'p1', top: 100 }, { paragraphId: 'p2', top: 240 }],
        260,
      );
      expect(resolveWriterPageClickTarget({
        paragraphs,
        pageParagraphIds: ['p1', 'p2'],
        nearestParagraphId: nearest,
      })).toEqual({ kind: 'focus-existing', paragraphId: 'p2', offset: 4 });
    });
  });

  describe('nearest paragraph in a multi-column section', () => {
    // Column 1 (x 100-400) reaches lower than column 2 (x 420-720).
    const columns = [
      { paragraphId: 'left-1', top: 100, left: 100, right: 400 },
      { paragraphId: 'left-2', top: 300, left: 100, right: 400 },
      { paragraphId: 'right-1', top: 120, left: 420, right: 720 },
      { paragraphId: 'right-2', top: 200, left: 420, right: 720 },
    ];

    it('prefers the paragraph that spans the clicked column', () => {
      expect(resolveNearestWriterParagraphAnchor(columns, 400, 500)).toBe('right-2');
      expect(resolveNearestWriterParagraphAnchor(columns, 400, 200)).toBe('left-2');
    });

    it('falls back to the nearest box above when no column contains the pointer', () => {
      expect(resolveNearestWriterParagraphAnchor(columns, 400, 900)).toBe('left-2');
    });

    it('keeps the one-dimensional behaviour when no horizontal extent is measured', () => {
      const flat = columns.map(({ paragraphId, top }) => ({ paragraphId, top }));
      expect(resolveNearestWriterParagraphAnchor(flat, 400)).toBe('left-2');
      expect(resolveNearestWriterParagraphAnchor(flat, 400, 500)).toBe('left-2');
    });

    it('returns null when every paragraph starts below the pointer', () => {
      expect(resolveNearestWriterParagraphAnchor(columns, 50, 500)).toBeNull();
    });
  });

  describe('page-fragment caret ownership', () => {
    const head = { startOffset: 0, endOffset: 120, isLastFragment: false };
    const middle = { startOffset: 120, endOffset: 240, isLastFragment: false };
    const tail = { startOffset: 240, endOffset: 300, isLastFragment: true };

    it('gives every offset to exactly one fragment', () => {
      expect(writerFragmentOwnsCaret(head, 0)).toBe(true);
      expect(writerFragmentOwnsCaret(head, 119)).toBe(true);
      expect(writerFragmentOwnsCaret(head, 120)).toBe(false);
      expect(writerFragmentOwnsCaret(middle, 120)).toBe(true);
      expect(writerFragmentOwnsCaret(middle, 239)).toBe(true);
      expect(writerFragmentOwnsCaret(middle, 240)).toBe(false);
    });

    it('lets the tail fragment own the end of the paragraph', () => {
      expect(writerFragmentOwnsCaret(tail, 240)).toBe(true);
      expect(writerFragmentOwnsCaret(tail, 300)).toBe(true);
      expect(writerFragmentOwnsCaret(tail, 999)).toBe(true);
    });

    it('refuses offsets before the fragment and non-finite offsets', () => {
      expect(writerFragmentOwnsCaret(middle, 119)).toBe(false);
      expect(writerFragmentOwnsCaret(head, -1)).toBe(false);
      expect(writerFragmentOwnsCaret(head, Number.NaN)).toBe(false);
      expect(writerFragmentOwnsCaret(head, Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('converts an absolute caret into the fragment-local offset', () => {
      expect(resolveWriterFragmentLocalCaret(head, 30)).toBe(30);
      expect(resolveWriterFragmentLocalCaret(middle, 150)).toBe(30);
      expect(resolveWriterFragmentLocalCaret(tail, 260)).toBe(20);
    });

    it('signals a cross-page handover with null', () => {
      expect(resolveWriterFragmentLocalCaret(head, 120)).toBeNull();
      expect(resolveWriterFragmentLocalCaret(head, 240)).toBeNull();
      expect(resolveWriterFragmentLocalCaret(middle, 10)).toBeNull();
    });

    it('treats a single-fragment paragraph as the owner of every offset', () => {
      const only = { startOffset: 0, endOffset: 0, isLastFragment: true };
      expect(resolveWriterFragmentLocalCaret(only, 0)).toBe(0);
      expect(resolveWriterFragmentLocalCaret(only, 55)).toBe(55);
    });
  });
});
