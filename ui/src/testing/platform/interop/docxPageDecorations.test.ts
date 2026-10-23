// STATUS: DIAMANT VGT SUPREME — Real DOCX page-decoration package roundtrip
import { describe, expect, it } from 'vitest';
import type { Paragraph, TextBlockObject, WorkspaceDocument, WriterPageSetupConfig } from '../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { decodeUtf8, readZip } from '../../../platform/interop/zip';

const paragraph = (id: string, text: string): Paragraph => ({
  id,
  style: { alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8 },
  spans: [{ text }],
});

const decoratedSetup = (backgroundColor: string, watermarkText: string): WriterPageSetupConfig => ({
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  backgroundColor,
  showPageNumbers: false,
  headerText: '',
  footerText: '',
  pageBorders: { style: 'double', widthPt: 2, color: '#1E293B', paddingMm: 4 },
  watermark: { enabled: true, text: watermarkText, opacity: 0.12, rotationDeg: -35, color: '#64748B' },
});

describe('DOCX Writer page decorations', () => {
  it('round-trips document and section decorations through a real OOXML package', async () => {
    const paragraphs = [paragraph('first', 'First section'), paragraph('second', 'Second section')];
    const textBlock: TextBlockObject = { id: 'text-root', paragraphs };
    const firstSetup = decoratedSetup('#E2E8F0', 'DRAFT');
    const secondSetup = decoratedSetup('#FEF3C7', 'CONFIDENTIAL');
    const document: WorkspaceDocument = {
      schema_version: 1,
      id: 'decorated-docx',
      title: 'Decorated DOCX',
      kind: 'Writer',
      created_at: 1,
      modified_at: 1,
      version: 1,
      theme_id: 'default',
      root_object_ids: [textBlock.id],
      objects: { [textBlock.id]: { type: 'TextBlock', data: textBlock } },
      writerData: {
        pageSetup: firstSetup,
        tables: [],
        sections: [{
          id: 'second-section',
          startParagraphId: 'second',
          pageSetup: secondSetup,
          breakType: 'next-page',
        }],
      },
    };

    const bytes = exportDocx(document);
    const entries = await readZip(bytes);
    const documentXml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    const settingsXml = decodeUtf8(entries.get('word/settings.xml') ?? new Uint8Array());
    const restored = await importDocx(bytes, 'decorated.docx');

    expect(documentXml).toContain('<w:background w:color="E2E8F0"/>');
    expect(documentXml.match(/<w:pgBorders\b/gu)).toHaveLength(2);
    expect(documentXml).toContain('vgt:backgroundColor="FEF3C7"');
    expect(documentXml).toContain('vgt:watermarkText="CONFIDENTIAL"');
    expect(settingsXml).toContain('<w:displayBackgroundShape/>');
    expect(restored.writerData?.pageSetup).toMatchObject({
      backgroundColor: '#E2E8F0',
      pageBorders: { style: 'double', widthPt: 2, color: '#1E293B' },
      watermark: { enabled: true, text: 'DRAFT', opacity: 0.12, rotationDeg: -35, color: '#64748B' },
    });
    expect(restored.writerData?.sections?.[0]?.pageSetup).toMatchObject({
      backgroundColor: '#FEF3C7',
      watermark: { enabled: true, text: 'CONFIDENTIAL' },
    });
    expect(restored.writerData?.pageSetup.pageBorders?.paddingMm).toBe(4);
  });
});
