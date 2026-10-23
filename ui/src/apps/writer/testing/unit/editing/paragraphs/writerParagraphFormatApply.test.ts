// STATUS: PLATIN — Writer paragraph-level formatting across a marked range
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  isWriterLineHeightCustom,
  isWriterTextAlignment,
  normalizeWriterLineHeight,
  patchWriterParagraphStyle,
  resolveWriterLineHeightOptions,
  resolveWriterListToggleValue,
  resolveWriterParagraphTargets,
  WRITER_LINE_HEIGHT_MAX,
  WRITER_LINE_HEIGHT_MIN,
} from '../../../../editing/paragraphs/writerParagraphFormatApply';

const STYLE = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 0 };
const para = (id: string, overrides: Partial<Paragraph['style']> = {}): Paragraph => ({
  id,
  style: { ...STYLE, ...overrides },
  spans: [{ text: `Text ${id}` }],
});

const doc = [para('p1'), para('p2'), para('p3')];
const alignments = (paragraphs: readonly Paragraph[]) => paragraphs.map((p) => p.style.alignment);

describe('Writer paragraph targets', () => {
  it('uses the active paragraph when nothing is marked', () => {
    expect(resolveWriterParagraphTargets(doc, 1, null)).toEqual([1]);
    expect(resolveWriterParagraphTargets(doc, 1, [])).toEqual([1]);
  });

  it('uses the active paragraph when the range covers only one paragraph', () => {
    expect(resolveWriterParagraphTargets(doc, 1, ['p2'])).toEqual([1]);
  });

  it('covers every marked paragraph in document order', () => {
    expect(resolveWriterParagraphTargets(doc, 2, ['p3', 'p1'])).toEqual([0, 2]);
    expect(resolveWriterParagraphTargets(doc, 0, ['p1', 'p2', 'p3'])).toEqual([0, 1, 2]);
  });

  it('falls back to the active paragraph when the marked ids are unknown', () => {
    expect(resolveWriterParagraphTargets(doc, 1, ['gone-1', 'gone-2'])).toEqual([1]);
  });

  it('returns nothing for an empty document', () => {
    expect(resolveWriterParagraphTargets([], -1, null)).toEqual([]);
    expect(resolveWriterParagraphTargets([], 0, ['p1', 'p2'])).toEqual([]);
  });
});

describe('Writer alignment validation', () => {
  it('accepts the five known alignments', () => {
    for (const value of ['left', 'center', 'right', 'justify', 'distributed']) {
      expect(isWriterTextAlignment(value)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const value of ['middle', '', undefined, null, 3, {}]) {
      expect(isWriterTextAlignment(value)).toBe(false);
    }
  });
});

describe('Writer line height normalization', () => {
  it('rounds to two decimals', () => {
    expect(normalizeWriterLineHeight(1.234)).toBe(1.23);
    expect(normalizeWriterLineHeight(1.5678)).toBe(1.57);
  });

  it('clamps into the allowed band', () => {
    expect(normalizeWriterLineHeight(0.1)).toBe(WRITER_LINE_HEIGHT_MIN);
    expect(normalizeWriterLineHeight(99)).toBe(WRITER_LINE_HEIGHT_MAX);
  });

  it('ignores unusable values', () => {
    expect(normalizeWriterLineHeight(Number.NaN)).toBeUndefined();
    expect(normalizeWriterLineHeight(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(normalizeWriterLineHeight(undefined)).toBeUndefined();
  });
});

describe('Writer paragraph style patching', () => {
  it('aligns every target and leaves the rest untouched', () => {
    const result = patchWriterParagraphStyle(doc, [0, 2], { alignment: 'center' });
    expect(alignments(result.paragraphs)).toEqual(['center', 'left', 'center']);
    expect(result.changedCount).toBe(2);
    expect(result.paragraphs[1]).toBe(doc[1]);
  });

  it('changes line spacing on every target', () => {
    const result = patchWriterParagraphStyle(doc, [0, 1, 2], { lineHeight: 2 });
    expect(result.paragraphs.map((p) => p.style.line_height)).toEqual([2, 2, 2]);
  });

  it('applies both attributes in one pass', () => {
    const result = patchWriterParagraphStyle(doc, [1], { alignment: 'justify', lineHeight: 1.15 });
    expect(result.paragraphs[1]?.style).toMatchObject({ alignment: 'justify', line_height: 1.15 });
  });

  it('counts no change when the paragraph already carries the value', () => {
    const result = patchWriterParagraphStyle(doc, [0, 1, 2], { alignment: 'left' });
    expect(result.changedCount).toBe(0);
    expect(result.paragraphs[0]).toBe(doc[0]);
  });

  it('ignores an unknown alignment instead of writing it', () => {
    const result = patchWriterParagraphStyle(doc, [0], { alignment: 'middle' as never });
    expect(result.changedCount).toBe(0);
    expect(alignments(result.paragraphs)).toEqual(['left', 'left', 'left']);
  });

  it('ignores an unusable line height', () => {
    const result = patchWriterParagraphStyle(doc, [0], { lineHeight: Number.NaN });
    expect(result.changedCount).toBe(0);
  });

  it('returns an empty result for no targets and for an empty patch', () => {
    expect(patchWriterParagraphStyle(doc, [], { alignment: 'center' }).changedCount).toBe(0);
    expect(patchWriterParagraphStyle(doc, [0], {}).changedCount).toBe(0);
  });

  it('keeps the other style attributes of a patched paragraph', () => {
    const source = [para('p1', { space_before: 12, space_after: 6, list_style: 'bullet' })];
    const result = patchWriterParagraphStyle(source, [0], { alignment: 'right' });
    expect(result.paragraphs[0]?.style).toMatchObject({
      alignment: 'right',
      space_before: 12,
      space_after: 6,
      list_style: 'bullet',
    });
  });

  it('does not mutate the input document', () => {
    const snapshot = JSON.stringify(doc);
    patchWriterParagraphStyle(doc, [0, 1, 2], { alignment: 'center', lineHeight: 3 });
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});

describe('Writer list toggling', () => {
  const list = [para('p1'), para('p2', { list_style: 'bullet', list_level: 1 }), para('p3', { list_style: 'bullet' })];

  it('applies the list when not every target carries it', () => {
    expect(resolveWriterListToggleValue(list, [0, 1, 2], 'bullet')).toBe('bullet');
    expect(resolveWriterListToggleValue(list, [0], 'number')).toBe('number');
  });

  it('removes the list when every target already carries exactly this style', () => {
    expect(resolveWriterListToggleValue(list, [1, 2], 'bullet')).toBeNull();
  });

  it('does not treat a different list kind as already applied', () => {
    expect(resolveWriterListToggleValue(list, [1, 2], 'checklist')).toBe('checklist');
  });

  it('applies to every marked paragraph', () => {
    const result = patchWriterParagraphStyle(list, [0, 1, 2], { list: 'number' });
    expect(result.paragraphs.map((p) => p.style.list_style)).toEqual(['number', 'number', 'number']);
    expect(result.changedCount).toBe(3);
  });

  it('starts a fresh list at the outermost level', () => {
    const result = patchWriterParagraphStyle(list, [0], { list: 'bullet' });
    expect(result.paragraphs[0]?.style.list_level).toBe(0);
  });

  it('keeps the indentation when switching the kind of list', () => {
    const result = patchWriterParagraphStyle(list, [1], { list: 'number' });
    expect(result.paragraphs[1]?.style).toMatchObject({ list_style: 'number', list_level: 1 });
  });

  it('drops numbering shape overrides when the list kind changes', () => {
    const source = [para('p1', {
      list_style: 'bullet',
      list_override_glyph: '→',
      list_number_format: 'roman_upper',
      list_start_value: 5,
      list_restart_numbering: true,
    })];
    const result = patchWriterParagraphStyle(source, [0], { list: 'number' });
    expect(result.paragraphs[0]?.style.list_style).toBe('number');
    expect(result.paragraphs[0]?.style.list_override_glyph).toBeUndefined();
    expect(result.paragraphs[0]?.style.list_number_format).toBeUndefined();
    expect(result.paragraphs[0]?.style.list_start_value).toBeUndefined();
    expect(result.paragraphs[0]?.style.list_restart_numbering).toBeUndefined();
  });

  it('removes every list field when the list is turned off', () => {
    const source = [para('p1', {
      list_style: 'number',
      list_level: 2,
      list_override_glyph: '→',
      list_number_format: 'roman_upper',
      list_start_value: 5,
      list_restart_numbering: true,
    })];
    const result = patchWriterParagraphStyle(source, [0], { list: null });
    const style = result.paragraphs[0]?.style ?? {};
    expect(style.list_style).toBeUndefined();
    expect(style.list_level).toBeUndefined();
    expect(style.list_override_glyph).toBeUndefined();
    expect(style.list_number_format).toBeUndefined();
    expect(style.list_start_value).toBeUndefined();
    expect(style.list_restart_numbering).toBeUndefined();
    expect(result.changedCount).toBe(1);
  });

  it('keeps the other style attributes when a list is applied', () => {
    const source = [para('p1', { space_before: 12, alignment: 'center' })];
    const result = patchWriterParagraphStyle(source, [0], { list: 'checklist' });
    expect(result.paragraphs[0]?.style).toMatchObject({ alignment: 'center', space_before: 12, list_style: 'checklist' });
  });

  it('counts no change when turning off a paragraph that is not a list', () => {
    const result = patchWriterParagraphStyle([para('p1')], [0], { list: null });
    expect(result.changedCount).toBe(0);
  });
});

describe('Writer paragraph style patch (indents, spacing, tabs)', () => {
  const doc3 = [para('p1'), para('p2'), para('p3')];

  it('applies indents to every marked paragraph', () => {
    const result = patchWriterParagraphStyle(doc3, [0, 2], {
      style: { left_indent_mm: 10, first_line_indent_mm: 5 },
    });
    expect(result.paragraphs[0]?.style).toMatchObject({ left_indent_mm: 10, first_line_indent_mm: 5 });
    expect(result.paragraphs[1]?.style.left_indent_mm).toBeUndefined();
    expect(result.paragraphs[2]?.style).toMatchObject({ left_indent_mm: 10, first_line_indent_mm: 5 });
    expect(result.changedCount).toBe(2);
  });

  it('applies spacing before and after', () => {
    const result = patchWriterParagraphStyle(doc3, [0, 1, 2], { style: { space_before: 12, space_after: 6 } });
    expect(result.paragraphs.map((p) => `${p.style.space_before}/${p.style.space_after}`))
      .toEqual(['12/6', '12/6', '12/6']);
  });

  it('applies tab stops structurally', () => {
    const stops = [{ id: 't1', positionMm: 40, alignment: 'right' as const, leader: 'dots' as const }];
    const result = patchWriterParagraphStyle(doc3, [1], { style: { tab_stops: stops } });
    expect(result.paragraphs[1]?.style.tab_stops).toEqual(stops);
    expect(result.changedCount).toBe(1);
  });

  it('counts no change when a structural value is merely a new object', () => {
    const borders = { top: { style: 'solid' as const, widthPt: 1, color: '#000000', spacingPt: 0 } };
    const tabs = [{ id: 't1', positionMm: 40, alignment: 'right' as const, leader: 'dots' as const }];
    const source = [para('p1', { tab_stops: tabs, borders })];
    const result = patchWriterParagraphStyle(source, [0], {
      style: {
        tab_stops: [{ id: 't1', positionMm: 40, alignment: 'right', leader: 'dots' }],
        borders,
      },
    });
    expect(result.changedCount).toBe(0);
    expect(result.paragraphs[0]).toBe(source[0]);
  });

  it('detects a changed array entry instead of ignoring the patch', () => {
    const source = [para('p1', { tab_stops: [{ id: 't1', positionMm: 40, alignment: 'right', leader: 'dots' }] })];
    const result = patchWriterParagraphStyle(source, [0], {
      style: { tab_stops: [{ id: 't1', positionMm: 55, alignment: 'right', leader: 'dots' }] },
    });
    expect(result.changedCount).toBe(1);
    expect(result.paragraphs[0]?.style.tab_stops?.[0]?.positionMm).toBe(55);
  });

  it('removes a field when the patch clears it', () => {
    const source = [para('p1', { left_indent_mm: 10 })];
    const result = patchWriterParagraphStyle(source, [0], { style: { left_indent_mm: undefined } });
    expect(result.paragraphs[0]?.style.left_indent_mm).toBeUndefined();
    expect(result.changedCount).toBe(1);
  });

  it('combines a toolbar field and a dialog field in one pass', () => {
    const result = patchWriterParagraphStyle(doc3, [0, 1], {
      alignment: 'justify',
      style: { space_before: 8 },
    });
    expect(result.paragraphs[0]?.style).toMatchObject({ alignment: 'justify', space_before: 8 });
    expect(result.paragraphs[2]?.style.alignment).toBe('left');
  });

  it('keeps paragraph flags such as keep-with-next and page-break-before', () => {
    const result = patchWriterParagraphStyle(doc3, [0, 1, 2], {
      style: { keep_with_next: true, page_break_before: true, widow_orphan_control: false },
    });
    expect(result.paragraphs[1]?.style).toMatchObject({
      keep_with_next: true,
      page_break_before: true,
      widow_orphan_control: false,
    });
  });

  it('does not mutate the input document', () => {
    const snapshot = JSON.stringify(doc3);
    patchWriterParagraphStyle(doc3, [0, 1, 2], { style: { left_indent_mm: 20, space_after: 4 } });
    expect(JSON.stringify(doc3)).toBe(snapshot);
  });
});

describe('Writer line spacing options', () => {
  const presets = [1, 1.15, 1.5, 2];

  it('keeps the presets when the current value is one of them', () => {
    expect(resolveWriterLineHeightOptions(presets, 1.5)).toEqual([1, 1.15, 1.5, 2]);
    expect(isWriterLineHeightCustom(presets, 1.5)).toBe(false);
  });

  it('adds a value the document actually carries', () => {
    expect(resolveWriterLineHeightOptions(presets, 1.6)).toEqual([1, 1.15, 1.5, 1.6, 2]);
    expect(isWriterLineHeightCustom(presets, 1.6)).toBe(true);
  });

  it('normalizes before comparing', () => {
    expect(resolveWriterLineHeightOptions(presets, 1.499)).toEqual([1, 1.15, 1.5, 2]);
    expect(resolveWriterLineHeightOptions(presets, 1.996)).toContain(2);
  });

  it('leaves the presets alone for an unusable value', () => {
    expect(resolveWriterLineHeightOptions(presets, undefined)).toEqual([1, 1.15, 1.5, 2]);
    expect(resolveWriterLineHeightOptions(presets, Number.NaN)).toEqual([1, 1.15, 1.5, 2]);
    expect(isWriterLineHeightCustom(presets, undefined)).toBe(false);
  });
});
