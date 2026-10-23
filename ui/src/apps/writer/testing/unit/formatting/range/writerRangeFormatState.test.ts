// STATUS: PLATIN — W-111 / W-113 / W-116 / W-119: the marked range decides
//
// These tests are the reason the surface can no longer report the active
// paragraph's formatting for a range over three paragraphs, and the reason a
// disagreement is a first-class answer rather than a silent first value.
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterTabStop } from '../../../../../../shared/contracts/workspace';
import {
  resolveWriterAriaPressed,
  resolveWriterCoveredParagraphRanges,
  resolveWriterRangeFormatState,
  resolveWriterRangeToggleState,
  type WriterCoveredParagraphRange,
} from '../../../../formatting/range/writerRangeFormatState';

const STYLE = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 0 };
const para = (id: string, overrides: Partial<Paragraph['style']> = {}, spans: Paragraph['spans'] = [{ text: `Text ${id}` }]): Paragraph => ({
  id,
  style: { ...STYLE, ...overrides },
  spans,
});
const whole = (paragraph: Paragraph): WriterCoveredParagraphRange => ({
  paragraphId: paragraph.id,
  start: 0,
  end: paragraph.spans.reduce((total, span) => total + span.text.length, 0),
});

describe('Covered paragraphs of a marked range', () => {
  const doc = [para('p1'), para('p2'), para('p3')];

  it('covers a cross-paragraph drag from its start to its end', () => {
    const covered = resolveWriterCoveredParagraphRanges(doc, 0, null, {
      paragraphIndexes: [0, 1, 2],
      startParagraphIndex: 0,
      startOffset: 3,
      endParagraphIndex: 2,
      endOffset: 2,
      collapsed: false,
      spansParagraphs: true,
    });
    expect(covered).toEqual([
      { paragraphId: 'p1', start: 3, end: 7 },
      { paragraphId: 'p2', start: 0, end: 7 },
      { paragraphId: 'p3', start: 0, end: 2 },
    ]);
  });

  it('falls back to the marked text of the active paragraph', () => {
    expect(resolveWriterCoveredParagraphRanges(doc, 1, { paragraphId: 'p2', start: 1, end: 4 }, null))
      .toEqual([{ paragraphId: 'p2', start: 1, end: 4 }]);
  });

  it('covers the whole active paragraph without a marked text', () => {
    expect(resolveWriterCoveredParagraphRanges(doc, 2, null, null))
      .toEqual([{ paragraphId: 'p3', start: 0, end: 7 }]);
  });

  it('reports nothing for an empty document', () => {
    expect(resolveWriterCoveredParagraphRanges([], 0, null, null)).toEqual([]);
  });
});

describe('Character formatting of a range (W-111)', () => {
  const doc = [
    para('p1', {}, [{ text: 'Bold', bold: true }]),
    para('p2', {}, [{ text: 'Plain' }]),
  ];

  it('reports a range that is only partly bold as mixed', () => {
    const state = resolveWriterRangeFormatState(doc, doc.map(whole));
    expect(state.bold).toEqual({ value: false, mixed: true });
    expect(resolveWriterRangeToggleState(state.bold)).toBe('mixed');
    expect(resolveWriterAriaPressed('mixed')).toBe('mixed');
  });

  it('reports a wholly bold range as on', () => {
    const state = resolveWriterRangeFormatState([doc[0]!], [whole(doc[0]!)]);
    expect(resolveWriterRangeToggleState(state.bold)).toBe('on');
    expect(resolveWriterAriaPressed('on')).toBe(true);
  });

  it('reports a partly bold paragraph as mixed even inside one paragraph', () => {
    const mixed = para('p1', {}, [{ text: 'Bo', bold: true }, { text: 'ld' }]);
    expect(resolveWriterRangeFormatState([mixed], [whole(mixed)]).bold).toEqual({ value: false, mixed: true });
  });

  it('reads only the covered part of a paragraph', () => {
    const source = para('p1', {}, [{ text: 'Bo', bold: true }, { text: 'ld' }]);
    const plainTail = resolveWriterRangeFormatState([source], [{ paragraphId: 'p1', start: 2, end: 4 }]);
    expect(plainTail.bold).toEqual({ value: false, mixed: false });
    expect(resolveWriterRangeToggleState(plainTail.bold)).toBe('off');
  });
});

describe('Paragraph formatting of a range (W-116, W-119)', () => {
  it('reports differing alignments as mixed', () => {
    const doc = [para('p1', { alignment: 'left' }), para('p2', { alignment: 'center' })];
    const state = resolveWriterRangeFormatState(doc, doc.map(whole));
    expect(state.alignment).toEqual({ value: 'left', mixed: true });
  });

  it('reports one alignment for a range that agrees', () => {
    const doc = [para('p1', { alignment: 'justify' }), para('p2', { alignment: 'justify' })];
    expect(resolveWriterRangeFormatState(doc, doc.map(whole)).alignment).toEqual({ value: 'justify', mixed: false });
  });

  it('reports an unset indent against a set one as mixed', () => {
    const doc = [para('p1'), para('p2', { left_indent_mm: 12 })];
    const state = resolveWriterRangeFormatState(doc, doc.map(whole));
    expect(state.leftIndentMm).toEqual({ value: 0, mixed: true });
  });

  it('does not call an unset indent and an explicit zero a disagreement', () => {
    const doc = [para('p1'), para('p2', { left_indent_mm: 0 })];
    expect(resolveWriterRangeFormatState(doc, doc.map(whole)).leftIndentMm).toEqual({ value: 0, mixed: false });
  });

  it('compares tab stops structurally', () => {
    const stop = (id: string): WriterTabStop => ({ id, positionMm: 40, alignment: 'right', leader: 'dots' });
    const agreeing = [para('p1', { tab_stops: [stop('t1')] }), para('p2', { tab_stops: [stop('t1')] })];
    expect(resolveWriterRangeFormatState(agreeing, agreeing.map(whole)).tabStops.mixed).toBe(false);
    const differing = [para('p1', { tab_stops: [stop('t1')] }), para('p2', { tab_stops: [stop('t2')] })];
    expect(resolveWriterRangeFormatState(differing, differing.map(whole)).tabStops.mixed).toBe(true);
  });

  it('reports the list template of the range (W-117)', () => {
    const agreeing = [
      para('p1', { list_style: 'number', list_style_id: 'number-standard' }),
      para('p2', { list_style: 'number', list_style_id: 'number-standard' }),
    ];
    expect(resolveWriterRangeFormatState(agreeing, agreeing.map(whole)).listStyleId)
      .toEqual({ value: 'number-standard', mixed: false });
    const disagreeing = [agreeing[0]!, para('p2')];
    expect(resolveWriterRangeFormatState(disagreeing, disagreeing.map(whole)).listStyleId)
      .toEqual({ value: 'number-standard', mixed: true });
    const none = [para('p1'), para('p2')];
    expect(resolveWriterRangeFormatState(none, none.map(whole)).listStyleId)
      .toEqual({ value: '', mixed: false });
  });
});

describe('Font of a range (W-113)', () => {
  it('reports a mixed family and size', () => {
    const doc = [
      para('p1', {}, [{ text: 'Alpha', font_family: 'Inter, sans-serif', font_size_pt: 11 }]),
      para('p2', {}, [{ text: 'Beta', font_family: 'Calibri, sans-serif', font_size_pt: 14 }]),
    ];
    const state = resolveWriterRangeFormatState(doc, doc.map(whole));
    expect(state.fontFamily).toEqual({ value: 'Inter, sans-serif', mixed: true });
    expect(state.fontSizePt).toEqual({ value: 11, mixed: true });
  });

  it('keeps a uniform family uniform', () => {
    const doc = [
      para('p1', {}, [{ text: 'Alpha', font_family: 'Inter, sans-serif' }]),
      para('p2', {}, [{ text: 'Beta', font_family: 'Inter, sans-serif' }]),
    ];
    expect(resolveWriterRangeFormatState(doc, doc.map(whole)).fontFamily)
      .toEqual({ value: 'Inter, sans-serif', mixed: false });
  });

  it('falls back to the named style when no run carries a font', () => {
    const doc = [para('p1')];
    const state = resolveWriterRangeFormatState(doc, doc.map(whole), { fontFamily: 'Merriweather, serif', fontSizePt: 12 });
    expect(state.fontFamily).toEqual({ value: 'Merriweather, serif', mixed: false });
    expect(state.fontSizePt).toEqual({ value: 12, mixed: false });
  });

  it('reports nothing as mixed for an empty range', () => {
    const state = resolveWriterRangeFormatState([], []);
    expect(state.paragraphCount).toBe(0);
    expect(state.bold).toEqual({ value: undefined, mixed: false });
    expect(state.alignment).toEqual({ value: undefined, mixed: false });
  });
});
