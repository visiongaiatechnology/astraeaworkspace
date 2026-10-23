// STATUS: PLATIN — Writer span formatting toggle contracts
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  resolveWriterWordRangeAtOffset,
  setWriterSpanPropertyAtOffset,
  toggleWriterSpanProperty,
  writerRangeIsFullyFormatted,
} from '../../../../editing/text/writerSpanFormatToggle';

const STYLE = { alignment: 'left' as const, line_height: 1.6, space_before: 0, space_after: 0 };

function paragraph(spans: Paragraph['spans']): Paragraph {
  return { id: 'p1', style: { ...STYLE }, spans };
}

const text = (p: Paragraph) => p.spans.map((s) => s.text).join('');
const flags = (p: Paragraph, property: 'bold' | 'underline') => p.spans.map((s) => `${s.text}:${s[property] ? '1' : '0'}`);

describe('Writer span formatting toggle', () => {
  describe('fully-formatted detection', () => {
    const spans = [{ text: 'Alpha', bold: true }, { text: ' Beta' }, { text: ' Gamma', bold: true }];

    it('is true only when every covered character carries the property', () => {
      expect(writerRangeIsFullyFormatted(spans, { start: 0, end: 5 }, 'bold')).toBe(true);
      expect(writerRangeIsFullyFormatted(spans, { start: 0, end: 6 }, 'bold')).toBe(false);
      expect(writerRangeIsFullyFormatted(spans, { start: 6, end: 11 }, 'bold')).toBe(false);
      expect(writerRangeIsFullyFormatted(spans, { start: 11, end: 17 }, 'bold')).toBe(true);
    });

    it('uses the surrounding span for a collapsed range', () => {
      expect(writerRangeIsFullyFormatted(spans, { start: 2, end: 2 }, 'bold')).toBe(true);
      expect(writerRangeIsFullyFormatted(spans, { start: 8, end: 8 }, 'bold')).toBe(false);
    });

    it('clamps an out-of-range request instead of reading past the text', () => {
      expect(writerRangeIsFullyFormatted(spans, { start: -5, end: 999 }, 'bold')).toBe(false);
      expect(writerRangeIsFullyFormatted(spans, { start: Number.NaN, end: 5 }, 'bold')).toBe(true);
    });
  });

  describe('word detection', () => {
    const spans = [{ text: 'Alpha Beta Gamma' }];

    it('finds the word around the caret', () => {
      expect(resolveWriterWordRangeAtOffset(spans, 3)).toEqual({ start: 0, end: 5 });
      expect(resolveWriterWordRangeAtOffset(spans, 8)).toEqual({ start: 6, end: 10 });
      expect(resolveWriterWordRangeAtOffset(spans, 16)).toEqual({ start: 11, end: 16 });
    });

    it('treats the caret directly after a word as part of that word', () => {
      expect(resolveWriterWordRangeAtOffset(spans, 5)).toEqual({ start: 0, end: 5 });
    });

    it('returns null in whitespace and in an empty paragraph', () => {
      // "Alpha  Beta": index 5 and 6 are spaces, so the caret at 6 has no word.
      expect(resolveWriterWordRangeAtOffset([{ text: 'Alpha  Beta' }], 6)).toBeNull();
      expect(resolveWriterWordRangeAtOffset([{ text: '' }], 0)).toBeNull();
      expect(resolveWriterWordRangeAtOffset([], 0)).toBeNull();
    });
  });

  describe('insertion point formatting', () => {
    it('prepares the empty paragraph for the next typed character', () => {
      const updated = setWriterSpanPropertyAtOffset(paragraph([{ text: '' }]), 0, 'bold', true);
      expect(updated.spans).toEqual([{ text: '', bold: true }]);
    });

    it('sets the property only on the span that covers the offset', () => {
      const source = paragraph([{ text: 'Alpha' }, { text: ' Beta' }]);
      const updated = setWriterSpanPropertyAtOffset(source, 2, 'underline', true);
      expect(flags(updated, 'underline')).toEqual(['Alpha:1', ' Beta:0']);
    });

    it('does not mutate the input paragraph', () => {
      const source = paragraph([{ text: 'Alpha' }]);
      const snapshot = JSON.stringify(source);
      setWriterSpanPropertyAtOffset(source, 1, 'bold', true);
      expect(JSON.stringify(source)).toBe(snapshot);
    });
  });

  describe('toggle on a marked range', () => {
    it('applies bold to a plain selection', () => {
      const source = paragraph([{ text: 'Alpha Beta' }]);
      const result = toggleWriterSpanProperty(source, 'bold', { start: 0, end: 5 });
      expect(result.removed).toBe(false);
      expect(flags(result.paragraph, 'bold')).toEqual(['Alpha:1', ' Beta:0']);
    });

    it('removes bold from a fully bold selection', () => {
      const source = paragraph([{ text: 'Alpha', bold: true }, { text: ' Beta' }]);
      const result = toggleWriterSpanProperty(source, 'bold', { start: 0, end: 5 });
      expect(result.removed).toBe(true);
      expect(flags(result.paragraph, 'bold')).toEqual(['Alpha:0', ' Beta:0']);
    });

    it('completes a partially bold selection instead of clearing it', () => {
      const source = paragraph([{ text: 'Alpha', bold: true }, { text: ' Beta' }]);
      const result = toggleWriterSpanProperty(source, 'bold', { start: 0, end: 10 });
      expect(result.removed).toBe(false);
      expect(flags(result.paragraph, 'bold')).toEqual(['Alpha Beta:1']);
    });

    it('never touches text outside the selection', () => {
      const source = paragraph([{ text: 'Alpha' }, { text: ' Beta' }, { text: ' Gamma' }]);
      const result = toggleWriterSpanProperty(source, 'bold', { start: 6, end: 10 });
      // Only "Beta" is covered; the leading space of its span stays untouched.
      expect(flags(result.paragraph, 'bold')).toEqual(['Alpha :0', 'Beta:1', ' Gamma:0']);
      expect(text(result.paragraph)).toBe('Alpha Beta Gamma');
    });

    it('handles an inverted selection', () => {
      const source = paragraph([{ text: 'Alpha Beta' }]);
      const result = toggleWriterSpanProperty(source, 'bold', { start: 5, end: 0 });
      expect(text(result.paragraph)).toBe('Alpha Beta');
      expect(flags(result.paragraph, 'bold')).toEqual(['Alpha:1', ' Beta:0']);
    });

    it('toggles each property independently', () => {
      const source = paragraph([{ text: 'Alpha' }]);
      const bold = toggleWriterSpanProperty(source, 'bold', { start: 0, end: 5 }).paragraph;
      const both = toggleWriterSpanProperty(bold, 'underline', { start: 0, end: 5 }).paragraph;
      const boldOff = toggleWriterSpanProperty(both, 'bold', { start: 0, end: 5 }).paragraph;
      expect(boldOff.spans).toEqual([{ text: 'Alpha', bold: false, underline: true }]);
    });
  });

  describe('toggle without a selection', () => {
    it('formats the word under the caret', () => {
      const source = paragraph([{ text: 'Alpha Beta' }]);
      const result = toggleWriterSpanProperty(source, 'bold', { start: 2, end: 2 });
      expect(result.range).toEqual({ start: 0, end: 5 });
      expect(flags(result.paragraph, 'bold')).toEqual(['Alpha:1', ' Beta:0']);
    });

    it('removes the format from a fully formatted word', () => {
      const source = paragraph([{ text: 'Alpha', bold: true }, { text: ' Beta' }]);
      const result = toggleWriterSpanProperty(source, 'bold', { start: 2, end: 2 });
      expect(result.removed).toBe(true);
      expect(flags(result.paragraph, 'bold')).toEqual(['Alpha:0', ' Beta:0']);
    });

    it('prepares an empty paragraph when there is no word', () => {
      const result = toggleWriterSpanProperty(paragraph([{ text: '' }]), 'bold', { start: 0, end: 0 });
      expect(result.range).toBeNull();
      expect(result.paragraph.spans).toEqual([{ text: '', bold: true }]);
    });

    it('prepares the insertion point when the caret sits between two words', () => {
      // "Alpha  Beta": index 5 and 6 are spaces, so the caret at 6 has no word.
      const source = paragraph([{ text: 'Alpha  Beta' }]);
      const result = toggleWriterSpanProperty(source, 'bold', { start: 6, end: 6 });
      expect(result.range).toBeNull();
      expect(text(result.paragraph)).toBe('Alpha  Beta');
      expect(result.paragraph.spans).toEqual([{ text: 'Alpha  Beta', bold: true }]);
    });
  });
});
