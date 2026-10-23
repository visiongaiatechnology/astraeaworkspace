// STATUS: DIAMANT VGT SUPREME — shared O(1) virtualization window calculations

export interface VirtualAxisWindow {
  start: number;
  end: number;
  count: number;
}

export interface VirtualWindow {
  rows: VirtualAxisWindow;
  columns: VirtualAxisWindow;
}

export interface VirtualWindowInput {
  rowCount: number;
  columnCount: number;
  rowHeight: number;
  columnWidth: number;
  scrollTop: number;
  scrollLeft: number;
  viewportHeight: number;
  viewportWidth: number;
  overscanRows?: number;
  overscanColumns?: number;
}

function axisWindow(total: number, size: number, scroll: number, viewport: number, overscan: number): VirtualAxisWindow {
  const count = Math.max(0, Math.trunc(total));
  if (count === 0) return { start: 0, end: -1, count: 0 };
  const safeSize = Math.max(0.01, size);
  const start = Math.max(0, Math.floor(Math.max(0, scroll) / safeSize) - Math.max(0, Math.trunc(overscan)));
  const end = Math.min(count - 1, Math.ceil((Math.max(0, scroll) + Math.max(0, viewport)) / safeSize) + Math.max(0, Math.trunc(overscan)));
  return { start, end, count: Math.max(0, end - start + 1) };
}

export function computeVirtualWindow(input: VirtualWindowInput): VirtualWindow {
  return {
    rows: axisWindow(input.rowCount, input.rowHeight, input.scrollTop, input.viewportHeight, input.overscanRows ?? 0),
    columns: axisWindow(input.columnCount, input.columnWidth, input.scrollLeft, input.viewportWidth, input.overscanColumns ?? 0),
  };
}
