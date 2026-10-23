// STATUS: PLATIN — Writer indentation invariant tests
import { describe, expect, it } from 'vitest';
import { resolveWriterParagraphIndent } from '../../../../formatting/paragraphs/writerParagraphIndent';

describe('Writer paragraph indentation', () => {
  it('preserves all four independent indentation dimensions', () => {
    expect(resolveWriterParagraphIndent({ left_indent_mm: 10, right_indent_mm: 8, first_line_indent_mm: 5 })).toEqual({
      leftMm: 10, rightMm: 8, firstLineMm: 5, hangingMm: 0,
    });
  });
  it('makes first-line and hanging indentation mutually exclusive', () => {
    expect(resolveWriterParagraphIndent({ first_line_indent_mm: 4, hanging_indent_mm: 7 }).hangingMm).toBe(0);
  });
  it('bounds malformed imported values', () => {
    expect(resolveWriterParagraphIndent({ left_indent_mm: -5, right_indent_mm: 900, hanging_indent_mm: Number.NaN })).toEqual({
      leftMm: 0, rightMm: 500, firstLineMm: 0, hangingMm: 0,
    });
  });
});
