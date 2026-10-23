// STATUS: PLATIN
// Canonical multi-object selection/manipulation controller for Astraea Whiteboard.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WhiteboardConnectorAnchor, WhiteboardViewConfig } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import {
  alignWhiteboardSelection,
  applyWhiteboardDragSnap,
  applyWhiteboardStyle,
  captureWhiteboardStyle,
  distributeWhiteboardSelection,
  duplicateWhiteboardSelection,
  expandSelectionForGroup,
  groupWhiteboardSelection,
  layerWhiteboardSelection,
  resizeWhiteboardSelection,
  rotateWhiteboardSelection,
  setWhiteboardConnectorAnchors,
  setWhiteboardConstraints,
  setWhiteboardObjectLink,
  setWhiteboardSelectionHidden,
  setWhiteboardSelectionLocked,
  showAllWhiteboardObjects,
  type WhiteboardAlignMode,
  type WhiteboardDistributeMode,
  type WhiteboardStyleSnapshot,
  ungroupWhiteboardSelection,
} from '../model/whiteboardManipulationEngine';
import type { WhiteboardSnapGuideLine } from '../model/whiteboardSnapGuideEngine';
import { setWhiteboardTextStyle } from '../model/whiteboardTextStyleEngine';
import { addWhiteboardMindMapChild } from '../model/whiteboardDiagramEngine';
import type { WhiteboardTextStyle } from '../types';
import { whiteboardKeyboardOrder } from '../a11y/whiteboardAccessibilityEngine';
import {
  isCurrentWhiteboardManipulationDocument,
  scopeWhiteboardManipulationSelection,
} from './whiteboardManipulationScope';
import type { WhiteboardItemsUpdater } from '../state/whiteboardMutationCommit';

interface Options {
  documentId: string;
  items: WhiteboardItem[];
  updateItems: WhiteboardItemsUpdater;
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  view: WhiteboardViewConfig;
  showToast: (message: string) => void;
}

export function useWhiteboardManipulation({ documentId, items, updateItems, selectedItemId, setSelectedItemId, view, showToast }: Options) {
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [styleClipboard, setStyleClipboard] = useState<WhiteboardStyleSnapshot | null>(null);
  const [snapGuides, setSnapGuides] = useState<WhiteboardSnapGuideLine[]>([]);
  const activeDocumentIdRef = useRef(documentId);
  const selectionDocumentIdRef = useRef(documentId);
  const setSelectedItemIdRef = useRef(setSelectedItemId);
  setSelectedItemIdRef.current = setSelectedItemId;

  useLayoutEffect(() => {
    activeDocumentIdRef.current = documentId;
    if (selectionDocumentIdRef.current === documentId) return;
    selectionDocumentIdRef.current = documentId;
    setSelectedItemIds([]);
    setSelectedItemIdRef.current(null);
  }, [documentId]);

  const effectiveIds = useMemo(() => {
    const scoped = scopeWhiteboardManipulationSelection({
      documentId,
      selectionDocumentId: selectionDocumentIdRef.current,
      selectedItemIds,
      selectedItemId,
      items,
    });
    return expandSelectionForGroup(items, scoped);
  }, [documentId, items, selectedItemId, selectedItemIds]);
  const selectionSet = useMemo(() => new Set(effectiveIds), [effectiveIds]);
  const selection = useMemo(() => items.filter((item) => selectionSet.has(item.id)), [items, selectionSet]);

  const setSelection = useCallback((ids: string[]) => {
    if (!isCurrentWhiteboardManipulationDocument(activeDocumentIdRef.current, documentId)) return;
    const deduped = [...new Set(ids)].slice(0, 4096);
    setSelectedItemIds(deduped);
    setSelectedItemId(deduped[0] ?? null);
  }, [documentId, setSelectedItemId]);

  const clearSelection = useCallback(() => setSelection([]), [setSelection]);
  const selectItem = useCallback((id: string, additive = false) => {
    if (!isCurrentWhiteboardManipulationDocument(activeDocumentIdRef.current, documentId)) return;
    const expanded = expandSelectionForGroup(items, [id]).filter((candidate) => !items.find((item) => item.id === candidate)?.hidden);
    if (!additive) {
      setSelection(expanded);
      return;
    }
    const current = new Set(effectiveIds);
    const shouldRemove = expanded.length > 0 && expanded.every((candidate) => current.has(candidate));
    for (const candidate of expanded) shouldRemove ? current.delete(candidate) : current.add(candidate);
    setSelection([...current]);
  }, [documentId, effectiveIds, items, setSelection]);

  const mutate = useCallback((fn: (previous: WhiteboardItem[], ids: ReadonlySet<string>) => WhiteboardItem[]): boolean => {
    if (!isCurrentWhiteboardManipulationDocument(activeDocumentIdRef.current, documentId)) return false;
    if (selectionSet.size === 0) return false;
    return updateItems((previous) => fn(previous, new Set(expandSelectionForGroup(previous, [...selectionSet]))));
  }, [documentId, selectionSet, updateItems]);

  const moveSelectionTo = useCallback((primaryId: string, x: number, y: number): boolean => {
    if (!isCurrentWhiteboardManipulationDocument(activeDocumentIdRef.current, documentId)) return false;
    const ids = effectiveIds.includes(primaryId) ? effectiveIds : expandSelectionForGroup(items, [primaryId]);
    let guides: WhiteboardSnapGuideLine[] = [];
    const accepted = updateItems((previous) => {
      const result = applyWhiteboardDragSnap({
        items: previous,
        ids: new Set(expandSelectionForGroup(previous, ids)),
        primaryId,
        targetX: x,
        targetY: y,
        snap: {
          gridSize: view.gridSize,
          snapToGrid: view.snapToGrid,
          snapToGuides: view.snapToGuides,
          guides: view.guides,
        },
      });
      guides = result.guides;
      return result.items;
    });
    setSnapGuides(accepted ? guides : []);
    return accepted;
  }, [documentId, effectiveIds, items, updateItems, view.gridSize, view.guides, view.snapToGrid, view.snapToGuides]);

  const clearSnapGuides = useCallback(() => setSnapGuides([]), []);

  /** Keyboard equivalent of dragging: the same snap rule, one bounded step at a time. */
  const moveSelectionBy = useCallback((dx: number, dy: number): boolean => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    const primaryId = effectiveIds.find((id) => !items.find((item) => item.id === id)?.locked) ?? null;
    if (!primaryId) return false;
    const primary = items.find((item) => item.id === primaryId);
    if (!primary) return false;
    return moveSelectionTo(primaryId, primary.x + dx, primary.y + dy);
  }, [effectiveIds, items, moveSelectionTo]);

  /** Tab-order/Alt+Arrow cycling through the canonical keyboard order of visible objects. */
  const stepSelection = useCallback((direction: 1 | -1): boolean => {
    const order = whiteboardKeyboardOrder(items);
    if (order.length === 0) return false;
    const current = selectedItemId ?? effectiveIds[0] ?? null;
    const index = order.findIndex((item) => item.id === current);
    const nextIndex = index < 0 ? 0 : Math.min(order.length - 1, Math.max(0, index + direction));
    const next = order[nextIndex];
    if (!next) return false;
    selectItem(next.id, false);
    return true;
  }, [effectiveIds, items, selectItem, selectedItemId]);

  const selectAll = useCallback((): boolean => {
    const order = whiteboardKeyboardOrder(items).filter((item) => !item.locked);
    if (order.length === 0) return false;
    setSelection(order.map((item) => item.id));
    return true;
  }, [items, setSelection]);

  const rotate = useCallback((delta: number) => mutate((previous, ids) => rotateWhiteboardSelection(previous, ids, delta)), [mutate]);
  const resize = useCallback((factor: number) => mutate((previous, ids) => resizeWhiteboardSelection(previous, ids, factor)), [mutate]);
  const group = useCallback(() => mutate(groupWhiteboardSelection), [mutate]);
  const ungroup = useCallback(() => mutate(ungroupWhiteboardSelection), [mutate]);
  const setLocked = useCallback((locked: boolean) => mutate((previous, ids) => setWhiteboardSelectionLocked(previous, ids, locked)), [mutate]);
  const hide = useCallback(() => {
    const accepted = mutate((previous, ids) => setWhiteboardSelectionHidden(previous, ids, true));
    if (accepted) clearSelection();
    return accepted;
  }, [clearSelection, mutate]);
  const showAll = useCallback(() => {
    if (!isCurrentWhiteboardManipulationDocument(activeDocumentIdRef.current, documentId)) return false;
    return updateItems(showAllWhiteboardObjects);
  }, [documentId, updateItems]);
  const align = useCallback((mode: WhiteboardAlignMode) => mutate((previous, ids) => alignWhiteboardSelection(previous, ids, mode)), [mutate]);
  const distribute = useCallback((mode: WhiteboardDistributeMode) => mutate((previous, ids) => distributeWhiteboardSelection(previous, ids, mode)), [mutate]);
  const layer = useCallback((direction: 'front' | 'back') => mutate((previous, ids) => layerWhiteboardSelection(previous, ids, direction)), [mutate]);
  const duplicate = useCallback(() => {
    if (!isCurrentWhiteboardManipulationDocument(activeDocumentIdRef.current, documentId)) return false;
    if (selectionSet.size === 0) return false;
    const result = duplicateWhiteboardSelection(items, new Set(expandSelectionForGroup(items, [...selectionSet])));
    if (!updateItems(result.items)) return false;
    if (result.newIds.length > 0) setSelection(result.newIds);
    return true;
  }, [documentId, items, selectionSet, setSelection, updateItems]);
  const copyStyle = useCallback(() => {
    if (!isCurrentWhiteboardManipulationDocument(activeDocumentIdRef.current, documentId)) return;
    const primary = items.find((item) => item.id === selectedItemId) ?? selection[0];
    if (primary) setStyleClipboard(captureWhiteboardStyle(primary));
  }, [documentId, items, selectedItemId, selection]);
  const pasteStyle = useCallback(() => {
    if (styleClipboard) mutate((previous, ids) => applyWhiteboardStyle(previous, ids, styleClipboard));
  }, [mutate, styleClipboard]);
  const setLink = useCallback((link: string | undefined) => mutate((previous, ids) => setWhiteboardObjectLink(previous, ids, link)), [mutate]);
  const setTextStyle = useCallback((patch: Partial<WhiteboardTextStyle>): boolean => {
    if (!Number.isFinite(patch.fontSize ?? 0) && patch.fontSize !== undefined) return false;
    return mutate((previous, ids) => setWhiteboardTextStyle(previous, ids, patch));
  }, [mutate]);
  /**
   * Adds one mind-map child to the primary selected node and selects it for immediate typing, so the
   * whole "add a node with the keyboard" flow is Ctrl/Cmd+Enter, type, Escape.
   */
  const addMindMapChild = useCallback((): string | null => {
    if (!isCurrentWhiteboardManipulationDocument(activeDocumentIdRef.current, documentId)) return null;
    const parentId = selectedItemId && items.some((item) => item.id === selectedItemId)
      ? selectedItemId
      : effectiveIds[0];
    if (!parentId) {
      showToast('Select a node before adding a child node.');
      return null;
    }
    const result = addWhiteboardMindMapChild(items, parentId);
    if (!result.ok || !result.newNodeId) {
      if (result.reason) showToast(result.reason);
      return null;
    }
    if (!updateItems(result.items)) return null;
    setSelection([result.newNodeId]);
    return result.newNodeId;
  }, [documentId, effectiveIds, items, selectedItemId, setSelection, showToast, updateItems]);
  const setConstraints = useCallback((patch: Partial<NonNullable<WhiteboardItem['constraints']>>) => mutate((previous, ids) => setWhiteboardConstraints(previous, ids, patch)), [mutate]);
  const setConnectorAnchors = useCallback((patch: { fromAnchor?: WhiteboardConnectorAnchor; toAnchor?: WhiteboardConnectorAnchor }) => mutate((previous, ids) => setWhiteboardConnectorAnchors(previous, ids, patch)), [mutate]);
  const deleteSelection = useCallback(() => {
    if (!isCurrentWhiteboardManipulationDocument(activeDocumentIdRef.current, documentId)) return false;
    if (selectionSet.size === 0) return false;
    const doomed = new Set(effectiveIds);
    if (!updateItems((previous) => previous.filter((item) => !doomed.has(item.id) && !doomed.has(item.fromId ?? '') && !doomed.has(item.toId ?? '')))) return false;
    clearSelection();
    return true;
  }, [clearSelection, documentId, effectiveIds, selectionSet.size, updateItems]);

  return {
    selectedItemIds: effectiveIds,
    selection,
    selectionSet,
    styleClipboard,
    snapGuides,
    clearSnapGuides,
    clearSelection,
    selectItem,
    setSelection,
    selectAll,
    stepSelection,
    moveSelectionBy,
    moveSelectionTo,
    rotate,
    resize,
    group,
    ungroup,
    setLocked,
    hide,
    showAll,
    align,
    distribute,
    layer,
    duplicate,
    copyStyle,
    pasteStyle,
    setLink,
    setTextStyle,
    addMindMapChild,
    setConstraints,
    setConnectorAnchors,
    deleteSelection,
  };
}
