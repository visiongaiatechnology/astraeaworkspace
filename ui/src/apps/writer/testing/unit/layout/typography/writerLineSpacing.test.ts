// STATUS: PLATIN — Writer line-spacing model tests
import { describe, expect, it } from 'vitest';
import type { ParagraphStyle } from '../../../../../../shared/contracts/workspace';
import { resolveWriterLineSpacing, writerLineHeightCss, writerLineHeightPt, writerLineHeightPx } from '../../../../layout/typography/line-spacing/writerLineSpacing';

const base: ParagraphStyle = { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8 };

describe('Writer line spacing', () => {
  it('preserves legacy multiplier documents', () => {
    expect(resolveWriterLineSpacing(base)).toEqual({ mode: 'preset', value: 1.5 });
    expect(writerLineHeightPx(base, 16)).toBe(24);
  });
  it('models exact spacing in typographic points', () => {
    const style = { ...base, line_spacing_mode: 'exact' as const, line_spacing_value: 18 };
    expect(writerLineHeightCss(style)).toBe('18pt');
    expect(writerLineHeightPt(style, 11)).toBe(18);
    expect(writerLineHeightPx(style, 16)).toBe(24);
  });
  it('enforces the minimum without shrinking natural line height', () => {
    const style = { ...base, line_spacing_mode: 'minimum' as const, line_spacing_value: 10 };
    expect(writerLineHeightCss(style)).toBe('max(10pt, 1.2em)');
    expect(writerLineHeightPt(style, 12)).toBeCloseTo(14.4);
  });
  it('clamps hostile or malformed persisted values', () => {
    expect(resolveWriterLineSpacing({ ...base, line_spacing_mode: 'multiple', line_spacing_value: 99 }).value).toBe(10);
    expect(resolveWriterLineSpacing({ ...base, line_spacing_mode: 'exact', line_spacing_value: Number.NaN }).value).toBe(12);
  });
});
