// STATUS: DIAMANT VGT SUPREME
// Astraea Grid Paste Special planning and preview. The preview is computed with the
// very same engine that applies the paste, so "what you see" cannot drift from
// "what you get".

import type { GridCell, GridPasteSpecialOptions } from '../../../shared/contracts/grid/workspaceGrid';
import { formatCellValue, parseCoord } from '../compat/gridUtils';
import { parseA1, toA1 } from '../formulas/formula';
import { applyPasteSpecial } from '../clipboard/gridPasteSpecial';
import type { GridClipboardPayload } from './gridClipboard';

const MAX_PREVIEW_ROWS = 24;

export interface GridPasteSpecialRequest {
  readonly cells: Readonly<Record<string, GridCell>>;
  readonly clipboard: GridClipboardPayload | null;
  readonly targetAnchor: string;
  readonly options: GridPasteSpecialOptions;
}

export type GridPasteSpecialPlan =
  | {
      readonly kind: 'apply';
      readonly updatedCells: Record<string, GridCell>;
      readonly changedCoords: string[];
      readonly columnWidths: Record<number, number>;
    }
  | { readonly kind: 'rejected'; readonly reason: string };

export function planGridPasteSpecial(request: GridPasteSpecialRequest): GridPasteSpecialPlan {
  const sourceCoords = request.clipboard ? Object.keys(request.clipboard.cells) : [];
  if (!request.clipboard || sourceCoords.length === 0) {
    return { kind: 'rejected', reason: 'Die Zwischenablage ist leer – zuerst Zellen kopieren oder ausschneiden.' };
  }
  const target = parseA1(request.targetAnchor);
  if (!target) return { kind: 'rejected', reason: `Zielzelle „${request.targetAnchor}“ ist ungültig.` };

  if (request.options.mode === 'column-widths') {
    const targetCol = parseCoord(request.targetAnchor).colIdx;
    const columnWidths: Record<number, number> = {};
    for (const [offset, width] of Object.entries(request.clipboard.columnWidths ?? {})) {
      columnWidths[targetCol + Number(offset)] = width;
    }
    if (Object.keys(columnWidths).length === 0) {
      return { kind: 'rejected', reason: 'Für die kopierten Spalten sind keine Spaltenbreiten hinterlegt.' };
    }
    return { kind: 'apply', updatedCells: { ...request.cells }, changedCoords: [], columnWidths };
  }

  const result = applyPasteSpecial(
    request.clipboard.cells,
    sourceCoords,
    request.targetAnchor,
    { ...request.cells },
    request.options,
  );
  const changedCoords = [...new Set([...Object.keys(request.cells), ...Object.keys(result.updatedCells)])]
    .filter((coord) => {
      const before = request.cells[coord];
      const after = result.updatedCells[coord];
      return before?.value !== after?.value || before?.formula !== after?.formula;
    })
    .sort();

  return { kind: 'apply', updatedCells: result.updatedCells, changedCoords, columnWidths: {} };
}

export interface GridPasteSpecialPreviewRow {
  readonly coord: string;
  readonly before: string;
  readonly after: string;
  readonly changed: boolean;
}

export interface GridPasteSpecialPreview {
  readonly rows: readonly GridPasteSpecialPreviewRow[];
  readonly totalChanges: number;
  readonly truncated: boolean;
  readonly mode: GridPasteSpecialOptions['mode'];
  readonly rejectedReason: string | null;
}

export function buildGridPasteSpecialPreview(request: GridPasteSpecialRequest): GridPasteSpecialPreview {
  const plan = planGridPasteSpecial(request);
  if (plan.kind === 'rejected') {
    return { rows: [], totalChanges: 0, truncated: false, mode: request.options.mode, rejectedReason: plan.reason };
  }
  const widthRows: GridPasteSpecialPreviewRow[] = Object.entries(plan.columnWidths).map(([column, width]) => ({
    coord: `Spalte ${toA1(Number(column), 0).replace(/\d+$/, '')}`,
    before: '—',
    after: `${width} px`,
    changed: true,
  }));
  const cellRows: GridPasteSpecialPreviewRow[] = plan.changedCoords.map((coord) => ({
    coord,
    before: formatCellValue(request.cells[coord]),
    after: formatCellValue(plan.updatedCells[coord]),
    changed: true,
  }));
  const affected = [...cellRows, ...widthRows];
  const shown = affected.slice(0, MAX_PREVIEW_ROWS);
  return {
    rows: shown,
    totalChanges: affected.length,
    truncated: affected.length > shown.length,
    mode: request.options.mode,
    rejectedReason: null,
  };
}
