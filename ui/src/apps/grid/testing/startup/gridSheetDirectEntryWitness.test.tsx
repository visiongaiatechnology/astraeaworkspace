// @vitest-environment happy-dom
// STATUS: PLATIN — GR-003: single click, direct typing, Enter/Tab as in Excel
//
// Measured with the DOM mount witness: `GridSheet` mounts and renders its cells, but no test
// ever *pressed a key* at it. The M1 contract for GR-003 is the Excel workflow:
// click a cell → type the value → Enter moves the selection **down** (Tab moves right), and
// only F2 (or a double click) opens the editor on an existing value.
//
// Red-before: `gridNavigation.ts` answered `Enter` in navigation mode with `beginEdit`, so the
// key opened an editor instead of continuing to the next row — the opposite of the contract.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const BASE: WorkspaceDocument = {
  id: 'grid-direct-entry',
  title: 'Grid direct entry',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

async function mount(): Promise<HTMLElement> {
  const workbook = addSheetToDocument(BASE, [], 'Sheet 1', { cells: { A1: { value: 'A1-Inhalt' }, B1: { value: 'B1-Inhalt' } } }).updatedDocument;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GridSheet, {
      document: workbook,
      onUpdateDocument: vi.fn(),
      onUpdateWorkspaceDocument: vi.fn(),
      onSelectSelectionType: vi.fn(),
      onCreateChart: vi.fn(),
      networkCapability: 'offline' as never,
      keyVaultUnlocked: false,
      workspaceDocuments: {},
    } as never));
  });
  return container;
}

function gridRoot(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
  if (!element) throw new Error('Grid root missing');
  element.focus();
  return element;
}

function activeCellRow(host: HTMLElement): number {
  const active = host.querySelector<HTMLElement>('[data-vgt-grid-selection="active-cell"]');
  if (!active) throw new Error('no active cell');
  const row = active.closest('tr');
  if (!row) throw new Error('active cell has no row');
  // Data rows only: the column-header row lives in `thead`, A1 is data row 0.
  return Array.from(row.parentElement?.parentElement?.querySelectorAll('tbody tr') ?? []).indexOf(row as HTMLTableRowElement);
}

function activeCellColumn(host: HTMLElement): number {
  const active = host.querySelector<HTMLElement>('[data-vgt-grid-selection="active-cell"]');
  if (!active) throw new Error('no active cell');
  const row = active.closest('tr');
  return Array.from(row?.children ?? []).indexOf(active as HTMLElement);
}

async function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  });
}

describe('GR-003 — Enter and Tab behave like a spreadsheet', () => {
  it('moves the selection down on Enter instead of opening an editor', async () => {
    const host = await mount();
    const grid = gridRoot(host);
    expect(activeCellRow(host), 'A1 ist zu Beginn aktiv').toBe(0);

    await press(grid, 'Enter');

    expect(host.querySelector('td input[type="text"]'), 'Enter startet keine Bearbeitung').toBeNull();
    expect(activeCellRow(host), 'Enter geht eine Zeile nach unten').toBe(1);
  });

  it('moves the selection up on Shift+Enter', async () => {
    const host = await mount();
    const grid = gridRoot(host);
    await press(grid, 'Enter');
    await press(grid, 'Enter');
    expect(activeCellRow(host), 'zwei Zeilen nach unten').toBe(2);
    await press(grid, 'Enter', { shiftKey: true });
    expect(activeCellRow(host), 'Shift+Enter geht eine Zeile zurück').toBe(1);
  });

  it('moves the selection right on Tab', async () => {
    const host = await mount();
    const grid = gridRoot(host);
    const columnBefore = activeCellColumn(host);
    await press(grid, 'Tab');
    expect(activeCellColumn(host)).toBe(columnBefore + 1);
  });

  it('opens the edit draft on F2 and leaves it on Escape', async () => {
    const host = await mount();
    const grid = gridRoot(host);
    await press(grid, 'F2');
    const editor = host.querySelector<HTMLInputElement>('td input[type="text"]');
    expect(editor, 'F2 öffnet den Editor').not.toBeNull();
    expect(editor!.value).toBe('A1-Inhalt');
    await press(grid, 'Escape');
    expect(host.querySelector('td input[type="text"]'), 'Escape verwirft den Editor').toBeNull();
  });

  it('starts an edit with the first typed character (direct typing)', async () => {
    const host = await mount();
    const grid = gridRoot(host);
    await press(grid, 'N');
    const editor = host.querySelector<HTMLInputElement>('td input[type="text"]');
    expect(editor, 'ein druckbares Zeichen öffnet den Edit-Draft').not.toBeNull();
    expect(editor!.value, 'das Zeichen ist bereits im Entwurf — nicht doppelt').toBe('N');
  });
});
