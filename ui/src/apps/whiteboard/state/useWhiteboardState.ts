// STATUS: PLATIN
// Whiteboard state composition and authoritative mutation boundary.

import { useState, useRef, useCallback, useEffect } from 'react';
import { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WhiteboardCollaborationState, WhiteboardViewConfig } from '../../../shared/contracts/workspace';
import {
  WhiteboardItem,
  WhiteboardInteractionTool,
  StickyColor,
} from '../types';
import { loadWhiteboardItemsFromDocument, syncWhiteboardFacilitationToDocument, syncWhiteboardTemplatesToDocument } from '../persistence/canvasItemsStore';
import { useWhiteboardViewport } from './useWhiteboardViewport';
import { useWhiteboardInk } from '../interactions/useWhiteboardInk';
import { useWhiteboardObjectInsertion } from '../interactions/useWhiteboardObjectInsertion';
import { useWhiteboardManipulation } from '../interactions/useWhiteboardManipulation';
import { useWhiteboardCanvasInput } from '../interactions/useWhiteboardCanvasInput';
import { normalizeWhiteboardManipulationMetadata } from '../model/whiteboardManipulationEngine';
import { normalizeWhiteboardDiagramItem } from '../model/whiteboardDiagramEngine';
import { normalizeCustomWhiteboardTemplates } from '../model/whiteboardTemplateEngine';
import { normalizeWhiteboardFacilitationState } from '../model/whiteboardFacilitationEngine';
import type { WhiteboardCustomTemplate, WhiteboardFacilitationState } from '../../../shared/contracts/workspace';
import { normalizeWhiteboardRichObject } from '../model/whiteboardObjectEngine';
import { validateAndNormalizeWhiteboardItems } from '../viewport/whiteboardViewportEngine';
import { detectChangedWhiteboardItemIds } from '../model/whiteboardCollaborationEngine';
import { useWhiteboardCollaboration } from '../integrations/useWhiteboardCollaboration';
import { buildPresentDocumentFromWhiteboard } from '../integrations/whiteboardPresentHandoff';
import { useWhiteboardHistory } from '../history/useWhiteboardHistory';
import { createWhiteboardItemHistoryEntry, createWhiteboardMetaHistoryEntry } from '../history/whiteboardDocumentHistory';
import { prepareWhiteboardHistoryRestore } from '../history/whiteboardHistoryRestore';

export function useWhiteboardState(
  document: WorkspaceDocument,
  onUpdateDocument: (doc: WorkspaceDocument) => void,
  onCreateDerivedDocument?: (doc: WorkspaceDocument) => void,
) {
  const [activeTool, setActiveTool] = useState<WhiteboardInteractionTool>('select');
  const [selectedStickyColor, setSelectedStickyColor] = useState<StickyColor>('yellow');

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [connectorStartId, setConnectorStartId] = useState<string | null>(null);

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showSlideExportModal, setShowSlideExportModal] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimeoutRef.current !== null) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = null;
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current !== null) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      toastTimeoutRef.current = null;
      setToastMessage(null);
    }, 3000);
  }, []);

  // Report a rejected persisted payload exactly once, visibly, and never silently.
  useEffect(() => {
    const load = initialLoadRef.current;
    initialLoadRef.current = null;
    if (load && !load.ok) showToast(`Whiteboard payload rejected: ${load.reason ?? 'invalid canonical items'}`);
  }, [showToast]);

  // Canonical load: a board without canonical items is empty, and a structurally invalid payload is
  // rejected fail-closed with a visible reason instead of loading a partially corrupt board.
  const initialLoadRef = useRef<{ ok: boolean; reason?: string } | null>(null);
  const [items, setItems] = useState<WhiteboardItem[]>(() => {
    const loaded = loadWhiteboardItemsFromDocument(document);
    if (!loaded.ok) {
      initialLoadRef.current = { ok: false, reason: loaded.reason };
      return [];
    }
    initialLoadRef.current = { ok: true };
    return loaded.items.map(normalizeWhiteboardRichObject).map(normalizeWhiteboardManipulationMetadata).map(normalizeWhiteboardDiagramItem);
  });
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [customTemplates, setCustomTemplates] = useState<WhiteboardCustomTemplate[]>(() => normalizeCustomWhiteboardTemplates(document.whiteboardData?.templates));
  const [facilitation, setFacilitation] = useState<WhiteboardFacilitationState>(() => normalizeWhiteboardFacilitationState(document.whiteboardData?.facilitation));
  const customTemplatesRef = useRef(customTemplates);
  customTemplatesRef.current = customTemplates;
  const facilitationRef = useRef(facilitation);
  facilitationRef.current = facilitation;
  const documentRef = useRef(document);
  documentRef.current = document;
  const history = useWhiteboardHistory(document.id);
  const publishDocument = useCallback((next: WorkspaceDocument) => {
    documentRef.current = next;
    onUpdateDocument(next);
  }, [onUpdateDocument]);

  const normalizeRemoteItems = useCallback((candidateRaw: WhiteboardItem[]): WhiteboardItem[] | null => {
    const candidate = candidateRaw.map(normalizeWhiteboardRichObject).map(normalizeWhiteboardManipulationMetadata).map(normalizeWhiteboardDiagramItem);
    const validated = validateAndNormalizeWhiteboardItems(candidate);
    if (!validated.ok) { showToast(validated.reason); return null; }
    itemsRef.current = validated.items;
    setItems(validated.items);
    return validated.items;
  }, [showToast]);

  const recordCollaborationMutation = useCallback((before: WhiteboardCollaborationState, after: WhiteboardCollaborationState, coalesceKey: string) => {
    history.record(createWhiteboardMetaHistoryEntry({ documentId: document.id, coalesceKey, collaboration: { before, after } }));
  }, [document.id, history]);
  const collaboration = useWhiteboardCollaboration({ document, items, onUpdateDocument: publishDocument, normalizeRemoteItems, onLocalStateMutation: recordCollaborationMutation });
  const recordViewMutation = useCallback((before: WhiteboardViewConfig, after: WhiteboardViewConfig, coalesceKey: string) => {
    history.record(createWhiteboardMetaHistoryEntry({ documentId: document.id, coalesceKey, view: { before, after } }));
  }, [document.id, history]);
  const viewport = useWhiteboardViewport(document, publishDocument, items, selectedItemId, containerRef, recordViewMutation);

  const updateItems = useCallback(
    (newItemsOrFn: WhiteboardItem[] | ((prev: WhiteboardItem[]) => WhiteboardItem[])): boolean => {
      const prev = itemsRef.current;
      const candidateRaw = typeof newItemsOrFn === 'function' ? newItemsOrFn(prev) : newItemsOrFn;
      const candidate = candidateRaw.map(normalizeWhiteboardRichObject).map(normalizeWhiteboardManipulationMetadata).map(normalizeWhiteboardDiagramItem);
      const validated = validateAndNormalizeWhiteboardItems(candidate);
      if (!validated.ok) { showToast(validated.reason); return false; }
      const changedIds = detectChangedWhiteboardItemIds(prev, validated.items);
      const historyEntry = createWhiteboardItemHistoryEntry(
        document.id,
        prev,
        validated.items,
        changedIds,
        changedIds.length <= 16 ? `items:${[...changedIds].sort().join('|')}` : 'items:bulk',
      );
      if (!collaboration.recordLocalItems(prev, validated.items, changedIds)) { showToast(`Whiteboard collaboration is read-only.`); return false; }
      history.record(historyEntry);
      itemsRef.current = validated.items;
      setItems(validated.items);
      return true;
    },
    [collaboration.recordLocalItems, collaboration.roleLabel, document.id, history, showToast]
  );

  const updateCustomTemplates = useCallback((updater: WhiteboardCustomTemplate[] | ((previous: WhiteboardCustomTemplate[]) => WhiteboardCustomTemplate[])) => {
    if (!collaboration.canEdit) { showToast(`Whiteboard collaboration is read-only.`); return; }
    const previous = customTemplatesRef.current;
    const candidate = typeof updater === 'function' ? updater(previous) : updater;
    const normalized = normalizeCustomWhiteboardTemplates(candidate);
    history.record(createWhiteboardMetaHistoryEntry({ documentId: document.id, coalesceKey: 'templates', templates: { before: previous, after: normalized } }));
    customTemplatesRef.current = normalized;
    setCustomTemplates(normalized);
    publishDocument(syncWhiteboardTemplatesToDocument(normalized, itemsRef.current, { ...documentRef.current, whiteboardData: { ...documentRef.current.whiteboardData, items: itemsRef.current.map((item) => ({ ...item })), facilitation: facilitationRef.current, collaboration: collaboration.state } }));
  }, [collaboration.canEdit, collaboration.roleLabel, collaboration.state, document.id, history, publishDocument, showToast]);

  const updateFacilitation = useCallback((updater: WhiteboardFacilitationState | ((previous: WhiteboardFacilitationState) => WhiteboardFacilitationState)) => {
    if (!collaboration.canEdit) { showToast(`Whiteboard collaboration is read-only.`); return; }
    const previous = facilitationRef.current;
    const candidate = typeof updater === 'function' ? updater(previous) : updater;
    const normalized = normalizeWhiteboardFacilitationState(candidate);
    history.record(createWhiteboardMetaHistoryEntry({ documentId: document.id, coalesceKey: 'facilitation', facilitation: { before: previous, after: normalized } }));
    facilitationRef.current = normalized;
    setFacilitation(normalized);
    publishDocument(syncWhiteboardFacilitationToDocument(normalized, itemsRef.current, customTemplatesRef.current, { ...documentRef.current, whiteboardData: { ...documentRef.current.whiteboardData, items: itemsRef.current.map((item) => ({ ...item })), collaboration: collaboration.state } }));
  }, [collaboration.canEdit, collaboration.roleLabel, collaboration.state, document.id, history, publishDocument, showToast]);

  const updateItemsAndFacilitation = useCallback((mutator: (currentItems: WhiteboardItem[], currentFacilitation: WhiteboardFacilitationState) => { items: WhiteboardItem[]; facilitation: WhiteboardFacilitationState }) => {
    if (!collaboration.canEdit) { showToast(`Whiteboard collaboration is read-only.`); return false; }
    const previousItems = itemsRef.current;
    const previousFacilitation = facilitationRef.current;
    const result = mutator(previousItems, previousFacilitation);
    const candidate = result.items.map(normalizeWhiteboardRichObject).map(normalizeWhiteboardManipulationMetadata).map(normalizeWhiteboardDiagramItem);
    const validated = validateAndNormalizeWhiteboardItems(candidate);
    if (!validated.ok) { showToast(validated.reason); return false; }
    const normalizedFacilitation = normalizeWhiteboardFacilitationState(result.facilitation);
    const baseDocument = syncWhiteboardFacilitationToDocument(normalizedFacilitation, validated.items, customTemplatesRef.current, { ...documentRef.current, whiteboardData:{ ...documentRef.current.whiteboardData, items: validated.items.map((item) => ({ ...item })), collaboration:collaboration.state } });
    const changedIds = detectChangedWhiteboardItemIds(previousItems, result.items);
    if (!collaboration.recordLocalItems(previousItems, validated.items, changedIds, baseDocument)) return false;
    const itemEntry = createWhiteboardItemHistoryEntry(document.id, previousItems, validated.items, changedIds, 'items+facilitation');
    history.record(createWhiteboardMetaHistoryEntry({
      documentId: document.id,
      coalesceKey: 'items+facilitation',
      itemEntry,
      facilitation: { before: previousFacilitation, after: normalizedFacilitation },
    }));
    itemsRef.current = validated.items;
    facilitationRef.current = normalizedFacilitation;
    setItems(validated.items);
    setFacilitation(normalizedFacilitation);
    return true;
  }, [collaboration.canEdit, collaboration.recordLocalItems, collaboration.roleLabel, collaboration.state, document.id, history, showToast]);

  const screenToCanvasCoords = viewport.screenToCanvasCoords;

  const ink = useWhiteboardInk({
    documentId: document.id,
    activeTool,
    items,
    updateItems,
    screenToCanvasCoords,
    showToast,
    setSelectedItemId,
  });

  const objectInsertion = useWhiteboardObjectInsertion({
    documentId: document.id,
    containerRef,
    screenToCanvasCoords,
    updateItems,
    setSelectedItemId,
    setActiveTool,
    showToast,
  });

  const manipulation = useWhiteboardManipulation({
    documentId: document.id,
    items,
    updateItems,
    selectedItemId,
    setSelectedItemId,
    view: viewport.view,
    showToast,
  });

  const canvasInput = useWhiteboardCanvasInput({
    activeTool,
    selectedStickyColor,
    selectedItemId,
    connectorStartId,
    draggingItemId,
    dragOffset,
    items,
    screenToCanvasCoords,
    updateItems,
    setSelectedItemId,
    setEditingItemId,
    setConnectorStartId,
    setDraggingItemId,
    setDragOffset,
    setActiveTool,
    showToast,
    viewport,
    updateCursor: collaboration.updateCursor,
    manipulation,
  });

  const stepDocumentHistory = useCallback((direction: 'undo' | 'redo') => {
    const entry = direction === 'undo' ? history.takeUndo() : history.takeRedo();
    if (!entry) return false;
    const currentItems = itemsRef.current;
    const restored = prepareWhiteboardHistoryRestore({ currentDocument: documentRef.current, currentItems, currentView: viewport.view, currentTemplates: customTemplatesRef.current, currentFacilitation: facilitationRef.current, collaboration: collaboration.state, entry, direction });
    if (!restored.ok) {
      if (direction === 'undo') history.takeRedo(); else history.takeUndo();
      showToast(`Undo/redo rejected by Whiteboard invariants: ${restored.reason}`);
      return false;
    }
    if (restored.changedIds.length > 0) {
      if (!collaboration.recordLocalItems(currentItems, restored.items, restored.changedIds, restored.document)) {
        if (direction === 'undo') history.takeRedo(); else history.takeUndo();
        showToast(`Whiteboard collaboration is read-only.`);
        return false;
      }
    } else publishDocument(restored.document);
    itemsRef.current = restored.items;
    customTemplatesRef.current = restored.templates;
    facilitationRef.current = restored.facilitation;
    setItems(restored.items);
    setCustomTemplates(restored.templates);
    setFacilitation(restored.facilitation);
    collaboration.restoreState(restored.collaboration);
    viewport.restoreViewState(restored.view);
    if (selectedItemId && !restored.items.some((item) => item.id === selectedItemId)) setSelectedItemId(null);
    return true;
  }, [collaboration, history, publishDocument, selectedItemId, showToast, viewport]);

  const documentHistory = {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    depth: history.depth,
    undo: () => stepDocumentHistory('undo'),
    redo: () => stepDocumentHistory('redo'),
  };

  const handleExportToPresent = useCallback(() => {
    const presentDoc = buildPresentDocumentFromWhiteboard(document, items, viewport.view.presentationPath);
    if (onCreateDerivedDocument) {
      onCreateDerivedDocument(presentDoc);
      showToast(`Exported ${presentDoc.presentData?.slides?.length ?? 0} Whiteboard frame(s) to Astraea Present.`);
    } else {
      showToast('Present export requires Workspace document orchestration.');
    }
  }, [document, items, onCreateDerivedDocument, showToast, viewport.view.presentationPath]);

  return {
    pan: viewport.pan,
    panBy: viewport.panBy,
    zoom: viewport.zoom,
    setZoom: viewport.setZoom,
    isPanning: viewport.isPanning,
    viewportSize: viewport.viewportSize,
    viewportWorldBounds: viewport.viewportWorldBounds,
    view: viewport.view,
    backgroundStyle: viewport.backgroundStyle,
    screenToCanvasCoords,
    presentationIndex: viewport.presentationIndex,
    fitAll: viewport.fitAll,
    fitSelection: viewport.fitSelection,
    navigateToItem: viewport.navigateToItem,
    centerOnWorldPoint: viewport.centerOnWorldPoint,
    addBookmark: viewport.addBookmark,
    navigateBookmark: viewport.navigateBookmark,
    removeBookmark: viewport.removeBookmark,
    addGuide: viewport.addGuide,
    removeGuide: viewport.removeGuide,
    setBackgroundStyle: viewport.setBackgroundStyle,
    setGridSize: viewport.setGridSize,
    setShowRulers: viewport.setShowRulers,
    setSnapToGrid: viewport.setSnapToGrid,
    setSnapToGuides: viewport.setSnapToGuides,
    useAllFramesAsPresentationPath: viewport.useAllFramesAsPresentationPath,
    removeFrameFromPresentationPath: viewport.removeFrameFromPresentationPath,
    moveFrameInPresentationPath: viewport.moveFrameInPresentationPath,
    presentStep: viewport.presentStep,
    activeTool,
    setActiveTool,
    selectedStickyColor,
    setSelectedStickyColor,
    selectedItemId,
    setSelectedItemId,
    editingItemId,
    setEditingItemId,
    connectorStartId,
    setConnectorStartId,
    toastMessage,
    showToast,
    showSlideExportModal,
    setShowSlideExportModal,
    containerRef,
    imageInputRef: objectInsertion.imageInputRef,
    mediaInputRef: objectInsertion.mediaInputRef,
    items,
    updateItems,
    customTemplates,
    updateCustomTemplates,
    facilitation,
    updateFacilitation,
    updateItemsAndFacilitation,
    collaboration,
    ink,
    manipulation,
    documentHistory,    handleExportToPresent,
    importImageFile: objectInsertion.importImageFile,
    importMediaFile: objectInsertion.importMediaFile,
    insertRichObject: objectInsertion.insertRichObject,
    handleCanvasDrop: objectInsertion.handleCanvasDrop,
    importDroppedFiles: objectInsertion.importDroppedFiles,
    marquee: canvasInput.marquee,
    handleCanvasClick: canvasInput.handleCanvasClick,
    handleMouseDown: canvasInput.handleMouseDown,
    handleMouseMove: canvasInput.handleMouseMove,
    handleMouseUp: canvasInput.handleMouseUp,
    handleItemMouseDown: canvasInput.handleItemMouseDown,
    handleChangeStickyColor: canvasInput.handleChangeStickyColor,
    handleDeleteSelected: canvasInput.handleDeleteSelected,
  };
}
