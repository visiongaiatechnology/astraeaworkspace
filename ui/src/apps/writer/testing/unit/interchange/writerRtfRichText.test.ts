// STATUS: DIAMANT VGT SUPREME — RTF round trip keeps rich text
//
// Paket 37 acceptance: "Fremddatei öffnen, rich text ändern und wieder interoperabel
// exportieren."
//
// W-178: the old reader split on `\par`, deleted every `{…}` group **with its text**,
// dropped all control words and emitted one plain span per paragraph. Measured on foreign
// RTF: `{\b fett}` lost the word, `\'e4` stayed literal, and bold/italic/underline/size/
// alignment/headings were gone — so "export again interoperably" was impossible.
import { describe, expect, it } from 'vitest';
import { importRtf } from '../../../interchange/import/writerImporter';
import { parseRtfDocument } from '../../../interchange/import/rtfTokenizer';

/** Works for the tokenizer (`runs`) and for the imported paragraphs (`spans`). */
const textOf = (paragraphs: readonly { spans?: readonly { text: string }[]; runs?: readonly { text: string }[] }[]) =>
  paragraphs.map((p) => (p.runs ?? p.spans ?? []).map((part) => part.text).join(''));

const runsOf = (paragraphs: readonly { runs?: readonly { text: string }[] }[]) =>
  (paragraphs[0]?.runs ?? []).map((run) => run.text);

const rtf = (body: string) => `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\fnil Arial;}}\n${body}\n}`;

describe('RTF reading keeps rich text', () => {
  it('keeps the text inside a formatting group instead of deleting it', () => {
    // The old reader removed `{…}` wholesale: the word vanished.
    const parsed = parseRtfDocument(rtf('\\pard\\ql {\\b fett} normal\\par'));
    expect(parsed[0]?.runs.map((r) => [r.text, r.bold])).toEqual([['fett', true], [' normal', false]]);
  });

  it('reads bold, italic and underline as spans, not as one plain span', () => {
    const imported = importRtf(rtf('\\pard\\ql \\b fett\\b0  \\i kursiv\\i0  \\ul unterstrichen\\ul0\\par'));
    expect(imported.paragraphs[0]?.spans.map((s) => ({
      text: s.text, bold: s.bold ?? false, italic: s.italic ?? false, underline: s.underline ?? false,
    }))).toEqual([
      { text: 'fett', bold: true, italic: false, underline: false },
      { text: ' ', bold: false, italic: false, underline: false },
      { text: 'kursiv', bold: false, italic: true, underline: false },
      { text: ' ', bold: false, italic: false, underline: false },
      { text: 'unterstrichen', bold: false, italic: false, underline: true },
    ]);
  });

  it('treats one space after a control word as its delimiter, not as text', () => {
    // RTF rule: `\b fett` is bold "fett"; a second space would be content.
    const parsed = parseRtfDocument(rtf('\\pard\\ql \\b  zwei Leerzeichen\\par'));
    expect(runsOf(parsed)).toEqual([' zwei Leerzeichen']);
  });

  it('decodes the hex escapes Word uses for german text', () => {
    // \'e4 is "ä" under \ansicpg1252 — the old reader left `\'e4` in the document.
    const parsed = parseRtfDocument(rtf("\\pard\\ql Gr\\'fc\\'dfe aus M\\'fcnchen\\par"));
    expect(parsed[0]?.runs.map((r) => r.text).join('')).toBe('Grüße aus München');
  });

  it('decodes \\u escapes and swallows the fallback character', () => {
    const parsed = parseRtfDocument(rtf('\\pard\\ql Gr\\u252?\\u223?e\\par'));
    expect(parsed[0]?.runs.map((r) => r.text).join('')).toBe('Grüße');
  });

  it('reads the font size and keeps it on the run', () => {
    const parsed = parseRtfDocument(rtf('\\pard\\ql \\fs32 gross\\fs24  klein\\par'));
    expect(parsed[0]?.runs.map((r) => [r.text, r.font_size_pt])).toEqual([['gross', 16], [' klein', 12]]);
  });

  it('reads the alignment of the paragraph', () => {
    const parsed = parseRtfDocument(rtf('\\pard\\qc mittig\\par\\pard\\qr rechts\\par\\pard\\qj blocksatz\\par'));
    expect(parsed.map((p) => p.alignment)).toEqual(['center', 'right', 'justify']);
  });

  it('reads the outline level as a heading and does not leak it to the next paragraph', () => {
    const parsed = parseRtfDocument(rtf('\\pard\\ql\\outlinelevel1 Kapitel\\par\\pard\\ql Fliesstext\\par'));
    expect(parsed.map((p) => p.headingLevel)).toEqual([2, undefined]);
  });

  it('skips destinations that are not document text', () => {
    const source = '{\\rtf1\\ansi{\\fonttbl{\\f0\\fnil Arial;}}{\\colortbl;\\red0\\green0\\blue0;}'
      + '{\\*\\generator Astraea}{\\info{\\title Titel}}\\pard\\ql Sichtbar\\par}';
    expect(textOf(parseRtfDocument(source))).toEqual(['Sichtbar']);
  });

  it('keeps text of an unknown group instead of dropping it', () => {
    const parsed = parseRtfDocument(rtf('\\pard\\ql {\\unknownmarke behalten}\\par'));
    expect(textOf(parsed)).toEqual(['behalten']);
  });

  it('handles escaped braces and backslashes as text', () => {
    const parsed = parseRtfDocument(rtf('\\pard\\ql \\{Klammer\\} und \\\\ Schraegstrich\\par'));
    expect(parsed[0]?.runs.map((r) => r.text).join('')).toBe('{Klammer} und \\ Schraegstrich');
  });

  it('turns \\tab and \\line into a tab and a line break', () => {
    const parsed = parseRtfDocument(rtf('\\pard\\ql A\\tab B\\line C\\par'));
    expect(parsed[0]?.runs.map((r) => r.text).join('')).toBe('A\tB\nC');
  });

  it('survives a truncated file without throwing', () => {
    expect(() => parseRtfDocument('{\\rtf1\\ansi\\pard\\ql unvollstaendig')).not.toThrow();
    expect(textOf(parseRtfDocument('{\\rtf1\\ansi\\pard\\ql unvollstaendig'))).toEqual(['unvollstaendig']);
  });

  it('produces one empty paragraph for an empty document rather than nothing', () => {
    const imported = importRtf(rtf(''));
    expect(imported.paragraphs).toHaveLength(1);
    expect(imported.paragraphs[0]?.spans[0]?.text).toBe('');
  });

  it('keeps successive paragraphs apart', () => {
    const imported = importRtf(rtf('\\pard\\ql eins\\par\\pard\\ql zwei\\par\\pard\\ql drei\\par'));
    expect(textOf(imported.paragraphs)).toEqual(['eins', 'zwei', 'drei']);
  });
});
