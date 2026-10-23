// STATUS: PLATIN — A paragraph border narrows the text column, so the line-break
// calculation must subtract the same horizontal space the CSS adds as padding.
// It did not, which made bordered paragraphs wrap later than they render and run
// past the page edge.
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterStyleDefinition } from '../../../../../../shared/contracts/workspace';
import { measureWriterParagraphTypography } from '../../../../layout/pagination/measurement/writerPaginationMeasurement';

const STYLE = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 0 };
const COLUMN_PX = 640;
// A narrow column makes the width a border takes away visible in the line count
// instead of disappearing into rounding.
const NARROW_COLUMN_PX = 200;

const paragraph = (overrides: Partial<Paragraph['style']> = {}): Paragraph => ({
  id: 'p1',
  style: { ...STYLE, ...overrides },
  spans: [{ text: 'Wort '.repeat(120).trim(), font_size_pt: 11 }],
});

const lineCount = (p: Paragraph, columnPx = COLUMN_PX, styles: WriterStyleDefinition[] = []) =>
  measureWriterParagraphTypography(p, columnPx, styles).lineRanges.length;

const sideBorders = (widthPt: number, spacingPt: number) => ({
  left: { style: 'solid' as const, widthPt, color: '#334155', spacingPt },
  right: { style: 'solid' as const, widthPt, color: '#334155', spacingPt },
});

describe('Writer border and text-column width', () => {
  it('wraps a bordered paragraph earlier than an unbordered one', () => {
    const plain = lineCount(paragraph(), NARROW_COLUMN_PX);
    const bordered = lineCount(paragraph({ borders: sideBorders(6, 24) }), NARROW_COLUMN_PX);
    expect(bordered).toBeGreaterThan(plain);
  });

  it('wraps earlier the more space the padding takes away', () => {
    const thin = lineCount(paragraph({ borders: sideBorders(1, 0) }), NARROW_COLUMN_PX);
    const thick = lineCount(paragraph({ borders: sideBorders(6, 24) }), NARROW_COLUMN_PX);
    expect(thick).toBeGreaterThan(thin);
  });

  it('leaves the line count alone for top and bottom borders only', () => {
    const plain = lineCount(paragraph());
    const horizontalOnly = lineCount(paragraph({
      borders: {
        top: { style: 'solid', widthPt: 2, color: '#334155', spacingPt: 8 },
        bottom: { style: 'solid', widthPt: 2, color: '#334155', spacingPt: 8 },
      },
    }));
    expect(horizontalOnly).toBe(plain);
  });

  it('still reserves vertical space for a top and bottom border', () => {
    const plain = measureWriterParagraphTypography(paragraph(), COLUMN_PX, []);
    const bordered = measureWriterParagraphTypography(paragraph({
      borders: {
        top: { style: 'solid', widthPt: 2, color: '#334155', spacingPt: 8 },
        bottom: { style: 'solid', widthPt: 2, color: '#334155', spacingPt: 8 },
      },
    }), COLUMN_PX, []);
    expect(bordered.spaceBeforePx - plain.spaceBeforePx).toBeCloseTo(10 * (96 / 72), 5);
    expect(bordered.spaceAfterPx - plain.spaceAfterPx).toBeCloseTo(10 * (96 / 72), 5);
  });

  it('combines indents and borders instead of counting one of them', () => {
    const indentOnly = lineCount(paragraph({ left_indent_mm: 20, right_indent_mm: 20 }), NARROW_COLUMN_PX);
    const both = lineCount(paragraph({
      left_indent_mm: 20,
      right_indent_mm: 20,
      borders: sideBorders(6, 24),
    }), NARROW_COLUMN_PX);
    expect(both).toBeGreaterThan(indentOnly);
  });

  it('never collapses the column to nothing for an extreme border', () => {
    const measurement = measureWriterParagraphTypography(paragraph({
      left_indent_mm: 500,
      right_indent_mm: 500,
      borders: {
        left: { style: 'double', widthPt: 6, color: '#334155', spacingPt: 24 },
        right: { style: 'double', widthPt: 6, color: '#334155', spacingPt: 24 },
      },
    }), COLUMN_PX, []);
    // The width falls back to a single character, so lines are short but positive.
    expect(measurement.characterWidthPx).toBeGreaterThan(0);
    expect(measurement.lineRanges.length).toBeGreaterThan(0);
  });
});
