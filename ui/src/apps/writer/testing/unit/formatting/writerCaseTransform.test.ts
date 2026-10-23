// STATUS: PLATIN — Unicode and formatting invariants for Writer case transforms
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { transformWriterParagraphRange } from '../../../formatting/transforms/writerCaseTransform';

const paragraph: Paragraph = {
  id: 'p-1',
  style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 0 },
  spans: [
    { text: 'grüße ', italic: true },
    { text: 'WELT', bold: true },
    { text: '. nächste RUNDE', underline: true },
  ],
};

describe('Writer case transformations', () => {
  it('uppercases a selected range while preserving every span format', () => {
    const result = transformWriterParagraphRange(paragraph, 0, 10, 'upper', 'de-DE');
    expect(result.paragraph.spans).toEqual([
      { text: 'GRÜSSE ', italic: true },
      { text: 'WELT', bold: true },
      { text: '. nächste RUNDE', underline: true },
    ]);
    expect(result.selectionEnd).toBe(11);
  });

  it('applies Unicode title case across span boundaries', () => {
    const result = transformWriterParagraphRange(paragraph, 0, 25, 'title', 'de-DE');
    expect(result.paragraph.spans.map((span) => span.text).join('')).toBe('Grüße Welt. Nächste Runde');
  });

  it('applies sentence case across punctuation and spans', () => {
    const result = transformWriterParagraphRange(paragraph, 0, 25, 'sentence', 'de-DE');
    expect(result.paragraph.spans.map((span) => span.text).join('')).toBe('Grüße welt. Nächste runde');
  });

  it('toggles Unicode letter case without changing punctuation', () => {
    const result = transformWriterParagraphRange(paragraph, 0, 10, 'toggle', 'de-DE');
    expect(result.paragraph.spans[0].text).toBe('GRÜSSE ');
    expect(result.paragraph.spans[1].text).toBe('welt');
    expect(result.paragraph.spans.map((span) => span.text).join('')).toBe('GRÜSSE welt. nächste RUNDE');
  });

  it('snaps hostile offsets to grapheme boundaries', () => {
    const emojiParagraph: Paragraph = { ...paragraph, spans: [{ text: 'A👩‍💻B' }] };
    const result = transformWriterParagraphRange(emojiParagraph, 2, 4, 'lower', 'de-DE');
    expect(result.paragraph.spans[0].text).toBe('A👩‍💻B');
    expect(result.selectionStart).toBe(1);
    expect(result.selectionEnd).toBe(6);
  });

  it('leaves collapsed selections unchanged', () => {
    const result = transformWriterParagraphRange(paragraph, 3, 3, 'upper', 'de-DE');
    expect(result.paragraph).toBe(paragraph);
  });
});
