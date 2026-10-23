// STATUS: PLATIN
// Pointer-event ink controller. History and active gestures are scoped to one Whiteboard document.

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { WhiteboardInkPoint, WhiteboardInkPreset } from '../../../shared/contracts/workspace';
import type { WhiteboardInteractionTool, WhiteboardItem } from '../types';
import {
  appendInkDraftPoint,
  applyWhiteboardInkHistoryEntry,
  createInkDraft,
  createWhiteboardInkHistoryEntry,
  eraseWhiteboardInk,
  finalizeInkDraft,
  inkPointFromSample,
  lassoSelectInkItems,
  translateInkItems,
  type WhiteboardInkDraft,
  type WhiteboardInkPointerSample,
} from '../model/whiteboardInkEngine';
import {
  beginWhiteboardInkGesture,
  canRedoWhiteboardInk,
  canUndoWhiteboardInk,
  commitWhiteboardInkMutation,
  completeWhiteboardInkRedo,
  completeWhiteboardInkUndo,
  createWhiteboardInkSession,
  finishWhiteboardInkGesture,
  getWhiteboardInkGestureTool,
  peekWhiteboardInkRedo,
  peekWhiteboardInkUndo,
  resetWhiteboardInkSessionForDocument,
} from './whiteboardInkSession';

interface UseWhiteboardInkOptions {
  documentId: string;
  activeTool: WhiteboardInteractionTool;
  items: WhiteboardItem[];
  updateItems: (next: WhiteboardItem[] | ((previous: WhiteboardItem[]) => WhiteboardItem[])) => boolean;
  screenToCanvasCoords: (screenX: number, screenY: number) => { x: number; y: number };
  showToast: (message: string) => void;
  setSelectedItemId: (id: string | null) => void;
}

const isInkTool = (tool: WhiteboardInteractionTool) => tool.startsWith('ink-');
const presetForTool = (tool: WhiteboardInteractionTool): WhiteboardInkPreset | null => tool === 'ink-pen' ? 'pen' : tool === 'ink-pencil' ? 'pencil' : tool === 'ink-highlighter' ? 'highlighter' : null;

export function useWhiteboardInk(options: UseWhiteboardInkOptions) {
  const [color, setColor] = useState('#60a5fa');
  const [width, setWidth] = useState(3);
  const [straightLineAssist, setStraightLineAssist] = useState(false);
  const [shapeRecognition, setShapeRecognition] = useState(false);
  const [arrowStart, setArrowStart] = useState(false);
  const [arrowEnd, setArrowEnd] = useState(false);
  const [eraserMode, setEraserMode] = useState<'point' | 'object'>('point');
  const [eraserRadius, setEraserRadius] = useState(18);
  const [draft, setDraft] = useState<WhiteboardInkDraft | null>(null);
  const [gesturePoints, setGesturePoints] = useState<WhiteboardInkPoint[]>([]);
  const [selectedInkIds, setSelectedInkIds] = useState<string[]>([]);
  const [historyRevision, setHistoryRevision] = useState(0);
  const historySession = useRef(createWhiteboardInkSession(options.documentId));
  const activePointerTarget = useRef<HTMLDivElement | null>(null);
  const setSelectedItemIdRef = useRef(options.setSelectedItemId);
  setSelectedItemIdRef.current = options.setSelectedItemId;

  const releaseActivePointerCapture = useCallback(() => {
    const pointerId = historySession.current.activePointerId;
    const target = activePointerTarget.current;
    activePointerTarget.current = null;
    if (pointerId === null || !target) return;
    try { target.releasePointerCapture(pointerId); } catch { /* capture may already be released by the UA */ }
  }, []);

  useLayoutEffect(() => {
    if (resetWhiteboardInkSessionForDocument(historySession.current, options.documentId)) {
      setDraft(null);
      setGesturePoints([]);
      setSelectedInkIds([]);
      setSelectedItemIdRef.current(null);
      setHistoryRevision((value) => value + 1);
    }
    return releaseActivePointerCapture;
  }, [options.documentId, releaseActivePointerCapture]);

  const rememberAndCommit = useCallback((before: WhiteboardItem[], next: WhiteboardItem[]) => {
    const entry = createWhiteboardInkHistoryEntry(options.documentId, before, next);
    if (!entry || historySession.current.documentId !== options.documentId) return false;
    if (!commitWhiteboardInkMutation(historySession.current, options.documentId, entry, () => options.updateItems(next))) return false;
    setHistoryRevision((value) => value + 1);
    return true;
  }, [options.documentId, options.updateItems]);

  const sampleFromPointer = useCallback((sample: PointerEvent): WhiteboardInkPointerSample => {
    const coords = options.screenToCanvasCoords(sample.clientX, sample.clientY);
    return {
      x: coords.x,
      y: coords.y,
      t: sample.timeStamp,
      pressure: sample.pressure,
      tiltX: sample.tiltX,
      tiltY: sample.tiltY,
      pointerType: sample.pointerType,
    };
  }, [options.screenToCanvasCoords]);

  const appendPointerSamples = useCallback((event: ReactPointerEvent<HTMLDivElement>, apply: (sample: WhiteboardInkPointerSample) => void) => {
    const native = event.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native];
    for (const sample of coalesced) apply(sampleFromPointer(sample));
  }, [sampleFromPointer]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const { documentId, activeTool } = options;
    if (!isInkTool(activeTool) || historySession.current.documentId !== documentId || historySession.current.activePointerId !== null) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { return; }
    if (!beginWhiteboardInkGesture(historySession.current, documentId, event.pointerId, activeTool)) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture may already be released by the UA */ }
      return;
    }
    activePointerTarget.current = event.currentTarget;
    const first = sampleFromPointer(event.nativeEvent);
    if (activeTool === 'ink-lasso' || activeTool === 'ink-eraser') {
      setGesturePoints([inkPointFromSample(first)]);
      if (activeTool === 'ink-lasso') setSelectedInkIds([]);
      return;
    }
    const preset = presetForTool(activeTool);
    if (!preset) return;
    setDraft(createInkDraft(preset, first, color, width, arrowStart, arrowEnd));
  }, [arrowEnd, arrowStart, color, options, sampleFromPointer, width]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gestureTool = getWhiteboardInkGestureTool(historySession.current, options.documentId, event.pointerId);
    if (!gestureTool) return;
    event.preventDefault();
    if (gestureTool === 'ink-lasso' || gestureTool === 'ink-eraser') {
      appendPointerSamples(event, (sample) => setGesturePoints((points) => [...points, inkPointFromSample(sample)].slice(-4096)));
      return;
    }
    appendPointerSamples(event, (sample) => setDraft((current) => current ? appendInkDraftPoint(current, sample) : current));
  }, [appendPointerSamples, options.documentId]);

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const gestureTool = finishWhiteboardInkGesture(historySession.current, options.documentId, event.pointerId);
    if (!gestureTool) return;
    event.preventDefault();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture may already be released by the UA */ }
    if (activePointerTarget.current === event.currentTarget) activePointerTarget.current = null;
    if (gestureTool === 'ink-lasso') {
      const ids = lassoSelectInkItems(options.items, gesturePoints);
      setSelectedInkIds(ids);
      options.setSelectedItemId(ids[0] ?? null);
      setGesturePoints([]);
      options.showToast(ids.length ? `Lasso selected ${ids.length} ink stroke${ids.length === 1 ? '' : 's'}.` : 'Lasso selection is empty.');
      return;
    }
    if (gestureTool === 'ink-eraser') {
      const next = eraseWhiteboardInk(options.items, gesturePoints, eraserRadius, eraserMode);
      const changed = rememberAndCommit(options.items, next);
      setGesturePoints([]);
      setSelectedInkIds([]);
      if (changed) options.showToast(eraserMode === 'object' ? 'Object eraser gesture committed.' : 'Point eraser gesture committed.');
      return;
    }
    if (draft) {
      const item = finalizeInkDraft(draft, { straightLine: straightLineAssist || event.shiftKey, recognizeShape: shapeRecognition });
      setDraft(null);
      if (item && rememberAndCommit(options.items, [...options.items, item])) {
        options.setSelectedItemId(item.id);
        setSelectedInkIds([item.id]);
      }
    }
  }, [draft, eraserMode, eraserRadius, gesturePoints, options, rememberAndCommit, shapeRecognition, straightLineAssist]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!finishWhiteboardInkGesture(historySession.current, options.documentId, event.pointerId)) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture may already be released by the UA */ }
    if (activePointerTarget.current === event.currentTarget) activePointerTarget.current = null;
    setDraft(null);
    setGesturePoints([]);
  }, [options.documentId]);

  const undoInk = useCallback(() => {
    const entry = peekWhiteboardInkUndo(historySession.current, options.documentId);
    if (!entry) return;
    const next = applyWhiteboardInkHistoryEntry(options.items, options.documentId, entry, 'undo');
    if (!options.updateItems(next)) return;
    if (!completeWhiteboardInkUndo(historySession.current, options.documentId, entry)) return;
    setSelectedInkIds([]);
    options.setSelectedItemId(null);
    setHistoryRevision((value) => value + 1);
  }, [options.documentId, options.items, options.setSelectedItemId, options.updateItems]);

  const redoInk = useCallback(() => {
    const entry = peekWhiteboardInkRedo(historySession.current, options.documentId);
    if (!entry) return;
    const next = applyWhiteboardInkHistoryEntry(options.items, options.documentId, entry, 'redo');
    if (!options.updateItems(next)) return;
    if (!completeWhiteboardInkRedo(historySession.current, options.documentId, entry)) return;
    setSelectedInkIds([]);
    options.setSelectedItemId(null);
    setHistoryRevision((value) => value + 1);
  }, [options.documentId, options.items, options.setSelectedItemId, options.updateItems]);

  const deleteInkSelection = useCallback(() => {
    if (historySession.current.documentId !== options.documentId || !selectedInkIds.length) return;
    const ids = new Set(selectedInkIds);
    if (rememberAndCommit(options.items, options.items.filter((item) => !ids.has(item.id)))) {
      setSelectedInkIds([]);
      options.setSelectedItemId(null);
    }
  }, [options.documentId, options.items, options.setSelectedItemId, rememberAndCommit, selectedInkIds]);

  const moveInkSelection = useCallback((dx: number, dy: number) => {
    if (historySession.current.documentId !== options.documentId || !selectedInkIds.length) return;
    rememberAndCommit(options.items, translateInkItems(options.items, new Set(selectedInkIds), dx, dy));
  }, [options.documentId, options.items, rememberAndCommit, selectedInkIds]);

  return {
    color, setColor,
    width, setWidth,
    straightLineAssist, setStraightLineAssist,
    shapeRecognition, setShapeRecognition,
    arrowStart, setArrowStart,
    arrowEnd, setArrowEnd,
    eraserMode, setEraserMode,
    eraserRadius, setEraserRadius,
    draft,
    gesturePoints,
    selectedInkIds,
    setSelectedInkIds,
    canUndoInk: canUndoWhiteboardInk(historySession.current, options.documentId),
    canRedoInk: canRedoWhiteboardInk(historySession.current, options.documentId),
    historyRevision,
    undoInk,
    redoInk,
    deleteInkSelection,
    moveInkSelection,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handlePointerCancel,
  };
}
