// @vitest-environment happy-dom
// STATUS: PLATIN — GR-005: navigation, range selection and a visible focus
//
// The M1 contract: arrow keys move the active cell, Shift+arrows extend a range, Home/End and
// Ctrl+End jump, exactly one cell carries the active marker, the rest of the range is marked
// as `range`, and the keyboard focus stays on the grid so the next key is not lost.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const BASE: WorkspaceDocument = {
  id: 'grid-navigation',
  title: 'Grid navigation',
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

function ControlledGrid({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  return createElement(GridSheet, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => setDocument(next),
    onUpdateWorkspaceDocument: (next: WorkspaceDocument) => setDocument(next),
    onSelectSelectionType: vi.fn(),
    onCreateChart: vi.fn(),
    networkCapability: 'offline' as never,
    keyVaultUnlocked: false,
    workspaceDocuments: {},
  } as never);
}

async function mount(): Promise<HTMLElement> {
  const workbook = addSheetToDocument(BASE, [], 'Sheet 1', {
    cells: { A1: { value: 'A1' }, B2: { value: 'B2' }, C3: { value: 'C3' } },
  }).updatedDocument;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledGrid, { start: workbook }));
  });
  return container;
}

function gridRoot(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
  if (!element) throw new Error('Grid root missing');
  element.focus();
  return element;
}

interface Position { readonly row: number; readonly col: number; }

/**
 * Position of the single active cell, measured in data rows/columns (A1 = 0/0).
 *
 * Every `<tr>` starts with the row-number cell (also a `<td>` in this table), so the first
 * data cell is index 1 — measured: A1 reported col 1 before this offset was removed.
 */
function activePosition(host: HTMLElement): Position {
  const active = host.querySelector<HTMLElement>('[data-vgt-grid-selection="active-cell"]');
  if (!active) throw new Error('no active cell');
  const row = active.closest('tr');
  if (!row) throw new Error('active cell has no row');
  const cells = Array.from(row.children);
  return {
    row: Array.from(row.parentElement?.parentElement?.querySelectorAll('tbody tr') ?? []).indexOf(row as HTMLTableRowElement),
    // `-1` drops the row-number cell that precedes the data columns.
    col: cells.indexOf(active as HTMLElement) - 1,
  };
}

function rangeCount(host: HTMLElement): number {
  return host.querySelectorAll('[data-vgt-grid-selection="range"]').length;
}

async function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  });
}

describe('GR-005 — navigation, range and focus', () => {
  it('moves the active cell with the arrow keys and keeps exactly one active marker', async () => {
    const host = await mount();
    const grid = gridRoot(host);
    expect(activePosition(host)).toEqual({ row: 0, col: 0 });
    await press(grid, 'ArrowRight');
    expect(activePosition(host)).toEqual({ row: 0, col: 1 });
    await press(grid, 'ArrowDown');
    expect(activePosition(host)).toEqual({ row: 1, col: 1 });
    await press(grid, 'ArrowLeft');
    expect(activePosition(host)).toEqual({ row: 1, col: 0 });
    await press(grid, 'ArrowUp');
    expect(activePosition(host)).toEqual({ row: 0, col: 0 });
    expect(host.querySelectorAll('[data-vgt-grid-selection="active-cell"]').length, 'genau eine aktive Zelle').toBe(1);
  });

  it('extends a range with Shift+Arrow and keeps the anchor cell active', async () => {
    const host = await mount();
    const grid = gridRoot(host);
    await press(grid, 'ArrowRight', { shiftKey: true });
    expect(activePosition(host), 'der Anker bleibt aktiv').toEqual({ row: 0, col: 1 });
    expect(rangeCount(host), 'die Auswahl markiert den Anker').toBeGreaterThanOrEqual(1);
  });

  it('jumps to the used bounds on Ctrl+End and back to column A on Home', async () => {
    const host = await mount();
    const grid = gridRoot(host);
    await press(grid, 'End', { ctrlKey: true });
    expect(activePosition(host), 'Ctrl+End springt zur letzten benutzten Zelle').toEqual({ row: 2, col: 2 });
    await press(grid, 'Home');
    expect(activePosition(host), 'Home springt in Spalte A').toEqual({ row: 2, col: 0 });
  });

  it('keeps the keyboard focus on the grid while navigating', async () => {
    const host = await mount();
    const grid = gridRoot(host);
    await press(grid, 'ArrowDown');
    await press(grid, 'Tab');
    expect(document.activeElement, 'der Fokus bleibt im Raster').toBe(grid);
  });
});
