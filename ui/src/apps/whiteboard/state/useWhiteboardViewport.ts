import { secureRandomId } from '../../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME
// Astraea Whiteboard viewport/navigation controller. Keeps camera state isolated from object-edit orchestration.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type { WorkspaceDocument, WhiteboardBackgroundStyle, WhiteboardViewConfig } from '../../../shared/contracts/workspace';
import { syncWhiteboardViewToDocument } from '../persistence/canvasItemsStore';
import { calculateCanvasBounds } from '../rendering/whiteboardSpatialIndexEngine';
import type { WhiteboardInteractionTool, WhiteboardItem } from '../types';
import {
  allFramePresentationPath,
  canvasBackgroundCss,
  centerWorldPoint,
  clampCoordinate,
  clampNumber,
  clampZoom,
  fitBoundsToViewport,
  itemBounds,
  normalizePresentationPath,
  normalizeWhiteboardViewConfig,
  viewportToWorldBounds,
  WHITEBOARD_MAX_BOOKMARKS,
  WHITEBOARD_MAX_GUIDES,
  WHITEBOARD_MAX_GRID_SIZE,
  WHITEBOARD_MIN_GRID_SIZE,
  WHITEBOARD_MIN_ZOOM,
  zoomAroundScreenPoint,
} from '../viewport/whiteboardViewportEngine';

const createId = (prefix: string) => {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : secureRandomId('viewport');
  return `${prefix}-${random}`;
};

export function useWhiteboardViewport(
  document: WorkspaceDocument,
  onUpdateDocument: (doc: WorkspaceDocument) => void,
  items: WhiteboardItem[],
  selectedItemId: string | null,
  containerRef: RefObject<HTMLDivElement | null>,
  onViewMutation?: (before: WhiteboardViewConfig, after: WhiteboardViewConfig, coalesceKey: string) => void,
) {
  const [pan, setPan] = useState({ x: 80, y: 60 });
  const [zoom, setZoomState] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const [view, setView] = useState<WhiteboardViewConfig>(() => normalizeWhiteboardViewConfig(document.whiteboardData?.view));
  const [presentationIndex, setPresentationIndex] = useState(-1);
  const lastDocumentId = useRef(document.id);

  useEffect(() => {
    if (lastDocumentId.current === document.id) return;
    lastDocumentId.current = document.id;
    setView(normalizeWhiteboardViewConfig(document.whiteboardData?.view));
    setPan({ x: 80, y: 60 });
    setZoomState(1);
    setPresentationIndex(-1);
  }, [document.id, document.whiteboardData?.view]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setViewportSize({ width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight) });
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [containerRef]);

  const persistView = useCallback((next: WhiteboardViewConfig, coalesceKey = 'view') => {
    const normalized = normalizeWhiteboardViewConfig({
      ...next,
      presentationPath: normalizePresentationPath(items, next.presentationPath),
    });
    onViewMutation?.(view, normalized, coalesceKey);
    setView(normalized);
    onUpdateDocument(syncWhiteboardViewToDocument(normalized, document));
  }, [document, items, onUpdateDocument, onViewMutation, view]);

  const restoreViewState = useCallback((next: WhiteboardViewConfig) => {
    setView(normalizeWhiteboardViewConfig({ ...next, presentationPath: normalizePresentationPath(items, next.presentationPath) }));
    setPresentationIndex(-1);
  }, [items]);

  const setZoom = useCallback((valueOrUpdater: number | ((previous: number) => number)) => {
    setZoomState((previous) => clampZoom(typeof valueOrUpdater === 'function' ? valueOrUpdater(previous) : valueOrUpdater));
  }, []);

  const screenToCanvasCoords = useCallback((screenX: number, screenY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clampCoordinate((screenX - rect.left - pan.x) / zoom),
      y: clampCoordinate((screenY - rect.top - pan.y) / zoom),
    };
  }, [containerRef, pan.x, pan.y, zoom]);

  const beginPan = useCallback((event: ReactMouseEvent, activeTool: WhiteboardInteractionTool) => {
    const shouldPan = event.button === 1 || activeTool === 'pan' || (activeTool === 'select' && event.target === containerRef.current);
    if (!shouldPan) return false;
    setIsPanning(true);
    setPanStart({ x: event.clientX - pan.x, y: event.clientY - pan.y });
    return true;
  }, [containerRef, pan.x, pan.y]);

  const movePan = useCallback((event: ReactMouseEvent) => {
    if (!isPanning) return false;
    setPan({ x: event.clientX - panStart.x, y: event.clientY - panStart.y });
    return true;
  }, [isPanning, panStart.x, panStart.y]);

  const endPan = useCallback(() => setIsPanning(false), []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = Math.exp(-event.deltaY * 0.0012);
      const next = zoomAroundScreenPoint(pan, zoom, zoom * factor, point);
      setZoomState(next.zoom);
      setPan(next.pan);
    };
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [containerRef, pan, zoom]);

  const applyFit = useCallback((targetItems: WhiteboardItem[]) => {
    if (targetItems.length === 0) return;
    const transform = fitBoundsToViewport(calculateCanvasBounds(targetItems), viewportSize, view.showRulers ? 92 : 64, WHITEBOARD_MIN_ZOOM, 4);
    setPan(transform.pan);
    setZoomState(transform.zoom);
  }, [view.showRulers, viewportSize]);

  const fitAll = useCallback(() => applyFit(items.filter((item) => item.type !== 'connector')), [applyFit, items]);

  const fitSelection = useCallback(() => {
    const selected = items.find((item) => item.id === selectedItemId);
    if (selected) {
      const transform = fitBoundsToViewport(itemBounds(selected), viewportSize, 96, WHITEBOARD_MIN_ZOOM, 4);
      setPan(transform.pan);
      setZoomState(transform.zoom);
      return;
    }
    fitAll();
  }, [fitAll, items, selectedItemId, viewportSize]);

  const navigateToItem = useCallback((itemId: string) => {
    const target = items.find((item) => item.id === itemId);
    if (!target) return false;
    const transform = fitBoundsToViewport(itemBounds(target), viewportSize, 100, WHITEBOARD_MIN_ZOOM, 3);
    setPan(transform.pan);
    setZoomState(transform.zoom);
    return true;
  }, [items, viewportSize]);

  const centerOnWorldPoint = useCallback((x: number, y: number, preferredZoom = zoom) => {
    const transform = centerWorldPoint({ x, y }, preferredZoom, viewportSize);
    setPan(transform.pan);
    setZoomState(transform.zoom);
  }, [viewportSize, zoom]);

  const addBookmark = useCallback((name?: string) => {
    if (view.bookmarks.length >= WHITEBOARD_MAX_BOOKMARKS) return false;
    const centerX = (viewportSize.width / 2 - pan.x) / zoom;
    const centerY = (viewportSize.height / 2 - pan.y) / zoom;
    const next = {
      ...view,
      bookmarks: [...view.bookmarks, {
        id: createId('location'),
        name: String(name || `Location ${view.bookmarks.length + 1}`).slice(0, 120),
        x: clampCoordinate(centerX),
        y: clampCoordinate(centerY),
        zoom: clampZoom(zoom),
      }],
    };
    persistView(next, 'view:bookmark');
    return true;
  }, [pan.x, pan.y, persistView, view, viewportSize.height, viewportSize.width, zoom]);

  const navigateBookmark = useCallback((bookmarkId: string) => {
    const bookmark = view.bookmarks.find((candidate) => candidate.id === bookmarkId);
    if (!bookmark) return false;
    const transform = centerWorldPoint(bookmark, bookmark.zoom, viewportSize);
    setPan(transform.pan);
    setZoomState(transform.zoom);
    return true;
  }, [view.bookmarks, viewportSize]);

  const removeBookmark = useCallback((bookmarkId: string) => {
    persistView({ ...view, bookmarks: view.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId) }, 'view:bookmark');
  }, [persistView, view]);

  const addGuide = useCallback((axis: 'x' | 'y') => {
    if (view.guides.length >= WHITEBOARD_MAX_GUIDES) return false;
    const worldCenter = axis === 'x'
      ? (viewportSize.width / 2 - pan.x) / zoom
      : (viewportSize.height / 2 - pan.y) / zoom;
    persistView({
      ...view,
      guides: [...view.guides, { id: createId('guide'), axis, position: clampCoordinate(worldCenter) }],
    }, 'view:guide');
    return true;
  }, [pan.x, pan.y, persistView, view, viewportSize.height, viewportSize.width, zoom]);

  const removeGuide = useCallback((guideId: string) => {
    persistView({ ...view, guides: view.guides.filter((guide) => guide.id !== guideId) }, 'view:guide');
  }, [persistView, view]);

  const setBackgroundStyle = useCallback((backgroundStyle: WhiteboardBackgroundStyle) => persistView({ ...view, backgroundStyle }, 'view:background'), [persistView, view]);
  const setGridSize = useCallback((gridSize: number) => persistView({ ...view, gridSize: clampNumber(gridSize, WHITEBOARD_MIN_GRID_SIZE, WHITEBOARD_MAX_GRID_SIZE) }, 'view:grid-size'), [persistView, view]);
  const setShowRulers = useCallback((showRulers: boolean) => persistView({ ...view, showRulers }, 'view:rulers'), [persistView, view]);
  const setSnapToGrid = useCallback((snapToGrid: boolean) => persistView({ ...view, snapToGrid }, 'view:snap-grid'), [persistView, view]);
  const setSnapToGuides = useCallback((snapToGuides: boolean) => persistView({ ...view, snapToGuides }, 'view:snap-guides'), [persistView, view]);

  const useAllFramesAsPresentationPath = useCallback(() => {
    persistView({ ...view, presentationPath: allFramePresentationPath(items) }, 'view:presentation-path');
    setPresentationIndex(-1);
  }, [items, persistView, view]);

  const removeFrameFromPresentationPath = useCallback((frameId: string) => {
    persistView({ ...view, presentationPath: view.presentationPath.filter((id) => id !== frameId) }, 'view:presentation-path');
    setPresentationIndex(-1);
  }, [persistView, view]);

  const moveFrameInPresentationPath = useCallback((frameId: string, direction: -1 | 1) => {
    const path = [...view.presentationPath];
    const from = path.indexOf(frameId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= path.length) return;
    [path[from], path[to]] = [path[to], path[from]];
    persistView({ ...view, presentationPath: path }, 'view:presentation-path');
  }, [persistView, view]);

  const presentStep = useCallback((direction: 1 | -1 = 1) => {
    const configured = normalizePresentationPath(items, view.presentationPath);
    const path = configured.length > 0 ? configured : allFramePresentationPath(items);
    if (path.length === 0) return null;
    const nextIndex = presentationIndex < 0
      ? (direction > 0 ? 0 : path.length - 1)
      : (presentationIndex + direction + path.length) % path.length;
    setPresentationIndex(nextIndex);
    navigateToItem(path[nextIndex]);
    return path[nextIndex];
  }, [items, navigateToItem, presentationIndex, view.presentationPath]);

  const panBy = useCallback((dx: number, dy: number) => setPan((current) => ({ x: current.x + dx, y: current.y + dy })), []);
  const viewportWorldBounds = useMemo(() => viewportToWorldBounds(pan, zoom, viewportSize), [pan, viewportSize, zoom]);
  const backgroundStyle = useMemo(() => canvasBackgroundCss(view.backgroundStyle, view.gridSize, pan, zoom), [pan, view.backgroundStyle, view.gridSize, zoom]);

  return {
    pan,
    panBy,
    zoom,
    setZoom,
    isPanning,
    viewportSize,
    viewportWorldBounds,
    view,
    backgroundStyle,
    presentationIndex,
    screenToCanvasCoords,
    beginPan,
    movePan,
    endPan,
    fitAll,
    fitSelection,
    navigateToItem,
    centerOnWorldPoint,
    addBookmark,
    navigateBookmark,
    removeBookmark,
    addGuide,
    removeGuide,
    setBackgroundStyle,
    setGridSize,
    setShowRulers,
    setSnapToGrid,
    setSnapToGuides,
    useAllFramesAsPresentationPath,
    removeFrameFromPresentationPath,
    moveFrameInPresentationPath,
    presentStep,
    restoreViewState,
  };
}
