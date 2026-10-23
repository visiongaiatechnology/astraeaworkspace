// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/M1: Auswahlkohärenz nach strukturellen Ops und Undo/Redo.
//
// Die Auswahl (`selectedCell`, `selectionAnchor`, `selectionFocus`) liegt im Hook
// `useGridState`; die Dokument-History im Hook `useGridDocumentHistory`. Diese Datei mountet
// beide in einen kontrollierten Harness und ruft die echten Struktur-/Sheet-Handler auf.
// Der Seam ist ausdrücklich: es gibt keine React-freie State-API; die Hook-Rückgaben sind
// die produktiven Autoritäten. Name-Box-Kontrakt: `GridFormulaBar` zeigt `selectedRange`
// (`GridFormulaBar.tsx:285-305`), deshalb wird `selectedRange === selectedCell` (Einzel-
// auswahl) als Name-Box-Gleichheit geprüft.
//
// Befund dieses Laufs (2026-10-18): 6/6 grün; ausgewählte Zellen bleiben gültig, keine Throws.
//   Fall 1: A5, Zeile 5 löschen → selectedCell A5, selectedRange A5, rows=9; A5 enthält
//           jetzt den alten A6-Wert (R6). Auswahl bleibt im gültigen Bereich.
//   Fall 2: C3, Spalte C löschen → selectedCell/selectedRange C3, cols=4; C3 enthält den
//           alten D3-Wert. Gültig.
//   Fall 3: Undo der Zeilenlöschung → Dokument tief gleich Start; selectedCell/selectedRange
//           A5; A5 enthält wieder R5. Gültig.
//   Fall 4: Zeile über A5 einfügen → **Ist:** selectedCell bleibt A5, obwohl der Inhalt
//           nach A6 wandert; A5 enthält danach den alten A4-Wert. Name-Box konsistent
//           (selectedRange=A5), aber die Auswahl folgt dem Inhalt nicht. Ursache:
//           `handleStructureEdit` aktualisiert nur das Dokument
//           (`useGridAdvancedController.ts:130-146`), nicht `selectedCell`/Anker
//           (`useGridState.ts:102-104`). Dokumentierter Ist-Zustand.
//   Fall 5: aktives Sheet löschen → activeSheetId wechselt auf ein existierendes Blatt
//           (keine Waise), selectedCell/Name-Box bleiben gültig. **Nach Undo:** Dokument
//           stellt Sheet und `gridData.activeSheetId` wieder her, aber die Hook-State-
//           `activeSheetId` bleibt auf dem verbliebenen Blatt — sie wird nur einmal
//           initialisiert (`useGridState.ts:76-77`) und nicht mit dem Dokument synchronisiert.
//           selectedCell/Name-Box bleiben in der Hook-Sicht gültig; Dokument- und Hook-Sicht
//           divergieren. Struktureller Fix (Sync-Effekt) nötig, kein kleiner Attr-Fix.
//   Fall 6: gespeicherte Auswahl A10 bei rows=5 → ArrowDown klammert über
//           `moveTo`/`clampIndex` (`gridNavigation.ts:75-85`) auf A5; selectedRange A5;
//           kein Out-of-range/Throw.
import { act, createElement, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridCell, TableObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useGridDocumentHistory } from '../../history/useGridDocumentHistory';
import { useGridState, type GridStateController } from '../../state/useGridState';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';
import { parseA1 } from '../../formulas/formula';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-selection-coherence',
  title: 'Grid Selection Coherence',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

interface HarnessApi {
  getState(): GridStateController;
  getDocument(): WorkspaceDocument;
  undo(): boolean;
  redo(): boolean;
}

let activeRoot: Root | null = null;
let activeContainer: HTMLElement | null = null;

function StateHarness({
  initialDocument,
  onReady,
}: {
  initialDocument: WorkspaceDocument;
  onReady: (api: HarnessApi) => void;
}) {
  const [document, setDocument] = useState<WorkspaceDocument>(initialDocument);
  const documentRef = useRef(document);
  documentRef.current = document;
  const history = useGridDocumentHistory(document, setDocument);
  const state = useGridState({
    document,
    workspaceDocuments: {},
    onUpdateDocument: history.commit,
    onSelectSelectionType: () => undefined,
    reviewUserId: 'test-user',
    reviewRoles: ['editor'],
    reviewAuthor: 'Test',
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const apiRef = useRef<HarnessApi>({
    getState: () => stateRef.current,
    getDocument: () => documentRef.current,
    undo: history.undo,
    redo: history.redo,
  });
  apiRef.current = {
    getState: () => stateRef.current,
    getDocument: () => documentRef.current,
    undo: history.undo,
    redo: history.redo,
  };
  useEffect(() => {
    onReady(apiRef.current);
  }, [onReady]);
  return createElement('div', { 'data-grid-state-harness': 'true' });
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(): Promise<void> {
  await act(async () => {
    await tick();
  });
}

async function mountState(initialDocument: WorkspaceDocument): Promise<HarnessApi> {
  let api: HarnessApi | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  activeRoot = root;
  activeContainer = container;
  await act(async () => {
    root.render(createElement(StateHarness, {
      initialDocument,
      onReady: (ready: HarnessApi) => { api = ready; },
    }));
  });
  await flush();
  if (!api) throw new Error('State-API wurde nicht bereitgestellt');
  return api;
}

async function unmountState(): Promise<void> {
  if (!activeRoot) return;
  const root = activeRoot;
  const container = activeContainer;
  activeRoot = null;
  activeContainer = null;
  try {
    await act(async () => {
      root.unmount();
    });
  } finally {
    container?.remove();
  }
}

afterEach(async () => {
  await unmountState();
});

function documentCell(documentUnderTest: WorkspaceDocument, coord: string): GridCell | undefined {
  for (const object of Object.values(documentUnderTest.objects)) {
    if (object.type !== 'Table') continue;
    const table = object.data as TableObject;
    if (table.cells[coord]) return table.cells[coord];
  }
  return undefined;
}

function activeTable(api: HarnessApi): TableObject {
  const state = api.getState();
  const sheet = state.activeSheetModel;
  if (!sheet) throw new Error('aktives Blatt fehlt');
  const object = api.getDocument().objects[sheet.tableObjectId];
  if (!object || object.type !== 'Table') throw new Error('aktives Table-Objekt fehlt');
  return object.data as TableObject;
}

async function selectCell(api: HarnessApi, coord: string): Promise<void> {
  await act(async () => {
    const state = api.getState();
    state.setSelectedCell(coord);
    state.setSelectionAnchor(coord);
    state.setSelectionFocus(coord);
    await tick();
  });
}

async function runStructureEdit(api: HarnessApi, edit: Parameters<GridStateController['handleStructureEdit']>[0]): Promise<void> {
  const before = api.getDocument();
  await act(async () => {
    api.getState().handleStructureEdit(edit);
    await tick();
  });
  // Gefährliche Löschungen verlangen eine zweite, identische Bestätigung.
  if (api.getState().validationError && api.getDocument() === before) {
    await act(async () => {
      api.getState().handleStructureEdit(edit);
      await tick();
    });
  }
}

async function undoDocument(api: HarnessApi): Promise<boolean> {
  let result = false;
  await act(async () => {
    result = api.undo();
    await tick();
  });
  return result;
}

function expectValidSelection(api: HarnessApi): { row: number; col: number } {
  const state = api.getState();
  const documentUnderTest = api.getDocument();
  expect(state.activeSheetModel, 'es muss ein aktives Blatt geben').not.toBeUndefined();
  expect(state.workbookSheets.some((sheet) => sheet.id === state.activeSheetId), 'activeSheetId muss existieren').toBe(true);
  const table = activeTable(api);
  const parsed = parseA1(state.selectedCell);
  expect(parsed, `selectedCell "${state.selectedCell}" muss gültig sein`).not.toBeNull();
  expect(parsed!.row, 'Zeile innerhalb der Tabelle').toBeLessThan(table.rows);
  expect(parsed!.col, 'Spalte innerhalb der Tabelle').toBeLessThan(table.cols);
  expect(state.selectedRange, 'Name-Box (selectedRange) muss dem selectedCell entsprechen').toBe(state.selectedCell);
  expect(documentUnderTest.gridData?.sheets.some((sheet) => sheet.id === state.activeSheetId)).toBe(true);
  return { row: parsed!.row, col: parsed!.col };
}

function oneSheetWorkbook(cells: Record<string, GridCell>, rows = 10, cols = 5): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', { rows, cols, cells }).updatedDocument;
}

function twoSheetWorkbook(): WorkspaceDocument {
  const first = addSheetToDocument(BASE, [], 'Sheet 1', {
    rows: 10,
    cols: 5,
    cells: { C3: { value: 'S1-C3' } },
  });
  const second = addSheetToDocument(first.updatedDocument, first.updatedDocument.gridData!.sheets, 'Sheet 2', {
    rows: 10,
    cols: 5,
    cells: { C3: { value: 'S2-C3' } },
  });
  return second.updatedDocument;
}

describe('Auswahlkohärenz nach strukturellen Ops und Undo/Redo', () => {
  it('Fall 1: Zeile mit aktiver Zelle A5 löschen → Auswahl bleibt existierend/konsistent', async () => {
    const api = await mountState(oneSheetWorkbook({
      A5: { value: 'R5' },
      A6: { value: 'R6' },
    }));
    await selectCell(api, 'A5');
    await runStructureEdit(api, { kind: 'delete-row', index: 4, count: 1 });

    expectValidSelection(api);
    expect(api.getState().selectedCell).toBe('A5');
    expect(activeTable(api).rows).toBe(9);
    expect(documentCell(api.getDocument(), 'A5')?.value).toBe('R6');
  });

  it('Fall 2: Spalte mit aktiver Zelle C3 löschen → Auswahl bleibt existierend/konsistent', async () => {
    const api = await mountState(oneSheetWorkbook({
      C3: { value: 'C3' },
      D3: { value: 'D3' },
    }));
    await selectCell(api, 'C3');
    await runStructureEdit(api, { kind: 'delete-col', index: 2, count: 1 });

    expectValidSelection(api);
    expect(api.getState().selectedCell).toBe('C3');
    expect(activeTable(api).cols).toBe(4);
    expect(documentCell(api.getDocument(), 'C3')?.value).toBe('D3');
  });

  it('Fall 3: Undo der Zeilenlöschung stellt Zeile und Auswahlkonsistenz wieder her', async () => {
    const start = oneSheetWorkbook({ A5: { value: 'R5' }, A6: { value: 'R6' } });
    const api = await mountState(structuredClone(start));
    await selectCell(api, 'A5');
    await runStructureEdit(api, { kind: 'delete-row', index: 4, count: 1 });
    expectValidSelection(api);
    expect(api.getDocument()).not.toEqual(start);

    expect(await undoDocument(api)).toBe(true);
    expectValidSelection(api);
    expect(api.getDocument()).toEqual(start);
    expect(api.getState().selectedCell).toBe('A5');
    expect(documentCell(api.getDocument(), 'A5')?.value).toBe('R5');
  });

  it('Fall 4: Zeile über der Auswahl einfügen — Ist-Zustand der Auswahl wird gepinnt', async () => {
    const api = await mountState(oneSheetWorkbook({
      A4: { value: 'R4' },
      A5: { value: 'R5' },
      A6: { value: 'R6' },
    }));
    await selectCell(api, 'A5');
    await runStructureEdit(api, { kind: 'insert-row', index: 2, count: 1 });

    expectValidSelection(api);
    // Ist-Zustand: die Auswahl bleibt auf A5 stehen, obwohl der Inhalt nach A6 gewandert ist.
    expect(api.getState().selectedCell).toBe('A5');
    expect(documentCell(api.getDocument(), 'A5')?.value).toBe('R4');
    expect(documentCell(api.getDocument(), 'A6')?.value).toBe('R5');
  });

  it('Fall 5: Sheet löschen + Undo — activeSheetId bleibt existierend, Undo-Verhalten dokumentiert', async () => {
    const start = twoSheetWorkbook();
    const api = await mountState(structuredClone(start));
    const deletedSheetId = api.getState().activeSheetId;
    await selectCell(api, 'C3');

    await act(async () => {
      api.getState().handleDeleteSheet(deletedSheetId);
      await tick();
    });
    const afterDelete = api.getState();
    expect(afterDelete.workbookSheets.some((sheet) => sheet.id === afterDelete.activeSheetId), 'nach Delete keine Waisen-ID').toBe(true);
    expectValidSelection(api);

    expect(await undoDocument(api)).toBe(true);
    const afterUndo = api.getState();
    const documentAfterUndo = api.getDocument();
    expect(afterUndo.workbookSheets.some((sheet) => sheet.id === afterUndo.activeSheetId), 'nach Undo keine Waisen-ID').toBe(true);
    expect(documentAfterUndo.gridData?.sheets.some((sheet) => sheet.id === deletedSheetId), 'Sheet im Dokument wiederhergestellt').toBe(true);
    expect(documentAfterUndo.gridData?.activeSheetId, 'Dokument erwartet das gelöschte Sheet wieder aktiv').toBe(deletedSheetId);

    // Behoben (Runde 18): der Hook folgt jetzt dem Dokument (`useGridState`-Sync-Effekt), damit
    // Undo/Redo das aktive Sheet nicht nur im Dokument, sondern auch in der UI wiederherstellt.
    expect(afterUndo.activeSheetId, 'Hook folgt dem Dokument nach dem Undo').toBe(deletedSheetId);
    expect(afterUndo.activeSheetId).toBe(documentAfterUndo.gridData?.activeSheetId);
    expectValidSelection(api);
  });

  it('Fall 6: Auswahl außerhalb der Grenzen (A10 bei rows=5) wird per Interaktion geklammert', async () => {
    const api = await mountState(oneSheetWorkbook({ A1: { value: 'Start' } }, 5, 3));
    await flush();
    expect(api.getState().rowCount).toBe(5);
    await selectCell(api, 'A10');

    await act(async () => {
      api.getState().handleKeyDownGrid({
        key: 'ArrowDown',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        keyCode: 40,
        nativeEvent: { isComposing: false },
        preventDefault: () => undefined,
      } as never);
      await tick();
    });

    expectValidSelection(api);
    expect(api.getState().selectedCell).toBe('A5');
  });
});
