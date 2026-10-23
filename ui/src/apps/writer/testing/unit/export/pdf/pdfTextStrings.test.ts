// STATUS: DIAMANT VGT SUPREME — German text survives in every PDF writer (W-298, P1)
//
// W-198 fixed the Writer's PDF export. W-298 was the same mistake in **six** other places: each writer had
// its own `escapePdf` doing `normalize('NFKD').replace(/[^\x20-\x7E]/g, '?')`, so an umlaut in a document
// title, an outline entry, a form field name, an attachment name, a signer name or a slide title came out
// as `?` — silently.
//
// There are exactly two correct answers and the tests pin both:
//   • content text drawn with a base font → WinAnsi bytes with octal escapes (`\374` for ü),
//   • metadata and labels → a PDF text string, UTF-16BE with a byte-order mark, in hex form (`<FEFF…>`).
import { describe, expect, it } from 'vitest';
import {
  encodePdfWinAnsi,
  escapePdfLiteral,
  isPdfWinAnsiRepresentable,
  pdfByteStringLiteral,
  pdfUnicodeTextString,
  pdfUriByteStringLiteral,
  pdfWinAnsiLiteral,
} from '../../../../../../platform/interop/pdf/pdfTextStrings';
import { createPdfFromRenderPages } from '../../../../../../platform/rendering/pdfCreationService';
import { buildPresentPdfFromJpegs } from '../../../../../present/interchange/render/presentExport';
import { buildPdfLinkAnnotationBody } from '../../../../../pdf/editing/structuredPdfEditRendering';
import { appendStructuredPdfOutlines } from '../../../../../pdf/navigation/pdfStructuredNavigation';

const latin1 = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

describe('the shared module answers both questions', () => {
  it('encodes content text as WinAnsi bytes and escapes them in octal', () => {
    expect(pdfWinAnsiLiteral('Grüße')).toBe('Gr\\374\\337e');
    expect(pdfWinAnsiLiteral('Preis: 10 €')).toBe('Preis: 10 \\200');
    expect(pdfWinAnsiLiteral('„Angebot“')).toBe('\\204Angebot\\223');
  });

  it('keeps the ASCII rules of a PDF literal', () => {
    expect(pdfWinAnsiLiteral('a(b)c\\d')).toBe('a\\(b\\)c\\\\d');
    expect(escapePdfLiteral('()\\')).toBe('\\(\\)\\\\');
  });

  it('marks what WinAnsi cannot carry instead of dropping it silently', () => {
    expect(encodePdfWinAnsi('日本語')).toBeNull();
    expect(isPdfWinAnsiRepresentable('日本語')).toBe(false);
    expect(pdfWinAnsiLiteral('Grüße 日本')).toBe('Gr\\374\\337e ??');
  });

  it('writes metadata as a UTF-16BE text string, so nothing is lost at all', () => {
    // `Grüße` → 0047 0072 00FC 00DF 0065, with the byte-order mark in front.
    expect(pdfUnicodeTextString('Grüße')).toBe('<FEFF0047007200FC00DF0065>');
    // Even what WinAnsi cannot carry survives here: 日本 is 65E5 672C.
    expect(pdfUnicodeTextString('日本')).toBe('<FEFF65E5672C>');
    // And a character outside the basic plane is written as its surrogate pair.
    expect(pdfUnicodeTextString('🙂')).toBe('<FEFFD83DDE42>');
  });

  it('keeps byte-string slots ASCII and points at the Unicode neighbour', () => {
    expect(pdfByteStringLiteral('Angebot für 2026.pdf')).toBe('Angebot f?r 2026.pdf');
  });
});

describe('the shared PDF creation service writes German as text', () => {
  const page = {
    id: 'page-1',
    geometry: { width: 595, height: 842 },
    primitives: [
      { kind: 'text', text: 'Rechnung für Muster GmbH', x: 40, y: 60, font: '14px Inter', color: '#111111' },
    ],
  } as unknown as Parameters<typeof createPdfFromRenderPages>[0][number];

  it('declares the encoding and escapes the umlauts', () => {
    const pdf = latin1(createPdfFromRenderPages([page], 'Angebot für 2026'));
    expect(pdf).toContain('/Encoding /WinAnsiEncoding');
    expect(pdf).toContain('Rechnung f\\374r Muster GmbH');
    // The title is metadata, so it travels as a text string.
    expect(pdf).toContain(pdfUnicodeTextString('Angebot für 2026'));
    expect(pdf).not.toContain('Rechnung f?r');
  });
});

describe('PDF Studio outlines keep their titles', () => {
  it('writes a bookmark title as a text string', () => {
    // The bookmarks come from the page headers, and the writer mutates the `objects` array it is handed —
    // measured from the signature instead of guessed: my first attempt passed four arguments and produced
    // an empty result.
    const page = {
      id: 'p1',
      pageNumber: 1,
      width: 595,
      height: 842,
      images: [],
      sections: [{ id: 's1', type: 'header', content: 'Prüfbericht Größe', box: { x: 0, y: 0, width: 500, height: 40 } }],
    };
    const model = { pages: [page] } as unknown as Parameters<typeof appendStructuredPdfOutlines>[0];
    const objects: string[] = [];
    const add = (body: string): number => {
      objects.push(body);
      return objects.length;
    };
    appendStructuredPdfOutlines(
      model,
      [page] as unknown as Parameters<typeof appendStructuredPdfOutlines>[1],
      [4],
      add,
      objects,
    );
    const joined = objects.join('\n');
    expect(joined).toContain(pdfUnicodeTextString('Prüfbericht Größe'));
    expect(joined).not.toContain('Pr?fbericht');
  });
});

describe('Present writes its title as a text string', () => {
  it('keeps the umlauts in the document title', () => {
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';
    const pdf = latin1(buildPresentPdfFromJpegs('Präsentation für 2026', [jpeg]));
    expect(pdf).toContain(pdfUnicodeTextString('Präsentation für 2026'));
    expect(pdf).not.toContain('Pr?sentation');
  });
});

describe('a link target keeps its address — W-302', () => {
  it('percent-encodes instead of question-marking', () => {
    // A URI is a byte string in the PDF, but non-ASCII belongs in it as UTF-8 percent-encoding. Before this
    // helper the address became `gr??e` — a link to a **different page**, silently.
    expect(pdfUriByteStringLiteral('https://example.org/größe?x=1'))
      .toBe('https://example.org/gr%C3%B6%C3%9Fe?x=1');
    expect(pdfUriByteStringLiteral('vgt://workspace/document/abc objekt'))
      .toBe('vgt://workspace/document/abc%20objekt');
  });

  it('survives an independent oracle: the encoded URI parses back to the original', () => {
    const original = 'https://example.org/größe/bericht 2026?q=prüfung#abschnitt';
    const literal = pdfUriByteStringLiteral(original);
    const parsed = new URL(literal);
    expect(decodeURIComponent(parsed.pathname)).toBe('/größe/bericht 2026');
    expect(decodeURIComponent(parsed.search)).toBe('?q=prüfung');
    expect(parsed.hash).toBe('#abschnitt');
    expect(decodeURIComponent(literal)).toBe(original);
  });

  it('leaves the URI syntax alone', () => {
    expect(pdfUriByteStringLiteral('https://example.org/a/b?c=1&d=2#e')).toBe('https://example.org/a/b?c=1&d=2#e');
  });

  it('still escapes what a PDF literal treats specially', () => {
    // Parentheses are legal in a URI but illegal in a PDF literal, so they are escaped. `new URL` treats a
    // backslash as a path separator (WHATWG), which is the measured behaviour and no longer relevant here.
    expect(pdfUriByteStringLiteral('https://example.org/a(b)c')).toBe('https://example.org/a\\(b\\)c');
  });

  it('does not double-encode an already encoded URI', () => {
    // This is the case that caught my first version: `encodeURI` turned `%C3%B6` into `%25C3%25B6` and would
    // have broken every link that was already correct. `new URL` is idempotent — measured.
    expect(pdfUriByteStringLiteral('https://example.org/gr%C3%B6%C3%9Fe')).toBe('https://example.org/gr%C3%B6%C3%9Fe');
    expect(pdfUriByteStringLiteral('vgt://workspace/document/abc%20objekt')).toBe('vgt://workspace/document/abc%20objekt');
  });

  it('handles a relative URI that does not parse', () => {
    // No scheme, no host: `new URL` refuses it, so the characters are encoded one by one.
    expect(pdfUriByteStringLiteral('/pfad/mit umlaut/ö')).toBe('/pfad/mit%20umlaut/%C3%B6');
  });
});

describe('a link target stays a byte string', () => {
  it('escapes without pretending to carry unicode', () => {
    const body = buildPdfLinkAnnotationBody(
      { id: 'l1', target: { kind: 'url', url: 'https://example.org/größe?x=1' }, bounds: { x: 10, y: 10, width: 40, height: 12 } } as unknown as Parameters<typeof buildPdfLinkAnnotationBody>[0],
      3,
    );
    // This assertion used to read `/URI (https://example.org/gr??e?x=1)` and thereby pinned the defect: the
    // document shipped a link to a different address. W-302 fixed it, so the expectation flips — and the
    // independent oracle is that the URI parses back to what the author wrote.
    const uri = /\/URI \((.*?)\) >>/u.exec(body)?.[1] ?? '';
    expect(uri).toBe('https://example.org/gr%C3%B6%C3%9Fe?x=1');
    expect(decodeURIComponent(uri)).toBe('https://example.org/größe?x=1');
  });
});
