// STATUS: DIAMANT VGT SUPREME — bounded tile virtualization, incremental invalidation and frame-budget evidence

export interface TileViewportInput {
  contentWidth: number;
  contentHeight: number;
  viewportX: number;
  viewportY: number;
  viewportWidth: number;
  viewportHeight: number;
  tileSize?: number;
  overscanTiles?: number;
}
export interface RenderTile { x: number; y: number; width: number; height: number; column: number; row: number; key: string; }

const MAX_CONTENT_EXTENT = 2_147_483_647;
const MAX_VISIBLE_TILES = 4096;

function boundedFinite(value: number, min: number, max: number, code: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(code);
  return value;
}

export function computeVisibleTiles(input: TileViewportInput): RenderTile[] {
  const contentWidth = boundedFinite(input.contentWidth, 0, MAX_CONTENT_EXTENT, 'render_tile_content_width_invalid');
  const contentHeight = boundedFinite(input.contentHeight, 0, MAX_CONTENT_EXTENT, 'render_tile_content_height_invalid');
  const viewportX = boundedFinite(input.viewportX, 0, MAX_CONTENT_EXTENT, 'render_tile_viewport_x_invalid');
  const viewportY = boundedFinite(input.viewportY, 0, MAX_CONTENT_EXTENT, 'render_tile_viewport_y_invalid');
  const viewportWidth = boundedFinite(input.viewportWidth, 0, 131_072, 'render_tile_viewport_width_invalid');
  const viewportHeight = boundedFinite(input.viewportHeight, 0, 131_072, 'render_tile_viewport_height_invalid');
  const tileSize = Math.trunc(boundedFinite(input.tileSize ?? 512, 64, 4096, 'render_tile_size_invalid'));
  const overscan = Math.trunc(boundedFinite(input.overscanTiles ?? 1, 0, 8, 'render_tile_overscan_invalid'));
  if (!contentWidth || !contentHeight || !viewportWidth || !viewportHeight) return [];
  const startColumn = Math.max(0, Math.floor(viewportX / tileSize) - overscan);
  const startRow = Math.max(0, Math.floor(viewportY / tileSize) - overscan);
  const endColumn = Math.min(Math.max(0, Math.ceil(contentWidth / tileSize) - 1), Math.floor((viewportX + viewportWidth) / tileSize) + overscan);
  const endRow = Math.min(Math.max(0, Math.ceil(contentHeight / tileSize) - 1), Math.floor((viewportY + viewportHeight) / tileSize) + overscan);
  const count = Math.max(0, endColumn - startColumn + 1) * Math.max(0, endRow - startRow + 1);
  if (count > MAX_VISIBLE_TILES) throw new Error('render_tile_visible_limit');
  const result: RenderTile[] = [];
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const x = column * tileSize;
      const y = row * tileSize;
      result.push({ x, y, width: Math.min(tileSize, contentWidth - x), height: Math.min(tileSize, contentHeight - y), column, row, key: `${column}:${row}` });
    }
  }
  return result;
}

export interface LayoutDependencyNode { id: string; dependsOn?: readonly string[]; }
export interface LayoutInvalidationResult { dirty: Set<string>; visitedEdges: number; }

export function invalidateLayoutIncrementally(nodes: readonly LayoutDependencyNode[], changedIds: readonly string[], signal?: AbortSignal): LayoutInvalidationResult {
  if (nodes.length > 250_000 || changedIds.length > 50_000) throw new Error('render_invalidation_limit');
  const reverse = new Map<string, string[]>();
  for (const node of nodes) {
    if (signal?.aborted) throw new DOMException('Layout invalidation aborted', 'AbortError');
    if (!node.id || node.id.length > 256) throw new Error('render_invalidation_id_invalid');
    for (const dep of node.dependsOn ?? []) {
      const list = reverse.get(dep) ?? [];
      list.push(node.id);
      reverse.set(dep, list);
    }
  }
  const dirty = new Set<string>();
  const queue = [...changedIds];
  let visitedEdges = 0;
  while (queue.length) {
    if (signal?.aborted) throw new DOMException('Layout invalidation aborted', 'AbortError');
    const id = queue.shift()!;
    if (dirty.has(id)) continue;
    dirty.add(id);
    for (const child of reverse.get(id) ?? []) { visitedEdges += 1; if (!dirty.has(child)) queue.push(child); }
    if (visitedEdges > 2_000_000) throw new Error('render_invalidation_edge_limit');
  }
  return { dirty, visitedEdges };
}

export interface FrameBudgetSample { elapsedMs: number; workUnits: number; label?: string; }
export interface FrameBudgetReport { budgetMs: number; samples: number; averageMs: number; p95Ms: number; maxMs: number; overBudget: number; targetMet: boolean; }

export function profileFrameBudget(samples: readonly FrameBudgetSample[], budgetMs = 16.667): FrameBudgetReport {
  if (!samples.length || samples.length > 100_000) throw new Error('render_frame_samples_invalid');
  if (!Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > 1000) throw new Error('render_frame_budget_invalid');
  const values = samples.map((sample) => {
    if (!Number.isFinite(sample.elapsedMs) || sample.elapsedMs < 0 || !Number.isFinite(sample.workUnits) || sample.workUnits < 0) throw new Error('render_frame_sample_invalid');
    return sample.elapsedMs;
  }).sort((a, b) => a - b);
  const averageMs = values.reduce((a, b) => a + b, 0) / values.length;
  const p95Ms = values[Math.min(values.length - 1, Math.floor((values.length - 1) * 0.95))]!;
  const maxMs = values[values.length - 1]!;
  const overBudget = values.filter((value) => value > budgetMs).length;
  return { budgetMs, samples: values.length, averageMs, p95Ms, maxMs, overBudget, targetMet: p95Ms <= budgetMs };
}
