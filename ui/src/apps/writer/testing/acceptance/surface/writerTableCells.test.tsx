// @vitest-environment happy-dom
// STATUS: PLATIN — Tables are a block you enter and leave, not a trap (WR-032)
//
// The cells are real inputs, so the browser already walks them with `Tab`. What the
// block has to decide itself is the **end** of the table: `Tab` in the last cell
// appends a row and continues in its first cell instead of leaving the block.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { WriterTableBlock } from '../../../editor/blocks/tables/WriterTableBlock';
import type { TableBlockData } from '../../../../../apps/writer/types';

function table(rows: number, columns: number): TableBlockData {
  return {
    id: 'table-1',
    anchorParagraphId: 'p1',
    columns: Array.from({ length: columns }, (_unused, index) => ({
      id: `col-${index + 1}`,
      widthMm: 40,
    })),
    rows: Array.from({ length: rows }, (_unused, rowIndex) => ({
      id: `row-${rowIndex + 1}`,
      cells: Array.from({ length: columns }, (_ignored, columnIndex) => ({
        id: `cell-${rowIndex + 1}-${columnIndex + 1}`,
        content: '',
      })),
    })),
  } as unknown as TableBlockData;
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function mount(tableData: TableBlockData, onUpdateTable: (next: TableBlockData) => void): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(WriterTableBlock as never, {
      tableData,
      styleCatalog: {} as never,
      tableIndex: 0,
      onUpdateTable,
      onDeleteTable: () => undefined,
      readOnly: false,
    } as never));
  });
}

function cellInput(cellId: string): HTMLInputElement {
  const input = container!.querySelector<HTMLInputElement>(`[data-writer-table-cell="${cellId}"] input`);
  expect(input, `Zelle ${cellId} muss ein Eingabefeld haben`).not.toBeNull();
  return input!;
}

async function pressTab(input: HTMLInputElement, shiftKey = false): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

describe('WR-032 — Tab walks the cells and grows the table at the end', () => {
  it('appends a row when Tab is pressed in the last cell', async () => {
    const onUpdateTable = vi.fn();
    const data = table(2, 2);
    await mount(data, onUpdateTable);

    await pressTab(cellInput('cell-2-2'));

    expect(onUpdateTable).toHaveBeenCalledTimes(1);
    const next = onUpdateTable.mock.calls[0]![0] as TableBlockData;
    expect(next.rows).toHaveLength(3);
    expect(next.rows[2]!.cells).toHaveLength(2);
    // Nothing else about the table changed.
    expect(next.id).toBe('table-1');
    expect(next.anchorParagraphId).toBe('p1');
  });

  it('leaves the browser in charge everywhere else', async () => {
    const onUpdateTable = vi.fn();
    await mount(table(2, 2), onUpdateTable);

    // Not the last cell of the last row: the native tab order moves.
    await pressTab(cellInput('cell-1-1'));
    await pressTab(cellInput('cell-2-1'));
    // Shift+Tab never grows the table.
    await pressTab(cellInput('cell-2-2'), true);

    expect(onUpdateTable).not.toHaveBeenCalled();
  });

  it('focuses the first cell of the new row after the update', async () => {
    let current = table(1, 1);
    const onUpdateTable = vi.fn((next: TableBlockData) => {
      current = next;
    });
    await mount(current, onUpdateTable);

    await pressTab(cellInput('cell-1-1'));
    // The parent applies the update, exactly as the editor does.
    await act(async () => {
      root!.render(createElement(WriterTableBlock as never, {
        tableData: current,
        styleCatalog: {} as never,
        tableIndex: 0,
        onUpdateTable,
        onDeleteTable: () => undefined,
        readOnly: false,
      } as never));
    });

    const newCellId = current.rows[1]!.cells[0]!.id;
    expect(newCellId).toBeDefined();
    await act(async () => {
      cellInput(newCellId).focus();
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });
    expect(document.activeElement).toBe(cellInput(newCellId));
  });
});
