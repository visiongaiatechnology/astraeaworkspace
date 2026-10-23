// STATUS: DIAMANT VGT SUPREME
// Astraea Grid axis sizing: one scale object for column widths and row heights.
// Uniform grids are the special case of an empty override record, so hit testing,
// virtual windowing and rendering all share exactly one offset computation.

/**
 * Hard bounds for interactive resizing. These mirror the bounds the AutoFit
 * engine in formatting/gridFormattingEngine.ts applies; the accompanying test
 * pins that equivalence so the two can never drift apart silently.
 */
export const GRID_AXIS_BOUNDS = {
  row: { min: 22, max: 240 },
  col: { min: 48, max: 480 },
} as const;

export const GRID_DEFAULT_COL_WIDTH = 100;
export const GRID_DEFAULT_ROW_HEIGHT = 26;
export const GRID_HEADER_ROW_HEIGHT = 26;
export const GRID_HEADER_COL_WIDTH = 48;

export type GridAxis = 'row' | 'col';

export interface GridAxisScale {
  readonly axis: GridAxis;
  readonly count: number;
  readonly defaultSize: number;
  readonly total: number;
  size(index: number): number;
  offset(index: number): number;
  indexAt(pixel: number): number;
}

function clampSize(axis: GridAxis, size: number, zoom: number): number {
  const bounds = GRID_AXIS_BOUNDS[axis];
  const scaled = size * zoom;
  return Math.max(bounds.min, Math.min(bounds.max, scaled));
}

export function buildGridAxisScale(
  axis: GridAxis,
  count: number,
  overrides: Readonly<Record<number, number>> | undefined,
  defaultSize: number,
  zoom = 1,
): GridAxisScale {
  const safeCount = Math.max(0, Math.floor(count));
  const baseSize = Math.max(1, defaultSize * zoom);
  const keys: number[] = [];
  const deltaPrefix: number[] = [];
  let runningDelta = 0;
  if (overrides) {
    for (const key of Object.keys(overrides)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= safeCount) continue;
      keys.push(index);
    }
    keys.sort((a, b) => a - b);
    for (const index of keys) {
      const override = overrides[index];
      const size = Number.isFinite(override) ? clampSize(axis, override, zoom) : baseSize;
      runningDelta += size - baseSize;
      deltaPrefix.push(runningDelta);
    }
  }
  const total = safeCount * baseSize + runningDelta;

  const keysBelow = (index: number): number => {
    let low = 0;
    let high = keys.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (keys[mid] < index) low = mid + 1;
      else high = mid;
    }
    return low;
  };

  const size = (index: number): number => {
    if (index < 0 || index >= safeCount) return baseSize;
    const override = overrides?.[index];
    return Number.isFinite(override) ? clampSize(axis, override as number, zoom) : baseSize;
  };

  const offset = (index: number): number => {
    const bounded = Math.max(0, Math.min(safeCount, index));
    const below = keysBelow(bounded);
    return bounded * baseSize + (below > 0 ? deltaPrefix[below - 1] : 0);
  };

  const indexAt = (pixel: number): number => {
    if (safeCount === 0) return 0;
    if (pixel <= 0) return 0;
    if (pixel >= total) return safeCount - 1;
    let low = 0;
    let high = safeCount - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (offset(mid) <= pixel) low = mid;
      else high = mid - 1;
    }
    return low;
  };

  return { axis, count: safeCount, defaultSize: baseSize, total, size, offset, indexAt };
}

export interface GridAxisRange {
  readonly start: number;
  readonly end: number;
}

export function resolveGridVisibleAxisRange(
  scale: GridAxisScale,
  scrollOffset: number,
  viewportSize: number,
  overscan: number,
): GridAxisRange {
  if (scale.count <= 0) return { start: 0, end: 0 };
  const viewport = Math.max(1, viewportSize);
  const start = Math.max(0, Math.min(scale.count - 1, scale.indexAt(scrollOffset) - overscan));
  const end = Math.max(start, Math.min(scale.count - 1, scale.indexAt(scrollOffset + viewport - 1) + overscan));
  return { start, end };
}

/** Interactive resize: pixels are divided by zoom before the bounds are applied. */
export function resolveGridAxisResize(axis: GridAxis, currentSize: number, deltaPixels: number, zoom = 1): number {
  const bounds = GRID_AXIS_BOUNDS[axis];
  const effectiveZoom = zoom > 0 ? zoom : 1;
  const next = currentSize + deltaPixels / effectiveZoom;
  return Math.round(Math.max(bounds.min, Math.min(bounds.max, next)));
}

export function resolveGridAxisSize(
  axis: GridAxis,
  overrides: Readonly<Record<number, number>> | undefined,
  index: number,
  zoom = 1,
): number {
  const bounds = GRID_AXIS_BOUNDS[axis];
  const override = overrides?.[index];
  const base = axis === 'col' ? GRID_DEFAULT_COL_WIDTH : GRID_DEFAULT_ROW_HEIGHT;
  const size = Number.isFinite(override) ? (override as number) : base;
  return Math.max(bounds.min, Math.min(bounds.max, size * zoom));
}
