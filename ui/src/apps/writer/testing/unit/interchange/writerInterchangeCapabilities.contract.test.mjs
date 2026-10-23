// STATUS: DIAMANT — the capability table and the exporters must not drift apart
//
// The loss report says "ODT cannot carry images". That is a claim about code, so it is pinned to the
// code: if an exporter learns to write images (or a reader learns to read them), this test fails and the
// table has to be corrected rather than going stale and telling the user something untrue.
//
// Source contract, not a byte measurement: the environment has no way to open a produced ODT in a
// foreign program (that stays W-186). The notes of the findings folder say so.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
/** From `apps/writer/testing/unit/interchange/` up to `apps/`. */
const APPS = resolve(HERE, '../../../..');

function readWriterSource(relativePath) {
  return readFileSync(resolve(APPS, 'writer', relativePath), 'utf8');
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const interop = stripComments(readWriterSource('interchange/portable/writerPortableInterop.ts'));
const lossReport = stripComments(readWriterSource('interchange/portable/writerInterchangeLossReport.ts'));

describe('the capability table matches the exporters', () => {
  it('does not write images into the RTF, Markdown or TXT output', () => {
    // The three single-file text exporters build their body from text runs only.
    const rtfBody = interop.slice(interop.indexOf('function exportRtf('), interop.indexOf('function exportOdt'));
    expect(rtfBody).not.toMatch(/images/);
    const markdownBody = interop.slice(interop.indexOf('function exportMarkdown('), interop.indexOf('function spanHtml'));
    expect(markdownBody).not.toMatch(/images/);
    const txtBody = interop.slice(interop.indexOf('function exportPlainText('), interop.indexOf('function spanMarkdown'));
    expect(txtBody).not.toMatch(/images/);
  });

  it('declares images and tables as not carried for ODT, RTF, HTML, Markdown and TXT', () => {
    for (const format of ['odt', 'rtf', 'html', 'markdown', 'txt']) {
      const entry = lossReport.slice(lossReport.indexOf(`${format}: {`), lossReport.indexOf('},', lossReport.indexOf(`${format}: {`)));
      expect(entry, format).toContain('images: false');
      expect(entry, format).toContain('tables: false');
    }
  });

  it('declares DOCX as carrying images, tables, headers, equations and spacing, and not notes', () => {
    const start = lossReport.indexOf('docx: {');
    const entry = lossReport.slice(start, lossReport.indexOf('},', start));
    expect(entry).toContain('images: true');
    expect(entry).toContain('tables: true');
    expect(entry).toContain('headerFooter: true');
    expect(entry).toContain('alignment: true');
    expect(entry).toContain('notes: false');
    // WR-042: the DOCX exporter writes OMML and the importer reads it back; the old `false`
    // produced a loss warning for content that was actually present.
    expect(entry).toContain('equations: true');
    expect(entry).toContain('paragraphSpacing: true');
    // No portable exporter writes shapes or media objects.
    expect(entry).toContain('shapes: false');
    expect(entry).toContain('mediaObjects: false');
  });

  it('emits the report on the export result, so a caller cannot get bytes without it', () => {
    expect(interop).toMatch(/lossReport: WriterInterchangeLossReport;/);
    expect(interop).toMatch(/lossReport \};/);
    // And the truncation refusal stays where the finding was.
    expect(interop).toContain('if (text.length > MAX_TEXT_EXPORT_CHARS) {');
    expect(interop).toContain('if (markdown.length > MAX_TEXT_EXPORT_CHARS) {');
    expect(interop).not.toMatch(/slice\(0, MAX_TEXT_EXPORT_CHARS\)/);
  });
});
