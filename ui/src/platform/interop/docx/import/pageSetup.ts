// STATUS: PLATIN
import type { WriterPageSetupConfig, WriterPaperSize, WriterSectionBreakType } from '../../../../shared/contracts/workspace';
import { identifyWriterPaperSizeFromTwips, twipsToMillimeters } from '../../../document-layout/writerPaperSizes';
import { MAX_WRITER_WATERMARK_CHARACTERS } from '../../../../shared/writer/layout/pageDecorations';
import { blocks } from './xmlParsing';
import { ImportedHeaderFooter } from './headerFooter';
import { extractStartTags, readAttribute } from '../../../../shared/interoperability/xml';
function parsePageSetup(xml: string, settingsXml = ''): {
  paperSize: WriterPaperSize;
  orientation: 'portrait' | 'landscape';
  customWidthMm?: number;
  customHeightMm?: number;
  margins: 'normal' | 'narrow' | 'wide' | 'mirrored' | 'custom';
  customMargins?: { top: number; bottom: number; left: number; right: number; gutter: number };
  mirroredMargins?: boolean;
  columns?: 1 | 2 | 3 | 4;
  columnGapMm?: number;
  columnWidthsMm?: number[];
} {
  const pgSz = xml.match(/<(?:[A-Za-z_][\w.-]*:)?pgSz\b[^>]*>/)?.[0] ?? '';
  const width = Number(readAttribute(pgSz, 'w') ?? 11906);
  const height = Number(readAttribute(pgSz, 'h') ?? 16838);
  const orientation = readAttribute(pgSz, 'orient') === 'landscape' || width > height ? 'landscape' : 'portrait';
  const pgMar = xml.match(/<(?:[A-Za-z_][\w.-]*:)?pgMar\b[^>]*>/)?.[0] ?? '';
  const marginMm = (name: string, fallbackTwips: number): number => {
    const raw = Number(readAttribute(pgMar, name) ?? fallbackTwips);
    return Number(twipsToMillimeters(Number.isFinite(raw) ? raw : fallbackTwips).toFixed(2));
  };
  const top = marginMm('top', 1440);
  const bottom = marginMm('bottom', 1440);
  const left = marginMm('left', 1440);
  const right = marginMm('right', 1440);
  const gutter = marginMm('gutter', 0);
  const mirroredMargins = /<(?:[A-Za-z_][\w.-]*:)?mirrorMargins(?:\s[^>]*)?\/?\s*>/u.test(settingsXml);
  const closeTo = (actual: number, expected: number): boolean => Math.abs(actual - expected) <= 0.2;
  const matches = (expectedTop: number, expectedBottom: number, expectedLeft: number, expectedRight: number): boolean =>
    closeTo(top, expectedTop) && closeTo(bottom, expectedBottom) &&
    closeTo(left, expectedLeft) && closeTo(right, expectedRight) && closeTo(gutter, 0);
  const margins = mirroredMargins
    ? 'mirrored'
    : matches(25.4, 25.4, 25.4, 25.4)
      ? 'normal'
      : matches(12.7, 12.7, 12.7, 12.7)
        ? 'narrow'
        : matches(25.4, 25.4, 50.8, 50.8)
          ? 'wide'
          : 'custom';
  const customMargins = margins === 'custom' || margins === 'mirrored'
    ? { top, bottom, left, right, gutter }
    : undefined;
  const colsXml = xml.match(/<(?:[A-Za-z_][\w.-]*:)?cols\b[^>]*(?:\/\s*>|>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?cols\s*>)/u)?.[0] ?? '';
  const colsOpeningTag = colsXml.match(/^<[^>]+>/u)?.[0] ?? '';
  const rawColumnCount = Number(readAttribute(colsOpeningTag, 'num') ?? 1);
  const columns = Math.min(4, Math.max(1, Number.isInteger(rawColumnCount) ? rawColumnCount : 1)) as 1 | 2 | 3 | 4;
  const gapTwips = Number(readAttribute(colsOpeningTag, 'space') ?? 720);
  const columnGapMm = Number(twipsToMillimeters(Number.isFinite(gapTwips) ? gapTwips : 720).toFixed(2));
  const equalWidthValue = readAttribute(colsOpeningTag, 'equalWidth');
  const unequalColumns = equalWidthValue === '0' || equalWidthValue === 'false' || equalWidthValue === 'off';
  const columnTags = colsXml.match(/<(?:[A-Za-z_][\w.-]*:)?col\b[^>]*\/?\s*>/gu) ?? [];
  const columnWidthsMm = unequalColumns && columnTags.length === columns
    ? columnTags.map((tag) => {
        // GAP-0075 (round 371). This was the last of the 22 foreign-attribute reads in `ui/src/platform` without a
        // finiteness guard — the other 21 carry one, four of them added in rounds 368 and 370. `?? 0` catches a
        // MISSING attribute, not a damaged one: `Number('abc' ?? 0)` is `NaN`, `twipsToMillimeters(NaN)` is `NaN`,
        // `NaN.toFixed(2)` is the string `'NaN'` and `Number('NaN')` is `NaN` — which went straight into
        // `columnWidthsMm` on :74. `0` is the fallback this read already names.
        const widthTwipsRaw = Number(readAttribute(tag, 'w') ?? 0);
        const widthTwips = Number.isFinite(widthTwipsRaw) ? widthTwipsRaw : 0;
        return Number(twipsToMillimeters(widthTwips).toFixed(2));
      })
    : undefined;
  return {
    ...identifyWriterPaperSizeFromTwips(width, height),
    orientation,
    margins,
    customMargins,
    mirroredMargins: mirroredMargins || undefined,
    columns,
    columnGapMm,
    columnWidthsMm,
  };
}

export function parseSectionBreakType(sectionXml: string): WriterSectionBreakType {
  const typeTag = sectionXml.match(/<(?:[A-Za-z_][\w.-]*:)?type\b[^>]*\/?\s*>/u)?.[0] ?? '';
  const value = readAttribute(typeTag, 'val');
  if (value === 'continuous') return 'continuous';
  if (value === 'evenPage') return 'even-page';
  if (value === 'oddPage') return 'odd-page';
  return 'next-page';
}

export function parsePageNumberFormat(sectionXml: string): WriterPageSetupConfig['pageNumberFormat'] {
  const tag = extractStartTags(sectionXml, 'pgNumType')[0] ?? '';
  switch (readAttribute(tag, 'fmt')) {
    case 'upperRoman': return 'roman-upper';
    case 'lowerRoman': return 'roman-lower';
    case 'upperLetter': return 'alpha-upper';
    case 'lowerLetter': return 'alpha-lower';
    default: return 'arabic';
  }
}

export function parsePageNumberStart(sectionXml: string): number | undefined {
  const tag = extractStartTags(sectionXml, 'pgNumType')[0] ?? '';
  const start = Number(readAttribute(tag, 'start'));
  return Number.isInteger(start) && start >= 1 && start <= 9_999 ? start : undefined;
}

export function ooxmlHexColor(value: string | null): string | undefined {
  if (!value || !/^[0-9A-Fa-f]{6}$/u.test(value)) return undefined;
  return `#${value.toUpperCase()}`;
}

function importedPaperColor(color: string | undefined): Pick<WriterPageSetupConfig, 'paperColor' | 'backgroundColor'> {
  const normalized = color?.toUpperCase();
  if (normalized === '#FCF8F2') return { paperColor: 'cream' };
  if (normalized === '#0F121A') return { paperColor: 'dark' };
  if (!normalized || normalized === '#FFFFFF') return { paperColor: 'white' };
  return { paperColor: 'white', backgroundColor: normalized };
}

function parsePageDecorations(
  sectionXml: string,
  documentBackgroundColor: string | undefined,
): Pick<WriterPageSetupConfig, 'paperColor' | 'backgroundColor' | 'pageBorders' | 'watermark'> {
  const extension = extractStartTags(sectionXml, 'pageDecorations')[0] ?? '';
  const extensionBackground = ooxmlHexColor(readAttribute(extension, 'backgroundColor'));
  const borderContainer = blocks(sectionXml, 'pgBorders')[0] ?? '';
  const borderTag = extractStartTags(borderContainer, 'top')[0] ?? '';
  const wordBorderStyle = readAttribute(borderTag, 'val');
  const borderStyle: NonNullable<WriterPageSetupConfig['pageBorders']>['style'] | null = wordBorderStyle === 'dashed' || wordBorderStyle === 'dotted' || wordBorderStyle === 'double'
    ? wordBorderStyle
    : wordBorderStyle === 'single'
      ? 'solid'
      : null;
  // DEF-RE-009/010/013-018 class, first measured instance outside Writer (round 367). `readAttribute` returns the
  // raw attribute string for a **present** attribute, so `?? 0` does not fire for `w:sz="abc"`; `Number('abc')` is
  // `NaN`, and `Math.max(0, NaN)` / `Math.min(31, NaN)` are `NaN`. The branch below used to guard on
  // `Number.isFinite(borderSize)` — which reads `sz` — while its clamp reads `space`, so a document with a valid
  // `sz` and a non-numeric `space` reached the clamp and produced `paddingMm: NaN`. The two neighbours on `:27`
  // and `:56` already use this exact form; these two now do too.
  const borderSizeRaw = Number(readAttribute(borderTag, 'sz') ?? 0);
  const borderSize = Number.isFinite(borderSizeRaw) ? borderSizeRaw : 0;
  const borderSpacePtRaw = Number(readAttribute(borderTag, 'space') ?? 0);
  const borderSpacePt = Number.isFinite(borderSpacePtRaw) ? borderSpacePtRaw : 0;
  const borderColor = ooxmlHexColor(readAttribute(borderTag, 'color'));
  const extensionBorderStyleValue = readAttribute(extension, 'borderStyle');
  const extensionBorderStyle: NonNullable<WriterPageSetupConfig['pageBorders']>['style'] | null =
    extensionBorderStyleValue === 'solid' || extensionBorderStyleValue === 'dashed' || extensionBorderStyleValue === 'dotted' || extensionBorderStyleValue === 'double'
      ? extensionBorderStyleValue
      : null;
  const extensionBorderWidth = Number(readAttribute(extension, 'borderWidthPt'));
  const extensionBorderPadding = Number(readAttribute(extension, 'borderPaddingMm'));
  const extensionBorderColor = ooxmlHexColor(readAttribute(extension, 'borderColor'));
  const extensionPageBorders = extensionBorderStyle && extensionBorderColor &&
    Number.isFinite(extensionBorderWidth) && extensionBorderWidth >= 0 && extensionBorderWidth <= 36 &&
    Number.isFinite(extensionBorderPadding) && extensionBorderPadding >= 0 && extensionBorderPadding <= 50
    ? {
        style: extensionBorderStyle,
        widthPt: extensionBorderWidth,
        color: extensionBorderColor,
        paddingMm: extensionBorderPadding,
      }
    : undefined;
  const standardPageBorders = borderStyle && borderColor && Number.isFinite(borderSize) && borderSize >= 4 && borderSize <= 96
    ? {
        style: borderStyle,
        widthPt: borderSize / 8,
        color: borderColor,
        paddingMm: Number((Math.min(31, Math.max(0, borderSpacePt)) * 25.4 / 72).toFixed(2)),
      }
    : undefined;
  const watermarkEnabled = readAttribute(extension, 'watermarkEnabled');
  const watermarkText = readAttribute(extension, 'watermarkText') ?? '';
  const watermarkOpacity = Number(readAttribute(extension, 'watermarkOpacity') ?? 0.08);
  const watermarkRotation = Number(readAttribute(extension, 'watermarkRotation') ?? -45);
  const watermarkColor = ooxmlHexColor(readAttribute(extension, 'watermarkColor')) ?? '#94A3B8';
  // W-314: this used to be `watermarkText.slice(0, 120)` — a silent cut of the source file's text. It is now the
  // named bound `validateWriterPageDecorations` uses, and it refuses by name. (Measured: nothing else in the
  // import path bounds this string, and nothing told the user the text had been shortened.)
  if (watermarkText.length > MAX_WRITER_WATERMARK_CHARACTERS) {
    throw new Error(`DOCX watermark text exceeds the ${MAX_WRITER_WATERMARK_CHARACTERS}-character limit (${watermarkText.length} characters). Shorten it in the source document.`);
  }
  const watermark = watermarkEnabled !== null && Number.isFinite(watermarkOpacity) && Number.isFinite(watermarkRotation)
    ? {
        enabled: watermarkEnabled === '1' || watermarkEnabled === 'true',
        text: watermarkText,
        opacity: Math.min(0.3, Math.max(0.02, watermarkOpacity)),
        rotationDeg: Math.min(180, Math.max(-180, watermarkRotation)),
        color: watermarkColor,
      }
    : undefined;
  return {
    ...importedPaperColor(extensionBackground ?? documentBackgroundColor),
    pageBorders: extensionPageBorders ?? standardPageBorders,
    watermark,
  };
}

export function importedPageSetup(
  sectionXml: string,
  settingsXml: string,
  headerFooter: ImportedHeaderFooter,
  documentBackgroundColor?: string,
): WriterPageSetupConfig {
  const page = parsePageSetup(sectionXml, settingsXml);
  const pageNumberTag = extractStartTags(sectionXml, 'pgNumType')[0] ?? '';
  return {
    paperSize: page.paperSize,
    customWidthMm: page.customWidthMm,
    customHeightMm: page.customHeightMm,
    orientation: page.orientation,
    margins: page.margins,
    customMargins: page.customMargins,
    mirroredMargins: page.mirroredMargins,
    columns: page.columns,
    columnGapMm: page.columnGapMm,
    columnWidthsMm: page.columnWidthsMm,
    ...parsePageDecorations(sectionXml, documentBackgroundColor),
    showPageNumbers: headerFooter.hasPageNumberField,
    pageNumberFormat: parsePageNumberFormat(sectionXml),
    pageNumberPosition: headerFooter.pageNumberPosition,
    pageNumberStart: parsePageNumberStart(sectionXml),
    chapterNumbering: readAttribute(pageNumberTag, 'chapStyle') !== null || undefined,
    headerText: headerFooter.headerText,
    footerText: headerFooter.footerText,
    firstPageDifferent: headerFooter.firstPageDifferent,
    oddEvenDifferent: headerFooter.oddEvenDifferent,
    firstPageHeaderText: headerFooter.firstPageHeaderText,
    firstPageFooterText: headerFooter.firstPageFooterText,
    evenPageHeaderText: headerFooter.evenPageHeaderText,
    evenPageFooterText: headerFooter.evenPageFooterText,
    linkToPreviousHeader: headerFooter.linkToPreviousHeader,
    linkToPreviousFooter: headerFooter.linkToPreviousFooter,
  };
}
