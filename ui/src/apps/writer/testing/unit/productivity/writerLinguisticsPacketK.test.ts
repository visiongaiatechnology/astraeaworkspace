// STATUS: DIAMANT VGT SUPREME — Writer language ranges, dictionary persistence and hyphenation regression
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import {
  addWriterCustomWord,
  analyzeParagraphLinguistics,
  normalizeWriterCustomDictionary,
  normalizeWriterLinguisticsConfig,
  removeWriterCustomWord,
} from '../../../productivity/language/writerLinguistics';
import { applyWriterTextSpanFormatRange } from '../../../editing/text/writerTextEditing';
import { wrapWriterText, wrapWriterTextRanges } from '../../../layout/text-layout/writerTextLayout';
import { normalizeWriterTextFlow } from '../../../layout/text-flow/writerTextFlow';

function paragraph(spans: Paragraph['spans']): Paragraph {
  return {
    id: 'p-language',
    style: {
      alignment: 'left',
      line_height: 1.5,
      space_before: 0,
      space_after: 0,
      hyphenation_mode: 'auto',
    },
    spans,
  };
}

describe('Writer linguistic packet K', () => {
  it('normalizes and bounds the document user dictionary deterministically', () => {
    expect(normalizeWriterCustomDictionary([' Astraea ', 'astraea', 'VGT', '', '   '])).toEqual(['astraea', 'vgt']);
    const added = addWriterCustomWord(['astraea'], 'GaiaOS');
    expect(added).toEqual(['astraea', 'gaiaos']);
    expect(removeWriterCustomWord(added, 'ASTRAEA')).toEqual(['gaiaos']);
    expect(normalizeWriterLinguisticsConfig({ defaultLanguage: 'en-GB', customDictionary: added })).toEqual({
      defaultLanguage: 'en-GB',
      customDictionary: ['astraea', 'gaiaos'],
    });
  });

  it('audits contiguous language ranges with their own language tag', () => {
    const source = paragraph([
      { text: 'system ', language: 'de-DE' },
      { text: 'the the ', language: 'en-US' },
      { text: 'Astraea', language: 'en-US' },
    ]);
    const issues = analyzeParagraphLinguistics(source, {
      defaultLanguage: 'de-DE',
      customDictionary: ['astraea'],
    });
    expect(issues.some((issue) => issue.type === 'grammar' && issue.language === 'en-US')).toBe(true);
    expect(issues.some((issue) => issue.word.toLowerCase() === 'astraea')).toBe(false);
  });

  it('applies language metadata to an exact text range without flattening spans', () => {
    const source = paragraph([
      { text: 'Deutsch ', bold: true, language: 'de-DE' },
      { text: 'English', italic: true, language: 'en-US' },
    ]);
    const tagged = applyWriterTextSpanFormatRange(source, 8, 15, {
      italic: true,
      language: 'en-GB',
    });
    expect(tagged.spans.map((span) => span.text).join('')).toBe('Deutsch English');
    expect(tagged.spans.some((span) => span.language === 'en-GB' && span.italic)).toBe(true);
    expect(tagged.spans[0]?.bold).toBe(true);
  });

  it('supports automatic language-aware hyphenation without mutating source text', () => {
    const source = 'architektur transmission';
    const lines = wrapWriterText('architektur', 6, {
      hyphenationMode: 'auto',
      language: 'de-DE',
    });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.some((line) => line.endsWith('-'))).toBe(true);

    const ranges = wrapWriterTextRanges(source, 7, {
      hyphenationMode: 'auto',
      language: 'de-DE',
      languageRanges: [
        { start: 0, end: 11, language: 'de-DE' },
        { start: 12, end: source.length, language: 'en-US' },
      ],
    });
    expect(ranges[0]?.start).toBe(0);
    expect(ranges.at(-1)?.end).toBe(source.length);
    expect(source.includes('\u00AD')).toBe(false);
  });

  it('normalizes the auto hyphenation flow mode as a first-class paragraph setting', () => {
    expect(normalizeWriterTextFlow({ hyphenation_mode: 'auto' }).hyphenationMode).toBe('auto');
  });
});
