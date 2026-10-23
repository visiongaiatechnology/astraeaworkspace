// STATUS: PLATIN — Writer paper-size cross-layer contract verification
import { describe, expect, it } from 'vitest';
import type {
  WorkspaceDocument,
  WriterPageSetupConfig,
  WriterPaperSize,
} from '../../../shared/contracts/workspace';
import { getWriterPageGeometry } from '../../../apps/writer/layout/pagination/geometry/writerPaginationGeometry';
import { writerPageGeometry } from '../../../apps/writer/interchange/export/pdf/writerPdfExport';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import {
  MILLIMETERS_PER_INCH,
  POINTS_PER_INCH,
  WRITER_STANDARD_PAPER_DIMENSIONS_MM,
} from '../../../platform/document-layout/writerPaperSizes';

const REQUIRED_STANDARD_SIZES = [
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'Letter',
  'Legal',
  'Executive',
] as const satisfies readonly Exclude<WriterPaperSize, 'Custom' | 'B4' | 'B5'>[];

function pageSetup(
  paperSize: WriterPaperSize,
  orientation: WriterPageSetupConfig['orientation'] = 'portrait',
  custom?: { width: number; height: number },
): WriterPageSetupConfig {
  return {
    paperSize,
    customWidthMm: custom?.width,
    customHeightMm: custom?.height,
    orientation,
    margins: 'normal',
    paperColor: 'white',
    showPageNumbers: true,
    headerText: '',
    footerText: '',
  };
}

function writerDocument(setup: WriterPageSetupConfig): WorkspaceDocument {
  return {
    schema_version: 1,
    id: `paper-${setup.paperSize}`,
    title: `Paper ${setup.paperSize}`,
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: ['text-root'],
    objects: {
      'text-root': {
        type: 'TextBlock',
        data: {
          id: 'text-root',
          paragraphs: [{
            id: 'paragraph-1',
            style: { alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
            spans: [{ text: 'Paper-size roundtrip' }],
          }],
        },
      },
    },
    writerData: { pageSetup: setup, tables: [] },
  };
}

function pointsToMillimeters(points: number): number {
  return points * MILLIMETERS_PER_INCH / POINTS_PER_INCH;
}

describe('Writer paper-size cross-layer contract', () => {
  it.each(REQUIRED_STANDARD_SIZES)(
    'uses the canonical %s dimensions in screen and PDF geometry',
    (paperSize) => {
      const expected = WRITER_STANDARD_PAPER_DIMENSIONS_MM[paperSize];
      const setup = pageSetup(paperSize);
      const screen = getWriterPageGeometry(setup);
      const pdf = writerPageGeometry(setup);

      expect(screen.widthPx * MILLIMETERS_PER_INCH / 96).toBeCloseTo(expected.width, 4);
      expect(screen.heightPx * MILLIMETERS_PER_INCH / 96).toBeCloseTo(expected.height, 4);
      expect(pointsToMillimeters(pdf.width)).toBeCloseTo(expected.width, 4);
      expect(pointsToMillimeters(pdf.height)).toBeCloseTo(expected.height, 4);
    },
  );

  it.each(REQUIRED_STANDARD_SIZES)(
    'round-trips %s through actual DOCX package page geometry',
    async (paperSize) => {
      const restored = await importDocx(
        exportDocx(writerDocument(pageSetup(paperSize, 'landscape'))),
        `${paperSize}.docx`,
      );

      expect(restored.writerData?.pageSetup.paperSize).toBe(paperSize);
      expect(restored.writerData?.pageSetup.orientation).toBe('landscape');
    },
  );

  it('preserves bounded custom dimensions across screen, PDF and DOCX', async () => {
    const setup = pageSetup('Custom', 'portrait', { width: 173.25, height: 287.5 });
    const screen = getWriterPageGeometry(setup);
    const pdf = writerPageGeometry(setup);
    const restored = await importDocx(exportDocx(writerDocument(setup)), 'custom.docx');

    expect(screen.widthPx * MILLIMETERS_PER_INCH / 96).toBeCloseTo(173.25, 4);
    expect(screen.heightPx * MILLIMETERS_PER_INCH / 96).toBeCloseTo(287.5, 4);
    expect(pointsToMillimeters(pdf.width)).toBeCloseTo(173.25, 4);
    expect(pointsToMillimeters(pdf.height)).toBeCloseTo(287.5, 4);
    expect(restored.writerData?.pageSetup.paperSize).toBe('Custom');
    expect(restored.writerData?.pageSetup.customWidthMm).toBeCloseTo(173.25, 1);
    expect(restored.writerData?.pageSetup.customHeightMm).toBeCloseTo(287.5, 1);
  });
});
