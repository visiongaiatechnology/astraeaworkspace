// STATUS: PLATIN — W-120 / W-121 / W-122: the patch path validates like the dialog
//
// The register recorded three ways to get past the checks the paragraph dialog
// performs: an indent or spacing above the band (W-120), an alignment smuggled
// through the generic `style` patch (W-121), and a partial `borders` object that
// deletes the sides it does not name (W-122). All three are one cause — the write
// path had no validation layer — so they are pinned here against one mechanism.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  patchWriterParagraphStyle,
} from '../../../../editing/paragraphs/writerParagraphFormatApply';
import {
  clampWriterParagraphIndentMm,
  clampWriterParagraphSpacingPt,
  WRITER_PARAGRAPH_INDENT_MAX_MM,
  WRITER_PARAGRAPH_SPACING_MAX_PT,
} from '../../../../editing/paragraphs/writerParagraphStyleBounds';

const STYLE = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 0 };
const para = (id: string, overrides: Partial<Paragraph['style']> = {}): Paragraph => ({
  id,
  style: { ...STYLE, ...overrides },
  spans: [{ text: `Text ${id}` }],
});

describe('Writer paragraph-style bounds are one definition (W-120)', () => {
  it('clamps an indent out of band instead of storing it', () => {
    const result = patchWriterParagraphStyle([para('p1')], [0], {
      style: { left_indent_mm: 900, right_indent_mm: -40 },
    });
    expect(result.paragraphs[0]?.style.left_indent_mm).toBe(WRITER_PARAGRAPH_INDENT_MAX_MM);
    expect(result.paragraphs[0]?.style.right_indent_mm).toBe(0);
  });

  it('clamps spacing out of band instead of storing it', () => {
    const result = patchWriterParagraphStyle([para('p1')], [0], {
      style: { space_before: 40000, space_after: -8 },
    });
    expect(result.paragraphs[0]?.style.space_before).toBe(WRITER_PARAGRAPH_SPACING_MAX_PT);
    expect(result.paragraphs[0]?.style.space_after).toBe(0);
  });

  it('refuses a non-finite indent rather than writing NaN', () => {
    const result = patchWriterParagraphStyle([para('p1')], [0], {
      style: { left_indent_mm: Number.NaN, space_after: Number.POSITIVE_INFINITY },
    });
    expect(result.changedCount).toBe(0);
    expect(result.paragraphs[0]?.style.left_indent_mm).toBeUndefined();
    expect(result.paragraphs[0]?.style.space_after).toBe(0);
  });

  it('normalizes a line height that arrives through the generic style patch', () => {
    const result = patchWriterParagraphStyle([para('p1')], [0], { style: { line_height: 99 } });
    expect(result.paragraphs[0]?.style.line_height).toBe(5);
  });

  it('clamps through the same function the dialog readers use', () => {
    expect(clampWriterParagraphIndentMm(900)).toBe(500);
    expect(clampWriterParagraphIndentMm(Number.NaN)).toBeUndefined();
    expect(clampWriterParagraphSpacingPt(9000)).toBe(1584);
    expect(clampWriterParagraphSpacingPt(undefined)).toBeUndefined();
  });
});

describe('Generic style patches validate the values they carry (W-121)', () => {
  it('drops an alignment the schema does not know', () => {
    const result = patchWriterParagraphStyle([para('p1')], [0], {
      style: { alignment: 'middle' as never },
    });
    expect(result.changedCount).toBe(0);
    expect(result.paragraphs[0]?.style.alignment).toBe('left');
  });

  it('still accepts a known alignment through the generic patch', () => {
    const result = patchWriterParagraphStyle([para('p1')], [0], { style: { alignment: 'right' } });
    expect(result.paragraphs[0]?.style.alignment).toBe('right');
  });

  it('keeps a dropped value out of the document for every target of a range', () => {
    const result = patchWriterParagraphStyle([para('p1'), para('p2')], [0, 1], {
      style: { alignment: 'middle' as never, left_indent_mm: 25 },
    });
    expect(result.changedCount).toBe(2);
    expect(result.paragraphs.map((p) => p.style.alignment)).toEqual(['left', 'left']);
    expect(result.paragraphs.map((p) => p.style.left_indent_mm)).toEqual([25, 25]);
  });
});

describe('A partial object patch merges instead of replacing (W-122)', () => {
  const top = { style: 'solid' as const, widthPt: 1, color: '#111111', spacingPt: 2 };
  const bottom = { style: 'dashed' as const, widthPt: 2, color: '#222222', spacingPt: 4 };

  it('keeps the sides a partial borders patch does not name', () => {
    const source = [para('p1', { borders: { top, bottom } })];
    const result = patchWriterParagraphStyle(source, [0], {
      style: { borders: { top: { ...top, color: '#333333' } } },
    });
    expect(result.paragraphs[0]?.style.borders).toEqual({
      top: { ...top, color: '#333333' },
      bottom,
    });
  });

  it('removes the side that the patch explicitly clears', () => {
    const source = [para('p1', { borders: { top, bottom } })];
    const result = patchWriterParagraphStyle(source, [0], {
      style: { borders: { bottom: undefined } },
    });
    expect(result.paragraphs[0]?.style.borders).toEqual({ top });
  });

  it('merges nested objects of an untouched key without a rewrite', () => {
    const source = [para('p1', { borders: { top, bottom } })];
    const result = patchWriterParagraphStyle(source, [0], {
      style: { borders: { top: { ...top }, bottom: { ...bottom } } },
    });
    expect(result.changedCount).toBe(0);
    expect(result.paragraphs[0]).toBe(source[0]);
  });
});
