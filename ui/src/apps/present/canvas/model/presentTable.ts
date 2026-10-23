// STATUS: PLATIN — bounded, pure Present table editing and "fit to slide" sizing.
//
// Paket 13 "Tabellen auf Folie": "Tabelle erstellen, Zelle bearbeiten, **Maße an Folienlayout
// anpassen**".
//
// Before this module the table was edited only through the inline `<input>`s inside the renderer:
// there was no way to add or remove a row or a column, no bound on the table size, and no action
// that made a table fit the slide. A hostile document could carry a 100 000-column table that the
// renderer would then try to paint.

import type { PresentSceneObject, PresentTableSceneObject } from '../../../../shared/contracts/workspace';
import { normalizePresentGeometry } from './presentScene';

export const PRESENT_TABLE_MAX_ROWS = 64;
export const PRESENT_TABLE_MAX_COLUMNS = 16;
export const PRESENT_TABLE_MAX_CELL_LENGTH = 4096;
export const PRESENT_TABLE_MAX_HEADER_LENGTH = 256;
export const PRESENT_TABLE_MIN_ROWS = 1;
export const PRESENT_TABLE_MIN_COLUMNS = 1;

export interface PresentTableResult {
  table: PresentTableSceneObject;
  changed: boolean;
  /** Set when the operation was refused; always user-visible text, never silent. */
  message?: string;
  reason?: 'row-limit' | 'column-limit' | 'last-row' | 'last-column' | 'out-of-range' | 'unchanged';
}

function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * A label that must not be blank: whitespace-only input falls back too. Using `||` alone would keep
 * `'   '`, which renders as an empty header (found by my own test).
 */
export function presentTableLabel(value: unknown, max: number, fallback: string): string {
  const text = boundedText(value, max).trim();
  return text || fallback;
}

/** Bounds a header: the count is clamped and every name is length-bounded. */
export function normalizePresentTableColumns(columns: readonly unknown[]): string[] {
  const list = Array.isArray(columns) ? columns.slice(0, PRESENT_TABLE_MAX_COLUMNS) : [];
  const bounded = list.map((column, index) => presentTableLabel(column, PRESENT_TABLE_MAX_HEADER_LENGTH, `Column ${index + 1}`));
  return bounded.length ? bounded : ['Column 1'];
}

/**
 * Makes a table rectangular and bounded: every row has exactly `columns.length` cells and no more
 * than `PRESENT_TABLE_MAX_ROWS` rows survive. Missing cells are added empty, surplus cells are
 * dropped - a table that is not rectangular must not reach the renderer.
 */
export function normalizePresentTable(table: PresentTableSceneObject): PresentTableSceneObject {
  const columns = normalizePresentTableColumns(table.columns ?? []);
  const rawRows = Array.isArray(table.rows) ? table.rows.slice(0, PRESENT_TABLE_MAX_ROWS) : [];
  const rows = (rawRows.length ? rawRows : [columns.map(() => '')]).map((row) => {
    const cells = Array.isArray(row) ? row : [];
    return columns.map((_, index) => boundedText(cells[index], PRESENT_TABLE_MAX_CELL_LENGTH));
  });
  return normalizePresentGeometry({ ...table, columns, rows }) as PresentTableSceneObject;
}

export function setPresentTableCell(
  table: PresentTableSceneObject,
  rowIndex: number,
  columnIndex: number,
  value: string,
): PresentTableResult {
  const normalized = normalizePresentTable(table);
  if (rowIndex < 0 || rowIndex >= normalized.rows.length || columnIndex < 0 || columnIndex >= normalized.columns.length) {
    return { table: normalized, changed: false, message: 'That cell is outside the table.', reason: 'out-of-range' };
  }
  const next = boundedText(value, PRESENT_TABLE_MAX_CELL_LENGTH);
  if (normalized.rows[rowIndex][columnIndex] === next) return { table: normalized, changed: false, reason: 'unchanged' };
  const rows = normalized.rows.map((row, index) =>
    index === rowIndex ? row.map((cell, cellIndex) => (cellIndex === columnIndex ? next : cell)) : row,
  );
  return { table: normalizePresentTable({ ...normalized, rows }), changed: true };
}

export function setPresentTableColumn(table: PresentTableSceneObject, columnIndex: number, value: string): PresentTableResult {
  const normalized = normalizePresentTable(table);
  if (columnIndex < 0 || columnIndex >= normalized.columns.length) {
    return { table: normalized, changed: false, message: 'That column does not exist.', reason: 'out-of-range' };
  }
  const next = presentTableLabel(value, PRESENT_TABLE_MAX_HEADER_LENGTH, `Column ${columnIndex + 1}`);
  if (normalized.columns[columnIndex] === next) return { table: normalized, changed: false, reason: 'unchanged' };
  const columns = normalized.columns.map((column, index) => (index === columnIndex ? next : column));
  return { table: normalizePresentTable({ ...normalized, columns }), changed: true };
}

export function appendPresentTableRow(table: PresentTableSceneObject): PresentTableResult {
  const normalized = normalizePresentTable(table);
  if (normalized.rows.length >= PRESENT_TABLE_MAX_ROWS) {
    return { table: normalized, changed: false, message: `A table holds at most ${PRESENT_TABLE_MAX_ROWS} rows.`, reason: 'row-limit' };
  }
  const rows = [...normalized.rows, normalized.columns.map(() => '')];
  return { table: normalizePresentTable({ ...normalized, rows }), changed: true };
}

export function removePresentTableRow(table: PresentTableSceneObject, rowIndex: number): PresentTableResult {
  const normalized = normalizePresentTable(table);
  if (rowIndex < 0 || rowIndex >= normalized.rows.length) {
    return { table: normalized, changed: false, message: 'That row does not exist.', reason: 'out-of-range' };
  }
  if (normalized.rows.length <= PRESENT_TABLE_MIN_ROWS) {
    return { table: normalized, changed: false, message: 'A table keeps at least one row; clear it instead of deleting it.', reason: 'last-row' };
  }
  return { table: normalizePresentTable({ ...normalized, rows: normalized.rows.filter((_, index) => index !== rowIndex) }), changed: true };
}

export function appendPresentTableColumn(table: PresentTableSceneObject): PresentTableResult {
  const normalized = normalizePresentTable(table);
  if (normalized.columns.length >= PRESENT_TABLE_MAX_COLUMNS) {
    return { table: normalized, changed: false, message: `A table holds at most ${PRESENT_TABLE_MAX_COLUMNS} columns.`, reason: 'column-limit' };
  }
  const columns = [...normalized.columns, `Column ${normalized.columns.length + 1}`];
  const rows = normalized.rows.map((row) => [...row, '']);
  return { table: normalizePresentTable({ ...normalized, columns, rows }), changed: true };
}

export function removePresentTableColumn(table: PresentTableSceneObject, columnIndex: number): PresentTableResult {
  const normalized = normalizePresentTable(table);
  if (columnIndex < 0 || columnIndex >= normalized.columns.length) {
    return { table: normalized, changed: false, message: 'That column does not exist.', reason: 'out-of-range' };
  }
  if (normalized.columns.length <= PRESENT_TABLE_MIN_COLUMNS) {
    return { table: normalized, changed: false, message: 'A table keeps at least one column; clear it instead of deleting it.', reason: 'last-column' };
  }
  const columns = normalized.columns.filter((_, index) => index !== columnIndex);
  const rows = normalized.rows.map((row) => row.filter((_, index) => index !== columnIndex));
  return { table: normalizePresentTable({ ...normalized, columns, rows }), changed: true };
}

/**
 * "Maße an Folienlayout anpassen": fills the slide along the requested axis/axes without moving the
 * opposite axis out of bounds. This is the explicit counterpart to the align buttons, which only
 * position an object.
 */
export function stretchPresentObjectToSlide(
  object: PresentSceneObject,
  dimension: 'width' | 'height' | 'both',
): PresentSceneObject {
  const patch: Partial<PresentTableSceneObject> = {};
  if (dimension === 'width' || dimension === 'both') {
    patch.xPercent = 0;
    patch.widthPercent = 100;
  }
  if (dimension === 'height' || dimension === 'both') {
    patch.yPercent = 0;
    patch.heightPercent = 100;
  }
  return normalizePresentGeometry({ ...object, ...patch } as PresentSceneObject);
}
