// STATUS: DIAMANT VGT SUPREME — Paragraph and column flow pagination engine
import type {
  Paragraph,
  WriterStyleDefinition,
  WriterTableBlockData,
} from '../../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../../types';
import { formatWriterPageNumber, getWriterPageGeometry } from '../geometry/writerPaginationGeometry';
import {
  measureWriterParagraphTypography,
  hasExplicitPageBreak,
  hasExplicitColumnBreak,
  estimateAnchoredMediaHeightPx,
} from '../measurement/writerPaginationMeasurement';
import type {
  WriterPaginationFragment,
  WriterTableFragment,
  WriterPageFlowItem,
  WriterPaginationPage,
  WriterFlowContent,
} from '../writerPaginationTypes';

export function paginateWriterParagraphs(
  paragraphs: readonly Paragraph[],
  pageSetup: PageSetupConfig,
  styles: readonly WriterStyleDefinition[],
  flowContent?: WriterFlowContent,
  options?: { firstPageBodyHeightPx?: number },
): WriterPaginationPage[] {
  let currentPageIndex = 1;
  let geometry = getWriterPageGeometry(pageSetup, currentPageIndex);
  // DEF-RE-018: `Math.max(1, NaN)` is NaN, and `singleColumnHeightPx * columnCount` stayed NaN - so
  // `availableFlowHeightPx`, the height every line break is tested against, was NaN and the pagination
  // could not fill a page. The fallback is `geometry.bodyHeightPx`, exactly what the existing `??` already
  // uses when the option is absent: a non-finite request is treated like no request.
  // Same class as DEF-RE-009, 010, 013, 014, 015, 016 and 017 - and this is the third site in THIS file.
  const requestedFirstPageHeight = options?.firstPageBodyHeightPx;
  // **`let`, nicht `const`:** Zeile 151 (jetzt weiter unten) weist diese Variable neu zu
  // (`singleColumnHeightPx = geometry.bodyHeightPx;`). Mein erster Reparaturversuch schrieb `const` und
  // brach 14 bestehende Tests mit `TypeError: Assignment to constant variable.` —
  // **gefunden von den Tests, nicht von mir.**
  //
  // Und dieselbe Zeile 151 bestaetigt den Rueckfallwert: die Funktion benutzt `geometry.bodyHeightPx`
  // bereits anderswo fuer genau diesen Zweck.
  let singleColumnHeightPx = Math.min(
    geometry.bodyHeightPx,
    Number.isFinite(requestedFirstPageHeight)
      ? Math.max(1, requestedFirstPageHeight as number)
      : geometry.bodyHeightPx,
  );
  let availableFlowHeightPx = singleColumnHeightPx * geometry.columnCount;
  let currentColumnIndex = 0;
  let usedColumnHeightPx = 0;

  const measurementColumnWidthPx = Math.min(...(geometry.columnWidthsPx ?? [geometry.columnWidthPx]));
  const measured = paragraphs.map((paragraph) => {
    const typography = measureWriterParagraphTypography(
      paragraph,
      measurementColumnWidthPx,
      styles,
      flowContent?.defaultLanguage,
      flowContent?.images ?? [],
    );
    return {
      paragraph,
      ...typography,
      anchoredMediaHeightPx: estimateAnchoredMediaHeightPx(
        paragraph.id,
        { ...geometry, columnWidthPx: measurementColumnWidthPx },
        flowContent,
        typography,
      ),
    };
  });

  const pages: WriterPaginationPage[] = [];
  let currentParagraphs: Paragraph[] = [];
  let currentFragments: WriterPaginationFragment[] = [];
  let currentTableFragments: WriterTableFragment[] = [];
  let currentFlowItems: WriterPageFlowItem[] = [];
  let currentColumnFlowItems: WriterPageFlowItem[][] = Array.from(
    { length: geometry.columnCount },
    () => [],
  );
  let columnUsedHeightsPx: number[] = Array.from({ length: geometry.columnCount }, () => 0);
  let usedFlowHeightPx = 0;

  const syncUsedFlowHeight = (): void => {
    usedFlowHeightPx = currentColumnIndex * singleColumnHeightPx + usedColumnHeightPx;
    columnUsedHeightsPx[currentColumnIndex] = Math.max(
      columnUsedHeightsPx[currentColumnIndex] ?? 0,
      usedColumnHeightPx,
    );
  };

  const appendFlowItem = (flowItem: WriterPageFlowItem): void => {
    const placed = { ...flowItem, columnIndex: currentColumnIndex } as WriterPageFlowItem;
    currentFlowItems.push(placed);
    currentColumnFlowItems[currentColumnIndex]?.push(placed);
  };

  const paragraphIds = new Set(paragraphs.map((paragraph) => paragraph.id));
  const tablesByAnchor = new Map<string, WriterTableBlockData[]>();
  const unanchoredTables: WriterTableBlockData[] = [];
  for (const table of flowContent?.tables ?? []) {
    const anchorId = table.anchorParagraphId;
    if (!anchorId || !paragraphIds.has(anchorId)) {
      unanchoredTables.push(table);
      continue;
    }
    const anchored = tablesByAnchor.get(anchorId);
    if (anchored) anchored.push(table);
    else tablesByAnchor.set(anchorId, [table]);
  }

  const commitPage = (): void => {
    if (currentParagraphs.length === 0 && currentTableFragments.length === 0) return;
    const pageIndex = pages.length + 1;
    const pageNumber = (pageSetup.pageNumberStart ?? 1) + pageIndex - 1;
    const chapterPrefix = pageSetup.chapterNumbering ? 'Kapitel 1' : undefined;
    const displayPageNumberString = formatWriterPageNumber(
      pageNumber,
      pageSetup.pageNumberFormat,
      chapterPrefix,
    );

    pages.push({
      id: `page-${pageIndex}`,
      pageIndex,
      paragraphs: currentParagraphs,
      fragments: currentFragments,
      tableFragments: currentTableFragments,
      flowItems: currentFlowItems,
      columnFlowItems: currentColumnFlowItems,
      usedFlowHeightPx,
      availableFlowHeightPx,
      isFirst: pageIndex === 1,
      pageSetup,
      sectionId: 'document-default',
      sectionPageIndex: pageIndex,
      displayPageNumber: pageNumber,
      displayPageNumberString,
      columnUsedHeightsPx,
    });

    currentParagraphs = [];
    currentFragments = [];
    currentTableFragments = [];
    currentFlowItems = [];
    currentColumnFlowItems = [];
    columnUsedHeightsPx = [];
    usedFlowHeightPx = 0;
    currentColumnIndex = 0;
    usedColumnHeightPx = 0;

    currentPageIndex = pageIndex + 1;
    geometry = getWriterPageGeometry(pageSetup, currentPageIndex);
    singleColumnHeightPx = geometry.bodyHeightPx;
    availableFlowHeightPx = geometry.bodyHeightPx * geometry.columnCount;
    currentColumnFlowItems = Array.from({ length: geometry.columnCount }, () => []);
    columnUsedHeightsPx = Array.from({ length: geometry.columnCount }, () => 0);
  };

  const completeParagraphHeight = (item: typeof measured[number]): number => Math.min(
    availableFlowHeightPx,
    item.spaceBeforePx + item.lineRanges.length * item.lineHeightPx +
      item.spaceAfterPx + item.anchoredMediaHeightPx,
  );

  const keepWithNextGroupHeight = (startIndex: number): number => {
    let height = 0;
    for (let cursor = startIndex; cursor < measured.length; cursor += 1) {
      const groupItem = measured[cursor];
      if (!groupItem) break;
      height += completeParagraphHeight(groupItem);
      if (groupItem.paragraph.style.keep_with_next !== true || cursor === measured.length - 1) break;
    }
    return height;
  };

  const advanceColumn = (): void => {
    if (currentColumnIndex + 1 < geometry.columnCount) {
      currentColumnIndex += 1;
      usedColumnHeightPx = 0;
      syncUsedFlowHeight();
    } else {
      commitPage();
    }
  };

  const placeTableChunks = (table: WriterTableBlockData, anchorParagraphId?: string): void => {
    const headerRowHeightPx = 40;
    const standardRowHeightPx = 34;
    const fragmentSpacingPx = 12;
    const rowHeightPx = (rowIndex: number): number => {
      const heightMm = table.rows[rowIndex]?.heightMm;
      return typeof heightMm === 'number' && Number.isFinite(heightMm) && heightMm > 0
        ? Math.round(heightMm * 3.78)
        : standardRowHeightPx;
    };
    let currentRowIndex = 0;
    const totalRows = table.rows.length;

    if (totalRows === 0) {
      const tableHeight = headerRowHeightPx + 10;
      if (usedColumnHeightPx + tableHeight > singleColumnHeightPx && (currentParagraphs.length > 0 || currentTableFragments.length > 0)) {
        advanceColumn();
      }
      const fragment: WriterTableFragment = {
        key: `${table.id}:empty`,
        tableId: table.id,
        table,
        startRowIndex: 0,
        endRowIndex: 0,
        isFirstFragment: true,
        isLastFragment: true,
        repeatHeader: true,
        anchorParagraphId,
      };
      currentTableFragments.push(fragment);
      appendFlowItem({ kind: 'table', fragment });
      usedColumnHeightPx += tableHeight;
      syncUsedFlowHeight();
      return;
    }

    while (currentRowIndex < totalRows) {
      let remainingHeightPx = singleColumnHeightPx - usedColumnHeightPx;
      const isFirstChunk = currentRowIndex === 0;
      const shouldRepeatHeader = isFirstChunk || table.repeatHeaderRow !== false;
      const effectiveHeaderHeightPx = shouldRepeatHeader ? headerRowHeightPx : 0;
      const captionHeightPx = isFirstChunk && table.caption ? 24 : 0;

      const firstRowHeightPx = rowHeightPx(currentRowIndex);
      const minimumNeeded = effectiveHeaderHeightPx + captionHeightPx + firstRowHeightPx + fragmentSpacingPx;

      if (remainingHeightPx < minimumNeeded && (currentParagraphs.length > 0 || currentTableFragments.length > 0)) {
        advanceColumn();
        remainingHeightPx = singleColumnHeightPx;
      }

      const availableForRows = Math.max(
        firstRowHeightPx,
        remainingHeightPx - effectiveHeaderHeightPx - captionHeightPx - fragmentSpacingPx,
      );
      let rowsFitting = 0;
      let accumulatedRowsHeightPx = 0;

      for (let r = currentRowIndex; r < totalRows; r += 1) {
        const rHeight = rowHeightPx(r);
        if (rowsFitting === 0) {
          rowsFitting = 1;
          accumulatedRowsHeightPx += rHeight;
        } else if (accumulatedRowsHeightPx + rHeight <= availableForRows) {
          rowsFitting += 1;
          accumulatedRowsHeightPx += rHeight;
        } else {
          // Row cannot fit in remaining space on this page
          break;
        }
      }

      const nextRowIndex = currentRowIndex + rowsFitting;
      const isLastChunk = nextRowIndex >= totalRows;
      const fragmentHeightPx = effectiveHeaderHeightPx + captionHeightPx + accumulatedRowsHeightPx + fragmentSpacingPx;

      const fragment: WriterTableFragment = {
        key: `${table.id}:${currentRowIndex}-${nextRowIndex}`,
        tableId: table.id,
        table,
        startRowIndex: currentRowIndex,
        endRowIndex: nextRowIndex,
        isFirstFragment: isFirstChunk,
        isLastFragment: isLastChunk,
        repeatHeader: shouldRepeatHeader,
        anchorParagraphId,
      };
      currentTableFragments.push(fragment);
      appendFlowItem({ kind: 'table', fragment });

      usedColumnHeightPx += fragmentHeightPx;
      syncUsedFlowHeight();
      currentRowIndex = nextRowIndex;

      if (!isLastChunk) {
        advanceColumn();
      }
    }
  };

  for (let index = 0; index < measured.length; index += 1) {
    const item = measured[index];
    if (!item) continue;

    if (hasExplicitPageBreak(item.paragraph) && (currentParagraphs.length > 0 || currentTableFragments.length > 0)) {
      commitPage();
    } else if (hasExplicitColumnBreak(item.paragraph)) {
      advanceColumn();
    }

    const next = measured[index + 1];
    const itemHeight = completeParagraphHeight(item);
    const keepGroupHeight = keepWithNextGroupHeight(index);
    let remainingHeightPx = singleColumnHeightPx - usedColumnHeightPx;

    if (
      item.paragraph.style.keep_with_next === true &&
      next && keepGroupHeight <= singleColumnHeightPx &&
      (currentParagraphs.length > 0 || currentTableFragments.length > 0) && keepGroupHeight > remainingHeightPx
    ) {
      advanceColumn();
      remainingHeightPx = singleColumnHeightPx;
    }

    if (
      item.paragraph.style.keep_lines_together === true &&
      itemHeight <= singleColumnHeightPx &&
      (currentParagraphs.length > 0 || currentTableFragments.length > 0) && itemHeight > remainingHeightPx
    ) {
      advanceColumn();
      remainingHeightPx = singleColumnHeightPx;
    }

    let lineIndex = 0;
    while (lineIndex < item.lineRanges.length) {
      const firstFragment = lineIndex === 0;
      const linesRemaining = item.lineRanges.length - lineIndex;
      remainingHeightPx = singleColumnHeightPx - usedColumnHeightPx;
      /**
       * WR-006/WR-007 (native M7 re-probe) — margin collapsing at the top of a page.
       *
       * A paragraph whose `space_before` came from a click in the free area could be taller
       * than the page's free space. The paginator broke the page immediately — leaving the
       * previous one 40–50 % white — and then applied the same huge gap at the top of the
       * **continuation** page, so the first line sat 300 pt below the margin. A vertical gap
       * at the head of a flowed page is meaningless: there is no preceding paragraph whose
       * margin it could collapse with. It collapses to 0 here, exactly like the first child
       * of a block, so a spacing value can never generate a mostly empty page.
       *
       * The document's **first** page is deliberately excluded: it has no predecessor to
       * collapse against, and its top spacing belongs to the layout the author chose.
       */
      const atContinuedPageHead = firstFragment
        && currentColumnIndex === 0
        && pages.length > 0
        && currentParagraphs.length === 0
        && currentTableFragments.length === 0;
      let beforeHeight = firstFragment && !atContinuedPageHead ? item.spaceBeforePx : 0;
      let maximumLines = Math.floor((remainingHeightPx - beforeHeight) / item.lineHeightPx);

      /**
       * Native regression (Runde 4) — **an empty click paragraph must never break the page.**
       *
       * A click in the free area creates one empty paragraph whose `space_before` is the
       * clicked distance. If that distance is a hair too large, `maximumLines < 1` broke the
       * page, the gap collapsed at the new page head, page 1 stayed half empty, and the next
       * click on page 1 pushed page 3 and 4 — the "ghost pages" the native probe reported.
       *
       * The caret geometry now measures against the paginator's page height and keeps a safety
       * buffer, so this should not trigger. As the last line of defence, such a paragraph is
       * **capped** to the remaining space instead of forcing a break: the model keeps its
       * semantic distance, the page keeps its content.
       */
      if (maximumLines < 1 && (currentParagraphs.length > 0 || currentTableFragments.length > 0)) {
        const isSingleEmptyLine = item.lineRanges.length === 1
          && item.paragraph.spans.every((span) => span.text.length === 0);
        if (isSingleEmptyLine && item.spaceBeforePx > 0) {
          const terminalHeightPx = item.spaceAfterPx + item.anchoredMediaHeightPx;
          beforeHeight = Math.max(0, remainingHeightPx - item.lineHeightPx - terminalHeightPx);
          maximumLines = Math.floor((remainingHeightPx - beforeHeight) / item.lineHeightPx);
        }
        if (maximumLines < 1) {
          advanceColumn();
          continue;
        }
      }
      // DEF-RE-018: same form, same file. `Math.max(1, NaN)` is NaN; one line fits on a page.
      maximumLines = Number.isFinite(maximumLines) ? Math.max(1, maximumLines) : 1;
      let lineCount = Math.min(linesRemaining, maximumLines);
      let lastFragment = lineCount === linesRemaining;
      const terminalHeight = item.spaceAfterPx + item.anchoredMediaHeightPx;

      if (
        lastFragment &&
        beforeHeight + lineCount * item.lineHeightPx + terminalHeight > remainingHeightPx &&
        (currentParagraphs.length > 0 || currentTableFragments.length > 0)
      ) {
        const fittingWithTerminal = Math.floor(
          (remainingHeightPx - beforeHeight - terminalHeight) / item.lineHeightPx,
        );
        if (fittingWithTerminal < 1) {
          advanceColumn();
          continue;
        }
        lineCount = Math.min(lineCount, fittingWithTerminal);
        lastFragment = lineCount === linesRemaining;
      }

      if (item.paragraph.style.widow_orphan_control !== false && item.lineRanges.length >= 4 && !lastFragment) {
        if (firstFragment && lineCount < 2 && (currentParagraphs.length > 0 || currentTableFragments.length > 0)) {
          advanceColumn();
          continue;
        }
        if (linesRemaining - lineCount === 1 && lineCount > 2) lineCount -= 1;
      }

      lastFragment = lineCount === linesRemaining;
      const firstLine = item.lineRanges[lineIndex];
      const lastLine = item.lineRanges[lineIndex + lineCount - 1];
      if (!firstLine || !lastLine) break;
      /**
       * WR-046 — the fragment key names its **content position**, not its ordinal.
       *
       * With `part-0/part-1/…` an insertion on page 1 renumbered every later fragment, so React
       * remounted the pages under the user and the caret jump was visible as a flicker. The
       * start offset is stable for every fragment whose text did not move.
       */
      const fragment: WriterPaginationFragment = {
        key: `${item.paragraph.id}:${firstLine.start}`,
        paragraph: item.paragraph,
        startOffset: firstLine.start,
        endOffset: lastLine.end,
        lineCount,
        isFirst: firstFragment,
        isLast: lastFragment,
      };
      currentParagraphs.push(item.paragraph);
      currentFragments.push(fragment);
      appendFlowItem({ kind: 'paragraph', fragment });
      usedColumnHeightPx += beforeHeight + lineCount * item.lineHeightPx +
        (lastFragment ? terminalHeight : 0);
      syncUsedFlowHeight();
      lineIndex += lineCount;

      if (!lastFragment) advanceColumn();
    }

    for (const table of tablesByAnchor.get(item.paragraph.id) ?? []) {
      placeTableChunks(table, item.paragraph.id);
    }
  }

  for (const table of unanchoredTables) {
    placeTableChunks(table);
  }

  commitPage();

  if (pages.length === 0) {
    const pageNumber = pageSetup.pageNumberStart ?? 1;
    const chapterPrefix = pageSetup.chapterNumbering ? 'Kapitel 1' : undefined;
    const displayPageNumberString = formatWriterPageNumber(pageNumber, pageSetup.pageNumberFormat, chapterPrefix);
    return [{
      id: 'page-1',
      pageIndex: 1,
      paragraphs: [],
      fragments: [],
      tableFragments: [],
      flowItems: [],
      columnFlowItems: Array.from({ length: geometry.columnCount }, () => []),
      usedFlowHeightPx: 0,
      availableFlowHeightPx,
      isFirst: true,
      pageSetup,
      sectionId: 'document-default',
      sectionPageIndex: 1,
      displayPageNumber: pageNumber,
      displayPageNumberString,
      columnUsedHeightsPx: Array.from({ length: geometry.columnCount }, () => 0),
    }];
  }

  return pages;
}
