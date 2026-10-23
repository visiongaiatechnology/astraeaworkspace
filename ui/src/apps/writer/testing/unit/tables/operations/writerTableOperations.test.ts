// STATUS: PLATIN — Writer table operation invariant tests
import { describe, expect, it } from 'vitest';
import type { WriterTableBlockData } from '../../../../../../shared/contracts/workspace';
import {
  addWriterTableColumn,
  addWriterTableRow,
  deleteWriterTableColumn,
  deleteWriterTableRow,
  duplicateWriterTableColumn,
  duplicateWriterTableRow,
  moveWriterTableColumn,
  moveWriterTableRow,
  normalizeWriterTable,
} from '../../../../tables/operations/writerTableOperations';

const table: WriterTableBlockData = {
  id: 'table',
  columns: ['A', 'B'],
  rows: [
    { id: 'r1', cells: [{ id: 'a1', content: '1' }, { id: 'b1', content: '2' }] },
    { id: 'r2', cells: [{ id: 'a2', content: '3' }, { id: 'b2', content: '4' }] },
  ],
};

function ids(): () => string {
  let next = 0;
  return () => `generated-${next++}`;
}

describe('Writer table operations', () => {
  it('adds and deletes rows while preserving the rectangular invariant', () => {
    const added = addWriterTableRow(table, 0, ids());
    expect(added.rows).toHaveLength(3);
    expect(added.rows[1]?.cells).toHaveLength(2);
    expect(deleteWriterTableRow(added, 1)).toEqual(table);
    expect(() => deleteWriterTableRow({ ...table, rows: [table.rows[0]] }, 0)).toThrow(/letzte/);
  });

  it('duplicates and moves rows with new stable child identities', () => {
    const duplicate = duplicateWriterTableRow(table, 0, ids());
    expect(duplicate.rows[1]?.cells.map((cell) => cell.content)).toEqual(['1', '2']);
    expect(duplicate.rows[1]?.cells[0]?.id).not.toBe('a1');
    expect(moveWriterTableRow(table, 0, 1).rows.map((row) => row.id)).toEqual(['r2', 'r1']);
  });

  it('adds, duplicates, moves, and deletes columns atomically with their cells', () => {
    const added = addWriterTableColumn(table, 0, ids());
    expect(added.columns).toHaveLength(3);
    expect(added.rows.every((row) => row.cells.length === 3)).toBe(true);
    const duplicate = duplicateWriterTableColumn(table, 0, ids());
    expect(duplicate.rows[0]?.cells.map((cell) => cell.content)).toEqual(['1', '1', '2']);
    const moved = moveWriterTableColumn(table, 0, 1);
    expect(moved.columns).toEqual(['B', 'A']);
    expect(moved.rows[0]?.cells.map((cell) => cell.content)).toEqual(['2', '1']);
    expect(deleteWriterTableColumn(added, 1)).toEqual(table);
  });

  it('normalizes malformed imported rows without sharing cell identities', () => {
    const normalized = normalizeWriterTable({
      ...table,
      rows: [{ id: 'short', cells: [{ id: 'only', content: 'value' }] }],
    }, ids());
    expect(normalized.rows[0]?.cells).toHaveLength(2);
    expect(normalized.rows[0]?.cells[1]?.id).toBe('generated-0');
  });
});
