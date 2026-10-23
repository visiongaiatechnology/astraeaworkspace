// STATUS: PLATIN — Writer margin geometry cross-layer contract verification
import { describe, expect, it } from 'vitest';
import type { Paragraph, WorkspaceDocument, WriterPageSetupConfig } from '../../../shared/contracts/workspace';
import { getWriterPageGeometry } from '../../../apps/writer/layout/pagination/geometry/writerPaginationGeometry';
import { getMarginPadding } from '../../../apps/writer/layout/pages/writerPageStyles';
import { validateWriterPageSetup } from '../../../apps/writer/layout/page-setup/writerPageSetupValidation';
import { buildWriterPdf, writerPageGeometry } from '../../../apps/writer/interchange/export/pdf/writerPdfExport';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { decodeUtf8, readZip } from '../../../platform/interop/zip';
import { millimetersToPoints, millimetersToTwips } from '../../../platform/document-layout/writerPaperSizes';
import {
  resolveWriterMarginDefinitionMm,
  resolveWriterPhysicalPageMarginsMm,
  WRITER_MARGIN_PRESETS_MM,
} from '../../../platform/document-layout/writerPageMargins';

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

function paragraph(id: string, text: string, pageBreakBefore = false): Paragraph {
  return {
    id,
    style: {
      alignment: 'left',
      line_height: 1.2,
      space_before: 0,
      space_after: 0,
      page_break_before: pageBreakBefore,
    },
    spans: [{ text, font_size_pt: 11 }],
  };
}

function documentWithSetup(pageSetup: WriterPageSetupConfig): WorkspaceDocument {
  const textBlock = {
    id: 'text-root',
    paragraphs: [paragraph('paragraph-1', 'Margin roundtrip')],
  };
  return {
    schema_version: 1,
    id: 'margin-document',
    title: 'Margin document',
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

function expectMarginsClose(
  actual: WriterPageSetupConfig['customMargins'],
  expected: NonNullable<WriterPageSetupConfig['customMargins']>,
): void {
  expect(actual).toBeDefined();
  expect(actual?.top).toBeCloseTo(expected.top, 1);
  expect(actual?.bottom).toBeCloseTo(expected.bottom, 1);
  expect(actual?.left).toBeCloseTo(expected.left, 1);
  expect(actual?.right).toBeCloseTo(expected.right, 1);
  expect(actual?.gutter).toBeCloseTo(expected.gutter ?? 0, 1);
}

describe('Writer page-margin contract', () => {
  it('uses one canonical geometry for every preset and ignores stale custom values', () => {
    for (const marginPreset of ['normal', 'narrow', 'wide'] as const) {
      const definition = resolveWriterMarginDefinitionMm(setup({
        margins: marginPreset,
        customMargins: { top: 99, bottom: 98, left: 97, right: 96, gutter: 12 },
      }));
      expect(definition).toMatchObject({
        ...WRITER_MARGIN_PRESETS_MM[marginPreset],
        gutter: 0,
        mirrored: false,
      });
    }
  });

  it('adds a custom binding gutter to the left edge on ordinary pages', () => {
    const config = setup({
      margins: 'custom',
      customMargins: { top: 17, bottom: 19, left: 21, right: 23, gutter: 7 },
    });
    const first = resolveWriterPhysicalPageMarginsMm(config, 1);
    const second = resolveWriterPhysicalPageMarginsMm(config, 2);

    expect(first).toMatchObject({ top: 17, bottom: 19, left: 28, right: 23, mirrored: false });
    expect(second).toMatchObject({ left: 28, right: 23, mirrored: false });
    expect(getMarginPadding(config, 1)).toMatchObject({
      paddingTop: '17mm',
      paddingBottom: '19mm',
      paddingLeft: '28mm',
      paddingRight: '23mm',
    });
  });

  it('swaps inside/outside edges on facing pages while preserving body width', () => {
    const config = setup({
      margins: 'mirrored',
      mirroredMargins: true,
      customMargins: { top: 18, bottom: 20, left: 32, right: 17, gutter: 8 },
    });
    const odd = resolveWriterPhysicalPageMarginsMm(config, 1);
    const even = resolveWriterPhysicalPageMarginsMm(config, 2);
    const oddGeometry = getWriterPageGeometry(config, 1);
    const evenGeometry = getWriterPageGeometry(config, 2);

    expect(odd).toMatchObject({ left: 40, right: 17, pageSide: 'right', mirrored: true });
    expect(even).toMatchObject({ left: 17, right: 40, pageSide: 'left', mirrored: true });
    expect(evenGeometry.bodyWidthPx).toBeCloseTo(oddGeometry.bodyWidthPx, 8);
    expect(evenGeometry.marginsPx.left).toBeCloseTo(oddGeometry.marginsPx.right, 8);
    expect(evenGeometry.marginsPx.right).toBeCloseTo(oddGeometry.marginsPx.left, 8);
  });

  it('rejects finite margins that consume the usable sheet', () => {
    const invalid = setup({
      paperSize: 'A6',
      margins: 'custom',
      customMargins: { top: 20, bottom: 20, left: 50, right: 40, gutter: 10 },
    });
    expect(validateWriterPageSetup(invalid)).toMatch(/10 mm nutzbare Seitenbreite/u);
  });

  it('places odd/even PDF content on mirrored physical edges and declares duplex viewing', () => {
    const config = setup({
      margins: 'mirrored',
      mirroredMargins: true,
      customMargins: { top: 18, bottom: 20, left: 32, right: 17, gutter: 8 },
    });
    const pdf = new TextDecoder().decode(buildWriterPdf(
      'Facing pages',
      [paragraph('odd', 'Odd page'), paragraph('even', 'Even page', true)],
      config,
    ));
    const oddX = Number(/1 0 0 1 ([0-9.]+) [0-9.]+ Tm\n\(Odd page\) Tj/u.exec(pdf)?.[1]);
    const evenX = Number(/1 0 0 1 ([0-9.]+) [0-9.]+ Tm\n\(Even page\) Tj/u.exec(pdf)?.[1]);

    expect(oddX).toBeCloseTo(millimetersToPoints(40), 1);
    expect(evenX).toBeCloseTo(millimetersToPoints(17), 1);
    expect(writerPageGeometry(config, 2).margins.left).toBeCloseTo(millimetersToPoints(17), 5);
    expect(pdf).toContain('/PageLayout /TwoPageRight');
    expect(pdf).toContain('/Duplex /DuplexFlipLongEdge');
  });

  it('round-trips custom mirrored margins and gutter through a real DOCX package', async () => {
    const config = setup({
      margins: 'mirrored',
      mirroredMargins: true,
      customMargins: { top: 18.5, bottom: 22.25, left: 32.75, right: 17.5, gutter: 9.25 },
    });
    const bytes = exportDocx(documentWithSetup(config));
    const entries = await readZip(bytes);
    const documentXml = decodeUtf8(entries.get('word/document.xml') ?? new Uint8Array());
    const settingsXml = decodeUtf8(entries.get('word/settings.xml') ?? new Uint8Array());
    const restored = await importDocx(bytes, 'mirrored.docx');
    const restoredSetup = restored.writerData?.pageSetup;

    expect(settingsXml).toContain('<w:mirrorMargins/>');
    expect(documentXml).toContain(`w:left="${millimetersToTwips(32.75)}"`);
    expect(documentXml).toContain(`w:right="${millimetersToTwips(17.5)}"`);
    expect(documentXml).toContain(`w:gutter="${millimetersToTwips(9.25)}"`);
    expect(restoredSetup?.margins).toBe('mirrored');
    expect(restoredSetup?.mirroredMargins).toBe(true);
    expectMarginsClose(restoredSetup?.customMargins, config.customMargins!);
  });

  it('round-trips non-mirrored custom margins instead of collapsing them to normal', async () => {
    const config = setup({
      margins: 'custom',
      customMargins: { top: 13.25, bottom: 27.5, left: 19.75, right: 31.5, gutter: 4.25 },
    });
    const restored = await importDocx(exportDocx(documentWithSetup(config)), 'custom-margins.docx');

    expect(restored.writerData?.pageSetup.margins).toBe('custom');
    expect(restored.writerData?.pageSetup.mirroredMargins).toBeUndefined();
    expectMarginsClose(restored.writerData?.pageSetup.customMargins, config.customMargins!);
  });
});
