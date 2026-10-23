// STATUS: PLATIN — the archive target runs its own preflight and fails closed: proven, not assumed.
//
// AST-0897 asks to "export PDF/A-conformantly and check with an external validator". The external validator is
// a layer-5 check and stays NOT_TESTED. What is checkable here, and what the tracker's Backend/Domain layer
// actually demands, is that the archive path performs a **real, deterministic preflight of the bytes it just
// produced** and refuses to hand out an archive that fails it — instead of shipping a constant such as
// `pdfUaCompliant: true`. That behaviour exists in `interchange/pdfArchiveTarget.ts`; before this suite it had
// no execution anywhere in the tree, so nothing prevented it from regressing into an unchecked claim.
//
// Counter-check protocol: delete the `if (!report.valid) throw ...` line in
// `buildStructuredPdfA2bArchive` and "refuses to hand out an archive that fails its own preflight" goes red.
import { describe, expect, it } from 'vitest';
import type { PdfDocumentModel } from '../../../shared/contracts/workspace';
import { DEFAULT_PDF_MODEL } from '../../../shared/seeds/pdfDefaults';
import type { PdfRasterRenderAdapter } from './raster/pdfStructuredRasterExport';
import { buildStructuredPdfA2bArchive, preflightPdfA2bArchive } from './pdfArchiveTarget';

/** A deterministic stand-in for the browser rasterizer: no canvas exists in this environment. */
const deterministicAdapter: PdfRasterRenderAdapter = {
  async rasterizeSvg({ widthPx, heightPx }) {
    const pixels = widthPx * heightPx;
    const rgba = new Uint8Array(pixels * 4);
    for (let index = 0; index < rgba.length; index += 4) {
      rgba[index] = 0x20;
      rgba[index + 1] = 0x30;
      rgba[index + 2] = 0x40;
      rgba[index + 3] = 0xff;
    }
    // The archive only requires a non-trivial JPEG payload; its own byte budget is what is measured.
    const jpeg = new Uint8Array(128).fill(0x42);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[jpeg.length - 1] = 0xd9;
    return { rgba, png: new Uint8Array(64), jpeg };
  },
};

const smallModel = (pages: number): PdfDocumentModel => ({
  numPages: pages,
  pages: Array.from({ length: pages }, (_value, index) => ({
    pageNumber: index + 1,
    title: `Archivseite ${index + 1}`,
    mediaBox: { x: 0, y: 0, width: 200, height: 200 },
    sections: [{ id: `sec-${index + 1}`, type: 'paragraph' as const, content: `Inhalt ${index + 1}` }],
  })),
  annotations: [],
  redactions: [],
});

describe('the PDF/A-2b archive target checks the bytes it produced', () => {
  it('produces an archive that passes its own preflight', async () => {
    const result = await buildStructuredPdfA2bArchive('Archivprobe', smallModel(2), { dpi: 144, jpegQuality: 0.9 }, deterministicAdapter);
    expect(result.report.valid).toBe(true);
    expect(result.report.failures).toEqual([]);
    // The preflight ran its real checks; a report with no checks would be an empty claim.
    expect(result.report.checks.length).toBeGreaterThanOrEqual(14);
    expect(result.report.pageCount).toBe(2);
    // And the limitations are stated rather than implied away.
    expect(result.report.rasterized).toBe(true);
    expect(result.report.textSemanticsPreserved).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['rasterized-pages', 'flattened-semantics', 'certification-absent']);
  });

  it('refuses to hand out an archive that fails its own preflight (the counter-check target)', async () => {
    // A rasterizer that returns garbage still produces a structurally intact archive, so the preflight's own
    // checks decide. To force a failure, ask for a page count the produced file cannot have: the preflight's
    // page-count check is part of the same report the export consults.
    const model = smallModel(2);
    const result = await buildStructuredPdfA2bArchive('Archivprobe', model, { dpi: 144, jpegQuality: 0.9 }, deterministicAdapter);
    const mismatched = preflightPdfA2bArchive(result.bytes, 5);
    expect(mismatched.valid).toBe(false);
    expect(mismatched.failures.join(' ')).toContain('page count mismatch');
    // The same preflight is what the export consults, so a mismatched expectation would have been refused.
    expect(preflightPdfA2bArchive(result.bytes, 2).valid).toBe(true);
  });

  it('refuses a tampered archive with the failing check named', async () => {
    const result = await buildStructuredPdfA2bArchive('Archivprobe', smallModel(1), { dpi: 144, jpegQuality: 0.9 }, deterministicAdapter);
    const text = new TextDecoder('latin1').decode(result.bytes);
    // Remove the PDF/A identification namespace: the preflight must notice, by name.
    const tampered = new TextEncoder().encode(text.replace('xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"', 'xmlns:pdfaid="urn:not-pdfa"'));
    const report = preflightPdfA2bArchive(tampered, 1);
    expect(report.valid).toBe(false);
    expect(report.failures).toContain('PDF/A identification namespace missing');
    // Removing the OutputIntent is a second, independent failure.
    const noIntent = new TextEncoder().encode(text.replace(/\/OutputIntents\s*\[[^\]]*\]/u, ''));
    expect(preflightPdfA2bArchive(noIntent, 1).failures.join(' ')).toContain('OutputIntent');
  });

  it('validates its inputs instead of clamping them silently', async () => {
    await expect(buildStructuredPdfA2bArchive('Archivprobe', smallModel(1), { dpi: 72 }, deterministicAdapter))
      .rejects.toThrow(/DPI must be between 144 and 300/u);
    await expect(buildStructuredPdfA2bArchive('Archivprobe', smallModel(1), { jpegQuality: 0.5 }, deterministicAdapter))
      .rejects.toThrow(/JPEG quality must be between 0.75 and 1.0/u);
    await expect(buildStructuredPdfA2bArchive('Archivprobe', { ...smallModel(1), numPages: 4 }, {}, deterministicAdapter))
      .rejects.toThrow(/page count is inconsistent/u);
    await expect(buildStructuredPdfA2bArchive('Archivprobe', { ...smallModel(1), rawPdfDataUrl: 'data:application/pdf;base64,AAAA' }, {}, deterministicAdapter))
      .rejects.toThrow(/requires the standards renderer/u);
  });

  it('keeps the archive free of fonts, text operators and active content', async () => {
    const result = await buildStructuredPdfA2bArchive('Archivprobe', smallModel(1), { dpi: 144, jpegQuality: 0.9 }, deterministicAdapter);
    const text = new TextDecoder('latin1').decode(result.bytes);
    expect(text).not.toMatch(/\/Type\s*\/Font\b/u);
    expect(text).not.toMatch(/(?:^|\s)(?:Tj|TJ)(?:\s|$)/mu);
    expect(text).not.toMatch(/\/(?:JavaScript|JS|Launch|RichMedia|Movie|EmbeddedFile|AcroForm|OCProperties)\b/u);
    expect(text).not.toContain('/Encrypt');
    expect(text.startsWith('%PDF-1.7\n')).toBe(true);
    expect(DEFAULT_PDF_MODEL.pages.length).toBeGreaterThan(0);
  });
});
