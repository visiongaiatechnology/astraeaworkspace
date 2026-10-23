import { secureRandomId } from '../../../shared/crypto/secureRandom';
// STATUS: PLATIN
// Whiteboard pointer and canvas-item interaction handlers, separated from state orchestration.

import { useCallback, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { StickyColor, WhiteboardInteractionTool, WhiteboardItem } from '../types';
import { commitWhiteboardItemMutation, type WhiteboardItemsUpdate } from '../state/whiteboardMutationCommit';
import {
  isWhiteboardMarqueeActive,
  marqueeWhiteboardSelection,
  normalizeWhiteboardMarquee,
  type WhiteboardMarqueeRect,
} from '../selection/whiteboardMarqueeEngine';

interface ViewportInput {
  beginPan: (event: ReactMouseEvent<HTMLDivElement>, activeTool: WhiteboardInteractionTool) => boolean;
  movePan: (event: ReactMouseEvent<HTMLDivElement>) => boolean;
  endPan: () => void;
}

interface ManipulationInput {
  selectedItemIds: string[];
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  selectItem: (id: string, additive?: boolean) => void;
  moveSelectionTo: (primaryId: string, x: number, y: number) => boolean;
  deleteSelection: () => boolean;
  clearSnapGuides: () => void;
}

interface Options {
  activeTool: WhiteboardInteractionTool;
  selectedStickyColor: StickyColor;
  selectedItemId: string | null;
  connectorStartId: string | null;
  draggingItemId: string | null;
  dragOffset: { x: number; y: number };
  items: WhiteboardItem[];
  screenToCanvasCoords: (x: number, y: number) => { x: number; y: number };
  updateItems: (update: WhiteboardItemsUpdate) => boolean;
  setSelectedItemId: (id: string | null) => void;
  setEditingItemId: (id: string | null) => void;
  setConnectorStartId: (id: string | null) => void;
  setDraggingItemId: (id: string | null) => void;
  setDragOffset: (offset: { x: number; y: number }) => void;
  setActiveTool: (tool: WhiteboardInteractionTool) => void;
  showToast: (message: string) => void;
  viewport: ViewportInput;
  updateCursor: (x: number, y: number) => void;
  manipulation: ManipulationInput;
}

export function useWhiteboardCanvasInput(options: Options) {
  // Marquee state is local to the pointer gesture: it is a selection affordance, not document data.
  const [marquee, setMarquee] = useState<WhiteboardMarqueeRect | null>(null);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeAdditive, setMarqueeAdditive] = useState(false);
  // A committed marquee is followed by a native click on the container; that click must not wipe it.
  const suppressClickRef = useRef(false);

  const insertCanvasItem = useCallback((item: WhiteboardItem, message: string, prepend = false): boolean =>
    commitWhiteboardItemMutation(
      options.updateItems,
      (previous) => prepend ? [item, ...previous] : [...previous, item],
      () => {
        options.setSelectedItemId(item.id);
        options.setEditingItemId(item.id);
        options.setActiveTool('select');
        options.showToast(message);
      },
    ), [options.setActiveTool, options.setEditingItemId, options.setSelectedItemId, options.showToast, options.updateItems]);

  const handleCanvasClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (event.target !== event.currentTarget && (event.target as HTMLElement).tagName !== 'svg') return;
    const point = options.screenToCanvasCoords(event.clientX, event.clientY);
    if (options.activeTool === 'sticky') {
      insertCanvasItem({
        id: secureRandomId('sticky'), type: 'sticky', color: options.selectedStickyColor,
        x: Math.round(point.x - 90), y: Math.round(point.y - 70), width: 180, height: 140,
        text: 'New thought or note...',
      }, `Added ${options.selectedStickyColor} sticky note`);
    } else if (options.activeTool === 'process') {
      insertCanvasItem({ id: secureRandomId('process'), type: 'process', x: Math.round(point.x - 90), y: Math.round(point.y - 40), width: 190, height: 80, text: 'Process Step' }, 'Added Process block');
    } else if (options.activeTool === 'decision') {
      insertCanvasItem({ id: secureRandomId('decision'), type: 'decision', x: Math.round(point.x - 70), y: Math.round(point.y - 50), width: 140, height: 100, text: 'Decision Condition?' }, 'Added Decision block');
    } else if (options.activeTool === 'terminal') {
      insertCanvasItem({ id: secureRandomId('terminal'), type: 'terminal', x: Math.round(point.x - 80), y: Math.round(point.y - 30), width: 160, height: 60, text: 'Start / End' }, 'Added Terminal block');
    } else if (options.activeTool === 'text') {
      insertCanvasItem({ id: secureRandomId('text'), type: 'text', x: Math.round(point.x - 120), y: Math.round(point.y - 30), width: 240, height: 60, text: 'Text block' }, 'Added text block');
    } else if (options.activeTool === 'frame') {
      insertCanvasItem({ id: secureRandomId('frame'), type: 'frame', x: Math.round(point.x - 320), y: Math.round(point.y - 180), width: 640, height: 360, text: 'Frame' }, 'Added 16:9 export frame', true);
    } else if (options.activeTool === 'select') {
      options.manipulation.clearSelection();
      options.setEditingItemId(null);
      options.setConnectorStartId(null);
    }
  }, [insertCanvasItem, options.activeTool, options.manipulation.clearSelection, options.screenToCanvasCoords, options.selectedStickyColor, options.setConnectorStartId, options.setEditingItemId]);

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    // Left-drag on empty canvas with the select tool is a marquee (Miro/Figma convention); panning
    // keeps the middle button, the pan tool, Alt+drag and the explicit viewport controls.
    const target = event.target as HTMLElement;
    const onEmptyCanvas = target === event.currentTarget || target.tagName === 'svg';
    if (options.activeTool === 'select' && event.button === 0 && !event.altKey && onEmptyCanvas) {
      const point = options.screenToCanvasCoords(event.clientX, event.clientY);
      setMarqueeStart(point);
      setMarquee({ x: point.x, y: point.y, width: 0, height: 0 });
      setMarqueeAdditive(event.shiftKey || event.ctrlKey || event.metaKey);
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) options.manipulation.clearSelection();
      return;
    }
    options.viewport.beginPan(event, options.activeTool);
  }, [options.activeTool, options.manipulation, options.screenToCanvasCoords, options.viewport]);

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const point = options.screenToCanvasCoords(event.clientX, event.clientY);
    options.updateCursor(point.x, point.y);
    if (options.viewport.movePan(event)) return;
    if (marqueeStart) {
      setMarquee(normalizeWhiteboardMarquee(marqueeStart, point));
      return;
    }
    if (options.draggingItemId) {
      options.manipulation.moveSelectionTo(
        options.draggingItemId,
        Math.round(point.x - options.dragOffset.x),
        Math.round(point.y - options.dragOffset.y),
      );
    }
  }, [marqueeStart, options.dragOffset.x, options.dragOffset.y, options.draggingItemId, options.manipulation, options.screenToCanvasCoords, options.updateCursor, options.viewport]);

  const handleMouseUp = useCallback(() => {
    if (marqueeStart && marquee && isWhiteboardMarqueeActive(marquee)) {
      const result = marqueeWhiteboardSelection(options.items, marquee, { mode: 'intersect' });
      if (!result.ok) options.showToast(result.reason);
      else if (marqueeAdditive) {
        options.manipulation.setSelection([...new Set([...options.manipulation.selectedItemIds, ...result.ids])]);
      } else options.manipulation.setSelection(result.ids);
      suppressClickRef.current = true;
    }
    setMarquee(null);
    setMarqueeStart(null);
    setMarqueeAdditive(false);
    options.viewport.endPan();
    options.manipulation.clearSnapGuides();
    options.setDraggingItemId(null);
  }, [marquee, marqueeAdditive, marqueeStart, options]);

  const handleItemMouseDown = useCallback((event: ReactMouseEvent, item: WhiteboardItem) => {
    event.stopPropagation();
    if (options.activeTool === 'connector') {
      if (!options.connectorStartId) {
        options.setConnectorStartId(item.id);
        options.showToast('Select target node to connect');
      } else if (options.connectorStartId !== item.id) {
        const startItem = options.items.find((candidate) => candidate.id === options.connectorStartId);
        if (!startItem) return;
        const newConnector: WhiteboardItem = {
          id: secureRandomId('connector'), type: 'connector', fromId: startItem.id, toId: item.id,
          fromAnchor: 'auto', toAnchor: 'auto', x: startItem.x + startItem.width,
          y: startItem.y + startItem.height / 2, width: item.x - (startItem.x + startItem.width),
          height: 20, text: '', lineLabel: 'Flow', connectorStyle: { route: 'orthogonal', autoRoute: true },
        };
        commitWhiteboardItemMutation(options.updateItems, (previous) => [...previous, newConnector], () => {
          options.setConnectorStartId(null);
          options.setActiveTool('select');
          options.showToast('Connected nodes successfully');
        });
      }
      return;
    }

    options.setSelectedItemId(item.id);
    if (options.activeTool !== 'select') return;
    options.manipulation.selectItem(item.id, event.shiftKey || event.ctrlKey || event.metaKey);
    if (item.locked) return;
    const point = options.screenToCanvasCoords(event.clientX, event.clientY);
    options.setDraggingItemId(item.id);
    options.setDragOffset({ x: point.x - item.x, y: point.y - item.y });
  }, [options.activeTool, options.connectorStartId, options.items, options.manipulation.selectItem, options.screenToCanvasCoords, options.setActiveTool, options.setConnectorStartId, options.setDragOffset, options.setDraggingItemId, options.setSelectedItemId, options.showToast, options.updateItems]);

  const handleChangeStickyColor = useCallback((color: StickyColor) => {
    if (!options.selectedItemId) return false;
    return commitWhiteboardItemMutation(options.updateItems,
      (previous) => previous.map((item) => item.id === options.selectedItemId ? { ...item, color } : item),
      () => options.showToast(`Sticky note updated to ${color}`),
    );
  }, [options.selectedItemId, options.showToast, options.updateItems]);

  const handleDeleteSelected = useCallback(() => {
    if (!options.selectedItemId && options.manipulation.selectedItemIds.length === 0) return false;
    if (!options.manipulation.deleteSelection()) return false;
    options.setEditingItemId(null);
    options.showToast('Element selection removed from canvas');
    return true;
  }, [options.manipulation.deleteSelection, options.manipulation.selectedItemIds, options.selectedItemId, options.setEditingItemId, options.showToast]);

  return { handleCanvasClick, handleMouseDown, handleMouseMove, handleMouseUp, handleItemMouseDown, handleChangeStickyColor, handleDeleteSelected, marquee };
}
