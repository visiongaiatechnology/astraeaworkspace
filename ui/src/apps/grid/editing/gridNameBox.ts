// STATUS: DIAMANT VGT SUPREME
// Astraea Grid name box (Formelleiste) resolver. Pure: it only decides which
// range a typed name box entry means and how far the sheet must grow for it.

import type { GridNamedRange } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';
import { resolveGridGoToTarget } from './gridAdvancedEditing';

export const GRID_MAX_ROWS = 1_048_576;
export const GRID_MAX_COLS = 16384;

export type GridNameBoxResolution =
  | { readonly kind: 'range'; readonly range: string; readonly requiredRows: number; readonly requiredCols: number }
  | { readonly kind: 'invalid'; readonly message: string };

export interface GridNameBoxContext {
  readonly namedRanges: readonly GridNamedRange[];
  readonly sheetId: string;
  readonly rowCount: number;
  readonly colCount: number;
}

function columnLetter(index: number): string {
  return toA1(index, 0).replace(/\d+$/, '');
}

/**
 * Accepts A1 ranges, named ranges, whole columns (D or D:F) and whole rows
 * (5 or 5:9). Everything else fails closed with a visible message.
 */
export function resolveGridNameBoxInput(input: string, context: GridNameBoxContext): GridNameBoxResolution {
  const target = input.trim();
  if (!target) return { kind: 'invalid', message: 'Namensfeld: Bitte einen Zellbezug, Bereichsnamen oder eine Spalte eingeben.' };

  const resolved = resolveGridGoToTarget(target, context.namedRanges as GridNamedRange[], context.sheetId);
  if (resolved) {
    const bounds = parseGridRange(resolved);
    if (!bounds) return { kind: 'invalid', message: `Namensfeld: „${target}“ ist kein gültiger Bereich.` };
    return {
      kind: 'range',
      range: resolved,
      requiredRows: Math.min(GRID_MAX_ROWS, Math.max(context.rowCount, bounds.endRow + 1)),
      requiredCols: Math.min(GRID_MAX_COLS, Math.max(context.colCount, bounds.endCol + 1)),
    };
  }

  const columnMatch = /^([A-Za-z]{1,3})(?::([A-Za-z]{1,3}))?$/.exec(target);
  if (columnMatch) {
    const startBounds = parseGridRange(`${columnMatch[1].toUpperCase()}1`);
    const endBounds = parseGridRange(`${(columnMatch[2] ?? columnMatch[1]).toUpperCase()}1`);
    if (!startBounds || !endBounds) return { kind: 'invalid', message: `Namensfeld: Spalte „${target}“ existiert nicht.` };
    const lastCol = Math.max(startBounds.startCol, endBounds.startCol);
    if (lastCol + 1 > GRID_MAX_COLS) return { kind: 'invalid', message: `Namensfeld: Spalte „${target}“ liegt außerhalb des Rasters.` };
    const rows = Math.min(GRID_MAX_ROWS, Math.max(1, context.rowCount));
    const range = `${toA1(startBounds.startCol, 0)}:${toA1(lastCol, rows - 1)}`;
    return { kind: 'range', range, requiredRows: rows, requiredCols: Math.min(GRID_MAX_COLS, Math.max(context.colCount, lastCol + 1)) };
  }

  const rowMatch = /^([1-9]\d*)(?::([1-9]\d*))?$/.exec(target);
  if (rowMatch) {
    const startRow = Number(rowMatch[1]);
    const endRow = Number(rowMatch[2] ?? rowMatch[1]);
    if (endRow > GRID_MAX_ROWS) return { kind: 'invalid', message: `Namensfeld: Zeile ${endRow} liegt außerhalb des Rasters.` };
    const lastCol = Math.max(0, context.colCount - 1);
    const rows = Math.min(GRID_MAX_ROWS, Math.max(context.rowCount, endRow, startRow));
    return {
      kind: 'range',
      range: `A${Math.min(startRow, endRow)}:${columnLetter(lastCol)}${Math.max(startRow, endRow)}`,
      requiredRows: rows,
      requiredCols: context.colCount,
    };
  }

  return { kind: 'invalid', message: `Namensfeld: „${target}“ ist kein gültiger Zellbezug und kein bekannter Bereichsname.` };
}
