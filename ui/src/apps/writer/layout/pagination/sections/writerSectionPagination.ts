// STATUS: DIAMANT VGT SUPREME — Section boundaries, parity, and page-number orchestration
import type {
  Paragraph,
  WriterEquationBlockData,
  WriterFootnote,
  WriterImageBlockData,
  WriterMediaObjectData,
  WriterSectionBreakType,
  WriterSectionDefinition,
  WriterStyleDefinition,
  WriterTableBlockData,
  WriterWorkspaceEmbed,
  WriterLanguageTag,
} from '../../../../../shared/contracts/workspace';
import { resolveLinkedWriterHeaderFooterSetup } from '../../../../../shared/writer/layout/headerFooter';
import type { PageSetupConfig } from '../../../types';
import {
  formatWriterPageNumber,
  getWriterPageGeometry,
  MINIMUM_LINE_HEIGHT_PX,
} from '../geometry/writerPaginationGeometry';
import { writerPageDecorationSignature } from '../../../../../shared/writer/layout/pageDecorations';
import { paginateWriterParagraphs } from '../paragraphs/writerParagraphPagination';
import type {
  WriterPaginationPage,
  WriterPaginationSectionSegment,
  WriterFlowContent,
} from '../writerPaginationTypes';

interface MutableWriterFlowContent {
  tables: WriterTableBlockData[];
  images: WriterImageBlockData[];
  mediaObjects: WriterMediaObjectData[];
  equations: WriterEquationBlockData[];
  footnotes: WriterFootnote[];
  workspaceEmbeds: WriterWorkspaceEmbed[];
  defaultLanguage?: WriterLanguageTag;
}
interface ResolvedWriterSection {
  id: string;
  startIndex: number;
  pageSetup: PageSetupConfig;
  restartPageNumberAt?: number;
  breakType: WriterSectionBreakType;
}

function partitionWriterFlowContent(
  flowContent: WriterFlowContent | undefined,
  paragraphs: readonly Paragraph[],
  sections: readonly ResolvedWriterSection[],
): Array<WriterFlowContent | undefined> {
  if (!flowContent) return sections.map(() => undefined);
  const partitions = sections.map<MutableWriterFlowContent>(() => ({
    tables: [],
    images: [],
    mediaObjects: [],
    equations: [],
    footnotes: [],
    workspaceEmbeds: [],
    defaultLanguage: flowContent.defaultLanguage,
  }));
  const sectionByParagraphId = new Map<string, number>();
  sections.forEach((section, sectionIndex) => {
    const endIndex = sections[sectionIndex + 1]?.startIndex ?? paragraphs.length;
    for (let paragraphIndex = section.startIndex; paragraphIndex < endIndex; paragraphIndex += 1) {
      const paragraphId = paragraphs[paragraphIndex]?.id;
      if (paragraphId !== undefined) sectionByParagraphId.set(paragraphId, sectionIndex);
    }
  });
  const finalSectionIndex = Math.max(0, sections.length - 1);

  for (const table of flowContent.tables) {
    const sectionIndex = table.anchorParagraphId === undefined
      ? undefined
      : sectionByParagraphId.get(table.anchorParagraphId);
    partitions[sectionIndex ?? finalSectionIndex]?.tables.push(table);
  }
  for (const image of flowContent.images) {
    const sectionIndex = image.anchorParagraphId === undefined
      ? undefined
      : sectionByParagraphId.get(image.anchorParagraphId);
    if (sectionIndex !== undefined) partitions[sectionIndex]?.images.push(image);
  }
  for (const media of flowContent.mediaObjects ?? []) {
    const sectionIndex = media.anchorParagraphId === undefined
      ? undefined
      : sectionByParagraphId.get(media.anchorParagraphId);
    partitions[sectionIndex ?? finalSectionIndex]?.mediaObjects.push(media);
  }
  for (const equation of flowContent.equations) {
    const sectionIndex = equation.anchorParagraphId === undefined
      ? undefined
      : sectionByParagraphId.get(equation.anchorParagraphId);
    if (sectionIndex !== undefined) partitions[sectionIndex]?.equations.push(equation);
  }
  for (const footnote of flowContent.footnotes) {
    const sectionIndex = sectionByParagraphId.get(footnote.referenceParagraphId);
    if (sectionIndex !== undefined) partitions[sectionIndex]?.footnotes.push(footnote);
  }
  for (const embed of flowContent.workspaceEmbeds ?? []) {
    const sectionIndex = sectionByParagraphId.get(embed.anchorParagraphId);
    if (sectionIndex !== undefined) partitions[sectionIndex]?.workspaceEmbeds.push(embed);
  }
  return partitions;
}

function resolveWriterSections(
  paragraphs: readonly Paragraph[],
  defaultPageSetup: PageSetupConfig,
  sections: readonly WriterSectionDefinition[],
): ResolvedWriterSection[] {
  const paragraphIndex = new Map(paragraphs.map((paragraph, index) => [paragraph.id, index]));
  const uniqueStarts = new Set<number>();
  const resolved = sections
    .map((section): ResolvedWriterSection | null => {
      const startIndex = paragraphIndex.get(section.startParagraphId);
      if (startIndex === undefined || uniqueStarts.has(startIndex)) return null;
      uniqueStarts.add(startIndex);
      return {
        id: section.id,
        startIndex,
        pageSetup: section.pageSetup,
        restartPageNumberAt: section.restartPageNumberAt,
        breakType: section.breakType ?? 'next-page',
      };
    })
    .filter((section): section is ResolvedWriterSection => section !== null)
    .sort((left, right) => left.startIndex - right.startIndex);

  if (resolved[0]?.startIndex !== 0) {
    resolved.unshift({
      id: 'document-default',
      startIndex: 0,
      pageSetup: defaultPageSetup,
      breakType: 'next-page',
    });
  }
  return resolved.reduce<ResolvedWriterSection[]>((effective, section) => {
    const previousPageSetup = effective.at(-1)?.pageSetup;
    effective.push({
      ...section,
      pageSetup: resolveLinkedWriterHeaderFooterSetup(section.pageSetup, previousPageSetup),
    });
    return effective;
  }, []);
}

export function paginateWriterSections(
  paragraphs: readonly Paragraph[],
  defaultPageSetup: PageSetupConfig,
  styles: readonly WriterStyleDefinition[],
  sections: readonly WriterSectionDefinition[],
  flowContent?: WriterFlowContent,
): WriterPaginationPage[] {
  if (paragraphs.length === 0) {
    return paginateWriterParagraphs(paragraphs, defaultPageSetup, styles, flowContent);
  }

  const resolvedSections = resolveWriterSections(paragraphs, defaultPageSetup, sections);
  const pages: WriterPaginationPage[] = [];
  const sectionFlowContent = partitionWriterFlowContent(flowContent, paragraphs, resolvedSections);
  let nextDisplayPageNumber = defaultPageSetup.pageNumberStart ?? 1;

  resolvedSections.forEach((section, sectionIndex) => {
    const nextSection = resolvedSections[sectionIndex + 1];
    const sectionParagraphs = paragraphs.slice(section.startIndex, nextSection?.startIndex);
    const previousPage = pages.at(-1);
    const physicalPageIndex = pages.length || 1;
    const previousGeometry = previousPage
      ? getWriterPageGeometry(previousPage.pageSetup, previousPage.pageIndex)
      : null;
    const sectionGeometryOnPreviousPage = previousPage
      ? getWriterPageGeometry(section.pageSetup, previousPage.pageIndex)
      : null;
    const previousSegments = previousPage?.sectionSegments ?? (previousPage ? [paginationPageToSegment(previousPage)] : []);
    const usedVerticalHeightPx = previousSegments.reduce(
      (total, segment) => total + Math.max(0, ...segment.columnUsedHeightsPx),
      0,
    );
    const continuousShellCompatible = Boolean(
      previousPage &&
      !previousPage.isBlankPage &&
      previousGeometry &&
      sectionGeometryOnPreviousPage &&
      Math.abs(previousGeometry.widthPx - sectionGeometryOnPreviousPage.widthPx) < 0.5 &&
      Math.abs(previousGeometry.heightPx - sectionGeometryOnPreviousPage.heightPx) < 0.5 &&
      Math.abs(previousGeometry.marginsPx.top - sectionGeometryOnPreviousPage.marginsPx.top) < 0.5 &&
      Math.abs(previousGeometry.marginsPx.bottom - sectionGeometryOnPreviousPage.marginsPx.bottom) < 0.5 &&
      Math.abs(previousGeometry.marginsPx.left - sectionGeometryOnPreviousPage.marginsPx.left) < 0.5 &&
      Math.abs(previousGeometry.marginsPx.right - sectionGeometryOnPreviousPage.marginsPx.right) < 0.5 &&
      writerPageDecorationSignature(previousPage.pageSetup) === writerPageDecorationSignature(section.pageSetup),
    );
    const continuousRemainingHeightPx = sectionGeometryOnPreviousPage
      ? Math.max(0, sectionGeometryOnPreviousPage.bodyHeightPx - usedVerticalHeightPx)
      : 0;
    const mergeContinuousSection = sectionIndex > 0 &&
      section.breakType === 'continuous' &&
      section.restartPageNumberAt === undefined &&
      continuousShellCompatible &&
      continuousRemainingHeightPx >= MINIMUM_LINE_HEIGHT_PX * 2;

    if (
      sectionIndex > 0 &&
      (section.breakType === 'even-page' || section.breakType === 'odd-page')
    ) {
      const requiredParity = section.breakType === 'even-page' ? 0 : 1;
      const proposedSectionPage = pages.length + 1;
      if (proposedSectionPage % 2 !== requiredParity) {
        const blankSetup = previousPage?.pageSetup ?? defaultPageSetup;
        const blankPageIndex = pages.length + 1;
        const blankDisplayNumber = nextDisplayPageNumber;
        pages.push(createBlankWriterPage(
          blankSetup,
          blankPageIndex,
          blankDisplayNumber,
          previousPage?.sectionId ?? 'document-default',
          previousPage?.sectionPageIndex ?? physicalPageIndex,
          Math.max(0, sectionIndex - 1),
        ));
        nextDisplayPageNumber += 1;
      }
    }

    const sectionPages = paginateWriterParagraphs(
      sectionParagraphs,
      section.pageSetup,
      styles,
      sectionFlowContent[sectionIndex],
      mergeContinuousSection
        ? { firstPageBodyHeightPx: continuousRemainingHeightPx }
        : undefined,
    );
    const firstDisplayPageNumber = mergeContinuousSection && previousPage
      ? previousPage.displayPageNumber
      : section.restartPageNumberAt ?? nextDisplayPageNumber;

    sectionPages.forEach((page, localIndex) => {
      if (mergeContinuousSection && localIndex === 0 && previousPage) {
        const segment = paginationPageToSegment({
          ...page,
          sectionId: section.id,
          sectionPageIndex: 1,
          pageSetup: section.pageSetup,
        });
        const previousIndex = pages.length - 1;
        pages[previousIndex] = {
          ...previousPage,
          paragraphs: [...previousPage.paragraphs, ...page.paragraphs],
          fragments: [...previousPage.fragments, ...page.fragments],
          tableFragments: [...(previousPage.tableFragments ?? []), ...(page.tableFragments ?? [])],
          flowItems: [...(previousPage.flowItems ?? []), ...(page.flowItems ?? [])],
          usedFlowHeightPx: previousPage.usedFlowHeightPx + page.usedFlowHeightPx,
          sectionSegments: [...previousSegments, segment],
        };
        return;
      }
      const pageIndex = pages.length + 1;
      const displayNum = firstDisplayPageNumber + localIndex;
      const chapterPrefix = section.pageSetup.chapterNumbering ? `Kapitel ${sectionIndex + 1}` : undefined;
      const displayPageNumberString = formatWriterPageNumber(
        displayNum,
        section.pageSetup.pageNumberFormat,
        chapterPrefix,
      );

      pages.push({
        ...page,
        id: `page-${pageIndex}`,
        pageIndex,
        isFirst: pageIndex === 1,
        pageSetup: section.pageSetup,
        sectionId: section.id,
        sectionPageIndex: localIndex + 1,
        displayPageNumber: displayNum,
        displayPageNumberString,
      });
    });
    nextDisplayPageNumber = firstDisplayPageNumber + sectionPages.length;
  });

  return pages;
}

function paginationPageToSegment(page: WriterPaginationPage): WriterPaginationSectionSegment {
  const geometry = getWriterPageGeometry(page.pageSetup, page.pageIndex);
  const flowItems = page.flowItems ?? [];
  const columnFlowItems = page.columnFlowItems ?? Array.from(
    { length: geometry.columnCount },
    (_, columnIndex) => flowItems.filter((item) => (item.columnIndex ?? 0) === columnIndex),
  );
  return {
    sectionId: page.sectionId,
    sectionPageIndex: page.sectionPageIndex,
    pageSetup: page.pageSetup,
    fragments: page.fragments,
    tableFragments: page.tableFragments ?? [],
    flowItems,
    columnFlowItems,
    usedFlowHeightPx: page.usedFlowHeightPx,
    availableFlowHeightPx: page.availableFlowHeightPx,
    columnUsedHeightsPx: page.columnUsedHeightsPx ?? [
      Math.min(geometry.bodyHeightPx, page.usedFlowHeightPx),
    ],
  };
}

function createBlankWriterPage(
  pageSetup: PageSetupConfig,
  pageIndex: number,
  displayPageNumber: number,
  sectionId: string,
  sectionPageIndex: number,
  sectionIndex: number,
): WriterPaginationPage {
  const geometry = getWriterPageGeometry(pageSetup, pageIndex);
  const chapterPrefix = pageSetup.chapterNumbering ? `Kapitel ${sectionIndex + 1}` : undefined;
  return {
    id: `page-${pageIndex}`,
    pageIndex,
    paragraphs: [],
    fragments: [],
    tableFragments: [],
    flowItems: [],
    columnFlowItems: Array.from({ length: geometry.columnCount }, () => []),
    columnUsedHeightsPx: Array.from({ length: geometry.columnCount }, () => 0),
    usedFlowHeightPx: 0,
    availableFlowHeightPx: geometry.bodyHeightPx * geometry.columnCount,
    isFirst: pageIndex === 1,
    pageSetup,
    sectionId,
    sectionPageIndex,
    displayPageNumber,
    displayPageNumberString: formatWriterPageNumber(
      displayPageNumber,
      pageSetup.pageNumberFormat,
      chapterPrefix,
    ),
    isBlankPage: true,
  };
}
