// STATUS: PLATIN — Writer cross-paragraph selection model contracts
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  isWriterSelectionCollapsed,
  replaceWriterSelection,
  resolveWriterSelection,
} from '../../../../editing/selection/writerSelectionRange';
import { resolveWriterPointerSelectionPoint } from '../../../../editing/selection/writerSelectionPointer';

const STYLE = { alignment: 'left' as const, line_height: 1.6, space_before: 0, space_after: 0 };

function paragraph(id: string, text: string): Paragraph {
  return { id, style: { ...STYLE }, spans: [{ text }] };
}

const DOC = [
  paragraph('p1', 'Alpha beta'),
  paragraph('p2', 'Gamma delta'),
  paragraph('p3', 'Epsilon'),
];

const text = (p: Paragraph) => p.spans.map((s) => s.text).join('');
const shape = (paragraphs: readonly Paragraph[]) => paragraphs.map((p) => `${p.id}:${text(p)}`);

describe('Writer selection range', () => {
  describe('resolution', () => {
    it('orders a forward selection and lists the covered paragraphs', () => {
      const resolved = resolveWriterSelection(DOC, {
        anchor: { paragraphId: 'p1', offset: 6 },
        focus: { paragraphId: 'p3', offset: 3 },
      });
      expect(resolved).toMatchObject({
        startParagraphIndex: 0,
        startOffset: 6,
        endParagraphIndex: 2,
        endOffset: 3,
        paragraphIndexes: [0, 1, 2],
        collapsed: false,
        spansParagraphs: true,
      });
    });

    it('orders a backward selection into document order', () => {
      const resolved = resolveWriterSelection(DOC, {
        anchor: { paragraphId: 'p3', offset: 3 },
        focus: { paragraphId: 'p1', offset: 6 },
      });
      expect(resolved).toMatchObject({
        startParagraphIndex: 0,
        startOffset: 6,
        endParagraphIndex: 2,
        endOffset: 3,
      });
    });

    it('orders two points inside one paragraph', () => {
      const resolved = resolveWriterSelection(DOC, {
        anchor: { paragraphId: 'p2', offset: 8 },
        focus: { paragraphId: 'p2', offset: 2 },
      });
      expect(resolved).toMatchObject({
        startParagraphIndex: 1,
        startOffset: 2,
        endParagraphIndex: 1,
        endOffset: 8,
        spansParagraphs: false,
        collapsed: false,
      });
    });

    it('marks a zero-length selection as collapsed', () => {
      const resolved = resolveWriterSelection(DOC, {
        anchor: { paragraphId: 'p2', offset: 4 },
        focus: { paragraphId: 'p2', offset: 4 },
      });
      expect(resolved?.collapsed).toBe(true);
      expect(isWriterSelectionCollapsed(resolved)).toBe(true);
      expect(isWriterSelectionCollapsed(null)).toBe(true);
    });

    it('clamps offsets into the paragraph instead of rejecting them', () => {
      const resolved = resolveWriterSelection(DOC, {
        anchor: { paragraphId: 'p1', offset: -20 },
        focus: { paragraphId: 'p1', offset: 900 },
      });
      expect(resolved).toMatchObject({ startOffset: 0, endOffset: 10 });
      const notFinite = resolveWriterSelection(DOC, {
        anchor: { paragraphId: 'p1', offset: Number.NaN },
        focus: { paragraphId: 'p1', offset: 5 },
      });
      expect(notFinite).toMatchObject({ startOffset: 0, endOffset: 5 });
    });

    it('refuses points that are not part of the document', () => {
      expect(resolveWriterSelection(DOC, {
        anchor: { paragraphId: 'ghost', offset: 0 },
        focus: { paragraphId: 'p1', offset: 1 },
      })).toBeNull();
      expect(resolveWriterSelection([], {
        anchor: { paragraphId: 'p1', offset: 0 },
        focus: { paragraphId: 'p1', offset: 0 },
      })).toBeNull();
    });
  });

  describe('replacement', () => {
    const selectAcross = resolveWriterSelection(DOC, {
      anchor: { paragraphId: 'p1', offset: 6 },
      focus: { paragraphId: 'p2', offset: 5 },
    });

    it('keeps the head and the tail and removes the covered paragraphs', () => {
      if (!selectAcross) throw new Error('selection must resolve');
      const result = replaceWriterSelection(DOC, selectAcross, 'X', []);
      expect(result).not.toBeNull();
      expect(shape(result!.paragraphs)).toEqual(['p1:Alpha X delta', 'p3:Epsilon']);
      expect(result!.removedParagraphIds).toEqual(['p2']);
      expect(result!.caret).toEqual({ paragraphId: 'p1', offset: 7 });
    });

    it('deletes the whole range for an empty replacement', () => {
      if (!selectAcross) throw new Error('selection must resolve');
      const result = replaceWriterSelection(DOC, selectAcross, '', []);
      expect(shape(result!.paragraphs)).toEqual(['p1:Alpha  delta', 'p3:Epsilon']);
    });

    it('replaces inside one paragraph without removing any paragraph', () => {
      const within = resolveWriterSelection(DOC, {
        anchor: { paragraphId: 'p2', offset: 0 },
        focus: { paragraphId: 'p2', offset: 5 },
      });
      if (!within) throw new Error('selection must resolve');
      const result = replaceWriterSelection(DOC, within, 'Neu', []);
      expect(shape(result!.paragraphs)).toEqual(['p1:Alpha beta', 'p2:Neu delta', 'p3:Epsilon']);
      expect(result!.removedParagraphIds).toEqual([]);
      expect(result!.caret).toEqual({ paragraphId: 'p2', offset: 3 });
    });

    it('opens new paragraphs for a replacement that contains line breaks', () => {
      if (!selectAcross) throw new Error('selection must resolve');
      const result = replaceWriterSelection(DOC, selectAcross, '\n', ['p-new']);
      expect(shape(result!.paragraphs)).toEqual(['p1:Alpha ', 'p-new: delta', 'p3:Epsilon']);
      expect(result!.caret).toEqual({ paragraphId: 'p-new', offset: 0 });
    });

    it('assigns a generated id when the caller supplies no new paragraph id', () => {
      if (!selectAcross) throw new Error('selection must resolve');
      const result = replaceWriterSelection(DOC, selectAcross, '\n', []);
      expect(result!.paragraphs[1]?.id).toBe('p1-split-1');
    });

    it('preserves character formatting in the surviving head', () => {
      const rich: Paragraph[] = [
        { id: 'p1', style: { ...STYLE }, spans: [{ text: 'Bold', bold: true }, { text: ' rest' }] },
        paragraph('p2', 'Tail'),
      ];
      const selection = resolveWriterSelection(rich, {
        anchor: { paragraphId: 'p1', offset: 4 },
        focus: { paragraphId: 'p2', offset: 4 },
      });
      if (!selection) throw new Error('selection must resolve');
      const result = replaceWriterSelection(rich, selection, '!', []);
      expect(result!.paragraphs[0]?.spans).toEqual([{ text: 'Bold', bold: true }, { text: '!' }]);
    });

    it('does not mutate the input document', () => {
      const snapshot = JSON.stringify(DOC);
      if (!selectAcross) throw new Error('selection must resolve');
      replaceWriterSelection(DOC, selectAcross, 'X', []);
      expect(JSON.stringify(DOC)).toBe(snapshot);
    });
  });

  describe('pointer resolution', () => {
    const boxes = [
      { paragraphId: 'p1', top: 100, bottom: 140, textLength: 10 },
      { paragraphId: 'p2', top: 160, bottom: 200, textLength: 11 },
      { paragraphId: 'p3', top: 220, bottom: 260, textLength: 7 },
    ];

    it('extends to the start of a paragraph in its upper half', () => {
      expect(resolveWriterPointerSelectionPoint(boxes, 110)).toEqual({ paragraphId: 'p1', offset: 0 });
    });

    it('extends to the end of a paragraph in its lower half', () => {
      expect(resolveWriterPointerSelectionPoint(boxes, 190)).toEqual({ paragraphId: 'p2', offset: 11 });
    });

    it('skips the origin paragraph, whose own textarea is character-exact', () => {
      expect(resolveWriterPointerSelectionPoint(boxes, 110, 'p1')).toBeNull();
      expect(resolveWriterPointerSelectionPoint(boxes, 190, 'p1')).toEqual({ paragraphId: 'p2', offset: 11 });
    });

    it('falls back to the nearest paragraph when the pointer is in a gap', () => {
      // Tie between two paragraphs: document order wins, so the selection ends on the earlier one.
      expect(resolveWriterPointerSelectionPoint(boxes, 150)).toEqual({ paragraphId: 'p1', offset: 10 });
      expect(resolveWriterPointerSelectionPoint(boxes, 999)).toEqual({ paragraphId: 'p3', offset: 7 });
      expect(resolveWriterPointerSelectionPoint(boxes, -50)).toEqual({ paragraphId: 'p1', offset: 0 });
    });

    it('ignores unusable boxes and non-finite pointers', () => {
      expect(resolveWriterPointerSelectionPoint([], 150)).toBeNull();
      expect(resolveWriterPointerSelectionPoint(boxes, Number.NaN)).toBeNull();
      expect(resolveWriterPointerSelectionPoint([
        { paragraphId: '', top: 0, bottom: 10, textLength: 3 },
        { paragraphId: 'p9', top: 20, bottom: 10, textLength: 3 },
      ], 5)).toBeNull();
    });
  });
});
