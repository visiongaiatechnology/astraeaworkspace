// STATUS: PLATIN — Invariant-preserving Advanced Writer Table Operations
import type {
  WriterTableBlockData,
  WriterTableRowData,
  WriterTableCellData,
} from '../../../../shared/contracts/workspace';

export interface WriterTableCellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export class WriterTableAdvancedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriterTableAdvancedError';
  }
}

/**
 * Normalizes and validates a rectangular cell range.
 */
export function normalizeCellRange(
  range: WriterTableCellRange,
  rowCount: number,
  colCount: number
): WriterTableCellRange {
  const startRow = Math.max(0, Math.min(range.startRow, range.endRow));
  const endRow = Math.min(rowCount - 1, Math.max(range.startRow, range.endRow));
  const startCol = Math.max(0, Math.min(range.startCol, range.endCol));
  const endCol = Math.min(colCount - 1, Math.max(range.startCol, range.endCol));

  if (startRow >= rowCount || startCol >= colCount) {
    throw new WriterTableAdvancedError('Auswahlbereich liegt außerhalb der Tabelle.');
  }

  return { startRow, startCol, endRow, endCol };
}

/**
 * Merges a rectangular block of cells into the top-left cell.
 */
export function mergeWriterTableCells(
  table: WriterTableBlockData,
  rawRange: WriterTableCellRange
): WriterTableBlockData {
  if (table.rows.length === 0 || table.columns.length === 0) return table;
  const range = normalizeCellRange(rawRange, table.rows.length, table.columns.length);

  // If single cell, no-op
  if (range.startRow === range.endRow && range.startCol === range.endCol) {
    return table;
  }

  const colSpan = range.endCol - range.startCol + 1;
  const rowSpan = range.endRow - range.startRow + 1;

  // Collect contents from all non-empty cells
  const collectedText: string[] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startCol; c <= range.endCol; c++) {
      const cell = table.rows[r]?.cells[c];
      if (cell && cell.content.trim()) {
        collectedText.push(cell.content.trim());
      }
    }
  }

  const mergedContent = collectedText.join(' ');

  const nextRows = table.rows.map((row, rIdx) => {
    if (rIdx < range.startRow || rIdx > range.endRow) return row;

    const nextCells = row.cells.map((cell, cIdx) => {
      if (cIdx < range.startCol || cIdx > range.endCol) return cell;

      if (rIdx === range.startRow && cIdx === range.startCol) {
        return {
          ...cell,
          content: mergedContent,
          colSpan,
          rowSpan,
          mergedInto: undefined,
        };
      }

      return {
        ...cell,
        content: '',
        colSpan: undefined,
        rowSpan: undefined,
        mergedInto: { row: range.startRow, col: range.startCol },
      };
    });

    return { ...row, cells: nextCells };
  });

  return { ...table, rows: nextRows };
}

/**
 * Splits a merged cell back into its individual constituent cells.
 */
export function splitWriterTableCell(
  table: WriterTableBlockData,
  rowIndex: number,
  colIndex: number
): WriterTableBlockData {
  if (rowIndex < 0 || rowIndex >= table.rows.length || colIndex < 0 || colIndex >= table.columns.length) {
    return table;
  }

  const targetCell = table.rows[rowIndex].cells[colIndex];
  let parentRow = rowIndex;
  let parentCol = colIndex;

  if (targetCell?.mergedInto) {
    parentRow = targetCell.mergedInto.row;
    parentCol = targetCell.mergedInto.col;
  }

  const nextRows = table.rows.map((row, rIdx) => {
    const nextCells = row.cells.map((cell, cIdx) => {
      if (rIdx === parentRow && cIdx === parentCol) {
        return {
          ...cell,
          colSpan: undefined,
          rowSpan: undefined,
          mergedInto: undefined,
        };
      }

      if (cell.mergedInto && cell.mergedInto.row === parentRow && cell.mergedInto.col === parentCol) {
        return {
          ...cell,
          mergedInto: undefined,
          colSpan: undefined,
          rowSpan: undefined,
        };
      }

      return cell;
    });

    return { ...row, cells: nextCells };
  });

  return { ...table, rows: nextRows };
}

/**
 * Splits a table into two tables at the specified row index.
 */
export function splitWriterTable(
  table: WriterTableBlockData,
  atRowIndex: number,
  idFactory: () => string = () => crypto.randomUUID()
): [WriterTableBlockData, WriterTableBlockData] {
  if (atRowIndex <= 0 || atRowIndex >= table.rows.length) {
    throw new WriterTableAdvancedError('Teilungszeile muss zwischen Zeile 1 und der letzten Zeile liegen.');
  }

  const topRows = table.rows.slice(0, atRowIndex);
  const bottomRows = table.rows.slice(atRowIndex);

  const topTable: WriterTableBlockData = {
    ...table,
    rows: topRows,
  };

  const bottomTable: WriterTableBlockData = {
    ...table,
    id: idFactory(),
    rows: bottomRows,
    caption: table.caption ? `${table.caption} (Fortsetzung)` : undefined,
  };

  return [topTable, bottomTable];
}

/**
 * Merges two adjacent tables into a single table.
 */
export function mergeWriterTables(
  tableA: WriterTableBlockData,
  tableB: WriterTableBlockData,
  idFactory: () => string = () => crypto.randomUUID()
): WriterTableBlockData {
  const maxCols = Math.max(tableA.columns.length, tableB.columns.length);

  const columns = Array.from({ length: maxCols }, (_, idx) => {
    return tableA.columns[idx] ?? tableB.columns[idx] ?? `Spalte ${idx + 1}`;
  });

  const padCells = (cells: WriterTableCellData[]): WriterTableCellData[] => {
    if (cells.length >= maxCols) return cells;
    const padded = [...cells];
    while (padded.length < maxCols) {
      padded.push({ id: idFactory(), content: '' });
    }
    return padded;
  };

  const rowsA = tableA.rows.map((r) => ({ ...r, cells: padCells(r.cells) }));
  const rowsB = tableB.rows.map((r) => ({
    ...r,
    id: idFactory(),
    cells: padCells(r.cells).map((c) => ({ ...c, id: idFactory() })),
  }));

  return {
    ...tableA,
    columns,
    rows: [...rowsA, ...rowsB],
  };
}

/**
 * Resolves column widths in millimeters according to the AutoFit mode.
 */
export function resolveWriterTableColumnWidths(
  table: WriterTableBlockData,
  usableWidthMm: number
): number[] {
  const colCount = Math.max(1, table.columns.length);
  // DEF-RE-017: `Math.max(40, NaN)` is NaN, and every column width in the `contents` and `window` modes is
  // derived from this value - so a non-finite page width produced a table that cannot be drawn. `Infinity`
  // was the second defect on the same line: finite-looking code, infinite widths.
  // The fallback is 40, the lower bound this expression already imposes. Same class as DEF-RE-009, 010,
  // 013, 014, 015 and 016.
  const safeUsableWidth = Number.isFinite(usableWidthMm) ? Math.max(40, usableWidthMm) : 40;

  if (table.autoFit === 'fixed' && table.columnWidthsMm && table.columnWidthsMm.length === colCount) {
    return [...table.columnWidthsMm];
  }

  if (table.autoFit === 'contents') {
    // Measure content weights
    const weights = Array.from({ length: colCount }, (_, cIdx) => {
      let maxLen = (table.columns[cIdx] ?? '').length;
      for (const row of table.rows) {
        const cellContent = row.cells[cIdx]?.content ?? '';
        if (cellContent.length > maxLen) maxLen = cellContent.length;
      }
      return Math.max(4, maxLen);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const minColWidthMm = 15;
    const remainingMm = Math.max(0, safeUsableWidth - colCount * minColWidthMm);

    return weights.map((w) => {
      const share = totalWeight > 0 ? (w / totalWeight) * remainingMm : remainingMm / colCount;
      return Math.round((minColWidthMm + share) * 10) / 10;
    });
  }

  // Default / 'window': distribute evenly or normalize existing widths
  if (table.columnWidthsMm && table.columnWidthsMm.length === colCount) {
    const currentSum = table.columnWidthsMm.reduce((s, w) => s + w, 0);
    if (currentSum > 0) {
      const factor = safeUsableWidth / currentSum;
      return table.columnWidthsMm.map((w) => Math.round(w * factor * 10) / 10);
    }
  }

  const evenWidth = Math.round((safeUsableWidth / colCount) * 10) / 10;
  return Array.from({ length: colCount }, () => evenWidth);
}

/**
 * Sorts table rows based on a specific column index.
 */
export function sortWriterTable(
  table: WriterTableBlockData,
  columnIndex: number,
  direction: 'asc' | 'desc' = 'asc',
  numeric = false
): WriterTableBlockData {
  if (columnIndex < 0 || columnIndex >= table.columns.length) {
    throw new WriterTableAdvancedError('Ungültiger Spaltenindex für Sortierung.');
  }

  const parseNum = (val: string): number => {
    const cleaned = val.replace(/[^0-9,.-]/g, '');
    if (!cleaned) return 0;
    let normalized = cleaned;
    if (cleaned.includes('.') && cleaned.includes(',')) {
      normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
      normalized = cleaned.replace(',', '.');
    }
    const num = Number.parseFloat(normalized);
    return Number.isNaN(num) ? 0 : num;
  };

  // If table has totalRowHighlight or bottom formula row, keep it at the bottom
  const hasAnchoredTotal = table.totalRowHighlight && table.rows.length > 1;
  const rowsToSort = hasAnchoredTotal ? table.rows.slice(0, -1) : [...table.rows];
  const anchoredRow = hasAnchoredTotal ? table.rows[table.rows.length - 1] : null;

  const sortedRows = rowsToSort.sort((rowA, rowB) => {
    const textA = rowA.cells[columnIndex]?.content?.trim() ?? '';
    const textB = rowB.cells[columnIndex]?.content?.trim() ?? '';

    let diff = 0;
    if (numeric) {
      diff = parseNum(textA) - parseNum(textB);
    } else {
      diff = textA.localeCompare(textB, undefined, { numeric: true, sensitivity: 'base' });
    }

    return direction === 'asc' ? diff : -diff;
  });

  if (anchoredRow) {
    sortedRows.push(anchoredRow);
  }

  return { ...table, rows: sortedRows };
}

/**
 * Generates an automatic caption title with counter.
 */
export function resolveTableCaption(table: WriterTableBlockData, tableIndex: number): string {
  const ordinal = tableIndex + 1;
  if (table.caption && table.caption.trim()) {
    return `Tabelle ${ordinal}: ${table.caption.trim()}`;
  }
  return `Tabelle ${ordinal}`;
}

/**
 * Sets cell-specific attributes (alignment, rotation, formula).
 */
export function updateWriterTableCell(
  table: WriterTableBlockData,
  rowIndex: number,
  colIndex: number,
  patch: Partial<WriterTableCellData>
): WriterTableBlockData {
  if (rowIndex < 0 || rowIndex >= table.rows.length || colIndex < 0 || colIndex >= table.columns.length) {
    return table;
  }

  const nextRows = table.rows.map((row, rIdx) => {
    if (rIdx !== rowIndex) return row;
    const nextCells = row.cells.map((cell, cIdx) => {
      if (cIdx !== colIndex) return cell;
      return { ...cell, ...patch };
    });
    return { ...row, cells: nextCells };
  });

  return { ...table, rows: nextRows };
}

/**
 * Sets row-specific attributes (cantSplit, heightMm).
 */
export function updateWriterTableRowProps(
  table: WriterTableBlockData,
  rowIndex: number,
  patch: Partial<Pick<WriterTableRowData, 'cantSplit' | 'heightMm'>>
): WriterTableBlockData {
  if (rowIndex < 0 || rowIndex >= table.rows.length) return table;

  const nextRows = table.rows.map((row, rIdx) => {
    if (rIdx !== rowIndex) return row;
    return { ...row, ...patch };
  });

  return { ...table, rows: nextRows };
}
