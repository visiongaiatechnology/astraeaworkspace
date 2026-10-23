// STATUS: PLATIN — Unicode-aware Writer statistics tests
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import { calculateTextStatistics } from '../../../../utils/writerUtils';

const style = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 8 };

describe('Writer document statistics', () => {
  it('joins styled spans before counting words', () => {
    const paragraphs: Paragraph[] = [{
      id: 'p1', style, spans: [{ text: 'Sover', font_size_pt: 11 }, { text: 'eign local', bold: true, font_size_pt: 11 }],
    }];
    const stats = calculateTextStatistics(paragraphs, {
      pageCount: 3,
      tableCount: 1,
      additionalTexts: ['Grid cell'],
    });
    expect(stats).toMatchObject({ words: 4, charsWithSpaces: 24, charsWithoutSpaces: 22, paragraphs: 1, pages: 3, tables: 1 });
  });

  it('counts Unicode grapheme clusters instead of UTF-16 code units', () => {
    const stats = calculateTextStatistics([{ id: 'p1', style, spans: [{ text: 'Hallo 👨‍👩‍👧‍👦 Welt', font_size_pt: 11 }] }]);
    expect(stats.words).toBe(2);
    expect(stats.charsWithSpaces).toBe(12);
    expect(stats.charsWithoutSpaces).toBe(10);
  });

  it('reports zero reading time for an empty document', () => {
    const stats = calculateTextStatistics([], { pageCount: 1 });
    expect(stats.readingTimeMinutes).toBe(0);
    expect(stats.speakingTimeMinutes).toBe(0);
    expect(stats.pages).toBe(1);
  });
});
