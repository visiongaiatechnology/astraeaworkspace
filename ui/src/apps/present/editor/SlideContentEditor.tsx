import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cancelForegroundAnimationFrame, requestForegroundAnimationFrame } from '../../../platform/performance/performancePlatform';
import {
  PresentSlide,
  WorkspaceObject,
  PresentDocumentModel,
  PresentShapeSceneObject,
  PresentWidgetSceneObject,
  PresentDiagramSceneObject,
  PresentSceneObject,
  PresentImageObject,
  WorkspaceDocument,
  PresentWorkspaceSceneObject,
  PresentAnimation,
} from '../../../shared/contracts/workspace';
import { ensurePresentDesign, resolvePresentSlideDesign, applyPresentTheme } from '../design/presentDesign';
import {
  createPresentChartObject,
  createPresentCodeObject,
  createPresentDiagramObject,
  createPresentShapeObject,
  createPresentTableObject,
  createPresentTextObject,
  createPresentWidgetObject,
  isPlainPresentRecord,
  presentShapeClickDrawing,
  type PresentShapeDrawing,
} from '../canvas/model/presentScene';
import type { PresentObjectStyle } from '../contracts/presentStyle';
import { expandPresentSelectionToGroups } from '../canvas/model/presentGrouping';
import { isPresentObjectSelectable, normalizePresentSelection, presentSelectionOrder } from '../canvas/model/presentSelection';
import { PresentTopToolbar } from './toolbar/PresentTopToolbar';
import { PresentStageCanvas } from '../canvas/PresentStageCanvas';
import { PresentObjectInspector } from './inspector/PresentObjectInspector';
import { PresentLayersPane } from './layers/PresentLayersPane';
import { PresentAnimationPane } from './animation/PresentAnimationPane';
import { evaluatePreviewAnimationsAtTime, normalizePresentAnimation, previewAnimationDuration, type PresentAnimationPreviewState } from '../animations/presentAnimationEngine';
import { PresentSpeakerNotesDrawer } from './speaker-notes/PresentSpeakerNotesDrawer';
import { PresentModals } from './overlays/PresentModals';
import { PresentWorkspaceIntegrationModal } from '../integrations/PresentWorkspaceIntegrationModal';
import { presentOccupiedSlideObjects } from '../integrations/presentWorkspaceIntegration';
import type { PresentWorkspaceDropZoneWiring } from '../integrations/workspace-drop/usePresentWorkspaceDropZone';
import { presentImageInsertionFromFile } from '../media/presentMediaSecurity';
import { presentImageBoxForIntrinsicSize } from '../canvas/model/presentImageGeometry';
import { withPresentImageIntrinsicSize } from '../canvas/model/presentObjectExtensions';
import { presentAspectRatioValue } from '../canvas/model/presentRect';
import { runPresentCanvasCommand } from './presentCanvasCommands';
import { resolvePresentEditorCommand, type PresentEditorCommand } from './presentEditorCommands';
import { PRESENT_DECK_SLIDE_LIMIT } from '../contracts/presentDeckFactory';
import { applyPresentTextFormat } from '../canvas/model/presentTextFormat';
import { summarizePresentSlideLinks, type PresentLinkStatus } from '../integrations/presentLinkStatus';
import { withPresentObjectLink } from '../canvas/model/presentHyperlinks';

interface PresentMutationOptions { coalesceKey?: string; }

/**
 * Round 16 (malformed document): `sceneObjects` is hostile input. Every reader in the editor goes
 * through this normaliser, so a non-array payload can never reach `.map`/`.filter`/`.find`/spread.
 */
function readPresentSceneObjects(slide: PresentSlide | undefined | null): PresentSceneObject[] {
  return slide && Array.isArray(slide.sceneObjects) ? slide.sceneObjects : [];
}

interface SlideContentEditorProps {
  slide: PresentSlide;
  onUpdateSlide: (updated: PresentSlide, options?: PresentMutationOptions) => void;
  embeddedObjects: WorkspaceObject[];
  onSelectSelectionType: (type: 'text' | 'cell' | 'shape' | 'chart') => void;
  presentData: PresentDocumentModel;
  onUpdatePresentData: (next: PresentDocumentModel) => void;
  onApplyTransitionToAll: () => void;
  onPresenceObjectChange?: (objectId: string | null) => void;
  workspaceDocuments?: readonly WorkspaceDocument[];
  /** **Paket 10:** die von `PresentCanvas` verdrahtete Ablagefläche (dort liegen Dokument und Quellen). */
  workspaceDropZone?: PresentWorkspaceDropZoneWiring | null;
  onOpenWorkspaceDocument?: (documentId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** 0-based index of the active slide and the deck size, used by the slide-level keyboard commands. */
  slideIndex?: number;
  slideCount?: number;
  onNavigateToSlide?: (index: number) => void;
  onMoveSlide?: (delta: -1 | 1) => void;
  onStartPresentation?: (fromCurrent: boolean) => void;
  /** The shell/presenter owns the keyboard while a full-screen presentation is running. */
  keyboardEnabled?: boolean;
  /** All slides of the deck, in deck order: the hyperlink picker and reading order need them. */
  deckSlides?: ReadonlyArray<{ id: string; title: string }>;
}

export const SlideContentEditor: React.FC<SlideContentEditorProps> = ({
  slide,
  onUpdateSlide,
  embeddedObjects,
  onSelectSelectionType,
  presentData,
  onUpdatePresentData,
  onApplyTransitionToAll,
  onPresenceObjectChange,
  workspaceDocuments = [],
  workspaceDropZone = null,
  onOpenWorkspaceDocument,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  slideIndex = 0,
  slideCount = 1,
  onNavigateToSlide,
  onMoveSlide,
  onStartPresentation,
  keyboardEnabled = true,
  deckSlides,
}) => {
  const normalizedPresentData = ensurePresentDesign(presentData);
  const design = resolvePresentSlideDesign(slide, normalizedPresentData);

  const [selectedSceneObjectIds, setSelectedSceneObjectIds] = useState<string[]>([]);
  // Image selection is intentionally separate from the scene-object selection: images are a
  // different contract (`slide.images`) with their own freeform gesture path.
  const [selectedImageId, setSelectedImageSelection] = useState<string | null>(null);
  /** Armed insert tool: the next canvas click creates this object at the click point. */
  const [armedTool, setArmedTool] = useState<'text' | null>(null);
  /**
   * PR-007 (M1) — the one owner of "a shape is being draw-armed".
   *
   * Choosing a shape from the toolbar arms this tool instead of dropping a fixed-position object:
   * the next drag on the canvas draws the shape live and commits exactly one object on pointer-up;
   * a click without a drag places the documented default size at the click point.
   */
  const [armedShapeTool, setArmedShapeTool] = useState<PresentShapeSceneObject['shape'] | null>(null);
  /**
   * PR-005 (M1) — abort signal for an in-flight scene gesture.
   *
   * The editor stays the *single* keyboard owner: Escape is resolved here, and the stage only reads
   * the resulting token. On a change the stage rolls its gesture back to the start snapshot with the
   * same coalesce key and removes all listeners — no second window `keydown` handler in the canvas.
   */
  const [gestureCancelToken, setGestureCancelToken] = useState(0);
  /**
   * PR-005 (M1) — the one owner of "a text box is being edited".
   *
   * The stage and the object view derive their rendering from this id; the editable `<textarea>`
   * only exists while it matches. Nothing else may hold a second copy of that state.
   */
  const [textEditingObjectId, setTextEditingObjectId] = useState<string | null>(null);
  /** Object that must receive the caret after it was created (Paket 4: "Fokus bleibt stabil"). */
  const [focusRequestId, setFocusRequestId] = useState<string | null>(null);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [showAnimations, setShowAnimations] = useState(false);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [showRehearsalModal, setShowRehearsalModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [showVideoExportModal, setShowVideoExportModal] = useState(false);
  const [showSpeakerCoachModal, setShowSpeakerCoachModal] = useState(false);
  const [showWorkspaceIntegration, setShowWorkspaceIntegration] = useState(false);
  const [animationPreview, setAnimationPreview] = useState<PresentAnimationPreviewState | null>(null);
  const [transitionPreviewProgress, setTransitionPreviewProgress] = useState<number | null>(null);
  const transitionPreviewFrameRef = useRef<number | null>(null);
  /**
   * Round 42 (style freeze): document-free preview of the style panel draft. The panel commits once
   * per change (debounced); until then only this lightweight override reaches the stage.
   */
  const [objectStylePreview, setObjectStylePreview] = useState<{ id: string; style: PresentObjectStyle } | null>(null);
  const animationPreviewRafRef = useRef<number | null>(null);

  /** Round 42: per-object animation preview through the SAME engine the animation pane uses. */
  const previewObjectAnimation = useCallback((animation: PresentAnimation | null) => {
    if (animationPreviewRafRef.current !== null) {
      cancelForegroundAnimationFrame(animationPreviewRafRef.current);
      animationPreviewRafRef.current = null;
    }
    if (!animation) {
      setAnimationPreview(null);
      return;
    }
    const normalized = normalizePresentAnimation(animation);
    const total = Math.max(1, previewAnimationDuration([normalized]));
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(total, now - startedAt);
      setAnimationPreview(evaluatePreviewAnimationsAtTime([normalized], elapsed));
      if (elapsed < total) {
        animationPreviewRafRef.current = requestForegroundAnimationFrame(tick);
      } else {
        animationPreviewRafRef.current = null;
        window.setTimeout(() => setAnimationPreview(null), 250);
      }
    };
    animationPreviewRafRef.current = requestForegroundAnimationFrame(tick);
  }, []);

  useEffect(() => () => {
    if (animationPreviewRafRef.current !== null) {
      cancelForegroundAnimationFrame(animationPreviewRafRef.current);
      animationPreviewRafRef.current = null;
    }
  }, []);

  // Round 16 (malformed document): `sceneObjects` may be a non-array hostile value; every mount-path
  // use (link summary projection, stage render) must work on a real list.
  const sceneObjects = readPresentSceneObjects(slide);

  /** Deck-order slide list and index map for the hyperlink picker and its summary (Paket 28). */
  const slideOptions = useMemo(
    () => (deckSlides ?? []).map((entry) => ({ id: entry.id, title: entry.title })),
    [deckSlides],
  );
  const slideIndexById = useMemo(
    () => new Map((deckSlides ?? []).map((entry, index) => [entry.id, index])),
    [deckSlides],
  );

  /**
   * Paket 15: the slide reports the state of its live links. The versions come from the workspace
   * documents the objects point at, and the resolver decides current/updated/stale/offline/frozen.
   */
  const linkStatusByObjectId = useMemo(() => {
    const versions = new Map<string, number>();
    for (const candidate of workspaceDocuments) versions.set(candidate.id, candidate.version);
    const summary = summarizePresentSlideLinks(
      sceneObjects.filter(isPlainPresentRecord).filter((object): object is PresentWorkspaceSceneObject => object.kind === 'workspace'),
      versions,
    );
    const byId: Record<string, PresentLinkStatus> = {};
    for (const status of summary.statuses) byId[status.id] = status;
    return byId;
  }, [sceneObjects, workspaceDocuments]);

  // The window-level keyboard listener reads the newest slide/selection without being re-bound on
  // every keystroke; re-binding listeners per render is how keyboard handling loses events.
  const latest = useRef({ slide, sceneObjects, selectedSceneObjectIds, slideIndex, slideCount });
  latest.current = { slide, sceneObjects, selectedSceneObjectIds, slideIndex, slideCount };

  /**
   * Round 18 (state coherence): selection, the single edit mode and the caret request belong to a
   * slide, not to the editor instance. Without this reset, switching slides kept the previous
   * slide's object ids selected — the status line announced a selection that was not on the slide,
   * and returning to the slide re-opened an editor nobody had asked for. The document is untouched:
   * only UI state is cleared.
   */
  const slideIdRef = useRef(slide.id);
  useEffect(() => {
    if (slideIdRef.current === slide.id) return;
    slideIdRef.current = slide.id;
    setSelectedSceneObjectIds([]);
    setSelectedImageSelection(null);
    setTextEditingObjectId(null);
    setFocusRequestId(null);
    latest.current = { ...latest.current, selectedSceneObjectIds: [] };
    onPresenceObjectChange?.(null);
  }, [onPresenceObjectChange, slide.id]);

  const modalOpen =
    showThemeModal || showSectionsModal || showRehearsalModal || showCommentsModal ||
    showMediaModal || showVideoExportModal || showSpeakerCoachModal || showWorkspaceIntegration;

  const previewTransition = () => {
    if (transitionPreviewFrameRef.current !== null) cancelForegroundAnimationFrame(transitionPreviewFrameRef.current);
    const duration = Math.max(50, Math.min(20_000, slide.transition?.durationMs || 500));
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      setTransitionPreviewProgress(progress);
      if (progress < 1) transitionPreviewFrameRef.current = requestForegroundAnimationFrame(tick);
      else {
        transitionPreviewFrameRef.current = null;
        window.setTimeout(() => setTransitionPreviewProgress(null), 120);
      }
    };
    setTransitionPreviewProgress(0);
    transitionPreviewFrameRef.current = requestForegroundAnimationFrame(tick);
  };

  // ---------------------------------------------------------------------------------------------
  // One place for a selection change, so group expansion and the size cap can never be skipped.
  // ---------------------------------------------------------------------------------------------
  const applySelection = useCallback((ids: readonly string[]) => {
    const current = latest.current;
    // Round 24: null/primitive entries are filtered for the selection math only — the document is
    // never rewritten here, so the hostile entries stay untouched.
    const objects = readPresentSceneObjects(current.slide).filter(isPlainPresentRecord);
    const expanded = expandPresentSelectionToGroups(objects, ids);
    const normalized = normalizePresentSelection(objects, expanded);
    latest.current = { ...current, selectedSceneObjectIds: normalized };
    setSelectedSceneObjectIds(normalized);
    onPresenceObjectChange?.(normalized.length ? normalized[normalized.length - 1] : null);
  }, [onPresenceObjectChange]);

  /**
   * Executes one resolved editor command. Canvas commands go through the pure executor; the
   * slide/presentation/undo commands are the editor's own. Returns `true` when it consumed the key.
   */
  const runCommand = useCallback((command: PresentEditorCommand): boolean => {
    const current = latest.current;
    // `runPresentCanvasCommand` applies the command *and* advances the snapshot, so a second command
    // in the same tick builds on this result instead of on the state read before the first (W-401).
    const canvasRun = runPresentCanvasCommand(
      { objects: readPresentSceneObjects(current.slide).filter(isPlainPresentRecord), selection: current.selectedSceneObjectIds },
      command,
    );
    if (canvasRun) {
      if (canvasRun.message) setCommandStatus(canvasRun.message);
      if (canvasRun.changed) {
        const coalesceKey = command.type === 'nudge' || command.type === 'resize' || command.type === 'rotate'
          ? `keyboard-${command.type}`
          : undefined;
        onUpdateSlide({ ...current.slide, sceneObjects: canvasRun.snapshot.objects }, coalesceKey ? { coalesceKey } : undefined);
      }
      const before = current.selectedSceneObjectIds.join('\u0000');
      const after = canvasRun.snapshot.selection.join('\u0000');
      latest.current = {
        ...current,
        slide: canvasRun.changed ? { ...current.slide, sceneObjects: canvasRun.snapshot.objects } : current.slide,
        selectedSceneObjectIds: canvasRun.snapshot.selection,
      };
      if (before !== after) {
        setSelectedSceneObjectIds(canvasRun.snapshot.selection);
        onPresenceObjectChange?.(canvasRun.snapshot.selection.at(-1) ?? null);
      }
      return true;
    }

    switch (command.type) {
      case 'next-slide':
        onNavigateToSlide?.(Math.min(current.slideCount - 1, current.slideIndex + 1));
        return true;
      case 'previous-slide':
        onNavigateToSlide?.(Math.max(0, current.slideIndex - 1));
        return true;
      case 'first-slide':
        onNavigateToSlide?.(0);
        return true;
      case 'last-slide':
        onNavigateToSlide?.(current.slideCount - 1);
        return true;
      case 'move-slide':
        onMoveSlide?.(command.delta);
        return true;
      case 'start-presentation':
        onStartPresentation?.(command.fromCurrent);
        return true;
      case 'undo':
        onUndo?.();
        return true;
      case 'redo':
        onRedo?.();
        return true;
      case 'edit-selected-text': {
        // PR-010 (M1 keyboard-only): F2 is the keyboard parity of double-clicking / Enter on a text
        // object. It uses the same single edit-mode state and the same selection owner as the pointer
        // path — no second editing concept.
        const primaryId = current.selectedSceneObjectIds[current.selectedSceneObjectIds.length - 1];
        const primary = readPresentSceneObjects(current.slide).find((object) => isPlainPresentRecord(object) && object.id === primaryId);
        if (!primary || primary.kind !== 'text') {
          setCommandStatus('F2: select a text object first.');
          return true;
        }
        applySelection([primary.id]);
        setShowInspector(true);
        setTextEditingObjectId(primary.id);
        return true;
      }
      case 'clear-selection':
      case 'dismiss': {
        const hadPanels = showLayers || showAnimations || showSpeakerNotes || showInspector;
        if (modalOpen) {
          setShowThemeModal(false); setShowSectionsModal(false); setShowRehearsalModal(false);
          setShowCommentsModal(false); setShowMediaModal(false); setShowVideoExportModal(false);
          setShowSpeakerCoachModal(false); setShowWorkspaceIntegration(false);
          return true;
        }
        // Escape also disarms an armed insert tool, so the user is never stuck in "click to place".
        if (textEditingObjectId) {
          // PR-005: leaving the text edit mode comes before any panel dismissal — Escape means
          // "stop typing", not "close the inspector".
          setTextEditingObjectId(null);
          return true;
        }
        if (armedTool) {
          setArmedTool(null);
          setCommandStatus('Text tool cancelled.');
          return true;
        }
        // PR-007: Escape disarms the shape tool too. The stage drops its live draft when the tool
        // disappears, so the gesture is abandoned instead of committing a half-drawn object.
        if (armedShapeTool) {
          setArmedShapeTool(null);
          setCommandStatus('Shape tool cancelled.');
          return true;
        }
        if (hadPanels) {
          setShowLayers(false); setShowAnimations(false); setShowSpeakerNotes(false); setShowInspector(false);
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }, [applySelection, armedShapeTool, armedTool, modalOpen, onMoveSlide, onNavigateToSlide, onPresenceObjectChange, onRedo, onStartPresentation, onUndo, onUpdateSlide, showAnimations, showInspector, showLayers, showSpeakerNotes, textEditingObjectId]);

  useEffect(() => {
    if (!keyboardEnabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editableTarget = Boolean(
        target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)),
      );
      const command = resolvePresentEditorCommand(
        { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey },
        { editableTarget, hasSelection: latest.current.selectedSceneObjectIds.length > 0 },
      );
      if (!command) return;
      /**
       * PR-010 (M1 keyboard-only): Tab is a Present command only on the drawing surface (the stage
       * or a scene object inside it). Everywhere else — toolbar, menus, page chrome — Tab must keep
       * its browser meaning, otherwise a keyboard-only user can never leave the canvas to reach the
       * insert tools. Inside the stage the existing Tab = next/previous selection stays unchanged.
       */
      if (command.type === 'select-next' || command.type === 'select-previous') {
        const targetElement = event.target instanceof Element ? event.target : null;
        const insideStage = Boolean(targetElement?.closest('[data-present-stage="true"]'));
        if (!insideStage) return;
        /**
         * PR-010 (M1 keyboard trap repair, WCAG 2.1.2): inside the stage Tab/Shift+Tab keep cycling
         * the selection — but at the ends of the render order the key must leave the stage again.
         * Before this, a focused stage swallowed Tab forever ("Tab cycle"), so a keyboard-only user
         * could never reach anything after the canvas. Conditions:
         *   - no selection            → browser traversal out of the canvas, both directions;
         *   - Shift+Tab on first item → traverse backwards out of the stage;
         *   - Tab on last item        → traverse forwards out of the stage;
         *   - everything else         → the existing selection cycle (preventDefault below).
         */
        const current = latest.current;
        const order = presentSelectionOrder(readPresentSceneObjects(current.slide).filter(isPlainPresentRecord))
          .filter(isPresentObjectSelectable);
        const selection = current.selectedSceneObjectIds;
        if (!order.length || !selection.length) return;
        const primaryId = selection[selection.length - 1];
        const primaryIndex = order.findIndex((object) => object.id === primaryId);
        if (primaryIndex < 0) return;
        const atFirst = primaryIndex === 0;
        const atLast = primaryIndex === order.length - 1;
        if (
          (command.type === 'select-next' && atLast) ||
          (command.type === 'select-previous' && atFirst)
        ) {
          return;
        }
      }
      // PR-005: Escape/dismiss is also the abort signal for an in-flight stage gesture. It is sent
      // here in the single keyboard owner, because the canvas command executor can consume the
      // dismiss itself (clearing the selection) and then never reach the editor's command switch.
      if (command.type === 'dismiss' || command.type === 'clear-selection') {
        setGestureCancelToken((token) => token + 1);
      }
      if (runCommand(command)) event.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardEnabled, runCommand]);

  // Object addition handlers
  const handleAddText = (point?: { xPercent: number; yPercent: number }) => {
    const id = `present-text-${crypto.randomUUID()}`;
    // Round 35 (M1): a text box created on the sheet takes the deck's body colour — dark on the
    // white Paper default (readable like PowerPoint), light on an explicitly dark theme.
    const obj = { ...createPresentTextObject(id, point ?? { xPercent: 12, yPercent: 28 }), color: design.bodyColor };
    onUpdateSlide({ ...slide, sceneObjects: [...sceneObjects, obj] });
    applySelection([...selectedSceneObjectIds, id]);
    // The new box gets the caret, so "canvas anklicken und editierbare Textbox erstellen" ends with a
    // caret in the box instead of a selected object the user has to find.
    setFocusRequestId(id);
    // PR-004/PR-005: creating a text box *is* entering its edit mode — one gesture, one state.
    setTextEditingObjectId(id);
    setArmedTool(null);
    setArmedShapeTool(null);
    setShowInspector(true);
    onSelectSelectionType('text');
  };

  /**
   * PR-007: choosing a shape arms the freeform draw tool — it no longer drops a fixed-position
   * object. The canvas owns the transient drag; this handler owns the single document write.
   */
  const handleAddShape = (shape: PresentShapeSceneObject['shape']) => {
    const next = armedShapeTool === shape ? null : shape;
    setArmedShapeTool(next);
    setArmedTool(null);
    setTextEditingObjectId(null);
    setCommandStatus(
      next
        ? `${shape} tool armed — drag on the canvas to draw, click for the default size, Escape cancels.`
        : 'Shape tool cancelled.',
    );
  };

  const handleShapeDrawn = (shape: PresentShapeSceneObject['shape'], drawing: PresentShapeDrawing) => {
    // Model IDs are UUIDs: `Date.now()` collided when two shapes were drawn inside the same
    // millisecond and made selection/history address the wrong object.
    const id = `present-shape-${crypto.randomUUID()}`;
    const obj = createPresentShapeObject(id, shape, drawing);
    onUpdateSlide({ ...slide, sceneObjects: [...sceneObjects, obj] });
    applySelection([...selectedSceneObjectIds, id]);
    setArmedShapeTool(null);
    setCommandStatus(null);
    setShowInspector(true);
    onSelectSelectionType('shape');
  };

  /**
   * PR-010 (M1 keyboard-only): Enter/Space on the focused slide places the armed insert tool.
   *
   * This is deliberately *not* new placement logic: the text path calls `handleAddText` (same
   * documented default point 12 % / 28 % and the same caret/focus pipeline as a click), and the
   * shape path calls `handleShapeDrawn` with the click-without-drag drawing of the shipped factory
   * centred on the slide — exactly the geometry a pointer click at the default point would produce.
   */
  const handleKeyboardPlaceArmedTool = () => {
    if (armedTool === 'text') {
      handleAddText();
      return;
    }
    if (armedShapeTool) {
      handleShapeDrawn(
        armedShapeTool,
        presentShapeClickDrawing(armedShapeTool, { xPercent: 50, yPercent: 50 }),
      );
    }
  };

  const handleAddWidget = (widgetType: PresentWidgetSceneObject['widgetType']) => {
    const id = `present-widget-${Date.now()}`;
    const obj = createPresentWidgetObject(id, widgetType);
    onUpdateSlide({ ...slide, sceneObjects: [...sceneObjects, obj] });
    applySelection([...selectedSceneObjectIds, id]);
    setShowInspector(true);
    onSelectSelectionType('shape');
  };

  const handleAddDiagram = (diagramType: PresentDiagramSceneObject['diagramType']) => {
    const id = `present-diagram-${Date.now()}`;
    const obj = createPresentDiagramObject(id, diagramType);
    onUpdateSlide({ ...slide, sceneObjects: [...sceneObjects, obj] });
    applySelection([...selectedSceneObjectIds, id]);
    setShowInspector(true);
  };

  const handleAddCode = (lang: string) => {
    const id = `present-code-${Date.now()}`;
    const obj = createPresentCodeObject(id, lang);
    onUpdateSlide({ ...slide, sceneObjects: [...sceneObjects, obj] });
    applySelection([...selectedSceneObjectIds, id]);
    setShowInspector(true);
  };

  const handleAddChart = () => {
    const directChart = embeddedObjects.find((obj) => obj.type === 'Chart');
    const chartReference = embeddedObjects.find(
      (obj) => obj.type === 'WorkspaceReference' && obj.data.cached_snapshot?.type === 'Chart',
    );
    const referencedChart =
      chartReference?.type === 'WorkspaceReference' && chartReference.data.cached_snapshot?.type === 'Chart'
        ? chartReference.data.cached_snapshot
        : undefined;
    const chart = directChart?.type === 'Chart'
      ? directChart.data
      : referencedChart?.type === 'Chart'
        ? referencedChart.data
        : undefined;
    const id = `present-chart-${Date.now()}`;
    const obj = createPresentChartObject(id, chart, Boolean(chart));
    onUpdateSlide({ ...slide, sceneObjects: [...sceneObjects, obj] });
    applySelection([...selectedSceneObjectIds, id]);
    onSelectSelectionType('chart');
  };

  const handleAddTable = () => {
    const id = `present-table-${Date.now()}`;
    const obj = createPresentTableObject(id);
    onUpdateSlide({ ...slide, sceneObjects: [...sceneObjects, obj] });
    applySelection([...selectedSceneObjectIds, id]);
    onSelectSelectionType('cell');
  };

  const handleInsertImageFile = async (file: File, xPercent = 60, yPercent = 50) => {
    // The intrinsic size measured by the isolated decoder decides the box, so the image is not
    // distorted on insert. `presentImageBoxForIntrinsicSize` is the one place that converts pixels
    // to anisotropic slide percent.
    // Release 0.1: a rejected decode/limit must be reported instead of becoming an unhandled
    // promise rejection ("clicking Insert image does nothing").
    let insertion: Awaited<ReturnType<typeof presentImageInsertionFromFile>>;
    try {
      insertion = await presentImageInsertionFromFile(file);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setCommandStatus(`Image insert failed: ${reason.slice(0, 300)}`);
      return;
    }
    const box = presentImageBoxForIntrinsicSize(
      { widthPx: insertion.widthPx, heightPx: insertion.heightPx },
      presentAspectRatioValue(normalizedPresentData.aspectRatio),
    );
    const id = `present-image-${crypto.randomUUID()}`;
    const img: PresentImageObject = withPresentImageIntrinsicSize(
      {
        id,
        name: insertion.name,
        dataUrl: insertion.dataUrl,
        xPercent: Math.max(0, Math.min(100 - box.widthPercent, xPercent)),
        yPercent: Math.max(0, Math.min(92, yPercent)),
        widthPercent: box.widthPercent,
        heightPercent: box.heightPercent,
        opacity: 1,
        zIndex: 25,
      },
      { widthPx: insertion.widthPx, heightPx: insertion.heightPx },
    );
    onUpdateSlide({ ...slide, images: [...(slide.images || []), img] });
    setSelectedImageSelection(id);
  };

  const handleInsertWorkspaceObject = (object: PresentWorkspaceSceneObject) => {
    onUpdateSlide({ ...slide, sceneObjects: [...sceneObjects, object] });
    applySelection([...selectedSceneObjectIds, object.id]);
    setShowInspector(true);
    onPresenceObjectChange?.(object.id);
  };

  // Image selection is intentionally separate from the scene-object selection: images are a
  // different contract (`slide.images`), and the freeform image gesture path predates groups.
  // Round 25: the last selected id may be `undefined` after a delete; a raw `{}` entry must never
  // match that (its `id` is undefined too) and reach the inspector without a kind.
  const primarySelectedId = selectedSceneObjectIds[selectedSceneObjectIds.length - 1];
  const selectedObject = (typeof primarySelectedId === 'string'
    ? sceneObjects.find((o) => isPlainPresentRecord(o) && (o as { id?: unknown }).id === primarySelectedId)
    : undefined) || null;
  const selectedImage = (slide.images || []).filter(isPlainPresentRecord).find((i) => typeof selectedImageId === 'string' && i.id === selectedImageId) || null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#07090e] relative">
      {/* 1. Top Ribbon Toolbar */}
      <PresentTopToolbar
        slide={slide}
        design={design}
        presentData={normalizedPresentData}
        onUpdateSlide={onUpdateSlide}
        onUpdatePresentData={onUpdatePresentData}
        onInsertImageFile={(f) => handleInsertImageFile(f)}
        onAddText={handleAddText}
        onAddShape={handleAddShape}
        onAddWidget={handleAddWidget}
        onAddDiagram={handleAddDiagram}
        onAddCode={handleAddCode}
        onAddChart={handleAddChart}
        onAddTable={handleAddTable}
        showLayers={showLayers}
        onToggleLayers={() => setShowLayers(!showLayers)}
        showAnimations={showAnimations}
        onToggleAnimations={() => setShowAnimations(!showAnimations)}
        showNotes={showSpeakerNotes}
        onToggleNotes={() => setShowSpeakerNotes(!showSpeakerNotes)}
        showInspector={showInspector}
        onToggleInspector={() => setShowInspector(!showInspector)}
        onOpenThemeManager={() => setShowThemeModal(true)}
        onOpenSections={() => setShowSectionsModal(true)}
        onOpenRehearsal={() => setShowRehearsalModal(true)}
        onOpenComments={() => setShowCommentsModal(true)}
        onOpenMediaEmbed={() => setShowMediaModal(true)}
        onOpenVideoExport={() => setShowVideoExportModal(true)}
        onOpenSpeakerCoach={() => setShowSpeakerCoachModal(true)}
        onOpenWorkspaceIntegration={() => setShowWorkspaceIntegration(true)}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onPreviewTransition={previewTransition}
        onApplyTransitionToAll={onApplyTransitionToAll}
        selectionSize={selectedSceneObjectIds.length}
        onCommand={(command) => { runCommand(command); }}
        armedTool={armedTool}
        onToggleArmedTool={(tool) => {
          setArmedTool((current) => (current === tool ? null : tool));
          // The two insert tools are mutually exclusive: arming one disarms the other.
          setArmedShapeTool(null);
        }}
        onApplyThemeToDeck={(themeId) => {
          const result = applyPresentTheme(normalizedPresentData, themeId);
          onUpdatePresentData(result.model);
          setCommandStatus(
            result.report.changed
              ? `Theme applied. Preserved: ${result.report.preservedSlideBackgrounds} slide background(s), ${result.report.preservedObjectColors} object colour(s), ${result.report.preservedTextObjects} text colour(s).`
              : 'Theme unchanged; existing custom formatting was left untouched.',
          );
        }}
      />

      {/* 2. Middle Content Area: Stage Canvas + Inspector Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        <PresentStageCanvas
          slide={slide}
          design={design}
          aspectRatio={normalizedPresentData.aspectRatio}
          onUpdateSlide={onUpdateSlide}
          selectedSceneObjectIds={selectedSceneObjectIds}
          onSelectSceneObject={(id, additive) => {
            runCommand({ type: 'toggle-object-selection', id, additive: Boolean(additive) });
            if (!additive) setShowInspector(true);
          }}
          onSelectSceneObjects={(ids) => applySelection(ids)}
          selectedImageId={selectedImageId}
          onSelectImage={(id) => {
            setSelectedImageSelection(id);
            onPresenceObjectChange?.(id);
            if (id) {
              applySelection([]);
              setShowInspector(true);
            }
          }}
          embeddedObjects={embeddedObjects}
          onInsertImageFile={handleInsertImageFile}
          animationPreview={animationPreview}
          transitionPreviewProgress={transitionPreviewProgress}
          stylePreviewById={objectStylePreview ? { [objectStylePreview.id]: objectStylePreview.style } : undefined}
          onPresenceObjectChange={onPresenceObjectChange}
          armedTool={armedTool}
          shapeDrawTool={armedShapeTool}
          onShapeDrawn={handleShapeDrawn}
          onKeyboardPlaceArmedTool={handleKeyboardPlaceArmedTool}
          onCanvasClick={(point) => {
            if (armedTool === 'text') handleAddText(point);
          }}
          onRequestTextAt={(point) => handleAddText(point)}
          focusRequestId={focusRequestId}
          onFocusHandled={() => setFocusRequestId(null)}
          textEditingObjectId={textEditingObjectId}
          gestureCancelToken={gestureCancelToken}
          onRequestTextEdit={(id) => {
            // Starting an edit is also a selection change: the inspector must follow the box.
            applySelection([id]);
            setShowInspector(true);
            setTextEditingObjectId(id);
          }}
          onEndTextEdit={() => setTextEditingObjectId(null)}
          linkStatusByObjectId={linkStatusByObjectId}
          workspaceDropZone={workspaceDropZone}
        />

        {showInspector && (
          <PresentObjectInspector
            selectedObject={selectedObject}
            selectedImage={selectedImage}
            allObjects={sceneObjects.filter(isPlainPresentRecord)}
            selectedObjectIds={selectedSceneObjectIds}
            selectionSize={selectedSceneObjectIds.length}
            onApplyTextFormat={(patch) => {
              // Formatting applies to the whole *visible* selection through one pure rule.
              // Round 25: the computation runs on the filtered list; the central write merge puts the
              // malformed raw entries back (no silent data loss).
              const objects = readPresentSceneObjects(latest.current.slide).filter(isPlainPresentRecord);
              const result = applyPresentTextFormat(objects, latest.current.selectedSceneObjectIds, patch);
              if (!result.changedIds.length) {
                setCommandStatus(
                  result.skippedNonTextIds.length
                    ? `Formatting skipped: ${result.skippedNonTextIds.length} selected object(s) are not text.`
                    : 'Formatting unchanged.',
                );
                return;
              }
              onUpdateSlide({ ...latest.current.slide, sceneObjects: result.objects });
              setCommandStatus(`Formatted ${result.changedIds.length} text object(s).`);
            }}
            onPatchObject={(id, patch) => {
              setObjectStylePreview(null);
              onUpdateSlide({
                ...slide,
                sceneObjects: sceneObjects.filter(isPlainPresentRecord).map((o) => (o.id === id ? ({ ...o, ...patch } as PresentSceneObject) : o)),
              });
            }}
            onPreviewObjectStyle={(id, style) => {
              setObjectStylePreview(style ? { id, style } : null);
            }}
            animations={slide.animations ?? []}
            onUpdateAnimations={(animations) => onUpdateSlide({ ...slide, animations })}
            onPreviewAnimation={previewObjectAnimation}
            onPatchImage={(id, patch) => {
              onUpdateSlide({
                ...slide,
                images: (slide.images || []).filter(isPlainPresentRecord).map((img) => (img.id === id ? ({ ...img, ...patch } as PresentImageObject) : img)),
              });
            }}
            onUpdateAllObjects={(objects) => onUpdateSlide({ ...slide, sceneObjects: objects })}
            onCommand={(command) => { runCommand(command); }}
            onPatchTableResult={(mutate) => {
              const result = mutate();
              if (result.message) setCommandStatus(result.message);
              if (!result.changed) return;
              const objects = readPresentSceneObjects(latest.current.slide).filter(isPlainPresentRecord);
              onUpdateSlide({
                ...latest.current.slide,
                sceneObjects: objects.map((object) => (object.id === result.table.id ? result.table : object)),
              });
            }}
            onPatchChartResult={(mutate) => {              const result = mutate();
              if (result.message) setCommandStatus(result.message);
              if (!result.changed) return;
              const objects = readPresentSceneObjects(latest.current.slide).filter(isPlainPresentRecord);
              onUpdateSlide({
                ...latest.current.slide,
                sceneObjects: objects.map((object) =>
                  object.id === result.chart.id && object.kind === 'chart' ? { ...object, chart: result.chart } : object,
                ),
              });
            }}
            onLinkResult={(validation, objectId) => {
              // Paket 28: a link is only stored when the pure validator accepts it; a refusal is shown.
              setCommandStatus(validation.message);
              const objects = readPresentSceneObjects(latest.current.slide).filter(isPlainPresentRecord);
              onUpdateSlide({
                ...latest.current.slide,
                sceneObjects: objects.map((object) =>
                  object.id === objectId ? (withPresentObjectLink(object, validation.ok ? validation.target : null) as PresentSceneObject) : object,
                ),
              });
            }}
            linkSlides={slideOptions}
            slideIndexById={slideIndexById}
            slideBackground={design.backgroundColor}
            onClose={() => setShowInspector(false)}
          />
        )}
      </div>

      {/* Live status for keyboard commands: visible, announced, never colour-only. */}
      {commandStatus && (
        <div
          role="status"
          aria-live="polite"
          data-present-command-status="true"
          className="pointer-events-none absolute bottom-10 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-cyan-500/30 bg-slate-950/95 px-3 py-1 text-[0.625rem] text-cyan-200 shadow-xl"
        >
          {commandStatus}
        </div>
      )}

      {slideCount > PRESENT_DECK_SLIDE_LIMIT && (
        <div role="alert" className="absolute top-12 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-950/95 px-3 py-1 text-[0.625rem] text-red-200">
          This deck has {slideCount} slides, above the {PRESENT_DECK_SLIDE_LIMIT}-slide editing limit. New slides are refused.
        </div>
      )}

      {/* 3. Floating Layers Pane */}
      {showLayers && (
        <PresentLayersPane
          slide={slide}
          onUpdateSlide={onUpdateSlide}
          selectedObjectId={selectedSceneObjectIds[selectedSceneObjectIds.length - 1] ?? null}
          selectedImageId={selectedImageId}
          onSelectObject={(id) => applySelection(id ? [id] : [])}
          onSelectImage={(id) => {
            setSelectedImageSelection(id);
            if (id) applySelection([]);
          }}
          onClose={() => setShowLayers(false)}
        />
      )}

      {/* 4. Bottom Drawers: Animation Timeline & Speaker Notes */}
      {showAnimations && (
        <PresentAnimationPane
          slide={slide}
          onUpdateSlide={onUpdateSlide}
          onClose={() => { setAnimationPreview(null); setShowAnimations(false); }}
          onPreviewState={setAnimationPreview}
        />
      )}

      {showSpeakerNotes && (
        <PresentSpeakerNotesDrawer
          slide={slide}
          onUpdateSlide={onUpdateSlide}
          onClose={() => setShowSpeakerNotes(false)}
        />
      )}

      <PresentWorkspaceIntegrationModal
        isOpen={showWorkspaceIntegration}
        sourceDocuments={workspaceDocuments}
        existingObjects={presentOccupiedSlideObjects(slide)}
        onClose={() => setShowWorkspaceIntegration(false)}
        onInsert={handleInsertWorkspaceObject}
        onOpenSource={onOpenWorkspaceDocument}
      />

      {/* 5. Centralized Present Modals Orchestrator */}
      <PresentModals
        slide={slide}
        presentData={normalizedPresentData}
        onUpdateSlide={onUpdateSlide}
        onUpdatePresentData={onUpdatePresentData}
        showThemeModal={showThemeModal}
        onCloseThemeModal={() => setShowThemeModal(false)}
        showSectionsModal={showSectionsModal}
        onCloseSectionsModal={() => setShowSectionsModal(false)}
        showRehearsalModal={showRehearsalModal}
        onCloseRehearsalModal={() => setShowRehearsalModal(false)}
        showCommentsModal={showCommentsModal}
        onCloseCommentsModal={() => setShowCommentsModal(false)}
        showMediaModal={showMediaModal}
        onCloseMediaModal={() => setShowMediaModal(false)}
        showVideoExportModal={showVideoExportModal}
        onCloseVideoExportModal={() => setShowVideoExportModal(false)}
        showSpeakerCoachModal={showSpeakerCoachModal}
        onCloseSpeakerCoachModal={() => setShowSpeakerCoachModal(false)}
      />
    </div>
  );
};
