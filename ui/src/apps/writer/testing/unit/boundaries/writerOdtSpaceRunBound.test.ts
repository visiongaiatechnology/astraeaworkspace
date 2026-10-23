// STATUS: DIAMANT — W-315: the ODT space run is a memory instruction from the file
//
// The finding was reported as reasoned, not reproduced: `odtContentReader.ts:256` built
// `' '.repeat(count)` from the file's `text:c` attribute, so `text:c="999999999"` asked for a ~1 GB
// string. This file builds the foreign `content.xml` and measures it.
//
// The bound is refused, not clamped: a file that asks for a million spaces is not a file whose spaces
// should be silently reinterpreted.
//
// The memory itself cannot be measured here; what is measured is that the string is never built. The
// notes of AST-0181 say so plainly.
import { describe, expect, it } from 'vitest';
import { importOdtXml } from '../../../../writer/interchange/import/writerImporter';
import { MAX_ODT_SPACE_RUN, parseOdtContent } from '../../../../writer/interchange/import/odtContentReader';
function content(body: string): string {
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
    + ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    + ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3">'
    + '<office:body><office:text>' + body + '</office:text></office:body></office:document-content>';
}

describe('W-315 — an oversized space run is refused before the string is built', () => {
  it('reproduces the finding: text:c="999999999" is not expanded', () => {
    // If this ever allocates, the runner dies rather than failing — which is exactly the reported
    // consequence, so the assertion is that the call throws **without** building the run.
    expect(() => parseOdtContent(content('<text:p>a<text:s text:c="999999999"/>b</text:p>')))
      .toThrow(/space run exceeds the 10000-space import limit/u);
  });

  it('names the offending value in the message', () => {
    expect(() => parseOdtContent(content('<text:p><text:s text:c="5000000"/></text:p>')))
      .toThrow(/text:c="5000000"/u);
  });

  it('refuses through the real import entry point as well', () => {
    expect(() => importOdtXml(content('<text:p>Text<text:s text:c="123456789"/></text:p>')))
      .toThrow(/space run exceeds/u);
  });

  it('still expands a legitimate run, including the document maximum', () => {
    const parsed = parseOdtContent(content(`<text:p>a<text:s text:c="${MAX_ODT_SPACE_RUN}"/>b</text:p>`));
    expect(parsed[0]?.runs.map((run) => run.text).join('')).toBe(`a${' '.repeat(MAX_ODT_SPACE_RUN)}b`);
  });

  it('keeps the ODF default of one space and the previous behaviour for a nonsensical value', () => {
    // No `text:c` means one space; a value the parser cannot read keeps the historic single space.
    expect(parseOdtContent(content('<text:p>a<text:s/>b</text:p>'))[0]?.runs.map((r) => r.text).join('')).toBe('a b');
    expect(parseOdtContent(content('<text:p>a<text:s text:c="nonsense"/>b</text:p>'))[0]?.runs.map((r) => r.text).join('')).toBe('a b');
    expect(parseOdtContent(content('<text:p>a<text:s text:c="-5"/>b</text:p>'))[0]?.runs.map((r) => r.text).join('')).toBe('a b');
  });

  it('leaves an ordinary document alone', () => {
    const parsed = parseOdtContent(content('<text:p>Hallo <text:s text:c="2"/>Welt</text:p>'));
    expect(parsed[0]?.runs.map((run) => run.text).join('')).toBe('Hallo   Welt');
  });
});
