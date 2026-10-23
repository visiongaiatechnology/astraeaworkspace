// STATUS: PLATIN — Canonical Writer paper-size geometry and OOXML conversion
import type { WriterPageSetupConfig, WriterPaperSize } from '../../shared/contracts/workspace';

export interface WriterPaperDimensionsMm {
  width: number;
  height: number;
}

export const MILLIMETERS_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;
export const TWIPS_PER_INCH = 1_440;

export const WRITER_STANDARD_PAPER_DIMENSIONS_MM: Readonly<
  Record<Exclude<WriterPaperSize, 'Custom'>, WriterPaperDimensionsMm>
> = Object.freeze({
  A0: { width: 841, height: 1189 },
  A1: { width: 594, height: 841 },
  A2: { width: 420, height: 594 },
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  A6: { width: 105, height: 148 },
  B4: { width: 250, height: 353 },
  B5: { width: 176, height: 250 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
  Executive: { width: 184.15, height: 266.7 },
});

const STANDARD_PAPER_ENTRIES = Object.entries(WRITER_STANDARD_PAPER_DIMENSIONS_MM) as Array<
  [Exclude<WriterPaperSize, 'Custom'>, WriterPaperDimensionsMm]
>;

export function millimetersToPoints(valueMm: number): number {
  return valueMm * POINTS_PER_INCH / MILLIMETERS_PER_INCH;
}

export function millimetersToTwips(valueMm: number): number {
  return Math.round(valueMm * TWIPS_PER_INCH / MILLIMETERS_PER_INCH);
}

export function twipsToMillimeters(valueTwips: number): number {
  return valueTwips * MILLIMETERS_PER_INCH / TWIPS_PER_INCH;
}

export function resolveWriterPaperDimensionsMm(
  setup: Pick<WriterPageSetupConfig, 'paperSize' | 'customWidthMm' | 'customHeightMm'>,
): WriterPaperDimensionsMm {
  if (setup.paperSize === 'Custom') {
    return {
      width: setup.customWidthMm ?? WRITER_STANDARD_PAPER_DIMENSIONS_MM.A4.width,
      height: setup.customHeightMm ?? WRITER_STANDARD_PAPER_DIMENSIONS_MM.A4.height,
    };
  }
  return WRITER_STANDARD_PAPER_DIMENSIONS_MM[setup.paperSize];
}

export interface ImportedWriterPaperSize {
  paperSize: WriterPaperSize;
  customWidthMm?: number;
  customHeightMm?: number;
}

export function identifyWriterPaperSizeFromTwips(
  widthTwips: number,
  heightTwips: number,
): ImportedWriterPaperSize {
  const shortTwips = Math.min(widthTwips, heightTwips);
  const longTwips = Math.max(widthTwips, heightTwips);
  const toleranceTwips = 12;

  for (const [paperSize, dimensions] of STANDARD_PAPER_ENTRIES) {
    const expectedShort = millimetersToTwips(Math.min(dimensions.width, dimensions.height));
    const expectedLong = millimetersToTwips(Math.max(dimensions.width, dimensions.height));
    if (
      Math.abs(shortTwips - expectedShort) <= toleranceTwips &&
      Math.abs(longTwips - expectedLong) <= toleranceTwips
    ) {
      return { paperSize };
    }
  }

  return {
    paperSize: 'Custom',
    customWidthMm: Number(twipsToMillimeters(shortTwips).toFixed(2)),
    customHeightMm: Number(twipsToMillimeters(longTwips).toFixed(2)),
  };
}
