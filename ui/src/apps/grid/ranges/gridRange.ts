// STATUS: DIAMANT VGT SUPREME — Grid range parsing leaf
import { parseCoord } from '../core/gridCoordinate';

export interface GridRangeBounds {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
}

export function parseGridRange(range: string): GridRangeBounds | null {
  const normalized = range.toUpperCase().trim();
  if (!/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/.test(normalized)) return null;
  const parts = normalized.split(':');
  const start = parseCoord(parts[0]);
  const end = parseCoord(parts[1] || parts[0]);
  if (start.rowIdx < 0 || start.colIdx < 0 || end.rowIdx < 0 || end.colIdx < 0) return null;
  return {
    startCol: Math.min(start.colIdx, end.colIdx),
    endCol: Math.max(start.colIdx, end.colIdx),
    startRow: Math.min(start.rowIdx, end.rowIdx),
    endRow: Math.max(start.rowIdx, end.rowIdx),
  };
}
