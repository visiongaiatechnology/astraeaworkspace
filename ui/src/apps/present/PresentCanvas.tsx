import React, { useEffect, useMemo, useState } from 'react';
import '../../design-system/styles/AppThemeSelection.css';
import { WorkspaceDocument, PresentSlide, PresentDocumentModel } from '../../shared/contracts/workspace';
import { PresentSidebar, type PresentViewMode } from './editor/navigation/PresentSidebar';
import { SlideContentEditor } from './editor/SlideContentEditor';
import { PresentSlideSorterView } from './editor/outline/PresentSlideSorterView';
import { PresentOutlineView } from './editor/outline/PresentOutlineView';
import { PresenterModeModal } from './presenter/PresenterModeModal';
import { ensurePresentDesign } from './design/presentDesign';
import { downloadPresentPdf, downloadPresentSlidePng } from './interchange/render/presentExport';
import { applyTransitionToSlides, normalizePresentTransition } from './presenter/transitions/presentTransitionEngine';
import { PresentReviewCollaborationModal } from './review/PresentReviewCollaborationModal';
import { ensurePresentReviewState } from './review/presentReviewCollaboration';
import { PresentViewWorkspace } from './editor/extended-views/PresentViewWorkspace';
import { PresentProductivityModal } from './productivity/PresentProductivityModal';
import { PresentExportCenterModal } from './interchange/PresentExportCenterModal';
import { presentOccupiedSlideObjects } from './integrations/presentWorkspaceIntegration';
import { describePresentLiveLinkFailures, refreshPresentLiveLinks, type PresentLiveLinkRefreshFailure } from './integrations/presentLiveLinkRefresh';
import { usePresentWorkspaceDropZone } from './integrations/workspace-drop/usePresentWorkspaceDropZone';
import { usePresentDocumentHistory, type PresentCommitOptions } from './history/usePresentDocumentHistory';
import { mergePresentSceneObjects } from './canvas/model/presentScene';
import { useWorkspaceLocale } from '../../shell/localization/workspaceLocale';
import { useWorkspaceUiScale } from '../../shared/accessibility/workspaceUiScale';
import {
  PRESENT_DECK_SLIDE_LIMIT,
  PRESENT_DEFAULT_SLIDE_LAYOUT_KIND,
  createEmptyPresentDeck,
  createPresentSlide,
  duplicatePresentSlide,
  type PresentSlideLayoutKind,
} from './contracts/presentDeckFactory';
import { applyPresentTemplate, presentTemplateById } from './contracts/presentTemplates';
import { presentExportDeliveryText, presentExportFailureText } from './interchange/presentExportStatus';
import { presentDisplayAvailable, listPresentMonitors, type PresentMonitorInfo } from '../../platform/native/presentWindowBridge';
import { browserShellStorage } from '../../shell/platform/workspaceShellPlatform';
import { PresentationStartDialog } from './presentation/dialog/PresentationStartDialog';
import { PresentLiveBar } from './presentation/editor/PresentLiveBar';
import { usePresentDisplaySession } from './presentation/editor/usePresentDisplaySession';
import { presentPresentationCopy, type PresentSessionStartError } from './presentation/locale/presentPresentationLocale';
import {
  loadPresentDisplayPreferenceState,
  presentMonitorByIndex,
  savePresentDisplayPreference,
  type PresentDisplayPreference,
  type PresentMonitorSelection,
} from './presentation/preferences/presentDisplayPreferences';

interface PresentCanvasProps {
  document: WorkspaceDocument;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  onSelectSelectionType: (type: 'text' | 'cell' | 'shape' | 'chart') => void;
  workspaceDocuments?: Record<string, WorkspaceDocument>;
  onOpenWorkspaceDocument?: (documentId: string) => void;
}

/**
 * Which views render the active slide itself and which are model-only.
 *
 * `notes` and `reading` dereference `slide.title` / `slide.speakerNotes`; the three master views only
 * read `model`. A deck may legitimately have nought slides (an authored empty deck stays empty), and
 * in that state the slide-backed views are replaced by `PresentEmptyDeck` — the master views keep
 * rendering, exactly as `editor/extended-views/PresentViewWorkspace.tsx` states in its `slide` prop.
 */
const PRESENT_SLIDE_BACKED_VIEWS: readonly PresentViewMode[] = ['notes', 'reading'];
const PRESENT_MODEL_ONLY_VIEWS: readonly PresentViewMode[] = ['slide-master', 'notes-master', 'handout-master'];

const PRESENT_MONITOR_READ_TIMEOUT_MS = 1_500;

/**
 * Reads the monitor list for the start dialog. A native call that does not answer within 1.5 s (or
 * throws) must not block the presentation: the dialog then states that no screen was found and keeps
 * the single-screen path available.
 */
async function readPresentMonitorsForDialog(): Promise<PresentMonitorInfo[]> {
  if (!presentDisplayAvailable()) return [];
  try {
    return await Promise.race<PresentMonitorInfo[]>([
      listPresentMonitors(),
      new Promise<PresentMonitorInfo[]>((resolve) => {
        window.setTimeout(() => resolve([]), PRESENT_MONITOR_READ_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return [];
  }
}

/**
 * The surface for a deck that genuinely has no slides. It exists because this canvas no longer
 * substitutes `DEFAULT_PRESENT_SLIDES` for one: "no slides" has to be *stated*, with the two real
 * next actions, instead of being silently filled with demo slides nobody authored.
 */
const PresentEmptyDeck: React.FC<{ onAddSlide: () => void; onStartBlankDeck: () => void }> = ({ onAddSlide, onStartBlankDeck }) => (
  <section
    data-present-empty-deck="true"
    aria-label="Empty presentation deck"
    className="flex-1 min-w-0 flex items-center justify-center bg-[var(--vgt-module-shell-surface)] p-8"
  >
    <div className="max-w-md space-y-4 text-center">
      <h2 className="text-base font-semibold text-slate-100">This deck has no slides</h2>
      <p className="text-xs leading-relaxed text-slate-400">
        The document stores an empty slide list. Nothing was inserted here, because an authored empty deck is a
        state of the document and not a missing field.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onAddSlide}
          className="rounded-lg border border-blue-500/30 bg-blue-600/20 px-3 py-1.5 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-600/30"
        >
          Add a slide
        </button>
        <button
          type="button"
          onClick={onStartBlankDeck}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white"
        >
          Replace with one blank slide
        </button>
      </div>
    </div>
  </section>
);

export const PresentCanvas: React.FC<PresentCanvasProps> = ({
  document,
  onUpdateDocument,
  onSelectSelectionType,
  workspaceDocuments = {},
  onOpenWorkspaceDocument,
}) => {
  // `DEF-RE-004` residual, repaired: this used to be
  //   `document.presentData?.slides && document.presentData.slides.length > 0
  //      ? document.presentData.slides : DEFAULT_PRESENT_SLIDES`
  // which made an **authored empty deck** (`presentData: { slides: [] }`) indistinguishable from a
  // document with no `presentData` at all *by rendering the three-slide built-in demo deck for both*.
  //
  // Why that is a substitution and not a fallback: `ensurePresentDesign` is the single read repair
  // (`design/presentDesign.ts`) and it already answers an absent `slides` field with `[]` — an empty
  // array is the *documented default* for this field, `DEFAULT_PRESENT_SLIDES` is a *bootstrap seed*
  // (`app/bootstrap/seedData.ts`, `app/bootstrap/seedDocDefaultsOpenCore.ts`). And the substitution
  // was not read-only: `updateSlides` writes `{ ...presentData, slides }` back into the document, so
  // `presentData` here already carried the three demo slides — the first click in a document with
  // `slides: []` would have persisted demo content the user never authored.
  const presentData = ensurePresentDesign(document.presentData ?? { slides: [] });
  const slides = presentData.slides;
  // "Skalierbare UI" is a Definition-of-Done item (`M03-Z0692`). The workspace scale is published on
  // the document root; this surface follows it, so the editor scales with the shell instead of beside it.
  const uiScale = useWorkspaceUiScale();

  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [currentView, setCurrentView] = useState<PresentViewMode>('normal');
  const [isPresenterMode, setIsPresenterMode] = useState(false);
  const [presenterStartIdx, setPresenterStartIdx] = useState(0);
  // Runde 42 (multi-monitor presentation): the "Present Slides" action opens a setup dialog first.
  // It states the screens, the two-window vs single-screen choice and every failure explicitly —
  // the previous direct jump into the in-window presenter mode is now one of the two paths.
  const [presentStartDialog, setPresentStartDialog] = useState<{
    monitors: PresentMonitorInfo[];
    displayAvailable: boolean;
    preference: PresentDisplayPreference;
    storedPreference: boolean;
  } | null>(null);
  const [presentStartBusy, setPresentStartBusy] = useState(false);
  const [presentStartError, setPresentStartError] = useState<PresentSessionStartError | null>(null);
  const [presentLiveMonitors, setPresentLiveMonitors] = useState<{
    audience: PresentMonitorInfo | null;
    presenter: PresentMonitorInfo | null;
  }>({ audience: null, presenter: null });
  const [deckMessage, setDeckMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showReviewCollaboration, setShowReviewCollaboration] = useState(false);
  const [showProductivity, setShowProductivity] = useState(false);
  const [showExportCenter, setShowExportCenter] = useState(false);
  const history = usePresentDocumentHistory(document, onUpdateDocument);
  const { locale } = useWorkspaceLocale();

  // Embedded objects (like live linked charts) from document graph
  const embeddedObjects = (document.root_object_ids || [])
    .map((id) => document.objects?.[id])
    .filter(Boolean);

  const displaySession = usePresentDisplaySession({
    // The snapshot is built from the latest render, so a deck edit mid-show is re-sent as an update.
    snapshotProvider: () => {
      const visible = slides.filter((slide) => !slide.hidden);
      const effectiveSlides = visible.length ? visible : slides;
      return { slides: effectiveSlides, presentData, embeddedObjects, index: presenterStartIdx };
    },
    deckSignature: `${document.version}:${slides.map((slide) => slide.id).join('|')}`,
  });
  const {
    state: presentDisplayState,
    start: startPresentDisplaySession,
    stop: stopPresentDisplaySession,
    setBlack: setPresentDisplayBlack,
    clearNotice: clearPresentDisplayNotice,
  } = displaySession;
  const presentCopy = presentPresentationCopy(locale);

  // `slides[i]` is unchecked in this tsconfig, so the type of `currentSlide` stays `PresentSlide`
  // even though a deck with nought slides has none. `hasSlides` below is therefore the *runtime*
  // guard every slide-dependent surface is gated on - not a type-level proof.
  const hasSlides = slides.length > 0;
  const safeActiveIdx = Math.min(Math.max(0, activeSlideIdx), slides.length - 1);
  const currentSlide = slides[safeActiveIdx];

  const updateSlides = (newSlides: PresentSlide[], nextActiveIdx?: number, options: PresentCommitOptions = {}) => {
    history.commit({
      ...document,
      version: document.version + 1,
      modified_at: Date.now(),
      presentData: {
        ...presentData,
        slides: newSlides,
        aspectRatio: presentData.aspectRatio ?? '16:9',
      },
    }, options);
    if (nextActiveIdx !== undefined) {
      setActiveSlideIdx(nextActiveIdx);
    }
  };

  const updatePresentDesign = (next: PresentDocumentModel, options: PresentCommitOptions = {}) => {
    history.commit({
      ...document,
      version: document.version + 1,
      modified_at: Date.now(),
      presentData: ensurePresentDesign(next),
    }, options);
  };

  /**
   * Round 25/26 (data integrity): every slide write passes through here. Readers work on a
   * filtered `sceneObjects` list (null/primitive entries removed); writing that list back
   * verbatim would silently delete the hostile entries. The pure merge helper puts the updated
   * objects back into the raw list (non-objects keep their positions, new ids are appended) —
   * identity writes stay byte-identical.
   */
  const withMergedSceneObjects = (base: PresentSlide | undefined, updated: PresentSlide): PresentSlide => {
    const rawSceneObjects = base?.sceneObjects as unknown;
    const nextSceneObjects = updated.sceneObjects as unknown;
    return Array.isArray(rawSceneObjects) && Array.isArray(nextSceneObjects)
      ? { ...updated, sceneObjects: mergePresentSceneObjects(rawSceneObjects, nextSceneObjects) as PresentSlide['sceneObjects'] }
      : updated;
  };

  const handleUpdateActiveSlide = (updated: PresentSlide, options: PresentCommitOptions = {}) => {
    const merged = withMergedSceneObjects(currentSlide, updated);
    const updatedSlides = slides.map((s, idx) => (idx === safeActiveIdx ? merged : s));
    updateSlides(updatedSlides, undefined, options);
  };

  /**
   * Round 26: the outline view writes a slide **by index** without touching `safeActiveIdx`; that
   * path used to bypass the merge, so a malformed slide edited from the outline would have lost its
   * raw entries. It now merges against that slide's own raw list.
   */
  const handleUpdateSlideAt = (idx: number, updated: PresentSlide) => {
    const merged = withMergedSceneObjects(slides[idx], updated);
    const updatedSlides = slides.map((s, i) => (i === idx ? merged : s));
    updateSlides(updatedSlides);
  };

  const handleAddSlide = (kind: PresentSlideLayoutKind = PRESENT_DEFAULT_SLIDE_LAYOUT_KIND) => {
    if (slides.length >= PRESENT_DECK_SLIDE_LIMIT) {
      setDeckMessage(`This deck already has the maximum ${PRESENT_DECK_SLIDE_LIMIT} slides; the new slide was not added.`);
      return;
    }
    setDeckMessage(null);
    const newSlide = createPresentSlide(kind, { id: `slide-${crypto.randomUUID()}`, sequence: slides.length + 1 });
    const nextSlides = [...slides, newSlide];
    updateSlides(nextSlides, nextSlides.length - 1);
  };

  /**
   * The "no seed coercion" start (AST-0476/AST-0477): one empty title slide, no demo cards, no
   * bullet seed. Design (theme/master) is kept, because starting blank means "no content", not
   * "throw the deck's styling away".
   */
  const handleStartBlankDeck = () => {
    setDeckMessage(null);
    history.commit({
      ...document,
      version: document.version + 1,
      modified_at: Date.now(),
      presentData: ensurePresentDesign({
        ...presentData,
        ...createEmptyPresentDeck({
          slideId: `slide-${crypto.randomUUID()}`,
          aspectRatio: presentData.aspectRatio ?? '16:9',
        }),
      }),
    });
    setActiveSlideIdx(0);
    setCurrentView('normal');
  };

  const handleDuplicateSlide = (idx: number) => {
    const target = slides[idx];
    if (!target) return;
    if (slides.length >= PRESENT_DECK_SLIDE_LIMIT) {
      setDeckMessage(`This deck already has the maximum ${PRESENT_DECK_SLIDE_LIMIT} slides; the slide was not duplicated.`);
      return;
    }
    setDeckMessage(null);
    // The whole duplication rule (fresh ids for objects, images, groups, animations, comments) is
    // the pure `duplicatePresentSlide` factory, so it is covered by tests instead of being inline.
    const duplicated = duplicatePresentSlide(target, `slide-${crypto.randomUUID()}`);
    const nextSlides = [...slides];
    nextSlides.splice(idx + 1, 0, duplicated);
    updateSlides(nextSlides, idx + 1);
  };

  const handleDeleteSlide = (idx: number) => {
    if (slides.length <= 1) {
      // Deleting the last slide leaves one editable but *empty* slide instead of a demo seed.
      const resetSlide = createPresentSlide('blank', { id: `slide-${crypto.randomUUID()}`, sequence: 1 });
      updateSlides([resetSlide], 0);
      return;
    }
    const nextSlides = slides.filter((_, i) => i !== idx);
    const nextIdx = Math.max(0, Math.min(idx, nextSlides.length - 1));
    updateSlides(nextSlides, nextIdx);
  };

  const handleToggleHideSlide = (idx: number) => {
    const target = slides[idx];
    if (!target) return;
    const updated = { ...target, hidden: !target.hidden };
    const nextSlides = slides.map((s, i) => (i === idx ? updated : s));
    updateSlides(nextSlides);
  };

  const handleReorderSlides = (fromIdx: number, toIdx: number) => {
    if (fromIdx < 0 || fromIdx >= slides.length || toIdx < 0 || toIdx >= slides.length) return;
    const activeSlide = slides[safeActiveIdx];
    const nextSlides = [...slides];
    const [moved] = nextSlides.splice(fromIdx, 1);
    nextSlides.splice(toIdx, 0, moved);

    const newActiveIdx = nextSlides.findIndex((s) => s.id === activeSlide.id);
    updateSlides(nextSlides, newActiveIdx !== -1 ? newActiveIdx : safeActiveIdx);
  };

  /** Keyboard equivalent of dragging a thumbnail (Ctrl/Cmd+ArrowUp/Down). */
  const handleMoveActiveSlide = (delta: -1 | 1) => {
    const target = safeActiveIdx + delta;
    if (target < 0 || target >= slides.length) {
      setDeckMessage(delta < 0 ? 'The slide is already first.' : 'The slide is already last.');
      return;
    }
    setDeckMessage(null);
    handleReorderSlides(safeActiveIdx, target);
  };

  /**
   * Runde 42: the "Present Slides" action now opens the display setup dialog. It lists the monitors,
   * preselects projector + presenter screen, and offers the single-screen path. The monitor list is
   * read before the dialog opens, so the dialog never shows a half-filled state.
   */
  const openPresentStartDialog = async (fromCurrent: boolean) => {
    if (presentStartDialog || presentStartBusy) return;
    if (presentDisplayState.phase === 'live' || presentDisplayState.phase === 'starting') {
      setDeckMessage(presentCopy.editor.errors['already-running']);
      return;
    }
    const visible = slides.filter((slide) => !slide.hidden);
    const effectiveSlides = visible.length ? visible : slides;
    const startIndex = fromCurrent && currentSlide
      ? Math.max(0, effectiveSlides.findIndex((slide) => slide.id === currentSlide.id))
      : 0;
    setPresenterStartIdx(startIndex);
    setDeckMessage(null);
    setPresentStartError(null);
    const available = presentDisplayAvailable();
    const monitors = available ? await readPresentMonitorsForDialog() : [];
    const preferenceState = loadPresentDisplayPreferenceState(browserShellStorage());
    setPresentStartDialog({
      monitors,
      displayAvailable: available,
      preference: preferenceState.preference,
      storedPreference: preferenceState.stored,
    });
  };

  const handleStartPresentation = (fromCurrent: boolean) => {
    void openPresentStartDialog(fromCurrent);
  };

  const handleCancelPresentStart = () => {
    if (presentStartBusy) return;
    setPresentStartDialog(null);
    setPresentStartError(null);
  };

  const handleStartSingleScreenPresentation = () => {
    const preferenceState = loadPresentDisplayPreferenceState(browserShellStorage());
    savePresentDisplayPreference(browserShellStorage(), {
      mode: 'single',
      audienceMonitorIndex: preferenceState.preference.audienceMonitorIndex,
      presenterMonitorIndex: preferenceState.preference.presenterMonitorIndex,
    });
    setPresentStartError(null);
    setPresentStartDialog(null);
    setIsPresenterMode(true);
  };

  const handleStartMultiScreenPresentation = async (selection: PresentMonitorSelection) => {
    if (!presentStartDialog) return;
    setPresentStartBusy(true);
    setPresentStartError(null);
    const result = await startPresentDisplaySession(selection);
    setPresentStartBusy(false);
    if (!result.ok) {
      setPresentStartError(result.error ?? 'open-failed');
      return;
    }
    savePresentDisplayPreference(browserShellStorage(), {
      mode: 'multi',
      audienceMonitorIndex: selection.audienceMonitorIndex,
      presenterMonitorIndex: selection.presenterMonitorIndex,
    });
    setPresentLiveMonitors({
      audience: presentMonitorByIndex(presentStartDialog.monitors, selection.audienceMonitorIndex),
      presenter: presentMonitorByIndex(presentStartDialog.monitors, selection.presenterMonitorIndex),
    });
    setPresentStartDialog(null);
  };

  const handleStopMultiScreenPresentation = () => {
    void stopPresentDisplaySession();
  };

  // The session controller reports what happened as a machine code; the editor states it in words.
  useEffect(() => {
    const notice = presentDisplayState.notice;
    if (!notice) return;
    setDeckMessage(presentCopy.editor.notices[notice]);
    clearPresentDisplayNotice();
  }, [presentDisplayState.notice, clearPresentDisplayNotice, presentCopy]);

  /**
   * Paket 27: "Vorlage laden, Platzhalter ersetzen und **Master beibehalten**". The template's own
   * master and theme are applied through the pure template rule, and unfilled placeholders are
   * reported instead of being blanked out.
   */
  const handleApplyTemplate = (templateId: string, values: Record<string, string>) => {
    const template = presentTemplateById(templateId);
    if (!template) {
      setDeckMessage('That template does not exist.');
      return;
    }
    const result = applyPresentTemplate(presentData, template, values, { idPrefix: `${template.id}-${Date.now()}` });
    history.commit({
      ...document,
      version: document.version + 1,
      modified_at: Date.now(),
      presentData: ensurePresentDesign(result.model),
    });
    setActiveSlideIdx(0);
    setCurrentView('normal');
    setDeckMessage(
      result.unresolvedPlaceholders.length
        ? `Template "${template.name}" applied. Unfilled placeholders remain visible: ${result.unresolvedPlaceholders.map((name) => `{{${name}}}`).join(', ')}.`
        : `Template "${template.name}" applied with all placeholders filled; its master and theme were kept.`,
    );
  };

  /** Release Beta 0.1: report the delivery result instead of a bare promise. */
  const handleExportPdf = () => {
    setExportError(null);
    void downloadPresentPdf(document.title, presentData, undefined, locale)
      .then((delivery) => setDeckMessage(presentExportDeliveryText(locale, delivery)))
      .catch((error: unknown) => setExportError(presentExportFailureText(locale, error)));
  };

  const handleExportPng = () => {
    setExportError(null);
    void downloadPresentSlidePng(document.title, currentSlide, presentData, locale)
      .then((delivery) => setDeckMessage(presentExportDeliveryText(locale, delivery)))
      .catch((error: unknown) => setExportError(presentExportFailureText(locale, error)));
  };

  // Filter out hidden slides for presentation mode
  const presentableSlides = slides.filter((s) => !s.hidden);
  const sourceDocuments = useMemo(() => Object.values(workspaceDocuments).filter((candidate) => candidate.id !== document.id), [workspaceDocuments, document.id]);
  const sourceVersionSignature = sourceDocuments.map((candidate) => `${candidate.id}:${candidate.version}`).sort().join('|');

  /**
   * Paket 15 on the reopen path. The refresh rule itself stays in
   * `integrations/presentLiveLinkRefresh.ts`: it calls the existing `refreshPresentWorkspaceObject`
   * per object and turns an unavailable/unusable source into a **named failure** instead of an
   * exception. Before this, the snapshot port threw (`WorkspaceSnapshotProviderUnavailableError`,
   * `…BudgetExceededError`, `…ShapeRejectedError`) straight out of this effect, so opening a deck
   * with one live link next to an unreadable source took the whole editor down instead of showing
   * the offline state the acceptance scenario asks for.
   */
  const [linkFailures, setLinkFailures] = useState<PresentLiveLinkRefreshFailure[]>([]);
  useEffect(() => {
    const refreshed = refreshPresentLiveLinks(slides, sourceDocuments);
    setLinkFailures(refreshed.failures);
    if (refreshed.changed) updateSlides(refreshed.slides, undefined, { coalesceKey: `workspace-live-refresh:${sourceVersionSignature}` });
  }, [sourceVersionSignature]); // source-document versions are the refresh trigger
  const linkFailureMessage = describePresentLiveLinkFailures(linkFailures);

  // **Paket 10:** die Present-Ablagefläche. Das **Ziel**-Dokument ist hier immer dabei (`document`); die
  // **Quellen** kommen aus `workspaceDocuments` — bis die Shell sie liefert, ist die Liste leer und die
  // Ablage verweigert **benannt**, statt still zu scheitern.
  const dropZoneDocuments = useMemo(
    () => ({ ...workspaceDocuments, [document.id]: document }),
    [workspaceDocuments, document],
  );
  const dropZoneOccupied = useMemo(
    () => (hasSlides ? presentOccupiedSlideObjects(currentSlide) : []),
    [hasSlides, currentSlide],
  );
  const workspaceDropZone = usePresentWorkspaceDropZone({
    targetDocumentId: document.id,
    documents: dropZoneDocuments,
    existingObjects: dropZoneOccupied,
  });

  return (
    <div className="relative flex-1 flex h-full bg-[#0a0d14] overflow-hidden" style={uiScale.style} data-astraea-scale-percent={uiScale.scaleAttribute} data-vgt-present-root="true" data-vgt-app-theme-root="present" role="region" aria-label="Astraea Present editor">
      {/* 1. Left Sidebar */}
      <PresentSidebar
        slides={slides}
        activeSlideIdx={safeActiveIdx}
        currentView={currentView}
        onChangeView={setCurrentView}
        onSelectSlide={(idx) => setActiveSlideIdx(idx)}
        onAddSlide={handleAddSlide}
        onStartBlankDeck={handleStartBlankDeck}
        onApplyTemplate={handleApplyTemplate}
        slideLimitReached={slides.length >= PRESENT_DECK_SLIDE_LIMIT}
        onDuplicateSlide={handleDuplicateSlide}
        onDeleteSlide={handleDeleteSlide}
        onReorderSlides={handleReorderSlides}
        onToggleHideSlide={handleToggleHideSlide}
        onStartPresenterMode={() => handleStartPresentation(false)}
        onExportPdf={handleExportPdf}
        onExportPng={handleExportPng}
        onOpenReview={() => setShowReviewCollaboration(true)}
        onOpenProductivity={() => setShowProductivity(true)}
        onOpenExportCenter={() => setShowExportCenter(true)}
        reviewStatus={ensurePresentReviewState(presentData).review.status}
      />

      {deckMessage && (
        <div role="status" aria-live="polite" className="absolute bottom-4 left-64 z-50 rounded-lg border border-amber-500/30 bg-amber-950/90 px-3 py-2 text-xs text-amber-200 shadow-xl">
          {deckMessage}
        </div>
      )}

      {exportError && (
        <div className="absolute bottom-4 left-64 z-50 rounded-lg border border-red-500/30 bg-red-950/90 px-3 py-2 text-xs text-red-200 shadow-xl">
          Present export failed: {exportError}
        </div>
      )}

      {/* Paket 15: a live link whose source could not be read is stated in words. The slide keeps its
          stored snapshot and stays marked "not current" — the editor never shows stale numbers as if
          they were the source's, and it never fails to mount because a source is unavailable. */}
      {linkFailureMessage && (
        <div
          role="status"
          aria-live="polite"
          data-present-link-failure={linkFailures.length}
          className="absolute bottom-4 left-64 z-50 max-w-xl rounded-lg border border-amber-500/30 bg-amber-950/90 px-3 py-2 text-xs text-amber-200 shadow-xl"
        >
          {linkFailureMessage}
        </div>
      )}

      {/* 2. Main Viewport: Normal Editor vs Sorter vs Outline.
          A deck with nought slides renders `PresentEmptyDeck` for every view that dereferences the
          active slide - `SlideContentEditor`, the notes page and the reading view all read
          `slide.sceneObjects` / `slide.title` and there is no slide. The sorter and the outline
          iterate the (empty) list and keep working, and the three master views are model-only. */}
      {currentView === 'normal' && hasSlides && (
        <SlideContentEditor
          slide={currentSlide}
          onUpdateSlide={handleUpdateActiveSlide}
          embeddedObjects={embeddedObjects}
          onSelectSelectionType={onSelectSelectionType}
          presentData={presentData}
          onUpdatePresentData={updatePresentDesign}
          onApplyTransitionToAll={() => {
            if (!hasSlides) return;
            const transition = normalizePresentTransition(currentSlide.transition);
            updateSlides(applyTransitionToSlides(slides, transition));
          }}
          workspaceDocuments={sourceDocuments}
          workspaceDropZone={workspaceDropZone}
          onOpenWorkspaceDocument={onOpenWorkspaceDocument}
          onUndo={history.undo}
          onRedo={history.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          slideIndex={safeActiveIdx}
          slideCount={slides.length}
          onNavigateToSlide={(index) => setActiveSlideIdx(index)}
          onMoveSlide={handleMoveActiveSlide}
          onStartPresentation={handleStartPresentation}
          keyboardEnabled={!isPresenterMode}
          deckSlides={slides.map((entry) => ({ id: entry.id, title: entry.title }))}
        />
      )}

      {currentView === 'normal' && !hasSlides && (
        <PresentEmptyDeck onAddSlide={() => handleAddSlide()} onStartBlankDeck={handleStartBlankDeck} />
      )}

      {currentView === 'sorter' && (
        <PresentSlideSorterView
          slides={slides}
          presentData={presentData}
          activeSlideIdx={safeActiveIdx}
          onSelectSlide={(idx) => setActiveSlideIdx(idx)}
          onAddSlide={handleAddSlide}
          onDuplicateSlide={handleDuplicateSlide}
          onDeleteSlide={handleDeleteSlide}
          onReorderSlides={handleReorderSlides}
          onToggleHideSlide={handleToggleHideSlide}
          onUpdatePresentData={updatePresentDesign}
          onCloseSorter={() => setCurrentView('normal')}
        />
      )}

      {currentView === 'outline' && (
        <PresentOutlineView
          slides={slides}
          activeSlideIdx={safeActiveIdx}
          onSelectSlide={(idx) => setActiveSlideIdx(idx)}
          onUpdateSlide={handleUpdateSlideAt}
          onAddSlide={handleAddSlide}
          onDeleteSlide={handleDeleteSlide}
          onReorderSlides={handleReorderSlides}
          onCloseOutline={() => setCurrentView('normal')}
        />
      )}

      {PRESENT_SLIDE_BACKED_VIEWS.includes(currentView) && hasSlides && (
        <PresentViewWorkspace
          view={currentView as 'notes' | 'reading'}
          slide={currentSlide}
          slideIndex={safeActiveIdx}
          model={presentData}
          embeddedObjects={embeddedObjects}
          onUpdateSlide={handleUpdateActiveSlide}
          onUpdateModel={updatePresentDesign}
        />
      )}

      {PRESENT_SLIDE_BACKED_VIEWS.includes(currentView) && !hasSlides && (
        <PresentEmptyDeck onAddSlide={() => handleAddSlide()} onStartBlankDeck={handleStartBlankDeck} />
      )}

      {PRESENT_MODEL_ONLY_VIEWS.includes(currentView) && (
        <PresentViewWorkspace
          view={currentView as 'slide-master' | 'notes-master' | 'handout-master'}
          slide={currentSlide}
          slideIndex={safeActiveIdx}
          model={presentData}
          embeddedObjects={embeddedObjects}
          onUpdateSlide={handleUpdateActiveSlide}
          onUpdateModel={updatePresentDesign}
        />
      )}

      <PresentExportCenterModal
        isOpen={showExportCenter}
        document={document}
        model={presentData}
        currentSlide={currentSlide}
        onClose={() => setShowExportCenter(false)}
      />

      <PresentProductivityModal
        isOpen={showProductivity}
        model={presentData}
        onClose={() => setShowProductivity(false)}
        onUpdateModel={updatePresentDesign}
        onSelectSlide={(index) => { setActiveSlideIdx(index); setCurrentView('normal'); }}
      />

      <PresentReviewCollaborationModal
        isOpen={showReviewCollaboration}
        document={document}
        model={presentData}
        onClose={() => setShowReviewCollaboration(false)}
        onUpdateModel={updatePresentDesign}
      />

      {/* 3. Fullscreen Presenter Mode */}
      {isPresenterMode && (
        <PresenterModeModal
          slides={presentableSlides.length ? presentableSlides : slides}
          initialSlideIdx={presenterStartIdx}
          onClose={() => setIsPresenterMode(false)}
          onCommitPresenterInk={(inkBySlideId) => {
            updateSlides(slides.map((slide) => inkBySlideId[slide.id] ? { ...slide, presenterInk: inkBySlideId[slide.id] } : slide));
          }}
          embeddedObjects={embeddedObjects}
          presentData={presentData}
          onOpenDocument={onOpenWorkspaceDocument}
        />
      )}

      {/* Runde 42: two-window presentation — live status band and the setup dialog that starts it. */}
      {presentDisplayState.phase === 'live' && (
        <PresentLiveBar
          state={presentDisplayState}
          audienceMonitor={presentLiveMonitors.audience}
          presenterMonitor={presentLiveMonitors.presenter}
          locale={locale}
          onToggleBlack={() => setPresentDisplayBlack(!presentDisplayState.blackScreen)}
          onStop={handleStopMultiScreenPresentation}
        />
      )}

      {presentStartDialog && (
        <PresentationStartDialog
          monitors={presentStartDialog.monitors}
          displayAvailable={presentStartDialog.displayAvailable}
          preference={presentStartDialog.preference}
          storedPreference={presentStartDialog.storedPreference}
          locale={locale}
          busy={presentStartBusy}
          error={presentStartError}
          startIndex={presenterStartIdx}
          onCancel={handleCancelPresentStart}
          onStartSingleScreen={handleStartSingleScreenPresentation}
          onStartMultiScreen={(selection) => { void handleStartMultiScreenPresentation(selection); }}
        />
      )}
    </div>
  );
};
