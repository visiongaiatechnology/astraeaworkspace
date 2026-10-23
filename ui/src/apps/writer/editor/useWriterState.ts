// STATUS: DIAMANT VGT SUPREME — Sovereign State Orchestration Hook for Astraea Writer
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkspaceDocument,
  Paragraph,
  WriterSectionDefinition,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterStyleSet,
  WriterAutoCorrectConfig,
  WriterShapeBlockData,
  WriterShapeKind,
  WriterDocumentModel,
  WriterMediaObjectData,
  WriterTextAlignment,
} from '../../../shared/contracts/workspace';
import { useWriterModals } from './modals/useWriterModals';
// AST-0737 Folge: die eine Stelle, an der Writer entscheidet, was sein Primaertext ist — und wohin er
// schreibt. Sie liegt **daneben**, damit der Zeuge **dieselbe** Funktion fahren kann wie der Editor
// (der Hook selbst ist ohne Renderer nicht aufrufbar).
import { projectWriterPrimaryText, readWriterOwnParagraphs } from './writerPrimaryTextProjection';
import {
  BookmarkItem,
  CitationSource,
  DocumentComment,
  EquationBlockData,
  FootnoteItem,
  ImageBlockData,
  MailMergeData,
  PageSetupConfig,
  TableBlockData,
  TrackChangeRevision,
  ViewMode,
  WriterDocumentData,
} from '../types';
import { ensureWriterStyleCatalog } from '../formatting/styles/writerStyles';
import { inferWriterStyleName } from '../formatting/styles/writerStyles';
import {
  resolveWriterCoveredParagraphRanges,
  resolveWriterRangeFormatState,
  type WriterCoveredParagraphRange,
  type WriterRangeStyleFallback,
} from '../formatting/range/writerRangeFormatState';
import { importWriterImage, isSupportedWriterImageMime, WriterImageImportError } from '../media/images/import/writerImageImport';
import {
  readVisibleWriterParagraphIds,
  resolveWriterImageAnchorParagraphId,
} from '../media/images/operations/writerImageAnchorTargeting';
import { scheduleWriterImageReveal } from '../media/images/operations/writerImageReveal';
// W-063/W-065: the two image limits that exist on the insert path (document budget, alt text).
import {
  refuseWriterImageForWrite,
  validateWriterImageAltText,
  wouldExceedWriterImageBudget,
  WRITER_IMAGE_MAX_DOCUMENT_BYTES,
} from '../media/images/operations/writerImageBoundary';
import { normalizeWriterMediaObjects } from '../media/audio-video/writerAudioVideoMedia';
import { normalizeWriterAutoCorrectConfig } from '../formatting/autocorrect/writerAutoCorrect';
import { normalizeWriterLinguisticsConfig } from '../productivity/language/writerLinguistics';
import { useWriterListState } from '../formatting/lists/useWriterListState';
import { createWriterShape } from '../media/objects/shapes/writerShapeOperations';
import { useWriterParagraphOperations } from '../editing/paragraphs/useWriterParagraphOperations';
import { writerParagraphText } from '../editing/caret/writerCaretTargeting';
import { resolveWriterKeyboardEntryIntent } from '../editing/caret/writerKeyboardEntry';
import { resolveWriterPageClickTarget, writerParagraphTextLength, type WriterPageClickInput } from '../editing/caret/writerCaretTargeting';
import {
  resolveWriterColumnXRatio,
  resolveWriterDirectAlignment,
  resolveWriterDirectCaretTarget,
  type WriterDirectCaretInput,
} from '../editing/caret/writerCaretTargeting';
import { clampWriterParagraphSpacingPt } from '../editing/paragraphs/writerParagraphStyleBounds';
import { planWriterParagraphInsert } from '../editing/paragraphs/writerParagraphInsert';
import { writerCanAddParagraphs } from '../editing/paragraphs/writerParagraphLimits';
import { requestWriterCaret } from '../editing/caret/writerCaretController';
import { replaceWriterSelection, resolveWriterSelection } from '../editing/selection/writerSelectionRange';
import type { WriterSelectionRange } from '../editing/selection/writerSelectionRange';
import {
  resolveWriterSurfaceSelectionReport,
  writerSurfaceSelectionReportsEqual,
  type WriterSurfaceSelectionReport,
} from './surface/writerSelectionBridge';
import type { WriterParagraphPointerBox } from '../editing/selection/writerSelectionPointer';
import {
  insertWriterClipboardPayload,
  type WriterClipboardParagraph,
} from '../editing/clipboard/writerClipboardPayload';
import { insertWriterClipboardAtRange } from '../editing/clipboard/writerClipboardRichInsert';
import { useWriterRangeSelection } from './selection/useWriterRangeSelection';
import type { WriterRangeSelectionController } from './selection/useWriterRangeSelection';
import { applyWriterBreakMigration, normalizeWriterBreakMarkers } from '../editing/flow-breaks/writerBreakMarkers';
import { createRevision, createTextRevision } from '../review/revisions/track-changes/writerTrackChangesEngine';
import { useWriterFormattingState } from '../formatting/useWriterFormattingState';
import { useWriterReviewState } from '../review/useWriterReviewState';
import { useWriterTrackedTableOperations } from '../tables/operations/useWriterTrackedTableOperations';
import { useWriterCommentState } from '../review/useWriterCommentState';
import { normalizeWriterComments } from '../review/comments/writerCommentsEngine';
import { useWriterPersistence } from '../persistence/useWriterPersistence';
import { useWriterReferenceState } from '../references/useWriterReferenceState';
import { useWriterDocumentLayout } from '../layout/useWriterDocumentLayout';
import { useWriterContentControlState } from '../forms/useWriterContentControlState';
import { useWriterDocumentInsights } from '../productivity/insights/useWriterDocumentInsights';
import { useWriterProductivityState } from '../productivity/useWriterProductivityState';
import { canEditText, canPersistParagraphMutation, canPersistWriterPatch } from '../security/protection/writerProtectionEngine';
import { openWriterPdfForPrint } from '../interchange/export/pdf/writerPdfExport';
import {
  persistWorkspaceCursor,
  readWorkspaceCursor,
  resolveWriterCursorRestoreDecision,
  type WriterCursorRestoreDecision,
} from '../../../platform/workspace/persistence/workspaceCursorState';
import { requestWriterCaretAfterLayout } from '../editing/caret/writerCaretController';
import { commitWriterHistory, createWriterHistory, replaceWriterHistoryCurrent, stepWriterHistory } from './history/writerHistory';
import type { WriterHistoryCoalesceKey, WriterHistoryCoalesceRequest } from './history/writerHistory';
import type { WriterClipboardReport } from './context-menu/writerClipboardCommand';
import {
  resolveWriterContentViewMode,
  resolveWriterFocusBaseMode,
  resolveWriterViewModeTransition,
  type WriterContentViewMode,
} from './view-modes/writerViewModes';
const DEFAULT_PAGE_SETUP: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};
export function useWriterState(
  document: WorkspaceDocument,
  onUpdateDocument: (doc: WorkspaceDocument) => void,
  /**
   * AST-0737 Folge: die im Workspace **bekannten** Dokumente. Sie sind **noetig**, weil der Inhalt
   * eines **Live**-Verweises nicht im Zieldokument liegt (`fabricReferenceOperations.ts:158-159`
   * legt `cached_snapshot` nur fuer `mode: 'Frozen'` an) — ohne sie bleibt es bei `[]`.
   * Abwesend ist damit **kein** Fehler, sondern der benannte Fall „hier ist nur das Dokument".
   */
  workspaceDocuments: readonly WorkspaceDocument[] = [],
) {
  const writerData: WriterDocumentData = document.writerData ?? {};
  const pageSetup: PageSetupConfig = writerData.pageSetup ?? DEFAULT_PAGE_SETUP;
  const tables: TableBlockData[] = writerData.tables ?? [];
  const images: ImageBlockData[] = writerData.images ?? [];
  const mediaObjects: WriterMediaObjectData[] = useMemo(() => normalizeWriterMediaObjects(writerData.mediaObjects), [writerData.mediaObjects]);
  const equations: EquationBlockData[] = writerData.equations ?? [];
  const shapes: WriterShapeBlockData[] = writerData.shapes ?? [];
  const footnotes: FootnoteItem[] = writerData.footnotes ?? [];
  const citations: CitationSource[] = writerData.citations ?? [];
  const comments: DocumentComment[] = useMemo(
    () => normalizeWriterComments(writerData.comments ?? []),
    [writerData.comments],
  );
  const revisions: TrackChangeRevision[] = writerData.revisions ?? [];
  const bookmarks: BookmarkItem[] = writerData.bookmarks ?? [];
  const mailMerge: MailMergeData | undefined = writerData.mailMerge;
  const autoCorrect: WriterAutoCorrectConfig = useMemo(
    () => normalizeWriterAutoCorrectConfig(writerData.autoCorrect),
    [writerData.autoCorrect],
  );
  const linguistics = useMemo(
    () => normalizeWriterLinguisticsConfig(writerData.linguistics),
    [writerData.linguistics],
  );
  const styleCatalog: WriterStyleCatalog = ensureWriterStyleCatalog(writerData.styleCatalog, writerData.styles);
  const styles: WriterStyleDefinition[] = styleCatalog.paragraphStyles;
  const sections: WriterSectionDefinition[] = writerData.sections ?? [];
  const styleSets: WriterStyleSet[] = writerData.styleSets ?? [];
  // View, Zoom & Layout State
  const initialContentViewMode = resolveWriterFocusBaseMode(writerData.viewMode);
  const [viewMode, setViewModeState] = useState<ViewMode>(initialContentViewMode);
  const [focusBaseMode, setFocusBaseMode] = useState<WriterContentViewMode>(initialContentViewMode);
  const [zoom, setZoom] = useState<number>(100);
  const [showNonPrinting, setShowNonPrinting] = useState<boolean>(false);
  const [showRuler, setShowRuler] = useState<boolean>(true);
  const [isTwoPageSpread, setIsTwoPageSpread] = useState<boolean>(false);
  const [currentTheme, setCurrentTheme] = useState<string>(writerData.currentTheme ?? 'modern-indigo');
  // Modals
  const modals = useWriterModals();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [imageImportError, setImageImportError] = useState<string | null>(null);
  /**
   * W-225: what the caret restore decided, including when it declined and why.
   *
   * The restore used to answer `null` for every refusal, so "the caret is back" and "the caret could not
   * come back" looked identical to the user. This is the value the surface announces from — the same
   * disease as the failed save (`W-229`), which the shell now reports as a status plus a reason.
   */
  const [cursorRestoreNotice, setCursorRestoreNotice] = useState<WriterCursorRestoreDecision | null>(null);
  /** Records what the restore decided, so the surface can announce it (W-225). */
  const recordCursorRestore = useCallback((decision: WriterCursorRestoreDecision) => {
    setCursorRestoreNotice(decision);
  }, []);
  /**
   * The restore banner is a one-time explanation, not a permanent badge.
   *
   * A stale caret in `localStorage` ("the saved caret pointed at a paragraph that
   * no longer exists") is worth a single hint. Keeping it over the toolbar for the
   * rest of the session made it look like an error the user had to fix; the first
   * real interaction dismisses it.
   */
  const dismissCursorRestoreNotice = useCallback(() => {
    setCursorRestoreNotice((current) => (current === null ? current : null));
  }, []);
  /**
   * AST-0099: was der letzte Zwischenablage-Befehl des Absatzkontextmenüs ergeben hat.
   *
   * Dieselbe Krankheit wie bei `W-225` und `W-229`: das Menü führte `handleDeleteParagraph` sofort nach
   * einem **nicht abgewarteten** `writeText` aus und umschloss `readText` mit `catch {}`. Der Ausgang war
   * nirgends zu sehen — "kopiert" und "Zugriff verweigert" sahen identisch aus, und beim Ausschneiden
   * verschwand der Absatz, obwohl nichts in der Zwischenablage lag.
   *
   * Der Bericht ist das Ergebnis der Befehlsfunktion (`writerClipboardCommand.ts`, ohne DOM fahrbar); der
   * Zustand liegt hier, weil das Menü sich nach dem Klick schließt und eine Meldung in ihm nicht überleben
   * würde. Die Oberfläche liest ihn über `WriterClipboardNotice`.
   */
  const [clipboardReport, setClipboardReport] = useState<WriterClipboardReport | null>(null);
  /** Records the outcome of one clipboard command, so the surface can announce it (AST-0099). */
  const recordClipboardReport = useCallback((report: WriterClipboardReport) => {
    setClipboardReport(report);
  }, []);
  // TextBlock & Paragraphs resolution — **eine** Projektion, die zwei Tatsachen traegt
  // (AST-0737 Folge): **was Writer liest** (der eigene Text oder der Inhalt eines gelieferten
  // Verweises) und **wohin Writer schreibt**. Die zweite Tatsache ist die Invariante: ein Objekt mit
  // `type === 'WorkspaceReference'` ist **nie** das Schreibziel — vorher war es das, und der erste
  // Tastendruck ersetzte den Verweis an derselben Kennung durch einen TextBlock (stiller Verlust).
  const workspaceDocumentsById = useMemo(() => {
    const byId: Record<string, WorkspaceDocument> = {};
    for (const known of workspaceDocuments) byId[known.id] = known;
    // Dieses Dokument gewinnt: die Projektion muss **diesen** Stand sehen, nicht einen aelteren.
    byId[document.id] = document;
    return byId;
  }, [document, workspaceDocuments]);
  const primaryText = useMemo(
    () => projectWriterPrimaryText(document, workspaceDocumentsById),
    [document, workspaceDocumentsById],
  );
  const primaryTextBlockId = primaryText.writeTextBlockId;
  const textBlockObj = primaryText.writeTextBlock;
  /**
   * Legacy documents carried a page or column break as text (`---PAGEBREAK---`).
   * The paragraph is projected onto the canonical flag **once per opened
   * document**.
   *
   * Deliberately not keyed on the paragraph array: that array changes on every
   * keystroke, and running the projection continuously meant a user typing the
   * marker string lost the text and got a page break instead — in a brand-new
   * document. The projection cannot tell a legacy marker from typed text; only
   * the document boundary can.
   *
   * Once anything is written, the written array is canonical, because every
   * writer builds on `paragraphs` below. Nothing is written on open: the next
   * real edit persists the canonical form.
   */
  const breakMigration = useMemo(
    () => normalizeWriterBreakMarkers(primaryText.paragraphs),
    // Identity of the opened document and its text source — never the paragraphs. Ein gelieferter
    // Verweis ist eine **zweite** Identitaet: wechselt er, wird neu projiziert.
    [document.id, primaryTextBlockId, primaryText.borrowedText?.referenceId],
  );
  const liveParagraphs = primaryText.paragraphs;
  const paragraphs = applyWriterBreakMigration(liveParagraphs, breakMigration);
  const [activeParagraphId, setActiveParagraphId] = useState<string | null>(() => paragraphs[0]?.id ?? null);
  const [textSelection, setTextSelection] = useState<{ paragraphId: string; start: number; end: number } | null>(null);
  const activeParagraphIndex = paragraphs.findIndex((p) => p.id === activeParagraphId);
  const activeParagraph = activeParagraphIndex >= 0 ? paragraphs[activeParagraphIndex] : paragraphs[0];

  // Where the caret was, so the next start can put it back (W-216).
  const cursorRestoredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (cursorRestoredForRef.current === document.id) return;
    // Do not spend the one attempt on a document whose paragraphs are not loaded yet.
    if (paragraphs.length === 0) return;
    cursorRestoredForRef.current = document.id;
    // W-224: the caret of **this** document, asked for by id — one marker for several documents gave the
    // wrong caret. W-225: the decision is taken with its reason, so a refusal can be explained instead of
    // looking exactly like "there was nothing to restore".
    const decision = resolveWriterCursorRestoreDecision(
      readWorkspaceCursor(document.id),
      document.id,
      paragraphs,
    );
    recordCursorRestore(decision);    if (!decision.restored) return;
    const restored = decision.restore;
    setActiveParagraphId(restored.paragraphId);
    setTextSelection({ paragraphId: restored.paragraphId, start: restored.start, end: restored.end });
    requestWriterCaretAfterLayout({
      paragraphId: restored.paragraphId,
      start: restored.start,
      end: restored.end,
      origin: 'api',
    });
  }, [document.id, paragraphs]);

  useEffect(() => {
    if (!textSelection || textSelection.paragraphId !== activeParagraphId) return;
    // Debounced by the cleanup: moving the caret again cancels the pending write.
    const timer = window.setTimeout(() => {
      persistWorkspaceCursor({
        documentId: document.id,
        paragraphId: textSelection.paragraphId,
        anchor: textSelection.start,
        head: textSelection.end,
        updatedAt: Date.now(),
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [document.id, activeParagraphId, textSelection]);
  // Atomic snapshots
  const initialHistory = createWriterHistory(document);
  const [history, setHistory] = useState<WorkspaceDocument[]>(initialHistory.entries);
  const [historyIndex, setHistoryIndex] = useState<number>(initialHistory.index);
  const historyRef = useRef<WorkspaceDocument[]>(initialHistory.entries);
  const historyIndexRef = useRef<number>(initialHistory.index);
  /**
   * Paragraph ids the current range selection covers. The formatting hook is
   * created before the range selection exists, so it reads them through a getter
   * at command time instead of receiving a stale array.
   */
  const coveredParagraphIdsRef = useRef<readonly string[]>([]);
  /**
   * The same coverage with the offsets the marked range holds inside each
   * paragraph. Character-level commands need the offsets, and so does the reader
   * that reports what the range carries (W-110, W-111).
   */
  const coveredParagraphRangesRef = useRef<readonly WriterCoveredParagraphRange[]>([]);
  const historyCoalesceKeyRef = useRef<WriterHistoryCoalesceKey | null>(initialHistory.coalesceKey);
  const historyDocumentIdRef = useRef(document.id);
  /**
   * The snapshot this hook last handed to `onUpdateDocument`.
   *
   * The host does **not** echo the same object back: `useWorkspaceDocumentUpdates`
   * stamps the schema and `operationEngine.commitDocumentMapTransition` clones the
   * document and bumps `version`. Comparing the incoming `document` prop with
   * `historyRef.current[index]` by identity therefore never matched in the real
   * app — the open-document effect treated every keystroke as "a different
   * document" and reset the history to a single entry, so the toolbar's undo button
   * was greyed out after the first edit.
   */
  const publishedDocumentRef = useRef<WorkspaceDocument | null>(null);
  /**
   * Cheap fingerprint of the Writer-owned payload of a document.
   *
   * Used only to tell "the host stamped/cloned what we published" apart from "some
   * other surface changed the document". It must stay O(paragraph count): comparing
   * the whole document would reintroduce the per-keystroke cost M3 removed.
   */
  const writerPayloadSignature = useCallback((candidate: WorkspaceDocument): string => {
    const paragraphs = readWriterOwnParagraphs(candidate);
    let textLength = 0;
    for (const paragraph of paragraphs) {
      for (const span of paragraph.spans) textLength += span.text.length;
    }
    return [
      candidate.id,
      paragraphs.length,
      textLength,
      paragraphs[0]?.id ?? '',
      paragraphs[paragraphs.length - 1]?.id ?? '',
    ].join('|');
  }, []);
  useEffect(() => {
    const currentHistoryDocument = historyRef.current[historyIndexRef.current];
    if (historyDocumentIdRef.current === document.id && currentHistoryDocument === document) return;

    /**
     * A **different** document opens: a fresh history is the only correct answer.
     */
    if (historyDocumentIdRef.current !== document.id) {
      historyDocumentIdRef.current = document.id;
      publishedDocumentRef.current = null;
      historyRef.current = [document];
      historyIndexRef.current = 0;
      historyCoalesceKeyRef.current = null;
      setHistory([document]);
      setHistoryIndex(0);
      const restoredViewMode = resolveWriterFocusBaseMode(document.writerData?.viewMode);
      setViewModeState(restoredViewMode);
      setFocusBaseMode(restoredViewMode);
      setCurrentTheme(document.writerData?.currentTheme ?? 'modern-indigo');
      return;
    }

    /**
     * The **same** document arrived as a new object. This is the normal case in the
     * desktop app (host stamp + engine clone) and must not destroy the stack: the
     * incoming snapshot simply becomes the current entry.
     *
     * If the payload is the one we published, the running edit continues, so the
     * coalescing key survives and a typing run stays one undo step. If it is not —
     * an external undo from the shell, a live-link refresh — the run ends and the
     * now-stale redo branch is dropped, so the toolbar cannot offer a step into a
     * future that no longer follows from this state.
     */
    const published = publishedDocumentRef.current;
    const isOwnEcho = published !== null
      && writerPayloadSignature(published) === writerPayloadSignature(document);
    const entries = isOwnEcho
      ? [...historyRef.current]
      : historyRef.current.slice(0, historyIndexRef.current + 1);
    entries[historyIndexRef.current] = document;
    historyRef.current = entries;
    publishedDocumentRef.current = document;
    if (!isOwnEcho) historyCoalesceKeyRef.current = null;
    setHistory(entries);
  }, [document, setCurrentTheme, setFocusBaseMode, writerPayloadSignature]);
  const commitDocument = useCallback((updatedDocument: WorkspaceDocument, coalesce: WriterHistoryCoalesceRequest = false) => {
    const next = commitWriterHistory(
      { entries: historyRef.current, index: historyIndexRef.current, coalesceKey: historyCoalesceKeyRef.current },
      updatedDocument,
      coalesce,
    );
    historyRef.current = next.entries;
    historyIndexRef.current = next.index;
    historyCoalesceKeyRef.current = next.coalesceKey;
    setHistory(next.entries);
    setHistoryIndex(next.index);
    publishedDocumentRef.current = updatedDocument;
    onUpdateDocument(updatedDocument);
  }, [onUpdateDocument]);
  const replaceCurrentDocumentSnapshot = useCallback((updatedDocument: WorkspaceDocument) => {
    const next = replaceWriterHistoryCurrent(
      { entries: historyRef.current, index: historyIndexRef.current, coalesceKey: historyCoalesceKeyRef.current },
      updatedDocument,
    );
    historyRef.current = next.entries;
    historyCoalesceKeyRef.current = next.coalesceKey;
    setHistory(next.entries);
    publishedDocumentRef.current = updatedDocument;
    onUpdateDocument(updatedDocument);
  }, [onUpdateDocument]);
  const setViewMode = useCallback((requestedMode: ViewMode) => {
    const transition = resolveWriterViewModeTransition(viewMode, focusBaseMode, requestedMode);
    setFocusBaseMode(transition.focusBaseMode);
    setViewModeState(transition.viewMode);
    if (transition.persistedMode === undefined || writerData.viewMode === transition.persistedMode) return;
    replaceCurrentDocumentSnapshot({
      ...document,
      version: document.version + 1,
      modified_at: Date.now(),
      writerData: {
        ...writerData,
        pageSetup,
        tables,
        viewMode: transition.persistedMode,
      },
    });
  }, [document, focusBaseMode, pageSetup, replaceCurrentDocumentSnapshot, tables, viewMode, writerData]);
  const exitFocusMode = useCallback(() => {
    setViewMode(focusBaseMode);
  }, [focusBaseMode, setViewMode]);
  const contentViewMode = resolveWriterContentViewMode(viewMode, focusBaseMode);
  const { persistWriterData: persistWriterDataRaw, persistParagraphs: persistParagraphsRaw } = useWriterPersistence({
    document,
    writerData,
    primaryTextBlockId,
    // Eine **Verengung am Rand** statt eines Casts: `textBlockObj` ist schon der TextBlock-Inhalt
    // oder `undefined` — und ein Verweisobjekt kann hier nicht mehr stehen (Schreibgrenze).
    textBlockObj,
    pageSetup,
    tables,
    images,
    mediaObjects,
    styles,
    styleCatalog,
    styleSets,
    sections,
    equations,
    shapes,
    footnotes,
    citations,
    comments,
    revisions,
    bookmarks,
    mailMerge,
    autoCorrect,
    viewMode,
    currentTheme,
    commitDocument,
  });
  // Review & Collaboration State Hook (Paket F)
  const reviewState = useWriterReviewState({
    paragraphs,
    revisions,
    tables,
    pageSetup,
    sections,
    styleCatalog,
    currentTheme,
    initialProtectionMode: writerData.protectionMode ?? 'none',
    initialProtectionPasswordHash: writerData.protectionPasswordHash,
    persistParagraphs: persistParagraphsRaw,
    persistWriterData: persistWriterDataRaw,
  });
  const persistWriterData = useCallback((patch: Partial<WriterDocumentData>, coalesce: WriterHistoryCoalesceRequest = false) => {
    if (!canPersistWriterPatch(reviewState.protectionMode, patch)) { handleBlockedEditAttempt(); return; }
    persistWriterDataRaw(patch, coalesce);
  }, [persistWriterDataRaw, reviewState.protectionMode]);

  const persistParagraphs = useCallback((
    nextParagraphs: Paragraph[],
    writerPatch?: Partial<WriterDocumentData>,
    coalesce: WriterHistoryCoalesceRequest = false,
  ) => {
    if (!canPersistParagraphMutation(reviewState.protectionMode, writerPatch)) {
      // AST-0002: eine verweigerte Speicherung darf nicht stumm bleiben. handleBlockedEditAttempt
      // prueft selbst, ob ueberhaupt eine Sperre aktiv ist, und meldet ueber protectionEditAttempted.
      handleBlockedEditAttempt();
      return;
    }
    persistParagraphsRaw(nextParagraphs, writerPatch, coalesce);
  }, [persistParagraphsRaw, reviewState.protectionMode]);

  const contentControlState = useWriterContentControlState({
    rawControls: writerData.contentControls ?? [],
    paragraphs,
    images,
    persistWriterData,
  });
  const {
    contentControls,
    contentControlError,
    handleFillContentControl,
    handleAddRepeatingItem,
    handleUpdateRepeatingItem,
    handleRemoveRepeatingItem,
  } = contentControlState;

  const tableOps = useWriterTrackedTableOperations({
    tables,
    revisions,
    trackChangesActive: reviewState.trackChangesActive,
    activeParagraphId: activeParagraph?.id,
    protectionMode: reviewState.protectionMode,
    persistWriterData,
  });


  const commentState = useWriterCommentState({
    comments,
    protectionMode: reviewState.protectionMode,
    persistWriterData,
  });

  const stepHistory = useCallback((direction: 'undo' | 'redo') => {
    if (reviewState.protectionMode !== 'none') { handleBlockedEditAttempt(); return; }
    const stepped = stepWriterHistory(
      { entries: historyRef.current, index: historyIndexRef.current, coalesceKey: historyCoalesceKeyRef.current },
      direction,
    );
    if (!stepped.document) return;
    /**
     * The restored snapshot **replaces its own history entry** before it is handed
     * to the shell.
     *
     * `onUpdateDocument` gives the document back through the `document` prop, and
     * the open-document effect treats an incoming document that is not identical to
     * `historyRef.current[index]` as "a different document" and resets the stack to
     * that single entry. Publishing a freshly spread copy therefore destroyed the
     * whole history after the **first** undo — multi-step undo and every redo were
     * dead (WR-015). Replacing the entry keeps identity, so stepping stays possible.
     */
    const restored = { ...stepped.document, version: document.version + 1, modified_at: Date.now() };
    const entries = [...stepped.state.entries];
    entries[stepped.state.index] = restored;
    historyRef.current = entries;
    historyIndexRef.current = stepped.state.index;
    // Stepping ends the running edit: the next write must branch from the
    // restored snapshot instead of extending it.
    historyCoalesceKeyRef.current = stepped.state.coalesceKey;
    setHistory(entries);
    setHistoryIndex(stepped.state.index);
    setCurrentTheme(restored.writerData?.currentTheme ?? 'modern-indigo');
    publishedDocumentRef.current = restored;
    onUpdateDocument(restored);
    /**
     * WR-017/WR-020 — an undo has to leave a **valid caret** behind.
     *
     * The restored snapshot can be shorter than the text the caret pointed at (or the
     * active paragraph may not exist in it at all). Without this the surface kept a
     * model offset that no longer addressed anything, and the next keystroke or
     * navigation command had nothing to work from.
     */
    const restoredParagraphs = readWriterOwnParagraphs(restored);
    if (restoredParagraphs.length > 0) {
      const activeIndex = activeParagraphId
        ? restoredParagraphs.findIndex((paragraph) => paragraph.id === activeParagraphId)
        : -1;
      const target = activeIndex >= 0 ? restoredParagraphs[activeIndex]! : restoredParagraphs[0]!;
      const length = target.spans.reduce((total, span) => total + span.text.length, 0);
      const offset = activeIndex >= 0 ? Math.min(textSelection?.start ?? 0, length) : 0;
      setActiveParagraphId(target.id);
      setTextSelection({ paragraphId: target.id, start: offset, end: offset });
      requestWriterCaret({ paragraphId: target.id, start: offset, origin: 'api' });
    }
  }, [activeParagraphId, document.version, onUpdateDocument, reviewState.protectionMode, setActiveParagraphId, textSelection]);
  const handleUndo = useCallback(() => stepHistory('undo'), [stepHistory]);
  const handleRedo = useCallback(() => stepHistory('redo'), [stepHistory]);

  const { pages, stats } = useWriterDocumentInsights({
    paragraphs, pageSetup, styles, sections, tables, images, mediaObjects, equations, footnotes,
  });

  // Paragraph Operations Hook (Protected with reviewState.protectionMode)
  const paragraphOps = useWriterParagraphOperations({
    paragraphs,
    activeParagraphId,
    setActiveParagraphId,
    activeParagraphIndex,
    activeParagraph,
    styles,
    styleCatalog,
    sections,
    trackChangesActive: reviewState.trackChangesActive,
    revisions,
    autoCorrect,
    protectionMode: reviewState.protectionMode,
    persistParagraphs,
    textSelection,
    setTextSelection,
  });

  // Reference & Citations State Hook (Paket E)
  const referenceState = useWriterReferenceState({
    paragraphs,
    footnotes,
    bookmarks,
    tables,
    images,
    equations,
    styles,
    styleCatalog,
    pageSetup,
    sections,
    activeParagraphId,
    activeParagraphIndex,
    // The caret offset of the active paragraph — the ordering key for notes.
    activeTextOffset: textSelection && textSelection.paragraphId === activeParagraph?.id
      ? Math.min(textSelection.start, textSelection.end)
      : activeParagraph?.spans.reduce((length, span) => length + span.text.length, 0) ?? 0,
    persistParagraphs,
    persistWriterData,
    handleInsertTextAtSelection: paragraphOps.handleInsertTextAtSelection,
  });

  // Document Sections & Layout Hook
  const layoutState = useWriterDocumentLayout({
    paragraphs,
    activeParagraph,
    activeParagraphIndex,
    sections,
    pageSetup,
    persistWriterData,
    persistParagraphs,
    textSelection,
    setTextSelection,
    setActiveParagraphId,
    protectionMode: reviewState.protectionMode,
    trackChangesActive: reviewState.trackChangesActive,
    revisions,
  });

  // Formatting & Style Hook
  const formattingState = useWriterFormattingState({
    paragraphs,
    activeParagraph,
    activeParagraphIndex,
    textSelection,
    setTextSelection,
    styles,
    styleCatalog,
    styleSets,
    tables,
    autoCorrect,
    trackChangesActive: reviewState.trackChangesActive,
    revisions,
    protectionMode: reviewState.protectionMode,
    updateActiveParagraph: paragraphOps.updateActiveParagraph,
    updateActiveParagraphFormatting: paragraphOps.updateActiveParagraphFormatting,
    persistParagraphs,
    persistWriterData,
    getCoveredParagraphIds: () => coveredParagraphIdsRef.current,
    getCoveredParagraphRanges: () => coveredParagraphRangesRef.current,
    currentTheme,
    setCurrentTheme,
  });

  /**
   * Prints through the **same renderer as the export**.
   *
   * W-206: this used to be `window.print()`, which prints the application shell — toolbars,
   * panels, the paper with its own CSS — and lets the browser paginate it again. The preview
   * therefore did not correspond to the document's pages, although the acceptance asks for
   * exactly that comparison. Opening the exported PDF means preview and export share one
   * renderer, one page geometry and one set of page breaks.
   */
  const handlePrint = useCallback(() => {
    try {
      openWriterPdfForPrint(
        document.title,
        paragraphs,
        pageSetup,
        tables,
        images,
        styles,
        sections,
        {},
        {
          language: writerData.linguistics?.defaultLanguage ?? 'de-DE',
          createdAt: document.created_at,
          modifiedAt: document.modified_at,
          bookmarks: writerData.bookmarks ?? [],
        },
      );
    } catch {
      // The browser blocked the print window (popup blocker). Printing the shell is the
      // degraded path: the user still gets a dialog, but the geometry then follows the
      // browser instead of the document (W-208). Never leave the click without a reaction.
      window.print();
    }
  }, [document, paragraphs, pageSetup, tables, images, styles, sections, writerData]);

  const handleInsertEquation = useCallback(() => {
    const eq: EquationBlockData = {
      id: `eq-${Date.now()}`,
      latex: 'E = mc^2',
      caption: 'Formel: Energie-Masse-Äquivalent',
      anchorParagraphId: activeParagraph?.id,
    };
    persistWriterData({ equations: [...equations, eq] });
  }, [activeParagraph?.id, equations, persistWriterData]);

  const handleInsertShape = useCallback((kind: WriterShapeKind = 'rectangle') => {
    const newShape = createWriterShape(kind, {
      // WR-034: a new shape starts at the top of its own block, never at the footer.
      x_mm: 20,
      y_mm: 4,
      width_mm: 50,
      height_mm: 30,
      anchor_paragraph_id: activeParagraph?.id,
    });
    persistWriterData({ shapes: [...shapes, newShape] });
  }, [activeParagraph?.id, persistWriterData, shapes]);

  const handleUpdateShapes = useCallback((updated: WriterShapeBlockData[]) => {
    persistWriterData({ shapes: updated });
  }, [persistWriterData]);

  const handleOpenImageProperties = useCallback((img: ImageBlockData) => {
    modals.setSelectedImageForProperties(img);
    modals.setIsImagePropertiesOpen(true);
  }, [modals]);

  const handleOpenEquationModal = useCallback((eq?: EquationBlockData) => {
    modals.setSelectedEquationForModal(eq ?? null);
    modals.setIsEquationModalOpen(true);
  }, [modals]);

  const handleSaveEquation = useCallback((eq: EquationBlockData) => {
    const exists = equations.some((item) => item.id === eq.id);
    const updated = exists
      ? equations.map((item) => (item.id === eq.id ? eq : item))
      : [...equations, eq];
    persistWriterData({ equations: updated });
  }, [equations, persistWriterData]);

  const handleInsertTableOfFigures = useCallback((tofParagraphs: Paragraph[]) => {
    const idx = activeParagraphIndex >= 0 ? activeParagraphIndex : paragraphs.length - 1;
    const next = [...paragraphs];
    next.splice(idx + 1, 0, ...tofParagraphs);
    persistParagraphs(next);
  }, [activeParagraphIndex, paragraphs, persistParagraphs]);

  const handleInsertImageFile = useCallback(async (file: File) => {
    /**
     * WR-039 — the drop/paste path refused the write but still decoded the file and revealed
     * an image that was never stored. A protected document refuses **before** any work, and
     * says why.
     */
    if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }
    setImageImportError(null);
    try {
      /**
       * WR-033 (native M7 re-probe) — the anchor is resolved, not guessed.
       *
       * `activeParagraph` falls back to `paragraphs[0]`, so an image inserted while the
       * caret sits on page 5 used to be anchored to page 1 (and, because the terminal
       * layer was never mounted, it was invisible either way). The caret paragraph wins,
       * then the active paragraph if the user can see it, then the last visible
       * paragraph, then the flow's end.
       */
      const anchorParagraphId = resolveWriterImageAnchorParagraphId({
        paragraphs,
        caretParagraphId: textSelection?.paragraphId ?? null,
        activeParagraphId,
        visibleParagraphIds: readVisibleWriterParagraphIds(),
      });
      const image = await importWriterImage(file, anchorParagraphId);
      // WR-045: only a real `data:image/…;base64` payload may enter the document.
      const payloadRefusal = refuseWriterImageForWrite(image);
      if (payloadRefusal) throw new WriterImageImportError(payloadRefusal);
      // W-063: the per-image limit alone left the **sum** unbounded. Refuse before the write, so the
      // document that already exists is untouched.
      if (wouldExceedWriterImageBudget(images, image)) {
        throw new WriterImageImportError(
          `Das Dokument hat für Bilder keinen Platz mehr (Grenze ${Math.round(WRITER_IMAGE_MAX_DOCUMENT_BYTES / (1024 * 1024))} MiB). `
          + 'Bitte zuerst ein Bild entfernen.'
        );
      }
      // W-065: the import fills alt text from the file name; an import without a name must not store
      // an unusable description.
      const altText = validateWriterImageAltText(image.altText);
      if (!altText.ok) throw new WriterImageImportError(altText.message);
      const nextImages = [...images, { ...image, altText: altText.value }];
      /**
       * Native round 6 — **the caret leaves the picture's paragraph.**
       *
       * A block image is drawn inside its anchor paragraph, *below* that paragraph's text.
       * Leaving the caret on the anchor's first line is what made a caption typed without a
       * successful click appear **above** the picture: the click below the image was discarded
       * by the page hitbox and the keystrokes went to the old caret position.
       *
       * The insertion therefore ends where a word processor ends it — in the text that follows
       * the picture: the existing next paragraph, or a freshly created one, written in the
       * same transaction as the image so one `Strg+Z` removes both.
       */
      const anchorIndex = paragraphs.findIndex((paragraph) => paragraph.id === anchorParagraphId);
      const following = anchorIndex >= 0 ? paragraphs[anchorIndex + 1] : undefined;
      if (following) {
        persistWriterData({ images: nextImages });
        setActiveParagraphId(following.id);
        setTextSelection({ paragraphId: following.id, start: 0, end: 0 });
        requestWriterCaret({ paragraphId: following.id, start: 0, origin: 'api' });
      } else if (anchorIndex >= 0 && writerCanAddParagraphs(paragraphs.length)) {
        const plan = planWriterParagraphInsert({
          paragraphs,
          afterIdx: anchorIndex,
          styles,
          newParagraphId: crypto.randomUUID(),
        });
        if (plan) {
          persistParagraphs(plan.paragraphs, { images: nextImages });
          setActiveParagraphId(plan.insertedParagraphId);
          setTextSelection({ paragraphId: plan.caret.paragraphId, start: 0, end: 0 });
          requestWriterCaret({ paragraphId: plan.caret.paragraphId, start: plan.caret.offset, origin: 'api' });
        } else {
          persistWriterData({ images: nextImages });
        }
      } else {
        persistWriterData({ images: nextImages });
      }
      // The picture is in the model now; after the next paint it is scrolled into view and
      // briefly marked, so the insert is visibly confirmed instead of silently happening.
      scheduleWriterImageReveal(image.id);
    } catch (error: unknown) {
      setImageImportError(
        error instanceof WriterImageImportError
          ? error.message
          : 'Das Bild konnte nicht dekodiert und sicher importiert werden.'
      );
    }
  }, [
    activeParagraphId,
    images,
    paragraphs,
    persistParagraphs,
    persistWriterData,
    reviewState.protectionMode,
    setActiveParagraphId,
    styles,
    textSelection?.paragraphId,
  ]);

  /**
   * Dropping a file on a page must never leave the application. The default
   * action of a drop is to navigate to the file, so `preventDefault` has to run
   * for **every** drop, not only for the ones we recognise. Recognised images are
   * imported; anything else is refused with a visible message and leaves the
   * document untouched.
   */
  const handlePaperDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files as FileList)
      .find((candidate) => isSupportedWriterImageMime(candidate.type));
    if (file) {
      void handleInsertImageFile(file);
      return;
    }
    if ((e.dataTransfer.files?.length ?? 0) > 0) {
      setImageImportError('Nur JPEG-, PNG- und WebP-Bilder können auf die Seite gezogen werden.');
    }
  }, [handleInsertImageFile]);

  /**
   * M2 · WR-008 — memory of the last direct click.
   *
   * A double click is delivered as *click, click, dblclick*. Without this memory the
   * first click would create a paragraph, the **second click another one**, and the
   * `dblclick` would mutate only the last — an orphan with the wrong alignment,
   * exactly the race the plan forbids.
   *
   * The memory therefore does two things:
   *
   * 1. a second click **at the same point** while the created paragraph is still
   *    empty keeps that one instead of adding another — so the first click needs no
   *    delay and stays instantaneous;
   * 2. the following `dblclick` **mutates that same paragraph** instead of adding one.
   */
  const lastDirectCaretRef = useRef<{
    paragraphId: string;
    created: boolean;
    at: number;
    point: { x: number; y: number };
  } | null>(null);
  /** How long after a direct click a second click / `dblclick` is the same gesture. */
  const DIRECT_DOUBLE_CLICK_WINDOW_MS = 700;
  /** Pointer tolerance for "the same spot", in viewport pixels. */
  const DIRECT_GESTURE_POINT_TOLERANCE_PX = 4;

  const placeCaretInParagraph = useCallback((paragraphId: string, offset: number) => {
    const target = paragraphs.find((paragraph) => paragraph.id === paragraphId);
    const bounded = Math.max(0, Math.min(offset, target ? writerParagraphTextLength(target) : offset));
    setActiveParagraphId(paragraphId);
    setTextSelection({ paragraphId, start: bounded, end: bounded });
    requestWriterCaret({ paragraphId, start: bounded, origin: 'page-click' });
  }, [paragraphs, setActiveParagraphId]);

  /**
   * The paragraph of an unfinished direct gesture this pointer event belongs to:
   * recent, at the same spot, and still empty (nothing has been typed yet).
   */
  const resolveOpenDirectGesture = useCallback((point: { x: number; y: number }) => {
    const gesture = lastDirectCaretRef.current;
    if (!gesture || !gesture.created) return null;
    if (Date.now() - gesture.at > DIRECT_DOUBLE_CLICK_WINDOW_MS) return null;
    if (Math.abs(gesture.point.x - point.x) > DIRECT_GESTURE_POINT_TOLERANCE_PX) return null;
    if (Math.abs(gesture.point.y - point.y) > DIRECT_GESTURE_POINT_TOLERANCE_PX) return null;
    const paragraph = paragraphs.find((item) => item.id === gesture.paragraphId);
    if (!paragraph || writerParagraphTextLength(paragraph) > 0) return null;
    return gesture;
  }, [paragraphs]);

  /**
   * WR-008 — one atomic alignment change of one paragraph.
   *
   * Coalesced into the same history step as the insertion that came with it, so a
   * "double click → centred line" is a single undo, not two.
   */
  const updateParagraphAlignment = useCallback((paragraphId: string, alignment: WriterTextAlignment) => {
    if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }
    const current = paragraphs.find((paragraph) => paragraph.id === paragraphId);
    if (!current || current.style.alignment === alignment) return;
    persistParagraphs(
      paragraphs.map((paragraph) => (
        paragraph.id === paragraphId
          ? { ...paragraph, style: { ...paragraph.style, alignment } }
          : paragraph
      )),
      undefined,
      `direct-align:${paragraphId}`,
    );
  }, [paragraphs, persistParagraphs, reviewState.protectionMode]);

  /**
   * A click on empty paper area must always end in a usable writing position:
   * either the caret moves into the resolved paragraph, or a paragraph is created
   * with the semantic vertical distance the user clicked (WR-006/WR-007).
   * Read-only or protected documents fail closed and place no caret.
   */
  const handlePageBackgroundClick = useCallback((click: WriterPageClickInput) => {
    if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }
    dismissCursorRestoreNotice();

    /**
     * WR-006 … WR-010: when the page measured itself, the geometry decides — the
     * pointer height, the real line grid and the clicked column. The legacy
     * anchor-only decision stays as the fallback for callers that cannot measure.
     */
    if (click.direct) {
      /**
       * The second click of a double click lands on the paragraph the first one just
       * created, but the page geometry does not contain it yet. Re-using the open
       * gesture is what keeps "one gesture, one line" true without delaying the first
       * click.
       */
      const openGesture = resolveOpenDirectGesture(click.direct.pointer);
      if (openGesture) {
        lastDirectCaretRef.current = { ...openGesture, at: Date.now() };
        placeCaretInParagraph(openGesture.paragraphId, 0);
        return;
      }
      const direct = resolveWriterDirectCaretTarget(click.direct);
      if (direct.kind === 'focus-existing') {
        lastDirectCaretRef.current = {
          paragraphId: direct.paragraphId,
          created: false,
          at: Date.now(),
          point: { x: click.direct.pointer.x, y: click.direct.pointer.y },
        };
        placeCaretInParagraph(direct.paragraphId, direct.offset);
        return;
      }
      const spaceBeforePt = clampWriterParagraphSpacingPt(direct.spaceBeforePt) ?? 0;
      const created = paragraphOps.handleAddDirectParagraph(direct.afterIndex, {
        alignment: direct.alignment,
        spaceBeforePt,
      });
      lastDirectCaretRef.current = created
        ? {
            paragraphId: created,
            created: true,
            at: Date.now(),
            point: { x: click.direct.pointer.x, y: click.direct.pointer.y },
          }
        : null;
      return;
    }

    const target = resolveWriterPageClickTarget(click);
    if (target.kind === 'create-paragraph') {
      paragraphOps.handleAddParagraph(-1);
      return;
    }
    if (!target.paragraphId) return;
    placeCaretInParagraph(target.paragraphId, target.offset);
  }, [
    dismissCursorRestoreNotice,
    paragraphOps.handleAddDirectParagraph,
    paragraphOps.handleAddParagraph,
    placeCaretInParagraph,
    resolveOpenDirectGesture,
    reviewState.protectionMode,
  ]);

  /**
   * WR-008 — the **only** gesture that may set a horizontal alignment from the page.
   *
   * A double click on existing text never reaches this function (the page filters it
   * out), and a target that resolves to a paragraph which already carries text is
   * ignored as well: the plan forbids re-formatting a paragraph just because it was
   * double-clicked. A merely empty paragraph may adopt the alignment, because it is
   * still the free line the user aimed at.
   */
  const handleDirectAlignClick = useCallback((direct: WriterDirectCaretInput) => {
    if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }
    dismissCursorRestoreNotice();
    const target = resolveWriterDirectCaretTarget({ ...direct, intent: 'direct-align' });
    const alignment = resolveWriterDirectAlignment(resolveWriterColumnXRatio(direct.column, direct.pointer.x));

    if (target.kind === 'focus-existing') {
      const paragraph = paragraphs.find((item) => item.id === target.paragraphId);
      if (!paragraph) return;
      if (writerParagraphTextLength(paragraph) > 0) {
        // Existing text: the double click was a word selection, not an alignment.
        placeCaretInParagraph(target.paragraphId, target.offset);
        return;
      }
      updateParagraphAlignment(paragraph.id, alignment);
      placeCaretInParagraph(paragraph.id, 0);
      return;
    }

    /**
     * The clicks of this very gesture already created a paragraph. Mutating it is the
     * atomic answer: one paragraph, one final alignment, no orphan.
     */
    const last = lastDirectCaretRef.current;
    const recentlyCreated = last
      && last.created
      && Date.now() - last.at <= DIRECT_DOUBLE_CLICK_WINDOW_MS
      && paragraphs.some((item) => item.id === last.paragraphId && writerParagraphTextLength(item) === 0);
    if (recentlyCreated && last) {
      updateParagraphAlignment(last.paragraphId, alignment);
      lastDirectCaretRef.current = { ...last, at: Date.now() };
      placeCaretInParagraph(last.paragraphId, 0);
      return;
    }

    const spaceBeforePt = clampWriterParagraphSpacingPt(target.spaceBeforePt) ?? 0;
    const created = paragraphOps.handleAddDirectParagraph(target.afterIndex, {
      alignment,
      spaceBeforePt,
    });
    lastDirectCaretRef.current = created
      ? {
          paragraphId: created,
          created: true,
          at: Date.now(),
          point: { x: direct.pointer.x, y: direct.pointer.y },
        }
      : null;
  }, [
    dismissCursorRestoreNotice,
    paragraphOps.handleAddDirectParagraph,
    paragraphs,
    placeCaretInParagraph,
    reviewState.protectionMode,
    updateParagraphAlignment,
  ]);


  /**
   * AST-0001 · Masterplan Zeile 117 fordert für „Leeres Dokument unmittelbar beschreiben" ausdrücklich
   * **Maus-/Tastatursteuerung**. Der Mausweg ist `handlePageBackgroundClick`; dies ist der Tastaturweg.
   *
   * Die Entscheidung liegt rein in `resolveWriterKeyboardEntryIntent`; hier wird sie nur ausgeführt.
   * Gibt `true` zurück, wenn der Tastendruck übernommen wurde — nur dann darf der Aufrufer
   * `preventDefault` setzen.
   */
  const handleKeyboardEntry = useCallback(
    (key: string, modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean => {
      // Vor der Absicht prüfen: `handleAddParagraph` kehrt bei fehlender Schreibberechtigung **still**
      // zurück. Ohne diese Vorprüfung meldete die Funktion „übernommen", obwohl nichts geschah, und der
      // Tastendruck wäre verschluckt.
      if (!canEditText(reviewState.protectionMode)) return false;

      const intent = resolveWriterKeyboardEntryIntent({
        hasTextContent: paragraphs.some((paragraph) => writerParagraphText(paragraph).length > 0),
        key,
        ctrlKey: modifiers.ctrlKey,
        metaKey: modifiers.metaKey,
        altKey: modifiers.altKey,
        hasCaret: Boolean(textSelection),
      });
      if (intent.action === 'ignore') return false;
      // Keyboard entry into the document is a real interaction: dismiss the restore hint.
      dismissCursorRestoreNotice();

      // `handleAddParagraph` nimmt **keinen** Starttext — der Absatz entsteht leer, der Text folgt.
      paragraphOps.handleAddParagraph(-1);
      if (intent.action === 'enter-and-type') {
        paragraphOps.handleParagraphChange(0, intent.text, intent.text.length);
      }
      return true;
    },
    [
      dismissCursorRestoreNotice,
      paragraphOps.handleAddParagraph,
      paragraphOps.handleParagraphChange,
      paragraphs,
      reviewState.protectionMode,
      textSelection,
    ],
  );

  /**
   * Measures the rendered paragraph boxes of every visible page so the drag
   * selection can decide which paragraph and offset the pointer refers to. The
   * measurement lives here; the decision is pure (`writerSelectionPointer`).
   */
  const measureRangeSelectionBoxes = useCallback((): WriterParagraphPointerBox[] => {
    // `document` is shadowed by the workspace document parameter of this hook.
    const domDocument = globalThis.document;
    if (!domDocument) return [];
    const lengths = new Map(paragraphs.map((paragraph) => [paragraph.id, writerParagraphTextLength(paragraph)]));
    const boxes: WriterParagraphPointerBox[] = [];
    for (const element of Array.from(domDocument.querySelectorAll<HTMLElement>('[data-writer-paragraph-anchor]'))) {
      const paragraphId = element.dataset.writerParagraphAnchor ?? '';
      if (paragraphId.length === 0) continue;
      const rect = element.getBoundingClientRect();
      boxes.push({
        paragraphId,
        top: rect.top,
        bottom: rect.bottom,
        textLength: lengths.get(paragraphId) ?? 0,
      });
    }
    return boxes;
  }, [paragraphs]);

  const rangeSelection = useWriterRangeSelection({
    paragraphs,
    enabled: canEditText(reviewState.protectionMode),
    measureBoxes: measureRangeSelectionBoxes,
  });
  // Kept in a ref so the formatting hook, which is created earlier, reads the
  // current coverage whenever a paragraph-level command runs.
  coveredParagraphIdsRef.current = rangeSelection.coveredParagraphIds;
  const coveredParagraphRanges = useMemo(
    () => resolveWriterCoveredParagraphRanges(paragraphs, activeParagraphIndex, textSelection, rangeSelection.selection),
    [paragraphs, activeParagraphIndex, textSelection, rangeSelection.selection],
  );
  coveredParagraphRangesRef.current = coveredParagraphRanges;

  /**
   * What the marked range carries, mixed flags included (W-111, W-113, W-116,
   * W-119). The named style supplies the fallback for a paragraph that carries no
   * explicit value — the same fallback the toolbar showed before, so a paragraph
   * without an explicit alignment still reports its style's alignment.
   */
  const activeRangeStyle = useMemo<WriterRangeStyleFallback>(() => {
    const styleName = activeParagraph ? inferWriterStyleName(activeParagraph) : 'normal';
    const definition = styles.find((candidate) => candidate.name === styleName) ?? styles[0];
    return {
      alignment: definition?.alignment,
      lineHeight: definition?.lineHeight,
      fontFamily: definition?.fontFamily,
      fontSizePt: definition?.fontSizePt,
    };
  }, [activeParagraph, styles]);
  const rangeFormatState = useMemo(
    () => resolveWriterRangeFormatState(paragraphs, coveredParagraphRanges, activeRangeStyle),
    [paragraphs, coveredParagraphRanges, activeRangeStyle],
  );

  /**
   * A blocked document swallows keystrokes silently. Recording the attempt lets
   * the visible blockade explain itself exactly when the user needs it.
   */
  const [protectionEditAttempted, setProtectionEditAttempted] = useState(false);
  const handleBlockedEditAttempt = useCallback(() => {
    if (canEditText(reviewState.protectionMode)) return;
    setProtectionEditAttempted(true);
  }, [reviewState.protectionMode]);
  useEffect(() => {
    setProtectionEditAttempted(false);
  }, [reviewState.protectionMode]);

  const handleRangeSelectionStart = useCallback((pIdx: number, offset: number) => {
    const paragraph = paragraphs[pIdx];
    if (!paragraph) return;
    rangeSelection.begin({ paragraphId: paragraph.id, offset });
  }, [paragraphs, rangeSelection]);

  /**
   * Pasted content arrives as parsed paragraphs. The paste replaces a selection
   * inside the target paragraph, keeps the head and the tail of that paragraph,
   * and continues in the last pasted paragraph.
   */
  const handlePastePayload = useCallback((
    payload: readonly WriterClipboardParagraph[],
    selectionStart: number,
    selectionEnd: number,
  ) => {
    if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }
    if (payload.length === 0) return;
    const index = activeParagraphIndex >= 0 ? activeParagraphIndex : paragraphs.length - 1;
    const newParagraphIds = Array.from(
      { length: Math.max(0, payload.length - 1) },
      () => crypto.randomUUID(),
    );
    const result = insertWriterClipboardPayload(
      paragraphs,
      index,
      selectionStart,
      payload,
      newParagraphIds,
      selectionEnd,
    );
    if (!result) return;
    persistParagraphs(result.paragraphs);
    rangeSelection.clear();
    setActiveParagraphId(result.caret.paragraphId);
    setTextSelection({ paragraphId: result.caret.paragraphId, start: result.caret.offset, end: result.caret.offset });
    requestWriterCaret({ paragraphId: result.caret.paragraphId, start: result.caret.offset, origin: 'paste' });
  }, [activeParagraphIndex, paragraphs, persistParagraphs, rangeSelection, reviewState.protectionMode, setActiveParagraphId]);

  /**
   * Keyboard navigation across paragraph borders. Without Shift the caret moves
   * and any range selection is dropped; with Shift the range keeps its anchor and
   * only its focus follows the key, which is the keyboard equivalent of the
   * cross-paragraph mouse selection.
   */
  const handleParagraphNavigation = useCallback((
    target: { paragraphId: string; offset: number },
    extendSelection: boolean,
  ) => {
    if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }
    if (extendSelection) {
      const anchor = rangeSelection.anchor ?? {
        paragraphId: textSelection?.paragraphId ?? activeParagraphId ?? target.paragraphId,
        offset: textSelection?.start ?? 0,
      };
      if (!rangeSelection.anchor) rangeSelection.begin(anchor);
      rangeSelection.extend({ paragraphId: target.paragraphId, offset: target.offset });
    } else {
      rangeSelection.clear();
    }
    setActiveParagraphId(target.paragraphId);
    setTextSelection({ paragraphId: target.paragraphId, start: target.offset, end: target.offset });
    requestWriterCaret({ paragraphId: target.paragraphId, start: target.offset, origin: 'api' });
  }, [activeParagraphId, rangeSelection, reviewState.protectionMode, setActiveParagraphId, textSelection]);

  /**
   * Typing, deleting or pressing Enter while a selection spans paragraphs:
   * the whole range is replaced by one operation, and the caret continues in
   * the surviving paragraph.
   *
   * `applySelectionReplacement` is the one implementation; the rich-text surface
   * passes the range it read from the DOM, the pointer path passes the range the
   * drag controller reconstructed. Two call sites, one behaviour.
   */
  const applySelectionReplacement = useCallback((
    selection: NonNullable<WriterRangeSelectionController['selection']>,
    replacement: string,
  ) => {
    const lineBreakCount = replacement.split('\n').length - 1;
    const newParagraphIds = Array.from({ length: Math.max(0, lineBreakCount) }, () => crypto.randomUUID());
    const result = replaceWriterSelection(paragraphs, selection, replacement, newParagraphIds);
    if (!result) return;

    let revisionPatch: { revisions: TrackChangeRevision[] } | undefined;
    if (reviewState.trackChangesActive) {
      const deletionRevisions = result.removedParagraphIds.flatMap((removedId) => {
        const index = paragraphs.findIndex((paragraph) => paragraph.id === removedId);
        const removed = index >= 0 ? paragraphs[index] : undefined;
        if (!removed) return [];
        return [createRevision('delete', removed.id, 'You', removed.spans.map((span) => span.text).join(''), '', 'Absatz durch Auswahl ersetzt', {
          kind: 'paragraph-delete' as const,
          paragraph: structuredClone(removed),
          index,
          previousParagraphId: paragraphs[index - 1]?.id,
          nextParagraphId: paragraphs[index + 1]?.id,
        })];
      });
      const beforeText = paragraphs[selection.startParagraphIndex]?.spans.map((span) => span.text).join('') ?? '';
      const afterText = result.paragraphs.find((paragraph) => paragraph.id === result.caret.paragraphId)?.spans
        .map((span) => span.text).join('') ?? '';
      revisionPatch = {
        revisions: [
          ...revisions,
          ...deletionRevisions,
          createTextRevision(result.caret.paragraphId, beforeText, afterText, 'You', 'Auswahl ersetzt'),
        ],
      };
    }

    persistParagraphs(result.paragraphs, revisionPatch);
    rangeSelection.clear();
    setActiveParagraphId(result.caret.paragraphId);
    setTextSelection({ paragraphId: result.caret.paragraphId, start: result.caret.offset, end: result.caret.offset });
    requestWriterCaret({ paragraphId: result.caret.paragraphId, start: result.caret.offset, origin: 'range-replace' });
  }, [paragraphs, persistParagraphs, rangeSelection, reviewState.trackChangesActive, revisions, setActiveParagraphId]);

  const handleReplaceRangeSelection = useCallback((replacement: string) => {
    if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }
    const selection = rangeSelection.selection;
    if (!selection) return;
    applySelectionReplacement(selection, replacement);
  }, [applySelectionReplacement, rangeSelection.selection, reviewState.protectionMode]);

  /**
   * The rich-text surface has a real DOM range, so it reports the selection
   * directly instead of letting a pointer heuristic reconstruct it.
   *
   * This is the one place a DOM range becomes editor state: the caret of a single
   * paragraph for the single-paragraph commands, and the covered ranges for the
   * multi-paragraph commands (`bold` over three paragraphs, paragraph alignment).
   */
  const lastSurfaceReportRef = useRef<WriterSurfaceSelectionReport | null>(null);
  const handleSurfaceSelectionChange = useCallback((range: WriterSelectionRange | null) => {
    if (!range) return;
    const report = resolveWriterSurfaceSelectionReport(paragraphs, range);
    if (!report) return;
    if (writerSurfaceSelectionReportsEqual(lastSurfaceReportRef.current, report)) return;
    lastSurfaceReportRef.current = report;
    // A caret that moved away from the restored one is the user writing, not the
    // restore being reported: the one-time banner has done its job.
    const movedAwayFromRestore = !textSelection
      || textSelection.paragraphId !== report.textSelection.paragraphId
      || textSelection.start !== report.textSelection.start
      || textSelection.end !== report.textSelection.end;
    if (movedAwayFromRestore) dismissCursorRestoreNotice();
    rangeSelection.apply(report.rangeSelection);
    setActiveParagraphId(report.activeParagraphId);
    setTextSelection(report.textSelection);
  }, [dismissCursorRestoreNotice, paragraphs, rangeSelection, setActiveParagraphId, textSelection]);

  /**
   * Replace a range the surface owns (multi-paragraph selection, paste, delete).
   *
   * The range is passed in, not read from React state: a `keydown` can arrive in
   * the same tick as the `selectionchange` that produced it, and reading a stale
   * state copy would replace the previous selection.
   */
  const handleReplaceSurfaceRange = useCallback((range: WriterSelectionRange, replacement: string) => {
    if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }
    const resolved = resolveWriterSelection(paragraphs, range);
    if (!resolved) return;
    applySelectionReplacement(resolved, replacement);
  }, [applySelectionReplacement, paragraphs, reviewState.protectionMode]);

  /**
   * WR-019 — paste with formatting, through the model.
   *
   * The clipboard payload is already parsed into semantic blocks of spans
   * (`parseWriterClipboardHtml`); the untrusted HTML itself never reaches the DOM.
   * `insertWriterClipboardAtRange` keeps the head of the first covered paragraph and
   * the tail of the last one, so pasting into the middle of a sentence behaves like
   * any other replacement, and the caret follows the inserted text.
   */
  const handlePasteSurfaceRange = useCallback((
    range: WriterSelectionRange,
    blocks: readonly WriterClipboardParagraph[],
  ) => {
    if (!canEditText(reviewState.protectionMode)) { handleBlockedEditAttempt(); return; }
    if (blocks.length === 0) return;
    const newParagraphIds = Array.from(
      { length: Math.max(0, blocks.length - 1) },
      () => crypto.randomUUID(),
    );
    const result = insertWriterClipboardAtRange({ paragraphs, range, blocks, newParagraphIds });
    if (!result) return;
    // WR-020: a paste is its own undo step — consecutive pastes must not merge.
    persistParagraphs(result.paragraphs);
    setActiveParagraphId(result.caret.paragraphId);
    setTextSelection({ paragraphId: result.caret.paragraphId, start: result.caret.offset, end: result.caret.offset });
    requestWriterCaret({ paragraphId: result.caret.paragraphId, start: result.caret.offset, origin: 'paste' });
  }, [paragraphs, persistParagraphs, reviewState.protectionMode, setActiveParagraphId]);

  /**
   * The surface asks for a re-projection after the live DOM stopped matching the
   * model. Bumping a counter re-renders the pages from `Paragraph[]`, which is the
   * only authority — the DOM is never patched back by hand.
   */
  const [surfaceProjectionEpoch, setSurfaceProjectionEpoch] = useState(0);
  const requestSurfaceProjectionRepair = useCallback(() => {
    setSurfaceProjectionEpoch((value) => value + 1);
  }, []);


  const listState = useWriterListState({
    paragraphs,
    persistParagraphs,
    updateActiveParagraph: paragraphOps.updateActiveParagraph,
    persistWriterData,
  });
  const writerModel: WriterDocumentModel = { ...writerData, pageSetup, tables };
  const productivityState = useWriterProductivityState({
    documentVersion: document.version, paragraphs, writerModel, revisions,
    trackChangesActive: reviewState.trackChangesActive, protectionMode: reviewState.protectionMode,
    persistParagraphs, persistWriterData, insertTextAtSelection: paragraphOps.handleInsertTextAtSelection,
    sessionHistory: history, currentDocument: document, currentHistoryIndex: historyIndex, commitDocument,
  });

  return {
    handleKeyboardEntry,
    pageSetup, tables, images, mediaObjects, equations, shapes, footnotes, citations, comments, revisions, bookmarks, mailMerge, autoCorrect, linguistics, styles, styleCatalog, styleSets, sections, contentControls, contentControlError,
    viewMode, contentViewMode, setViewMode, exitFocusMode, zoom, setZoom, showNonPrinting, setShowNonPrinting,
    showRuler, setShowRuler, isTwoPageSpread, setIsTwoPageSpread,
    currentTheme, setCurrentTheme,
    ...modals,
    ...listState,
    ...paragraphOps,
    ...formattingState,
    ...reviewState,
    ...tableOps,
    ...commentState,
    ...referenceState,
    ...layoutState,
    ...productivityState,
    imageInputRef, imageImportError, setImageImportError, paragraphs, activeParagraphId, setActiveParagraphId, textSelection,
    // W-225: the restore's decision, so the surface can say what happened to the caret instead of leaving
    // a refusal indistinguishable from a fresh document.
    cursorRestoreNotice,
    // AST-0099: the last clipboard command's outcome, so a refused clipboard is visible instead of silent.
    clipboardReport,
    recordClipboardReport,
    activeParagraphIndex, activeParagraph, canUndo: reviewState.protectionMode === 'none' && historyIndex > 0, canRedo: reviewState.protectionMode === 'none' && historyIndex < history.length - 1,
    pages, stats, persistWriterData, persistParagraphs, handleUndo, handleRedo, handlePrint,
    handleInsertEquation, handleInsertShape, handleUpdateShapes, handleOpenImageProperties, handleOpenEquationModal, handleSaveEquation, handleInsertTableOfFigures, handleInsertImageFile, handlePaperDrop, handlePageBackgroundClick,
    handleRangeSelectionStart, handleReplaceRangeSelection, handleParagraphNavigation, handlePastePayload,
    handleDirectAlignClick,
    // The one DOM-range → editor-state bridge of the rich-text surface, plus the
    // escape hatch that re-projects the pages when the DOM stopped matching.
    handleSurfaceSelectionChange, handleReplaceSurfaceRange, handlePasteSurfaceRange, surfaceProjectionEpoch, requestSurfaceProjectionRepair,
    handleBlockedEditAttempt, protectionEditAttempted,
    rangeSelectionParagraphIds: rangeSelection.coveredParagraphIds,
    hasRangeSelection: rangeSelection.spansParagraphs,
    coveredParagraphRanges,
    rangeFormatState,
    handleFillContentControl, handleAddRepeatingItem, handleUpdateRepeatingItem, handleRemoveRepeatingItem,
  };
}
