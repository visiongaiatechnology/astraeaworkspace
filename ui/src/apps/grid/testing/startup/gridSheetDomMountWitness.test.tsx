// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/GR-002: execute `GridSheet` in a real DOM instead of a static string
//
// Measured before this file existed: the Grid suite held 1027 green tests, and **none of them
// mounted `GridSheet`**. `startup/gridSheetStartupWitness.test.tsx` renders React to a string
// once and dispatches no event (`renderToStaticMarkup`), so a render-time exception in the
// component tree or in any DOM-only hook (`useEffect`, `matchMedia`, `ResizeObserver`, a
// measurement) could not be observed. The native application nevertheless showed
// "Modul wurde sicher angehalten" — the `ModuleRecoveryBoundary` child of the real frame.
//
// This witness closes exactly that gap: the production factory builds the document (so the
// input cannot drift from the shape the application stores), the component is mounted with
// `createRoot` inside a real document, and the assertions are taken from the mounted tree.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const CELL_TEXT = 'Astraea-Zelle-7f3a';

const emptyDocument: WorkspaceDocument = {
  id: 'grid-dom-witness',
  title: 'Grid DOM witness',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

/** A document in exactly the shape `addSheetToDocument` writes — the production writer. */
function freshWorkbook(): WorkspaceDocument {
  return addSheetToDocument(emptyDocument, [], 'Sheet 1', {
    cells: { A1: { value: CELL_TEXT } },
  }).updatedDocument;
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
  document.getSelection()?.removeAllRanges();
});

async function mount(target: WorkspaceDocument): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GridSheet, {
      document: target,
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

describe('GR-001/GR-002 — GridSheet starts in a real DOM', () => {
  it('mounts the sheet surface for a workbook built by the production factory', async () => {
    const host = await mount(freshWorkbook());
    const grid = host.querySelector('[role="grid"]');
    expect(grid, 'das Raster muss im DOM stehen').not.toBeNull();
    expect(host.querySelectorAll('td').length).toBeGreaterThan(0);
    // The rendered cell text is the value the document carries.
    expect(host.textContent).toContain(CELL_TEXT);
  });

  it('shows a usable A1 without any further interaction (A1 selection is the startup state)', async () => {
    const host = await mount(freshWorkbook());
    const selected = host.querySelector('[data-grid-selected="true"], [aria-selected="true"]');
    expect(selected, 'eine Zelle muss als ausgewählt markiert sein').not.toBeNull();
  });

  it('does not throw for a document without grid data (negative case, GR-001)', async () => {
    const empty: WorkspaceDocument = { ...emptyDocument, id: 'grid-dom-witness-empty', gridData: undefined };
    const host = await mount(empty);
    // A controlled empty state instead of an exception and instead of a silent wipe.
    expect(host.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it('does not throw for a hostile document: sheet without TableObject (negative case, GR-001)', async () => {
    const hostile: WorkspaceDocument = {
      ...emptyDocument,
      id: 'grid-dom-witness-hostile',
      gridData: {
        sheets: [{ id: 'sheet-lost', name: 'Verwaist', tableObjectId: 'missing-table', rows: 10, columns: 5 }],
      } as never,
    };
    const host = await mount(hostile);
    expect(host.textContent?.length ?? 0).toBeGreaterThan(0);
  });
});
