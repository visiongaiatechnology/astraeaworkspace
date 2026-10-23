// STATUS: PLATIN — Writer multi-column cross-layer verification
import { describe, expect, it } from 'vitest';
import type {
  Paragraph,
  WorkspaceDocument,
  WriterPageSetupConfig,
  WriterStyleDefinition,
} from '../../../../shared/contracts/workspace';
import { getWriterPageGeometry } from '../../../../apps/writer/layout/pagination/geometry/writerPaginationGeometry';
import { paginateWriterSections } from '../../../../apps/writer/layout/pagination/writerPagination';
import { validateWriterPageSetup } from '../../../../apps/writer/layout/page-setup/writerPageSetupValidation';
import { buildWriterPdf } from '../../../../apps/writer/interchange/export/pdf/writerPdfExport';
import { exportDocx, importDocx } from '../../../../platform/interop/docx';
import { decodeUtf8, readZip } from '../../../../platform/interop/zip';
import { millimetersToPoints, millimetersToTwips } from '../../../../platform/document-layout/writerPaperSizes';
import {
  equalWriterColumnWidthsMm,
  resolveWriterColumnLayoutMm,
  validateWriterColumnLayoutMm,
} from '../../../../platform/document-layout/writerColumns';

const STYLES: WriterStyleDefinition[] = [{
  name: 'normal',
  label: 'Normal',
  fontSizePt: 11,
  bold: false,
  lineHeight: 1.2,
  spaceBefore: 0,
  spaceAfter: 0,
}];

function setup(patch: Partial<WriterPageSetupConfig> = {}): WriterPageSetupConfig {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    paperColor: 'white',
    showPageNumbers: false,
    headerText: '',
    footerText: '',
    ...patch,
  };
}

function paragraph(id: string, text: string, columnBreakBefore = false): Paragraph {
  return {
    id,
    style: {
      style_name: 'normal',
      alignment: 'left',
      line_height: 1.2,
      space_before: 0,
      space_after: 0,
      column_break_before: columnBreakBefore || undefined,
    },
    spans: [{ text, font_size_pt: 11 }],
  };
}

function documentWithColumns(pageSetup: WriterPageSetupConfig, paragraphs: Paragraph[]): WorkspaceDocument {
  const textBlock = { id: 'text-root', paragraphs };
  return {
    schema_version: 1,
    id: 'column-document',
    title: 'Column document',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textBlock.id],
    objects: { [textBlock.id]: { type: 'TextBlock', data: textBlock } },
    writerData: { pageSetup, tables: [] },
  };
}

describe('Writer multi-column contract', () => {
  it('fills the body exactly with one to four equal columns', () => {
    for (const count of [1, 2, 3, 4] as const) {
      const widths = equalWriterColumnWidthsMm(159.2, count, 8);
      const layout = resolveWriterColumnLayoutMm(setup({ columns: count, columnGapMm: 8 }), 159.2);

      expect(widths).toHaveLength(count);
      expect(layout.widths).toEqual(widths);
      expect(layout.occupiedWidth).toBeCloseTo(159.2, 8);
      expect(layout.remainingWidth).toBeCloseTo(0, 8);
    }
  });

  it('rejects missing, overflowing and impossible custom column geometry', () => {
    expect(validateWriterColumnLayoutMm({ columns: 2, columnGapMm: 8, columnWidthsMm: [151.2] }, 159.2))
      .toMatch(/exakt 2 Werte/u);
    expect(validateWriterColumnLayoutMm({ columns: 2, columnGapMm: 8, columnWidthsMm: [80, 80] }, 159.2))
      .toMatch(/vollständig ausfüllen/u);
    expect(validateWriterColumnLayoutMm({ columns: 4, columnGapMm: 50 }, 159.2))
      .toMatch(/mindestens 5 mm/u);
  });

  it('uses exact unequal widths in the screen geometry and validation boundary', () => {
    const config = setup({ columns: 2, columnGapMm: 8, columnWidthsMm: [50, 101.2] });
    const geometry = getWriterPageGeometry(config);

    expect(validateWriterPageSetup(config)).toBeNull();
    expect(geometry.columnWidthsPx?.[0]).toBeCloseTo((50 * 96) / 25.4, 6);
    expect(geometry.columnWidthsPx?.[1]).toBeCloseTo((101.2 * 96) / 25.4, 6);
    expect(geometry.columnGapPx).toBeCloseTo((8 * 96) / 25.4, 6);
  });

  it('places an explicit column break into the next physical column on the same page', () => {
    const first = paragraph('first', 'FIRST COLUMN');
    const second = paragraph('second', 'SECOND COLUMN', true);
    const pages = paginateWriterSections(
      [first, second],
      setup({ columns: 2, columnGapMm: 8 }),
      STYLES,
      [],
    );

    expect(pages).toHaveLength(1);
    expect(pages[0]?.columnFlowItems?.[0]?.map((item) => item.kind === 'paragraph' && item.fragment.paragraph.id))
      .toEqual(['first']);
    expect(pages[0]?.columnFlowItems?.[1]?.map((item) => item.kind === 'paragraph' && item.fragment.paragraph.id))
      .toEqual(['second']);
  });

  it('flows an oversized paragraph through every column before creating another page', () => {
    const sourceText = Array.from({ length: 420 }, (_, index) => `word${index}`).join(' ');
    const pages = paginateWriterSections(
      [paragraph('long', sourceText)],
      setup({ columns: 2, columnGapMm: 8 }),
      STYLES,
      [],
    );
    const firstPage = pages[0];
    const firstPageText = firstPage?.fragments
      .map((fragment) => sourceText.slice(fragment.startOffset, fragment.endOffset))
      .join('');

    expect(firstPage?.columnFlowItems?.[0]?.length).toBeGreaterThan(0);
    expect(firstPage?.columnFlowItems?.[1]?.length).toBeGreaterThan(0);
    expect(firstPageText?.length).toBeGreaterThan(0);
    expect(pages.flatMap((page) => page.fragments)
      .map((fragment) => sourceText.slice(fragment.startOffset, fragment.endOffset))
      .join('')).toBe(sourceText);
  });

  it('applies a multi-column layout only to the section that owns it', () => {
    const first = paragraph('section-one', 'Single-column section');
    const second = paragraph('section-two', 'First custom column');
    const third = paragraph('section-two-break', 'Second custom column', true);
    const pages = paginateWriterSections(
      [first, second, third],
      setup({ columns: 1 }),
      STYLES,
      [{
        id: 'columns-section',
        startParagraphId: second.id,
        pageSetup: setup({ columns: 2, columnGapMm: 8, columnWidthsMm: [50, 101.2] }),
      }],
    );

    expect(pages[0]?.sectionId).toBe('document-default');
    expect(pages[0]?.pageSetup.columns).toBe(1);
    expect(pages[1]?.sectionId).toBe('columns-section');
    expect(pages[1]?.columnFlowItems?.[0]?.length).toBe(1);
    expect(pages[1]?.columnFlowItems?.[1]?.length).toBe(1);
  });

  it('writes explicit columns to distinct PDF x coordinates', () => {
    const config = setup({ columns: 2, columnGapMm: 8 });
    const pdf = new TextDecoder().decode(buildWriterPdf(
      'Columns',
      [paragraph('first', 'FIRST COLUMN'), paragraph('second', 'SECOND COLUMN', true)],
      config,
      [],
      [],
      STYLES,
    ));
    const firstX = Number(/1 0 0 1 ([0-9.]+) [0-9.]+ Tm\n\(FIRST COLUMN\) Tj/u.exec(pdf)?.[1]);
    const secondX = Number(/1 0 0 1 ([0-9.]+) [0-9.]+ Tm\n\(SECOND COLUMN\) Tj/u.exec(pdf)?.[1]);

    expect(firstX).toBeCloseTo(millimetersToPoints(25.4), 1);
    expect(secondX).toBeGreaterThan(firstX + millimetersToPoints(75));
    expect(pdf.match(/\/Type \/Page\b/gu)).toHaveLength(1);
  });

  it('round-trips unequal columns, gap and a column break through a real DOCX package', async () => {
    const config = setup({ columns: 2, columnGapMm: 8, columnWidthsMm: [50, 101.2] });
    const sourceParagraphs = [paragraph('first', 'FIRST'), paragraph('second', 'SECOND', true)];
    const bytes = exportDocx(documentWithColumns(config, sourceParagraphs));
    const entries = await readZip(bytes);
    const documentXml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    const restored = await importDocx(bytes, 'columns.docx');
    const restoredSetup = restored.writerData?.pageSetup;
    const restoredText = restored.objects[restored.root_object_ids[0] ?? ''];

    expect(documentXml).toContain('<w:cols w:num="2"');
    expect(documentXml).toContain('w:equalWidth="0"');
    expect(documentXml).toContain(`w:w="${millimetersToTwips(50)}"`);
    expect(documentXml).toContain('<w:br w:type="column"/>');
    expect(restoredSetup?.columns).toBe(2);
    expect(restoredSetup?.columnGapMm).toBeCloseTo(8, 1);
    expect(restoredSetup?.columnWidthsMm?.[0]).toBeCloseTo(50, 1);
    expect(restoredSetup?.columnWidthsMm?.[1]).toBeCloseTo(101.2, 1);
    expect(restoredText?.type === 'TextBlock' && restoredText.data.paragraphs[1]?.style.column_break_before)
      .toBe(true);
  });
});
