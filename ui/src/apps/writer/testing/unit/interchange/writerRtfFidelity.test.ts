// STATUS: DIAMANT — W-182 / W-183: a colour and a heading style survive the trip through RTF
//
// Both findings are the same shape: the exporter wrote less than the format allows, so information the
// reader could have used never reached the file.
//
//   W-182  the exporter wrote **no** colour table and no `\cf`, and the reader read no colour either — so
//          a colour could not survive RTF at all. The register said "colours are read"; measured, the RTF
//          reader had no colour code path whatsoever. Both halves are fixed and both are measured here.
//   W-183  the exporter wrote `\outlinelevel` (which this reader understands) but no `\s` style reference
//          and no `\stylesheet`, so a foreign program showed a heading in its default formatting.
import { describe, expect, it } from 'vitest';

import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { parseRtfColorTable, parseRtfDocument } from '../../../../writer/interchange/import/rtfTokenizer';
import { exportRtfDocument as exportRtfFor } from '../../../../writer/interchange/portable/writerPortableInterop';

function paragraph(text: string, overrides: Partial<Paragraph['style']> = {}, spanOverrides: Record<string, unknown> = {}): Paragraph {
  return {
    id: 'p1',
    style: { alignment: 'left', line_height: 1.25, space_before: 0, space_after: 0, ...overrides },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spans: [{ text, ...(spanOverrides as any) }] as never,
  };
}

/** A document body only, with the colour table the exporter would write. */
function rtfWithColorTable(): string {
  return '{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\fnil Arial;}}'
    + '{\\colortbl ;\\red255\\green0\\blue0;\\red0\\green128\\blue0;}'
    + '\\pard\\ql\\fs24\\cf1 Rot\\cf0  und \\cf2 Gruen\\par}';
}

describe('W-182 — the RTF colour table is parsed', () => {
  it('reads the entries in order, skipping the automatic first entry', () => {
    expect(parseRtfColorTable(rtfWithColorTable())).toEqual(['#ff0000', '#008000']);
  });

  it('clamps out-of-range components instead of producing a broken colour', () => {
    const table = parseRtfColorTable('{\\rtf1{\\colortbl ;\\red300\\green-5\\blue999;}}');
    expect(table).toEqual(['#ff00ff']);
  });

  it('returns nothing for a document without a colour table', () => {
    expect(parseRtfColorTable('{\\rtf1\\ansi Text}')).toEqual([]);
    expect(parseRtfColorTable('')).toEqual([]);
  });

  it('ignores an entry that is not a colour', () => {
    expect(parseRtfColorTable('{\\rtf1{\\colortbl ;\\red1\\green2\\blue3;junk;}}')).toEqual(['#010203']);
  });
});

describe('W-182 — the reader resolves \\cfN to a colour, and an uncoloured run stays uncoloured', () => {
  it('gives each run the colour of its index', () => {
    const parsed = parseRtfDocument(rtfWithColorTable());
    expect(parsed).toHaveLength(1);
    const runs = parsed[0]!.runs;
    expect(runs.map((run) => run.text_color)).toEqual(['#ff0000', undefined, '#008000']);
    expect(runs.map((run) => run.text).join('')).toBe('Rot und Gruen');
  });

  it('treats \\cf0 as automatic, not as the first table entry', () => {
    const parsed = parseRtfDocument('{\\rtf1{\\colortbl ;\\red255\\green0\\blue0;}\\pard\\ql\\cf0 Text\\par}');
    expect(parsed[0]!.runs[0]!.text_color).toBeUndefined();
  });

  it('leaves the colour undefined when the index is not in the table', () => {
    const parsed = parseRtfDocument('{\\rtf1{\\colortbl ;\\red255\\green0\\blue0;}\\pard\\ql\\cf9 Text\\par}');
    expect(parsed[0]!.runs[0]!.text_color).toBeUndefined();
  });

  it('starts a new run when only the colour changes', () => {
    // Without the colour in the run-identity check, `\cf2` inside one bold run would be lost.
    const parsed = parseRtfDocument('{\\rtf1{\\colortbl ;\\red255\\green0\\blue0;\\red0\\green0\\blue255;}'
      + '\\pard\\ql\\b\\cf1 A\\cf2 B\\par}');
    const runs = parsed[0]!.runs;
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.text_color)).toEqual(['#ff0000', '#0000ff']);
    expect(runs.every((run) => run.bold)).toBe(true);
  });
});

describe('W-183 — the heading keeps its style for foreign programs', () => {
  it('writes a stylesheet and a style reference next to the outline level', () => {
    // Measured through the real exporter, not by reading its source.
    const exported = exportRtfFor([paragraph('Titel', { heading_level: 1, style_name: 'heading1' })]);
    expect(exported).toContain('{\\stylesheet');
    expect(exported).toContain('{\\s1\\ql');
    expect(exported).toContain('\\pard\\ql\\s1\\outlinelevel0');
  });

  it('leaves a body paragraph without a style reference', () => {
    const exported = exportRtfFor([paragraph('Text')]);
    // The stylesheet still **defines** the heading styles; a body paragraph must not **reference** one.
    expect(exported).toContain('{\\stylesheet');
    const body = exported.slice(exported.lastIndexOf('{\\stylesheet'));
    const bodyAfterStyles = body.slice(body.indexOf('}}') + 2);
    expect(bodyAfterStyles).toContain('\\pard\\ql \\fs24');
    expect(bodyAfterStyles).not.toMatch(/\\pard\\ql\\s\d/u);
  });

  it('names the style for every heading level the model has', () => {
    for (const level of [1, 2, 3] as const) {
      const exported = exportRtfFor([paragraph('H', { heading_level: level })]);
      expect(exported).toContain(`\\s${level}`);
      expect(exported).toContain(`\\outlinelevel${level - 1}`);
    }
  });
});

describe('W-182 — the exporter writes the colour table it needs', () => {
  it('writes a table only when a colour is used, and refers to it by index', () => {
    const plain = exportRtfFor([paragraph('ohne Farbe')]);
    expect(plain).not.toContain('{\\colortbl');
    expect(plain).not.toContain('\\cf');

    const coloured = exportRtfFor([paragraph('rot', {}, { text_color: '#ff0000' })]);
    expect(coloured).toContain('{\\colortbl ;\\red255\\green0\\blue0;}');
    expect(coloured).toContain('\\cf1 ');
    // Back to automatic, so the colour cannot leak into the following run.
    expect(coloured).toContain('\\cf0 ');
  });

  it('orders the table deterministically, so two exports of one document are identical', () => {
    const first = exportRtfFor([
      paragraph('a', {}, { text_color: '#0000ff' }),
      paragraph('b', {}, { text_color: '#ff0000' }),
    ]);
    const second = exportRtfFor([
      paragraph('b', {}, { text_color: '#ff0000' }),
      paragraph('a', {}, { text_color: '#0000ff' }),
    ]);
    // The same set of colours yields the same table; the indices are stable across exports.
    const tableOf = (rtf: string): string => rtf.slice(rtf.indexOf('{\\colortbl'), rtf.indexOf('}', rtf.indexOf('{\\colortbl')));
    expect(tableOf(first)).toBe(tableOf(second));
  });

  it('ignores a colour that is not a hex value instead of writing an invalid table entry', () => {
    const exported = exportRtfFor([paragraph('x', {}, { text_color: 'red' })]);
    expect(exported).not.toContain('{\\colortbl');
  });

  it('survives the round trip: export a colour, read it back', () => {
    // The whole point of W-182: the colour has to come back, not merely be written.
    const exported = exportRtfFor([paragraph('rot', {}, { text_color: '#ff0000' })]);
    // The exporter writes a document; the reader reads one. Feed the body to the reader as it would arrive.
    const parsed = parseRtfDocument(exported);
    expect(parsed[0]!.runs.map((run) => run.text_color)).toEqual(['#ff0000']);
    expect(parsed[0]!.runs.map((run) => run.text).join('')).toBe('rot');
  });
});
