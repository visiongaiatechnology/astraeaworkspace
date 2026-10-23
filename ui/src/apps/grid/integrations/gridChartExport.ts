// STATUS: DIAMANT VGT SUPREME
// Browser-local chart export. No network, no external rendering service.
//
// Release Beta 0.1 (export integrity): every format is delivered through `exportDelivery` — native
// save dialog + atomic write on the desktop, download-link fallback in the browser. A chart export
// never reports success before the file is confirmed.

import type { ChartObject } from '../../../shared/contracts/workspace';
import { buildPresentPdfFromJpegs } from '../../present/interchange/render/presentExport';
import { assertChartSourceRenderable, chooseChartExport } from '../../../shared/charts/chartEngine';
import { buildVectorChartPdf } from '../../../shared/charts/export/chartVectorPdf';
import { buildGridChartSvg } from '../../../shared/charts/chartSvgRenderer';
import {
  deliverExportBlob,
  deliverExportBytes,
  deliverExportText,
  type ExportDeliveryResult,
} from '../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';

const WIDTH = 1280;
const HEIGHT = 720;
/** Sample points beyond this ceiling are clipped by the chart model; the check keeps the intent explicit. */
const MAX_EXPORT_POINTS = 2_048;
const MAX_EXPORT_SERIES = 64;

function safeName(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 128) || 'chart';
}

/**
 * Fail-closed export preflight. Exporting a chart whose model is outside the bounded envelope would
 * either throw deep inside the SVG builder or produce a picture that does not match the sheet.
 *
 * **`W-450`, Weg 3:** die Ausfuhr befragt hier zusätzlich **denselben** Quellwächter wie die Leinwand.
 * Diese eine Stelle deckt **alle drei** Aufrufe des rohen Zeichners in dieser Datei — den Bau der
 * Zeichenkette in diesem Preflight selbst, `downloadGridChartSvg` und `renderChartCanvas` (PNG/JPEG) —,
 * weil beide Ausfuhrwege dieses Preflight bereits rufen.
 */
export function assertGridChartExportable(chart: ChartObject): void {
  if (!chart || typeof chart !== 'object') throw new Error('chart_export_invalid');
  if (!Array.isArray(chart.series) || chart.series.length === 0) throw new Error('chart_export_has_no_series');
  if (chart.series.length > MAX_EXPORT_SERIES) throw new Error('chart_export_series_limit');
  for (const series of chart.series) {
    if (!Array.isArray(series.values)) throw new Error('chart_export_invalid');
    if (series.values.length > MAX_EXPORT_POINTS) throw new Error('chart_export_point_limit');
    if (series.values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('chart_export_non_finite_value');
  }
  // Der Rückhalt wird **benannt** abgewiesen, statt still zu rasterisieren. Bewusst **nach** den
  // Hüllen-Prüfungen: ein `undefined` soll weiter `chart_export_invalid` heißen und nicht erst im
  // Modell zerbrechen.
  assertChartSourceRenderable(chart);
  const size = buildGridChartSvg(chart, WIDTH, HEIGHT);
  if (size.length === 0) throw new Error('chart_export_empty_svg');
}

function chartFileName(chart: ChartObject, extension: string): string {
  return `${safeName(chart.title)}.${extension}`;
}

export function downloadGridChartSvg(chart: ChartObject): Promise<ExportDeliveryResult> {
  assertGridChartExportable(chart);
  return deliverExportText(buildGridChartSvg(chart, WIDTH, HEIGHT), {
    suggestedName: chartFileName(chart, 'svg'),
    extensions: ['svg'],
    mimeType: 'image/svg+xml;charset=utf-8',
  });
}

async function renderChartCanvas(chart: ChartObject): Promise<HTMLCanvasElement> {
  assertGridChartExportable(chart);
  const svg = buildGridChartSvg(chart, WIDTH, HEIGHT);
  const url = URL.createObjectURL(new Blob([svg], { type:'image/svg+xml;charset=utf-8' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('chart_svg_rasterization_failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('chart_canvas_context_unavailable');
    context.drawImage(image, 0, 0, WIDTH, HEIGHT);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadGridChartPng(chart: ChartObject): Promise<ExportDeliveryResult> {
  const canvas = await renderChartCanvas(chart);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('chart_png_export_failed')), 'image/png'));
  return deliverExportBlob(blob, {
    suggestedName: chartFileName(chart, 'png'),
    extensions: ['png'],
    mimeType: 'image/png',
  });
}

async function chartJpeg(chart: ChartObject): Promise<string> {
  const canvas = await renderChartCanvas(chart);
  return canvas.toDataURL('image/jpeg', 0.94);
}

export async function downloadGridChartPdf(chart: ChartObject): Promise<ExportDeliveryResult> {
  const decision=chooseChartExport(chart,'pdf');
  const vector=decision.rasterFallbackRequired ? null : buildVectorChartPdf(chart);
  const bytes=vector ?? buildPresentPdfFromJpegs(chart.title,[await chartJpeg(chart)]);
  return deliverExportBytes(bytes, {
    suggestedName: chartFileName(chart, 'pdf'),
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
}

export function chartPdfExportMode(chart:ChartObject):'vector'|'high-dpi-raster-fallback'{
  const decision=chooseChartExport(chart,'pdf');
  return !decision.rasterFallbackRequired&&buildVectorChartPdf(chart)?'vector':'high-dpi-raster-fallback';
}
