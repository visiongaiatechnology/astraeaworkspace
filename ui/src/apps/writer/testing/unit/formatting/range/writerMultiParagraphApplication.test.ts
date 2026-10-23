// STATUS: PLATIN — W-110 / W-117: a command that acts per paragraph reaches all of them
//
// The register recorded two commands that rewrote the active paragraph although a
// marked range covered several: toggling a character property (W-110) and
// applying a list template through the style inspector (W-117). Both now walk the
// coverage through one mechanism, and this file pins the two behaviours that
// mechanism has to produce: the same decision for the whole range, and each
// paragraph changed only inside the offsets the range holds there.
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  applyWriterParagraphOperation,
  patchWriterParagraphStyle,
} from '../../../../editing/paragraphs/writerParagraphFormatApply';
import { applyWriterSpanToggleAcrossParagraphs, resolveWriterSpanToggleValue } from '../../../../editing/text/writerSpanFormatToggle';
import { applyWriterListStyle, ensureWriterStyleCatalog } from '../../../../formatting/styles/writerStyles';

const STYLE = { alignment: 'left' as const, line_height: 1.5, space_before: 0, space_after: 0 };
const para = (id: string, spans: Paragraph['spans'], overrides: Partial<Paragraph['style']> = {}): Paragraph => ({
  id,
  style: { ...STYLE, ...overrides },
  spans,
});
/** The covered characters, in order: what a toggle actually sets. */
const formattedText = (paragraph: Paragraph, property: 'bold'): string =>
  paragraph.spans.filter((span) => span[property] === true).map((span) => span.text).join('');
const unformattedText = (paragraph: Paragraph, property: 'bold'): string =>
  paragraph.spans.filter((span) => span[property] !== true).map((span) => span.text).join('');

describe('A span toggle across a marked range (W-110)', () => {
  const doc = [
    para('p1', [{ text: 'Alpha' }, { text: ' Beta' }]),
    para('p2', [{ text: 'Gamma' }]),
    para('p3', [{ text: 'Delta' }]),
  ];
  const targets = [
    { paragraphId: 'p1', start: 2, end: 6 },
    { paragraphId: 'p2', start: 0, end: 5 },
  ];

  it('boldens every covered run when the range is not fully bold', () => {
    const result = applyWriterSpanToggleAcrossParagraphs(doc, targets, 'bold');
    expect(result.changedParagraphIds).toEqual(['p1', 'p2']);
    expect(formattedText(result.paragraphs[0]!, 'bold')).toBe('pha ');
    expect(formattedText(result.paragraphs[1]!, 'bold')).toBe('Gamma');
  });

  it('leaves the text outside the covered offsets alone', () => {
    const result = applyWriterSpanToggleAcrossParagraphs(doc, targets, 'bold');
    // The characters before and after the covered offsets keep their own format,
    // and the paragraph outside the range is untouched by reference.
    expect(unformattedText(result.paragraphs[0]!, 'bold')).toBe('AlBeta');
    expect(result.paragraphs[0]!.spans.map((span) => span.text).join('')).toBe('Alpha Beta');
    expect(result.paragraphs[2]).toBe(doc[2]);
  });

  it('clears the covered characters only when the whole range carries it', () => {
    const allBold = [
      para('p1', [{ text: 'Alpha', bold: true }, { text: ' Beta', bold: true }]),
      para('p2', [{ text: 'Gamma', bold: true }]),
    ];
    expect(resolveWriterSpanToggleValue(allBold, targets, 'bold')).toBe(false);
    const cleared = applyWriterSpanToggleAcrossParagraphs(allBold, targets, 'bold');
    // Only the covered characters lose the property; the rest of each paragraph
    // keeps its own formatting.
    expect(unformattedText(cleared.paragraphs[0]!, 'bold')).toBe('pha ');
    expect(unformattedText(cleared.paragraphs[1]!, 'bold')).toBe('Gamma');
    expect(formattedText(cleared.paragraphs[0]!, 'bold')).toBe('AlBeta');
  });

  it('completes a partly formatted range instead of stripping the bold part', () => {
    const halfBold = [
      para('p1', [{ text: 'Alpha', bold: true }, { text: ' Beta' }]),
      para('p2', [{ text: 'Gamma' }]),
    ];
    expect(resolveWriterSpanToggleValue(halfBold, targets, 'bold')).toBe(true);
    const applied = applyWriterSpanToggleAcrossParagraphs(halfBold, targets, 'bold');
    expect(formattedText(applied.paragraphs[0]!, 'bold')).toBe('Alpha ');
    expect(unformattedText(applied.paragraphs[0]!, 'bold')).toBe('Beta');
    expect(formattedText(applied.paragraphs[1]!, 'bold')).toBe('Gamma');
  });

  it('leaves a paragraph untouched when the value it would write is already there', () => {
    const source = [
      para('p1', [{ text: 'Alpha', bold: true }]),
      para('p2', [{ text: 'Gamma' }]),
    ];
    const result = applyWriterSpanToggleAcrossParagraphs(source, [
      { paragraphId: 'p1', start: 0, end: 5 },
      { paragraphId: 'p2', start: 0, end: 5 },
    ], 'bold');
    // The range is not fully bold, so the press applies bold — to p2 only. p1
    // already carries it and must therefore stay identical by reference, which is
    // what keeps a history step out of the command.
    expect(result.changedParagraphIds).toEqual(['p2']);
    expect(result.paragraphs[0]).toBe(source[0]);
    expect(formattedText(result.paragraphs[1]!, 'bold')).toBe('Gamma');
  });
});
describe('A per-paragraph operation across the covered paragraphs (W-117)', () => {
  const catalog = ensureWriterStyleCatalog();
  const doc = [
    para('p1', [{ text: 'One' }]),
    para('p2', [{ text: 'Two' }]),
    para('p3', [{ text: 'Three' }]),
  ];

  it('applies a list template to every covered paragraph and keeps each level', () => {
    const withLevels = doc.map((paragraph, index) => ({
      ...paragraph,
      style: { ...paragraph.style, list_level: index === 1 ? 2 : undefined },
    }));
    const result = applyWriterParagraphOperation(
      withLevels,
      [0, 1],
      (paragraph) => applyWriterListStyle(paragraph, 'number-standard', catalog),
    );
    expect(result.changedParagraphIds).toEqual(['p1', 'p2']);
    expect(result.paragraphs[0]?.style).toMatchObject({ list_style: 'number', list_style_id: 'number-standard' });
    expect(result.paragraphs[1]?.style.list_level).toBe(2);
    expect(result.paragraphs[2]).toBe(withLevels[2]);
  });

  it('reports the paragraphs it changed and leaves the others identical', () => {
    const already = doc.map((paragraph) => applyWriterListStyle(paragraph, 'number-standard', catalog));
    const result = applyWriterParagraphOperation(already, [0, 1, 2], (paragraph) => applyWriterListStyle(paragraph, 'number-standard', catalog));
    expect(result.changedParagraphIds).toEqual([]);
    expect(result.paragraphs).toEqual(already);
  });

  it('still applies a paragraph style patch to every target through the patch path', () => {
    const result = patchWriterParagraphStyle(doc, [0, 2], { style: { left_indent_mm: 12 } });
    expect(result.paragraphs.map((paragraph) => paragraph.style.left_indent_mm)).toEqual([12, undefined, 12]);
    expect(result.changedCount).toBe(2);
  });
});
