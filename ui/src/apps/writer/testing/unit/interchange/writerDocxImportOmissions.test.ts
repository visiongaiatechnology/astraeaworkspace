// STATUS: DIAMANT — W-177 (import half): the DOCX import must admit what it read past
//
// The channel has two obligations and both are measured here:
//
//   1. **It reports what was skipped** — footnote/endnote references, comment references and tracked
//      changes, counted from the markers the reader walks past.
//   2. **It changes nothing** — the same file must import to the same document with and without the
//      sink. That is the constraint the orchestrator set when this scope was widened, and it is the
//      reason the reporter is a separate pure function instead of a branch inside the importer.
//
// A third obligation is the Writer's: the report must arrive in the **existing** loss vocabulary, so the
// surface and the tests stay one mechanism.
import { describe, expect, it } from 'vitest';

import { importDocx } from '../../../../../platform/interop/docx/importer';
import { reportDocxImportOmissions } from '../../../../../platform/interop/docx/import/importOmissions';
import { buildWriterImportLossReport } from '../../../../writer/interchange/portable/writerInterchangeLossReport';

/** Builds a minimal, valid DOCX package around one `<w:body>` fragment. */
function docxBytes(body: string, extraParts: Record<string, string> = {}): Uint8Array {
  const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body>${body}</w:body></w:document>`;
  const parts: Array<[string, string]> = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '</Types>'],
    // The package needs its root relationships: without them the importer refuses the file before it
    // reads a single paragraph (measured: "Office package is missing its root relationships").
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '</Relationships>'],
    ['word/document.xml', document],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'],
    ...Object.entries(extraParts),
  ];
  return zipStore(parts);
}

/** A minimal stored-entry ZIP writer — the fixture must be a real package, not a stub. */
function zipStore(parts: ReadonlyArray<[string, string]>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[index] = value >>> 0;
    }
    return table;
  })();
  const crc32 = (bytes: Uint8Array): number => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  for (const [name, content] of parts) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true); // stored
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    chunks.push(local);
    const centralEntry = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralEntry.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 0, true); // stored
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralEntry.set(nameBytes, 46);
    central.push(centralEntry);
    offset += local.length;
  }
  const centralSize = central.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, parts.length, true);
  endView.setUint16(10, parts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

const PLAIN_PARAGRAPH = '<w:p><w:r><w:t>Hallo Welt</w:t></w:r></w:p>';

describe('the omission report counts the markers the reader walks past', () => {
  it('is silent for a document with nothing to skip', () => {
    const report = reportDocxImportOmissions(`<w:body>${PLAIN_PARAGRAPH}</w:body>`);
    expect(report.omissions).toEqual([]);
    expect(report.hasOmissions).toBe(false);
  });

  it('counts footnote and endnote references', () => {
    const xml = '<w:body><w:p><w:r><w:t>Text</w:t></w:r>'
      + '<w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:footnoteReference w:id="2"/></w:r>'
      + '<w:r><w:endnoteReference w:id="3"/></w:r></w:p></w:body>';
    const report = reportDocxImportOmissions(xml);
    expect(report.omissions).toEqual([
      { kind: 'footnote', count: 2 },
      { kind: 'endnote', count: 1 },
    ]);
  });

  it('counts comment references and tracked changes', () => {
    const xml = '<w:body><w:p><w:commentReference w:id="1"/><w:commentReference w:id="2"/>'
      + '<w:ins w:id="3"><w:r><w:t>neu</w:t></w:r></w:ins>'
      + '<w:del w:id="4"><w:r><w:delText>alt</w:delText></w:r></w:del></w:p></w:body>';
    const report = reportDocxImportOmissions(xml);
    expect(report.omissions).toEqual([
      { kind: 'comment', count: 2 },
      { kind: 'tracked-change', count: 2 },
    ]);
  });

  it('does not count a word that merely contains the marker name', () => {
    // `w:inserted` must not read as `w:ins`, and `w:deleted` must not read as `w:del`.
    const xml = '<w:body><w:p><w:insertedThing/><w:deleteThis/></w:p></w:body>';
    expect(reportDocxImportOmissions(xml).omissions).toEqual([]);
  });

  it('survives a document that is not XML at all, without throwing', () => {
    expect(() => reportDocxImportOmissions('not xml at all')).not.toThrow();
    expect(reportDocxImportOmissions('').hasOmissions).toBe(false);
    expect(reportDocxImportOmissions('').hasNoteParts).toBe(false);
  });

  it('reports the presence of note parts separately from the markers', () => {
    const report = reportDocxImportOmissions(`<w:body>${PLAIN_PARAGRAPH}</w:body>`, { hasNoteParts: true });
    expect(report.hasNoteParts).toBe(true);
    // A note part without a reference marker is not counted as a skipped note: nothing was skipped.
    expect(report.omissions).toEqual([]);
  });
});

describe('the import output is unchanged by the channel', () => {
  it('produces the same document with and without the sink', async () => {
    const bytes = docxBytes(PLAIN_PARAGRAPH);
    const withoutSink = await importDocx(bytes, 'gleich.docx');
    let captured: unknown = null;
    const withSink = await importDocx(bytes, 'gleich.docx', (omissions) => { captured = omissions; });

    expect(captured).not.toBeNull();
    // Same shape and same payload: only the random id and the clock may differ.
    expect(withSink.objects['docx-text-root']).toEqual(withoutSink.objects['docx-text-root']);
    expect(Object.keys(withSink.objects)).toEqual(Object.keys(withoutSink.objects));
    expect(withSink.root_object_ids).toEqual(withoutSink.root_object_ids);
    expect(withSink.writerData?.tables).toEqual(withoutSink.writerData?.tables);
    expect(withSink.writerData?.images).toEqual(withoutSink.writerData?.images);
    expect(withSink.writerData?.equations).toEqual(withoutSink.writerData?.equations);
    expect(withSink.kind).toBe(withoutSink.kind);
    expect(withSink.schema_version).toBe(withoutSink.schema_version);
  });

  it('hands the sink the omissions of the file it just read', async () => {
    const bytes = docxBytes('<w:p><w:r><w:t>Text</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>',
      { 'word/footnotes.xml': '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1"><w:p><w:r><w:t>Notiz</w:t></w:r></w:p></w:footnote></w:footnotes>' });
    let captured: { omissions: readonly { kind: string; count: number }[]; hasNoteParts: boolean } | null = null;
    await importDocx(bytes, 'notiz.docx', (omissions) => { captured = omissions; });
    expect(captured).not.toBeNull();
    expect(captured!.hasNoteParts).toBe(true);
    expect(captured!.omissions).toEqual([{ kind: 'footnote', count: 1 }]);
  });

  it('imports a plain document without a sink exactly as before (the old signature)', async () => {
    const document = await importDocx(docxBytes(PLAIN_PARAGRAPH), 'alt.docx');
    expect(document.kind).toBe('Writer');
    const block = document.objects['docx-text-root'];
    expect(block?.type).toBe('TextBlock');
  });
});

describe('the Writer reads the channel through its existing loss mechanism', () => {
  it('translates footnote omissions into the same loss entries the exports use', () => {
    const report = buildWriterImportLossReport({
      omissions: [{ kind: 'footnote', count: 2 }, { kind: 'comment', count: 1 }, { kind: 'tracked-change', count: 3 }],
      hasOmissions: true,
    });
    expect(report.hasContentLoss).toBe(true);
    expect(report.losses.map((entry) => entry.kind)).toEqual(['note', 'comment', 'revision']);
    expect(report.losses[0]!.message).toContain('2');
    expect(report.losses[0]!.message).toContain('Fußnotenverweis');
    expect(report.format).toBe('docx');
  });

  it('is empty when the import skipped nothing', () => {
    const report = buildWriterImportLossReport({ omissions: [], hasOmissions: false });
    expect(report.hasLosses).toBe(false);
    expect(report.hasContentLoss).toBe(false);
  });

  it('names an unknown omission kind instead of dropping it', () => {
    // A silent omission inside the omission report would be the same disease one level up.
    const report = buildWriterImportLossReport({ omissions: [{ kind: 'textbox', count: 4 }], hasOmissions: true });
    expect(report.losses).toHaveLength(1);
    expect(report.losses[0]!.message).toContain('textbox');
    expect(report.losses[0]!.count).toBe(4);
  });
});
