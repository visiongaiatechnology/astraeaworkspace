// STATUS: DIAMANT VGT SUPREME — Sovereign Paginated Layout & Section Geometry Engine
import type { PageSetupConfig } from '../../../types';
import type { WriterPageNumberFormat } from '../../../../../shared/contracts/workspace';
import {
  resolveWriterPaperDimensionsMm,
  WRITER_STANDARD_PAPER_DIMENSIONS_MM,
} from '../../../../../platform/document-layout/writerPaperSizes';
import { CSS_PX_PER_MM, CSS_PX_PER_POINT, resolveCanonicalPageGeometry } from '../../../../../platform/rendering/index';
import { resolveWriterPhysicalPageMarginsMm } from '../../../../../platform/document-layout/writerPageMargins';
import { resolveWriterColumnLayoutMm } from '../../../../../platform/document-layout/writerColumns';
import { writerHeaderFooterHasAnyContent } from '../../../../../shared/writer/layout/headerFooter';

export const CSS_PIXELS_PER_MM = CSS_PX_PER_MM;
export const CSS_PIXELS_PER_POINT = CSS_PX_PER_POINT;
export const MINIMUM_LINE_HEIGHT_PX = 12;
export const DEFAULT_FONT_SIZE_PT = 11;
export const DEFAULT_CHARACTER_WIDTH_FACTOR = 0.52;

export const PAPER_DIMENSIONS_MM = WRITER_STANDARD_PAPER_DIMENSIONS_MM;

export interface PageMarginsMm {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface WriterFlowReservePoints {
  top: number;
  bottom: number;
}

export function resolveWriterFlowReservePoints(pageSetup: PageSetupConfig): WriterFlowReservePoints {
  const hasHeaderFooter = writerHeaderFooterHasAnyContent(pageSetup);
  return {
    top: hasHeaderFooter ? 38 : 22,
    bottom: hasHeaderFooter || pageSetup.showPageNumbers ? 34 : 18,
  };
}

export interface WriterPageGeometry {
  widthPx: number;
  heightPx: number;
  bodyWidthPx: number;
  bodyHeightPx: number;
  columnWidthPx: number;
  columnCount: number;
  columnGapPx: number;
  columnWidthsPx?: number[];
  marginsPx: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export function formatWriterPageNumber(
  pageNumber: number,
  format?: WriterPageNumberFormat,
  chapterPrefix?: string,
): string {
  const num = Math.max(1, Math.floor(pageNumber));
  let formatted: string;

  switch (format) {
    case 'roman':
    case 'roman-upper':
      formatted = toRomanNumeral(num, true);
      break;
    case 'roman-lower':
      formatted = toRomanNumeral(num, false);
      break;
    case 'alpha':
    case 'alpha-upper':
      formatted = toAlphaNumber(num, true);
      break;
    case 'alpha-lower':
      formatted = toAlphaNumber(num, false);
      break;
    case 'arabic':
    default:
      formatted = String(num);
      break;
  }

  if (chapterPrefix && chapterPrefix.trim().length > 0) {
    return `${chapterPrefix.trim()}-${formatted}`;
  }
  return formatted;
}

export function toRomanNumeral(num: number, upper: boolean): string {
  const romanLookup: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = num;
  let result = '';
  for (const [val, roman] of romanLookup) {
    while (n >= val) {
      result += roman;
      n -= val;
    }
  }
  return upper ? result : result.toLowerCase();
}

export function toAlphaNumber(num: number, upper: boolean): string {
  let n = num;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return upper ? result : result.toLowerCase();
}

export function getMargins(pageSetup: PageSetupConfig, pageIndex = 1): PageMarginsMm {
  const margins = resolveWriterPhysicalPageMarginsMm(pageSetup, pageIndex);
  return {
    top: margins.top,
    bottom: margins.bottom,
    left: margins.left,
    right: margins.right,
  };
}

export function getWriterPageGeometry(pageSetup: PageSetupConfig, pageIndex = 1): WriterPageGeometry {
  const dimensions = resolveWriterPaperDimensionsMm(pageSetup);
  const oriented = pageSetup.orientation === 'landscape'
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
  const margins = getMargins(pageSetup, pageIndex);
  const bodyWidthMm = oriented.width - margins.left - margins.right;
  const columnLayout = resolveWriterColumnLayoutMm(pageSetup, bodyWidthMm);
  const canonical = resolveCanonicalPageGeometry({
    widthMm: oriented.width,
    heightMm: oriented.height,
    marginsMm: margins,
    columnWidthsMm: columnLayout.widths,
    columnGapMm: columnLayout.gap,
  }, 'px');
  const flowReserve = resolveWriterFlowReservePoints(pageSetup);
  const bodyHeightPx = Math.max(1, canonical.bodyHeight - (flowReserve.top + flowReserve.bottom) * CSS_PIXELS_PER_POINT);
  return {
    widthPx: canonical.width,
    heightPx: canonical.height,
    bodyWidthPx: canonical.bodyWidth,
    bodyHeightPx,
    columnWidthPx: canonical.columns.widths[0] ?? canonical.bodyWidth,
    columnCount: canonical.columns.count,
    columnGapPx: canonical.columns.gap,
    columnWidthsPx: canonical.columns.widths,
    marginsPx: canonical.margins,
  };
}
