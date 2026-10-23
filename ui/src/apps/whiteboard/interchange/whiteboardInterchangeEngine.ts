// STATUS: PLATIN
// Bounded Whiteboard SVG export and frame decomposition. Native containers use encrypted VGT formats.

import { normalizeWhiteboardRichObject } from '../model/whiteboardObjectEngine';
import { renderWhiteboardProjectionToSvg } from './whiteboardSvgRenderProjection';
import { validateAndNormalizeWhiteboardItems, WHITEBOARD_MAX_ITEMS } from '../viewport/whiteboardViewportEngine';
import type { WhiteboardItem } from '../types';

export interface WhiteboardFrameSlice {
  frameId: string;
  title: string;
  bounds: { x: number; y: number; width: number; height: number };
  containedItems: WhiteboardItem[];
}

const MAX_FRAME_ITEM_VISITS = 2_000_000;

function canonicalItems(items: readonly WhiteboardItem[]): WhiteboardItem[] {
  if (!Array.isArray(items) || items.length > WHITEBOARD_MAX_ITEMS) {
    throw new Error('Whiteboard item count exceeds the interchange policy');
  }
  for (const item of items) {
    if (typeof item !== 'object' || item === null || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 256) {
      throw new Error('Whiteboard item identity is invalid');
    }
  }
  const normalized = validateAndNormalizeWhiteboardItems(items.map(normalizeWhiteboardRichObject));
  if (!normalized.ok) throw new Error(normalized.reason);
  return normalized.items;
}

export function exportWhiteboardToSvg(documentTitle: string, items: readonly WhiteboardItem[]): string {
  if (typeof documentTitle !== 'string' || documentTitle.length > 4_096) {
    throw new Error('Whiteboard SVG title exceeds the export policy');
  }
  const svg = renderWhiteboardProjectionToSvg(documentTitle, canonicalItems(items));
  return svg;
}

function isInsideFrame(item: WhiteboardItem, frame: WhiteboardItem): boolean {
  return item.x >= frame.x
    && item.x + item.width <= frame.x + frame.width
    && item.y >= frame.y
    && item.y + item.height <= frame.y + frame.height;
}

export function decomposeWhiteboardFrames(sourceItems: readonly WhiteboardItem[]): WhiteboardFrameSlice[] {
  const items = canonicalItems(sourceItems);
  const frames = items.filter((item) => item.type === 'frame');
  if (frames.length === 0) {
    let found = false;
    let minX = 0;
    let minY = 0;
    let maxX = 1_200;
    let maxY = 800;
    for (const item of items) {
      if (item.type === 'connector') continue;
      if (!found) {
        minX = item.x;
        minY = item.y;
        maxX = item.x + item.width;
        maxY = item.y + item.height;
        found = true;
      } else {
        minX = Math.min(minX, item.x);
        minY = Math.min(minY, item.y);
        maxX = Math.max(maxX, item.x + item.width);
        maxY = Math.max(maxY, item.y + item.height);
      }
    }
    return [{
      frameId: 'root_board',
      title: 'Full Whiteboard',
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      containedItems: items.map((item) => ({ ...item })),
    }];
  }

  if (items.length > 0 && frames.length > Math.floor(MAX_FRAME_ITEM_VISITS / items.length)) {
    throw new Error('Whiteboard frame decomposition exceeds the processing policy');
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));
  return frames.map((frame, index) => {
    const containedItems: WhiteboardItem[] = [];
    for (const item of items) {
      if (item.id === frame.id) continue;
      if (item.type === 'connector') {
        const from = item.fromId ? itemsById.get(item.fromId) : undefined;
        const to = item.toId ? itemsById.get(item.toId) : undefined;
        if (from && to && isInsideFrame(from, frame) && isInsideFrame(to, frame)) {
          containedItems.push({ ...item });
        }
      } else if (isInsideFrame(item, frame)) {
        containedItems.push({ ...item });
      }
    }

    return {
      frameId: frame.id,
      title: frame.text || `Frame ${index + 1}`,
      bounds: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      containedItems,
    };
  });
}
