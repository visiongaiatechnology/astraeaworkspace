// STATUS: DIAMANT VGT SUPREME — Writer Section-12 Print/Interop Regression Tests
import { describe, expect, it } from 'vitest';
import type { Paragraph, WorkspaceDocument, WriterPageSetupConfig } from '../../../../../shared/contracts/workspace';
import { readZip, utf8, writeStoredZip, decodeUtf8 } from '../../../../../platform/interop/zip';
import { exportDocx, importDocx } from '../../../../../platform/interop/docx';
import { getWriterPageGeometry, CSS_PIXELS_PER_MM, CSS_PIXELS_PER_POINT, resolveWriterFlowReservePoints } from '../../../layout/pagination/geometry/writerPaginationGeometry';
import {
  buildWriterPdf,
  resolveWriterPrintPageIndexes,
  writerPageGeometry,
} from '../../../interchange/export/pdf/writerPdfExport';
import type { WriterPdfTextRasterizer } from '../../../interchange/export/pdf/writerPdfTextRaster';
import {
  exportWriterPortableDocument,
  importWriterPortableBytes,
} from '../../../interchange/portable/writerPortableInterop';

const pageSetup: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'custom',
  customMargins: { top: 22, bottom: 24, left: 26, right: 18 },
  paperColor: 'white',
  showPageNumbers: true,
  headerText: 'Header',
  footerText: 'Footer',
  columns: 2,
  columnGapMm: 8,
};

const paragraphs: Paragraph[] = [
  {
    id: 'p-1',
    style: { style_name: 'heading1', heading_level: 1, alignment: 'left', line_height: 1.2, space_before: 0, space_after: 6 },
    spans: [{ text: 'Interop Prüfung', bold: true }],
  },
  {
    id: 'p-2',
    style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
    spans: [{ text: 'Unicode: Grüße ' }, { text: 'Ω中🙂', italic: true }],
  },
];

const testTextRasterizer: WriterPdfTextRasterizer = () => ({
  widthPx: 16, heightPx: 16, widthPt: 8, heightPt: 8,
  baselineFromBottomPt: 3, packedMaskHex: `${'FF'.repeat(32)}>`,
});

function documentModel(): WorkspaceDocument {
  const textId = 'text-1';
  return {
    schema_version: 1,
    id: 'writer-interop-test',
    title: 'Interop Test',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textId],
    objects: { [textId]: { type: 'TextBlock', data: { id: textId, paragraphs } } },
    writerData: { pageSetup, tables: [] },
  };
}

function pdfText(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('Writer section 12 print and interoperability', () => {
  it('uses the same physical paper, margin and column geometry on screen and PDF', () => {
    const screen = getWriterPageGeometry(pageSetup, 1);
    const pdf = writerPageGeometry(pageSetup, 1);
    const pointsPerMm = 72 / 25.4;
    expect(screen.widthPx / CSS_PIXELS_PER_MM).toBeCloseTo(pdf.width / pointsPerMm, 5);
    expect(screen.heightPx / CSS_PIXELS_PER_MM).toBeCloseTo(pdf.height / pointsPerMm, 5);
    expect(screen.marginsPx.left / CSS_PIXELS_PER_MM).toBeCloseTo(pdf.margins.left / pointsPerMm, 5);
    expect(screen.marginsPx.right / CSS_PIXELS_PER_MM).toBeCloseTo(pdf.margins.right / pointsPerMm, 5);
    expect(screen.columnCount).toBe(pdf.columns.count);
    expect(screen.columnGapPx / CSS_PIXELS_PER_MM).toBeCloseTo(pdf.columns.gap / pointsPerMm, 5);
    const reserve = resolveWriterFlowReservePoints(pageSetup);
    const pdfBodyHeightPx = (pdf.height - pdf.margins.top - pdf.margins.bottom - reserve.top - reserve.bottom) * CSS_PIXELS_PER_POINT;
    expect(screen.bodyHeightPx).toBeCloseTo(pdfBodyHeightPx, 5);
  });

  it('bounds page ranges and materializes copies, collation, duplex and scaling into print PDF', () => {
    expect(resolveWriterPrintPageIndexes(6, '1-2,4')).toEqual([0, 1, 3]);
    expect(() => resolveWriterPrintPageIndexes(3, '4')).toThrow();
    const pdf = pdfText(buildWriterPdf('Print Test', paragraphs, pageSetup, [], [], [], [], {
      pageRange: '1', copies: 2, collate: false, duplex: 'short-edge', scalePercent: 80,
    }, {}, { textRasterizer: testTextRasterizer }));
    expect(pdf).toContain('/Count 2');
    expect(pdf).toContain('/Duplex /DuplexFlipShortEdge');
    expect(pdf).toContain('0.80000 0 0 0.80000');
  });

  it('exports and imports portable text formats using real byte adapters', async () => {
    const doc = documentModel();
    for (const format of ['odt', 'rtf', 'html', 'markdown', 'txt'] as const) {
      const exported = exportWriterPortableDocument(doc, format);
      expect(exported.bytes.byteLength).toBeGreaterThan(0);
      const imported = await importWriterPortableBytes(exported.bytes, exported.fileName);
      const text = Object.values(imported.objects)
        .filter((object) => object.type === 'TextBlock')
        .flatMap((object) => object.type === 'TextBlock' ? object.data.paragraphs : [])
        .flatMap((paragraph) => paragraph.spans)
        .map((span) => span.text)
        .join(' ');
      expect(text).toContain('Interop');
    }
  });

  it('roundtrips DOCX through the bounded OOXML adapter', async () => {
    const bytes = exportDocx(documentModel());
    const imported = await importDocx(bytes, 'roundtrip.docx');
    const textBlock = Object.values(imported.objects).find((object) => object.type === 'TextBlock');
    expect(textBlock?.type).toBe('TextBlock');
    if (textBlock?.type === 'TextBlock') expect(textBlock.data.paragraphs[0]?.spans[0]?.text).toContain('Interop');
  });

  it('preserves passive unknown ODT XML parts and namespaces while rejecting active XML declarations', async () => {
    const content = '<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:vendor="urn:vendor:test"><office:body><office:text><text:p>Preserved text</text:p></office:text></office:body></office:document-content>';
    const packageBytes = writeStoredZip([
      { name: 'mimetype', data: utf8('application/vnd.oasis.opendocument.text') },
      { name: 'content.xml', data: utf8(content) },
      { name: 'styles.xml', data: utf8('<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>') },
      { name: 'meta.xml', data: utf8('<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>') },
      { name: 'META-INF/manifest.xml', data: utf8('<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>') },
      { name: 'vendor/custom.xml', data: utf8('<vendor:custom xmlns:vendor="urn:vendor:test"><vendor:value>42</vendor:value></vendor:custom>') },
      { name: 'vendor/unsafe.xml', data: utf8('<!DOCTYPE x [<!ENTITY boom "x">]><x>&boom;</x>') },
    ]);
    const imported = await importWriterPortableBytes(packageBytes, 'vendor.odt');
    const reexported = exportWriterPortableDocument(imported, 'odt');
    const entries = await readZip(reexported.bytes);
    expect(decodeUtf8(entries.get('vendor/custom.xml')!)).toContain('<vendor:value>42</vendor:value>');
    expect(entries.has('vendor/unsafe.xml')).toBe(false);
    expect(decodeUtf8(entries.get('content.xml')!)).toContain('xmlns:vendor="urn:vendor:test"');
    expect(decodeUtf8(entries.get('META-INF/manifest.xml')!)).toContain('manifest:full-path="vendor/custom.xml"');
  });

  it('does not leak preservation namespaces across different Office formats', () => {
    const doc = documentModel();
    doc.writerData = {
      ...doc.writerData!,
      interopPreservation: {
        sourceFormat: 'docx',
        preservedXmlParts: {},
        preservedNamespaces: { vendor: 'urn:docx-only' },
      },
    };
    const odt = exportWriterPortableDocument(doc, 'odt');
    expect(pdfText(odt.bytes)).not.toContain('urn:docx-only');
  });
});
