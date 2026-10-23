// STATUS: DIAMANT VGT SUPREME — one geometry model for view, print and export
import type { RenderMargins, RenderPageGeometry } from './renderTypes';

export const CSS_PX_PER_INCH = 96;
export const POINTS_PER_INCH = 72;
export const MM_PER_INCH = 25.4;
export const CSS_PX_PER_MM = CSS_PX_PER_INCH / MM_PER_INCH;
export const CSS_PX_PER_POINT = CSS_PX_PER_INCH / POINTS_PER_INCH;
export const POINTS_PER_MM = POINTS_PER_INCH / MM_PER_INCH;

export type RenderUnit = 'mm' | 'pt' | 'px';

export interface ResolvePageGeometryInput {
  widthMm: number;
  heightMm: number;
  marginsMm: RenderMargins;
  columnWidthsMm?: readonly number[];
  columnGapMm?: number;
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`render_geometry_invalid_${label}`);
  return value;
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`render_geometry_invalid_${label}`);
  return value;
}

export function convertRenderUnit(value: number, from: RenderUnit, to: RenderUnit): number {
  if (!Number.isFinite(value)) throw new Error('render_geometry_non_finite_unit');
  if (from === to) return value;
  const mm = from === 'mm' ? value : from === 'pt' ? value / POINTS_PER_MM : value / CSS_PX_PER_MM;
  return to === 'mm' ? mm : to === 'pt' ? mm * POINTS_PER_MM : mm * CSS_PX_PER_MM;
}

export function resolveCanonicalPageGeometry(
  input: ResolvePageGeometryInput,
  unit: RenderUnit,
): RenderPageGeometry {
  const widthMm = finitePositive(input.widthMm, 'width');
  const heightMm = finitePositive(input.heightMm, 'height');
  const marginsMm = {
    top: finiteNonNegative(input.marginsMm.top, 'margin_top'),
    right: finiteNonNegative(input.marginsMm.right, 'margin_right'),
    bottom: finiteNonNegative(input.marginsMm.bottom, 'margin_bottom'),
    left: finiteNonNegative(input.marginsMm.left, 'margin_left'),
  };
  if (marginsMm.left + marginsMm.right >= widthMm || marginsMm.top + marginsMm.bottom >= heightMm) {
    throw new Error('render_geometry_margins_exceed_page');
  }
  const bodyWidthMm = widthMm - marginsMm.left - marginsMm.right;
  const bodyHeightMm = heightMm - marginsMm.top - marginsMm.bottom;
  const gapMm = finiteNonNegative(input.columnGapMm ?? 0, 'column_gap');
  const sourceWidths = input.columnWidthsMm?.length ? [...input.columnWidthsMm] : [bodyWidthMm];
  if (sourceWidths.length > 64) throw new Error('render_geometry_column_limit');
  const widthsMm = sourceWidths.map((value, index) => finitePositive(value, `column_${index}`));
  const totalColumnsMm = widthsMm.reduce((sum, value) => sum + value, 0) + gapMm * Math.max(0, widthsMm.length - 1);
  if (totalColumnsMm > bodyWidthMm + 0.01) throw new Error('render_geometry_columns_exceed_body');
  const offsetsMm: number[] = [];
  let cursor = 0;
  for (const columnWidth of widthsMm) {
    offsetsMm.push(cursor);
    cursor += columnWidth + gapMm;
  }
  const c = (value: number) => convertRenderUnit(value, 'mm', unit);
  return {
    width: c(widthMm),
    height: c(heightMm),
    margins: { top: c(marginsMm.top), right: c(marginsMm.right), bottom: c(marginsMm.bottom), left: c(marginsMm.left) },
    bodyWidth: c(bodyWidthMm),
    bodyHeight: c(bodyHeightMm),
    columns: {
      count: widthsMm.length,
      gap: c(gapMm),
      widths: widthsMm.map(c),
      offsets: offsetsMm.map(c),
    },
  };
}

export function geometrySignature(geometry: RenderPageGeometry): string {
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return JSON.stringify({
    width: round(geometry.width), height: round(geometry.height),
    margins: Object.fromEntries(Object.entries(geometry.margins).map(([key, value]) => [key, round(value)])),
    bodyWidth: round(geometry.bodyWidth), bodyHeight: round(geometry.bodyHeight),
    columns: { count: geometry.columns.count, gap: round(geometry.columns.gap), widths: geometry.columns.widths.map(round), offsets: geometry.columns.offsets.map(round) },
  });
}
