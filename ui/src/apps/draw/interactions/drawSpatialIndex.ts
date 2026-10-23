// STATUS: PLATIN — bounded uniform-grid spatial index for Draw hit-testing, marquee and snapping.
import type { DrawBounds, DrawObjectId } from '../../../shared/contracts/draw/workspaceDraw';
import { drawObjectWorldBounds, drawBoundsIntersect, expandDrawBounds } from './drawGeometry';
import { DrawModelError } from '../model/drawDocumentValidation';
import type { DrawScene, DrawSceneEntry } from './drawSceneProjection';

/** Hard ceiling on grid cells so a pathological page size can never allocate an unbounded index. */
export const MAX_DRAW_INDEX_CELLS = 4096;
export const DEFAULT_DRAW_INDEX_TARGET_CELLS = 1024;

export interface DrawSpatialIndex {
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly originX: number;
  readonly originY: number;
  /** Cell key = row * columns + column. */
  readonly cells: ReadonlyMap<number, readonly DrawObjectId[]>;
  readonly bounds: DrawBounds;
  /** True when the target cell budget forced a coarser cell than requested (still correct). */
  readonly coarse: boolean;
}

function chooseCellSize(bounds: DrawBounds, targetCells: number): number {
  const area = Math.max(1, bounds.width) * Math.max(1, bounds.height);
  const ideal = Math.sqrt(area / Math.max(1, targetCells));
  return Math.max(8, ideal);
}

/**
 * Builds a uniform grid over the world bounds of all indexable entries. Complexity is O(n) in the
 * number of entries and the cell count is capped, so the index itself is bounded.
 */
export function buildDrawSpatialIndex(
  scene: DrawScene,
  entries: readonly DrawSceneEntry[] = scene.entries,
  targetCells: number = DEFAULT_DRAW_INDEX_TARGET_CELLS,
): DrawSpatialIndex {
  if (!Number.isSafeInteger(targetCells) || targetCells < 1) throw new DrawModelError('index-target-invalid');
  const boundedTarget = Math.min(targetCells, MAX_DRAW_INDEX_CELLS);

  let minX = 0;
  let minY = 0;
  let maxX = scene.width;
  let maxY = scene.height;
  for (const entry of entries) {
    const bounds = drawObjectWorldBounds(entry.object);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  const bounds: DrawBounds = { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };

  let cellSize = chooseCellSize(bounds, boundedTarget);
  let columns = Math.max(1, Math.ceil(bounds.width / cellSize));
  let rows = Math.max(1, Math.ceil(bounds.height / cellSize));
  let coarse = false;
  while (columns * rows > MAX_DRAW_INDEX_CELLS) {
    coarse = true;
    cellSize *= 2;
    columns = Math.max(1, Math.ceil(bounds.width / cellSize));
    rows = Math.max(1, Math.ceil(bounds.height / cellSize));
  }

  const cells = new Map<number, DrawObjectId[]>();
  const column = (value: number): number => Math.max(0, Math.min(columns - 1, Math.floor((value - bounds.x) / cellSize)));
  const row = (value: number): number => Math.max(0, Math.min(rows - 1, Math.floor((value - bounds.y) / cellSize)));

  for (const entry of entries) {
    const box = drawObjectWorldBounds(entry.object);
    const fromColumn = column(box.x);
    const toColumn = column(box.x + box.width);
    const fromRow = row(box.y);
    const toRow = row(box.y + box.height);
    for (let currentRow = fromRow; currentRow <= toRow; currentRow += 1) {
      for (let currentColumn = fromColumn; currentColumn <= toColumn; currentColumn += 1) {
        const key = currentRow * columns + currentColumn;
        const bucket = cells.get(key);
        if (bucket) bucket.push(entry.object.id);
        else cells.set(key, [entry.object.id]);
      }
    }
  }

  return { cellSize, columns, rows, originX: bounds.x, originY: bounds.y, cells, bounds, coarse };
}

/**
 * Returns the ids whose indexed cell overlaps `rect`, de-duplicated and capped. `limit` bounds the
 * candidate set so marquee selection over a very large page stays interactive.
 */
export function queryDrawSpatialIndex(index: DrawSpatialIndex, rect: DrawBounds, limit: number): DrawObjectId[] {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new DrawModelError('index-limit-invalid');
  const query = expandDrawBounds(rect, 0);
  const column = (value: number): number => Math.max(0, Math.min(index.columns - 1, Math.floor((value - index.originX) / index.cellSize)));
  const row = (value: number): number => Math.max(0, Math.min(index.rows - 1, Math.floor((value - index.originY) / index.cellSize)));
  const fromColumn = column(query.x);
  const toColumn = column(query.x + query.width);
  const fromRow = row(query.y);
  const toRow = row(query.y + query.height);

  const seen = new Set<DrawObjectId>();
  const found: DrawObjectId[] = [];
  for (let currentRow = fromRow; currentRow <= toRow; currentRow += 1) {
    for (let currentColumn = fromColumn; currentColumn <= toColumn; currentColumn += 1) {
      const bucket = index.cells.get(currentRow * index.columns + currentColumn);
      if (!bucket) continue;
      for (const id of bucket) {
        if (seen.has(id)) continue;
        seen.add(id);
        found.push(id);
        if (found.length >= limit) return found;
      }
    }
  }
  return found;
}

/** Index candidate ids whose world bounds actually intersect `rect`. */
export function queryDrawSpatialIndexExact(
  index: DrawSpatialIndex,
  scene: DrawScene,
  rect: DrawBounds,
  limit: number,
): DrawSceneEntry[] {
  const candidates = queryDrawSpatialIndex(index, rect, limit * 4);
  const result: DrawSceneEntry[] = [];
  for (const id of candidates) {
    const entry = scene.byId.get(id);
    if (!entry) continue;
    if (!drawBoundsIntersect(drawObjectWorldBounds(entry.object), rect)) continue;
    result.push(entry);
    if (result.length >= limit) break;
  }
  return result;
}
