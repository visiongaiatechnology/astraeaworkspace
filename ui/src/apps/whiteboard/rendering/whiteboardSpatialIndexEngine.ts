// STATUS: DIAMANT VGT SUPREME
// Astraea Whiteboard 2D Spatial Index & Infinite Canvas Virtualization Engine
// High-performance spatial partitioning, viewport culling & OOM resource ceiling enforcement

import { WHITEBOARD_MAX_ITEMS } from '../types';
import type { WhiteboardItem } from '../types';

const MIN_CELL_SIZE = 1;
const MAX_CELL_SIZE = 1_000_000;
const MAX_QUERY_CELL_VISITS = 16_384;

const hasFiniteGeometry = (item: WhiteboardItem): boolean =>
  Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.width) && Number.isFinite(item.height)
  && item.width >= 0 && item.height >= 0
  && Number.isFinite(item.x + Math.max(1, item.width)) && Number.isFinite(item.y + Math.max(1, item.height));

const intersects = (left: BoundingBox, right: BoundingBox): boolean =>
  left.minX <= right.maxX && left.maxX >= right.minX && left.minY <= right.maxY && left.maxY >= right.minY;

const hasValidBoundingBox = (box: BoundingBox): boolean =>
  Number.isFinite(box.minX) && Number.isFinite(box.minY) && Number.isFinite(box.maxX) && Number.isFinite(box.maxY)
  && box.minX <= box.maxX && box.minY <= box.maxY;

const assertWithinItemLimit = (items: readonly WhiteboardItem[]): void => {
  if (!Array.isArray(items) || items.length > WHITEBOARD_MAX_ITEMS) {
    throw new RangeError(`Whiteboard item ceiling exceeded (${WHITEBOARD_MAX_ITEMS}).`);
  }
};

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface VirtualizationMetrics {
  totalItems: number;
  visibleItems: number;
  culledPercentage: number;
  activeBuckets: number;
  memoryEstimateBytes: number;
  formattedMemory: string;
}

/**
 * 2D Spatial Hash Grid Index for Infinite Canvas
 * Scales viewport culling and raycast collision detection to 50,000+ objects
 */
export class WhiteboardSpatialIndex {
  private cellSize: number;
  private grid: Map<string, Set<string>> = new Map();
  private itemMap: Map<string, WhiteboardItem> = new Map();
  private itemBounds: Map<string, BoundingBox> = new Map();
  private oversizedItemIds: Set<string> = new Set();
  private readonly maxBucketsPerItem = 4096;

  constructor(cellSize: number = 512) {
    if (!Number.isFinite(cellSize) || cellSize < MIN_CELL_SIZE || cellSize > MAX_CELL_SIZE) {
      throw new RangeError(`Spatial cell size must be between ${MIN_CELL_SIZE} and ${MAX_CELL_SIZE}.`);
    }
    this.cellSize = cellSize;
  }

  private hashCoords(cellX: number, cellY: number): string {
    return `${cellX}:${cellY}`;
  }

  private getItemBox(item: WhiteboardItem): BoundingBox {
    if (item.type === 'connector') {
      const from = this.itemMap.get(item.fromId || '');
      const to = this.itemMap.get(item.toId || '');
      if (from && to) {
        return {
          minX: Math.min(from.x, to.x),
          minY: Math.min(from.y, to.y),
          maxX: Math.max(from.x + from.width, to.x + to.width),
          maxY: Math.max(from.y + from.height, to.y + to.height),
        };
      }
    }
    return {
      minX: item.x,
      minY: item.y,
      maxX: item.x + Math.max(1, item.width),
      maxY: item.y + Math.max(1, item.height),
    };
  }

  /**
   * Rebuilds the entire spatial index from a list of whiteboard items
   */
  public rebuild(items: WhiteboardItem[]): void {
    assertWithinItemLimit(items);
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length === 0 || seen.has(item.id)) {
        throw new TypeError('Spatial index requires unique, non-empty item IDs.');
      }
      if (!hasFiniteGeometry(item)) throw new TypeError('Spatial index requires finite, non-negative item geometry.');
      seen.add(item.id);
    }
    this.clear();
    for (const item of items) {
      this.itemMap.set(item.id, item);
    }
    for (const item of items) {
      this.insert(item);
    }
  }

  public clear(): void {
    this.grid.clear();
    this.itemMap.clear();
    this.itemBounds.clear();
    this.oversizedItemIds.clear();
  }

  public insert(item: WhiteboardItem): void {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length === 0 || !hasFiniteGeometry(item)) {
      throw new TypeError('Spatial index requires an item with an ID and finite, non-negative geometry.');
    }
    if (!this.itemMap.has(item.id) && this.itemMap.size >= WHITEBOARD_MAX_ITEMS) {
      throw new RangeError(`Whiteboard item ceiling exceeded (${WHITEBOARD_MAX_ITEMS}).`);
    }
    this.remove(item.id);
    this.itemMap.set(item.id, item);
    const box = this.getItemBox(item);
    this.itemBounds.set(item.id, box);

    const minCellX = Math.floor(box.minX / this.cellSize);
    const maxCellX = Math.floor(box.maxX / this.cellSize);
    const minCellY = Math.floor(box.minY / this.cellSize);
    const maxCellY = Math.floor(box.maxY / this.cellSize);
    const bucketCount = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);
    if (!Number.isFinite(bucketCount) || bucketCount > this.maxBucketsPerItem) {
      this.oversizedItemIds.add(item.id);
      return;
    }

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = this.hashCoords(cx, cy);
        let set = this.grid.get(key);
        if (!set) {
          set = new Set();
          this.grid.set(key, set);
        }
        set.add(item.id);
      }
    }
  }

  public remove(itemId: string): void {
    const box = this.itemBounds.get(itemId);
    if (!box) return;
    if (this.oversizedItemIds.delete(itemId)) {
      this.itemMap.delete(itemId);
      this.itemBounds.delete(itemId);
      return;
    }

    const minCellX = Math.floor(box.minX / this.cellSize);
    const maxCellX = Math.floor(box.maxX / this.cellSize);
    const minCellY = Math.floor(box.minY / this.cellSize);
    const maxCellY = Math.floor(box.maxY / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = this.hashCoords(cx, cy);
        const set = this.grid.get(key);
        if (set) {
          set.delete(itemId);
          if (set.size === 0) {
            this.grid.delete(key);
          }
        }
      }
    }

    this.itemMap.delete(itemId);
    this.itemBounds.delete(itemId);
  }

  /**
   * Fast viewport culling query: returns only items intersecting the visible bounding box
   */
  public queryViewport(viewport: BoundingBox): WhiteboardItem[] {
    if (!hasValidBoundingBox(viewport)) return [];
    const minCellX = Math.floor(viewport.minX / this.cellSize);
    const maxCellX = Math.floor(viewport.maxX / this.cellSize);
    const minCellY = Math.floor(viewport.minY / this.cellSize);
    const maxCellY = Math.floor(viewport.maxY / this.cellSize);
    const columns = maxCellX - minCellX + 1;
    const rows = maxCellY - minCellY + 1;
    const cellVisits = columns * rows;
    if (!Number.isFinite(cellVisits) || cellVisits < 1 || cellVisits > MAX_QUERY_CELL_VISITS) {
      return this.queryViewportByBounds(viewport);
    }

    const candidateIds = new Set<string>(this.oversizedItemIds);
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = this.hashCoords(cx, cy);
        const cellItems = this.grid.get(key);
        if (cellItems) {
          for (const id of cellItems) {
            candidateIds.add(id);
          }
        }
      }
    }

    // Precise AABB intersection test
    const results: WhiteboardItem[] = [];
    for (const id of candidateIds) {
      const box = this.itemBounds.get(id);
      const item = this.itemMap.get(id);
      if (box && item) {
        if (intersects(box, viewport)) results.push(item);
      }
    }
    return results;
  }

  /**
   * Point raycast query (e.g. for mouse picking / hit testing)
   */
  public queryPoint(x: number, y: number): WhiteboardItem[] {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    const key = this.hashCoords(cellX, cellY);
    const candidateIds = new Set<string>(this.oversizedItemIds);
    const cellItems = this.grid.get(key);
    if (cellItems) for (const id of cellItems) candidateIds.add(id);

    const hitItems: WhiteboardItem[] = [];
    for (const id of candidateIds) {
      const box = this.itemBounds.get(id);
      const item = this.itemMap.get(id);
      if (box && item) {
        if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY) {
          hitItems.push(item);
        }
      }
    }
    return hitItems;
  }

  public getActiveCellCount(): number {
    return this.grid.size;
  }

  private queryViewportByBounds(viewport: BoundingBox): WhiteboardItem[] {
    const results: WhiteboardItem[] = [];
    for (const [id, box] of this.itemBounds) {
      const item = this.itemMap.get(id);
      if (item && intersects(box, viewport)) results.push(item);
    }
    return results;
  }
}

/**
 * Calculates global bounding box of all items
 */
export function calculateCanvasBounds(items: WhiteboardItem[]): BoundingBox {
  assertWithinItemLimit(items);
  let found = false;
  let minX = 0;
  let minY = 0;
  let maxX = 1200;
  let maxY = 800;
  for (const item of items) {
    if (item.type === 'connector') continue;
    const itemMinX = Number.isFinite(item.x) ? item.x : 0;
    const itemMinY = Number.isFinite(item.y) ? item.y : 0;
    const itemMaxX = itemMinX + Math.max(1, Number.isFinite(item.width) ? item.width : 1);
    const itemMaxY = itemMinY + Math.max(1, Number.isFinite(item.height) ? item.height : 1);
    if (!found) { minX = itemMinX; minY = itemMinY; maxX = itemMaxX; maxY = itemMaxY; found = true; continue; }
    minX = Math.min(minX, itemMinX);
    minY = Math.min(minY, itemMinY);
    maxX = Math.max(maxX, itemMaxX);
    maxY = Math.max(maxY, itemMaxY);
  }
  return found ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 1200, maxY: 800 };
}

/**
 * Estimate memory consumption of canvas items to prevent Out-Of-Memory (OOM)
 */
export function estimateMemoryFootprint(items: WhiteboardItem[]): {
  totalBytes: number;
  imageBytes: number;
  textBytes: number;
  formattedSize: string;
} {
  assertWithinItemLimit(items);
  let imageBytes = 0;
  let textBytes = 0;

  for (const it of items) {
    // Structural overhead ~ 128 bytes per node
    textBytes += 128;
    if (it.text) textBytes += it.text.length * 2;
    if (it.lineLabel) textBytes += it.lineLabel.length * 2;
    if (it.dataUrl) {
      // Base64 byte length approx 3/4 string length
      const commaIndex = it.dataUrl.indexOf(',');
      const b64Data = commaIndex >= 0 ? it.dataUrl.slice(commaIndex + 1) : it.dataUrl;
      imageBytes += Math.round((b64Data.length * 3) / 4);
    }
  }

  const totalBytes = imageBytes + textBytes;
  let formattedSize = `${(totalBytes / 1024).toFixed(1)} KB`;
  if (totalBytes > 1024 * 1024) {
    formattedSize = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return { totalBytes, imageBytes, textBytes, formattedSize };
}

/**
 * Enforces resource ceilings: trims oversized or orphaned items if memory ceiling is exceeded
 */
export function enforceResourceCeiling(
  items: WhiteboardItem[],
  maxMemoryBytes: number = 25 * 1024 * 1024 // 25 MB safety boundary
): { safeItems: WhiteboardItem[]; culledCount: number; memoryFreed: number } {
  const current = estimateMemoryFootprint(items);
  if (current.totalBytes <= maxMemoryBytes) {
    return { safeItems: items, culledCount: 0, memoryFreed: 0 };
  }

  let freed = 0;
  let culled = 0;
  const safe: WhiteboardItem[] = [];

  // Preserve non-image elements first; downscale or omit oversized embedded images if critical
  for (const item of items) {
    if (item.type === 'image' && item.dataUrl && current.totalBytes - freed > maxMemoryBytes) {
      const itemSize = Math.round((item.dataUrl.length * 3) / 4);
      freed += itemSize;
      culled++;
      // Substitute placeholder text note rather than crashing the canvas
      safe.push({
        ...item,
        type: 'sticky',
        color: 'purple',
        text: `[Image pruned by OOM Ceiling: ${(itemSize / 1024).toFixed(0)} KB]`,
        dataUrl: undefined,
      });
    } else {
      safe.push(item);
    }
  }

  return { safeItems: safe, culledCount: culled, memoryFreed: freed };
}

/**
 * Calculates real-time virtualization performance metrics
 */
export function getVirtualizationStats(
  items: WhiteboardItem[],
  viewport: BoundingBox
): VirtualizationMetrics {
  const index = new WhiteboardSpatialIndex(512);
  index.rebuild(items);
  const visible = index.queryViewport(viewport);
  const mem = estimateMemoryFootprint(items);

  const culledPercentage =
    items.length > 0 ? Math.round(((items.length - visible.length) / items.length) * 100) : 0;

  return {
    totalItems: items.length,
    visibleItems: visible.length,
    culledPercentage,
    activeBuckets: index.getActiveCellCount(),
    memoryEstimateBytes: mem.totalBytes,
    formattedMemory: mem.formattedSize,
  };
}
