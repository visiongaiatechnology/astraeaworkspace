// @vitest-environment happy-dom
// STATUS: PLATIN — GR-007: DOM table and virtual canvas are the same grid to the user
//
// `GridSheetViewport` switches renderer above 250 rows / 30 columns. The M1 risk is that the
// virtual branch is a *different* grid: same state, but different keyboard/click semantics.
// This witness mounts the SAME interaction against both branches and asserts the same result.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const BASE: WorkspaceDocument = {
  id: 'grid-renderer-parity',
  title: 'Grid renderer parity',
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

/** Small workbook → DOM table renderer; large workbook → virtual canvas renderer. */
async function mount(rows: number): Promise<{ host: HTMLElement; virtual: boolean }> {
  const workbook = addSheetToDocument(BASE, [], 'Sheet 1', {
    rows,
    cells: { A1: { value: 'A1-Inhalt' } },
  }).updatedDocument;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledGrid, { start: workbook }));
  });
  return { host: container, virtual: container.querySelector('[role="grid"] canvas') !== null };
}

function gridRoot(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
  if (!element) throw new Error('Grid root missing');
  element.focus();
  return element;
}

/**
 * The active cell as a coordinate-independent signature.
 *
 * DOM renderer: `<td>` markers. Virtual renderer: the accessible cell tree (`role="gridcell"`).
 * Both are the *user-visible* selection, so the signature is the same for the same action.
 */
function activeSignature(host: HTMLElement): string {
  const tableActive = host.querySelector<HTMLElement>('[data-vgt-grid-selection="active-cell"]');
  if (tableActive) {
    const row = tableActive.closest('tr');
    const rowIndex = Array.from(row?.parentElement?.parentElement?.querySelectorAll('tbody tr') ?? [])
      .indexOf(row as HTMLTableRowElement) + 1;
    // The row-number cell precedes the data columns.
    const colIndex = Array.from(row?.children ?? []).indexOf(tableActive) ;
    return `r${rowIndex}c${colIndex}`;
  }
  const virtualActive = host.querySelector<HTMLElement>('[role="gridcell"][aria-selected="true"]');
  if (virtualActive) {
    return `r${virtualActive.getAttribute('aria-rowindex')}c${virtualActive.getAttribute('aria-colindex')}`;
  }
  throw new Error('no active cell in either renderer');
}

/**
 * The inline cell editor, scoped to the grid itself.
 *
 * A document-wide `input[type="text"]` query finds the **name box** first (it shows `A1`, the
 * selected coordinate) — measured: the first version of this helper asserted against it. The
 * formula bar lives outside `role="grid"`, so the scope is unambiguous for both renderers.
 */
function editor(host: HTMLElement): HTMLInputElement | null {
  return host.querySelector<HTMLInputElement>('[role="grid"] input[type="text"]');
}

async function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  });
}

describe('GR-007 — the virtual renderer is not a second grid', () => {
  it('switches to the virtual renderer above 250 rows and keeps the accessibility contract', async () => {
    const small = await mount(20);
    expect(small.virtual, 'kleine Mappe nutzt den DOM-Renderer').toBe(false);
    await act(async () => { root?.unmount(); });
    root = null;
    container?.remove();

    const large = await mount(320);
    expect(large.virtual, 'ab 250 Zeilen greift der Virtual-Renderer').toBe(true);
    const grid = large.host.querySelector('[role="grid"]');
    expect(Number(grid?.getAttribute('aria-rowcount')), 'alle Zeilen sind angesagt').toBeGreaterThan(250);
    expect(large.host.querySelectorAll('[role="gridcell"]').length, 'die Zellstruktur bleibt im DOM').toBeGreaterThan(0);
  });

  it('navigates identically in both renderers (arrows and Enter)', async () => {
    const results: Array<{ mode: string; right: string; down: string }> = [];
    for (const rows of [20, 320]) {
      const { host, virtual } = await mount(rows);
      const grid = gridRoot(host);
      await press(grid, 'ArrowRight');
      const right = activeSignature(host);
      await press(grid, 'ArrowDown');
      const down = activeSignature(host);
      results.push({ mode: virtual ? 'virtual' : 'dom', right, down });
      await act(async () => { root?.unmount(); });
      root = null;
      container?.remove();
    }
    expect(results[0]!.right, 'Pfeil rechts in beiden Renderern').toBe(results[1]!.right);
    expect(results[0]!.down, 'Pfeil unten in beiden Renderern').toBe(results[1]!.down);
  });

  it('opens the same edit draft on F2 in both renderers', async () => {
    for (const rows of [20, 320]) {
      const { host, virtual } = await mount(rows);
      await press(gridRoot(host), 'F2');
      const field = editor(host);
      expect(field, `F2 muss im ${virtual ? 'virtual' : 'dom'}-Renderer editieren`).not.toBeNull();
      expect(field!.value, 'der Entwurf startet mit dem Zellwert').toBe('A1-Inhalt');
      await act(async () => { root?.unmount(); });
      root = null;
      container?.remove();
    }
  });

  it('starts direct typing with the first character in both renderers', async () => {
    for (const rows of [20, 320]) {
      const { host, virtual } = await mount(rows);
      await press(gridRoot(host), 'N');
      const field = editor(host);
      expect(field, `Direkttippen muss im ${virtual ? 'virtual' : 'dom'}-Renderer greifen`).not.toBeNull();
      expect(field!.value).toBe('N');
      await act(async () => { root?.unmount(); });
      root = null;
      container?.remove();
    }
  });
});
