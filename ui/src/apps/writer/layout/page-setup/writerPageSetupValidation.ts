// STATUS: PLATIN — Writer page geometry validation boundary
import type { WriterPageSetupConfig } from '../../../../shared/contracts/workspace';
import { validateWriterHeaderFooter } from '../../../../shared/writer/layout/headerFooter';
import { resolveWriterMarginDefinitionMm } from '../../../../platform/document-layout/writerPageMargins';
import { resolveWriterPaperDimensionsMm } from '../../../../platform/document-layout/writerPaperSizes';
import { validateWriterColumnLayoutMm } from '../../../../platform/document-layout/writerColumns';
import { validateWriterPageDecorations } from '../../../../shared/writer/layout/pageDecorations';

const MIN_CUSTOM_DIMENSION_MM = 25;
const MAX_CUSTOM_DIMENSION_MM = 2_000;
const MAX_MARGIN_MM = 200;
const MINIMUM_CONTENT_EXTENT_MM = 10;

function isFiniteWithin(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function validateWriterPageSetup(config: WriterPageSetupConfig): string | null {
  const headerFooterError = validateWriterHeaderFooter(config);
  if (headerFooterError) return headerFooterError;
  if (
    config.pageNumberStart !== undefined &&
    (!Number.isInteger(config.pageNumberStart) || config.pageNumberStart < 1 || config.pageNumberStart > 9_999)
  ) {
    return 'Der Seitennummern-Startwert muss eine ganze Zahl zwischen 1 und 9.999 sein.';
  }
  if (
    config.pageNumberFormat !== undefined &&
    !['arabic', 'roman', 'roman-upper', 'roman-lower', 'alpha', 'alpha-upper', 'alpha-lower'].includes(config.pageNumberFormat)
  ) {
    return 'Das Seitennummernformat ist ungültig.';
  }
  if (
    config.pageNumberPosition !== undefined &&
    !['footer-right', 'footer-center', 'footer-left', 'header-right', 'header-center', 'header-left'].includes(config.pageNumberPosition)
  ) {
    return 'Die Seitennummernposition ist ungültig.';
  }
  if (config.paperSize === 'Custom') {
    if (
      config.customWidthMm === undefined ||
      config.customHeightMm === undefined ||
      !isFiniteWithin(config.customWidthMm, MIN_CUSTOM_DIMENSION_MM, MAX_CUSTOM_DIMENSION_MM) ||
      !isFiniteWithin(config.customHeightMm, MIN_CUSTOM_DIMENSION_MM, MAX_CUSTOM_DIMENSION_MM)
    ) {
      return 'Benutzerdefinierte Seitenmaße müssen zwischen 25 und 2.000 mm liegen.';
    }
  }

  const decorationError = validateWriterPageDecorations(config);
  if (decorationError) return decorationError;

  if (config.customMargins) {
    const margins = [
      config.customMargins.top,
      config.customMargins.bottom,
      config.customMargins.left,
      config.customMargins.right,
      config.customMargins.gutter ?? 0,
    ];
    if (margins.some((value) => !isFiniteWithin(value, 0, MAX_MARGIN_MM))) {
      return 'Seitenränder und Bundsteg müssen zwischen 0 und 200 mm liegen.';
    }
  }

  const dimensions = resolveWriterPaperDimensionsMm(config);
  const pageWidthMm = config.orientation === 'landscape' ? dimensions.height : dimensions.width;
  const pageHeightMm = config.orientation === 'landscape' ? dimensions.width : dimensions.height;
  const margins = resolveWriterMarginDefinitionMm(config);
  if (margins.inside + margins.outside + margins.gutter > pageWidthMm - MINIMUM_CONTENT_EXTENT_MM) {
    return 'Innen-/Außenrand und Bundsteg müssen mindestens 10 mm nutzbare Seitenbreite lassen.';
  }
  if (margins.top + margins.bottom > pageHeightMm - MINIMUM_CONTENT_EXTENT_MM) {
    return 'Oberer und unterer Rand müssen mindestens 10 mm nutzbare Seitenhöhe lassen.';
  }

  const bodyWidthMm = pageWidthMm - margins.inside - margins.outside - margins.gutter;
  const columnError = validateWriterColumnLayoutMm(config, bodyWidthMm);
  if (columnError) return columnError;

  return null;
}
