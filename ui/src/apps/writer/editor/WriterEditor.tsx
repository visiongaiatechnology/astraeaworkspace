// STATUS: DIAMANT VGT SUPREME — Sovereign Document Editor Workspace
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Minimize2, AlertTriangle, X } from 'lucide-react';
import { useWriterState } from './useWriterState';
import { useWriterKeyboardShortcuts } from './useWriterKeyboardShortcuts';
import { WriterFormattingToolbar } from '../formatting/toolbar/WriterFormattingToolbar';
// W-229/W-225: the two notices that tell the user what happened to their save and their caret.
import { WriterSaveAndRestoreNotice } from './WriterSaveAndRestoreNotice';
import { WriterReviewBar } from '../review/WriterReviewBar';
import { WriterReviewPane } from '../review/WriterReviewPane';
import { updateWriterImagePlacement } from '../media/images/operations/writerMediaOperations';
import { WRITER_IMAGE_ACCEPT_ATTRIBUTE } from '../media/images/import/writerImageImport';
import { WriterTocSidebar } from '../navigation/toc/WriterTocSidebar';
import { WRITER_PARAGRAPH_ANCHOR_PREFIX } from '../references/notes/writerNoteNavigation';
import { requestWriterCaret } from '../editing/caret/writerCaretController';
import { writerViewModeIsReadOnly } from './view-modes/writerViewModes';
import { WriterStatusBar } from './status/WriterStatusBar';
import { WriterPageRenderer } from '../layout/pages/WriterPageRenderer';
import { WriterAllModals } from './modals/WriterAllModals';
import { WriterLinkModal } from './modals/WriterLinkModal';
import { WriterCommentModal } from '../review/WriterCommentModal';
import { WriterFindReplaceBar } from '../productivity/search/WriterFindReplaceBar';
import {
  EMPTY_WRITER_SEARCH_HIGHLIGHTS,
  type WriterSearchHighlightMap,
} from '../productivity/search/writerSearchHighlights';
import { WriterFormFillingPanel } from '../forms/WriterFormFillingPanel';
import { WriterEditorContextMenu } from './context-menu/WriterEditorContextMenu';
// AST-0099: the visible half of a clipboard command's outcome — a refused clipboard must not be silent.
import { WriterClipboardNotice } from './context-menu/WriterClipboardNotice';
import { buildWriterTableBlock } from '../tables/picker/writerTableInsertPlan';
import { useWriterCollaboration } from '../collaboration/useWriterCollaboration';
import { updateSectionHeader, updateSectionFooter, toggleSectionLinkToPrevious } from '../layout/header-footer/writerHeaderFooterHelpers';
import { canComment, canEditText, canManageRevisions, requiresTrackedChanges } from '../security/protection/writerProtectionEngine';
import { resolveWriterProtectionNotice } from '../security/protection/writerProtectionNotice';
import { WriterProtectionBanner } from '../security/protection/WriterProtectionBanner';
import { resolveWriterVaultOpenTarget } from '../public/workspace/writerWorkspaceIntegration';
import { projectWriterWorkspaceSourceCandidates } from '../integrations/workspace/writerGridSourceCatalog';
import type { WriterEditorProps } from '../types';
import { useWriterFocusMode } from './focus/useWriterFocusMode';
// Paket 9: das sichtbare Ablageziel dieser Oberfläche. Der Träger ist der **vorhandene** semantische
// Transfer (Paket 7) und die Zustellung läuft **ausschließlich** über die versiegelte Fabric-Matrix
// (Paket 4) — hier entsteht **kein** zweiter Zieh-Mechanismus.
import { useWriterWorkspaceDropZone } from '../integrations/workspace-drop/useWriterWorkspaceDropZone';
import { WriterWorkspaceDropZoneOverlay } from '../integrations/workspace-drop/WriterWorkspaceDropZoneOverlay';
// Paket 22 (Writer): die **Quellenseite** — der Dokumentabschnitt wird als **Referenz** bereitgestellt
// (Paket 7: dasselbe Trägerformat), nicht als Text. Der sichtbare Einstieg ist der Aufrufer.
import { WriterWorkspaceCarrierControl } from '../integrations/workspace-carrier/WriterWorkspaceCarrierControl';
import { useWriterWorkspaceCarrier } from '../integrations/workspace-carrier/useWriterWorkspaceCarrier';
export const WriterEditor: React.FC<WriterEditorProps> = ({
  document,
  workspaceDocuments = [],
  storedWorkspaceDocuments = [],
  loadStoredWorkspaceDocument,
  onUpdateDocument,
  onOpenDocument,
  onOpenExternalUrl,
  allowBrowserManagedSpeech = false,
  writerExportHost,
  saveStatus,
  saveFailure = null,
}) => {
  const collaboration = useWriterCollaboration(document, onUpdateDocument);
  // AST-0737 Folge: die bekannten Dokumente gehen **mit** in die Projektion — der Inhalt eines
  // Live-Verweises liegt im Quelldokument, nicht im Ziel (siehe `writerPrimaryTextProjection.ts`).
  const state = useWriterState(document, collaboration.handleLocalDocumentUpdate, workspaceDocuments);
  const workspaceDropZone = useWriterWorkspaceDropZone({ targetDocument: document, documents: workspaceDocuments });
  // Paket 22 (Writer): die **Quellenseite** dieser Oberfläche — der Abschnitt dieses Dokuments wird als
  // Referenz bereitgestellt (Knöpfe **und** Ziehen, beides über **eine** Quelle).
  const workspaceCarrier = useWriterWorkspaceCarrier({ document });
  const reviewPresentation = state.reviewPresentation.state;
  /**
   * WR-038 — review mode is the switch that makes the editor quiet again.
   *
   * `reviewMode` alone is a markup selector; the "Original" projection and any revision chrome
   * now only apply while review mode is on. Outside it the renderer receives `'none'`, so a
   * document with pending revisions looks like normal text while the user writes.
   */
  const isHistoricalReview = state.isReviewModeActive && state.reviewMode === 'original';
  const effectiveReviewMode = state.isReviewModeActive ? state.reviewMode : 'none';
  /**
   * WR-040 — a reading view is not an editing surface.
   *
   * `writerViewModeIsReadOnly` existed but had no production caller: the surface stayed
   * editable, the toolbar stayed active and "replace all" wrote into a document the user was
   * only reading. The mode now feeds the same central read-only decision as protection does.
   */
  const viewModeReadOnly = writerViewModeIsReadOnly(state.contentViewMode);
  const rendererReadOnly = isHistoricalReview || !canEditText(state.protectionMode) || viewModeReadOnly;
  const trackChangesLocked = requiresTrackedChanges(state.protectionMode);
  const revisionActionsLocked = !canManageRevisions(state.protectionMode);
  const renderedParagraphs = isHistoricalReview ? reviewPresentation.paragraphs : state.paragraphs;
  const renderedTables = isHistoricalReview ? reviewPresentation.tables : state.tables;
  const renderedPageSetup = isHistoricalReview ? reviewPresentation.pageSetup : state.pageSetup;
  const renderedSections = isHistoricalReview ? reviewPresentation.sections : state.sections;
  const renderedStyleCatalog = isHistoricalReview ? reviewPresentation.styleCatalog : state.styleCatalog;
  const renderedStyles = isHistoricalReview ? reviewPresentation.styleCatalog.paragraphStyles : state.styles;
  const renderedActiveParagraph = renderedParagraphs.find((paragraph) => paragraph.id === state.activeParagraphId);
  const { focusExitButtonRef, handleSetViewMode, handleExitFocusMode } = useWriterFocusMode(
    state.viewMode,
    state.setViewMode,
    state.exitFocusMode,
  );
  const remotePeersByParagraph = useMemo(() => isHistoricalReview ? {} : Object.fromEntries(
    renderedParagraphs.map((paragraph) => [paragraph.id, collaboration.remotePeersForParagraph(paragraph.id)]),
  ), [collaboration.peers, collaboration.remotePeersForParagraph, isHistoricalReview, renderedParagraphs]);
  // W-245/W-254: the shell already knows which documents exist — the open ones and the stored metadata. An
  // embed whose source is in neither has a dead link, and the block must be able to say so. The list comes
  // from the same catalogue the embed dialog uses, so the two can never disagree about what "exists" means.
  const knownWorkspaceSourceIds = useMemo<ReadonlySet<string>>(
    () => new Set(
      projectWriterWorkspaceSourceCandidates(document.id, workspaceDocuments, storedWorkspaceDocuments)
        .map((candidate) => candidate.id),
    ),
    [document.id, storedWorkspaceDocuments, workspaceDocuments],
  );
  useEffect(() => {
    collaboration.updateLocalPresence(
      state.activeParagraphId,
      state.textSelection ? {
        paragraphId: state.textSelection.paragraphId,
        anchor: state.textSelection.start,
        focus: state.textSelection.end,
      } : null,
    );
  }, [collaboration.updateLocalPresence, state.activeParagraphId, state.textSelection]);
  /** WR-035: the link dialog replaces the blocked window.prompt. */
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  /** WR-038: composer for a real comment (the old button inserted fixed text). */
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [linkDialogCurrentUrl, setLinkDialogCurrentUrl] = useState<string | null>(null);
  /**
   * WR-036 — visible search hits.
   *
   * Owned here because two siblings need them: the find bar produces them, the page
   * renderer paints them. It is pure decoration — no span, no revision and no history entry
   * is touched by a highlight.
   */
  const [searchHighlights, setSearchHighlights] = useState<WriterSearchHighlightMap>(EMPTY_WRITER_SEARCH_HIGHLIGHTS);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    paragraphIndex?: number;
    kind?: 'text' | 'paper' | 'table' | 'object';
  } | null>(null);

  /**
   * WR-025 — the context menu must be reachable **without a mouse**.
   *
   * `Shift+F10` and the `ContextMenu` key are the platform bindings. The menu opens
   * next to the caret (not at 0,0), so it appears where the user is writing; when the
   * browser cannot report a caret box (an empty paragraph, a restored selection), the
   * active paragraph's own box is used and finally the viewport centre.
   */
  const openContextMenuAtCaret = useCallback(() => {
    const selection = typeof window === 'undefined' ? null : window.getSelection();
    let x = 0;
    let y = 0;
    let measured = false;
    if (selection && selection.rangeCount > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width + rect.height > 0) {
        x = rect.left;
        y = rect.bottom;
        measured = true;
      }
    }
    if (!measured && state.activeParagraphId) {
      // document is the workspace document here — the DOM lives on globalThis.
      const anchor = globalThis.document?.querySelector(`[data-writer-paragraph-anchor="${state.activeParagraphId}"]`);
      const rect = anchor?.getBoundingClientRect();
      if (rect && rect.width + rect.height > 0) {
        x = rect.left;
        y = rect.top + Math.min(rect.height, 24);
        measured = true;
      }
    }
    if (!measured) {
      x = typeof window === 'undefined' ? 120 : window.innerWidth / 2;
      y = typeof window === 'undefined' ? 120 : window.innerHeight / 2;
    }
    setContextMenu({
      x,
      y,
      paragraphIndex: state.activeParagraphIndex >= 0 ? state.activeParagraphIndex : undefined,
      kind: 'text',
    });
  }, [state.activeParagraphId, state.activeParagraphIndex]);

  useWriterKeyboardShortcuts({
    handleToggleSpan: isHistoricalReview ? () => undefined : state.handleToggleSpan,
    setIsFindReplaceOpen: state.setIsFindReplaceOpen,
    // WR-036: Ctrl+H opens the replace row, Ctrl+F only the find row.
    openFindReplace: state.openFindReplace,
    setIsExportOpen: state.setIsExportOpen,
    handleUndo: isHistoricalReview ? () => undefined : state.handleUndo,
    handleRedo: isHistoricalReview ? () => undefined : state.handleRedo,
    /**
     * WR-035 — `Strg+K` links the marked text.
     *
     * The URL is asked for in place and stored on the spans; the text and the caret
     * stay where they were, so the writing flow is not interrupted by a dialog stack.
     * An empty answer removes an existing link, which is the shortest way back.
     */
    handleInsertLink: isHistoricalReview ? undefined : () => {
      // WR-035: a real dialog, not `window.prompt` — Tauri/WebView2 blocks that one.
      const current = state.resolveActiveLink();
      setLinkDialogCurrentUrl(current?.kind === 'external' ? current.url : null);
      setIsLinkDialogOpen(true);
    },
    trackChangesActive: state.trackChangesActive,
    setTrackChangesActive: state.setTrackChangesActive,
    viewMode: state.viewMode,
    exitFocusMode: handleExitFocusMode,
    handleUpdateAllFields: isHistoricalReview ? () => undefined : state.handleUpdateAllFields,
    handleInsertPageBreak: isHistoricalReview ? () => undefined : state.handleInsertPageBreak,
    handleInsertColumnBreak: isHistoricalReview ? () => undefined : state.handleInsertColumnBreak,
  });

  return (
    <div
      role="region"
      aria-label={`Astraea Writer – ${document.title}`}
      className={`writer-a11y-root flex-1 min-h-0 min-w-0 w-full h-full flex flex-col ${state.currentTheme === 'sepia' ? 'bg-[#f4ecd8] text-[#5b4636]' : state.currentTheme === 'nordic-frost' ? 'bg-[#2e3440] text-[#eceff4]' : 'bg-slate-950 text-slate-100'} overflow-hidden select-none font-sans`}
      style={{ backgroundColor: 'var(--vgt-module-shell-surface)', color: 'var(--vgt-text-primary)' }}
      onCopyCapture={() => state.captureClipboardText(window.getSelection()?.toString() ?? '')}
      onDragEnter={workspaceDropZone.onDragEnter}
      onDragOver={workspaceDropZone.onDragOver}
      onDragLeave={workspaceDropZone.onDragLeave}
      onDrop={workspaceDropZone.onDrop}
      onKeyDown={workspaceDropZone.onKeyDown}
    >
      {/*
        Release 0.1 · W-229 bleibt auch im Fokus-Modus sichtbar.

        Ein fehlgeschlagenes Speichern ist kein Chrome-Detail, das der Fokus-Modus
        ausblenden darf: der Nutzer schreibt weiter, das Dokument bleibt dirty, und
        ohne die Meldung wäre der Schreibfehler unsichtbar. Deshalb wird die
        Speicher-Meldung in **jedem** Ansichtsmodus gerendert; die Cursor-Meldung
        bleibt bewusst dem normalen Modus vorbehalten (sie ist eine Höflichkeit, kein
        Datenverlust-Risiko).
      */}
      <WriterSaveAndRestoreNotice
        saveStatus={saveStatus}
        saveFailure={saveFailure}
        cursorRestoreNotice={state.viewMode === 'focus' || isHistoricalReview ? null : state.cursorRestoreNotice}
      />
      {/*
        AST-0099: the same strip, because a refused clipboard is the same kind of event as a failed save —
        a thing the user asked for that did not happen. It lives here and not inside the menu: the menu
        closes on the click, so a message rendered in it would never be read.
      */}
      {state.viewMode !== 'focus' && !isHistoricalReview && (
        <div className="w-full flex-shrink-0 z-30 px-3 pt-1">
          <WriterClipboardNotice report={state.clipboardReport} />
        </div>
      )}
      {state.viewMode !== 'focus' && !isHistoricalReview && (
        <div className="w-full flex-shrink-0 z-30">
          {canEditText(state.protectionMode) && !viewModeReadOnly && (
          <WriterFormattingToolbar
            paragraph={state.activeParagraph}
            styles={state.styles}
            currentTheme={state.currentTheme}
            viewMode={state.viewMode}
            zoom={state.zoom}
            canUndo={state.canUndo}
            canRedo={state.canRedo}
            onApplyStyle={state.handleApplyStyle}
            onToggleSpan={state.handleToggleSpan}
            onSetAlignment={state.handleSetAlignment}
            onToggleList={state.handleToggleList}
            onUpdateStyle={state.handleUpdateStyle}
            onSetTextColor={state.handleSetTextColor}
            onSetHighlightColor={state.handleSetHighlightColor}
            onSetFontFamily={isHistoricalReview ? undefined : state.handleSetFontFamily}
            onSetFontSizePt={isHistoricalReview ? undefined : state.handleSetFontSizePt}
            selection={state.textSelection}
            rangeFormat={state.rangeFormatState}
            onClearFormatting={state.handleClearFormatting}
            onSetLineSpacing={state.handleSetLineSpacing}
            onSelectTheme={state.handleSelectTheme}
            onInsertTable={(size) => state.insertTable(buildWriterTableBlock({ size, anchorParagraphId: state.activeParagraph?.id }))}
            onInsertImage={() => state.imageInputRef.current?.click()}
            onInsertMedia={state.protectionMode === 'none' ? () => state.setIsMediaObjectOpen(true) : undefined}
            onInsertShape={state.handleInsertShape}
            onOpenTableOfFigures={() => state.setIsTableOfFiguresOpen(true)}
            onInsertEquation={state.handleInsertEquation}
        onInsertLink={isHistoricalReview ? undefined : () => {
          const current = state.resolveActiveLink();
          setLinkDialogCurrentUrl(current?.kind === 'external' ? current.url : null);
          setIsLinkDialogOpen(true);
        }}
            onOpenPageSetup={() => state.setIsPageSetupOpen(true)}
            onOpenCitationModal={() => state.setIsCitationOpen(true)}
            onOpenSymbolsModal={() => state.setIsSymbolsOpen(true)}
            onOpenFootnoteModal={() => state.setIsFootnoteOpen(true)}
            onOpenBookmarkModal={() => state.setIsBookmarkOpen(true)}
            onOpenMailMergeModal={() => state.setIsMailMergeOpen(true)}
            onOpenParagraphFormat={() => state.setIsParagraphFormatOpen(true)}
            onOpenSort={() => state.setIsSortOpen(true)}
            onOpenListFormat={state.handleOpenListFormat}
            onOpenStyleInspector={() => state.setIsStyleInspectorOpen(true)}
            onOpenCrossReference={() => state.setIsCrossReferenceOpen(true)}
            onOpenFields={() => state.setIsFieldsOpen(true)}
            onOpenGridEmbed={() => state.setIsGridEmbedOpen(true)}
            onOpenStats={() => state.setIsStatsOpen(true)}
            onOpenLinguistics={() => state.setIsLinguisticsOpen(true)}
            onOpenDictation={() => state.setIsDictationOpen(true)}
            onOpenRoundtrip={() => state.setIsRoundtripOpen(true)}
            onOpenAutoCorrect={() => state.setIsAutoCorrectOpen(true)}
            onInsertLineBreak={state.handleInsertLineBreak}
            onInsertPageBreak={state.handleInsertPageBreak}
            onInsertColumnBreak={state.handleInsertColumnBreak}
            onInsertSectionBreak={state.handleInsertSectionBreak}
            showRuler={state.showRuler}
            onToggleRuler={() => state.setShowRuler(!state.showRuler)}
            isTwoPageSpread={state.isTwoPageSpread}
            onToggleTwoPageSpread={() => state.setIsTwoPageSpread(!state.isTwoPageSpread)}
            onSetViewMode={handleSetViewMode}
            onSetZoom={state.setZoom}
            onUndo={state.handleUndo}
            onRedo={state.handleRedo}
            onOpenExport={() => state.setIsExportOpen(true)}
            hasCopiedFormat={Boolean(state.copiedFormat)}
            onCopyFormat={state.handleCopyFormat}
            onApplyCopiedFormat={state.handleApplyCopiedFormat}
            onTransformCase={state.handleTransformCase}
            onPrint={state.handlePrint}
          />
          )}

          {/* Review & Track Changes Bar (Paket F) */}
          <WriterReviewBar
            trackChangesEnabled={state.trackChangesActive}
            trackChangesLocked={trackChangesLocked}
            revisionActionsLocked={revisionActionsLocked}
            // WR-038: review chrome is a mode, not the default view.
            reviewModeActive={state.isReviewModeActive}
            onToggleReviewMode={() => state.setIsReviewModeActive(!state.isReviewModeActive)}
            onToggleTrackChanges={() => state.setTrackChangesActive(!state.trackChangesActive)}
            reviewMode={state.reviewMode}
            onChangeReviewMode={state.setReviewMode}
            reviewerFilter={state.reviewerFilter}
            onChangeReviewerFilter={state.setReviewerFilter}
            isReviewPaneOpen={state.isReviewPaneOpen}
            onToggleReviewPane={() => state.setIsReviewPaneOpen(!state.isReviewPaneOpen)}
            revisions={state.revisions}
            onAcceptAllRevisions={state.handleAcceptAllRevisions}
            onRejectAllRevisions={state.handleRejectAllRevisions}
            onOpenCompareModal={() => state.setIsCompareOpen(true)}
            protectionMode={state.protectionMode}
            onOpenProtectionModal={() => state.setIsProtectionOpen(true)}
            onOpenNewComment={() => {
              // WR-038: a real composer, not a canned sentence (and not window.prompt, which
              // Tauri blocks). The dialog writes through the protected comment engine.
              if (!state.activeParagraph?.id) return;
              if (!canComment(state.protectionMode)) {
                state.handleBlockedEditAttempt();
                return;
              }
              setIsCommentModalOpen(true);
            }}
            isFindReplaceOpen={state.isFindReplaceOpen}
            onToggleFindReplace={() => state.setIsFindReplaceOpen(!state.isFindReplaceOpen)}
            showFormattingMarks={state.showNonPrinting}
            onToggleFormattingMarks={() => state.setShowNonPrinting(!state.showNonPrinting)}
            commentsCount={state.comments.length}
            collaborationEnabled={collaboration.enabled}
            collaborationAvailable={collaboration.available}
            collaborationConnecting={collaboration.connecting}
            collaborationPeerCount={collaboration.peers.length}
            collaborationConflictCount={collaboration.conflictCount}
            collaborationTransportLabel={collaboration.transportLabel}
            collaborationError={collaboration.lastError}
            onToggleCollaboration={collaboration.toggleEnabled}
          />
          {state.protectionMode === 'form_filling' && (
            <WriterFormFillingPanel
              controls={state.contentControls}
              images={state.images}
              error={state.contentControlError}
              onFill={state.handleFillContentControl}
              onAddRepeatingItem={state.handleAddRepeatingItem}
              onUpdateRepeatingItem={state.handleUpdateRepeatingItem}
              onRemoveRepeatingItem={state.handleRemoveRepeatingItem}
            />
          )}
        </div>
      )}

      {/* Hidden file input for image upload */}
      <input
        ref={state.imageInputRef}
        type="file"
        accept={WRITER_IMAGE_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void state.handleInsertImageFile(file);
          e.currentTarget.value = '';
        }}
      />

        {/* Main Workspace Area with Left TOC, Centered Paper Canvas & Right Review Pane */}
      <div className="flex-1 flex flex-col w-full overflow-hidden relative">
        <WriterProtectionBanner
          notice={resolveWriterProtectionNotice(state.protectionMode)}
          blockedEditAttempted={state.protectionEditAttempted}
          onOpenProtection={() => state.setIsProtectionOpen(true)}
        />
      <div className="flex-1 flex w-full overflow-hidden relative">
        {state.viewMode !== 'focus' && (
          <WriterTocSidebar
            paragraphs={state.paragraphs}
            comments={state.comments}
            revisions={state.revisions}
            bookmarks={state.bookmarks}
            pages={state.pages}
            sections={state.sections}
            footnotes={state.footnotes}
            tables={state.tables}
            images={state.images}
            equations={state.equations}
            namedVersions={state.namedVersions}
            sessionVersions={state.sessionVersions}
            clipboardHistoryEnabled={state.clipboardHistoryEnabled}
            clipboardHistory={state.clipboardHistory}
            productivityMessage={state.productivityMessage}
            onSetClipboardHistoryEnabled={state.setClipboardHistoryEnabled}
            onClearClipboardHistory={state.clearClipboardHistory}
            onInsertClipboardEntry={state.insertClipboardEntry}
            onCreateNamedVersion={state.createNamedVersion}
            onRestoreNamedVersion={state.restoreNamedVersion}
            onDeleteNamedVersion={state.deleteNamedVersion}
            onRestoreSessionVersion={state.restoreSessionVersion}
            isOpen={state.isTocOpen}
            onClose={() => state.setIsTocOpen(false)}
            activeParagraphId={state.activeParagraphId}
            onJumpToParagraph={(pId) => {
              // WR-037 — a heading/revision jump must land the **caret**, not only the scroll
              // position. The paragraph wrapper is not focusable in rich mode (`tabIndex` is
              // undefined there), so `el.focus()` was a no-op and the user kept typing at the old
              // place. The request goes through the one caret authority.
              const el = window.document.getElementById(`${WRITER_PARAGRAPH_ANCHOR_PREFIX}${pId}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              state.setActiveParagraphId(pId);
              requestWriterCaret({ paragraphId: pId, start: 0, end: 0, origin: 'api' });
            }}
            onResolveComment={(cId: string) => { state.toggleCommentResolved(cId); }}
            onReplyComment={(cId: string, text: string) => { state.replyToComment(cId, text, 'Reviewer'); }}
            onAcceptRevision={state.handleAcceptRevision}
            onRejectRevision={state.handleRejectRevision}
            onReorderOutline={(sourceHeadingId, targetHeadingId) => {
              const result = state.handleReorderOutline(sourceHeadingId, targetHeadingId);
              if (!result.ok) state.setProductivityMessage(result.message ?? 'Outline-Reordering fehlgeschlagen.');
            }}
            onDeleteBookmark={(bId: string) =>
              state.persistWriterData({
                bookmarks: state.bookmarks.filter((b) => b.id !== bId),
              })
            }
          />
        )}

        {/* Main Document Column */}
        <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden relative">
          {/* Scrollable Center Canvas */}
          <div
            className="flex-1 w-full flex flex-col items-center overflow-y-auto p-4 md:p-8 relative"
            // WR-033: this is the one scrolling container of the document. The image reveal
            // scrolls here, and the import asks which paragraphs are on screen before it
            // anchors a new picture (`readVisibleWriterParagraphIds`).
            data-writer-scroll-container="true"
            onContextMenu={(e) => {
              e.preventDefault();
              // WR-021: a right-click beside the text is a *page* context, not a
              // paragraph context. Showing the paragraph command set there promised
              // actions that had no paragraph to act on.
              setContextMenu({ x: e.clientX, y: e.clientY, kind: 'paper' });
            }}
          >
            {state.imageImportError && (
              <div
                role="alert"
                className="sticky top-2 z-50 mb-3 flex max-w-xl items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-950/95 px-4 py-3 text-sm text-amber-100 shadow-xl"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <span className="flex-1">{state.imageImportError}</span>
                <button
                  type="button"
                  onClick={() => state.setImageImportError(null)}
                  className="rounded p-1 text-amber-200 transition-colors hover:bg-amber-400/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus:ring-2 focus:ring-amber-300"
                  aria-label="Bildimport-Fehler schließen"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
            {state.viewMode === 'focus' && (
              <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-slate-900/90 border border-white/20 rounded-full px-4 py-2 shadow-2xl backdrop-blur-md">
                <span className="text-xs text-purple-300 font-medium">Focus Mode</span>
                <button
                  ref={focusExitButtonRef}
                  type="button"
                  onClick={handleExitFocusMode}
                  className="text-xs text-white bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded-full font-semibold transition-all motion-reduce:transition-none flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 focus:ring-2 focus:ring-purple-300"
                  aria-label="Focus-Modus beenden"
                >
                  <Minimize2 className="w-3 h-3" />
                  <span>Exit</span>
                </button>
              </div>
            )}

            {/* Floating Find & Replace Bar */}
            <WriterFindReplaceBar
              isOpen={state.isFindReplaceOpen}
              replaceRequestToken={state.findReplaceReplaceToken}
              onClose={() => {
                state.setIsFindReplaceOpen(false);
                /**
                 * WR-036 — closing the bar returns the caret to where the user was.
                 *
                 * The search field had the focus, so the document's DOM selection was gone even
                 * though the model selection survived. The offsets are clamped against the
                 * current text because a replacement may have shortened it in the meantime.
                 */
                const selection = state.textSelection;
                if (!selection) return;
                const paragraph = state.paragraphs.find((item) => item.id === selection.paragraphId);
                if (!paragraph) return;
                const length = paragraph.spans.reduce((total, span) => total + span.text.length, 0);
                const start = Math.max(0, Math.min(selection.start, length));
                const end = Math.max(start, Math.min(selection.end, length));
                requestWriterCaret({ paragraphId: paragraph.id, start, end, origin: 'api' });
              }}
              paragraphs={isHistoricalReview ? renderedParagraphs : state.paragraphs}
              styleCatalog={renderedStyleCatalog}
              onReplaceAll={(query, replacement, options) => isHistoricalReview || viewModeReadOnly
                ? { ok: false, message: 'Die Leseansicht ist schreibgeschützt.' }
                : state.handleReplaceAllSearch(query, replacement, options)}
              onReplaceSelection={isHistoricalReview || viewModeReadOnly
                ? (): { ok: false; message: string } => ({ ok: false, message: 'Die Leseansicht ist schreibgeschützt.' })
                : state.handleReplaceSelectedMatches}
              onHighlightMatch={(pId) => {
                const el = window.document.getElementById(`${WRITER_PARAGRAPH_ANCHOR_PREFIX}${pId}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                state.setActiveParagraphId(pId);
              }}
              onHighlightsChange={setSearchHighlights}
            />

            {isHistoricalReview && state.reviewPresentation.conflicts.length > 0 && (
              <div className="mx-auto mb-3 flex max-w-4xl items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <span>
                  Originalansicht ist für {state.reviewPresentation.conflicts.length} Revision(en) nicht vollständig rekonstruierbar.
                  Konfliktbehaftete Änderungen bleiben fail-closed im aktuellen Zustand und sind im Review Pane nachvollziehbar.
                </span>
              </div>
            )}

            {/* The Paginated / Continuous Paper Renderer */}
            <WriterPageRenderer
              isTwoPageSpread={state.isTwoPageSpread}
              paragraphs={renderedParagraphs}
              tables={renderedTables}
              images={state.images}
              mediaObjects={state.mediaObjects}
              equations={state.equations}
              workspaceEmbeds={isHistoricalReview ? [] : (document.writerData?.workspaceEmbeds ?? [])}
              knownWorkspaceSourceIds={knownWorkspaceSourceIds}
              defaultLanguage={state.linguistics.defaultLanguage}
              footnotes={state.footnotes}
              styles={renderedStyles}
              styleCatalog={renderedStyleCatalog}
              pageSetup={renderedPageSetup}
              sections={renderedSections}
              viewMode={state.contentViewMode}
              zoom={state.zoom}
              showRuler={state.showRuler}
              activeParagraph={renderedActiveParagraph}
              activeParagraphId={state.activeParagraphId}
              rangeFormat={state.rangeFormatState}
              onUpdateMargins={state.handleUpdateMargins}
              onUpdateIndent={state.handleUpdateIndents}
              onUpdateTabStops={state.handleUpdateTabStops}
              draggedPIdx={state.draggedPIdx}
              dragOverPIdx={state.dragOverPIdx}
              showNonPrinting={state.showNonPrinting}
              reviewMode={isHistoricalReview ? 'none' : effectiveReviewMode}
              reviewerFilter={state.reviewerFilter}
              revisions={state.revisions}
              // WR-036: the find bar's hits are rendered into the surface.
              searchHighlights={searchHighlights}
              remotePeersByParagraph={remotePeersByParagraph}
              readOnly={rendererReadOnly}
              documentTitle={document.title}
              onParagraphChange={state.handleParagraphChange}
              onTextSelection={state.handleTextSelection}
              onSelectParagraph={state.setActiveParagraphId}
              onAddParagraph={state.handleAddParagraph}
              onSplitParagraph={isHistoricalReview ? undefined : state.handleSplitParagraph}
              onMergeParagraphBackward={isHistoricalReview ? undefined : state.handleMergeParagraphBackward}
              rangeSelectionParagraphIds={isHistoricalReview ? undefined : state.rangeSelectionParagraphIds}
              hasRangeSelection={isHistoricalReview ? false : state.hasRangeSelection}
              onRangeSelectionStart={isHistoricalReview ? undefined : state.handleRangeSelectionStart}
              onReplaceRangeSelection={isHistoricalReview ? undefined : state.handleReplaceRangeSelection}
              onNavigate={isHistoricalReview ? undefined : state.handleParagraphNavigation}
              onBlockedEditAttempt={state.handleBlockedEditAttempt}
              onPastePayload={isHistoricalReview ? undefined : state.handlePastePayload}
              onEmptyAreaClick={isHistoricalReview ? undefined : state.handlePageBackgroundClick}
              onDirectAlignClick={isHistoricalReview ? undefined : state.handleDirectAlignClick}
              onKeyboardEntry={isHistoricalReview ? undefined : state.handleKeyboardEntry}
              // ASTRAEA WRITER 50 V2 · M1: the rich-text surface is the one input
              // authority. Its DOM selection becomes editor state here, and a
              // divergence between DOM and model re-projects the pages instead of
              // trusting the DOM as the data authority.
              onSurfaceSelectionChange={isHistoricalReview ? undefined : state.handleSurfaceSelectionChange}
              onRequestContextMenu={isHistoricalReview ? undefined : openContextMenuAtCaret}
              onInsertImageFile={isHistoricalReview ? undefined : (file: File) => { void state.handleInsertImageFile(file); }}
              onReplaceSurfaceRange={isHistoricalReview ? undefined : state.handleReplaceSurfaceRange}
              onPasteSurfaceRange={isHistoricalReview ? undefined : state.handlePasteSurfaceRange}
              onUndo={isHistoricalReview ? undefined : state.handleUndo}
              onRedo={isHistoricalReview ? undefined : state.handleRedo}
              onRequestProjectionRepair={state.requestSurfaceProjectionRepair}
              onDeleteParagraph={state.handleDeleteParagraph}
              onDragStart={state.handleDragStart}
              onDragOver={state.handleDragOver}
              onDrop={state.handleDrop}
              onPaperDrop={state.handlePaperDrop}
              onIndentListLevel={state.handleIndentListLevel}
              onOutdentListLevel={state.handleOutdentListLevel}
              onExitListMode={state.handleExitListMode}
              onOpenTableProperties={(tbl) => { state.setSelectedTableForProperties(tbl); state.setIsTablePropertiesOpen(true); }}
              onUpdateTable={state.updateTable}
              onDeleteTable={state.deleteTable}
              onUpdateImage={(imgId, patch) => state.persistWriterData({
                images: updateWriterImagePlacement(state.images, imgId, patch, state.pages),
              })}
              onDeleteImage={(imgId) => state.persistWriterData({ images: state.images.filter((img) => img.id !== imgId) })}
              onDeleteMedia={state.protectionMode === 'none' ? (mediaId) => state.persistWriterData({ mediaObjects: state.mediaObjects.filter((media) => media.id !== mediaId) }) : undefined}
              onOpenExternalUrl={onOpenExternalUrl}
              onUpdateEquation={(eq) => state.persistWriterData({ equations: state.equations.map((e) => (e.id === eq.id ? eq : e)) })}
              onDeleteEquation={(eqId) => state.persistWriterData({ equations: state.equations.filter((e) => e.id !== eqId) })}
              onDeleteWorkspaceEmbed={(embedId) => state.persistWriterData({ workspaceEmbeds: (document.writerData?.workspaceEmbeds ?? []).filter((embed) => embed.id !== embedId) })}
              onOpenWorkspaceEmbedSource={(embed) => onOpenDocument?.(embed.sourceDocumentId)}
              onOpenWorkspaceEmbedAsset={(embed) => {
                const target = resolveWriterVaultOpenTarget(embed, workspaceDocuments);
                if (target.kind === 'workspace-document') onOpenDocument?.(target.documentId);
                else globalThis.open(target.url, '_blank', 'noopener,noreferrer');
              }}
              shapes={state.shapes}
              onUpdateShapes={state.handleUpdateShapes}
              onOpenImageProperties={state.handleOpenImageProperties}
              onOpenEquationModal={state.handleOpenEquationModal}
              onUpdateHeader={(sectionId, text, target) => updateSectionHeader(sectionId, text, target, state.pageSetup, state.sections, state.handleUpdateSectionPageSetup)}
              onUpdateFooter={(sectionId, text, target) => updateSectionFooter(sectionId, text, target, state.pageSetup, state.sections, state.handleUpdateSectionPageSetup)}
              onToggleLinkToPrevious={(sectionId, type) => toggleSectionLinkToPrevious(sectionId, type, state.pageSetup, state.sections, state.handleUpdateSectionPageSetup)}
              onParagraphContextMenu={(e, pIdx) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY, paragraphIndex: pIdx, kind: 'text' });
              }}
            />
          </div>
        </div>

        {state.viewMode !== 'focus' && (
          <WriterReviewPane
            isOpen={state.isReviewPaneOpen}
            onClose={() => state.setIsReviewPaneOpen(false)}
            revisions={state.revisions}
            actionsDisabled={revisionActionsLocked}
            reviewerFilter={state.reviewerFilter}
            onChangeReviewerFilter={state.setReviewerFilter}
            revisionTypeFilter={state.revisionTypeFilter}
            onChangeRevisionTypeFilter={state.setRevisionTypeFilter}
            onAcceptRevision={state.handleAcceptRevision}
            onRejectRevision={state.handleRejectRevision}
            onAcceptSelected={state.handleAcceptSelectedRevisions}
            onRejectSelected={state.handleRejectSelectedRevisions}
            onAcceptAll={state.handleAcceptAllRevisions}
            onRejectAll={state.handleRejectAllRevisions}
            onJumpToParagraph={(pId) => {
              // WR-037 — a heading/revision jump must land the **caret**, not only the scroll
              // position. The paragraph wrapper is not focusable in rich mode (`tabIndex` is
              // undefined there), so `el.focus()` was a no-op and the user kept typing at the old
              // place. The request goes through the one caret authority.
              const el = window.document.getElementById(`${WRITER_PARAGRAPH_ANCHOR_PREFIX}${pId}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              state.setActiveParagraphId(pId);
              requestWriterCaret({ paragraphId: pId, start: 0, end: 0, origin: 'api' });
            }}
          />
        )}
      </div>
      </div>

      {state.viewMode !== 'focus' && (
        <WriterStatusBar
          paperSize={state.activePageSetup.paperSize}
          stats={state.stats}
          trackChangesActive={state.trackChangesActive}
          isTocOpen={state.isTocOpen}
          onToggleToc={() => state.setIsTocOpen(!state.isTocOpen)}
          zoom={state.zoom}
          onSetZoom={state.setZoom}
        />
      )}

      <WriterAllModals
        state={state}
        document={document}
        workspaceDocuments={workspaceDocuments}
        storedWorkspaceDocuments={storedWorkspaceDocuments}
        loadStoredWorkspaceDocument={loadStoredWorkspaceDocument}
        allowBrowserManagedSpeech={allowBrowserManagedSpeech}
        writerExportHost={writerExportHost}
      />

      {/* WR-035 — the link dialog: apply, open, remove, cancel. */}
      <WriterLinkModal
        isOpen={isLinkDialogOpen}
        currentUrl={linkDialogCurrentUrl}
        onApply={(url) => state.handleApplyLink(url)}
        onRemove={() => state.handleApplyLink(null)}
        onOpen={onOpenExternalUrl ? (url) => onOpenExternalUrl(url) : undefined}
        onClose={() => {
          setIsLinkDialogOpen(false);
          // The caret goes back into the document so the user can continue writing.
          const surface = globalThis.document?.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
          try {
            surface?.focus({ preventScroll: true });
          } catch {
            surface?.focus();
          }
        }}
      />

      {/* WR-038 — a real comment composer; saves through the protected comment engine. */}
      <WriterCommentModal
        isOpen={isCommentModalOpen}
        selectionPreview={(() => {
          const selection = state.textSelection;
          const paragraph = selection ? state.paragraphs.find((item) => item.id === selection.paragraphId) : undefined;
          if (!selection || !paragraph) return undefined;
          return paragraph.spans.map((span) => span.text).join('').slice(selection.start, selection.end);
        })()}
        onClose={() => setIsCommentModalOpen(false)}
        onSave={(text, author) => {
          const paragraphId = state.activeParagraph?.id;
          if (!paragraphId) return false;
          const saved = state.addComment(paragraphId, text, author);
          if (saved) state.setIsReviewPaneOpen(true);
          return saved;
        }}
      />

      {/* Paket 9: das sichtbare, angesagte Ablageziel. Es entscheidet nichts — es liest den reinen Zustand. */}
      <WriterWorkspaceDropZoneOverlay
        state={workspaceDropZone.state}
        onConfirm={workspaceDropZone.confirm}
        onChooseIntent={workspaceDropZone.chooseIntent}
        onDismiss={workspaceDropZone.dismiss}
      />

      {/*
        Paket 22 (Writer): die **Quellenseite** — der sichtbare Einstieg, der den Dokumentabschnitt als
        **Referenz** bereitstellt (Paket 7: dasselbe Trägerformat). Die Knöpfe sind der Weg **ohne** Zeiger;
        das Ziehen am Griff ist der zweite Weg über **dieselbe** Quelle.
      */}
      <WriterWorkspaceCarrierControl
        state={workspaceCarrier.state}
        onCarry={workspaceCarrier.carry}
        onDragStart={workspaceCarrier.onDragStart}
        onClear={workspaceCarrier.clear}
      />

      {/* Custom Context Menu */}
      <WriterEditorContextMenu
        onEditLink={() => {
          const current = state.resolveActiveLink();
          setLinkDialogCurrentUrl(current?.kind === 'external' ? current.url : null);
          setIsLinkDialogOpen(true);
          setContextMenu(null);
        }}
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        state={state}
      />
    </div>
  );
};
