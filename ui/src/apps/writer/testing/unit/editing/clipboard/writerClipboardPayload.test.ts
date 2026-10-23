// STATUS: PLATIN — Writer clipboard payload contracts (plain text, HTML subset, insertion)
import { describe, expect, it } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import {
  insertWriterClipboardPayload,
  normalizeWriterClipboardText,
  parseWriterClipboardHtml,
  parseWriterClipboardPlainText,
  writerClipboardPayloadToText,
  WRITER_CLIPBOARD_LIMITS,
} from '../../../../editing/clipboard/writerClipboardPayload';

const STYLE = { alignment: 'left' as const, line_height: 1.6, space_before: 0, space_after: 0 };

function paragraph(id: string, text: string): Paragraph {
  return { id, style: { ...STYLE }, spans: [{ text }] };
}

const shape = (payload: ReturnType<typeof parseWriterClipboardPlainText>) =>
  payload.map((entry) => entry.spans.map((span) => span.text).join(''));

describe('Writer clipboard plain text', () => {
  it('turns every line break into a paragraph', () => {
    expect(shape(parseWriterClipboardPlainText('Erste\nZweite\nDritte'))).toEqual(['Erste', 'Zweite', 'Dritte']);
  });

  it('handles CRLF and lone CR', () => {
    expect(shape(parseWriterClipboardPlainText('A\r\nB\rC'))).toEqual(['A', 'B', 'C']);
  });

  it('drops empty lines instead of creating empty paragraphs', () => {
    expect(shape(parseWriterClipboardPlainText('A\n\n\nB'))).toEqual(['A', 'B']);
    expect(shape(parseWriterClipboardPlainText('\n\n'))).toEqual([]);
    expect(shape(parseWriterClipboardPlainText(''))).toEqual([]);
  });

  it('keeps special characters byte for byte', () => {
    const source = 'Ω ✓ 😀 日本語 e\u0301 \u00a0 Tab\there';
    expect(shape(parseWriterClipboardPlainText(source))).toEqual([source]);
  });

  it('strips control characters but keeps tab, newline and carriage return', () => {
    expect(normalizeWriterClipboardText('a\u0000b\u0007c\td\ne')).toBe('abc\td\ne');
  });

  it('bounds the payload', () => {
    expect(normalizeWriterClipboardText('x'.repeat(50), { maxCharacters: 10, maxParagraphs: 5 })).toHaveLength(10);
    const many = Array.from({ length: 50 }, (_, index) => `L${index}`).join('\n');
    expect(parseWriterClipboardPlainText(many, { maxCharacters: 1000, maxParagraphs: 5 })).toHaveLength(5);
  });
});

describe('Writer clipboard HTML subset', () => {
  it('reads block elements as paragraph breaks', () => {
    expect(shape(parseWriterClipboardHtml('<p>Erste</p><p>Zweite</p>'))).toEqual(['Erste', 'Zweite']);
    expect(shape(parseWriterClipboardHtml('<div>A</div><div>B</div>'))).toEqual(['A', 'B']);
  });

  it('treats br as a paragraph break', () => {
    expect(shape(parseWriterClipboardHtml('A<br>B<br/>C'))).toEqual(['A', 'B', 'C']);
  });

  it('maps the four supported character formats', () => {
    const [paragraph] = parseWriterClipboardHtml('<p><strong>fett</strong> <em>kursiv</em> <u>unter</u> <s>weg</s></p>');
    expect(paragraph?.spans).toEqual([
      { text: 'fett', bold: true },
      { text: ' ' },
      { text: 'kursiv', italic: true },
      { text: ' ' },
      { text: 'unter', underline: true },
      { text: ' ' },
      { text: 'weg', strikethrough: true },
    ]);
  });

  it('supports the legacy tag aliases and nesting', () => {
    const [paragraph] = parseWriterClipboardHtml('<p><b>fett<i>und kursiv</i></b></p>');
    expect(paragraph?.spans).toEqual([
      { text: 'fett', bold: true },
      { text: 'und kursiv', bold: true, italic: true },
    ]);
  });

  it('merges adjacent runs with identical formatting', () => {
    const [paragraph] = parseWriterClipboardHtml('<p><b>a</b><strong>b</strong>c</p>');
    expect(paragraph?.spans).toEqual([{ text: 'ab', bold: true }, { text: 'c' }]);
  });

  it('drops script, style and head content entirely', () => {
    const payload = parseWriterClipboardHtml('<style>p{color:red}</style><p>Sichtbar</p><script>alert(1)</script>');
    expect(shape(payload)).toEqual(['Sichtbar']);
  });

  it('decodes named, decimal and hexadecimal entities', () => {
    expect(shape(parseWriterClipboardHtml('<p>a &amp; b &lt;c&gt; &#8212; &#x2713; &nbsp;end</p>')))
      .toEqual(['a & b <c> \u2014 \u2713 \u00a0end']);
  });

  it('leaves unknown entities untouched instead of dropping text', () => {
    expect(shape(parseWriterClipboardHtml('<p>&unknown; &amp;</p>'))).toEqual(['&unknown; &']);
  });

  it('ignores unknown tags but keeps their text', () => {
    expect(shape(parseWriterClipboardHtml('<p><span class="x">Text</span><custom>mehr</custom></p>')))
      .toEqual(['Textmehr']);
  });

  it('does not trip over attribute values that contain a closing bracket', () => {
    expect(shape(parseWriterClipboardHtml('<p title="a>b">Text</p>'))).toEqual(['Text']);
  });

  it('falls back to plain text when the payload carries no markup', () => {
    expect(shape(parseWriterClipboardHtml('Zeile1\nZeile2'))).toEqual(['Zeile1', 'Zeile2']);
  });

  it('collapses runs of whitespace like a browser would', () => {
    expect(shape(parseWriterClipboardHtml('<p>a    b\n   c</p>'))).toEqual(['a b c']);
  });

  it('bounds a hostile payload', () => {
    const huge = `<p>${'x'.repeat(WRITER_CLIPBOARD_LIMITS.maxCharacters + 5_000)}</p>`;
    const payload = parseWriterClipboardHtml(huge);
    expect(writerClipboardPayloadToText(payload).length).toBeLessThanOrEqual(WRITER_CLIPBOARD_LIMITS.maxCharacters);
  });

  it('returns nothing for markup without any text', () => {
    expect(parseWriterClipboardHtml('<p></p><br><p> </p>')).toEqual([]);
  });
});

describe('Writer clipboard insertion', () => {
  const doc = [paragraph('p1', 'Alpha Beta'), paragraph('p2', 'Gamma')];

  it('splits the target paragraph and keeps head and tail', () => {
    const payload = parseWriterClipboardPlainText('Eins\nZwei');
    const result = insertWriterClipboardPayload(doc, 0, 6, payload, ['n1']);
    expect(result).not.toBeNull();
    expect(result?.paragraphs.map((p) => `${p.id}:${p.spans.map((s) => s.text).join('')}`))
      .toEqual(['p1:Alpha Eins', 'n1:ZweiBeta', 'p2:Gamma']);
    expect(result?.caret).toEqual({ paragraphId: 'n1', offset: 4 });
  });

  it('inserts at the very start and at the very end', () => {
    const payload = parseWriterClipboardPlainText('X');
    const atStart = insertWriterClipboardPayload(doc, 0, 0, payload, []);
    expect(atStart?.paragraphs[0]?.spans.map((s) => s.text).join('')).toBe('XAlpha Beta');
    expect(atStart?.caret).toEqual({ paragraphId: 'p1', offset: 1 });

    const atEnd = insertWriterClipboardPayload(doc, 0, 10, payload, []);
    expect(atEnd?.paragraphs[0]?.spans.map((s) => s.text).join('')).toBe('Alpha BetaX');
    expect(atEnd?.caret).toEqual({ paragraphId: 'p1', offset: 11 });
  });

  it('keeps the character formatting of the payload', () => {
    const payload = parseWriterClipboardHtml('<p><b>fett</b> normal</p>');
    const result = insertWriterClipboardPayload(doc, 0, 0, payload, []);
    expect(result?.paragraphs[0]?.spans).toEqual([
      { text: 'fett', bold: true },
      { text: ' normal' },
      { text: 'Alpha Beta' },
    ]);
  });

  it('clamps an out-of-range caret instead of losing text', () => {
    const payload = parseWriterClipboardPlainText('X');
    const result = insertWriterClipboardPayload(doc, 0, 9999, payload, []);
    expect(result?.paragraphs[0]?.spans.map((s) => s.text).join('')).toBe('Alpha BetaX');
  });

  it('refuses to insert when a generated id is missing', () => {
    const payload = parseWriterClipboardPlainText('Eins\nZwei\nDrei');
    expect(insertWriterClipboardPayload(doc, 0, 0, payload, ['only-one'])).toBeNull();
  });

  it('refuses an empty payload and an unknown paragraph', () => {
    expect(insertWriterClipboardPayload(doc, 0, 0, [], [])).toBeNull();
    expect(insertWriterClipboardPayload(doc, 9, 0, parseWriterClipboardPlainText('X'), [])).toBeNull();
  });

  it('does not mutate the input document', () => {
    const snapshot = JSON.stringify(doc);
    insertWriterClipboardPayload(doc, 0, 3, parseWriterClipboardPlainText('A\nB'), ['n1']);
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it('replaces a selected range when pasting over it', () => {
    const payload = parseWriterClipboardPlainText('X');
    const result = insertWriterClipboardPayload(doc, 0, 6, payload, [], 10);
    expect(result?.paragraphs[0]?.spans.map((s) => s.text).join('')).toBe('Alpha X');
    expect(result?.caret).toEqual({ paragraphId: 'p1', offset: 7 });
  });

  it('treats an inverted selection end as a collapsed caret', () => {
    const payload = parseWriterClipboardPlainText('X');
    const result = insertWriterClipboardPayload(doc, 0, 6, payload, [], 2);
    expect(result?.paragraphs[0]?.spans.map((s) => s.text).join('')).toBe('Alpha XBeta');
  });
});
