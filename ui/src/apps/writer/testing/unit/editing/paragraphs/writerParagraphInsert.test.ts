// STATUS: PLATIN — Writer paragraph insertion contracts (Enter creates a focusable paragraph)
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import { ensureWriterStyleCatalog } from '../../../../formatting/styles/writerStyles';
import { planWriterParagraphInsert } from '../../../../editing/paragraphs/writerParagraphInsert';

const STYLE = { alignment: 'left' as const, line_height: 1.6, space_before: 0, space_after: 0 };
const styles = ensureWriterStyleCatalog(undefined, undefined).paragraphStyles;

function paragraph(id: string, text: string, extra: Partial<Paragraph['style']> = {}): Paragraph {
  return { id, style: { ...STYLE, ...extra }, spans: [{ text }] };
}

describe('Writer paragraph insertion', () => {
  it('creates the first paragraph at index 0 for an empty document', () => {
    const plan = planWriterParagraphInsert({
      paragraphs: [],
      afterIdx: -1,
      styles,
      newParagraphId: 'p-new',
    });
    expect(plan?.paragraphs).toHaveLength(1);
    expect(plan?.insertIndex).toBe(0);
    expect(plan?.insertedParagraphId).toBe('p-new');
    expect(plan?.paragraphs[0]?.spans).toEqual([{ text: '' }]);
    expect(plan?.paragraphs[0]?.style.style_name).toBe('normal');
  });

  it('hands the caret to the created paragraph at offset 0', () => {
    const plan = planWriterParagraphInsert({
      paragraphs: [paragraph('p1', 'Alpha')],
      afterIdx: 0,
      styles,
      newParagraphId: 'p-new',
    });
    expect(plan?.caret).toEqual({ paragraphId: 'p-new', offset: 0 });
  });

  it('inserts directly after the given paragraph and keeps the order', () => {
    const plan = planWriterParagraphInsert({
      paragraphs: [paragraph('p1', 'Alpha'), paragraph('p2', 'Beta')],
      afterIdx: 0,
      styles,
      newParagraphId: 'p-new',
    });
    expect(plan?.paragraphs.map((p) => p.id)).toEqual(['p1', 'p-new', 'p2']);
    expect(plan?.insertIndex).toBe(1);
  });

  it('continues in the style chain of the paragraph it follows', () => {
    const plan = planWriterParagraphInsert({
      paragraphs: [paragraph('p1', 'Alpha', { style_name: 'normal' })],
      afterIdx: 0,
      styles,
      newParagraphId: 'p-new',
    });
    expect(plan?.paragraphs[1]?.style.style_name).toBe('normal');
    const heading = planWriterParagraphInsert({
      paragraphs: [paragraph('h1', 'Titel', { style_name: 'heading1', heading_level: 1 })],
      afterIdx: 0,
      styles,
      newParagraphId: 'p-new',
    });
    // Enter at the end of a heading continues in the heading's follow-up style,
    // never silently in another heading.
    expect(heading?.paragraphs[1]?.style.style_name).not.toBe('heading1');
  });

  it('applies an explicit heading level', () => {
    const plan = planWriterParagraphInsert({
      paragraphs: [paragraph('p1', 'Alpha')],
      afterIdx: 0,
      styles,
      newParagraphId: 'p-new',
      headingLevel: 2,
    });
    expect(plan?.paragraphs[1]?.style.style_name).toBe('heading2');
    expect(plan?.paragraphs[1]?.style.heading_level).toBe(2);
  });

  it('honours an explicit style override over the heading level', () => {
    const plan = planWriterParagraphInsert({
      paragraphs: [paragraph('p1', 'Alpha')],
      afterIdx: 0,
      styles,
      newParagraphId: 'p-new',
      headingLevel: 1,
      styleOverride: 'quote',
    });
    expect(plan?.paragraphs[1]?.style.style_name).toBe('quote');
  });

  it('carries the page-break flag into the created paragraph', () => {
    const plan = planWriterParagraphInsert({
      paragraphs: [paragraph('p1', 'Alpha')],
      afterIdx: 0,
      styles,
      newParagraphId: 'p-new',
      pageBreakBefore: true,
    });
    expect(plan?.paragraphs[1]?.style.page_break_before).toBe(true);
  });

  it('resolves the style geometry from the catalog', () => {
    const plan = planWriterParagraphInsert({
      paragraphs: [paragraph('p1', 'Alpha')],
      afterIdx: 0,
      styles,
      newParagraphId: 'p-new',
    });
    const created = plan?.paragraphs[1];
    expect(created?.style.alignment).toBeTruthy();
    expect(typeof created?.style.line_height).toBe('number');
    expect(Number.isFinite(created?.style.space_before)).toBe(true);
    expect(Number.isFinite(created?.style.space_after)).toBe(true);
  });

  it('rejects an empty identifier and out-of-range positions', () => {
    const paragraphs = [paragraph('p1', 'Alpha')];
    expect(planWriterParagraphInsert({ paragraphs, afterIdx: 0, styles, newParagraphId: '' })).toBeNull();
    expect(planWriterParagraphInsert({ paragraphs, afterIdx: -2, styles, newParagraphId: 'x' })).toBeNull();
    expect(planWriterParagraphInsert({ paragraphs, afterIdx: 4, styles, newParagraphId: 'x' })).toBeNull();
    expect(planWriterParagraphInsert({ paragraphs, afterIdx: 0.5, styles, newParagraphId: 'x' })).toBeNull();
  });

  it('does not mutate the input paragraphs', () => {
    const paragraphs = [paragraph('p1', 'Alpha')];
    const snapshot = JSON.stringify(paragraphs);
    planWriterParagraphInsert({ paragraphs, afterIdx: 0, styles, newParagraphId: 'p-new' });
    expect(JSON.stringify(paragraphs)).toBe(snapshot);
  });
});
