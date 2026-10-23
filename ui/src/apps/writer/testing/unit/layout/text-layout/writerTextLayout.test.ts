// STATUS: PLATIN — Unicode line-break behavior tests
import { describe, expect, it } from 'vitest';
import { wrapWriterText, wrapWriterTextRanges, writerPdfSafeText } from '../../../../layout/text-layout/writerTextLayout';

describe('Writer Unicode line breaking', () => {
  it('does not break at protected spaces', () => {
    expect(wrapWriterText('alpha\u00A0beta gamma', 7)).toEqual(['alpha\u00A0beta', 'gamma']);
    expect(wrapWriterText('alpha beta', 7)).toEqual(['alpha', 'beta']);
  });
  it('breaks at a soft hyphen only when required', () => {
    expect(wrapWriterText('Sonder\u00ADzeichen', 8)).toEqual(['Sonder-', 'zeichen']);
    expect(wrapWriterText('Sonder\u00ADzeichen', 20)).toEqual(['Sonderzeichen']);
  });
  it('keeps non-breaking hyphens inside one token', () => {
    expect(wrapWriterText('A\u2011Z test', 2)).toEqual(['A\u2011Z', 'test']);
  });
  it('maps layout controls safely for the built-in PDF font', () => {
    expect(writerPdfSafeText('A\u00A0B\u2011C\u00AD\u2060')).toBe('A B-C');
  });
  it('distinguishes overflow, emergency and anywhere break policies', () => {
    expect(wrapWriterText('abcdefghij', 4, { lineBreakMode: 'normal' })).toEqual(['abcdefghij']);
    expect(wrapWriterText('abcdefghij', 4, { lineBreakMode: 'break-word' })).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapWriterTextRanges('abcdefghij', 4, { lineBreakMode: 'keep-all' })).toEqual([{ start: 0, end: 10 }]);
    expect(wrapWriterTextRanges('abcdefghij', 4, { lineBreakMode: 'anywhere' })).toEqual([
      { start: 0, end: 4 }, { start: 4, end: 8 }, { start: 8, end: 10 },
    ]);
  });
  it('uses or suppresses manual soft-hyphen break opportunities explicitly', () => {
    const text = 'Sonder\u00ADzeichen';
    expect(wrapWriterText(text, 8, { hyphenationMode: 'manual' })).toEqual(['Sonder-', 'zeichen']);
    expect(wrapWriterText(text, 8, { lineBreakMode: 'normal', hyphenationMode: 'none' })).toEqual(['Sonderzeichen']);
  });
});
