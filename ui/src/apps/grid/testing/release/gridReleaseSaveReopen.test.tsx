// @vitest-environment happy-dom
// STATUS: PLATIN — Release 0.1: Grid Save/Reopen über den kanonischen Serializer.
//
// Der Nutzer verlangt, dass Zellen, Formeln, Zahlenformate und Sheets nach Speichern und
// Wiederöffnen verlustfrei zurückkommen. Diese Datei benutzt **nur** die ausgelieferten,
// plattform-eigenen Serializer (keine zweite Persistenz) und mountet das wiedereröffnete
// Dokument erneut in die echte `GridSheet`.
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { TableObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModel';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';
import { createNewDocument } from '../../../../app/bootstrap/seedDocDefaultsOpenCore';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

function releaseWorkbook(): WorkspaceDocument {
  const fresh = createNewDocument('Grid' as never) as WorkspaceDocument;
  const added = addSheetToDocument(fresh, fresh.gridData!.sheets, 'Umsatz 2026', {
    rows: 40,
    cols: 20,
    cells: {
      A1: { value: 'Posten' },
      B1: { value: 15, format: 'currency', numberFormatCode: '$#,##0.00' },
      B2: { value: 10 },
      B3: { value: 5 },
      C1: { value: 25, formula: '=B1+B2', dataType: 'formula' },
      D1: { value: 46305, format: 'date', numberFormatCode: 'yyyy-mm-dd' },
      E1: { value: 0.25, format: 'percent', numberFormatCode: '0.00%' },
      F1: { value: 'fett', bold: true, background: '#112233' },
    },
  }).updatedDocument;
  const newSheet = added.gridData!.sheets[added.gridData!.sheets.length - 1]!;
  // The sheet carries the active state in the document, not in the Grid component.
  return {
    ...added,
    gridData: { ...added.gridData!, activeSheetId: newSheet.id },
  };
}

function tableOf(documentUnderTest: WorkspaceDocument): TableObject {
  const sheet = documentUnderTest.gridData!.sheets.find((candidate) => candidate.name === 'Umsatz 2026')!;
  const object = documentUnderTest.objects[sheet.tableObjectId];
  if (!object || object.type !== 'Table') throw new Error('Table object missing');
  return object.data as TableObject;
}

async function mount(documentUnderTest: WorkspaceDocument): Promise<HTMLElement> {
  const Harness = () => {
    const [document, setDocument] = useState<WorkspaceDocument>(documentUnderTest);
    return createElement(GridSheet, {
      document,
      workspaceDocuments: {},
      onUpdateDocument: (next: WorkspaceDocument) => setDocument(next),
      onUpdateWorkspaceDocument: (next: WorkspaceDocument) => setDocument(next),
      onSelectSelectionType: () => undefined,
      onCreateChart: () => undefined,
      networkCapability: 'None',
      keyVaultUnlocked: false,
    } as never);
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Harness));
  });
  return container;
}

async function mountAndSettle(documentUnderTest: WorkspaceDocument): Promise<HTMLElement> {
  const host = await mount(documentUnderTest);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

async function key(target: Element, name: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('Release 0.1 — Grid Save/Reopen', () => {
  it('erhält Formeln, Zahlenformate und Sheets über serialize → deserialize', () => {
    const original = releaseWorkbook();
    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(original));

    expect(reopened.kind).toBe('Grid');
    expect(reopened.id).toBe(original.id);
    expect(reopened.title).toBe(original.title);
    expect(reopened.root_object_ids).toEqual(original.root_object_ids);
    expect(reopened.gridData?.activeSheetId).toBe(original.gridData?.activeSheetId);
    expect(reopened.gridData?.sheets).toHaveLength(original.gridData!.sheets.length);
    expect(reopened.gridData?.sheets.map((sheet) => ({ id: sheet.id, name: sheet.name, tableObjectId: sheet.tableObjectId })))
      .toEqual(original.gridData!.sheets.map((sheet) => ({ id: sheet.id, name: sheet.name, tableObjectId: sheet.tableObjectId })));

    const before = tableOf(original);
    const after = tableOf(reopened);
    expect(after.rows).toBe(before.rows);
    expect(after.cols).toBe(before.cols);
    expect(after.cells).toEqual(before.cells);
    expect(after.cells.C1?.formula).toBe('=B1+B2');
    expect(after.cells.B1?.numberFormatCode).toBe('$#,##0.00');
    expect(after.cells.D1?.numberFormatCode).toBe('yyyy-mm-dd');
    expect(after.cells.E1?.numberFormatCode).toBe('0.00%');
    expect(after.cells.F1).toMatchObject({ value: 'fett', bold: true, background: '#112233' });

    // Canonical serialization is stable across a reopen/save second generation.
    expect(serializeWorkspaceDocumentCanonical(reopened))
      .toBe(serializeWorkspaceDocumentCanonical(original));
  });

  it('zeigt das wiedereröffnete Grid mit aktivem Sheet, Formel und Format bedienbar', async () => {
    const original = releaseWorkbook();
    const reopened = deserializeWorkspaceDocumentCanonical(serializeWorkspaceDocumentCanonical(original));
    const host = await mountAndSettle(reopened);

    expect(host.querySelector('[role="grid"]')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('[data-grid-name-box="true"]')?.value).toBe('A1');
    expect(host.textContent).toContain('Umsatz 2026');
    expect(host.textContent).toContain('Posten');

    const grid = host.querySelector<HTMLElement>('[data-vgt-grid-root="true"]')!;
    grid.focus();
    await key(grid, 'ArrowRight');
    await key(grid, 'ArrowRight');
    expect(host.querySelector<HTMLInputElement>('[data-grid-name-box="true"]')?.value).toBe('C1');
    // The formula field must show the raw formula, not only the cached value.
    expect(host.querySelector<HTMLInputElement>('.vgt-grid-formula-input')?.value).toBe('=B1+B2');
    expect(host.querySelector('[data-grid-selection-summary="true"]')?.textContent).toContain('C1');
  });
});
