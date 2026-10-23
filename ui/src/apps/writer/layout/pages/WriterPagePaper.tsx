// STATUS: DIAMANT VGT SUPREME — Paginated Paper Sheet Component for Writer
import React from 'react';
import type { Paragraph, WriterStyleCatalog, WriterStyleDefinition, WriterTabStop, WriterShapeBlockData, WriterWorkspaceEmbed, WriterMediaObjectData } from '../../../../shared/contracts/workspace';import type { CustomMargins, EquationBlockData, FootnoteItem, ImageBlockData, PageSetupConfig, ReviewerFilter, ReviewMode, TableBlockData, TrackChangeRevision, ViewMode } from '../../types';
import type { WriterPageFlowItem, WriterPaginationPage, WriterPaginationSectionSegment } from '../pagination/writerPagination';
import { getMargins, getWriterPageGeometry } from '../pagination/writerPagination';
import { resolveNearestWriterParagraphAnchor, isWriterMediaBand, type WriterPageClickInput, type WriterDirectCaretInput, type WriterDirectCaretIntent, type WriterMeasuredParagraphBox, writerParagraphTextLength } from '../../editing/caret/writerCaretTargeting';
import type { WriterClipboardParagraph } from '../../editing/clipboard/writerClipboardPayload';
import { WriterEquationBlock } from '../../equations/WriterEquationBlock';
import { WriterImageBlock } from '../../media/images/WriterImageBlock';
import { WriterFixedImageLayer } from '../../media/layout/WriterFixedImageLayer';
import { WriterAnchoredImageLayer } from '../../media/layout/WriterAnchoredImageLayer';
import { WriterTerminalImageLayer } from '../../media/layout/WriterTerminalImageLayer';
import { isWriterImageFixedToPage } from '../../media/images/operations/writerMediaOperations';
import {
  hasWriterImageInAnchoredLayer,
  hasWriterImageInTerminalLayer,
} from '../../media/layout/writerImageLayerSelection';
import { WriterWorkspaceEmbedBlock } from '../../integrations/workspace/WriterWorkspaceEmbedBlock';
import { WriterMediaObjectLayer } from '../../media/objects/WriterMediaObjectLayer';
import {
  isWriterMediaElement,
  isWriterTextIsland,
  paragraphCarriesWriterMedia,
} from '../../media/layout/writerMediaHitbox';
import { WriterPageHeaderFooter } from './WriterPageHeaderFooter';
import { WriterVerticalRuler } from './WriterVerticalRuler';
import { WriterRuler } from './WriterRuler';
import type { WriterRangeFormatState } from '../../formatting/range/writerRangeFormatState';
import { WriterParagraphItem } from '../../editor/paragraphs/WriterParagraphItem';
import { WriterShapeCanvas } from '../../editor/blocks/shapes/WriterShapeCanvas';
import {
  getPageDimensionStyle,
  getMarginPadding,
  getPageBorderStyle,
} from './writerPageStyles';
import {
  renderTableFragment,
  renderPageFootnotes,
  renderDocumentEndnotes,
} from './WriterPageRendererTableHelper';
import { getPageFootnotes, type SeparatedNotes } from '../../references/notes/writerNotesEngine';
import type { WriterCollaborationPeer } from '../../collaboration/types/writerCollaborationTypes';

/**
 * The line height to use when a paragraph cannot be measured.
 *
 * `happy-dom` and any headless DOM report `line-height: normal` and no boxes at
 * all; a hard 0 would make the direct cursor divide by zero, so the fallback is a
 * realistic body-text line (11 pt × 1.5 ≈ 22 px at 96 dpi).
 */
function fallbackLineHeight(fontSizePx: number): number {
  const size = Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 14.66;
  return Math.round(size * 1.5 * 100) / 100;
}

export interface WriterPagePaperProps {
  page: WriterPaginationPage;
  totalPages: number;
  docWordCount: number;
  viewMode: ViewMode;
  showRuler: boolean;
  effectivePageSetup: PageSetupConfig;
  isLight: boolean;
  paperBg: string;
  backgroundColor: string;
  activeParagraph?: Paragraph;
  activeParagraphId: string | null;
  /** What the marked range carries; the ruler marks a value that differs (W-119). */
  rangeFormat?: WriterRangeFormatState;
  paragraphs: Paragraph[];
  tables: TableBlockData[];
  images: ImageBlockData[];
  mediaObjects?: WriterMediaObjectData[];
  equations: EquationBlockData[];
  workspaceEmbeds?: WriterWorkspaceEmbed[];
  /** Ids of workspace documents that still exist; `undefined` means the caller cannot know (W-245). */
  knownWorkspaceSourceIds?: ReadonlySet<string>;
  shapes?: readonly WriterShapeBlockData[];
  footnotes: FootnoteItem[];
  separatedNotes: SeparatedNotes;
  styles: WriterStyleDefinition[];
  styleCatalog: WriterStyleCatalog;
  draggedPIdx: number | null;
  dragOverPIdx: number | null;
  showNonPrinting: boolean;
  reviewMode: ReviewMode;
  reviewerFilter: ReviewerFilter;
  revisions: TrackChangeRevision[];
  remotePeersByParagraph?: Readonly<Record<string, readonly WriterCollaborationPeer[]>>;
  documentTitle: string;
  readOnly?: boolean;
  onUpdateMargins?: (margins: CustomMargins) => void;
  onUpdateIndent?: (indent: { firstLineMm?: number; leftMm?: number; rightMm?: number }) => void;
  onUpdateTabStops?: (tabStops: WriterTabStop[]) => void;
  onParagraphChange: (pIdx: number, text: string, inputCaret?: number) => number;
  onTextSelection: (pIdx: number, start: number, end: number) => void;
  onSelectParagraph: (pId: string) => void;
  onAddParagraph: (afterIdx: number, headingLevel?: 1 | 2 | 3) => void;
  onSplitParagraph?: (pIdx: number, offset: number) => void;
  onMergeParagraphBackward?: (pIdx: number) => void;
  rangeSelectionParagraphIds?: readonly string[];
  hasRangeSelection?: boolean;
  onRangeSelectionStart?: (pIdx: number, offset: number) => void;
  onReplaceRangeSelection?: (replacement: string) => void;
  onNavigate?: (target: { paragraphId: string; offset: number }, extendSelection: boolean) => void;
  onBlockedEditAttempt?: () => void;
  onPastePayload?: (payload: readonly WriterClipboardParagraph[], selectionStart: number, selectionEnd: number) => void;
  onDeleteParagraph: (pIdx: number) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent, targetIdx: number) => void;
  onPaperDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  /**
   * Fired when the user clicks the empty page body instead of a document
   * object. The payload carries the measured paragraph anchors of *this* page
   * so the resolver can distinguish "above the text on this page" from "on a
   * page that carries no text at all".
   */
  onEmptyAreaClick?: (click: WriterPageClickInput) => void;
  /**
   * WR-008: a deliberate **double** click in free space. Never fires for a double
   * click on text — that stays the browser's native word selection.
   */
  onDirectAlignClick?: (click: WriterDirectCaretInput) => void;
  onKeyboardEntry?: (
    key: string,
    modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  ) => boolean;
  onUpdateTable: (table: TableBlockData) => void;
  onDeleteTable: (tableId: string) => void;
  onOpenTableProperties?: (table: TableBlockData) => void;
  onUpdateImage: (imageId: string, patch: Partial<ImageBlockData>) => void;
  onDeleteImage: (imageId: string) => void;
  onDeleteMedia?: (mediaId: string) => void;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
  onOpenImageProperties?: (image: ImageBlockData) => void;
  onUpdateEquation: (equation: EquationBlockData) => void;
  onDeleteEquation: (equationId: string) => void;
  onOpenEquationModal?: (equation: EquationBlockData) => void;
  onDeleteWorkspaceEmbed?: (embedId: string) => void;
  onOpenWorkspaceEmbedSource?: (embed: WriterWorkspaceEmbed) => void;
  onOpenWorkspaceEmbedAsset?: (embed: WriterWorkspaceEmbed) => void;
  onUpdateShapes?: (shapes: WriterShapeBlockData[]) => void;
  onUpdateHeader: (sectionId: string, text: string, target?: 'default' | 'first' | 'even') => void;
  onUpdateFooter: (sectionId: string, text: string, target?: 'default' | 'first' | 'even') => void;
  onToggleLinkToPrevious?: (sectionId: string, type: 'header' | 'footer') => void;
  onParagraphContextMenu?: (e: React.MouseEvent, pIdx: number) => void;
  /**
   * True while this paper is rendered inside the one rich-text surface.
   *
   * A prop and not a context read: `WriterPagePaper` must stay hook-free, because
   * its keyboard/focus witnesses call it as a plain function (see
   * `writerPagePaperKeyboardWiring.test.tsx`). Passing the fact in keeps that
   * property and still lets the paper behave correctly.
   */
  richTextSurfaceActive?: boolean;
  /** Document zoom in percent; the direct cursor divides it out of its geometry. */
  zoom?: number;
  /**
   * WR-004: header and footer editing is a deliberate mode owned by the page
   * container, not by a permanent input field. `Esc` or a click into the running
   * text closes it.
   */
  headerEditing?: boolean;
  footerEditing?: boolean;
  onRequestHeaderEdit?: () => void;
  onRequestFooterEdit?: () => void;
  onExitRegionEdit?: () => void;
}
export const WriterPagePaper: React.FC<WriterPagePaperProps> = ({
  page,
  totalPages,
  docWordCount,
  viewMode,
  showRuler,
  effectivePageSetup,
  isLight,
  paperBg,
  backgroundColor,
  activeParagraph,
  activeParagraphId,
  rangeFormat,
  paragraphs,
  tables,
  images,
  mediaObjects = [],
  equations,
  workspaceEmbeds = [],
  knownWorkspaceSourceIds,
  shapes,
  footnotes,
  separatedNotes,
  styles,
  styleCatalog,
  draggedPIdx,
  dragOverPIdx,
  showNonPrinting,
  reviewMode,
  reviewerFilter,
  revisions,
  remotePeersByParagraph = {},
  documentTitle,
  readOnly = false,
  onUpdateMargins,
  onUpdateIndent,
  onUpdateTabStops,
  onParagraphChange,
  onTextSelection,
  onSelectParagraph,
  onAddParagraph,
  onSplitParagraph,
  onMergeParagraphBackward,
  rangeSelectionParagraphIds,
  hasRangeSelection,
  onRangeSelectionStart,
  onReplaceRangeSelection,
  onNavigate,
  onBlockedEditAttempt,
  onPastePayload,
  onDeleteParagraph,
  onDragStart,
  onDragOver,
  onDrop,
  onPaperDrop,
  onEmptyAreaClick,
  onDirectAlignClick,
  onKeyboardEntry,
  onUpdateTable,
  onDeleteTable,
  onOpenTableProperties,
  onUpdateImage,
  onDeleteImage,
  onDeleteMedia,
  onOpenExternalUrl,
  onOpenImageProperties,
  onUpdateEquation,
  onDeleteEquation,
  onOpenEquationModal,
  onDeleteWorkspaceEmbed,
  onOpenWorkspaceEmbedSource,
  onOpenWorkspaceEmbedAsset,
  onUpdateShapes,
  onUpdateHeader,
  onUpdateFooter,
  onToggleLinkToPrevious,
  onParagraphContextMenu,
  richTextSurfaceActive = false,
  zoom = 100,
  headerEditing = false,
  footerEditing = false,
  onRequestHeaderEdit,
  onRequestFooterEdit,
  onExitRegionEdit,
}) => {
  const isFirstPage = page.isFirst;
  const insideRichTextSurface = richTextSurfaceActive;
  const isSection = page.sectionId !== 'document-default';
  const pageMargins = getMargins(effectivePageSetup, page.pageIndex);
  const legacyFlowItems: WriterPageFlowItem[] = [];
  if (!page.flowItems) {
    for (const fragment of page.fragments) {
      legacyFlowItems.push({ kind: 'paragraph', fragment });
      if (fragment.isLast) {
        for (const tableFragment of page.tableFragments ?? []) {
          if (tableFragment.anchorParagraphId === fragment.paragraph.id) {
            legacyFlowItems.push({ kind: 'table', fragment: tableFragment });
          }
        }
      }
    }
    for (const tableFragment of page.tableFragments ?? []) {
      if (!tableFragment.anchorParagraphId) {
        legacyFlowItems.push({ kind: 'table', fragment: tableFragment });
      }
    }
  }
  const pageFlowItems = page.flowItems ?? legacyFlowItems;
  /** Shapes whose anchor paragraph is gone stay visible on the page body (WR-034). */
  const paragraphIdsForShapes = new Set(paragraphs.map((paragraph) => paragraph.id));
  const unanchoredShapes = (shapes ?? []).filter(
    (shape) => !shape.anchorParagraphId || !paragraphIdsForShapes.has(shape.anchorParagraphId),
  );
  const pageParagraphIds = pageFlowItems
    .filter((item) => item.kind === 'paragraph')
    .map((item) => item.fragment.paragraph.id);
  const pageBoundary = pageParagraphIds.length > 0
    ? {
        firstParagraphId: pageParagraphIds[0],
        lastParagraphId: pageParagraphIds[pageParagraphIds.length - 1],
      }
    : undefined;
  const pageGeometry = getWriterPageGeometry(effectivePageSetup, page.pageIndex);
  const columnFlowItems = page.columnFlowItems ?? Array.from(
    { length: pageGeometry.columnCount },
    (_, columnIndex) => pageFlowItems.filter((item) => (item.columnIndex ?? 0) === columnIndex),
  );
  const pageSegments: WriterPaginationSectionSegment[] = page.sectionSegments ?? [{
    sectionId: page.sectionId,
    sectionPageIndex: page.sectionPageIndex,
    pageSetup: effectivePageSetup,
    fragments: page.fragments,
    tableFragments: page.tableFragments ?? [],
    flowItems: pageFlowItems,
    columnFlowItems,
    usedFlowHeightPx: page.usedFlowHeightPx,
    availableFlowHeightPx: page.availableFlowHeightPx,
    columnUsedHeightsPx: page.columnUsedHeightsPx ?? [
      Math.min(pageGeometry.bodyHeightPx, page.usedFlowHeightPx),
    ],
  }];
  /**
   * WR-006 … WR-010 — measure once, decide in the pure resolver.
   *
   * The measurement is the only DOM knowledge the direct cursor needs: the real
   * box of every paragraph **on this page and in this column**, its effective line
   * height and its collapsed bottom margin, plus the writable column box. The
   * `zoom` is divided out again in `writerCaretPxToPt`, so a click at 125 % lands on
   * the same model offset as at 100 %.
   */
  const measureDirectCaret = (
    event: React.MouseEvent<HTMLDivElement>,
    intent: WriterDirectCaretIntent,
  ): WriterDirectCaretInput => {
    const body = event.currentTarget;
    const bodyRect = body.getBoundingClientRect();
    /**
     * Native round 6 — a click **below the last line** does not land in a column.
     *
     * The column `<div>` is only as tall as its content, so the free area of a page is the
     * page body itself. `columnElement` fell back to `body`, and the column filter below then
     * rejected *every* anchor (`owner.dataset.writerColumn` vs. `undefined`), which left the
     * measurement empty: the resolver appended a paragraph at the end of the document instead
     * of continuing under the picture. Without a column the pointer's horizontal position
     * chooses the column, which is exactly what the filter does now.
     */
    const clickedColumn = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-writer-column]')
      : null;
    const columnElement: Element = clickedColumn ?? body;
    const columnRect = columnElement.getBoundingClientRect();
    const columnIndex = Number.parseInt(clickedColumn?.dataset?.writerColumn ?? '1', 10) - 1;
    const rawWidth = bodyRect.width > 0 ? bodyRect.width : 624;
    /**
     * Native regression (Runde 4) — the click geometry must not promise more page than the
     * paginator has.
     *
     * `bodyRect.height` is the **rendered** body (padding included, ~920–970 px), while the
     * paginator subtracts `flowReserve` and works with `pageGeometry.bodyHeightPx`
     * (~875 px). The resolver therefore believed there were 50–96 px more room than existed,
     * and a click near the footer produced a `space_before` that forced page 2. The measured
     * height is now capped at the paginator's body height (scaled by the zoom the rect carries).
     */
    const effectiveBodyHeightPx = (pageGeometry.bodyHeightPx * zoom) / 100;
    const rawHeight = bodyRect.height > 0
      ? Math.min(bodyRect.height, effectiveBodyHeightPx)
      : effectiveBodyHeightPx;

    const measured: WriterMeasuredParagraphBox[] = [];
    for (const anchor of Array.from(body.querySelectorAll<HTMLElement>('[data-writer-paragraph-anchor]'))) {
      const paragraphId = anchor.dataset.writerParagraphAnchor ?? '';
      if (paragraphId.length === 0) continue;
      const rect = anchor.getBoundingClientRect();
      // Only the column that was clicked competes for the caret (WR-009).
      const owner = anchor.closest('[data-writer-column]') as HTMLElement | null;
      if (clickedColumn) {
        if (owner && owner !== clickedColumn && owner.dataset.writerColumn !== clickedColumn.dataset.writerColumn) {
          continue;
        }
      } else if (rect.width > 0 && (event.clientX < rect.left - 1 || event.clientX > rect.right + 1)) {
        // Empty paper below the content: the column under the pointer wins, measured by the
        // anchor's own horizontal extent (`0` means "not laid out", e.g. in a headless DOM).
        continue;
      }
      const index = paragraphs.findIndex((paragraph) => paragraph.id === paragraphId);
      const computed = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(anchor)
        : null;
      const parsedLineHeight = computed ? Number.parseFloat(computed.lineHeight) : Number.NaN;
      const parsedMarginBottom = computed ? Number.parseFloat(computed.marginBottom) : Number.NaN;
      const fontSize = computed ? Number.parseFloat(computed.fontSize) : Number.NaN;
      measured.push({
        paragraphId,
        index: index >= 0 ? index : measured.length,
        top: rect.top,
        bottom: rect.height > 0 ? rect.bottom : rect.top + fallbackLineHeight(fontSize),
        left: rect.left,
        right: rect.right,
        lineHeightPx: Number.isFinite(parsedLineHeight) ? parsedLineHeight : fallbackLineHeight(fontSize),
        marginBottomPx: Number.isFinite(parsedMarginBottom) ? Math.max(0, parsedMarginBottom) : 0,
        textLength: paragraphs[index] ? writerParagraphTextLength(paragraphs[index]!) : 0,
        /**
         * Native fix (round 5) — the block is measured with its media.
         *
         * `WriterParagraphItem` renders the text and `WriterTerminalImageLayer` the picture
         * inside the same `[data-writer-paragraph-anchor]`. The resolver must know that the
         * empty paragraph below the picture is not "the next free line", or a click under the
         * image puts the caret above it.
         *
         * Native fix (round 6) — the flag comes from the **model** as well.
         *
         * The native re-probe still typed above the picture, which is only possible when this
         * flag was `false`: the DOM query depends on which layer happens to draw the object.
         * `images`, `mediaObjects` and `shapes` already know what is anchored where, so the
         * measurement no longer depends on a component's markup.
         */
        hasMedia: isWriterMediaElement(anchor)
          || paragraphCarriesWriterMedia(paragraphId, { images, mediaObjects, shapes }),
      });
    }

    return {
      measured,
      pointer: { x: event.clientX, y: event.clientY },
      column: {
        top: bodyRect.top,
        bottom: bodyRect.top + rawHeight,
        left: columnRect.width > 0 ? columnRect.left : bodyRect.left,
        right: columnRect.width > 0 ? columnRect.right : bodyRect.left + rawWidth,
      },
      columnIndex: Number.isFinite(columnIndex) ? Math.max(0, columnIndex) : 0,
      pageIndex: page.pageIndex,
      zoom,
      defaultLineHeightPx: fallbackLineHeight(Number.NaN),
      paragraphCount: paragraphs.length,
      intent,
    };
  };

  const handlePageBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !onEmptyAreaClick) return;
    const target = event.target;
    const direct = measureDirectCaret(event, 'normal');
    if (target instanceof HTMLElement) {
      /**
       * WR-005 — the hitbox prioritises the text surface.
       *
       * A click that landed **on rendered text** already placed a character-exact
       * DOM caret; overriding it here would jump the caret to the end of the
       * nearest paragraph. Only clicks on genuinely empty paper area are ours.
       *
       * Decorative layers must never swallow the click, so the filter names real
       * interactive objects only: form fields, buttons, links, images, tables and the
       * editable paragraph fragments.
       *
       * **`[contenteditable="false"]` was wrong here** (native round 5). The media islands are
       * wrapped in such a div, so a click in the padding/margin *around* a picture — or beside a
       * centred image — was silently discarded and the layer below the picture stayed
       * unusable. The real interactive elements below already protect text entry.
       */
      if (target.closest('textarea, input, button, a, img, svg, table')) {
        return;
      }
      /**
       * Text islands keep their old behaviour; **media islands are click-through**.
       *
       * Footnotes, equations, embeds and tables are `contenteditable="false"` blocks with text
       * that must not create a paragraph when clicked. The media wrappers are the exception —
       * their padding and margins belong to the page. `isWriterTextIsland` also recognises an
       * island that *is* the marked element, which the previous `querySelector` could never see
       * (native round 6).
       */
      if (isWriterTextIsland(target)) {
        return;
      }
      /**
       * Native round 6 — the **media band** inside a paragraph is clickable paper.
       *
       * Clicking below the picture of a paragraph whose box grew over the picture used to hit
       * that paragraph's own text fragment and was discarded as "a click on text": the caret
       * stayed on the paragraph's first line, i.e. *above* the picture, and the caption was
       * typed there. Inside the media band the click is the page's, not the text's.
       */
      const fragment = target.closest('[data-writer-surface-paragraph]');
      if (fragment) {
        const paragraphId = fragment.getAttribute('data-writer-surface-paragraph') ?? '';
        const box = direct.measured.find((candidate) => candidate.paragraphId === paragraphId);
        if (!box || !isWriterMediaBand(box, event.clientY)) return;
      }
    }
    const anchors = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[data-writer-paragraph-anchor]'),
    )
      .map((anchor) => {
        const rect = anchor.getBoundingClientRect();
        return {
          paragraphId: anchor.dataset.writerParagraphAnchor ?? '',
          top: rect.top,
          left: rect.left,
          right: rect.right,
        };
      })
      .filter((anchor) => anchor.paragraphId.length > 0);
    onEmptyAreaClick({
      paragraphs,
      pageParagraphIds: anchors.map((anchor) => anchor.paragraphId),
      nearestParagraphId: resolveNearestWriterParagraphAnchor(anchors, event.clientY, event.clientX),
      direct,
    });
  };

  /**
   * WR-008 — a **double** click in free space is the deliberate alignment gesture.
   *
   * A double click **on text** never reaches here: the target filter returns early,
   * so the browser's native word selection stands and the paragraph alignment is
   * untouched.
   */
  const handlePageBodyDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !onDirectAlignClick) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      // No `[contenteditable="false"]` filter either: see `handlePageBodyClick` — the media
      // islands are exactly the area that has to keep working (native round 5). Text islands
      // (footnotes, equations, embeds) still refuse the gesture.
      if (target.closest('textarea, input, button, a, img, svg, table')) return;
      if (isWriterTextIsland(target)) return;
      /**
       * WR-008: a double click **on existing text** is the browser's word selection.
       *
       * The exclusion is deliberately limited to paragraphs that carry text. The
       * first click of this very gesture creates an **empty** paragraph right under
       * the pointer; filtering every fragment would swallow the alignment gesture
       * that is supposed to land on exactly that paragraph.
       */
      if (target.closest('[data-writer-surface-paragraph]:not([data-writer-paragraph-empty="true"])')) return;
    }
    onDirectAlignClick(measureDirectCaret(event, 'direct-align'));
  };
  const renderFlowItem = (flowItem: WriterPageFlowItem): React.ReactNode => {
    if (flowItem.kind === 'table') {
      return (
        // A table is an object, not document text: non-editable island so the
        // browser cannot put a caret between cells or delete one by accident.
        <div key={`table:${flowItem.fragment.key}`} data-writer-flow-item="table" contentEditable={false}>
          {renderTableFragment(
            flowItem.fragment,
            tables,
            styleCatalog,
            onUpdateTable,
            onDeleteTable,
            onOpenTableProperties,
            readOnly,
          )}
        </div>
      );
    }
    const fragment = flowItem.fragment;
    const p = fragment.paragraph;
    const pIdx = paragraphs.findIndex((item) => item.id === p.id);
    /**
     * WR-017 (native M4 probe) — the islands around a paragraph are rendered only when
     * this paragraph actually carries something.
     *
     * Before, every paragraph was wrapped in `<div contenteditable="false">` islands for
     * the anchored-image, terminal-image and media layers, even when those layers
     * rendered nothing. Chromium does not step the caret across a
     * `contenteditable="false"` element, so arrow keys died at **every** paragraph
     * boundary while the toolbar still worked.
     */
    /**
     * WR-033 (native M7 re-probe) — **the image layer was never mounted.**
     *
     * The page used its own predicate to decide whether a paragraph carries an image, and it
     * asked `isWriterImageFixedToPage` for the *terminal* layer. That layer renders exactly the
     * images that are **not** fixed to the page, so the answer was `false` for every normally
     * imported image: `WriterTerminalImageLayer` mounted on no page at all and the picture stayed
     * 100 % invisible until its anchor paragraph was deleted (then the unanchored fallback below
     * rendered it). Both predicates now come from `writerImageLayerSelection`, the same module the
     * layers filter with — a page can no longer disagree with the layer it mounts.
     */
    const hasAnchoredImage = hasWriterImageInAnchoredLayer(images, p.id, fragment);
    const hasTerminalImage = hasWriterImageInTerminalLayer(images, p.id);
    const hasMediaObject = mediaObjects.some((media) => media.anchorParagraphId === p.id);
    /**
     * WR-034 — an anchored shape is drawn **at its paragraph**, not at the column end.
     *
     * The canvas used to be appended after all paragraphs, so a shape inserted "here"
     * appeared at the bottom of the page and could hang over the footer. The subset is
     * scoped: the canvas only ever sees this paragraph's shapes, and the merge below puts
     * them back into the document's full list (including deletions).
     */
    const paragraphShapes = (shapes ?? []).filter((shape) => shape.anchorParagraphId === p.id);
    const updateParagraphShapes = (updated: WriterShapeBlockData[]): void => {
      if (!onUpdateShapes) return;
      const updatedById = new Map(updated.map((shape) => [shape.id, shape]));
      const removedIds = new Set(
        paragraphShapes.filter((shape) => !updatedById.has(shape.id)).map((shape) => shape.id),
      );
      const next = (shapes ?? [])
        .filter((shape) => !removedIds.has(shape.id))
        .map((shape) => updatedById.get(shape.id) ?? shape);
      onUpdateShapes(next);
    };
    return (
      <div
        key={`paragraph:${fragment.key}`}
        className="relative"
        data-writer-flow-item="paragraph"
        data-writer-paragraph-anchor={p.id}
      >
        {hasAnchoredImage && (
          <div contentEditable={false}>
            <WriterAnchoredImageLayer
              images={images}
              paragraph={p}
              fragment={fragment}
              pageGeometry={pageGeometry}
              styles={styles}
              readOnly={readOnly}
              onUpdateImage={onUpdateImage}
              onDeleteImage={onDeleteImage}
              onOpenImageProperties={onOpenImageProperties}
            />
          </div>
        )}
        <WriterParagraphItem
          paragraph={p}
          paragraphIndex={pIdx}
          allParagraphs={paragraphs}
          styles={styles}
          isLight={isLight}
          activeParagraphId={activeParagraphId}
          draggedPIdx={draggedPIdx}
          dragOverPIdx={dragOverPIdx}
          showNonPrinting={showNonPrinting}
          reviewMode={reviewMode}
          reviewerFilter={reviewerFilter}
          revisions={revisions}
          remotePeers={remotePeersByParagraph[p.id] ?? []}
          footnotes={footnotes}
          onParagraphChange={onParagraphChange}
          onTextSelection={onTextSelection}
          onSelectParagraph={onSelectParagraph}
          onAddParagraph={onAddParagraph}
          onSplitParagraph={onSplitParagraph}
          onMergeParagraphBackward={onMergeParagraphBackward}
          rangeSelectionParagraphIds={rangeSelectionParagraphIds}
          hasRangeSelection={hasRangeSelection}
          onRangeSelectionStart={onRangeSelectionStart}
          onReplaceRangeSelection={onReplaceRangeSelection}
          onNavigate={onNavigate}
          pageBoundary={pageBoundary}
          onBlockedEditAttempt={onBlockedEditAttempt}
          onPastePayload={onPastePayload}
          onDeleteParagraph={onDeleteParagraph}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={onParagraphContextMenu}
          readOnly={readOnly}
          fragment={fragment}
        />
        {fragment.isLast && hasTerminalImage && (
          <div contentEditable={false}>
            <WriterTerminalImageLayer
              images={images}
              anchorParagraphId={p.id}
              pageGeometry={pageGeometry}
              readOnly={readOnly}
              onUpdateImage={onUpdateImage}
              onDeleteImage={onDeleteImage}
              onOpenImageProperties={onOpenImageProperties}
            />
          </div>
        )}
        {fragment.isLast && hasMediaObject && (
          <div contentEditable={false}>
            <WriterMediaObjectLayer mediaObjects={mediaObjects} paragraphs={paragraphs} anchorParagraphId={p.id} readOnly={readOnly} onDeleteMedia={onDeleteMedia} onOpenExternalUrl={onOpenExternalUrl} />
          </div>
        )}
        {fragment.isLast && paragraphShapes.length > 0 && onUpdateShapes && (
          <div contentEditable={false} data-writer-shape-anchor={p.id}>
            <WriterShapeCanvas shapes={paragraphShapes} onUpdateShapes={updateParagraphShapes} readOnly={readOnly} zoom={zoom} />
          </div>
        )}
        {fragment.isLast && equations
          .filter((eq) => eq.anchorParagraphId === p.id)
          .map((eq) => (
            <div key={eq.id} contentEditable={false}>
              <WriterEquationBlock
                equation={eq}
                onUpdateEquation={onUpdateEquation}
                onDeleteEquation={onDeleteEquation}
                onOpenEditor={onOpenEquationModal}
                readOnly={readOnly}
              />
            </div>
          ))}
        {fragment.isLast && workspaceEmbeds
          .filter((embed) => embed.anchorParagraphId === p.id)
          .map((embed) => (
            <div key={embed.id} contentEditable={false}>
              <WriterWorkspaceEmbedBlock
                embed={embed}
                readOnly={readOnly}
                sourcePresence={
                  knownWorkspaceSourceIds
                    ? (knownWorkspaceSourceIds.has(embed.sourceDocumentId) ? 'available' : 'missing')
                    : 'unknown'
                }
                onOpenSource={onOpenWorkspaceEmbedSource ? () => onOpenWorkspaceEmbedSource(embed) : undefined}
                onOpenAsset={embed.kind === 'vault-asset' && onOpenWorkspaceEmbedAsset ? () => onOpenWorkspaceEmbedAsset(embed) : undefined}
                onDelete={onDeleteWorkspaceEmbed ? () => onDeleteWorkspaceEmbed(embed.id) : undefined}
              />
            </div>
          ))}
      </div>
    );
  };
  return (
    <div className="relative flex flex-col items-start">
      {/* Horizontal Measuring Ruler */}
      {showRuler && viewMode === 'print' && (
        // WR-002: ruler chrome is a non-editable island inside the surface.
        <div contentEditable={false} className="flex items-center gap-1 mb-1 select-none">
          <div
            data-vgt-workspace-chrome="ruler"
            className="bg-slate-900 border border-white/10 rounded-tl-sm flex items-center justify-center text-[0.5625rem] font-mono text-slate-500 shadow-inner shrink-0"
            style={{ width: '20px', height: '24px' }}
            title="Tab-Stopp"
          >
            <span className="text-slate-400 font-bold">L</span>
          </div>
          <WriterRuler
            pageSetup={effectivePageSetup}
            tabStops={activeParagraph?.style.tab_stops ?? []}
            firstLineIndentMm={activeParagraph?.style.first_line_indent_mm ?? 0}
            leftIndentMm={activeParagraph?.style.left_indent_mm ?? 0}
            rightIndentMm={activeParagraph?.style.right_indent_mm ?? 0}
            mixedIndentMm={{
              firstLine: rangeFormat?.firstLineIndentMm.mixed ?? false,
              left: rangeFormat?.leftIndentMm.mixed ?? false,
            }}
            mixedTabStops={rangeFormat?.tabStops.mixed ?? false}
            onUpdateMargins={onUpdateMargins}
            onUpdateIndent={onUpdateIndent}
            onUpdateTabStops={onUpdateTabStops}
            zoom={100}
            showRuler={showRuler}
          />
        </div>
      )}
      {/* Paper Row: Left Vertical Ruler + Page Paper */}
      <div className="relative flex items-start gap-1">
        {showRuler && viewMode === 'print' && (
          // WR-002: the ruler lives inside the one contentEditable root; it must be
          // an island so the browser never treats it as document text.
          <div contentEditable={false}>
            <WriterVerticalRuler
              pageSetup={effectivePageSetup}
              onUpdateMargins={onUpdateMargins}
              zoom={100}
              showRuler={showRuler}
            />
          </div>
        )}
        <div
          style={{
            ...getPageDimensionStyle(effectivePageSetup, viewMode),
            ...getMarginPadding(effectivePageSetup, page.pageIndex),
            backgroundColor,
          }}
          className={`relative flex flex-col justify-between rounded-sm border border-black/10 transition-all select-text overflow-hidden ${paperBg}`}
          onDragOver={(e) => {
            // A drop target has to cancel `dragover`, otherwise the browser never
            // fires `drop` and performs its default action instead — navigating to
            // the dropped file and leaving the application. Cancelling here lets
            // `onPaperDrop` decide what to accept.
            e.preventDefault();
          }}
          onDrop={onPaperDrop}
        >
          {effectivePageSetup.pageBorders && (
            <div
              aria-hidden="true"
              contentEditable={false}
              // WR-005: a decorative layer must never swallow a pointer event. The
              // page border is drawn above the text for visibility, so it is
              // explicitly transparent to the hit test.
              className="pointer-events-none z-30"
              style={getPageBorderStyle(effectivePageSetup)}
            />
          )}
          {/* Watermark Overlay */}
          {effectivePageSetup.watermark?.enabled && effectivePageSetup.watermark.text && (
            <div
              contentEditable={false}
              className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0"
              style={{
                opacity: effectivePageSetup.watermark.opacity ?? 0.12,
                transform: `rotate(${effectivePageSetup.watermark.rotationDeg ?? -45}deg)`,
              }}
            >
              <span
                className="font-black text-slate-900 dark:text-white tracking-widest whitespace-nowrap"
                style={{
                  fontSize: '72px',
                  color: effectivePageSetup.watermark.color || '#64748b',
                }}
              >
                {effectivePageSetup.watermark.text}
              </span>
            </div>
          )}

          <div contentEditable={false}>
            <WriterFixedImageLayer
              images={images}
              page={page}
              pageGeometry={pageGeometry}
              readOnly={readOnly}
              onUpdateImage={onUpdateImage}
              onDeleteImage={onDeleteImage}
              onOpenImageProperties={onOpenImageProperties}
            />
          </div>

          {/* Header Region: passive by default, editable only on request (WR-003/WR-004) */}
          {viewMode === 'print' && (
            <WriterPageHeaderFooter
              type="header"
              pageIndex={page.displayPageNumber}
              displayPageNumberString={page.displayPageNumberString}
              physicalPageIndex={page.pageIndex}
              sectionPageIndex={page.sectionPageIndex}
              totalPages={totalPages}
              documentTitle={documentTitle}
              wordCount={docWordCount}
              pageSetup={effectivePageSetup}
              isSection={isSection}
              editing={headerEditing}
              readOnly={readOnly}
              onRequestEdit={onRequestHeaderEdit}
              onExitEdit={onExitRegionEdit}
              onUpdateHeader={(text, target) => onUpdateHeader(page.sectionId, text, target)}
              onToggleLinkToPrevious={onToggleLinkToPrevious ? (t) => onToggleLinkToPrevious(page.sectionId, t) : undefined}
            />
          )}

          {/* Page Body */}
          <div
            data-writer-page-body="true"
            className="relative z-10 flex flex-1 flex-col items-stretch outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
            onClick={handlePageBodyClick}
            // WR-008: only a *double* click in free space may set an alignment; a
            // double click on text is the browser's native word selection and is
            // filtered out inside the handler.
            onDoubleClick={handlePageBodyDoubleClick}
            // AST-0001: die Seite ist per Tastatur erreichbar. tabIndex macht sie fokussierbar; ohne
            // ihn gäbe es keinen Tastaturweg in ein leeres Dokument.
            // Der Fokusring folgt der Konvention des Baums (focus-visible:ring-2
            // focus-visible:ring-blue-400/70, 306 Vorkommen). tabIndex allein macht fokussierbar, aber
            // nicht sichtbar — und ein grosser Bereich braucht einen gestalteten Ring, keinen
            // geliehenen (WCAG 2.2 · 2.4.11 Focus Not Obscured).
            //
            // WR-001/WR-010: inside the rich-text surface the **surface root** is
            // the one tab stop and the one caret authority. A second focusable layer
            // between the body and the text would steal focus on the first click and
            // leave the user without a visible caret.
            tabIndex={insideRichTextSurface ? undefined : 0}
            onKeyDown={insideRichTextSurface ? undefined : (event) => {
              // `preventDefault` nur, wenn der Einstieg den Tastendruck wirklich übernommen hat —
              // sonst würden Ctrl+S, F5 und Tab verschluckt.
              if (
                !readOnly
                && onKeyboardEntry?.(event.key, {
                  ctrlKey: event.ctrlKey,
                  metaKey: event.metaKey,
                  altKey: event.altKey,
                })
              ) {
                event.preventDefault();
              }
            }}
          >
            {pageSegments.map((segment, segmentIndex) => {
              const segmentGeometry = getWriterPageGeometry(segment.pageSetup, page.pageIndex);
              return (
                <div
                  key={`segment:${segment.sectionId}:${segment.sectionPageIndex}`}
                  data-writer-section={segment.sectionId}
                  className="grid items-start"
                  style={{
                    gridTemplateColumns: segmentGeometry.columnWidthsPx?.map((width) => `${width}px`).join(' '),
                    columnGap: `${segmentGeometry.columnGapPx}px`,
                  }}
                >
                  {segment.columnFlowItems.map((items, columnIndex) => (
                    <div
                      key={`segment:${segment.sectionId}:column:${columnIndex}`}
                      data-writer-column={columnIndex + 1}
                      className="relative min-w-0"
                    >
                      {items.map(renderFlowItem)}
                      {segmentIndex === 0 && columnIndex === 0 && isFirstPage && images
                        .filter((img) => (!img.anchorParagraphId || !paragraphs.some((p) => p.id === img.anchorParagraphId)) && !isWriterImageFixedToPage(img))
                        .map((img) => (
                          <div key={img.id} contentEditable={false}>
                            <WriterImageBlock
                              image={img}
                              onUpdate={(patch) => onUpdateImage(img.id, patch)}
                              onDelete={() => onDeleteImage(img.id)}
                              onOpenProperties={onOpenImageProperties ? () => onOpenImageProperties(img) : undefined}
                              readOnly={readOnly}
                              pageGeometry={pageGeometry}
                            />
                          </div>
                        ))}
                      {segmentIndex === 0 && columnIndex === 0 && isFirstPage && (
                        <div contentEditable={false}>
                          <WriterMediaObjectLayer mediaObjects={mediaObjects} paragraphs={paragraphs} unanchored readOnly={readOnly} onDeleteMedia={onDeleteMedia} onOpenExternalUrl={onOpenExternalUrl} />
                        </div>
                      )}
                      {/* WR-034: only shapes without a (living) anchor stay on the page body. */}
                      {segmentIndex === 0 && columnIndex === 0 && unanchoredShapes.length > 0 && onUpdateShapes && (
                        <div contentEditable={false}>
                          <WriterShapeCanvas shapes={unanchoredShapes} zoom={zoom} onUpdateShapes={(updated) => {
                            const updatedById = new Map(updated.map((shape) => [shape.id, shape]));
                            const removedIds = new Set(unanchoredShapes.filter((shape) => !updatedById.has(shape.id)).map((shape) => shape.id));
                            onUpdateShapes((shapes ?? [])
                              .filter((shape) => !removedIds.has(shape.id))
                              .map((shape) => updatedById.get(shape.id) ?? shape));
                          }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Footnotes & Endnotes — non-editable islands inside the surface */}
          <div contentEditable={false}>
            {renderPageFootnotes(getPageFootnotes(
              page.fragments.filter((fragment) => fragment.isLast).map((fragment) => fragment.paragraph),
              separatedNotes.footnotes,
            ))}
            {page.pageIndex === totalPages && renderDocumentEndnotes(separatedNotes.endnotes)}
          </div>

          {/* Footer Region: passive by default, editable only on request (WR-003/WR-004) */}
          {viewMode === 'print' && (
            <WriterPageHeaderFooter
              type="footer"
              pageIndex={page.displayPageNumber}
              displayPageNumberString={page.displayPageNumberString}
              physicalPageIndex={page.pageIndex}
              sectionPageIndex={page.sectionPageIndex}
              totalPages={totalPages}
              documentTitle={documentTitle}
              wordCount={docWordCount}
              pageSetup={effectivePageSetup}
              isSection={isSection}
              editing={footerEditing}
              readOnly={readOnly}
              onRequestEdit={onRequestFooterEdit}
              onExitEdit={onExitRegionEdit}
              onUpdateFooter={(text, target) => onUpdateFooter(page.sectionId, text, target)}
              onToggleLinkToPrevious={onToggleLinkToPrevious ? (t) => onToggleLinkToPrevious(page.sectionId, t) : undefined}
            />
          )}

          {/* Margin & Alignment Guidelines */}
          {showNonPrinting && (
            <div
              aria-hidden="true"
              contentEditable={false}
              className="pointer-events-none absolute border border-dashed border-blue-400/30 z-10"
              style={{
                top: `${(pageMargins.top * 96) / 25.4}px`,
                bottom: `${(pageMargins.bottom * 96) / 25.4}px`,
                left: `${(pageMargins.left * 96) / 25.4}px`,
                right: `${(pageMargins.right * 96) / 25.4}px`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
