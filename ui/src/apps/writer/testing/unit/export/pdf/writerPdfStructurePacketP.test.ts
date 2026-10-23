import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterPageSetupConfig } from '../../../../../../shared/contracts/workspace';
import { buildWriterPdf } from '../../../../interchange/export/pdf/writerPdfExport';
import { generateTableOfContentsParagraphs } from '../../../../references/toc/writerTocEngine';
import type { WriterPdfTextRasterizer } from '../../../../interchange/export/pdf/writerPdfTextRaster';

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
const DEFAULT_PAGE_SETUP: WriterPageSetupConfig = { paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white', showPageNumbers: false, headerText: '', footerText: '' };
const testTextRasterizer: WriterPdfTextRasterizer = () => ({
  widthPx: 16, heightPx: 16, widthPt: 8, heightPt: 8,
  baselineFromBottomPt: 3, packedMaskHex: `${'FF'.repeat(32)}>`,
});

function paragraph(id: string, content: string, headingLevel?: 1 | 2): Paragraph {
  return {
    id,
    style: {
      alignment: 'left', line_height: 1.2, space_before: 0, space_after: 4,
      ...(headingLevel ? { heading_level: headingLevel, style_name: `heading${headingLevel}` as const } : {}),
    },
    spans: [{ text: content }],
  };
}

describe('Writer tagged PDF structure', () => {
  it('exports outlines, named destinations, tags, links and XMP metadata', () => {
    const h1 = paragraph('heading-one', 'Einführung Ω', 1);
    const body = paragraph('body-one', 'Body');
    const toc = generateTableOfContentsParagraphs([h1, body], undefined, { showPageNumbers: true });
    const pdf = text(buildWriterPdf(
      'Strukturtest Ω', [...toc, h1, body], DEFAULT_PAGE_SETUP, [], [], undefined, [], {},
      { language: 'de-DE', createdAt: 1_700_000_000_000, modifiedAt: 1_700_000_100_000, bookmarks: [{ id: 'b1', name: 'Start', paragraphId: 'heading-one', createdAt: 1 }] },
      { textRasterizer: testTextRasterizer },
    ));
    expect(pdf).toContain('/StructTreeRoot');
    expect(pdf).toContain('/MarkInfo << /Marked true >>');
    expect(pdf).toContain('/Metadata');
    expect(pdf).toContain('/Subtype /XML');
    expect(pdf).toContain('/Outlines');
    expect(pdf).toContain('/Names << /Dests');
    expect(pdf).toContain('/Subtype /Link');
    expect(pdf).toContain('/Dest (writer:heading-one)');
    expect(pdf).toContain('/H1 <</MCID');
    expect(pdf).toContain('<dc:language><rdf:Bag><rdf:li>de-DE</rdf:li></rdf:Bag></dc:language>');
  });

  it('rejects unsafe external link schemes from PDF annotations', () => {
    const p = paragraph('p', 'unsafe');
    p.spans[0]!.link = { kind: 'external', url: 'javascript:alert(1)' };
    const pdf = text(buildWriterPdf('Unsafe', [p], DEFAULT_PAGE_SETUP));
    expect(pdf).not.toContain('/Subtype /Link');
    expect(pdf).not.toContain('javascript:');
  });
});
