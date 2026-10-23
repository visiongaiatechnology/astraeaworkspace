// STATUS: PLATIN — Writer structural paragraph operations (Enter split / Backspace merge)
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  mergeWriterParagraphBackward,
  normalizeWriterSpans,
  sliceWriterSpans,
  splitWriterParagraphAt,
} from '../../../../editing/paragraphs/writerParagraphStructure';

const STYLE = { alignment: 'left' as const, line_height: 1.6, space_before: 0, space_after: 0 };

function paragraph(id: string, text: string, extra: Partial<Paragraph['style']> = {}): Paragraph {
  return { id, style: { ...STYLE, ...extra }, spans: [{ text }] };
}

describe('Writer paragraph structure', () => {
  describe('split at caret', () => {
    it('cuts the paragraph and hands the caret to the new tail paragraph', () => {
      const paragraphs = [paragraph('p1', 'Alpha Beta')];
      const result = splitWriterParagraphAt(paragraphs, 0, 5, 'p-new');
      expect(result).not.toBeNull();
      expect(result?.paragraphs.map((p) => p.spans.map((s) => s.text).join(''))).toEqual(['Alpha', ' Beta']);
      expect(result?.paragraphs.map((p) => p.id)).toEqual(['p1', 'p-new']);
      expect(result?.caret).toEqual({ paragraphId: 'p-new', offset: 0 });
    });

    it('keeps character formatting on both sides of the cut', () => {
      const rich: Paragraph = {
        id: 'p1',
        style: { ...STYLE },
        spans: [{ text: 'Bold', bold: true }, { text: 'Italic', italic: true }],
      };
      const result = splitWriterParagraphAt([rich], 0, 4, 'p-new');
      const [head, tail] = result?.paragraphs ?? [];
      expect(head?.spans).toEqual([{ text: 'Bold', bold: true }]);
      expect(tail?.spans).toEqual([{ text: 'Italic', italic: true }]);
    });

    it('inherits style and list attributes in the created paragraph', () => {
      const list = paragraph('p1', 'Item text', { list_style: 'bullet', list_level: 2, heading_outline_numbered: true });
      const result = splitWriterParagraphAt([list], 0, 4, 'p-new');
      expect(result?.paragraphs[1]?.style).toEqual(list.style);
      expect(result?.paragraphs[1]?.style).not.toBe(list.style);
    });

    it('inserts an empty paragraph above the source when Enter is pressed at offset 0', () => {
      const paragraphs = [paragraph('p1', 'Alpha')];
      const result = splitWriterParagraphAt(paragraphs, 0, 0, 'p-new');
      expect(result?.paragraphs.map((p) => p.id)).toEqual(['p-new', 'p1']);
      expect(result?.paragraphs[0]?.spans).toEqual([{ text: '' }]);
      expect(result?.caret).toEqual({ paragraphId: 'p-new', offset: 0 });
    });

    it('appends an empty paragraph when Enter is pressed at the end of the text', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Tail')];
      const result = splitWriterParagraphAt(paragraphs, 0, 5, 'p-new');
      expect(result?.paragraphs.map((p) => p.id)).toEqual(['p1', 'p-new', 'p2']);
      expect(result?.paragraphs[1]?.spans).toEqual([{ text: '' }]);
    });

    it('clamps an out-of-range offset instead of dropping text', () => {
      const result = splitWriterParagraphAt([paragraph('p1', 'Alpha')], 0, 999, 'p-new');
      expect(result?.paragraphs[0]?.spans.map((s) => s.text).join('')).toBe('Alpha');
      expect(result?.paragraphs[1]?.spans).toEqual([{ text: '' }]);
    });

    it('rejects invalid indexes and empty ids', () => {
      expect(splitWriterParagraphAt([paragraph('p1', 'Alpha')], -1, 0, 'x')).toBeNull();
      expect(splitWriterParagraphAt([paragraph('p1', 'Alpha')], 4, 0, 'x')).toBeNull();
      expect(splitWriterParagraphAt([paragraph('p1', 'Alpha')], 0, 0, '')).toBeNull();
      expect(splitWriterParagraphAt([], 0, 0, 'x')).toBeNull();
    });
  });

  describe('native round 6 — a manual break is not inherited by a split', () => {
    /**
     * `Strg+Enter` set `page_break_before` on the paragraph; the next `Enter` cloned the style
     * and the *created* paragraph carried the same flag, so every keystroke produced another
     * empty page. A break belongs to the paragraph the user marked.
     */
    it('drops page_break_before from the paragraph Enter appends at the end', () => {
      const broken = paragraph('p1', 'Seite eins', { page_break_before: true });
      const result = splitWriterParagraphAt([broken], 0, 9, 'p-new');
      expect(result?.paragraphs[1]?.style.page_break_before).toBeUndefined();
      // The source keeps its break — only the newcomer is clean.
      expect(result?.paragraphs[0]?.style.page_break_before).toBe(true);
    });

    it('drops both break flags from a tail created in the middle of the text', () => {
      const broken = paragraph('p1', 'Alpha Beta', { page_break_before: true, column_break_before: true });
      const result = splitWriterParagraphAt([broken], 0, 5, 'p-new');
      const tail = result?.paragraphs[1];
      expect(tail?.spans.map((span) => span.text).join('')).toBe(' Beta');
      expect(tail?.style.page_break_before).toBeUndefined();
      expect(tail?.style.column_break_before).toBeUndefined();
      expect(result?.paragraphs[0]?.style.column_break_before).toBe(true);
    });

    it('drops the break from the empty paragraph created above (Enter at offset 0)', () => {
      const broken = paragraph('p1', 'Seite zwei', { page_break_before: true });
      const result = splitWriterParagraphAt([broken], 0, 0, 'p-new');
      expect(result?.paragraphs[0]?.id).toBe('p-new');
      expect(result?.paragraphs[0]?.style.page_break_before).toBeUndefined();
      expect(result?.paragraphs[1]?.style.page_break_before).toBe(true);
    });

    it('keeps every other style attribute of the source', () => {
      const source = paragraph('p1', 'Text', {
        page_break_before: true,
        style_name: 'heading1',
        heading_level: 1,
        space_before: 14,
        alignment: 'center',
      });
      const result = splitWriterParagraphAt([source], 0, 4, 'p-new');
      expect(result?.paragraphs[1]?.style).toMatchObject({
        style_name: 'heading1',
        heading_level: 1,
        space_before: 14,
        alignment: 'center',
      });
    });
  });

  describe('merge backward', () => {    it('joins the paragraph into its predecessor and places the caret on the seam', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      const result = mergeWriterParagraphBackward(paragraphs, 1);
      expect(result?.paragraphs).toHaveLength(1);
      expect(result?.paragraphs[0]?.spans.map((s) => s.text).join('')).toBe('AlphaBeta');
      expect(result?.removedParagraphId).toBe('p2');
      expect(result?.caret).toEqual({ paragraphId: 'p1', offset: 5 });
      expect(result?.joinedText).toBe(true);
    });

    it('removes an empty paragraph without touching the predecessor text', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', '')];
      const result = mergeWriterParagraphBackward(paragraphs, 1);
      expect(result?.paragraphs.map((p) => p.id)).toEqual(['p1']);
      expect(result?.paragraphs[0]?.spans.map((s) => s.text).join('')).toBe('Alpha');
      expect(result?.caret).toEqual({ paragraphId: 'p1', offset: 5 });
      expect(result?.joinedText).toBe(false);
    });

    it('keeps the caret at zero when merging into an empty first paragraph', () => {
      const paragraphs = [paragraph('p1', ''), paragraph('p2', 'Beta')];
      const result = mergeWriterParagraphBackward(paragraphs, 1);
      expect(result?.paragraphs).toHaveLength(1);
      expect(result?.paragraphs[0]?.spans.map((s) => s.text).join('')).toBe('Beta');
      expect(result?.caret).toEqual({ paragraphId: 'p1', offset: 0 });
    });

    it('collapses two empty paragraphs into one', () => {
      const paragraphs = [paragraph('p1', ''), paragraph('p2', '')];
      const result = mergeWriterParagraphBackward(paragraphs, 1);
      expect(result?.paragraphs.map((p) => p.id)).toEqual(['p1']);
      expect(result?.paragraphs[0]?.spans).toEqual([{ text: '' }]);
    });

    it('preserves the character formatting of both paragraphs', () => {
      const paragraphs: Paragraph[] = [
        { id: 'p1', style: { ...STYLE }, spans: [{ text: 'Bold', bold: true }] },
        { id: 'p2', style: { ...STYLE }, spans: [{ text: 'Italic', italic: true }] },
      ];
      const result = mergeWriterParagraphBackward(paragraphs, 1);
      expect(result?.paragraphs[0]?.spans).toEqual([
        { text: 'Bold', bold: true },
        { text: 'Italic', italic: true },
      ]);
    });

    it('keeps the predecessor paragraph style, matching word-processor behaviour', () => {
      const paragraphs = [
        paragraph('p1', 'Alpha', { style_name: 'heading1', heading_level: 1 }),
        paragraph('p2', 'Beta'),
      ];
      const result = mergeWriterParagraphBackward(paragraphs, 1);
      expect(result?.paragraphs[0]?.style.style_name).toBe('heading1');
    });

    it('does not mutate the input paragraphs', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      const snapshot = JSON.stringify(paragraphs);
      mergeWriterParagraphBackward(paragraphs, 1);
      expect(JSON.stringify(paragraphs)).toBe(snapshot);
    });

    it('returns null outside the mergeable range', () => {
      const paragraphs = [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')];
      expect(mergeWriterParagraphBackward(paragraphs, 0)).toBeNull();
      expect(mergeWriterParagraphBackward(paragraphs, 2)).toBeNull();
      expect(mergeWriterParagraphBackward(paragraphs, 1.5)).toBeNull();
      expect(mergeWriterParagraphBackward([], 1)).toBeNull();
    });
  });

  describe('span helpers', () => {
    it('slices spans across run boundaries', () => {
      const spans = [{ text: 'abc', bold: true }, { text: 'def', italic: true }];
      expect(sliceWriterSpans(spans, 2, 5)).toEqual([
        { text: 'c', bold: true },
        { text: 'de', italic: true },
      ]);
    });

    it('returns a single empty span for an empty slice', () => {
      expect(sliceWriterSpans([{ text: 'abc' }], 1, 1)).toEqual([{ text: '' }]);
    });

    it('normalizes away empty spans but never returns an empty array', () => {
      expect(normalizeWriterSpans([{ text: '' }, { text: 'x' }, { text: '' }])).toEqual([{ text: 'x' }]);
      expect(normalizeWriterSpans([{ text: '' }])).toEqual([{ text: '' }]);
      expect(normalizeWriterSpans([])).toEqual([{ text: '' }]);
    });
  });
});
