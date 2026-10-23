// STATUS: PLATIN — BATCH-INSIGHT-2: export must carry the numbers the user sees, and it must be
// bounded over user data.
//
// MEASURED FACTS before this batch:
//  - `exportRowsCsv` had no row or byte bound at all (`export/insightExportEngine.ts:8`), while the
//    XLSX path had a hard-coded 1_048_576 — two different limits for the same fact.
//  - `exportReportPdf` wrote only the dataset name, the page name and the visual titles, so the
//    exported "management report" contained none of the numbers the report showed.
//  - `exportRowsXlsx`, `exportReportPdf` and `exportReportPng` were reachable from no component.
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSIGHT_MODEL, type InsightRow } from '../domain/types';
import { InsightError } from '../core/insightCore';
import { INSIGHT_EXPORT_LIMITS, exportInsightChartSvg, exportInsightChartVectorPdf, exportReportPdf, exportRowsCsv, exportRowsXlsx, type InsightExportLimits } from '../export/insightExportEngine';
import { createInsightVisual } from '../visuals/insightVisualEngine';

const rows: InsightRow[] = [{ a: 1, b: 'x' }, { a: 2, b: 'y' }];
const limits = (over: Partial<InsightExportLimits>): InsightExportLimits => ({ ...INSIGHT_EXPORT_LIMITS, ...over });
const tiny = limits({ maxRows: 1, maxBytes: 64 });
const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('Insight export bounds', () => {
  it('uses one row limit for CSV and XLSX instead of two different numbers', () => {
    expect(INSIGHT_EXPORT_LIMITS.maxRows).toBe(1_048_576);
    expect(() => exportRowsCsv(rows, tiny)).toThrowError('export-row-limit');
    expect(() => exportRowsXlsx(rows, 'Data', tiny)).toThrowError('export-row-limit');
    expect(() => exportRowsCsv(rows)).not.toThrow();
  });

  it('names the byte limit instead of producing an unbounded buffer', () => {
    expect(() => exportRowsCsv(rows, limits({ maxRows:100, maxBytes:8 }))).toThrowError('export-byte-limit');
  });

  it('bounds the PDF by a named line limit instead of writing past the page', () => {
    expect(INSIGHT_EXPORT_LIMITS.maxPdfLines).toBe(40);
    expect(() => exportReportPdf(DEFAULT_INSIGHT_MODEL, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'])).toThrowError(InsightError);
    expect(() => exportReportPdf(DEFAULT_INSIGHT_MODEL, ['one line'])).not.toThrow();
  });
});

describe('Insight chart image export through the shared stack (package 19, "Bild")', () => {
  const visual = { ...createInsightVisual('column', 'q-main', 'Revenue by region', { x:0, y:0, width:560, height:320 }), encoding:{ category:'region', values:['revenue'], aggregation:'SUM' as const } };
  const model = structuredClone(DEFAULT_INSIGHT_MODEL);
  const records = structuredClone(DEFAULT_INSIGHT_MODEL.records);
  const context = { documentId:'insight-doc', cacheState:'stale' as const, revision:3 };

  it('writes a real SVG chart with the series values and the title', () => {
    const bytes = exportInsightChartSvg(visual, records, context, model);
    const svg = new TextDecoder().decode(bytes);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Revenue by region');
    // The numbers of the chart really are in the vector document (535000 for Europe-Central).
    expect(svg).toContain('535000');
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it('writes a real vector PDF chart only when the shared adapter can convert it, otherwise refuses by name', () => {
    // MEASURED (BATCH-INSIGHT-7 probe, 15 of 15 visual kinds): the shared vector-PDF adapter
    // (`shared/charts/export/chartVectorPdf.buildVectorChartPdf`) returns `null` for every chart the
    // shared SVG renderer produces, because `svgToPdfCommands` bails on that SVG. `shared/**` is not
    // this agent's ownership, so the honest behaviour is a named refusal - never an empty file - and the
    // SVG vector image is offered instead. This test pins both sides of that decision.
    const attempt = () => exportInsightChartVectorPdf(visual, records, context, model);
    let bytes: Uint8Array | null = null;
    try { bytes = attempt(); } catch (error) { expect(error).toBeInstanceOf(InsightError); expect((error as InsightError).code).toBe('insight-chart-pdf-unavailable'); }
    if (bytes) {
      const pdf = new TextDecoder('latin1').decode(bytes);
      expect(pdf.startsWith('%PDF-')).toBe(true);
      expect(pdf).toContain('%%EOF');
    }
    // Either way the SVG vector image is produced from the same numbers, so "Bild" is really delivered.
    const svg = new TextDecoder().decode(exportInsightChartSvg(visual, records, context, model));
    expect(svg).toContain('535000');
  });

  it('refuses a visual the shared stack cannot render, with a named code', () => {
    const unsupported = { ...visual, kind:'gauge' as const };
    expect(() => exportInsightChartSvg(unsupported, records, context, model)).toThrowError('insight-visual-kind-unsupported');
    expect(() => exportInsightChartVectorPdf(unsupported, records, context, model)).toThrowError('insight-visual-kind-unsupported');
    // A visual without a category is refused before anything is written.
    expect(() => exportInsightChartSvg({ ...visual, encoding:{ values:['revenue'] } }, records, context, model)).toThrowError('insight-visual-category-missing');
  });
});

describe('Insight PDF carries the projected numbers', () => {
  it('writes the summary lines the view computed into the document', () => {
    const bytes = exportReportPdf(DEFAULT_INSIGHT_MODEL, ['Total Operating Revenue: $947,000 (Q2 vs Q1 +19.7%)', 'Grand total: $947,000']);
    const document = text(bytes);
    expect(document.startsWith('%PDF-1.7')).toBe(true);
    expect(document).toContain('Total Operating Revenue: $947,000');
    expect(document).toContain('Q2 vs Q1');
    // Without a summary the artifact is only titles — which is what it used to be.
    expect(text(exportReportPdf(DEFAULT_INSIGHT_MODEL))).not.toContain('$947,000');
  });

  it('keeps the produced file a structurally valid PDF with the summary inside the content stream', () => {
    const bytes = exportReportPdf(DEFAULT_INSIGHT_MODEL, ['Sovereign revenue $947,000']);
    const document = text(bytes);
    expect(document).toContain('%%EOF');
    expect(document).toContain('/Length');
    expect(document.indexOf('Sovereign revenue')).toBeGreaterThan(document.indexOf('stream'));
  });
});
