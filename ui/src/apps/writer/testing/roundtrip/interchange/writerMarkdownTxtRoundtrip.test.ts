// STATUS: DIAMANT VGT SUPREME — Markdown and TXT round trip
//
// Paket 38 acceptance: "Markdown-Struktur importieren, normalen Text bearbeiten und sauber
// exportieren."
//
// W-187/W-188, measured before the fix: the writer escaped **every** `.` and `-` anywhere and
// the reader never undid it, so a round trip grew the document:
//   Original  "Siehe z.B. Abb. 1.2 - die E-Mail …"
//   Export 1  "Siehe z\.B\. Abb\. 1\.2 \- die E\-Mail …"
//   Import 1  "Siehe z\.B\. Abb\. 1\.2 \- die E\-Mail …"   ← backslashes stay in the text
//   Export 2  "Siehe z\\.B\\. …"                          ← escaped again
//   Import 2  "Siehe z\\.B\\. …"                          ← grows for ever
// and `*Stern*` came back as `\Stern\`: the escape survived while the inline parser ate the
// asterisks.
import { describe, expect, it } from 'vitest';
import type { Paragraph, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { importDocument, importMarkdown, importPlainText } from '../../../interchange/import/writerImporter';
import {
  escapeMarkdownText,
  parseMarkdownInline,
} from '../../../interchange/import/markdownInline';
import {
  exportWriterPortableDocument,
  importWriterPortableBytes,
  type WriterPortableFormat,
} from '../../../interchange/portable/writerPortableInterop';

const paragraph = (text: string, style: Partial<Paragraph['style']> = {}, spans?: Paragraph['spans']): Paragraph => ({
  id: `p-${text.slice(0, 8)}`,
  style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4, ...style },
  spans: spans ?? [{ text }],
});

const doc = (paragraphs: Paragraph[]): WorkspaceDocument => ({
  schema_version: 1, id: 'md-test', title: 'Test', kind: 'Writer', created_at: 1, modified_at: 1,
  version: 1, theme_id: 'default', root_object_ids: ['t'],
  objects: { t: { type: 'TextBlock', data: { id: 't', paragraphs } } },
  writerData: {
    pageSetup: {
      paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
      showPageNumbers: true, headerText: '', footerText: '',
    },
    tables: [],
  },
});

async function trip(paragraphs: Paragraph[], format: WriterPortableFormat): Promise<Paragraph[]> {
  const exported = exportWriterPortableDocument(doc(paragraphs), format);
  const imported = await importWriterPortableBytes(exported.bytes, exported.fileName);
  const block = Object.values(imported.objects).find((object) => object.type === 'TextBlock');
  if (block?.type !== 'TextBlock') throw new Error('round trip lost the text block');
  return block.data.paragraphs;
}

const textOf = (list: readonly Paragraph[]) => list.map((p) => p.spans.map((s) => s.text).join(''));
const markdownOf = (paragraphs: Paragraph[]) =>
  new TextDecoder().decode(exportWriterPortableDocument(doc(paragraphs), 'markdown').bytes);

describe('Markdown export is clean', () => {
  it('leaves dots and hyphens inside a line alone', () => {
    expect(escapeMarkdownText('Siehe z.B. Abb. 1.2 - die E-Mail (2-3 Tage).', false))
      .toBe('Siehe z.B. Abb. 1.2 - die E-Mail (2-3 Tage).');
  });

  it('escapes a marker that would start a block', () => {
    expect(escapeMarkdownText('# keine Ueberschrift', true)).toBe('\\# keine Ueberschrift');
    expect(escapeMarkdownText('- keine Liste', true)).toBe('\\- keine Liste');
    expect(escapeMarkdownText('> kein Zitat', true)).toBe('\\> kein Zitat');
    expect(escapeMarkdownText('1. keine Nummer', true)).toBe('1\\. keine Nummer');
  });

  it('escapes inline special characters wherever they appear', () => {
    expect(escapeMarkdownText('a * b _ c ` d [ e ] f', false)).toBe('a \\* b \\_ c \\` d \\[ e \\] f');
  });

  it('keeps a mid-line hash as it is', () => {
    expect(escapeMarkdownText('Thema #Raute', false)).toBe('Thema #Raute');
  });

  it('writes a clean document, not a field of backslashes', () => {
    const markdown = markdownOf([paragraph('Siehe z.B. Abb. 1.2 - die E-Mail von A. Müller.')]);
    expect(markdown).toBe('Siehe z.B. Abb. 1.2 - die E-Mail von A. Müller.');
  });

  it('writes the structure markers it can read back', () => {
    const markdown = markdownOf([
      paragraph('Titel', { style_name: 'heading1', heading_level: 1 }),
      paragraph('Zitat', { style_name: 'quote' }),
      paragraph('Punkt', { list_style: 'bullet' }),
      paragraph('Schritt', { list_style: 'number' }),
      paragraph('Text'),
    ]);
    expect(markdown).toBe('# Titel\n\n> Zitat\n\n- Punkt\n\n1. Schritt\n\nText');
  });
});

describe('Markdown reading keeps structure and format', () => {
  it('reads the four block kinds', () => {
    const imported = importMarkdown('# Eins\n\n## Zwei\n\n### Drei\n\n> Zitat\n\n- Punkt\n\n1. Schritt\n\nText');
    expect(imported.paragraphs.map((p) => [p.style.heading_level, p.style.list_style, p.style.style_name]))
      .toEqual([
        [1, undefined, 'heading1'], [2, undefined, 'heading2'], [3, undefined, 'heading3'],
        [undefined, undefined, 'quote'], [undefined, 'bullet', 'normal'],
        [undefined, 'number', 'normal'], [undefined, undefined, 'normal'],
      ]);
  });

  it('reads inline emphasis inside a heading and a list item, not only in plain text', () => {
    const imported = importMarkdown('## Ein **wichtiger** Punkt\n\n- mit *Kursiv* darin');
    expect(imported.paragraphs[0]?.spans.map((s) => [s.text, s.bold ?? false]))
      .toEqual([['Ein ', false], ['wichtiger', true], [' Punkt', false]]);
    expect(imported.paragraphs[1]?.spans.map((s) => [s.text, s.italic ?? false]))
      .toEqual([['mit ', false], ['Kursiv', true], [' darin', false]]);
  });

  it('takes the document title from the first heading without its markers', () => {
    expect(importMarkdown('# Mein **Titel**\n\nText').title).toBe('Mein Titel');
  });

  it('reads the inline kinds', () => {
    // Adjacent text with the same formatting stays one run — `i `, the code `j` and ` k`
    // merge, which is what keeps the span list short.
    expect(parseMarkdownInline('a **b** c *d* e _f_ g ~~h~~ i `j` k')).toEqual([
      { text: 'a ' }, { text: 'b', bold: true }, { text: ' c ' }, { text: 'd', italic: true },
      { text: ' e ' }, { text: 'f', italic: true }, { text: ' g ' },
      { text: 'h', strikethrough: true }, { text: ' i j k' },
    ]);
  });

  it('reads combined and nested emphasis', () => {
    expect(parseMarkdownInline('**fett *auch kursiv***')).toEqual([
      { text: 'fett ', bold: true }, { text: 'auch kursiv', bold: true, italic: true },
    ]);
    expect(parseMarkdownInline('***fett und kursiv***')).toEqual([
      { text: 'fett und kursiv', bold: true, italic: true },
    ]);
  });

  it('undoes a backslash escape', () => {
    expect(parseMarkdownInline('\\*kein Kursiv\\* und \\. und \\\\')).toEqual([
      { text: '*kein Kursiv* und . und \\' },
    ]);
  });

  it('keeps an unmatched marker as literal text instead of eating it', () => {
    // The old parser consumed the asterisks of `\*Stern\*` and left the backslashes.
    expect(parseMarkdownInline('\\*Stern\\*').map((r) => r.text).join('')).toBe('*Stern*');
    expect(parseMarkdownInline('2 * 3 = 6').map((r) => r.text).join('')).toBe('2 * 3 = 6');
  });

  it('keeps a title from a document without a heading', () => {
    expect(importMarkdown('nur Text').title).toBe('Imported Markdown Document');
  });

  it('offers one empty paragraph for empty input rather than nothing', () => {
    const imported = importMarkdown('');
    expect(imported.paragraphs).toHaveLength(1);
    expect(imported.paragraphs[0]?.spans[0]?.text).toBe('');
  });

  it('detects the format from the file name and from the content', () => {
    expect(importDocument('# T', 'notiz.md').formatDetected).toBe('markdown');
    expect(importDocument('Text', 'notiz.txt').formatDetected).toBe('txt');
  });
});

describe('Markdown round trip is a fixed point', () => {
  const tricky: Paragraph[] = [
    paragraph('Siehe z.B. Abb. 1.2 - die E-Mail von A. Müller (2-3 Tage).'),
    paragraph('Pfad C:\\Users\\test und *Stern* sowie #Raute'),
    paragraph('# keine Ueberschrift', {}, [{ text: '# keine Ueberschrift' }]),
    paragraph('Titel', { style_name: 'heading2', heading_level: 2 }),
    paragraph('Ein ', { style_name: 'normal' }, [{ text: 'Ein ' }, { text: 'fetter', bold: true }, { text: ' Teil' }]),
  ];

  it('gives back exactly what it was given', async () => {
    const back = await trip(tricky, 'markdown');
    expect(textOf(back)).toEqual(textOf(tricky));
  });

  it('does not grow on a second trip', async () => {
    const first = await trip(tricky, 'markdown');
    const second = await trip(first, 'markdown');
    expect(textOf(second)).toEqual(textOf(first));
    expect(markdownOf(second)).toBe(markdownOf(first));
  });

  it('keeps bold and the heading level across the trip', async () => {
    const back = await trip(tricky, 'markdown');
    expect(back[3]?.style.heading_level).toBe(2);
    expect(back[4]?.spans.find((s) => s.text === 'fetter')?.bold).toBe(true);
  });

  it('keeps a literal asterisk and a literal backslash', async () => {
    const back = await trip([paragraph('*Stern* und C:\\Pfad')], 'markdown');
    expect(textOf(back)).toEqual(['*Stern* und C:\\Pfad']);
  });
});

describe('TXT round trip', () => {
  it('writes paragraphs separated by a blank line', () => {
    const exported = exportWriterPortableDocument(doc([paragraph('eins'), paragraph('zwei')]), 'txt');
    expect(new TextDecoder().decode(exported.bytes)).toBe('eins\n\nzwei');
  });

  it('does not escape anything, because plain text has no markup', () => {
    const exported = exportWriterPortableDocument(doc([paragraph('*kein* \\Markup #hier')]), 'txt');
    expect(new TextDecoder().decode(exported.bytes)).toBe('*kein* \\Markup #hier');
  });

  it('gives back the paragraphs it was given', async () => {
    const back = await trip([paragraph('eins'), paragraph('zwei'), paragraph('drei')], 'txt');
    expect(textOf(back)).toEqual(['eins', 'zwei', 'drei']);
  });

  it('drops formatting, because plain text cannot carry it', async () => {
    const back = await trip([paragraph('fett', {}, [{ text: 'fett', bold: true }])], 'txt');
    expect(back[0]?.spans[0]?.bold).toBeUndefined();
    expect(textOf(back)).toEqual(['fett']);
  });

  it('reads a file without a blank line as one paragraph', () => {
    expect(importPlainText('eine Zeile\nnoch eine').paragraphs).toHaveLength(1);
  });

  it('reads several blank lines as one separator', () => {
    expect(textOf(importPlainText('eins\n\n\n\nzwei').paragraphs)).toEqual(['eins', 'zwei']);
  });

  it('does not grow on a second trip', async () => {
    const first = await trip([paragraph('Zeile mit . und - Zeichen')], 'txt');
    const second = await trip(first, 'txt');
    expect(textOf(second)).toEqual(textOf(first));
  });
});
