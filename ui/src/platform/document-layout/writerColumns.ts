// STATUS: PLATIN — Canonical Writer multi-column geometry
import type { WriterPageSetupConfig } from '../../shared/contracts/workspace';

export const WRITER_MIN_COLUMN_WIDTH_MM = 5;
export const WRITER_MAX_COLUMN_GAP_MM = 100;
export const WRITER_DEFAULT_COLUMN_GAP_MM = 10;
export const WRITER_MAX_COLUMNS = 4;

export interface WriterColumnLayoutMm {
  count: 1 | 2 | 3 | 4;
  gap: number;
  widths: number[];
  customWidths: boolean;
  occupiedWidth: number;
  remainingWidth: number;
}

function clampColumnCount(value: number | undefined): 1 | 2 | 3 | 4 {
  const count = Number.isFinite(value) ? Math.trunc(value ?? 1) : 1;
  return Math.min(WRITER_MAX_COLUMNS, Math.max(1, count)) as 1 | 2 | 3 | 4;
}

export function equalWriterColumnWidthsMm(
  bodyWidthMm: number,
  count: 1 | 2 | 3 | 4,
  gapMm: number,
): number[] {
  const usable = Math.max(0, bodyWidthMm - gapMm * (count - 1));
  const width = usable / count;
  return Array.from({ length: count }, () => width);
}

export function resolveWriterColumnLayoutMm(
  pageSetup: Pick<WriterPageSetupConfig, 'columns' | 'columnGapMm' | 'columnWidthsMm'>,
  bodyWidthMm: number,
): WriterColumnLayoutMm {
  const count = clampColumnCount(pageSetup.columns);
  const rawGap = pageSetup.columnGapMm ?? WRITER_DEFAULT_COLUMN_GAP_MM;
  const gap = Number.isFinite(rawGap) ? Math.max(0, rawGap) : WRITER_DEFAULT_COLUMN_GAP_MM;
  const customWidths = Array.isArray(pageSetup.columnWidthsMm) && pageSetup.columnWidthsMm.length === count;
  const widths = customWidths
    ? pageSetup.columnWidthsMm!.map((width) => width)
    : equalWriterColumnWidthsMm(bodyWidthMm, count, gap);
  const occupiedWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (count - 1);

  return {
    count,
    gap,
    widths,
    customWidths,
    occupiedWidth,
    remainingWidth: bodyWidthMm - occupiedWidth,
  };
}

export function validateWriterColumnLayoutMm(
  pageSetup: Pick<WriterPageSetupConfig, 'columns' | 'columnGapMm' | 'columnWidthsMm'>,
  bodyWidthMm: number,
): string | null {
  const count = pageSetup.columns ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > WRITER_MAX_COLUMNS) {
    return 'Die Spaltenanzahl muss zwischen eins und vier liegen.';
  }
  const gap = pageSetup.columnGapMm ?? WRITER_DEFAULT_COLUMN_GAP_MM;
  if (!Number.isFinite(gap) || gap < 0 || gap > WRITER_MAX_COLUMN_GAP_MM) {
    return 'Der Spaltenabstand muss zwischen 0 und 100 mm liegen.';
  }
  if (bodyWidthMm - gap * (count - 1) < count * WRITER_MIN_COLUMN_WIDTH_MM) {
    return 'Spalten und Abstände müssen jeder Spalte mindestens 5 mm nutzbare Breite lassen.';
  }
  if (pageSetup.columnWidthsMm === undefined) return null;
  if (
    !Array.isArray(pageSetup.columnWidthsMm) ||
    pageSetup.columnWidthsMm.length !== count ||
    pageSetup.columnWidthsMm.some((width) =>
      !Number.isFinite(width) || width < WRITER_MIN_COLUMN_WIDTH_MM || width > 1_000)
  ) {
    return `Individuelle Spaltenbreiten benötigen exakt ${count} Werte zwischen 5 und 1.000 mm.`;
  }
  const occupied = pageSetup.columnWidthsMm.reduce((sum, width) => sum + width, 0) + gap * (count - 1);
  if (Math.abs(occupied - bodyWidthMm) > 0.25) {
    return 'Individuelle Spaltenbreiten und Abstände müssen die nutzbare Seitenbreite vollständig ausfüllen.';
  }
  return null;
}
