// STATUS: DIAMANT VGT SUPREME
// Astraea Grid clipboard engine. Cut is a real move (source is cleared), paste
// delegates cell semantics to the canonical range paste helper so that formats,
// values, transpose and formula shifting keep exactly one implementation.

import type { GridCell } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseCoord } from '../compat/gridUtils';
import { parseGridRange } from '../compat/gridProfessional';
import { gridRangeCoordinates, pasteSpecialToRange } from './gridSelection';

export type GridClipboardMode = 'all' | 'values' | 'formats' | 'transpose';

export interface GridClipboardPayload {
  readonly cells: Record<string, GridCell>;
  readonly isCut: boolean;
  readonly sourceRange: string;
  /** Widths of the copied columns, keyed by offset from the first copied column. */
  readonly columnWidths?: Readonly<Record<number, number>>;
}

export interface GridPasteOutcome {
  readonly cells: Record<string, GridCell>;
  readonly changedCoords: string[];
  /** null once a cut payload has been consumed; a copy payload stays available. */
  readonly clipboardAfter: GridClipboardPayload | null;
}

export interface GridPasteRequest {
  readonly cells: Readonly<Record<string, GridCell>>;
  readonly payload: GridClipboardPayload;
  readonly targetAnchor: string;
  readonly mode: GridClipboardMode;
}

export function captureGridClipboard(
  cells: Readonly<Record<string, GridCell>>,
  range: string,
  isCut: boolean,
  sheetColumnWidths?: Readonly<Record<number, number>>,
): GridClipboardPayload {
  const captured: Record<string, GridCell> = {};
  for (const coord of gridRangeCoordinates(range)) {
    const cell = cells[coord];
    if (cell) captured[coord] = { ...cell };
  }
  const bounds = parseGridRange(range.toUpperCase());
  const columnWidths: Record<number, number> = {};
  if (bounds && sheetColumnWidths) {
    for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
      const width = sheetColumnWidths[col];
      if (Number.isFinite(width)) columnWidths[col - bounds.startCol] = width;
    }
  }
  return {
    cells: captured,
    isCut,
    sourceRange: range.toUpperCase(),
    ...(Object.keys(columnWidths).length > 0 ? { columnWidths } : {}),
  };
}

/**
 * Resolves source -> destination coordinates with exactly the same origin and
 * transpose rules the range paste helper uses, so a cut can tell which source
 * cells survive the move.
 */
export function resolveGridPasteDestinations(
  payload: GridClipboardPayload,
  targetAnchor: string,
  mode: GridClipboardMode,
): Map<string, string> {
  const destinations = new Map<string, string>();
  const sourceCoords = Object.keys(payload.cells);
  if (sourceCoords.length === 0) return destinations;
  const bounds = parseGridRange(payload.sourceRange)
    ?? parseGridRange(sourceCoords.length === 1 ? sourceCoords[0] : `${sourceCoords[0]}:${sourceCoords[sourceCoords.length - 1]}`);
  const target = parseCoord(targetAnchor);
  const base = bounds ? { colIdx: bounds.startCol, rowIdx: bounds.startRow } : parseCoord(sourceCoords[0]);
  if (target.colIdx < 0 || target.rowIdx < 0) return destinations;
  for (const coord of sourceCoords) {
    const source = parseCoord(coord);
    const dCol = source.colIdx - base.colIdx;
    const dRow = source.rowIdx - base.rowIdx;
    const destCol = mode === 'transpose' ? target.colIdx + dRow : target.colIdx + dCol;
    const destRow = mode === 'transpose' ? target.rowIdx + dCol : target.rowIdx + dRow;
    destinations.set(coord, toA1(destCol, destRow));
  }
  return destinations;
}

export function applyGridClipboardPaste(request: GridPasteRequest): GridPasteOutcome {
  const { payload, targetAnchor, mode } = request;
  const before = request.cells;
  if (Object.keys(payload.cells).length === 0) {
    return { cells: { ...before }, changedCoords: [], clipboardAfter: payload };
  }

  const pasted = pasteSpecialToRange({ ...before }, payload.cells, targetAnchor, mode);
  const destinations = resolveGridPasteDestinations(payload, targetAnchor, mode);
  const destinationCoords = new Set(destinations.values());

  if (payload.isCut) {
    // Excel semantics: a cut moves the block. Source cells that are not also
    // paste targets are emptied, so cut can never behave like copy.
    for (const sourceCoord of Object.keys(payload.cells)) {
      if (!destinationCoords.has(sourceCoord)) delete pasted[sourceCoord];
    }
  }

  const changedCoords = [...new Set([...Object.keys(before), ...Object.keys(pasted)])]
    .filter((coord) => {
      const previous = before[coord];
      const next = pasted[coord];
      return previous?.value !== next?.value || previous?.formula !== next?.formula;
    })
    .sort();

  return {
    cells: pasted,
    changedCoords,
    clipboardAfter: payload.isCut ? null : payload,
  };
}
