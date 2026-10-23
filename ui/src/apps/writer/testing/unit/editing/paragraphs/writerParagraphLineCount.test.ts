// STATUS: PLATIN — Writer paragraph line-count and row-click contracts
import { describe, expect, it } from 'vitest';
import {
  resolveWriterParagraphLineCount,
  WRITER_PARAGRAPH_BODY_COLUMN_CHARS,
  WRITER_PARAGRAPH_MAX_ESTIMATED_LINES,
} from '../../../../editing/paragraphs/writerParagraphLineCount';
import { resolveWriterRowClickOffset } from '../../../../editing/caret/writerCaretTargeting';

describe('Writer paragraph line count', () => {
  it('gives an empty paragraph exactly one line', () => {
    expect(resolveWriterParagraphLineCount({ text: '' })).toBe(1);
  });

  it('counts explicit line breaks', () => {
    expect(resolveWriterParagraphLineCount({ text: 'a\nb\nc' })).toBe(3);
  });

  it('adds wrapped lines for long text', () => {
    const column = WRITER_PARAGRAPH_BODY_COLUMN_CHARS;
    expect(resolveWriterParagraphLineCount({ text: 'x'.repeat(column * 3) })).toBe(4);
    expect(resolveWriterParagraphLineCount({ text: 'x'.repeat(column * 3 + 5) })).toBe(4);
  });

  it('wraps headings earlier than body text', () => {
    const text = 'x'.repeat(WRITER_PARAGRAPH_BODY_COLUMN_CHARS * 2);
    const body = resolveWriterParagraphLineCount({ text });
    const heading = resolveWriterParagraphLineCount({ text, headingLevel: 1 });
    expect(heading).toBeGreaterThan(body);
  });

  it('never returns fewer lines for more text', () => {
    let previous = 0;
    for (const length of [0, 10, 100, 500, 1000, 5000]) {
      const lines = resolveWriterParagraphLineCount({ text: 'x'.repeat(length) });
      expect(lines).toBeGreaterThanOrEqual(previous);
      previous = lines;
    }
  });

  it('caps very long paragraphs instead of growing without bound', () => {
    expect(resolveWriterParagraphLineCount({ text: 'x'.repeat(100_000) }))
      .toBe(WRITER_PARAGRAPH_MAX_ESTIMATED_LINES);
    expect(resolveWriterParagraphLineCount({ text: 'x'.repeat(100_000), maxLines: 5 })).toBe(5);
  });

  it('tolerates hostile configuration', () => {
    // A one-character column is an overestimate, never an underestimate: text is
    // never clipped.
    expect(resolveWriterParagraphLineCount({ text: 'abc', bodyColumnChars: 0 })).toBeGreaterThanOrEqual(3);
    // Non-finite values fall back to the default column instead of producing NaN.
    expect(resolveWriterParagraphLineCount({ text: 'abc', bodyColumnChars: Number.NaN })).toBe(1);
    expect(resolveWriterParagraphLineCount({ text: 'abc', headingColumnChars: Number.NaN, headingLevel: 1 })).toBe(1);
    expect(Number.isFinite(resolveWriterParagraphLineCount({ text: 'abc', maxLines: Number.NaN }))).toBe(true);
    expect(resolveWriterParagraphLineCount({ text: 'abc', maxLines: -5 })).toBe(1);
    expect(resolveWriterParagraphLineCount({ text: 'abc', maxLines: 2.9 })).toBe(1);
  });

  it('estimates a realistic paragraph as more than one line', () => {
    const sentence = 'Dies ist ein längerer Absatz, der über mehrere Zeilen läuft und deshalb mehr als eine Zeile belegen muss. ';
    expect(resolveWriterParagraphLineCount({ text: sentence.repeat(4) })).toBeGreaterThan(1);
  });
});

describe('Writer row-click caret offset', () => {
  const box = { boxTop: 100, boxHeight: 200, textLength: 400 };

  it('places the caret at the start above the box and at the end below it', () => {
    expect(resolveWriterRowClickOffset({ ...box, pointerY: 50 })).toBe(0);
    expect(resolveWriterRowClickOffset({ ...box, pointerY: 400 })).toBe(400);
  });

  it('projects the vertical position proportionally inside the box', () => {
    expect(resolveWriterRowClickOffset({ ...box, pointerY: 150 })).toBe(100);
    expect(resolveWriterRowClickOffset({ ...box, pointerY: 200 })).toBe(200);
    expect(resolveWriterRowClickOffset({ ...box, pointerY: 250 })).toBe(300);
  });

  it('clamps into the text range for degenerate boxes', () => {
    expect(resolveWriterRowClickOffset({ pointerY: 120, boxTop: 100, boxHeight: 0, textLength: 50 })).toBe(50);
    expect(resolveWriterRowClickOffset({ pointerY: 80, boxTop: 100, boxHeight: 0, textLength: 50 })).toBe(0);
    expect(resolveWriterRowClickOffset({ pointerY: 150, boxTop: 100, boxHeight: 100, textLength: 0 })).toBe(0);
  });

  it('fails safe on non-finite measurements', () => {
    expect(resolveWriterRowClickOffset({ ...box, pointerY: Number.NaN })).toBe(0);
    expect(resolveWriterRowClickOffset({ pointerY: 150, boxTop: Number.NaN, boxHeight: 100, textLength: 10 })).toBe(0);
    expect(resolveWriterRowClickOffset({ pointerY: 150, boxTop: 100, boxHeight: 100, textLength: Number.NaN })).toBe(0);
  });

  it('keeps the caret at zero for a click on an empty paragraph', () => {
    expect(resolveWriterRowClickOffset({ pointerY: 250, boxTop: 100, boxHeight: 200, textLength: 0 })).toBe(0);
  });
});
