// STATUS: DIAMANT VGT SUPREME
// Bounded cell-sparkline source and persistence helpers.

import type { GridCell } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';

const MAX_SPARKLINE_POINTS = 2_048;

export function readSparklineValues(cells: Record<string, GridCell>, range: string): number[] {
  const bounds = parseGridRange(range);
  if (!bounds) throw new Error('sparkline_invalid_source_range');
  const count = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
  if (count < 2 || count > MAX_SPARKLINE_POINTS) throw new Error('sparkline_source_limit');
  const values: number[] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row++) {
    for (let col = bounds.startCol; col <= bounds.endCol; col++) {
      const raw = cells[toA1(col, row)]?.value;
      const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
      if (Number.isFinite(value)) values.push(value);
    }
  }
  if (values.length < 2) throw new Error('sparkline_requires_two_numeric_points');
  return values.slice(0, MAX_SPARKLINE_POINTS);
}

export function applySparklineToCell(
  cells: Record<string, GridCell>,
  targetCoord: string,
  sourceRange: string,
  type: NonNullable<GridCell['sparklineType']> = 'line',
  color = '#10b981',
): Record<string, GridCell> {
  if (!/^[A-Z]+[1-9]\d*$/.test(targetCoord.toUpperCase())) throw new Error('sparkline_invalid_target');
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#10b981';
  return {
    ...cells,
    [targetCoord.toUpperCase()]: {
      ...(cells[targetCoord.toUpperCase()] ?? { value:'' }),
      sparkline: readSparklineValues(cells, sourceRange),
      sparklineSourceRange: sourceRange.toUpperCase(),
      sparklineType: type,
      sparklineColor: safeColor,
    },
  };
}


export function refreshGridSparklines(cells: Record<string, GridCell>): Record<string, GridCell> {
  let changed = false;
  const next = { ...cells };
  for (const [coord, cell] of Object.entries(cells)) {
    if (!cell.sparklineSourceRange) continue;
    try {
      const values = readSparklineValues(cells, cell.sparklineSourceRange);
      if (JSON.stringify(values) === JSON.stringify(cell.sparkline ?? [])) continue;
      next[coord] = { ...cell, sparkline: values };
      changed = true;
    } catch {
      // Fail closed: keep the last valid visual snapshot when the source range is temporarily invalid.
    }
  }
  return changed ? next : cells;
}

export function refreshGridSparklinesInDocument<T extends { gridData?: import('../../../shared/contracts/workspace').GridDocumentModel; objects: Record<string, import('../../../shared/contracts/workspace').WorkspaceObject> }>(document: T): T {
  if (!document.gridData?.sheets?.length) return document;
  let changed = false;
  const objects = { ...document.objects };
  for (const sheet of document.gridData.sheets) {
    const object = objects[sheet.tableObjectId];
    if (!object || object.type !== 'Table') continue;
    const refreshed = refreshGridSparklines(object.data.cells);
    if (refreshed === object.data.cells) continue;
    objects[sheet.tableObjectId] = { type:'Table', data:{ ...object.data, cells:refreshed } };
    changed = true;
  }
  return changed ? { ...document, objects } : document;
}
