// STATUS: DIAMANT VGT SUPREME — the archive says what it costs (W-299)
//
// W-299: a PDF/A-2b export rasterises every page, because PDF/A requires embedded fonts and no embeddable
// font is bundled (measured: the repository contains **no** font file at all). That trade-off is deliberate
// and stays. What was wrong is how it reached the user:
//
//   • the engine's warnings were matched **by array position** in the dialog
//     (`ARCHIVE_WARNING_COPY[index]`), so adding, removing or reordering a warning would show the wrong
//     sentence — and the engine's own text was discarded (`_warning`);
//   • the report carries `textSemanticsPreserved: false`, which is the consequence that matters, and the
//     dialog never displayed it;
//   • the "Fonts" tile said "none" in **success green**, directly above a warning that said the same thing
//     was a limitation.
//
// This file pins the engine side and the catalogue; the dialog's own wiring is pinned by the contract test
// next to it.
import { describe, expect, it } from 'vitest';
import type { PdfDocumentModel } from '../../../../shared/contracts/workspace';
import { buildStructuredPdfA2bArchive } from '../../interchange/pdfArchiveTarget';
// The adapter type lives with the raster layer; the archive target imports it but does not re-export it.
import type { PdfRasterRenderAdapter } from '../../interchange/raster/pdfStructuredRasterExport';

const rasterAdapter: PdfRasterRenderAdapter = {
  rasterizeSvg: async ({
    widthPx,
    heightPx,
  }: Parameters<PdfRasterRenderAdapter['rasterizeSvg']>[0]) => ({
    rgba: new Uint8Array(widthPx * heightPx * 4),
    png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    // The builder requires at least 64 bytes of JPEG (`frame.jpeg.byteLength < 64` is rejected) — a real
    // JPEG is never eleven bytes, and my first stub was. Measured from the validation, not guessed.
    jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0x2a), 0xff, 0xd9]),
  }),
};

const model = (): PdfDocumentModel => ({
  numPages: 1,
  pages: [
    {
      id: 'page-1',
      pageNumber: 1,
      width: 595,
      height: 842,
      images: [],
      sections: [{ id: 's1', type: 'header', content: 'Prüfbericht', box: { x: 40, y: 40, width: 500, height: 40 } }],
    },
  ],
  // The renderer reads these collections; a fixture without them fails inside the SVG builder with
  // `Cannot read properties of undefined (reading 'filter')` — measured, not guessed.
  annotations: [],
  forms: [],
  outlines: [],
} as unknown as PdfDocumentModel);

describe('the archive report states the consequence, not only the mechanism', () => {
  it('says that the text layer is gone', async () => {
    const result = await buildStructuredPdfA2bArchive('Prüfbericht', model(), { dpi: 144 }, rasterAdapter);
    // The engine always knew this — the field is part of the report type. It is what the dialog now shows.
    expect(result.report.rasterized).toBe(true);
    expect(result.report.textSemanticsPreserved).toBe(false);
  });

  it('produces a PDF the preflight accepts', async () => {
    const result = await buildStructuredPdfA2bArchive('Prüfbericht', model(), { dpi: 144 }, rasterAdapter);
    expect(result.report.valid).toBe(true);
    expect(new TextDecoder('latin1').decode(result.bytes.slice(0, 8))).toContain('%PDF-1.7');
    expect(new TextDecoder('utf8').decode(result.bytes)).toContain('xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"');
  });
});

describe('every warning carries a stable identity', () => {
  it('names the three consequences instead of leaving them to array positions', async () => {
    const result = await buildStructuredPdfA2bArchive('Prüfbericht', model(), { dpi: 144 }, rasterAdapter);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'rasterized-pages',
      'flattened-semantics',
      'certification-absent',
    ]);
    for (const warning of result.warnings) {
      // The engine's own sentence stays available — a code the dialog does not know can still be shown.
      expect(warning.detail.length).toBeGreaterThan(20);
    }
  });

  it('never ships an empty or duplicated identity', async () => {
    const result = await buildStructuredPdfA2bArchive('Prüfbericht', model(), { dpi: 144 }, rasterAdapter);
    const codes = result.warnings.map((warning) => warning.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => code.length > 0)).toBe(true);
  });
});
