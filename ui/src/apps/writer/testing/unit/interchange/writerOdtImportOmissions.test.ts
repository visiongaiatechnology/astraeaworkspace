// STATUS: DIAMANT — W-177 for ODT: the ODF reader must admit what it walks past
//
// The same two obligations as the DOCX channel, measured the same way:
//
//   1. it reports the parts `parseOdtContent` skips — tables, images, frames, notes, annotations;
//   2. `parseOdtContent` itself is untouched, so no caller's output changes.
//
// The names of the skipped parts were measured against the reader's own `switch`, not copied from the
// DOCX list: the ODF reader keeps paragraphs, runs, spaces, tabs, breaks and lists, and nothing else.
import { describe, expect, it } from 'vitest';

import { parseOdtContent, reportOdtImportOmissions } from '../../../../writer/interchange/import/odtContentReader';
import { buildWriterImportLossReport } from '../../../../writer/interchange/portable/writerInterchangeLossReport';

const content = (body: string) =>
  '<?xml version="1.0" encoding="UTF-8"?>'
  + '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
  + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
  + ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"'
  + ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" office:version="1.3">'
  + `<office:body><office:text>${body}</office:text></office:body></office:document-content>`;

describe('the ODT omission report counts what the reader skips', () => {
  it('is silent for a document of paragraphs, runs and lists', () => {
    const report = reportOdtImportOmissions(content(
      '<text:p>Hallo <text:span text:style-name="T1">Welt</text:span><text:s text:c="3"/>!</text:p>'
      + '<text:list><text:list-item><text:p>Punkt</text:p></text:list-item></text:list>',
    ));
    expect(report.omissions).toEqual([]);
    expect(report.hasOmissions).toBe(false);
  });

  it('counts a table exactly once, not its columns, rows and cells', () => {
    const report = reportOdtImportOmissions(content(
      '<table:table table:name="Tabelle1">'
      + '<table:table-column table:number-columns-repeated="2"/>'
      + '<table:table-row><table:table-cell><text:p>A</text:p></table:table-cell>'
      + '<table:table-cell><text:p>B</text:p></table:table-cell></table:table-row>'
      + '</table:table>',
    ));
    expect(report.omissions).toEqual([{ kind: 'table', count: 1 }]);
  });

  it('counts images, notes and annotations', () => {
    const report = reportOdtImportOmissions(content(
      '<text:p>Text<text:note text:note-class="footnote"><text:note-body><text:p>Notiz</text:p></text:note-body></text:note></text:p>'
      + '<draw:frame><draw:image xlink:href="Pictures/1.png"/></draw:frame>'
      + '<office:annotation><text:p>Kommentar</text:p></office:annotation>',
    ));
    expect(report.omissions).toEqual([
      { kind: 'image', count: 1 },
      { kind: 'note', count: 1 },
      { kind: 'comment', count: 1 },
    ]);
  });

  it('counts a frame that carries no image, and not the frame that carries one', () => {
    const imageInFrame = reportOdtImportOmissions(content('<draw:frame><draw:image xlink:href="a.png"/></draw:frame>'));
    expect(imageInFrame.omissions).toEqual([{ kind: 'image', count: 1 }]);

    const emptyFrame = reportOdtImportOmissions(content('<draw:frame><draw:text-box><text:p>Kasten</text:p></draw:text-box></draw:frame>'));
    expect(emptyFrame.omissions).toEqual([{ kind: 'frame', count: 1 }]);
  });

  it('does not count a table style or a table cell outside a table', () => {
    const report = reportOdtImportOmissions(content('<table:table-cell><text:p>x</text:p></table:table-cell>'));
    expect(report.omissions).toEqual([]);
  });

  it('survives input that is not XML and empty input', () => {
    expect(() => reportOdtImportOmissions('nonsense <')).not.toThrow();
    expect(reportOdtImportOmissions('').hasOmissions).toBe(false);
    expect(reportOdtImportOmissions('').omissions).toEqual([]);
  });
});

describe('the ODF reader itself is unchanged by the channel', () => {
  it('parses the same paragraphs, runs and styles as before', () => {
    // The channel is a separate function; this pins that the reader still does its own job.
    const parsed = parseOdtContent(content('<text:p>Hallo <text:span text:style-name="T1">Welt</text:span></text:p>'));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.runs.map((run) => run.text).join('')).toBe('Hallo Welt');
  });

  it('still has exactly one parameter, so no caller changed', () => {
    // Touching this signature would have broken the two existing call sites; the channel is additive.
    expect(parseOdtContent.length).toBe(1);
  });
});

describe('the ODT omissions reach the same loss vocabulary', () => {
  it('names the ODT reader, not the DOCX one', () => {
    const report = buildWriterImportLossReport(
      reportOdtImportOmissions(content('<table:table table:name="T"><table:table-row/></table:table>')),
      'odt',
    );
    expect(report.format).toBe('odt');
    expect(report.losses).toHaveLength(1);
    expect(report.losses[0]!.message).toContain('ODT-Import');
    expect(report.losses[0]!.message).not.toContain('DOCX');
    expect(report.losses[0]!.kind).toBe('table');
    expect(report.hasContentLoss).toBe(true);
  });

  it('keeps the DOCX wording when the source is not given', () => {
    const report = buildWriterImportLossReport({ omissions: [{ kind: 'footnote', count: 1 }], hasOmissions: true });
    expect(report.format).toBe('docx');
    expect(report.losses[0]!.message).toContain('DOCX-Import');
  });

  it('reports a clean ODT file as clean', () => {
    const report = buildWriterImportLossReport(reportOdtImportOmissions(content('<text:p>Nur Text</text:p>')), 'odt');
    expect(report.hasLosses).toBe(false);
  });
});
