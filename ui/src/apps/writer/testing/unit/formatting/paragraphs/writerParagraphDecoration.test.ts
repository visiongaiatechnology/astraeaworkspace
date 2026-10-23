// STATUS: DIAMANT VGT SUPREME — Paragraph decoration boundary tests
import { describe, expect, it } from 'vitest';
import type { ParagraphStyle } from '../../../../../../shared/contracts/workspace';
import {
  normalizeWriterParagraphBorder,
  resolveWriterParagraphDecoration,
  writerParagraphDecorationCss,
} from '../../../../formatting/paragraphs/writerParagraphDecoration';

const baseStyle = (): ParagraphStyle => ({
  alignment: 'left',
  line_height: 1.5,
  space_before: 0,
  space_after: 8,
});

describe('Writer paragraph decoration', () => {
  it('clamps numeric boundaries and rejects non-hex CSS injection values', () => {
    const border = normalizeWriterParagraphBorder({
      style: 'solid',
      widthPt: 999,
      color: 'red; background:url(https://invalid.example)',
      spacingPt: -50,
    });
    expect(border).toEqual({ style: 'solid', widthPt: 6, color: '#64748b', spacingPt: 0 });
  });

  it('resolves all four sides and produces sanitized CSS declarations', () => {
    const line = { style: 'double' as const, widthPt: 1.5, color: '#334155', spacingPt: 4 };
    const decoration = resolveWriterParagraphDecoration({
      ...baseStyle(),
      borders: { top: line, right: line, bottom: line, left: line },
      shading: { fillColor: '#eff6ff', opacityPercent: 75 },
    });
    const css = writerParagraphDecorationCss(decoration);
    expect(css.borderTop).toBe('1.5pt double #334155');
    expect(css.borderRight).toBe('1.5pt double #334155');
    expect(css.paddingBottom).toBe('4pt');
    expect(css.backgroundColor).toBe('rgba(239, 246, 255, 0.75)');
    expect(decoration.verticalInsetPt).toBe(11);
  });

  it('migrates the bounded legacy palette without preserving raw CSS strings', () => {
    const decoration = resolveWriterParagraphDecoration({
      ...baseStyle(),
      border_top: '1px solid rgba(148, 163, 184, 0.4)',
      background_color: 'rgba(239, 246, 255, 0.9)',
    });
    expect(decoration.borders.top?.color).toBe('#94a3b8');
    expect(decoration.shading).toEqual({ fillColor: '#eff6ff', opacityPercent: 90 });
  });

  it('reports the horizontal insets a border takes from the text column', () => {
    const line = { style: 'solid' as const, widthPt: 2, color: '#334155', spacingPt: 5 };
    const decoration = resolveWriterParagraphDecoration({
      ...baseStyle(),
      borders: { top: line, right: line, bottom: line, left: line },
    });
    expect(decoration.leftInsetPt).toBe(7);
    expect(decoration.rightInsetPt).toBe(7);
    expect(decoration.horizontalInsetPt).toBe(14);
    expect(decoration.verticalInsetPt).toBe(14);
  });

  it('reports zero horizontal insets when only top and bottom are bordered', () => {
    const line = { style: 'solid' as const, widthPt: 1, color: '#334155', spacingPt: 4 };
    const decoration = resolveWriterParagraphDecoration({
      ...baseStyle(),
      borders: { top: line, bottom: line },
    });
    expect(decoration.horizontalInsetPt).toBe(0);
    expect(decoration.verticalInsetPt).toBe(10);
  });
});
