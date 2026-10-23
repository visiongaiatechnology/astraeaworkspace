// STATUS: PLATIN — Paragraph spacing boundary tests
import { describe, expect, it } from 'vitest';
import { resolveWriterParagraphSpacing } from '../../../../formatting/paragraphs/writerParagraphSpacing';

describe('Writer paragraph spacing', () => {
  it('preserves valid point values', () => {
    expect(resolveWriterParagraphSpacing({ space_before: 6, space_after: 12 })).toEqual({ beforePt: 6, afterPt: 12 });
  });
  it('blocks negative and excessive spacing values', () => {
    expect(resolveWriterParagraphSpacing({ space_before: -1, space_after: 9000 })).toEqual({ beforePt: 0, afterPt: 1584 });
  });
  it('replaces non-finite imported values with explicit fallbacks', () => {
    expect(resolveWriterParagraphSpacing(
      { space_before: Number.NaN, space_after: Number.POSITIVE_INFINITY }, 4, 8,
    )).toEqual({ beforePt: 4, afterPt: 8 });
  });
});
