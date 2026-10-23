// STATUS: PLATIN — Invariant-preserving Writer table operations
import type { WriterTableBlockData, WriterTableCellData, WriterTableRowData } from '../../../../shared/contracts/workspace';

export type WriterTableIdFactory = () => string;

/**
 * `crypto.randomUUID` must not be used as a bare function reference: it needs its
 * receiver, and a detached call throws `Value of "this" must be of type Crypto`
 * outside Chromium. This wrapper keeps the id source in one place and portable.
 */
const defaultWriterTableId: WriterTableIdFactory = () => crypto.randomUUID();

export class WriterTableOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriterTableOperationError';
  }
}

function assertIndex(index: number, length: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new WriterTableOperationError(`${label} liegt außerhalb der Tabelle.`);
  }
}

function createCell(idFactory: WriterTableIdFactory, content = ''): WriterTableCellData {
  return { id: idFactory(), content };
}

function normalizeRow(
  row: WriterTableRowData,
  columnCount: number,
  idFactory: WriterTableIdFactory
): WriterTableRowData {
  return {
    ...row,
    cells: Array.from({ length: columnCount }, (_, index) => row.cells[index] ?? createCell(idFactory)),
  };
}

export function normalizeWriterTable(
  table: WriterTableBlockData,
  idFactory: WriterTableIdFactory = defaultWriterTableId
): WriterTableBlockData {
  if (table.columns.length === 0) throw new WriterTableOperationError('Eine Writer-Tabelle benötigt mindestens eine Spalte.');
  if (table.rows.length === 0) throw new WriterTableOperationError('Eine Writer-Tabelle benötigt mindestens eine Datenzeile.');
  return { ...table, rows: table.rows.map((row) => normalizeRow(row, table.columns.length, idFactory)) };
}

export function addWriterTableRow(
  table: WriterTableBlockData,
  afterIndex = table.rows.length - 1,
  idFactory: WriterTableIdFactory = defaultWriterTableId
): WriterTableBlockData {
  if (afterIndex < -1 || afterIndex >= table.rows.length) throw new WriterTableOperationError('Einfügeposition liegt außerhalb der Tabelle.');
  const row: WriterTableRowData = {
    id: idFactory(),
    cells: table.columns.map(() => createCell(idFactory)),
  };
  const rows = [...table.rows];
  rows.splice(afterIndex + 1, 0, row);
  return { ...table, rows };
}

export function deleteWriterTableRow(table: WriterTableBlockData, index: number): WriterTableBlockData {
  assertIndex(index, table.rows.length, 'Zeile');
  if (table.rows.length === 1) throw new WriterTableOperationError('Die letzte Tabellenzeile kann nicht gelöscht werden.');
  return { ...table, rows: table.rows.filter((_, rowIndex) => rowIndex !== index) };
}

export function duplicateWriterTableRow(
  table: WriterTableBlockData,
  index: number,
  idFactory: WriterTableIdFactory = defaultWriterTableId
): WriterTableBlockData {
  assertIndex(index, table.rows.length, 'Zeile');
  const source = table.rows[index];
  const duplicate: WriterTableRowData = {
    id: idFactory(),
    cells: source.cells.map((cell) => ({ ...cell, id: idFactory() })),
  };
  const rows = [...table.rows];
  rows.splice(index + 1, 0, duplicate);
  return { ...table, rows };
}

export function moveWriterTableRow(table: WriterTableBlockData, from: number, to: number): WriterTableBlockData {
  assertIndex(from, table.rows.length, 'Quellzeile');
  assertIndex(to, table.rows.length, 'Zielzeile');
  if (from === to) return table;
  const rows = [...table.rows];
  const [row] = rows.splice(from, 1);
  rows.splice(to, 0, row);
  return { ...table, rows };
}

export function addWriterTableColumn(
  table: WriterTableBlockData,
  afterIndex = table.columns.length - 1,
  idFactory: WriterTableIdFactory = defaultWriterTableId
): WriterTableBlockData {
  if (afterIndex < -1 || afterIndex >= table.columns.length) throw new WriterTableOperationError('Einfügeposition liegt außerhalb der Tabelle.');
  const columns = [...table.columns];
  columns.splice(afterIndex + 1, 0, `Spalte ${columns.length + 1}`);
  const rows = table.rows.map((row) => {
    const cells = [...row.cells];
    cells.splice(afterIndex + 1, 0, createCell(idFactory));
    return { ...row, cells };
  });
  return { ...table, columns, rows };
}

export function deleteWriterTableColumn(table: WriterTableBlockData, index: number): WriterTableBlockData {
  assertIndex(index, table.columns.length, 'Spalte');
  if (table.columns.length === 1) throw new WriterTableOperationError('Die letzte Tabellenspalte kann nicht gelöscht werden.');
  return {
    ...table,
    columns: table.columns.filter((_, columnIndex) => columnIndex !== index),
    rows: table.rows.map((row) => ({ ...row, cells: row.cells.filter((_, columnIndex) => columnIndex !== index) })),
  };
}

export function duplicateWriterTableColumn(
  table: WriterTableBlockData,
  index: number,
  idFactory: WriterTableIdFactory = defaultWriterTableId
): WriterTableBlockData {
  assertIndex(index, table.columns.length, 'Spalte');
  const columns = [...table.columns];
  columns.splice(index + 1, 0, `${table.columns[index]} Kopie`);
  const rows = table.rows.map((row) => {
    const cells = [...row.cells];
    const source = row.cells[index] ?? createCell(idFactory);
    cells.splice(index + 1, 0, { ...source, id: idFactory() });
    return { ...row, cells };
  });
  return { ...table, columns, rows };
}

export function moveWriterTableColumn(table: WriterTableBlockData, from: number, to: number): WriterTableBlockData {
  assertIndex(from, table.columns.length, 'Quellspalte');
  assertIndex(to, table.columns.length, 'Zielspalte');
  if (from === to) return table;
  const columns = [...table.columns];
  const [column] = columns.splice(from, 1);
  columns.splice(to, 0, column);
  const rows = table.rows.map((row) => {
    const cells = [...row.cells];
    const [cell] = cells.splice(from, 1);
    cells.splice(to, 0, cell);
    return { ...row, cells };
  });
  return { ...table, columns, rows };
}
