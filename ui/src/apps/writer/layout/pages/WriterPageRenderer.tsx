// STATUS: DIAMANT VGT SUPREME — Sovereign Paginated Paper Canvas & View Modes Engine
import React, { useEffect, useMemo, useState } from 'react';
import type { WriterCollaborationPeer } from '../../collaboration/types/writerCollaborationTypes';
import type {
  Paragraph,
  WriterSectionDefinition,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterTabStop,
  WriterShapeBlockData,
  WriterWorkspaceEmbed,
  WriterLanguageTag,
  WriterMediaObjectData,
} from '../../../../shared/contracts/workspace';
import type {
  CustomMargins,
  EquationBlockData,
  FootnoteItem,
  ImageBlockData,
  PageSetupConfig,
  ReviewMode,
  ReviewerFilter,
  TableBlockData,
  TrackChangeRevision,
  ViewMode,
} from '../../types';
import { paginateWriterSections } from '../pagination/writerPagination';
import type { WriterDirectCaretInput, WriterPageClickInput } from '../../editing/caret/writerCaretTargeting';
import { resolveWriterParagraphLineCount } from '../../editing/paragraphs/writerParagraphLineCount';
import type { WriterClipboardParagraph } from '../../editing/clipboard/writerClipboardPayload';
import type { WriterSelectionRange } from '../../editing/selection/writerSelectionRange';
import { recalculateNotes } from '../../references/notes/writerNotesEngine';
import { WriterSpecialViews } from '../special-views/WriterSpecialViews';
import { WriterPagePaper } from './WriterPagePaper';
import { WriterRichTextSurface } from '../../editor/surface/WriterRichTextSurface';
import {
  EMPTY_WRITER_SEARCH_HIGHLIGHTS,
  type WriterSearchHighlightMap,
} from '../../productivity/search/writerSearchHighlights';
import type { WriterRangeFormatState } from '../../formatting/range/writerRangeFormatState';
import { resolveWriterShapesForPageIndex } from '../../media/objects/shapes/writerShapeOperations';
import {
  resolveWriterPageBackgroundColor,
  writerPageBackgroundIsLight,
} from '../../../../shared/writer/layout/pageDecorations';

export interface WriterPageRendererProps {
  paragraphs: Paragraph[];
  tables: TableBlockData[];
  images: ImageBlockData[];
  mediaObjects?: WriterMediaObjectData[];
  equations: EquationBlockData[];
  workspaceEmbeds?: WriterWorkspaceEmbed[];
  /** Ids of workspace documents that still exist; `undefined` means the caller cannot know (W-245). */
  knownWorkspaceSourceIds?: ReadonlySet<string>;
  defaultLanguage?: WriterLanguageTag;
  footnotes: FootnoteItem[];
  styles: WriterStyleDefinition[];
  styleCatalog: WriterStyleCatalog;
  pageSetup: PageSetupConfig;
  sections: WriterSectionDefinition[];
  viewMode: ViewMode;
  zoom: number;
  isTwoPageSpread?: boolean;
  showRuler?: boolean;
  onUpdateMargins?: (margins: CustomMargins) => void;
  activeParagraphId: string | null;
  activeParagraph?: Paragraph;
  /**
   * What the marked range carries. The ruler marks a value the covered
   * paragraphs disagree on instead of showing one of them as if it were all of
   * them (W-119).
   */
  rangeFormat?: WriterRangeFormatState;
  onUpdateIndent?: (indent: { firstLineMm?: number; leftMm?: number; rightMm?: number }) => void;
  onUpdateTabStops?: (tabStops: WriterTabStop[]) => void;
  draggedPIdx: number | null;
  dragOverPIdx: number | null;
  showNonPrinting: boolean;
  reviewMode: ReviewMode;
  reviewerFilter?: ReviewerFilter;
  revisions: TrackChangeRevision[];
  remotePeersByParagraph?: Readonly<Record<string, readonly WriterCollaborationPeer[]>>;
  readOnly?: boolean;
  documentTitle: string;
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
  onEmptyAreaClick?: (click: WriterPageClickInput) => void;
  /** WR-008: a deliberate double click in free space (never on text). */
  onDirectAlignClick?: (click: WriterDirectCaretInput) => void;
  onKeyboardEntry?: (
    key: string,
    modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  ) => boolean;
  onDeleteParagraph: (pIdx: number) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent, targetIdx: number) => void;
  onPaperDrop: (e: React.DragEvent<HTMLDivElement>) => void;
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
  onUpdateHeader: (sectionId: string, text: string, target?: 'default' | 'first' | 'even') => void;
  onUpdateFooter: (sectionId: string, text: string, target?: 'default' | 'first' | 'even') => void;
  onToggleLinkToPrevious?: (sectionId: string, type: 'header' | 'footer') => void;
  onIndentListLevel?: (pIdx: number, delta?: number) => void;
  onOutdentListLevel?: (pIdx: number) => void;
  onExitListMode?: (pIdx: number) => void;
  shapes?: readonly WriterShapeBlockData[];
  onUpdateShapes?: (updated: WriterShapeBlockData[]) => void;
  onParagraphContextMenu?: (e: React.MouseEvent, pIdx: number) => void;
  /**
   * The rich-text surface reports its DOM selection here. This is the only path
   * from a DOM range into the editor state, so the caret and the marked range
   * always describe what the user actually selected on screen.
   */
  onSurfaceSelectionChange?: (range: WriterSelectionRange | null) => void;
  /** Replace a range the surface owns (multi-paragraph selection, paste). */
  onReplaceSurfaceRange?: (range: WriterSelectionRange, replacement: string) => void;
  /** Ask for a re-projection after the DOM stopped matching the model. */
  onRequestProjectionRepair?: () => void;
  /** WR-019: paste a parsed clipboard payload (formatting included). */
  onPasteSurfaceRange?: (range: WriterSelectionRange, blocks: readonly WriterClipboardParagraph[]) => void;
  /** WR-020: the surface forwards the browser's own history commands. */
  onUndo?: () => void;
  onRedo?: () => void;
  /** WR-025: Shift+F10 / ContextMenu opens the text menu at the caret. */
  onRequestContextMenu?: () => void;
  /** WR-033: an image pasted into the surface. */
  onInsertImageFile?: (file: File) => void;
  /** WR-035: `Strg+Klick` on a link reuses the existing external-URL callback. */
  /** WR-036: paragraphs and ranges the find bar marked. */
  searchHighlights?: WriterSearchHighlightMap;
}

export const WriterPageRenderer: React.FC<WriterPageRendererProps> = ({
  paragraphs,
  tables,
  images,
  mediaObjects = [],
  equations,
  workspaceEmbeds = [],
  knownWorkspaceSourceIds,
  defaultLanguage = 'de-DE',
  shapes,
  footnotes,
  styles,
  styleCatalog,
  pageSetup,
  sections,
  viewMode,
  zoom,
  isTwoPageSpread = false,
  showRuler = true,
  onUpdateMargins,
  activeParagraphId,
  rangeFormat,
  activeParagraph,
  onUpdateIndent,
  onUpdateTabStops,
  draggedPIdx,
  dragOverPIdx,
  showNonPrinting,
  reviewMode,
  reviewerFilter = 'all',
  revisions,
  remotePeersByParagraph = {},
  readOnly = false,
  documentTitle,
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
  onEmptyAreaClick,
  onDirectAlignClick,
  onKeyboardEntry,
  onIndentListLevel,
  onOutdentListLevel,
  onExitListMode,
  onDeleteParagraph,
  onDragStart,
  onDragOver,
  onDrop,
  onPaperDrop,
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
  onSurfaceSelectionChange,
  onReplaceSurfaceRange,
  onPasteSurfaceRange,
  onUndo,
  onRedo,
  onRequestContextMenu,
  onInsertImageFile,
  searchHighlights = EMPTY_WRITER_SEARCH_HIGHLIGHTS,
  onRequestProjectionRepair,
}) => {
  const separatedNotes = useMemo(() => recalculateNotes(paragraphs, footnotes), [paragraphs, footnotes]);
  /**
   * WR-003/WR-004 — header and footer editing is a **deliberate** mode.
   *
   * It lives here and not in `WriterPagePaper` because that component must stay
   * hook-free (its keyboard witness calls it as a plain function), and because only
   * one zone of one sheet can be edited at a time. `Esc` and any click that leaves
   * the zone end the mode; a single click in the running text can never enter it.
   *
   * Native round 6 — the mode also names **which sheet** it belongs to.
   *
   * `'header'` alone made every page render an active `<input>`, and the last page's
   * effect ran last: double-clicking the header of page 1 focused the field on page N,
   * and the browser scrolled to the end of the document. The mode is now addressed to a
   * page, so exactly one field exists and exactly one page can take the focus.
   */
  const [editingRegion, setEditingRegion] = useState<{
    region: 'header' | 'footer';
    pageIndex: number;
  } | null>(null);
  useEffect(() => {
    if (!editingRegion) return undefined;
    if (typeof document === 'undefined') return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setEditingRegion(null);
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const element = target instanceof HTMLElement ? target : target.parentElement;
      if (element?.closest('[data-writer-header-zone], [data-writer-footer-zone]')) return;
      setEditingRegion(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown, true);
    };
  }, [editingRegion]);

  const pages = useMemo(() => {
    if (viewMode === 'continuous' || viewMode === 'draft') {
      return [{
        id: 'page-1',
        pageIndex: 1,
        paragraphs,
        fragments: paragraphs.map((paragraph) => ({
          key: `${paragraph.id}:complete`,
          paragraph,
          startOffset: 0,
          endOffset: paragraph.spans.reduce((length, span) => length + span.text.length, 0),
          // The continuous view has no pagination, so the line count has to be
          // estimated from the text. A hardcoded 1 clipped every long paragraph
          // to a single visible line.
          lineCount: resolveWriterParagraphLineCount({
            text: paragraph.spans.map((span) => span.text).join(''),
            headingLevel: paragraph.style.heading_level,
          }),
          isFirst: true,
          isLast: true,
        })),
        tableFragments: tables.map((tbl) => ({
          key: `${tbl.id}:full`,
          tableId: tbl.id,
          table: tbl,
          startRowIndex: 0,
          endRowIndex: tbl.rows.length,
          isFirstFragment: true,
          isLastFragment: true,
          repeatHeader: false,
          anchorParagraphId: tbl.anchorParagraphId,
        })),
        usedFlowHeightPx: 0,
        availableFlowHeightPx: Number.POSITIVE_INFINITY,
        isFirst: true,
        pageSetup,
        sectionId: 'document-default',
        sectionPageIndex: 1,
        displayPageNumber: 1,
        displayPageNumberString: '1',
      }];
    }

    return paginateWriterSections(paragraphs, pageSetup, styles, sections, {
      tables,
      images,
      mediaObjects,
      equations,
      footnotes,
      workspaceEmbeds,
      defaultLanguage,
    });
  }, [defaultLanguage, equations, footnotes, images, mediaObjects, paragraphs, pageSetup, sections, styles, tables, viewMode, workspaceEmbeds]);
  // `knownWorkspaceSourceIds` deliberately does not appear above: the paginator never sees it. It travels
  // straight to the embed block in the render path, so a change of source availability re-renders the state
  // badge without repaginating the document.

  const totalPages = pages.length;
  const docWordCount = useMemo(
    () => paragraphs.reduce((acc, p) => acc + p.spans.reduce((w, s) => w + s.text.split(/\s+/).filter(Boolean).length, 0), 0),
    [paragraphs]
  );

  // Special View Modes: Outline, Reading & Draft
  if (viewMode === 'outline' || viewMode === 'reading' || viewMode === 'draft') {
    return (
      <WriterSpecialViews
        viewMode={viewMode}
        documentTitle={documentTitle}
        paragraphs={paragraphs}
        pages={pages}
        zoom={zoom}
        styles={styles}
        activeParagraphId={activeParagraphId}
        draggedPIdx={draggedPIdx}
        dragOverPIdx={dragOverPIdx}
        showNonPrinting={showNonPrinting}
        reviewMode={reviewMode}
        revisions={revisions}
        remotePeersByParagraph={remotePeersByParagraph}
        readOnly={readOnly}
        onParagraphChange={onParagraphChange}
        onTextSelection={onTextSelection}
        onSelectParagraph={onSelectParagraph}
        onAddParagraph={onAddParagraph}
        onDeleteParagraph={onDeleteParagraph}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onIndentListLevel={onIndentListLevel}
        onOutdentListLevel={onOutdentListLevel}
        onExitListMode={onExitListMode}
        onParagraphContextMenu={onParagraphContextMenu}
        tables={tables}
        images={images}
        equations={equations}
        shapes={shapes}
        styleCatalog={styleCatalog}
        onUpdateTable={onUpdateTable}
        onDeleteTable={onDeleteTable}
        onOpenTableProperties={onOpenTableProperties}
        onUpdateImage={onUpdateImage}
        onDeleteImage={onDeleteImage}
        onOpenImageProperties={onOpenImageProperties}
        onUpdateEquation={onUpdateEquation}
        onDeleteEquation={onDeleteEquation}
        onOpenEquationModal={onOpenEquationModal}
        onUpdateShapes={onUpdateShapes}
      />
    );
  }

  // View Mode: Print (WYSIWYG Paginated) & Continuous View
  const containerLayout = isTwoPageSpread
    ? 'flex flex-row flex-wrap justify-center items-start gap-8'
    : 'flex flex-col items-center gap-8';

  return (
    <WriterRichTextSurface
      // The pages keep their exact layout: the surface **is** the pages
      // container, so no extra wrapper changes the paper geometry.
      className={`${containerLayout} transition-transform duration-150 origin-top motion-reduce:transition-none`}
      style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
      paragraphs={paragraphs}
      readOnly={readOnly}
      ariaLabel={`Dokumenttext – ${documentTitle}`}
      language={defaultLanguage}
      onSelectionChange={onSurfaceSelectionChange ?? (() => undefined)}
      onParagraphTextChange={onParagraphChange}
      onSplitParagraph={onSplitParagraph ?? (() => undefined)}
      onMergeParagraphBackward={onMergeParagraphBackward ?? (() => undefined)}
      onReplaceSelection={onReplaceSurfaceRange ?? (() => undefined)}
      onPasteRich={onPasteSurfaceRange}
      onUndo={onUndo}
      onRedo={onRedo}
      onRequestContextMenu={onRequestContextMenu}
      onInsertImageFile={onInsertImageFile}
      onOpenExternalUrl={onOpenExternalUrl}
      onIndentListLevel={onIndentListLevel}
      onExitListMode={onExitListMode}
      onBlockedEditAttempt={onBlockedEditAttempt}
      onKeyboardEntry={onKeyboardEntry}
      onRequestProjectionRepair={onRequestProjectionRepair}
      searchHighlights={searchHighlights}
    >
      {pages.map((page, pageIndex) => {
        const effectivePageSetup = page.pageSetup;
        const isLight = writerPageBackgroundIsLight(effectivePageSetup);
        const backgroundColor = resolveWriterPageBackgroundColor(effectivePageSetup);
        const paperBg = isLight
          ? 'text-slate-900 shadow-2xl'
          : 'text-slate-100 shadow-2xl border-white/10';
        // Every shape is drawn on the page that renders the paragraph it is
        // anchored to; a shape without a resolvable anchor stays on page one.
        const pageShapes = resolveWriterShapesForPageIndex(shapes ?? [], pages, pageIndex);

        return (
          <WriterPagePaper
            key={page.id}
            page={page}
            totalPages={totalPages}
            docWordCount={docWordCount}
            viewMode={viewMode}
            showRuler={showRuler}
            effectivePageSetup={effectivePageSetup}
            isLight={isLight}
            paperBg={paperBg}
            backgroundColor={backgroundColor}
            activeParagraph={activeParagraph}
            activeParagraphId={activeParagraphId}
            rangeFormat={rangeFormat}
            paragraphs={paragraphs}
            tables={tables}
            images={images}
            mediaObjects={mediaObjects}
            equations={equations}
            workspaceEmbeds={workspaceEmbeds}
            knownWorkspaceSourceIds={knownWorkspaceSourceIds}
            shapes={pageShapes}
            footnotes={footnotes}
            separatedNotes={separatedNotes}
            styles={styles}
            styleCatalog={styleCatalog}
            draggedPIdx={draggedPIdx}
            dragOverPIdx={dragOverPIdx}
            showNonPrinting={showNonPrinting}
            reviewMode={reviewMode}
            reviewerFilter={reviewerFilter}
            revisions={revisions}
            remotePeersByParagraph={remotePeersByParagraph}
            readOnly={readOnly}
            documentTitle={documentTitle}
            onUpdateMargins={onUpdateMargins}
            onUpdateIndent={onUpdateIndent}
            onUpdateTabStops={onUpdateTabStops}
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
            onBlockedEditAttempt={onBlockedEditAttempt}
            onPastePayload={onPastePayload}
            onEmptyAreaClick={onEmptyAreaClick}
            onDirectAlignClick={onDirectAlignClick}
            zoom={zoom}
            onKeyboardEntry={onKeyboardEntry}
            onDeleteParagraph={onDeleteParagraph}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onPaperDrop={onPaperDrop}
            onUpdateTable={onUpdateTable}
            onDeleteTable={onDeleteTable}
            onOpenTableProperties={onOpenTableProperties}
            onUpdateImage={onUpdateImage}
            onDeleteImage={onDeleteImage}
            onDeleteMedia={onDeleteMedia}
          onOpenExternalUrl={onOpenExternalUrl}
            onOpenImageProperties={onOpenImageProperties}
            onUpdateEquation={onUpdateEquation}
            onDeleteEquation={onDeleteEquation}
            onOpenEquationModal={onOpenEquationModal}
            onDeleteWorkspaceEmbed={onDeleteWorkspaceEmbed}
            onOpenWorkspaceEmbedSource={onOpenWorkspaceEmbedSource}
            onOpenWorkspaceEmbedAsset={onOpenWorkspaceEmbedAsset}
            onUpdateShapes={onUpdateShapes}
            onUpdateHeader={onUpdateHeader}
            onUpdateFooter={onUpdateFooter}
            onToggleLinkToPrevious={onToggleLinkToPrevious}
            onParagraphContextMenu={onParagraphContextMenu}
            richTextSurfaceActive
            headerEditing={editingRegion?.region === 'header' && editingRegion.pageIndex === page.pageIndex}
            footerEditing={editingRegion?.region === 'footer' && editingRegion.pageIndex === page.pageIndex}
            onRequestHeaderEdit={() => setEditingRegion({ region: 'header', pageIndex: page.pageIndex })}
            onRequestFooterEdit={() => setEditingRegion({ region: 'footer', pageIndex: page.pageIndex })}
            onExitRegionEdit={() => {
              setEditingRegion(null);
              /**
               * WR-047 — leaving the header/footer returns the focus to the text.
               *
               * Before, `Esc` closed the field and left `document.activeElement` on a node that
               * had just been unmounted — a keyboard user was back at the top of the document
               * with no caret. The surface is the one focusable writing target.
               */
              const surface = globalThis.document?.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
              try {
                surface?.focus({ preventScroll: true });
              } catch {
                surface?.focus();
              }
            }}
          />
        );
      })}
    </WriterRichTextSurface>
  );
};
