// STATUS: DIAMANT VGT SUPREME — Structural Writer break invariants
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { insertWriterFlowBreak, insertWriterSectionBreak } from '../../../editing/flow-breaks/writerBreaks';

const paragraph = (): Paragraph => ({
  id: 'p-1',
  style: {
    alignment: 'left',
    line_height: 1.5,
    space_before: 0,
    space_after: 8,
  },
  spans: [
    { text: 'Alpha ', bold: true },
    { text: 'Beta', italic: true },
  ],
});

describe('Writer break domain', () => {
  it('replaces the selected range with a manual line break and preserves surrounding spans', () => {
    const result = insertWriterFlowBreak(
      [paragraph()],
      'p-1',
      { paragraphId: 'p-1', start: 5, end: 6 },
      'line',
    );

    expect(result.paragraphs[0]?.spans.map((span) => span.text).join('')).toBe('Alpha\nBeta');
    expect(result.paragraphs[0]?.spans[0]?.bold).toBe(true);
    expect(result.paragraphs[0]?.spans.at(-1)?.italic).toBe(true);
    expect(result.caretOffset).toBe(6);
  });

  it('splits at the selection and applies a page break only to the tail paragraph', () => {
    const result = insertWriterFlowBreak(
      [paragraph()],
      'p-1',
      { paragraphId: 'p-1', start: 5, end: 6 },
      'page',
      () => 'p-tail',
    );

    expect(result.paragraphs.map((item) => item.spans.map((span) => span.text).join(''))).toEqual(['Alpha', 'Beta']);
    expect(result.paragraphs[0]?.style.page_break_before).toBeUndefined();
    expect(result.paragraphs[1]?.style.page_break_before).toBe(true);
    expect(result.paragraphs[1]?.spans[0]?.italic).toBe(true);
    expect(result.activeParagraphId).toBe('p-tail');
  });

  it('creates an explicit column break without accidentally retaining a page break', () => {
    const source = paragraph();
    source.style.page_break_before = true;
    const result = insertWriterFlowBreak([source], 'p-1', null, 'column', () => 'p-tail');

    expect(result.paragraphs[1]?.style.column_break_before).toBe(true);
    expect(result.paragraphs[1]?.style.page_break_before).toBeUndefined();
  });

  it.each(['next-page', 'continuous', 'even-page', 'odd-page'] as const)(
    'creates a span-preserving %s section boundary',
    (breakType) => {
      const result = insertWriterSectionBreak(
        [paragraph()],
        'p-1',
        { paragraphId: 'p-1', start: 6, end: 6 },
        breakType,
        () => 'section-tail',
      );

      expect(result.paragraphs.map((item) => item.spans.map((span) => span.text).join(''))).toEqual(['Alpha ', 'Beta']);
      expect(result.sectionStartParagraphId).toBe('section-tail');
      expect(result.breakType).toBe(breakType);
      expect(result.paragraphs[1]?.style.page_break_before).toBeUndefined();
      expect(result.paragraphs[1]?.style.column_break_before).toBeUndefined();
    },
  );

  it('rejects missing targets and duplicate generated identities', () => {
    expect(() => insertWriterFlowBreak([paragraph()], 'missing', null, 'page')).toThrow(/does not exist/u);
    expect(() => insertWriterSectionBreak([paragraph()], 'p-1', null, 'next-page', () => 'p-1')).toThrow(/unique/u);
  });
});
