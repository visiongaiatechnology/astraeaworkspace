// STATUS: PLATIN — Writer span-preservation tests
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  applyWriterTextSpanFormatRange,
  replaceWriterParagraphRange,
  replaceWriterParagraphText,
  writerTextSpanFormatAtOffset,
} from '../../../../editing/text/writerTextEditing';

const paragraph: Paragraph = {
  id: 'p1',
  style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8 },
  spans: [
    { text: 'Alpha ', bold: true, font_size_pt: 11 },
    { text: 'Beta', italic: true, font_size_pt: 11 },
  ],
};

describe('Writer text editing', () => {
  it('inserts at the selected UTF-16 offset and inherits surrounding formatting', () => {
    const updated = replaceWriterParagraphRange(paragraph, 6, 6, 'Ω');
    expect(updated.spans.map((span) => span.text).join('')).toBe('Alpha ΩBeta');
    expect(updated.spans[0]).toMatchObject({ text: 'Alpha Ω', bold: true });
    expect(updated.spans[1]).toMatchObject({ text: 'Beta', italic: true });
  });

  it('replaces a range across formatting spans without losing unaffected formatting', () => {
    const updated = replaceWriterParagraphRange(paragraph, 3, 8, '—');
    expect(updated.spans.map((span) => span.text).join('')).toBe('Alp—ta');
    expect(updated.spans[0]).toMatchObject({ text: 'Alp—', bold: true });
    expect(updated.spans[1]).toMatchObject({ text: 'ta', italic: true });
  });

  it('preserves spans around ordinary textarea edits', () => {
    const updated = replaceWriterParagraphText(paragraph, 'Alpha wide Beta');
    expect(updated.spans.map((span) => span.text).join('')).toBe('Alpha wide Beta');
    expect(updated.spans.at(-1)).toMatchObject({ text: 'Beta', italic: true });
  });

  it('clamps hostile ranges and retains a valid empty span', () => {
    const updated = replaceWriterParagraphRange(paragraph, -100, 10_000, '');
    expect(updated.spans).toEqual([{ text: '', font_size_pt: 11 }]);
  });
});

describe('Writer format painter span operations', () => {
  it('reads the exact source formatting at the cursor', () => {
    expect(writerTextSpanFormatAtOffset(paragraph, 6)).toEqual({ italic: true, font_size_pt: 11 });
    expect(writerTextSpanFormatAtOffset(paragraph, 7)).toEqual({ italic: true, font_size_pt: 11 });
  });

  it('splits target spans and preserves formatting outside the selection', () => {
    const updated = applyWriterTextSpanFormatRange(paragraph, 2, 8, {
      underline: true,
      text_color: '#123456',
      font_size_pt: 14,
    });
    expect(updated.spans).toEqual([
      { text: 'Al', bold: true, font_size_pt: 11 },
      { text: 'pha Be', underline: true, text_color: '#123456', font_size_pt: 14 },
      { text: 'ta', italic: true, font_size_pt: 11 },
    ]);
  });

  it('treats reverse and hostile ranges deterministically', () => {
    const updated = applyWriterTextSpanFormatRange(paragraph, 99, -5, { bold: false });
    expect(updated.spans).toEqual([{ text: 'Alpha Beta', bold: false }]);
  });

  it('does not mutate a collapsed target selection', () => {
    expect(applyWriterTextSpanFormatRange(paragraph, 4, 4, { underline: true })).toBe(paragraph);
  });
});
