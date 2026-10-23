// @vitest-environment happy-dom
// STATUS: PLATIN — Der Shell-Formatvertrag endet in der echten Grid-Aktion.
//
// `GridSheet` stellt der Shell ein versioniertes Handle bereit
// (`gridToolbarFormatActionsRef`). Dieses Handle darf keine Attrappe sein: es ruft
// `applyNumberFormatToSelection` auf und schreibt damit Typ + Formatcode in die echten Zellen.
import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { GridCell, TableObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';
import type { GridToolbarFormatActions } from '../../formatting/gridToolbarFormatContract';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-toolbar-format-actions',
  title: 'Grid Toolbar Format Actions',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function workbook(): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', {
    rows: 30,
    cols: 20,
    cells: { A1: { value: 1234.5 } },
  }).updatedDocument;
}

function cellOf(documentUnderTest: WorkspaceDocument, coord: string): GridCell | undefined {
  for (const object of Object.values(documentUnderTest.objects)) {
    if (object.type === 'Table') return (object.data as TableObject).cells[coord];
  }
  return undefined;
}

let root: Root | null = null;
let container: HTMLElement | null = null;

interface Mounted {
  readonly actionsRef: { current: GridToolbarFormatActions | null };
  readonly latestDocument: () => WorkspaceDocument;
}

function Harness({
  start,
  actionsRef,
  onUpdate,
  onReady,
}: {
  start: WorkspaceDocument;
  actionsRef: { current: GridToolbarFormatActions | null };
  onUpdate: (document: WorkspaceDocument) => void;
  onReady: () => void;
}) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  useEffect(() => {
    onReady();
  }, [onReady]);
  return createElement(GridSheet, {
    document,
    workspaceDocuments: {},
    onUpdateDocument: (next: WorkspaceDocument) => {
      onUpdate(next);
      setDocument(next);
    },
    onUpdateWorkspaceDocument: (next: WorkspaceDocument) => {
      onUpdate(next);
      setDocument(next);
    },
    onSelectSelectionType: () => undefined,
    onCreateChart: () => undefined,
    networkCapability: 'None',
    keyVaultUnlocked: false,
    gridToolbarFormatActionsRef: actionsRef,
  });
}

async function mountGrid(): Promise<Mounted> {
  let latest = workbook();
  const actionsRef: { current: GridToolbarFormatActions | null } = { current: null };
  let ready = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Harness, {
      start: latest,
      actionsRef,
      onUpdate: (next: WorkspaceDocument) => { latest = next; },
      onReady: () => { ready = true; },
    }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(ready).toBe(true);
  return { actionsRef, latestDocument: () => latest };
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('Grid-Toolbar-Formathandle', () => {
  it('wendet ein Datumsformat als vollständigen Typ+Code-Patch an', async () => {
    const mounted = await mountGrid();
    const actions = mounted.actionsRef.current;
    expect(actions, 'GridSheet muss das Format-Handle bereitstellen').not.toBeNull();
    expect(typeof actions!.applyQuickFormat).toBe('function');
    expect(typeof actions!.applyNumberFormat).toBe('function');

    await act(async () => {
      actions!.applyQuickFormat('date');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const cell = cellOf(mounted.latestDocument(), 'A1');
    expect(cell?.format, 'Datum ist das vierte Schnellformat').toBe('date');
    expect(cell?.numberFormatCode).toBe('yyyy-mm-dd');
  });

  it('wendet jedes Preset aus dem Format-Menü über dieselbe Aktion an', async () => {
    const mounted = await mountGrid();
    await act(async () => {
      mounted.actionsRef.current!.applyNumberFormat('accounting');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const cell = cellOf(mounted.latestDocument(), 'A1');
    expect(cell?.format).toBe('accounting');
    expect(cell?.numberFormatCode).toBe('$* #,##0.00');
  });
});
