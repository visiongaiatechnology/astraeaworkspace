// STATUS: PLATIN — Writer font range contracts (family, size, mixed detection)
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  applyWriterFontToRange,
  normalizeWriterFontFamily,
  normalizeWriterFontSizePt,
  resolveWriterFontAtRange,
  resolveWriterFontFamilyOptions,
  spansCoveredByRange,
  WRITER_FONT_FAMILY_MAX_LENGTH,
  WRITER_FONT_SIZE_MAX_PT,
  WRITER_FONT_SIZE_MIN_PT,
} from '../../../../editing/text/writerFontRange';

const STYLE = { alignment: 'left' as const, line_height: 1.6, space_before: 0, space_after: 0 };
const paragraph = (spans: Paragraph['spans']): Paragraph => ({ id: 'p1', style: { ...STYLE }, spans });
const text = (p: Paragraph) => p.spans.map((s) => s.text).join('');
const shape = (p: Paragraph) => p.spans.map((s) => `${s.text}|${s.font_family ?? '-'}|${s.font_size_pt ?? '-'}`);

describe('Writer font size normalization', () => {
  it('rounds to half points', () => {
    expect(normalizeWriterFontSizePt(11.24)).toBe(11);
    expect(normalizeWriterFontSizePt(11.26)).toBe(11.5);
  });

  it('clamps into the allowed band', () => {
    expect(normalizeWriterFontSizePt(0.2)).toBe(WRITER_FONT_SIZE_MIN_PT);
    expect(normalizeWriterFontSizePt(9999)).toBe(WRITER_FONT_SIZE_MAX_PT);
  });

  it('ignores unusable values instead of writing NaN', () => {
    expect(normalizeWriterFontSizePt(Number.NaN)).toBeUndefined();
    expect(normalizeWriterFontSizePt(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(normalizeWriterFontSizePt(undefined)).toBeUndefined();
  });
});

describe('Writer font resolution', () => {
  const mixed = [
    { text: 'Alpha', font_family: 'Inter', font_size_pt: 11 },
    { text: ' Beta', font_family: 'Astraea Serif', font_size_pt: 18 },
  ];

  it('reports a uniform range as-is', () => {
    const spans = [{ text: 'Alpha Beta', font_family: 'Inter', font_size_pt: 11 }];
    expect(resolveWriterFontAtRange(spans, undefined, { start: 0, end: 5 }))
      .toEqual({ fontFamily: 'Inter', fontSizePt: 11, familyMixed: false, sizeMixed: false });
  });

  it('flags a range that mixes fonts', () => {
    expect(resolveWriterFontAtRange(mixed, undefined, { start: 0, end: 10 }))
      .toEqual({ fontFamily: 'Inter', fontSizePt: 11, familyMixed: true, sizeMixed: true });
  });

  it('treats a range as mixed when only part of it carries an explicit font', () => {
    const spans = [{ text: 'Alpha', font_size_pt: 11 }, { text: ' Beta' }];
    const resolved = resolveWriterFontAtRange(spans, { fontSizePt: 12 }, { start: 0, end: 10 });
    expect(resolved.sizeMixed).toBe(true);
    expect(resolved.fontSizePt).toBe(11);
  });

  it('falls back to the style when nothing is explicit', () => {
    const spans = [{ text: 'Alpha Beta' }];
    expect(resolveWriterFontAtRange(spans, { fontFamily: 'Astraea Sans', fontSizePt: 13 }, { start: 0, end: 5 }))
      .toEqual({ fontFamily: 'Astraea Sans', fontSizePt: 13, familyMixed: false, sizeMixed: false });
  });

  it('resolves the caret to the span it sits in', () => {
    expect(resolveWriterFontAtRange(mixed, undefined, { start: 2, end: 2 })?.fontFamily).toBe('Inter');
    expect(resolveWriterFontAtRange(mixed, undefined, { start: 8, end: 8 })?.fontFamily).toBe('Astraea Serif');
  });

  it('uses the whole paragraph when no range is given', () => {
    const spans = [{ text: 'Alpha Beta', font_family: 'Inter', font_size_pt: 11 }];
    expect(resolveWriterFontAtRange(spans, undefined, null).fontFamily).toBe('Inter');
  });

  it('covers the whole paragraph only through the helper that says so', () => {
    const spans = [{ text: 'Alpha' }, { text: ' Beta' }];
    expect(spansCoveredByRange(spans, { start: 0, end: 10 })).toHaveLength(2);
    expect(spansCoveredByRange(spans, { start: 1, end: 3 })).toHaveLength(1);
  });
});

describe('Writer font application', () => {
  it('applies a family and size to the marked range only', () => {
    const source = paragraph([{ text: 'Alpha' }, { text: ' Beta' }, { text: ' Gamma' }]);
    const updated = applyWriterFontToRange(source, { fontFamily: 'Astraea Serif', fontSizePt: 18 }, { start: 5, end: 10 });
    expect(shape(updated)).toEqual(['Alpha|-|-', ' Beta|Astraea Serif|18', ' Gamma|-|-']);
    expect(text(updated)).toBe('Alpha Beta Gamma');
  });

  it('keeps the other properties of the covered spans', () => {
    const source = paragraph([{ text: 'Alpha', bold: true, text_color: '#ff0000', font_size_pt: 11 }]);
    const updated = applyWriterFontToRange(source, { fontSizePt: 20 }, { start: 0, end: 5 });
    expect(updated.spans[0]).toEqual({ text: 'Alpha', bold: true, text_color: '#ff0000', font_size_pt: 20 });
  });

  it('patches the whole paragraph when no range is marked', () => {
    const source = paragraph([{ text: 'Alpha', font_size_pt: 11 }, { text: ' Beta', font_size_pt: 12 }]);
    const updated = applyWriterFontToRange(source, { fontFamily: 'Astraea Sans' }, null);
    expect(shape(updated)).toEqual(['Alpha|Astraea Sans|11', ' Beta|Astraea Sans|12']);
  });

  it('prepares an empty paragraph for the next typed character', () => {
    const updated = applyWriterFontToRange(paragraph([{ text: '' }]), { fontFamily: 'Astraea Serif', fontSizePt: 14 }, { start: 0, end: 0 });
    expect(updated.spans).toEqual([{ text: '', font_family: 'Astraea Serif', font_size_pt: 14 }]);
  });

  it('normalizes the requested size', () => {
    const updated = applyWriterFontToRange(paragraph([{ text: 'Alpha' }]), { fontSizePt: 11.26 }, { start: 0, end: 5 });
    expect(updated.spans[0]?.font_size_pt).toBe(11.5);
  });

  it('returns the paragraph unchanged for an empty patch', () => {
    const source = paragraph([{ text: 'Alpha' }]);
    expect(applyWriterFontToRange(source, {}, { start: 0, end: 5 })).toBe(source);
  });

  it('does not mutate the input paragraph', () => {
    const source = paragraph([{ text: 'Alpha', bold: true }]);
    const snapshot = JSON.stringify(source);
    applyWriterFontToRange(source, { fontFamily: 'X' }, { start: 0, end: 5 });
    expect(JSON.stringify(source)).toBe(snapshot);
  });
});

describe('Writer font family validation (W-114)', () => {
  const known = ['Inter, sans-serif', 'Calibri, sans-serif'];

  it('refuses a family that cannot be a name', () => {
    expect(normalizeWriterFontFamily('')).toBeUndefined();
    expect(normalizeWriterFontFamily('   ')).toBeUndefined();
    expect(normalizeWriterFontFamily('Inter\u0000Bold')).toBeUndefined();
    expect(normalizeWriterFontFamily('a'.repeat(WRITER_FONT_FAMILY_MAX_LENGTH + 1))).toBeUndefined();
  });

  it('trims a usable family instead of storing the padding', () => {
    expect(normalizeWriterFontFamily('  Garamond, serif ')).toBe('Garamond, serif');
  });

  it('does not write a refused family into the document', () => {
    const source = paragraph([{ text: 'Alpha', font_family: 'Calibri, sans-serif' }]);
    const updated = applyWriterFontToRange(source, { fontFamily: '\u0000' }, { start: 0, end: 5 });
    expect(updated).toBe(source);
    expect(updated.spans[0]?.font_family).toBe('Calibri, sans-serif');
  });

  it('keeps a family the document brought from outside the known list', () => {
    const updated = applyWriterFontToRange(paragraph([{ text: 'Alpha' }]), { fontFamily: 'Garamond, serif' }, { start: 0, end: 5 });
    expect(updated.spans[0]?.font_family).toBe('Garamond, serif');
  });

  it('offers the document family as an option instead of showing the first entry', () => {
    expect(resolveWriterFontFamilyOptions(known, 'Garamond, serif'))
      .toEqual(['Garamond, serif', 'Inter, sans-serif', 'Calibri, sans-serif']);
    expect(resolveWriterFontFamilyOptions(known, 'Inter, sans-serif')).toEqual(known);
    expect(resolveWriterFontFamilyOptions(known, undefined)).toEqual(known);
    expect(resolveWriterFontFamilyOptions(known, '\u0000')).toEqual(known);
  });

  it('reports an unusable stored family as unknown rather than as itself', () => {
    const spans = [{ text: 'Alpha', font_family: 'Inter\u0007' }];
    expect(resolveWriterFontAtRange(spans, undefined, null).fontFamily).toBeUndefined();
  });
});
