import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PresentSlide,
  PresentImageObject,
  PresentSceneObject,
  PresentShapeSceneObject,
  WorkspaceObject,
} from '../../../shared/contracts/workspace';
import { ChartRenderer } from '../../../shared/charts/ChartRenderer';
import { GridLiveReferenceCard, tableFromWorkspaceReference } from '../../grid/integrations/GridLiveReferenceCard';
import { ResolvedPresentDesign } from '../design/presentDesign';
import { PresentSceneObjectView, type PresentObjectGestureCorner, type PresentObjectGestureMode } from './rendering/PresentSceneObjectView';
import { PresentShapeDrawOverlay } from './rendering/PresentShapeDrawOverlay';
import { PresentCardsLayout } from './PresentCardsLayout';
import {
  isPlainPresentRecord,
  normalizePresentGeometry,
  presentShapeDragDrawing,
  sortPresentLayers,
  updatePresentSceneObject,
  type PresentShapeDrawing,
} from './model/presentScene';
import { presentSelectionBounds, pickPresentObjectInStack, presentObjectsInMarquee } from './model/presentSelection';
import { nudgePresentSelection, resizePresentSelection, rotatePresentSelection } from './model/presentTransform';
import { presentAspectRatioValue, presentPercentFromClientPoint, rectFromCorners, type PresentPercentRect } from './model/presentRect';
import { computePresentSnapGeometry, type PresentSnapGuide } from './model/presentSnapping';
import { resizePresentImageBox } from './model/presentImageGeometry';
import { readPresentImageIntrinsicSize } from './model/presentObjectExtensions';
import type { PresentLinkStatus } from '../integrations/presentLinkStatus';
import { Plus, BarChart3, Trash2, Grid3x3 } from 'lucide-react';
import { composeTargetAnimationStyle, type PresentAnimationPreviewState } from '../animations/presentAnimationEngine';
import { presentSlideBackgroundCss, type PresentObjectStyle } from '../contracts/presentStyle';
import { computePresentTransitionFrame } from '../presenter/transitions/presentTransitionEngine';
import { PresentFloatingImageView } from './PresentFloatingImageView';
import { PresentWorkspaceDropZoneOverlay } from '../integrations/workspace-drop/PresentWorkspaceDropZoneOverlay';
import { hasPresentWorkspaceDropTransfer } from '../integrations/workspace-drop/presentWorkspaceDropZone';
import type { PresentWorkspaceDropZoneWiring } from '../integrations/workspace-drop/usePresentWorkspaceDropZone';
import { FrameBudgetScheduler } from '../../../platform/performance/performancePlatform';
import { splitPresentTwoColumn, presentSlideCards } from '../contracts/presentDeckFactory';

/** Percent grid used by the visible ruler grid and by grid snapping. 1 % snap is zoom independent. */
export const PRESENT_GRID_PERCENT = 1;
/** Stable empty style so a memoized object view is not invalidated by a fresh `{}` per render. */
const EMPTY_ANIMATION_STYLE: React.CSSProperties = {};

/**
 * PR-005 (M1): a pointer movement below this many CSS pixels is a click, not a drag.
 *
 * Nothing is written to the document until the threshold is crossed, so a plain click on an object
 * can never produce a geometry write (Plan-INV-004). Once crossed, the gesture stays a drag even if
 * the pointer returns below the threshold — the document then keeps following the pointer.
 */
export const PRESENT_GESTURE_DRAG_THRESHOLD_PX = 2;

interface PresentStageCanvasProps {
  slide: PresentSlide;
  design: ResolvedPresentDesign;
  aspectRatio?: string;
  onUpdateSlide: (updated: PresentSlide, options?: { coalesceKey?: string }) => void;
  selectedSceneObjectIds: readonly string[];
  onSelectSceneObject: (id: string, additive?: boolean) => void;
  onSelectSceneObjects: (ids: string[]) => void;
  selectedImageId: string | null;
  onSelectImage: (id: string | null) => void;
  embeddedObjects: WorkspaceObject[];
  onInsertImageFile: (file: File, xPercent?: number, yPercent?: number) => void;
  /** Live-link state per workspace object id: what the user must be told about the source. */
  linkStatusByObjectId?: Record<string, PresentLinkStatus>;
  /**
   * Round 42 (style freeze): lightweight document-free style preview for the object currently being
   * edited in the inspector's style panel. The commit itself is debounced by the panel.
   */
  stylePreviewById?: Record<string, PresentObjectStyle>;
  /** Slide-level notice for the live links ("updated" / "offline"). */
  onSlideLinkSummary?: (summary: { attentionCount: number; liveCount: number }) => void;
  /** Armed insert tool: a click on empty canvas creates this object at the click point. */
  armedTool?: 'text' | null;
  /**
   * PR-007 (M1): armed freeform shape tool. A pointer drag on the empty canvas draws a live preview
   * and commits exactly once on pointer-up; a click without a drag places the documented default
   * size at the click point. `null`/undefined means no shape is being drawn.
   */
  shapeDrawTool?: PresentShapeSceneObject['shape'] | null;
  /** PR-007: called once per finished draw gesture — the editor is the one owner of the slide write. */
  onShapeDrawn?: (shape: PresentShapeSceneObject['shape'], drawing: PresentShapeDrawing) => void;
  /**
   * PR-010 (M1 keyboard-only): Enter/Space on the focused stage places the armed insert tool at its
   * documented default point. The editor owns the factory call and the caret; the stage only reports
   * the key, so there is no second placement logic in the canvas.
   */
  onKeyboardPlaceArmedTool?: () => void;
  onCanvasClick?: (point: { xPercent: number; yPercent: number }) => void;
  /** Double-click on empty canvas: the PowerPoint-like shortcut for a new text box. */
  onRequestTextAt?: (point: { xPercent: number; yPercent: number }) => void;
  /** Id of a just-created object that must receive the caret. */
  focusRequestId?: string | null;
  onFocusHandled?: () => void;
  /** PR-005: exactly one text object may be in edit mode at a time (single owner in the editor). */
  textEditingObjectId?: string | null;
  /**
   * PR-005 (M1): incremented by the editor's single keyboard owner on Escape/dismiss. The stage
   * aborts an in-flight object gesture and restores the start snapshot when the token changes —
   * without a second window `keydown` owner inside the canvas.
   */
  gestureCancelToken?: number;
  onRequestTextEdit?: (id: string) => void;
  onEndTextEdit?: () => void;
  animationPreview?: PresentAnimationPreviewState | null;
  transitionPreviewProgress?: number | null;
  onPresenceObjectChange?: (objectId: string | null) => void;
  /**
   * **Paket 10:** die Present-Ablagefläche. `PresentCanvas` verdrahtet sie — dort liegen das Dokument und
   * die Quellenliste. Gerendert wird sie **hier**, weil nur hier der Folienrahmen liegt:
   * *die Prozente der Platzierung sind die Prozente der Folie, nicht die des Editors.*
   */
  workspaceDropZone?: PresentWorkspaceDropZoneWiring | null;
}

interface PresentStageGesture {
  id: string;
  mode: PresentObjectGestureMode;
  /** PR-006: which handle started a resize; `'se'` is the historical default (no corner given). */
  corner: PresentObjectGestureCorner;
  /**
   * PR-006: Shift state at pointer-down. On a corner resize it locks the aspect ratio; on an edge
   * it is deliberately ignored. Captured once at gesture start, like the image gesture's `free`.
   */
  shift: boolean;
  startClientX: number;
  startClientY: number;
  /** Snapshot of the whole scene at gesture start: absolute deltas are always computed against it. */
  startObjects: PresentSceneObject[];
  selection: string[];
  startAngleDeg: number;
  centreClientX: number;
  centreClientY: number;
  historyKey: string;
}

interface PresentImageGesture {
  id: string;
  mode: 'move' | 'resize';
  startClientX: number;
  startClientY: number;
  startXPercent: number;
  startYPercent: number;
  startWidthPercent: number;
  /** Shift keeps a one-axis resize instead of the aspect-locked default. */
  free: boolean;
  /**
   * PR-005 (rest-2): the whole image array at gesture start. It is the rollback snapshot for a
   * cancelled gesture — the same pattern the scene-object gesture uses with `startObjects`.
   */
  startImages: PresentImageObject[];
  historyKey: string;
}

/** PR-007: transient draw gesture — never part of the document until pointer-up commits it. */
interface PresentShapeDraft {
  shape: PresentShapeSceneObject['shape'];
  start: { xPercent: number; yPercent: number };
  current: { xPercent: number; yPercent: number };
  /** Shift at drag start; a Shift pressed later is picked up on the next pointer move. */
  shiftKey: boolean;
}

export const PresentStageCanvas: React.FC<PresentStageCanvasProps> = ({
  slide,
  design,
  aspectRatio = '16:9',
  onUpdateSlide,
  selectedSceneObjectIds,
  onSelectSceneObject,
  onSelectSceneObjects,
  selectedImageId,
  onSelectImage,
  embeddedObjects,
  onInsertImageFile,
  workspaceDropZone = null,
  linkStatusByObjectId = {},
  stylePreviewById,
  onSlideLinkSummary,
  armedTool = null,
  shapeDrawTool = null,
  onShapeDrawn,
  onKeyboardPlaceArmedTool,
  onCanvasClick,
  onRequestTextAt,
  focusRequestId = null,
  onFocusHandled,
  textEditingObjectId = null,
  gestureCancelToken = 0,
  onRequestTextEdit,
  onEndTextEdit,
  animationPreview = null,
  transitionPreviewProgress = null,
  onPresenceObjectChange,
}) => {
  const slideCanvasRef = useRef<HTMLDivElement>(null);
  const frameSchedulerRef = useRef<FrameBudgetScheduler | null>(null);

  const [gesture, setGesture] = useState<PresentStageGesture | null>(null);
  const [imageGesture, setImageGesture] = useState<PresentImageGesture | null>(null);
  /** PR-007: the live draw draft. `null` means no shape is being drawn. */
  const [shapeDraft, setShapeDraft] = useState<PresentShapeDraft | null>(null);
  const shapeDraftRef = useRef<PresentShapeDraft | null>(null);
  /** Callback ref: the pointer-up handler must see the newest editor callback, not a stale prop. */
  const onShapeDrawnRef = useRef(onShapeDrawn);
  onShapeDrawnRef.current = onShapeDrawn;
  const [snapGuides, setSnapGuides] = useState<PresentSnapGuide[]>([]);
  const [marquee, setMarquee] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  /**
   * PR-005: `true` only once the pointer travelled past `PRESENT_GESTURE_DRAG_THRESHOLD_PX`.
   * A plain click therefore never writes geometry, and a click that was cancelled has nothing to
   * roll back.
   */
  const gestureMovedRef = useRef(false);
  /** PR-005: rolls the active scene gesture back to its start snapshot (Escape via editor token). */
  const gestureCancelRef = useRef<(() => void) | null>(null);
  /**
   * PR-005 (rest-2): `true` only once an image gesture travelled past the same 2 px threshold.
   * A click on an image therefore never mutates it, and a cancelled click has nothing to roll back.
   */
  const imageGestureMovedRef = useRef(false);
  /**
   * Round 41 (unified multi-object drag performance): scene gestures (move/resize/rotate) only
   * publish a local preview — the document and the history receive exactly ONE commit on pointer-up.
   * `sceneGesturePreview` is the frame-coalesced preview list; `null` means "show the document".
   */
  const [sceneGesturePreview, setSceneGesturePreview] = useState<PresentSceneObject[] | null>(null);
  const sceneGesturePreviewRef = useRef<PresentSceneObject[] | null>(null);
  /**
   * Round 40 (performance, image drag): the move gesture only previews through a local CSS
   * transform (`imageDragPreview`, updated once per animation frame). The document — and with it one
   * history entry — is written exactly once on pointer-up. `imageGestureWroteRef` records whether an
   * *resize* gesture already wrote (its rollback still restores the start snapshot); a pure move
   * leaves the document alone until release, so a cancelled move has nothing to roll back.
   */
  const [imageDragPreview, setImageDragPreview] = useState<{ id: string; dxPx: number; dyPx: number } | null>(null);
  const imageGestureWroteRef = useRef(false);
  /** PR-005 (rest-2): roll-back hook for an image gesture, used by the shared cancel token. */
  const imageGestureCancelRef = useRef<(() => void) | null>(null);
  /**
   * PR-005: unmount rollback hooks.
   *
   * They are published while a scene/image gesture is active and cleared by every normal end path
   * (pointer-up, pointercancel, blur, Escape). An unmount in the middle of a drag therefore runs
   * exactly the same rollback as `pointercancel` — no new state, no second semantics.
   */
  const sceneGestureUnmountRollbackRef = useRef<(() => void) | null>(null);
  const imageGestureUnmountRollbackRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const scheduler = new FrameBudgetScheduler();
    frameSchedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      if (frameSchedulerRef.current === scheduler) frameSchedulerRef.current = null;
    };
  }, []);

  // PR-005: the stage can disappear in the middle of a gesture (slide switch, view switch). The
  // guard runs only on unmount; the gesture effects publish their rollback hooks and every normal
  // end path clears them, so a completed gesture is never rolled back here.
  useEffect(() => () => {
    sceneGestureUnmountRollbackRef.current?.();
    sceneGestureUnmountRollbackRef.current = null;
    imageGestureUnmountRollbackRef.current?.();
    imageGestureUnmountRollbackRef.current = null;
  }, []);

  // Round 16 (malformed document): `sceneObjects` may be a non-array hostile value — the stage
  // always renders exactly one real list (empty when the payload is unusable).
  // Round 24: entries inside the array can be null/primitives or lack the required `kind` string;
  // they are filtered for rendering only (the document keeps them untouched).
  // Round 41: memoized so gesture frames keep the same object identities — the memoized
  // `PresentSceneObjectView` then re-renders only the objects that actually move.
  const sceneObjects = useMemo(
    () => (Array.isArray(slide.sceneObjects) ? slide.sceneObjects : [])
      .filter((o) => isPlainPresentRecord(o) && typeof (o as { kind?: unknown }).kind === 'string')
      .map((o) => normalizePresentGeometry(o)),
    [slide.sceneObjects],
  );
  const selectedIds = selectedSceneObjectIds.filter((id) => sceneObjects.some((object) => object.id === id));
  const primaryId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const selectionSize = selectedSceneObjectIds.length;
  const aspect = presentAspectRatioValue(aspectRatio);
  const hasWorkspaceReferences = sceneObjects.some((object) => object.kind === 'workspace');
  // Round 40 (P0): the blank hint is only honest while the slide really has no canvas content. The
  // old condition (only `!hasLegacyHeaderContent`) kept the dashed box visible forever after the
  // first shape/text/widget was dropped — the user reported it as a leftover grid/empty area.
  const hasCanvasContent = sceneObjects.length > 0
    || (Array.isArray(slide.images) ? slide.images.length : 0) > 0;
  /**
   * PR-002 (M1): the legacy header (category/title/subtitle) is an editor for *stored* legacy
   * content, not a placeholder surface. A new blank slide therefore shows no empty legacy inputs —
   * it shows a clean slide with the restrained blank hint. Nothing is deleted or migrated: the
   * fields appear exactly when a document actually carries them (title/subtitle/category or cards).
   */
  // Round 16 (malformed document): non-string titles/categories are not legacy content and would
  // crash the `.trim()` gate. Only strings are read; everything else counts as "no content".
  const titleText = typeof slide.title === 'string' ? slide.title : '';
  const subtitleText = typeof slide.subtitle === 'string' ? slide.subtitle : '';
  const categorySource = (slide as { category?: unknown; categoryTag?: unknown }).category
    ?? (slide as { categoryTag?: unknown }).categoryTag;
  const categoryText = typeof categorySource === 'string' ? categorySource : '';
  const hasLegacyHeaderContent = Boolean(
    titleText.trim() ||
    subtitleText.trim() ||
    categoryText.trim() ||
    // Round 14: `cards` is hostile input — only a real card array counts as legacy content.
    (Array.isArray(slide.cards) ? slide.cards.length : 0) > 0,
  );
  const transitionPreviewFrame = transitionPreviewProgress == null
    ? null
    : computePresentTransitionFrame(slide.transition, transitionPreviewProgress).incoming;
  const transitionPreviewStyle: React.CSSProperties = transitionPreviewFrame
    ? {
        opacity: transitionPreviewFrame.opacity,
        transform: transitionPreviewFrame.transform,
        clipPath: transitionPreviewFrame.clipPath,
      }
    : {};

  const previewAnimations = useMemo(
    () => (animationPreview
      ? (slide.animations || []).filter(isPlainPresentRecord).filter((animation) => animationPreview.animationIds.includes(animation.id as string))
      : []),
    [animationPreview, slide.animations],
  );
  const animationStyleForTarget = useCallback(
    (targetId: string): React.CSSProperties => (animationPreview
      ? (composeTargetAnimationStyle(previewAnimations, targetId, animationPreview.progressByAnimationId) as React.CSSProperties)
      : EMPTY_ANIMATION_STYLE),
    [animationPreview, previewAnimations],
  );

  const updateSceneObjects = useCallback((nextObjects: PresentSceneObject[], coalesceKey?: string) => {
    onUpdateSlide({ ...slide, sceneObjects: nextObjects }, coalesceKey ? { coalesceKey } : undefined);
  }, [onUpdateSlide, slide]);

  const patchSceneObject = useCallback((id: string, patch: Partial<PresentSceneObject>, coalesceKey?: string) => {
    updateSceneObjects(updatePresentSceneObject(sceneObjects, id, patch), coalesceKey);
  }, [updateSceneObjects, sceneObjects]);

  const handleObjectSelect = useCallback((id: string, additive: boolean) => {
    if (additive) onSelectSceneObject(id, true);
    else onSelectSceneObject(id, false);
    onSelectImage(null);
  }, [onSelectSceneObject, onSelectImage]);

  const updatePresentImage = (imageId: string, patch: Partial<PresentImageObject>, coalesceKey?: string) => {
    onUpdateSlide({
      ...slide,
      images: (slide.images || []).map((img) => (isPlainPresentRecord(img) && img.id === imageId ? { ...img, ...patch } : img)),
    }, coalesceKey ? { coalesceKey } : undefined);
  };

  /** Replaces the whole image list — the rollback path of a cancelled image gesture. */
  const updatePresentImages = (nextImages: PresentImageObject[], coalesceKey?: string) => {
    onUpdateSlide({ ...slide, images: nextImages }, coalesceKey ? { coalesceKey } : undefined);
  };

  /** Client coordinates to slide percent. Returns `null` when the canvas is not measurable. */
  const toPercent = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = slideCanvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // **Eine** Definition dieser Umrechnung: `presentPercentFromClientPoint` (siehe `presentRect.ts`).
    // Der sichtbare Rahmen ist der Rahmen **nach** dem Zoom — deshalb ist das Ergebnis zoomunabhängig.
    const percent = presentPercentFromClientPoint({ clientX, clientY }, rect);
    return percent ? { x: percent.xPercent, y: percent.yPercent } : null;
  }, []);

  // ---------------------------------------------------------------------------------------------
  // Object gestures: move (whole selection), resize, rotate. Round 41 (multi-object performance):
  // every frame publishes a LOCAL preview list only — the document and the history receive exactly
  // ONE commit on pointer-up. Cancelling (pointercancel/blur/Escape) drops the preview without a
  // single write, so there is no rollback commit either. Preview objects keep the identities of the
  // untouched objects, so the memoized views re-render only the objects that actually move.
  // ---------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!gesture) return;

    const publishPreview = (objects: PresentSceneObject[]) => {
      sceneGesturePreviewRef.current = objects;
      setSceneGesturePreview(objects);
    };

    const applyPointerPosition = (clientX: number, clientY: number) => {
      const rect = slideCanvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      // PR-005: a click is not a drag. Before the pointer has travelled past the threshold nothing
      // is shown; once crossed, `gestureMovedRef` keeps the drag alive even if the pointer returns
      // below the threshold, because the document may already follow it on release.
      if (!gestureMovedRef.current) {
        const travelled = Math.hypot(clientX - gesture.startClientX, clientY - gesture.startClientY);
        if (travelled < PRESENT_GESTURE_DRAG_THRESHOLD_PX) return;
        gestureMovedRef.current = true;
      }
      const dx = ((clientX - gesture.startClientX) / rect.width) * 100;
      const dy = ((clientY - gesture.startClientY) / rect.height) * 100;
      const startObjects = gesture.startObjects;

      if (gesture.mode === 'rotate') {
        const centre = toPercent(gesture.centreClientX, gesture.centreClientY);
        const now = toPercent(clientX, clientY);
        if (!centre || !now) return;
        const angleNow = (Math.atan2(now.y - centre.y, (now.x - centre.x) * aspect) * 180) / Math.PI;
        // Absolute rotation against the gesture-start snapshot: a dropped frame can never
        // accumulate error, which an incremental "+delta since last move" would.
        publishPreview(rotatePresentSelection(startObjects, gesture.selection, angleNow - gesture.startAngleDeg).objects);
        return;
      }

      if (gesture.mode === 'resize') {
        // PR-006: the grabbed handle decides which edges move (the opposite corner stays put) and
        // Shift at pointer-down locks the aspect ratio on corner handles. Absolute deltas against
        // the gesture-start snapshot keep a slow frame from accumulating error.
        publishPreview(resizePresentSelection(startObjects, [gesture.id], dx, dy, {
          corner: gesture.corner,
          shift: gesture.shift,
        }).objects);
        return;
      }

      const moved = nudgePresentSelection(startObjects, gesture.selection, dx, dy);
      // Snap the selection bounding box, then shift the whole selection by the snap delta. Snapping
      // the union (instead of one object) keeps relative offsets inside a multi-selection intact.
      const movedBounds = presentSelectionBounds(moved.objects, gesture.selection, aspect);
      const candidates = startObjects.filter(
        (object) => !gesture.selection.includes(object.id) && !object.hidden,
      );
      if (movedBounds) {
        const snapped = computePresentSnapGeometry(movedBounds, {
          candidates,
          gridPercent: showGrid ? PRESENT_GRID_PERCENT : 0,
          aspectRatio: aspect,
        });
        const snapDx = snapped.xPercent - movedBounds.xPercent;
        const snapDy = snapped.yPercent - movedBounds.yPercent;
        setSnapGuides(snapped.guides);
        if (snapDx !== 0 || snapDy !== 0) {
          publishPreview(nudgePresentSelection(moved.objects, gesture.selection, snapDx, snapDy).objects);
          return;
        }
      } else {
        setSnapGuides([]);
      }
      publishPreview(moved.objects);
    };

    /**
     * PR-005 (Round 41): an aborted gesture drops the local preview. Nothing was written to the
     * document during the drag, so there is nothing to roll back — the exact opposite of the old
     * per-frame commit design.
     */
    const rollbackActiveGesture = () => {
      frameSchedulerRef.current?.cancel('present-scene-gesture');
      sceneGesturePreviewRef.current = null;
      setSceneGesturePreview(null);
      gestureMovedRef.current = false;
    };
    const cancelGesture = () => {
      rollbackActiveGesture();
      gestureCancelRef.current = null;
      sceneGestureUnmountRollbackRef.current = null;
      setGesture(null);
      setSnapGuides([]);
    };
    // Unmount guard hook: the same drop without relying on the component still being mounted.
    sceneGestureUnmountRollbackRef.current = rollbackActiveGesture;
    gestureCancelRef.current = cancelGesture;
    const handlePointerCancel = () => cancelGesture();
    const handleWindowBlur = () => cancelGesture();

    const handlePointerMove = (event: PointerEvent) => {
      const clientX = event.clientX;
      const clientY = event.clientY;
      frameSchedulerRef.current?.schedule('present-scene-gesture', () => applyPointerPosition(clientX, clientY));
    };
    const handlePointerUp = (event: PointerEvent) => {
      frameSchedulerRef.current?.cancel('present-scene-gesture');
      applyPointerPosition(event.clientX, event.clientY);
      // Exactly one document + history commit for the whole gesture.
      const finalObjects = sceneGesturePreviewRef.current;
      if (gestureMovedRef.current && finalObjects) {
        updateSceneObjects(finalObjects, gesture.historyKey);
      }
      sceneGesturePreviewRef.current = null;
      setSceneGesturePreview(null);
      gestureMovedRef.current = false;
      sceneGestureUnmountRollbackRef.current = null;
      setGesture(null);
      setSnapGuides([]);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    // A cancelled pointer or a lost window focus must never leave dangling gesture state behind.
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      gestureCancelRef.current = null;
      frameSchedulerRef.current?.cancel('present-scene-gesture');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [gesture, slide, showGrid, aspect, toPercent, updateSceneObjects]);

  // PR-005: the editor's single keyboard owner bumps this token on Escape/dismiss. The stage rolls
  // the active gesture back; there is no second window `keydown` owner inside the canvas. Scene and
  // image gestures share the token, so Escape means the same thing for both.
  useEffect(() => {
    gestureCancelRef.current?.();
    imageGestureCancelRef.current?.();
  }, [gestureCancelToken]);

  // Image gestures use the same frame budget, the same 2 px click threshold and the same clean
  // cancel semantics as the scene-object gestures above — one behaviour, not two.
  useEffect(() => {
    if (!imageGesture) return;

    const readMeasurableRect = (): DOMRect | null => {
      const rect = slideCanvasRef.current?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0 ? rect : null;
    };
    const readGestureImage = (): PresentImageObject | undefined => (slide.images || [])
      .filter((candidate) => isPlainPresentRecord(candidate) && typeof (candidate as { id?: unknown }).id === 'string')
      .find((candidate) => candidate.id === imageGesture.id) as PresentImageObject | undefined;
    /** Destination of a move gesture (clamped exactly like the committed value). */
    const resolveMoveTarget = (clientX: number, clientY: number) => {
      const rect = readMeasurableRect();
      const image = readGestureImage();
      if (!rect || !image) return null;
      const dx = ((clientX - imageGesture.startClientX) / rect.width) * 100;
      const dy = ((clientY - imageGesture.startClientY) / rect.height) * 100;
      const maxX = Math.max(0, 100 - image.widthPercent);
      return {
        rect,
        image,
        xPercent: Math.max(0, Math.min(maxX, imageGesture.startXPercent + dx)),
        yPercent: Math.max(0, Math.min(92, imageGesture.startYPercent + dy)),
      };
    };
    /** Resize result of the gesture (pure, aspect-correct as before). */
    const resolveResizeBox = (clientX: number, clientY: number) => {
      const rect = readMeasurableRect();
      const image = readGestureImage();
      if (!rect || !image) return null;
      const dx = ((clientX - imageGesture.startClientX) / rect.width) * 100;
      const dy = ((clientY - imageGesture.startClientY) / rect.height) * 100;
      return {
        image,
        box: resizePresentImageBox(
          readPresentImageIntrinsicSize(image, aspect),
          { widthPercent: imageGesture.startWidthPercent, heightPercent: image.heightPercent ?? 18 },
          dx,
          dy,
          aspect,
          { free: imageGesture.free, maxWidthPercent: Math.max(10, 100 - image.xPercent) },
        ),
      };
    };
    /** True once the gesture crossed the 2 px click threshold. */
    const crossedDragThreshold = (clientX: number, clientY: number): boolean => {
      if (imageGestureMovedRef.current) return true;
      const travelled = Math.hypot(clientX - imageGesture.startClientX, clientY - imageGesture.startClientY);
      if (travelled < PRESENT_GESTURE_DRAG_THRESHOLD_PX) return false;
      imageGestureMovedRef.current = true;
      return true;
    };
    const applyPointerPosition = (clientX: number, clientY: number) => {
      // PR-005 (rest-2): a click on an image is not a drag. Below the threshold nothing happens.
      if (!crossedDragThreshold(clientX, clientY)) return;
      if (imageGesture.mode === 'move') {
        // Round 40: local preview only — no document write, no history entry while dragging.
        const target = resolveMoveTarget(clientX, clientY);
        if (!target) return;
        setImageDragPreview({
          id: imageGesture.id,
          dxPx: ((target.xPercent - imageGesture.startXPercent) / 100) * target.rect.width,
          dyPx: ((target.yPercent - imageGesture.startYPercent) / 100) * target.rect.height,
        });
        return;
      }
      const target = resolveResizeBox(clientX, clientY);
      if (!target) return;
      imageGestureWroteRef.current = true;
      updatePresentImage(target.image.id, target.box, imageGesture.historyKey);
    };

    /**
     * PR-005 (rest-2): the one clean end state for an aborted image gesture.
     * A resize writes while dragging, so it restores the start snapshot; a pure move wrote nothing
     * during the gesture (Round 40), so there is nothing to restore — only the local preview dies.
     */
    const rollbackActiveImageGesture = () => {
      frameSchedulerRef.current?.cancel('present-image-gesture');
      if (imageGestureWroteRef.current) {
        updatePresentImages(imageGesture.startImages, imageGesture.historyKey);
      }
      imageGestureWroteRef.current = false;
      imageGestureMovedRef.current = false;
      setImageDragPreview(null);
    };
    const cancelImageGesture = () => {
      rollbackActiveImageGesture();
      imageGestureCancelRef.current = null;
      imageGestureUnmountRollbackRef.current = null;
      setImageGesture(null);
    };
    // Unmount guard hook: the same rollback without relying on the component still being mounted.
    imageGestureUnmountRollbackRef.current = rollbackActiveImageGesture;
    imageGestureCancelRef.current = cancelImageGesture;
    const handlePointerCancel = () => cancelImageGesture();
    const handleWindowBlur = () => cancelImageGesture();

    const handlePointerMove = (event: PointerEvent) => {
      const clientX = event.clientX;
      const clientY = event.clientY;
      frameSchedulerRef.current?.schedule('present-image-gesture', () => applyPointerPosition(clientX, clientY));
    };
    const handlePointerUp = (event: PointerEvent) => {
      frameSchedulerRef.current?.cancel('present-image-gesture');
      // Round 40 (performance): while moving, only the local CSS preview followed the pointer.
      // The one document write (and with it one history entry) happens here, on release.
      if (crossedDragThreshold(event.clientX, event.clientY) && imageGesture.mode === 'move') {
        const target = resolveMoveTarget(event.clientX, event.clientY);
        if (target) {
          updatePresentImage(target.image.id, {
            xPercent: target.xPercent,
            yPercent: target.yPercent,
          }, imageGesture.historyKey);
        }
      } else {
        // Resize keeps its live write path and therefore still commits the final frame here.
        applyPointerPosition(event.clientX, event.clientY);
      }
      imageGestureWroteRef.current = false;
      imageGestureMovedRef.current = false;
      imageGestureUnmountRollbackRef.current = null;
      setImageDragPreview(null);
      setImageGesture(null);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    // A cancelled pointer or a lost window focus must end in this one clean state: frame cancelled,
    // listeners removed, any already-written geometry rolled back.
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      imageGestureCancelRef.current = null;
      frameSchedulerRef.current?.cancel('present-image-gesture');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [imageGesture, slide]);

  // ---------------------------------------------------------------------------------------------
  // PR-007: freeform shape drawing. The document is written exactly once — on pointer-up. The
  // preview during the drag is computed by the same pure function as the committed geometry, so
  // "what you drew" and "what got saved" cannot diverge.
  // ---------------------------------------------------------------------------------------------
  const shapeDrawingActive = shapeDraft !== null;
  useEffect(() => {
    if (!shapeDrawingActive) return;
    const handlePointerMove = (event: PointerEvent) => {
      const draft = shapeDraftRef.current;
      if (!draft) return;
      const point = toPercent(event.clientX, event.clientY);
      if (!point) return;
      const next: PresentShapeDraft = {
        ...draft,
        current: { xPercent: point.x, yPercent: point.y },
        shiftKey: event.shiftKey || draft.shiftKey,
      };
      shapeDraftRef.current = next;
      setShapeDraft(next);
    };
    const finishShapeDraft = (event: PointerEvent | null) => {
      const draft = shapeDraftRef.current;
      if (!draft) return;
      shapeDraftRef.current = null;
      setShapeDraft(null);
      // pointercancel (or a disarmed tool) ends the gesture without writing anything.
      if (!event) return;
      // `toPercent` speaks `{ x, y }`; the pure drawing rule speaks slide percent keys. Convert
      // explicitly instead of relying on a structural match that would silently produce NaN.
      const release = toPercent(event.clientX, event.clientY);
      const end = release ? { xPercent: release.x, yPercent: release.y } : draft.current;
      const drawing = presentShapeDragDrawing(draft.shape, draft.start, end, {
        shift: event.shiftKey || draft.shiftKey,
        aspectRatio: aspect,
      });
      onShapeDrawnRef.current?.(draft.shape, drawing);
    };
    const handlePointerUp = (event: PointerEvent) => finishShapeDraft(event);
    const handlePointerCancel = () => finishShapeDraft(null);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerCancel, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [shapeDrawingActive, aspect]);

  // Escape (or any editor-side disarm) cancels an in-flight draw: the draft disappears and the
  // pointer-up listener above is removed, so no object can be committed afterwards.
  useEffect(() => {
    if (shapeDrawTool || !shapeDraftRef.current) return;
    shapeDraftRef.current = null;
    setShapeDraft(null);
  }, [shapeDrawTool]);

  // ---------------------------------------------------------------------------------------------
  // Marquee: dragging on empty canvas area selects every visible object the rubber band touches.
  // The marquee only *reads*: the document is written once on pointer-up, so an abandoned drag
  // never leaves a half-selection behind.
  // ---------------------------------------------------------------------------------------------
  const marqueeRect: PresentPercentRect | null = marquee
    ? rectFromCorners(
        { xPercent: marquee.start.x, yPercent: marquee.start.y },
        { xPercent: marquee.current.x, yPercent: marquee.current.y },
      )
    : null;

  const marqueeHits = (rect: PresentPercentRect): string[] =>
    presentObjectsInMarquee(sceneObjects, rect, aspect).map((object) => object.id);

  /** PR-007: preview geometry for the current draft — same function the commit uses. */
  const shapeDraftPreview: PresentShapeDrawing | null = shapeDraft
    ? presentShapeDragDrawing(shapeDraft.shape, shapeDraft.start, shapeDraft.current, {
        shift: shapeDraft.shiftKey,
        aspectRatio: aspect,
      })
    : null;

  /**
   * PR-010 (M1 keyboard-only): the canvas is a real keyboard widget.
   *
   * Enter/Space places the armed insert tool (the editor calls the same factories the pointer path
   * uses). Escape disarms through the editor's single keyboard owner, Tab inside the stage keeps
   * cycling the selection, and every scene object stays reachable by the normal browser Tab order
   * because focus traversal outside the stage is no longer swallowed.
   */
  const handleStageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Only the canvas itself: a focused scene object keeps its own Enter/Space semantics.
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!armedTool && !shapeDrawTool) return;
    event.preventDefault();
    onKeyboardPlaceArmedTool?.();
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-present-object="true"]')) return;
    if (target.closest('input, textarea, select, button, a')) return;
    const point = toPercent(event.clientX, event.clientY);
    if (!point) return;
    // PR-007: the armed shape tool wins over marquee and text placement. Nothing is written here:
    // the whole draft stays transient until pointer-up commits exactly one object.
    if (shapeDrawTool) {
      event.preventDefault();
      const draft: PresentShapeDraft = {
        shape: shapeDrawTool,
        start: { xPercent: point.x, yPercent: point.y },
        current: { xPercent: point.x, yPercent: point.y },
        shiftKey: event.shiftKey,
      };
      shapeDraftRef.current = draft;
      setShapeDraft(draft);
      return;
    }
    // An armed insert tool wins over marquee: the user explicitly asked to place an object.
    if (armedTool && onCanvasClick) {
      event.preventDefault();
      onCanvasClick({ xPercent: point.x, yPercent: point.y });
      return;
    }
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    setMarquee({ start: point, current: point });
    const onMove = (moveEvent: PointerEvent) => {
      const next = toPercent(moveEvent.clientX, moveEvent.clientY);
      if (next) setMarquee((current) => (current ? { ...current, current: next } : current));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      setMarquee((current) => {
        if (!current) return null;
        const rect = rectFromCorners(
          { xPercent: current.start.x, yPercent: current.start.y },
          { xPercent: current.current.x, yPercent: current.current.y },
        );
        if (rect.widthPercent <= 0.5 && rect.heightPercent <= 0.5) {
          // A plain click on empty space: clear the selection (unless a modifier keeps it).
          if (!additive) onSelectSceneObjects([]);
          return null;
        }
        const inside = marqueeHits(rect);
        const merged = additive
          ? [...selectedSceneObjectIds, ...inside.filter((id) => !selectedSceneObjectIds.includes(id))]
          : inside;
        onSelectSceneObjects(merged);
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const startSceneGesture = useCallback((
    event: React.PointerEvent,
    object: PresentSceneObject,
    mode: PresentObjectGestureMode,
    corner?: PresentObjectGestureCorner,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    // Shift/Ctrl/Cmd are selection modifiers for a *click* (move gesture) only. On the transform
    // handles Shift is the aspect-lock modifier; treating it as additive selection would toggle the
    // very object off whose handles are being dragged.
    const additive = mode === 'move' && (event.shiftKey || event.ctrlKey || event.metaKey);
    if (event.altKey && mode === 'move') {
      // Alt-click cycles one step down the stack at the *clicked point*, which is the only pointer
      // path to an object that is completely covered by another one. No gesture is started, because
      // the gesture would otherwise belong to the previously selected object.
      const point = toPercent(event.clientX, event.clientY);
      const next = point
        ? pickPresentObjectInStack(sceneObjects, { xPercent: point.x, yPercent: point.y }, object.id, aspect)
        : null;
      onSelectSceneObjects([next?.id ?? object.id]);
      onPresenceObjectChange?.(next?.id ?? object.id);
      onSelectImage(null);
      return;
    }
    /**
     * Round 19 (multi-selection coherence): the pointer-down must not commit the same selection
     * change the following click commits.
     *
     * Measured before: a Shift+click added the object on pointer-down and the click handler toggled
     * it out again (two toggles, one selection change); and dragging a member of a multi-selection
     * instantly collapsed the selection to that object. Rules now:
     *   - additive (Shift/Ctrl/Cmd): the click owns the toggle — pointer-down only prepares the
     *     gesture selection below;
     *   - plain press: select only when the object is not already selected, so dragging a group
     *     member keeps the group; a plain click still collapses to the clicked object via onClick.
     */
    const alreadySelected = selectedSceneObjectIds.includes(object.id);
    if (!additive && !alreadySelected) {
      onSelectSceneObject(object.id, additive);
    }
    onPresenceObjectChange?.(object.id);
    onSelectImage(null);
    if (object.locked) return;
    const rect = slideCanvasRef.current?.getBoundingClientRect();
    const centreClientX = rect ? rect.left + ((object.xPercent + object.widthPercent / 2) / 100) * rect.width : event.clientX;
    const centreClientY = rect ? rect.top + ((object.yPercent + object.heightPercent / 2) / 100) * rect.height : event.clientY;
    const startAngleDeg = (Math.atan2(event.clientY - centreClientY, (event.clientX - centreClientX) * 1) * 180) / Math.PI;
    const selection = additive
      ? [...selectedSceneObjectIds.filter((id) => id !== object.id), object.id]
      : selectedSceneObjectIds.includes(object.id)
        ? [...selectedSceneObjectIds]
        : [object.id];
    // PR-005: every new gesture starts below the click threshold and writes nothing until moved.
    gestureMovedRef.current = false;
    setGesture({
      id: object.id,
      mode,
      // No corner given (move/rotate, or an older caller): fall back to the historical 'se' resize.
      corner: corner ?? 'se',
      shift: event.shiftKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startObjects: sceneObjects,
      selection: selection.length ? selection : [object.id],
      startAngleDeg,
      centreClientX,
      centreClientY,
      historyKey: `scene-${mode}-${object.id}-${crypto.randomUUID()}`,
    });
  }, [aspect, onPresenceObjectChange, onSelectImage, onSelectSceneObject, onSelectSceneObjects, sceneObjects, selectedSceneObjectIds, toPercent]);

  const selectedSceneObject = sceneObjects.find((o) => o.id === primaryId);

  const handleAddBullet = () => {
    onUpdateSlide({
      ...slide,
      bulletPoints: [...(slide.bulletPoints || []), 'New bullet point — click to customize'],
    });
  };

  const handleUpdateBullet = (idx: number, text: string) => {
    if (!slide.bulletPoints) return;
    const next = [...slide.bulletPoints];
    next[idx] = text;
    onUpdateSlide({ ...slide, bulletPoints: next });
  };

  const handleDeleteBullet = (idx: number) => {
    if (!slide.bulletPoints) return;
    onUpdateSlide({ ...slide, bulletPoints: slide.bulletPoints.filter((_, i) => i !== idx) });
  };

  // Drag-and-drop intake. A rejected drop says why; it never silently disappears.
  const handleSlideDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDropMessage(null);
    const files = Array.from(event.dataTransfer.files) as File[];
    if (!files.length) {
      setDropMessage('Nothing was dropped: this slide accepts image files (PNG, JPEG, WebP).');
      return;
    }
    const file = files.find((candidate) => candidate.type.startsWith('image/'));
    if (!file) {
      setDropMessage(`"${files[0].name}" is not an image. Slides accept PNG, JPEG or WebP.`);
      return;
    }
    const point = toPercent(event.clientX, event.clientY);
    onInsertImageFile(file, point?.x ?? 50, point?.y ?? 50);
  };

  // Fabric chart object
  const directChart = embeddedObjects.find((obj) => obj.type === 'Chart');
  const chartReference = embeddedObjects.find(
    (obj) => obj.type === 'WorkspaceReference' && obj.data.cached_snapshot?.type === 'Chart',
  );
  const chartObj = directChart?.type === 'Chart'
    ? directChart
    : chartReference?.type === 'WorkspaceReference' && chartReference.data.cached_snapshot?.type === 'Chart'
      ? chartReference.data.cached_snapshot
      : undefined;
  const liveTableReference = embeddedObjects.find((obj) => Boolean(tableFromWorkspaceReference(obj)));

  const aspectClass =
    aspectRatio === '16:10'
      ? 'aspect-[16/10]'
      : aspectRatio === '4:3'
      ? 'aspect-[4/3]'
      : aspectRatio === 'A4'
      ? 'aspect-[1.414/1]'
      : 'aspect-video';

  const twoColumn = splitPresentTwoColumn(presentSlideCards(slide));

  // Paket 15: the slide itself must report "updated" or "offline" for its live links. The state comes
  // from the pure resolver, so the badge and the aria text can never disagree.
  const liveLinkStatuses = sceneObjects
    .filter((object): object is Extract<PresentSceneObject, { kind: 'workspace' }> => object.kind === 'workspace')
    .map((object) => linkStatusByObjectId[object.id])
    .filter((status): status is PresentLinkStatus => Boolean(status));
  const linkAttentionCount = liveLinkStatuses.filter((status) => status.attention).length;
  const linkLiveCount = liveLinkStatuses.filter((status) => status.state !== 'frozen').length;

  useEffect(() => {
    onSlideLinkSummary?.({ attentionCount: linkAttentionCount, liveCount: linkLiveCount });
  }, [linkAttentionCount, linkLiveCount, onSlideLinkSummary]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        className="flex-1 flex items-center justify-center p-4 md:p-8 overflow-auto select-none"
        onClick={() => {
          onSelectSceneObjects([]);
          onSelectImage(null);
          onPresenceObjectChange?.(null);
        }}
      >
      <div
        ref={slideCanvasRef}
        data-present-stage="true"
        // PR-010 (M1 keyboard-only): the stage is focusable so Enter/Space can place an armed insert
        // tool without a mouse; Tab (from a toolbar button) lands here in the natural focus order.
        // Tab/Shift+Tab cycle the object selection and leave the canvas at the ends of the order.
        tabIndex={0}
        role="region"
        aria-label="Slide canvas — Tab and Shift+Tab cycle objects (Tab at the last object leaves the canvas), Enter places the armed tool, F2 edits text"
        onKeyDown={handleStageKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={workspaceDropZone ? () => workspaceDropZone.onDragLeave() : undefined}
        onDrop={(event) => {
          // **Zuerst unser Träger.** `handleSlideDrop` würde einen Workspace-Drop als „kein Bild" melden
          // und mit `stopPropagation` die Ablagefläche verstummen lassen — *zwei Antworten auf eine
          // Ablage wären eine davon zu viel.*
          if (workspaceDropZone && hasPresentWorkspaceDropTransfer(Array.from(event.dataTransfer?.types ?? []))) {
            workspaceDropZone.onDrop(event);
            return;
          }
          handleSlideDrop(event);
        }}
        onPointerDown={handleCanvasPointerDown}
        onDoubleClick={(event) => {
          // PR-007: a double click while the shape tool is armed belongs to the draw gesture.
          if (shapeDrawTool) return;
          const target = event.target as HTMLElement;
          if (target.closest('[data-present-object="true"], input, textarea, select, button, a')) return;
          const point = toPercent(event.clientX, event.clientY);
          if (point) onRequestTextAt?.({ xPercent: point.x, yPercent: point.y });
        }}
        data-present-armed-tool={armedTool ?? undefined}
        data-present-shape-tool={shapeDrawTool ?? undefined}
        className={`w-full max-w-5xl ${aspectClass} rounded-2xl border ${
          shapeDrawTool
            ? 'border-emerald-400/70 cursor-crosshair'
            : armedTool
              ? 'border-cyan-400/70 cursor-text'
              : 'border-white/[0.12]'
        } shadow-2xl p-8 md:p-12 flex flex-col justify-between relative overflow-hidden group transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70`}
        style={{
          // Round 41: slide background = solid colour, authored gradient or an authored background
          // image (data URL, size-limited). It paints below every object because the scene/object
          // layers are positioned above it.
          ...presentSlideBackgroundCss(slide, design.backgroundColor, (slide as { backgroundGradient?: { type: 'linear' | 'radial'; from: string; to: string; angle?: number } | null }).backgroundGradient ?? null),
          fontFamily: design.fontFamily,
          opacity: transitionPreviewStyle.opacity,
          transform: transitionPreviewStyle.transform,
          clipPath: transitionPreviewStyle.clipPath,
        }}
      >
        {/* **Paket 10:** die Ablagefläche — **innerhalb** des Folienrahmens, damit ihre Prozente die
            Prozente der Folie sind (und damit bei jedem Zoom an derselben Stelle). */}
        {workspaceDropZone && (
          <PresentWorkspaceDropZoneOverlay
            state={workspaceDropZone.state}
            onConfirm={workspaceDropZone.onConfirm}
            onDismiss={workspaceDropZone.onDismiss}
            onChooseIntent={workspaceDropZone.onChooseIntent}
          />
        )}

        {/* Visible ruler grid: a state that does not rely on colour alone (it is a pattern). */}
        {showGrid && (
          <div
            data-present-grid="true"
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-25"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(148,163,184,0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.55) 1px, transparent 1px)',
              backgroundSize: `${PRESENT_GRID_PERCENT}% ${PRESENT_GRID_PERCENT}%`,
            }}
          />
        )}

        {/* Smart guides: exactly the guides the snap resolver returned, so position and line agree. */}
        {snapGuides.map((guide, index) =>
          guide.axis === 'x' ? (
            <div
              key={`snap-x-${index}`}
              data-present-snap-guide={`x:${guide.kind}`}
              className={`absolute top-0 bottom-0 w-px z-50 pointer-events-none ${guide.kind === 'slide-center' ? 'bg-cyan-300' : 'bg-fuchsia-400'}`}
              style={{ left: `${guide.positionPercent}%` }}
            />
          ) : (
            <div
              key={`snap-y-${index}`}
              data-present-snap-guide={`y:${guide.kind}`}
              className={`absolute left-0 right-0 h-px z-50 pointer-events-none ${guide.kind === 'slide-center' ? 'bg-cyan-300' : 'bg-fuchsia-400'}`}
              style={{ top: `${guide.positionPercent}%` }}
            />
          ),
        )}

        {/* Marquee rubber band */}
        {marqueeRect && marquee && (
          <div
            data-present-marquee="true"
            className="absolute z-40 border border-cyan-400 bg-cyan-400/10 pointer-events-none"
            style={{
              left: `${marqueeRect.xPercent}%`,
              top: `${marqueeRect.yPercent}%`,
              width: `${marqueeRect.widthPercent}%`,
              height: `${marqueeRect.heightPercent}%`,
            }}
          />
        )}

        {/* PR-007: live draft of the shape being drawn. It disappears on pointer-up, when the
            committed object takes its place with exactly this geometry. Round 40 (single-shot): the
            overlay belongs to the armed tool only — after a commit the editor disarms and the
            overlay is gone, so the next pointer-down on the new shape starts a MOVE gesture. */}
        {shapeDrawTool && shapeDraft && shapeDraftPreview && (
          <PresentShapeDrawOverlay shape={shapeDraft.shape} drawing={shapeDraftPreview} />
        )}

        {/* Scene Objects (Round 41: during a gesture the local preview list is rendered instead of
            the document; untouched objects keep their identity so only the moved ones re-render) */}
        {sortPresentLayers(sceneGesturePreview ?? sceneObjects).map((object) => (
          <PresentSceneObjectView
            key={object.id}
            object={object}
            isSelected={selectedIds.includes(object.id)}
            isPrimary={primaryId === object.id}
            selectionSize={selectionSize}
            onSelect={handleObjectSelect}
            onPatch={patchSceneObject}
            onStartGesture={startSceneGesture}
            canvasHeight={slideCanvasRef.current?.clientHeight || 500}
            animationPreviewStyle={animationStyleForTarget(object.id)}
            animationPreviewAnimations={previewAnimations}
            animationPreviewProgress={animationPreview?.progressByAnimationId}
            autoFocusText={focusRequestId === object.id}
            onAutoFocusHandled={onFocusHandled}
            textEditing={textEditingObjectId === object.id}
            onRequestTextEdit={onRequestTextEdit}
            onEndTextEdit={onEndTextEdit}
            linkStatus={linkStatusByObjectId[object.id] ?? null}
            stylePreview={stylePreviewById?.[object.id]}
          />
        ))}

        {/* Floating Images */}
        {(slide.images || [])
          .filter((image) => isPlainPresentRecord(image) && typeof (image as { id?: unknown }).id === 'string')
          .map((image) => (
          <PresentFloatingImageView
            key={image.id}
            image={image}
            selected={selectedImageId === image.id}
            moving={imageGesture?.id === image.id && imageGesture.mode === 'move'}
            dragPreview={imageDragPreview?.id === image.id ? imageDragPreview : undefined}
            animationStyle={animationStyleForTarget(image.id)}
            onSelect={(id) => {
              onSelectImage(id);
              if (id) onSelectSceneObjects([]);
            }}
            onPresenceObjectChange={onPresenceObjectChange}
            onPatch={(id, patch) => updatePresentImage(id, patch)}
            onRemove={(id) => onUpdateSlide({ ...slide, images: (slide.images || []).filter((candidate) => !isPlainPresentRecord(candidate) || candidate.id !== id) })}
            onStartGesture={(event, target, mode) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectImage(target.id);
              onPresenceObjectChange?.(target.id);
              onSelectSceneObjects([]);
              // PR-005 (rest-2): every image gesture starts below the click threshold; the image
              // array snapshot is the rollback state for a cancelled gesture.
              imageGestureMovedRef.current = false;
              imageGestureWroteRef.current = false;
              setImageDragPreview(null);
              setImageGesture({
                id: target.id,
                mode,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startXPercent: target.xPercent,
                startYPercent: target.yPercent,
                startWidthPercent: target.widthPercent,
                free: event.shiftKey,
                startImages: [...(slide.images || [])],
                historyKey: `image-${mode}-${target.id}-${crypto.randomUUID()}`,
              });
            }}
          />
        ))}

        {/* Legacy header: rendered only when the document really stores legacy content (title,
            subtitle, category or cards). A new blank slide stays a clean surface — no empty
            placeholder inputs, and no schema change: the fields are read, never invented.
            Round 40 (P0 shape dragging): the content layers sit at z-0, **below** every scene object
            (they used to be z-10 and were painted — and hit-tested — above shapes whose default
            zIndex is 10; text worked because it defaults to 20). */}
        {hasLegacyHeaderContent && (
          <div data-present-legacy-header="true" className="relative z-0 space-y-1">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={slide.category ?? slide.categoryTag ?? ''}
                onChange={(e) => onUpdateSlide({ ...slide, category: e.target.value, categoryTag: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                placeholder="Category tag..."
                className="text-[0.625rem] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 focus:outline-none w-52 select-text"
              />
            </div>

            <input
              type="text"
              value={slide.title ?? ''}
              onChange={(e) => onUpdateSlide({ ...slide, title: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="Slide Title..."
              style={{ color: design.titleColor, ...animationStyleForTarget('slide-title') }}
              className="w-full text-2xl md:text-3xl font-black tracking-tight bg-transparent border-b border-transparent hover:border-white/10 focus:border-blue-500/50 outline-none py-0.5 select-text"
            />

            <input
              type="text"
              value={slide.subtitle ?? ''}
              onChange={(e) => onUpdateSlide({ ...slide, subtitle: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="Slide Subtitle..."
              style={{ color: design.bodyColor, ...animationStyleForTarget('slide-subtitle') }}
              className="w-full text-xs md:text-sm font-medium bg-transparent border-b border-transparent hover:border-white/10 focus:border-blue-500/50 outline-none py-0.5 select-text"
            />
          </div>
        )}

        {/* Slide Body Content */}
        <div className={`relative z-0 flex-1 my-4 flex items-center justify-center w-full ${hasWorkspaceReferences ? 'pr-[30%]' : ''}`}>
          {/* CARDS */}
          {slide.layout === 'cards' && <PresentCardsLayout slide={slide} onUpdateSlide={onUpdateSlide} animationStyleForTarget={animationStyleForTarget} design={design} />}

          {/* TWO CONTENT (split): two side-by-side columns from one bounded card list */}
          {slide.layout === 'split' && (
            <div data-present-layout="split" className="grid w-full max-w-2xl grid-cols-2 gap-4">
              {(['left', 'right'] as const).map((column) => (
                <div key={column} className="space-y-2 rounded-xl border border-white/10 bg-slate-900/50 p-3">
                  <div className="text-[0.625rem] font-bold uppercase tracking-wider" style={{ color: design.bodyColor }}>
                    {column === 'left' ? 'Column 1' : 'Column 2'}
                  </div>
                  {(column === 'left' ? twoColumn.left : twoColumn.right).map((card) => (
                    <div key={card.id} className="rounded-lg border p-2" style={{ borderColor: `${design.bodyColor}33`, backgroundColor: design.backgroundColor }}>
                      <input
                        value={card.title}
                        onChange={(event) =>
                          onUpdateSlide({
                            ...slide,
                            cards: (slide.cards || []).map((candidate) =>
                              candidate.id === card.id ? { ...candidate, title: event.target.value } : candidate,
                            ),
                          })
                        }
                        onClick={(event) => event.stopPropagation()}
                        className="w-full bg-transparent text-[0.6875rem] font-semibold text-slate-100 outline-none select-text"
                      />
                      <textarea
                        value={card.description}
                        onChange={(event) =>
                          onUpdateSlide({
                            ...slide,
                            cards: (slide.cards || []).map((candidate) =>
                              candidate.id === card.id ? { ...candidate, description: event.target.value } : candidate,
                            ),
                          })
                        }
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1 h-16 w-full resize-none bg-transparent text-[0.625rem] outline-none select-text" style={{ color: design.bodyColor }}
                      />
                    </div>
                  ))}
                  {(column === 'left' ? twoColumn.left : twoColumn.right).length === 0 && (
                    <div className="rounded-lg border border-dashed border-white/15 p-3 text-center text-[0.625rem] text-slate-500">
                      Empty column
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* BULLETS */}
          {slide.layout === 'bullet-list' && (
            <div className="w-full max-w-xl space-y-2">
              {(slide.bulletPoints || []).map((bullet, bIdx) => (
                <div key={bIdx} className="flex items-center space-x-2.5 p-2 rounded-xl border group/bullet" style={{ backgroundColor: design.surfaceColor, borderColor: `${design.bodyColor}33` }}>
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                  <input
                    type="text"
                    value={bullet ?? ''}
                    onChange={(e) => handleUpdateBullet(bIdx, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-xs text-slate-200 bg-transparent outline-none py-0.5 select-text"
                  />
                  <button aria-label="Delete bullet"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBullet(bIdx);
                    }}
                    className="opacity-0 group-hover/bullet:opacity-100 text-slate-500 hover:text-red-400 p-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddBullet}
                className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-blue-600/20 text-xs text-blue-300 hover:bg-blue-600/30"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Bullet Point</span>
              </button>
            </div>
          )}

          {/* CHART */}
          {slide.layout === 'chart' && (
            <div className="w-full max-w-xl">
              {chartObj && chartObj.type === 'Chart' ? (
                <ChartRenderer chart={chartObj.data} />
              ) : liveTableReference ? (
                <GridLiveReferenceCard object={liveTableReference} />
              ) : (
                <div className="p-8 rounded-xl border text-center text-xs space-y-2" style={{ backgroundColor: design.surfaceColor, borderColor: `${design.bodyColor}33`, color: design.bodyColor }}>
                  <BarChart3 className="w-8 h-8 mx-auto text-blue-400" />
                  <p>Live Workspace Fabric Data Connected</p>
                </div>
              )}
            </div>
          )}

          {/* BLANK: the restrained hint of a genuinely empty slide. It disappears as soon as the
              document carries legacy header content, so "Blank Canvas" never contradicts a title. */}
          {slide.layout === 'blank' && !hasLegacyHeaderContent && !hasCanvasContent && (
            <div
              data-present-blank-hint="true"
              data-present-layout="blank"
              className="pointer-events-none w-full h-32 flex items-center justify-center border-2 border-dashed rounded-xl text-xs"
              style={{
                borderColor: `${design.bodyColor}55`,
                color: design.bodyColor,
                opacity: 0.8,
              }}
            >
              <span>Blank Canvas · Insert Text, Shapes, Diagrams, or Widgets above</span>
            </div>
          )}
        </div>

        {/* Footer: authored on the slide master (text/visibility/alignment). Round 41 removed the
            second hardcoded branding line — nothing here is unchangeable display text anymore. */}
        {design.showFooter && (
          <div
            data-present-footer="true"
            data-present-footer-position={design.footerPosition}
            className={`relative z-0 border-t border-white/10 pt-3 flex items-center text-[0.625rem] font-mono ${
              design.footerPosition === 'center' ? 'justify-center' : design.footerPosition === 'right' ? 'justify-end' : 'justify-start'
            }`}
            style={{ color: design.bodyColor }}
          >
            <span data-present-footer-text="true">{design.footerText}</span>
          </div>
        )}
      </div>
      </div>

      {/* Live region outside the slide so it never covers slide content and is always readable.
          Every state here is text, so it is distinguishable without colour. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-slate-950 px-4 py-1 text-[0.625rem] font-mono">
        <span data-present-selection-status="true" aria-live="polite" className="text-slate-300">
          {selectionSize === 0
            ? 'No object selected'
            : selectionSize === 1
              ? `${selectedSceneObject?.kind ?? 'object'} selected · arrows move, Alt+arrows resize, [ ] rotate, Delete removes`
              : `${selectionSize} objects selected · arrows move the group, Alt+arrows resize, [ ] rotate, Ctrl+G groups`}
        </span>
        <div className="flex items-center gap-2">
          {shapeDrawTool && (
            <span
              data-present-shape-tool-status="armed"
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200"
            >
              {shapeDrawTool} tool armed · drag to draw, click for the default size, Escape cancels
            </span>
          )}
          {linkLiveCount > 0 && (
            <span
              data-present-link-summary={linkAttentionCount > 0 ? 'attention' : 'ok'}
              className={`rounded border px-1.5 py-0.5 ${
                linkAttentionCount > 0 ? 'border-amber-500/40 bg-amber-500/15 text-amber-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              }`}
            >
              {linkAttentionCount > 0
                ? `${linkLiveCount} live link(s), ${linkAttentionCount} need attention (offline/stale)`
                : `${linkLiveCount} live link(s), up to date`}
            </span>
          )}
          {dropMessage && (
            <span role="alert" data-present-drop-error="true" className="rounded bg-red-950/90 px-1.5 py-0.5 text-red-200">
              {dropMessage}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowGrid((value) => !value)}
            aria-pressed={showGrid}
            aria-label={showGrid ? 'Hide grid and grid snapping' : 'Show grid and enable grid snapping'}
            data-present-grid-toggle={showGrid ? 'on' : 'off'}
            className={`rounded border px-1.5 py-0.5 ${showGrid ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-white/10 text-slate-400'}`}
          >
            <Grid3x3 className="mr-1 inline h-3 w-3" />
            Grid {showGrid ? 'on (1 %)' : 'off'}
          </button>
        </div>
      </div>
    </div>
  );
};
