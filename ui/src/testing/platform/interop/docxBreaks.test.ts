// STATUS: DIAMANT VGT SUPREME — DOCX line, flow and section break roundtrip
import { describe, expect, it } from 'vitest';
import type {
  Paragraph,
  TextBlockObject,
  WorkspaceDocument,
  WriterPageSetupConfig,
  WriterSectionBreakType,
} from '../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { decodeUtf8, readZip } from '../../../platform/interop/zip';

const pageSetup = (
  paperSize: WriterPageSetupConfig['paperSize'] = 'A4',
): WriterPageSetupConfig => ({
  paperSize,
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
});

const paragraph = (
  id: string,
  text: string,
  style: Partial<Paragraph['style']> = {},
): Paragraph => ({
  id,
  style: {
    alignment: 'left',
    line_height: 1.5,
    space_before: 0,
    space_after: 8,
    ...style,
  },
  spans: [{ text }],
});

function documentWithBreak(
  breakType: WriterSectionBreakType,
  secondSetup: WriterPageSetupConfig = pageSetup('Letter'),
): WorkspaceDocument {
  const textBlock: TextBlockObject = {
    id: 'text-root',
    paragraphs: [
      paragraph('first', 'First line\nSecond line'),
      paragraph('second', 'Page section', { page_break_before: true }),
      paragraph('third', 'Column tail', { column_break_before: true }),
    ],
  };
  return {
    schema_version: 1,
    id: `break-${breakType}`,
    title: 'Break roundtrip',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textBlock.id],
    objects: { [textBlock.id]: { type: 'TextBlock', data: textBlock } },
    writerData: {
      pageSetup: pageSetup(),
      tables: [],
      sections: [{
        id: 'second-section',
        startParagraphId: 'second',
        pageSetup: secondSetup,
        breakType,
      }],
    },
  };
}

describe('DOCX Writer breaks', () => {
  it.each([
    ['next-page', 'nextPage'],
    ['continuous', 'continuous'],
    ['even-page', 'evenPage'],
    ['odd-page', 'oddPage'],
  ] as const)('round-trips the %s section break through a real package', async (breakType, wordValue) => {
    const bytes = exportDocx(documentWithBreak(breakType));
    const entries = await readZip(bytes);
    const xml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    const restored = await importDocx(bytes, `${breakType}.docx`);

    expect(xml).toContain(`<w:type w:val="${wordValue}"/>`);
    expect(restored.writerData?.pageSetup.paperSize).toBe('A4');
    expect(restored.writerData?.sections).toHaveLength(1);
    expect(restored.writerData?.sections?.[0]).toMatchObject({
      startParagraphId: 'docx-p-2',
      breakType,
      pageSetup: { paperSize: 'Letter' },
    });
  });

  it('preserves manual line, page and column breaks without converting structural breaks into text', async () => {
    const bytes = exportDocx(documentWithBreak('continuous'));
    const entries = await readZip(bytes);
    const xml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    const restored = await importDocx(bytes, 'all-breaks.docx');
    const restoredText = restored.objects[restored.root_object_ids[0] ?? ''];
    expect(restoredText?.type).toBe('TextBlock');
    const paragraphs = restoredText?.type === 'TextBlock' ? restoredText.data.paragraphs : [];

    expect(xml).toContain('<w:br/>');
    expect(xml).toContain('<w:br w:type="page"/>');
    expect(xml).toContain('<w:br w:type="column"/>');
    expect(paragraphs[0]?.spans.map((span) => span.text).join('')).toBe('First line\nSecond line');
    expect(paragraphs[1]?.style.page_break_before).toBe(true);
    expect(paragraphs[1]?.spans.map((span) => span.text).join('')).toBe('Page section');
    expect(paragraphs[2]?.style.column_break_before).toBe(true);
    expect(paragraphs[2]?.spans.map((span) => span.text).join('')).toBe('Column tail');
  });
});
