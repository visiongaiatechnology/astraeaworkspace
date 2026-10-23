// STATUS: PLATIN
import type {
  Paragraph,
  WriterImageBlockData as ImageBlockData,
  WriterPageSetupConfig as PageSetupConfig,
  WriterSectionDefinition,
  WriterStyleDefinition,
  WriterTableBlockData as TableBlockData,
} from '../../../../../shared/contracts/workspace';
import { ensureWriterStyles, writerStyleForParagraph } from '../../../formatting/styles/writerStyles';
import { resolveWriterParagraphIndent } from '../../../formatting/paragraphs/writerParagraphIndent';
import { resolveWriterParagraphDecoration } from '../../../formatting/paragraphs/writerParagraphDecoration';
import {
  resolveWriterMarginDefinitionMm,
} from '../../../../../platform/document-layout/writerPageMargins';
import {
  validateWriterPageDecorations,
  writerPageDecorationSignature,
} from '../../../../../shared/writer/layout/pageDecorations';
import {
  resolveLinkedWriterHeaderFooterSetup,
  validateWriterHeaderFooter,
  writerHeaderFooterHasAnyContent,
} from '../../../../../shared/writer/layout/headerFooter';
import { resolveWriterFlowReservePoints } from '../../../layout/pagination/geometry/writerPaginationGeometry';
import { calculateMultilevelListOrdinal } from '../../../formatting/lists/writerMultilevelList';
import { calculateTextStatistics } from '../../../utils/writerUtils';
import type { WriterListTemplate } from '../../../../../shared/contracts/writer/workspaceWriterList';
import type { WriterPdfDocumentMetadata } from './writerPdfStructure';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../../../platform/rendering/documentPdfExport';



export interface WriterPdfRenderOptions {
  profile?: WriterPdfProfile;
  textRasterizer?: WriterPdfTextRasterizer;
  /**
   * The list template the document is numbered with.
   *
   * The screen resolves its markers through `calculateMultilevelListOrdinal` with the same
   * template; leaving it out uses the built-in default, which is what the screen does too.
   */
  listTemplate?: WriterListTemplate;
}

export interface WriterPdfPrintOptions {
  pageRange?: string;
  copies?: number;
  collate?: boolean;
  duplex?: 'none' | 'long-edge' | 'short-edge';
  scalePercent?: number;
}

export function resolveWriterPrintPageIndexes(pageCount: number, pageRange?: string): number[] {
  const count = Math.max(0, Math.trunc(pageCount));
  if (count === 0) return [];
  const input = pageRange?.trim();
  if (!input) return Array.from({ length: count }, (_, index) => index);
  if (input.length > 256) throw new Error('Seitenbereich ist zu lang.');
  const selected = new Set<number>();
  for (const token of input.split(',')) {
    const part = token.trim();
    if (!part) throw new Error('Ungültiger leerer Seitenbereich.');
    const range = part.match(/^(\d{1,5})(?:-(\d{1,5}))?$/u);
    if (!range) throw new Error(`Ungültiger Seitenbereich: ${part}`);
    const start = Number(range[1]);
    const end = Number(range[2] ?? range[1]);
    if (start < 1 || end < start || end > count) throw new Error(`Seitenbereich außerhalb 1-${count}: ${part}`);
    for (let page = start; page <= end; page += 1) selected.add(page - 1);
    if (selected.size > 2048) throw new Error('Seitenbereich überschreitet 2048 Seiten.');
  }
  return [...selected].sort((left, right) => left - right);
}

import {
  bytesToHex, paragraphToLines, 
  plainPdfLayout, tableLines, writerPageGeometry, type PdfPageModel, type PdfTextLine,
} from './writerPdfLayoutPrimitives';
import { decodeWriterPdfImage } from './writerPdfImageSupport';
export { writerPageGeometry };
import { assembleWriterPdf } from './writerPdfAssembly';
import { createBrowserWriterPdfTextRasterizer, type WriterPdfTextRasterizer } from './writerPdfTextRaster';
import type { WriterPdfProfile } from './writerPdfFontPolicy';

export function buildWriterPdf(
  title: string,
  paragraphs: Paragraph[],
  config: PageSetupConfig,
  tables: TableBlockData[] = [],
  images: ImageBlockData[] = [],
  styleDefinitions?: WriterStyleDefinition[],
  sections: WriterSectionDefinition[] = [],
  printOptions: WriterPdfPrintOptions = {},
  documentMetadata: WriterPdfDocumentMetadata = {},
  renderOptions: WriterPdfRenderOptions = {},
): Uint8Array {
  const profile: WriterPdfProfile = renderOptions.profile ?? 'standard';
  const textRasterizer = renderOptions.textRasterizer ?? createBrowserWriterPdfTextRasterizer();
  for (const setup of [config, ...sections.map((section) => section.pageSetup)]) {
    const decorationError = validateWriterPageDecorations(setup);
    if (decorationError) throw new Error(`Invalid Writer page decoration: ${decorationError}`);
    const headerFooterError = validateWriterHeaderFooter(setup);
    if (headerFooterError) throw new Error(`Invalid Writer header/footer: ${headerFooterError}`);
  }
  const styles = ensureWriterStyles(styleDefinitions);
  const paragraphIndexes = new Map(paragraphs.map((paragraph, index) => [paragraph.id, index]));
  const usedSectionStarts = new Set<number>();
  const sectionByStartIndex = new Map<number, WriterSectionDefinition>();
  let previousSectionSetup: PageSetupConfig | undefined;
  if (!sections.some((section) => paragraphIndexes.get(section.startParagraphId) === 0)) {
    previousSectionSetup = config;
  }
  sections
    .map((section) => ({ section, startIndex: paragraphIndexes.get(section.startParagraphId) }))
    .filter((entry): entry is { section: WriterSectionDefinition; startIndex: number } =>
      entry.startIndex !== undefined,
    )
    .sort((left, right) => left.startIndex - right.startIndex)
    .forEach(({ section, startIndex }) => {
      if (usedSectionStarts.has(startIndex)) return;
      usedSectionStarts.add(startIndex);
      const effectiveSetup = resolveLinkedWriterHeaderFooterSetup(section.pageSetup, previousSectionSetup);
      previousSectionSetup = effectiveSetup;
      sectionByStartIndex.set(startIndex, { ...section, pageSetup: effectiveSetup });
    });
  let activeConfig = sectionByStartIndex.get(0)?.pageSetup ?? config;
  let activeGeometry = writerPageGeometry(activeConfig, 1);
  let height = activeGeometry.height;
  let margins = activeGeometry.margins;
  let columns = activeGeometry.columns;
  let narrowestColumnWidth = Math.min(...columns.widths);
  let top = height - margins.top - (writerHeaderFooterHasAnyContent(activeConfig) ? 38 : 22);
  let bottom = margins.bottom + (writerHeaderFooterHasAnyContent(activeConfig) || activeConfig.showPageNumbers ? 34 : 18);

  const objects: string[] = [];
  const addObject = (body: string) => { objects.push(body); return objects.length; };
  const facingPages = [config, ...sections.map((section) => section.pageSetup)]
    .some((pageConfig) => resolveWriterMarginDefinitionMm(pageConfig).mirrored);
  const duplex = printOptions.duplex ?? (facingPages ? 'long-edge' : 'none');
  const duplexPreference = duplex === 'long-edge'
    ? '/DuplexFlipLongEdge'
    : duplex === 'short-edge'
      ? '/DuplexFlipShortEdge'
      : '/Simplex';
  const catalogId = addObject('');
  const pagesId = addObject('');
  const regularFontId = profile === 'pdfa-2b' ? 0 : addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const boldFontId = profile === 'pdfa-2b' ? 0 : addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const italicFontId = profile === 'pdfa-2b' ? 0 : addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  const boldItalicFontId = profile === 'pdfa-2b' ? 0 : addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>');

  const imageResources = new Map<string, { image: ImageBlockData; objectId: number; resourceName: string }>();
  images.forEach((image, index) => {
    /**
     * WR-043 — PNG is embedded by passthrough instead of being dropped.
     *
     * `decodeJpegDataUrl` understood JPEG only, while the import produces PNG for every PNG and
     * WebP source: those images were visible on screen and simply missing from the PDF. The PNG
     * `IDAT` stream is a zlib stream, and PDF's `/Predictor 15` is defined as the PNG row
     * filters, so the bytes can be reused unchanged. WebP, interlaced PNG and RGBA PNG are
     * reported by `analyzeWriterPdfImageSupport` — the surface warns instead of staying silent.
     */
    const source = decodeWriterPdfImage(image.dataUrl);
    if (source.kind === 'unsupported') return;
    if (source.kind === 'jpeg') {
      if (image.intrinsicWidth <= 0 || image.intrinsicHeight <= 0) return;
      const hex = `${bytesToHex(source.bytes)}>`;
      const body = `<< /Type /XObject /Subtype /Image /Width ${Math.round(image.intrinsicWidth)} /Height ${Math.round(image.intrinsicHeight)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length} >>\nstream\n${hex}\nendstream`;
      imageResources.set(image.id, { image, objectId: addObject(body), resourceName: `Im${index + 1}` });
      return;
    }
    const hex = `${bytesToHex(source.idat)}>`;
    const colorSpace = source.colorSpace === 'indexed'
      ? `[/Indexed /DeviceRGB ${Math.max(0, Math.floor((source.palette?.length ?? 3) / 3) - 1)} <${bytesToHex(source.palette ?? new Uint8Array([0, 0, 0]))}>]`
      : source.colorSpace;
    const body = `<< /Type /XObject /Subtype /Image /Width ${source.widthPx} /Height ${source.heightPx} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter [/ASCIIHexDecode /FlateDecode] /DecodeParms [null << /Predictor 15 /Colors ${source.colors} /BitsPerComponent 8 /Columns ${source.widthPx} >>] /Length ${hex.length} >>\nstream\n${hex}\nendstream`;
    imageResources.set(image.id, { image, objectId: addObject(body), resourceName: `Im${index + 1}` });
  });

  const pageModels: PdfPageModel[] = [];
  let activeSectionPageIndex = 1;
  let nextDisplayPageNumber = activeConfig.pageNumberStart ?? 1;
  let activeChapterNumber = 1;
  const emptyPage = (): PdfPageModel => ({
    lines: [],
    images: [],
    decorations: [],
    config: activeConfig,
    sectionPageIndex: activeSectionPageIndex,
    displayPageNumber: nextDisplayPageNumber,
    chapterNumber: activeChapterNumber,
  });
  let page: PdfPageModel = emptyPage();
  let cursorY = top;
  let currentColumnIndex = 0;
  const currentColumnWidth = (): number => columns.widths[currentColumnIndex] ?? narrowestColumnWidth;
  const currentColumnX = (): number => columns.offsets[currentColumnIndex] ?? 0;
  const hasContent = () =>
    page.lines.length > 0 || page.images.length > 0 || page.decorations.length > 0;
  const hasColumnContent = () => cursorY < top;
  const applyPageGeometry = (
    nextConfig: PageSetupConfig,
    pageIndex: number,
    preserveCursor: boolean,
  ): void => {
    const previousCursor = cursorY;
    activeConfig = nextConfig;
    activeGeometry = writerPageGeometry(activeConfig, pageIndex);
    height = activeGeometry.height;
    margins = activeGeometry.margins;
    columns = activeGeometry.columns;
    narrowestColumnWidth = Math.min(...columns.widths);
    const flowReserve = resolveWriterFlowReservePoints(activeConfig);
    top = height - margins.top - flowReserve.top;
    bottom = margins.bottom + flowReserve.bottom;
    cursorY = preserveCursor ? Math.min(previousCursor, top) : top;
    currentColumnIndex = 0;
  };
  const pushPage = (force = false) => {
    if (!force && !hasContent()) return;
    pageModels.push(page);
    nextDisplayPageNumber = page.displayPageNumber + 1;
    applyPageGeometry(activeConfig, pageModels.length + 1, false);
    activeSectionPageIndex += 1;
    page = emptyPage();
  };
  const samePhysicalPageShell = (left: PageSetupConfig, right: PageSetupConfig): boolean => {
    const physicalPageIndex = pageModels.length + 1;
    const leftGeometry = writerPageGeometry(left, physicalPageIndex);
    const rightGeometry = writerPageGeometry(right, physicalPageIndex);
    return Math.abs(leftGeometry.width - rightGeometry.width) < 0.5 &&
      Math.abs(leftGeometry.height - rightGeometry.height) < 0.5 &&
      Math.abs(leftGeometry.margins.top - rightGeometry.margins.top) < 0.5 &&
      Math.abs(leftGeometry.margins.bottom - rightGeometry.margins.bottom) < 0.5 &&
      Math.abs(leftGeometry.margins.left - rightGeometry.margins.left) < 0.5 &&
      Math.abs(leftGeometry.margins.right - rightGeometry.margins.right) < 0.5 &&
      writerPageDecorationSignature(left) === writerPageDecorationSignature(right);
  };
  const beginSection = (section: WriterSectionDefinition): void => {
    const breakType = section.breakType ?? 'next-page';
    if (
      breakType === 'continuous' &&
      section.restartPageNumberAt === undefined &&
      hasContent() &&
      samePhysicalPageShell(activeConfig, section.pageSetup) &&
      cursorY - bottom >= 24
    ) {
      applyPageGeometry(section.pageSetup, pageModels.length + 1, true);
      activeSectionPageIndex = 1;
      activeChapterNumber += 1;
      return;
    }
    if (hasContent()) pushPage();
    if (breakType === 'even-page' || breakType === 'odd-page') {
      const requiredParity = breakType === 'even-page' ? 0 : 1;
      if ((pageModels.length + 1) % 2 !== requiredParity) pushPage(true);
    }
    applyPageGeometry(section.pageSetup, pageModels.length + 1, false);
    activeSectionPageIndex = 1;
    activeChapterNumber += 1;
    nextDisplayPageNumber = section.restartPageNumberAt ?? nextDisplayPageNumber;
    page = emptyPage();
  };
  const advanceColumn = () => {
    if (currentColumnIndex + 1 < columns.count) {
      currentColumnIndex += 1;
      cursorY = top;
    } else {
      if (hasContent()) pushPage();
    }
  };
  const ensureSpace = (heightNeeded: number) => {
    if (cursorY - heightNeeded < bottom && hasColumnContent()) advanceColumn();
  };
  const resolvedLineHeight = (line: PdfTextLine): number => line.lineHeight ?? line.fontSize * 1.25;
  const linePlacementHeight = (line: PdfTextLine): number =>
    line.before + resolvedLineHeight(line) + line.after;
  const remainingPageHeight = (): number => cursorY - bottom;
  const pageCapacity = top - bottom;
  const addLine = (line: PdfTextLine) => {
    const heightNeeded = linePlacementHeight(line);
    ensureSpace(heightNeeded);
    cursorY -= line.before;
    page.lines.push({
      ...line,
      y: cursorY,
      columnX: currentColumnX(),
      columnWidth: currentColumnWidth(),
    });
    cursorY -= resolvedLineHeight(line) + line.after;
  };
  const addImage = (image: ImageBlockData) => {
    const resource = imageResources.get(image.id);
    if (!resource) return;
    const requestedWidth = currentColumnWidth() * Math.min(1, Math.max(0.2, image.widthPercent / 100));
    const naturalHeight = requestedWidth * (image.intrinsicHeight / image.intrinsicWidth);
    const maxHeight = Math.max(72, top - bottom);
    const scale = Math.min(1, maxHeight / naturalHeight);
    const drawWidth = requestedWidth * scale;
    const drawHeight = naturalHeight * scale;
    const captionHeight = image.caption ? 18 : 0;
    ensureSpace(drawHeight + captionHeight + 18);
    const x = image.alignment === 'left' || image.placement === 'float-left'
      ? 0
      : image.alignment === 'right' || image.placement === 'float-right'
        ? currentColumnWidth() - drawWidth
        : (currentColumnWidth() - drawWidth) / 2;
    const y = cursorY - drawHeight;
    page.images.push({ objectId: resource.objectId, resourceName: resource.resourceName, width: drawWidth, height: drawHeight, x: currentColumnX() + x, y });
    cursorY = y - 8;
    if (image.caption) addLine({ text: image.caption, fontSize: 8, bold: false, italic: true, alignment: image.alignment, before: 0, after: 8, color: [0.35, 0.4, 0.48], ...plainPdfLayout });
  };

  const addParagraphLines = (lines: PdfTextLine[], paragraph: Paragraph): void => {
    const styleDefinition = writerStyleForParagraph(paragraph, styles);
    const decoration = resolveWriterParagraphDecoration(paragraph.style, styleDefinition);
    const indent = resolveWriterParagraphIndent(paragraph.style);
    const millimetersToPoints = 72 / 25.4;
    const decorationX = indent.leftMm * millimetersToPoints;
    const decorationWidth = Math.max(
      1,
      currentColumnWidth() - (indent.leftMm + indent.rightMm) * millimetersToPoints,
    );
    const layoutLines = lines.map((line, index) => ({
      ...line,
      before: line.before + (index === 0 ? decoration.topInsetPt : 0),
      after: line.after + (index === lines.length - 1 ? decoration.bottomInsetPt : 0),
    }));
    const fullHeight = layoutLines.reduce((sum, line) => sum + linePlacementHeight(line), 0);
    if (
      paragraph.style.keep_lines_together === true &&
      fullHeight <= pageCapacity && fullHeight > remainingPageHeight() && hasContent()
    ) advanceColumn();

    let lineIndex = 0;
    while (lineIndex < layoutLines.length) {
      let fittingLines = 0;
      let fittingHeight = 0;
      for (let candidate = lineIndex; candidate < layoutLines.length; candidate += 1) {
        const line = layoutLines[candidate];
        if (!line) break;
        const nextHeight = fittingHeight + linePlacementHeight(line);
        if (nextHeight > remainingPageHeight()) break;
        fittingHeight = nextHeight;
        fittingLines += 1;
      }

      if (fittingLines === 0 && hasContent()) {
        advanceColumn();
        continue;
      }
      fittingLines = Math.max(1, fittingLines);
      const linesRemaining = layoutLines.length - lineIndex;
      const wouldSplit = fittingLines < linesRemaining;
      if (paragraph.style.widow_orphan_control !== false && layoutLines.length >= 4 && wouldSplit) {
        if (lineIndex === 0 && fittingLines < 2 && hasContent()) {
          advanceColumn();
          continue;
        }
        if (linesRemaining - fittingLines === 1 && fittingLines > 2) fittingLines -= 1;
      }

      const end = Math.min(layoutLines.length, lineIndex + fittingLines);
      const fragmentTop = cursorY;
      for (; lineIndex < end; lineIndex += 1) {
        const line = layoutLines[lineIndex];
        if (line) addLine(line);
      }
      if (decoration.shading || Object.values(decoration.borders).some(Boolean)) {
        page.decorations.push({
          x: currentColumnX() + decorationX,
          y: cursorY,
          width: decorationWidth,
          height: Math.max(0.5, fragmentTop - cursorY),
          borders: decoration.borders,
          shading: decoration.shading,
        });
      }
      if (lineIndex < layoutLines.length) advanceColumn();
    }
  };

  let modelConfig = sectionByStartIndex.get(0)?.pageSetup ?? config;
  const paragraphModels = paragraphs.map((paragraph, paragraphIndex) => {
    const section = sectionByStartIndex.get(paragraphIndex);
    if (section) modelConfig = section.pageSetup;
    const modelGeometry = writerPageGeometry(modelConfig);
    const modelColumnWidth = Math.min(...modelGeometry.columns.widths);
    // W-118: the export had its own flat counter (`previousWasNumbered ? +1 : 1`), so a nested
    // list printed 1, 2, 3, 4 where the screen showed 1.1., 1.1.1., 1.2., 1.2.1. The marker now
    // comes from the same function the on-screen marker uses, so the two cannot drift apart.
    const listMarker = paragraph.style.list_style === 'number'
      ? calculateMultilevelListOrdinal(paragraphs, paragraphIndex, renderOptions.listTemplate)
      : '';
    return {
      paragraph,
      lines: paragraphToLines(paragraph, modelColumnWidth, styles, listMarker),
      config: modelConfig,
      section,
    };
  });
  const modelHeight = (model: typeof paragraphModels[number]): number => {
    const styleDefinition = writerStyleForParagraph(model.paragraph, styles);
    const decoration = resolveWriterParagraphDecoration(model.paragraph.style, styleDefinition);
    return model.lines.reduce((sum, line) => sum + linePlacementHeight(line), 0) + decoration.verticalInsetPt;
  };
  const keepWithNextGroupHeight = (startIndex: number): number => {
    let height = 0;
    for (let cursor = startIndex; cursor < paragraphModels.length; cursor += 1) {
      const groupModel = paragraphModels[cursor];
      if (!groupModel) break;
      if (cursor > startIndex && groupModel.section) break;
      height += modelHeight(groupModel);
      if (groupModel.paragraph.style.keep_with_next !== true || cursor === paragraphModels.length - 1) break;
    }
    return height;
  };
  for (let index = 0; index < paragraphModels.length; index += 1) {
    const model = paragraphModels[index];
    if (!model) continue;
    if (index > 0 && model.section) beginSection(model.section);
    const { paragraph, lines } = model;
    if (paragraph.style.page_break_before === true && hasContent()) pushPage();
    else if (paragraph.style.column_break_before === true) advanceColumn();

    const next = paragraphModels[index + 1];
    if (paragraph.style.keep_with_next === true && next && hasContent()) {
      const keepGroupHeight = keepWithNextGroupHeight(index);
      if (keepGroupHeight <= pageCapacity && keepGroupHeight > remainingPageHeight()) advanceColumn();
    }

    addParagraphLines(lines, paragraph);
    images.filter((image) => image.anchorParagraphId === paragraph.id).forEach(addImage);
  }
  for (const line of tableLines(tables, narrowestColumnWidth)) addLine(line);
  const paragraphIds = new Set(paragraphs.map((paragraph) => paragraph.id));
  images.filter((image) => !image.anchorParagraphId || !paragraphIds.has(image.anchorParagraphId)).forEach(addImage);
  if (hasContent() || pageModels.length === 0) pushPage(true);

  /**
   * WR-043 — never hand out a content-free PDF as if the export had succeeded.
   *
   * A font or rasterizer problem could leave every page without a single line or image; the
   * caller then opened a blank document and nothing said why. Existing content is the reason
   * to fail loudly here.
   */
  const drawableContent = pageModels.reduce(
    (total, model) => total + model.lines.length + model.images.length + model.decorations.length,
    0,
  );
  const documentHasText = paragraphs.some((paragraph) => paragraph.spans.some((span) => span.text.trim().length > 0));
  if (drawableContent === 0 && documentHasText) {
    throw new Error('PDF-Export hat keine darstellbare Seite erzeugt. Bitte Schrift- und Seiteneinstellungen prüfen; die Datei wurde nicht geschrieben.');
  }

  const selectedPageIndexes = resolveWriterPrintPageIndexes(pageModels.length, printOptions.pageRange);
  const copies = Math.min(99, Math.max(1, Math.trunc(printOptions.copies ?? 1)));
  const collate = printOptions.collate !== false;
  const selectedPages = selectedPageIndexes.map((sourcePageIndex) => ({ pageModel: pageModels[sourcePageIndex]!, sourcePageIndex }));
  const printPages = collate
    ? Array.from({ length: copies }, () => selectedPages).flat()
    : selectedPages.flatMap((page) => Array.from({ length: copies }, () => page));
  const scale = Math.min(2, Math.max(0.1, (printOptions.scalePercent ?? 100) / 100));

  return assembleWriterPdf({
    title, paragraphs, printPages, scale, documentMetadata, store: { objects, addObject },
    pagesId, catalogId, regularFontId, boldFontId, italicFontId, boldItalicFontId,
    facingPages, duplexPreference, profile, textRasterizer,
    // `{NUMPAGES}` names the document, not the printed range; `{WORDCOUNT}` comes from the
    // same statistics the status bar shows, so the two cannot disagree (W-126, W-144).
    documentPageCount: pageModels.length,
    documentWordCount: calculateTextStatistics(paragraphs, { pageCount: pageModels.length }).words,
    documentAuthor: documentMetadata.author,
  });
}


export function openWriterPdfForPrint(
  title: string,
  paragraphs: Paragraph[],
  config: PageSetupConfig,
  tables: TableBlockData[] = [],
  images: ImageBlockData[] = [],
  styles?: WriterStyleDefinition[],
  sections: WriterSectionDefinition[] = [],
  printOptions: WriterPdfPrintOptions = {},
  documentMetadata: WriterPdfDocumentMetadata = {},
): void {
  const bytes = buildWriterPdf(title, paragraphs, config, tables, images, styles, sections, printOptions, documentMetadata);
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error('Print-ready PDF was blocked by the browser.');
  }
  // The browser PDF viewer owns the final print UI. Opening the exact exported
  // PDF guarantees that print geometry and exported geometry use one renderer.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadWriterPdf(
  title: string,
  paragraphs: Paragraph[],
  config: PageSetupConfig,
  tables: TableBlockData[] = [],
  images: ImageBlockData[] = [],
  styles?: WriterStyleDefinition[],
  sections: WriterSectionDefinition[] = [],
  documentMetadata: WriterPdfDocumentMetadata = {},
): Promise<ExportDeliveryResult> {
  const bytes = buildWriterPdf(title, paragraphs, config, tables, images, styles, sections, {}, documentMetadata);
  const safeTitle = (title || 'document').replace(/[^a-z0-9._-]+/gi, '_');
  // Release Beta 0.1: the desktop writes through the save dialog + atomic export; the browser
  // fallback is a download that the caller reports as such.
  return deliverExportBytes(bytes, {
    suggestedName: `${safeTitle}.pdf`,
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
}
