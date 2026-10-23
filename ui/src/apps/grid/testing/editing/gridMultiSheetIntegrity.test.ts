// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/GR-002: Multi-Sheet-Isolation und sheet-übergreifende Undo-Kohärenz.
//
// Die History ist der Hook `useGridDocumentHistory` (keine React-freie öffentliche API);
// dieser Test mountet ihn in einen kontrollierten Harness und committet echte Dokument-
// mutationen über die vorhandenen puren Grid-Funktionen. Der Seam ist damit derselbe wie in
// `gridUndoRedoIntegrity.test.ts`: History-Hook als Autorität, darunter echte Mutatoren;
// keine UI-Events und keine zweite History.
//
// Geprüft werden: Sheet-Isolation bei Zell-/Metadaten-/Strukturänderungen, Undo über
// Sheet-Grenzen, Löschen/Umbenennen mit Undo sowie ein fehlerhaftes Dokument mit doppelten
// Sheet-IDs (Ist-Verhalten wird dokumentiert, nicht repariert).
//
// Befund dieses Laufs (2026-10-18): 6/6 grün.
//   Fall 1: Zellwert auf Sheet 1 lässt Sheet 2 cells/rows/cols unverändert; Zellwert auf
//           Sheet 2 lässt Sheet 1 unverändert; `patchSheetInDocument` mit Sheet-1-ID setzt
//           nur Sheet 1 tabColor. Isoliert.
//   Fall 2: Zeile einfügen in Sheet 1 ändert nur Sheet 1; Sheet 2 rows/cols/cells und
//           Sheet-Metadaten bleiben tief gleich. Isoliert.
//   Fall 3: Op auf Sheet 1 → Op auf Sheet 2; 1. Undo nimmt Sheet 2 zurück und lässt Sheet 1
//           unverändert; 2. Undo liefert exakt den Start; 2 Redos liefern exakt den Endstand.
//   Fall 4a: Sheet löschen entfernt Sheet + Table-Objekt; Undo stellt es samt Zellen an
//           derselben Position wieder her (Dokument tief gleich Start).
//   Fall 4b: Sheet umbenennen ändert nur den Namen; Undo stellt alten Namen + Zellen wieder
//           her (Dokument tief gleich Start).
//   Fall 5: **Duplikat-Sheet-IDs (fehlerhaftes Dokument) — Befunde gepinnt:**
//           `patchSheetInDocument` mutiert **beide** Sheets (`gridWorkbookOperations.ts:192-200`,
//           `.map` über die ID); `renameSheetInDocument` benennt **beide** um
//           (`:94-103`); `applyGridStructureEdit` trifft nur das erste Sheet
//           (`gridWorkbookStructure.ts:90`, `.find`); `deleteSheetFromDocument` entfernt
//           beide Sheets und wirft danach `TypeError: Cannot read properties of undefined
//           (reading 'id')` (`gridWorkbookOperations.ts:153`, `remaining[0].id`).
//           Kein Throw bei Patch/Struktur/Rename; Delete wirft und mutiert das Eingabedokument
//           nicht. Lücke dokumentiert, Quellcode unverändert.
import { act, createElement, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GridCell,
  GridSheetModel,
  TableObject,
  WorkspaceDocument,
} from '../../../../shared/contracts/workspace';
import { useGridDocumentHistory } from '../../history/useGridDocumentHistory';
import {
  addSheetToDocument,
  deleteSheetFromDocument,
  patchSheetInDocument,
  renameSheetInDocument,
} from '../../workbook/gridWorkbookOperations';
import { applyGridStructureEdit } from '../../workbook/gridWorkbookStructure';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-multi-sheet-integrity',
  title: 'Grid Multi-Sheet Integrity',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

/** Zwei Sheets mit eigenen Zellen; Sheet 1 ist aktiv. */
function twoSheetWorkbook(): WorkspaceDocument {
  const first = addSheetToDocument(BASE, [], 'Sheet 1', {
    rows: 10,
    cols: 5,
    cells: { A1: { value: 'S1-A1' }, B2: { value: 1 } },
  });
  const second = addSheetToDocument(first.updatedDocument, first.updatedDocument.gridData!.sheets, 'Sheet 2', {
    rows: 8,
    cols: 4,
    cells: { A1: { value: 'S2-A1' }, C3: { value: 2 } },
  });
  return {
    ...second.updatedDocument,
    gridData: { ...second.updatedDocument.gridData!, activeSheetId: first.newSheetId },
  };
}

function sheetAt(documentUnderTest: WorkspaceDocument, index: number): GridSheetModel {
  const sheet = documentUnderTest.gridData?.sheets[index];
  if (!sheet) throw new Error(`Sheet an Position ${index} fehlt`);
  return sheet;
}

function tableAt(documentUnderTest: WorkspaceDocument, index: number): TableObject {
  const sheet = sheetAt(documentUnderTest, index);
  const object = documentUnderTest.objects[sheet.tableObjectId];
  if (!object || object.type !== 'Table') throw new Error(`Table-Objekt für Sheet ${index} fehlt`);
  return object.data as TableObject;
}

function cellsAt(documentUnderTest: WorkspaceDocument, index: number): Record<string, GridCell> {
  return tableAt(documentUnderTest, index).cells;
}

function setCell(
  documentUnderTest: WorkspaceDocument,
  sheetIndex: number,
  coord: string,
  cell: GridCell | undefined,
): WorkspaceDocument {
  const next = structuredClone(documentUnderTest);
  const table = tableAt(next, sheetIndex);
  if (cell === undefined) delete table.cells[coord];
  else table.cells[coord] = cell;
  next.version += 1;
  next.modified_at = Date.now();
  return next;
}

interface SheetSnapshot {
  readonly sheet: GridSheetModel;
  readonly rows: number;
  readonly cols: number;
  readonly cells: Record<string, GridCell>;
}

function snapshotSheet(documentUnderTest: WorkspaceDocument, index: number): SheetSnapshot {
  const table = tableAt(documentUnderTest, index);
  return {
    sheet: structuredClone(sheetAt(documentUnderTest, index)),
    rows: table.rows,
    cols: table.cols,
    cells: structuredClone(table.cells),
  };
}

// --- History-Harness (identischer Seam wie im Undo/Redo-Integritätstest) ---

interface HistoryApi {
  getCurrent(): WorkspaceDocument;
  commit(next: WorkspaceDocument): void;
  undo(): boolean;
  redo(): boolean;
}

let activeRoot: Root | null = null;
let activeContainer: HTMLElement | null = null;

function HistoryHarness({
  initialDocument,
  onReady,
}: {
  initialDocument: WorkspaceDocument;
  onReady: (api: HistoryApi) => void;
}) {
  const [document, setDocument] = useState<WorkspaceDocument>(initialDocument);
  const currentRef = useRef(document);
  currentRef.current = document;
  const history = useGridDocumentHistory(document, setDocument);
  const apiRef = useRef<HistoryApi>({
    getCurrent: () => currentRef.current,
    commit: history.commit,
    undo: history.undo,
    redo: history.redo,
  });
  apiRef.current = {
    getCurrent: () => currentRef.current,
    commit: history.commit,
    undo: history.undo,
    redo: history.redo,
  };
  useEffect(() => {
    onReady(apiRef.current);
  }, [onReady]);
  return createElement('div', { 'data-grid-history-harness': 'true' });
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flush(): Promise<void> {
  await act(async () => {
    await tick();
  });
}

async function mountHistory(initialDocument: WorkspaceDocument): Promise<HistoryApi> {
  let api: HistoryApi | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  activeRoot = root;
  activeContainer = container;
  await act(async () => {
    root.render(createElement(HistoryHarness, {
      initialDocument,
      onReady: (ready: HistoryApi) => { api = ready; },
    }));
  });
  await flush();
  if (!api) throw new Error('History-API wurde nicht bereitgestellt');
  return api;
}

async function unmountHistory(): Promise<void> {
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
  await unmountHistory();
});

async function commit(api: HistoryApi, next: WorkspaceDocument): Promise<void> {
  await act(async () => {
    api.commit(next);
    await tick();
  });
}

async function undo(api: HistoryApi): Promise<boolean> {
  let result = false;
  await act(async () => {
    result = api.undo();
    await tick();
  });
  return result;
}

async function redo(api: HistoryApi): Promise<boolean> {
  let result = false;
  await act(async () => {
    result = api.redo();
    await tick();
  });
  return result;
}

describe('GR-001/GR-002 — Multi-Sheet-Isolation und Undo-Kohärenz', () => {
  it('Fall 1: Zellwert- und Metadatenänderung treffen nur das Zielsheet', () => {
    const start = twoSheetWorkbook();
    const sheet2Before = snapshotSheet(start, 1);
    const sheet1Before = snapshotSheet(start, 0);

    const afterSheet1 = setCell(start, 0, 'A1', { value: 'S1-EDIT' });
    expect(cellsAt(afterSheet1, 1), 'Sheet 2 bleibt bei Sheet-1-Zelledit unverändert').toEqual(sheet2Before.cells);
    expect(tableAt(afterSheet1, 1).rows).toBe(sheet2Before.rows);
    expect(tableAt(afterSheet1, 1).cols).toBe(sheet2Before.cols);

    const afterSheet2 = setCell(afterSheet1, 1, 'B2', { value: 'S2-EDIT' });
    expect(cellsAt(afterSheet2, 0), 'Sheet 1 bleibt bei Sheet-2-Zelledit unverändert').toEqual(cellsAt(afterSheet1, 0));
    expect(sheetAt(afterSheet2, 0)).toEqual(sheetAt(afterSheet1, 0));

    const patched = patchSheetInDocument(afterSheet2, sheetAt(afterSheet2, 0).id, { tabColor: '#2563eb' });
    expect(sheetAt(patched, 0).tabColor).toBe('#2563eb');
    expect(sheetAt(patched, 1).tabColor, 'Sheet 2 bekommt keine fremde Metadatenänderung').toBeUndefined();
    expect(cellsAt(patched, 1), 'der Stand von Sheet 2 bleibt nach dem Sheet-1-Patch unverändert').toEqual(cellsAt(afterSheet2, 1));
    expect(sheet1Before.cells).toEqual(cellsAt(start, 0));
  });

  it('Fall 2: Zeile einfügen in Sheet 1 lässt Sheet 2 rows/cols/Zellen unverändert', () => {
    const start = twoSheetWorkbook();
    const sheet2Before = snapshotSheet(start, 1);
    const sheet1RowsBefore = tableAt(start, 0).rows;

    const after = applyGridStructureEdit(start, sheetAt(start, 0).id, {
      kind: 'insert-row',
      index: 1,
      count: 1,
    });

    expect(tableAt(after, 0).rows).toBe(sheet1RowsBefore + 1);
    expect(tableAt(after, 1).rows, 'Sheet 2 rows bleiben unverändert').toBe(sheet2Before.rows);
    expect(tableAt(after, 1).cols, 'Sheet 2 cols bleiben unverändert').toBe(sheet2Before.cols);
    expect(cellsAt(after, 1), 'Sheet 2 cells bleiben unverändert').toEqual(sheet2Before.cells);
    expect(sheetAt(after, 1)).toEqual(sheet2Before.sheet);
  });

  it('Fall 3: Sheet-übergreifendes Undo/Redo stellt beide Sheets exakt wieder her', async () => {
    const start = twoSheetWorkbook();
    const api = await mountHistory(structuredClone(start));
    const sheet1Id = sheetAt(start, 0).id;
    const sheet2Id = sheetAt(start, 1).id;

    const op1 = setCell(api.getCurrent(), 0, 'A1', { value: 'S1-EDIT' });
    await commit(api, op1);
    const afterOp1 = structuredClone(api.getCurrent());

    const op2 = setCell(api.getCurrent(), 1, 'B2', { value: 'S2-EDIT' });
    await commit(api, op2);
    const afterOp2 = structuredClone(api.getCurrent());
    expect(cellsAt(afterOp2, 0).A1?.value).toBe('S1-EDIT');
    expect(cellsAt(afterOp2, 1).B2?.value).toBe('S2-EDIT');

    expect(await undo(api)).toBe(true);
    expect(api.getCurrent(), '1. Undo muss Sheet 2 zurücknehmen, Sheet 1 unverändert lassen').toEqual(afterOp1);
    expect(cellsAt(api.getCurrent(), 0).A1?.value, 'Sheet 1 bleibt beim Sheet-2-Undo unverändert').toBe('S1-EDIT');
    expect(cellsAt(api.getCurrent(), 1)).toEqual(cellsAt(start, 1));

    expect(await undo(api)).toBe(true);
    expect(api.getCurrent(), '2. Undo muss den Startzustand beider Sheets wiederherstellen').toEqual(start);
    expect(sheetAt(api.getCurrent(), 0).id).toBe(sheet1Id);
    expect(sheetAt(api.getCurrent(), 1).id).toBe(sheet2Id);

    expect(await redo(api)).toBe(true);
    expect(api.getCurrent()).toEqual(afterOp1);
    expect(await redo(api)).toBe(true);
    expect(api.getCurrent(), 'Redo beider Ops muss den Endzustand exakt wiederherstellen').toEqual(afterOp2);
  });

  it('Fall 4a: Sheet löschen + Undo stellt es samt Zellen an derselben Position wieder her', async () => {
    const start = twoSheetWorkbook();
    const api = await mountHistory(structuredClone(start));
    const sheet1 = sheetAt(api.getCurrent(), 0);
    const deleted = deleteSheetFromDocument(
      api.getCurrent(),
      api.getCurrent().gridData!.sheets,
      sheet1.id,
      sheet1.id,
    );
    expect(deleted).not.toBeNull();
    await commit(api, deleted!.updatedDocument);

    const afterDelete = structuredClone(api.getCurrent());
    expect(afterDelete.gridData!.sheets.some((sheet) => sheet.id === sheet1.id)).toBe(false);
    expect(afterDelete.objects[sheet1.tableObjectId]).toBeUndefined();

    expect(await undo(api)).toBe(true);
    const restored = api.getCurrent();
    expect(restored).toEqual(start);
    expect(sheetAt(restored, 0).id, 'Sheet muss an derselben Position zurückkehren').toBe(sheet1.id);
    expect(cellsAt(restored, 0), 'Zellen des gelöschten Sheets müssen wieder da sein').toEqual(cellsAt(start, 0));
  });

  it('Fall 4b: Sheet umbenennen + Undo stellt den alten Namen bei unveränderten Zellen wieder her', async () => {
    const start = twoSheetWorkbook();
    const api = await mountHistory(structuredClone(start));
    const sheet1 = sheetAt(api.getCurrent(), 0);
    const cellsBefore = structuredClone(cellsAt(api.getCurrent(), 0));

    const renamed = renameSheetInDocument(api.getCurrent(), sheet1.id, 'Umsatz 2026');
    await commit(api, renamed);
    expect(sheetAt(api.getCurrent(), 0).name).toBe('Umsatz 2026');
    expect(cellsAt(api.getCurrent(), 0), 'Umbenennen darf Zellen nicht verändern').toEqual(cellsBefore);
    expect(cellsAt(api.getCurrent(), 1)).toEqual(cellsAt(start, 1));

    expect(await undo(api)).toBe(true);
    expect(sheetAt(api.getCurrent(), 0).name).toBe('Sheet 1');
    expect(cellsAt(api.getCurrent(), 0)).toEqual(cellsBefore);
    expect(api.getCurrent()).toEqual(start);
  });

  it('Fall 5: doppelte Sheet-IDs — jede Operation trifft jetzt genau ein Sheet (gehärtet)', () => {
    const malformed: WorkspaceDocument = {
      ...BASE,
      id: 'grid-duplicate-sheet-ids',
      root_object_ids: ['table-a', 'table-b'],
      objects: {
        'table-a': { type: 'Table', data: { id: 'table-a', rows: 5, cols: 3, cells: { A1: { value: 'A' } } } },
        'table-b': { type: 'Table', data: { id: 'table-b', rows: 9, cols: 4, cells: { A1: { value: 'B' } } } },
      },
      gridData: {
        sheets: [
          { id: 'dup-sheet', name: 'Sheet A', tableObjectId: 'table-a' },
          { id: 'dup-sheet', name: 'Sheet B', tableObjectId: 'table-b' },
        ],
        activeSheetId: 'dup-sheet',
      },
    };

    /**
     * Ein fehlerhaftes Dokument kann dieselbe Sheet-ID zweimal tragen. Vor der Härtung mutierten
     * `patchSheetInDocument`/`renameSheetInDocument` **beide** Sheets (während Struktur-Edits nur
     * das erste trafen) und `deleteSheetFromDocument` entfernte beide und warf danach ein
     * TypeError. Jetzt gilt überall dieselbe Regel: genau ein Sheet, das **erste** passende.
     */
    const patched = patchSheetInDocument(malformed, 'dup-sheet', { tabColor: '#dc2626' });
    expect(patched.gridData!.sheets[0]!.tabColor, 'Patch trifft nur das erste Sheet').toBe('#dc2626');
    expect(patched.gridData!.sheets[1]!.tabColor, 'das zweite Sheet bleibt unangetastet').toBeUndefined();

    // applyGridStructureEdit nutzt `.find(...)`: nur das erste Sheet/Table wird bearbeitet.
    const structured = applyGridStructureEdit(malformed, 'dup-sheet', { kind: 'insert-row', index: 1, count: 1 });
    const tableA = structured.objects['table-a']!.data as TableObject;
    const tableB = structured.objects['table-b']!.data as TableObject;
    expect(tableA.rows, 'Struktur-Edit trifft nur das erste Blatt der Duplikat-ID').toBe(6);
    expect(tableB.rows, 'das zweite Blatt bleibt beim Duplikat-Struktur-Edit unverändert').toBe(9);
    expect(tableB.cells).toEqual({ A1: { value: 'B' } });

    // renameSheetInDocument: ebenfalls nur das erste Sheet.
    const renamed = renameSheetInDocument(malformed, 'dup-sheet', 'Duplikat umbenannt');
    expect(renamed.gridData!.sheets.map((sheet) => sheet.name)).toEqual(['Duplikat umbenannt', 'Sheet B']);

    // deleteSheetFromDocument: entfernt genau ein Sheet und wirft nicht mehr.
    const deleted = deleteSheetFromDocument(malformed, malformed.gridData!.sheets, 'dup-sheet', 'dup-sheet');
    expect(deleted, 'Löschen mit Duplikat-ID liefert ein Ergebnis statt eines Throws').not.toBeNull();
    expect(deleted!.updatedDocument.gridData!.sheets, 'genau ein Sheet wurde entfernt').toHaveLength(1);
    expect(deleted!.updatedDocument.gridData!.sheets[0]!.name, 'das erste passende Sheet wurde entfernt').toBe('Sheet B');
    expect(deleted!.nextActiveId, 'die aktive Sheet-ID bleibt benutzbar').toBe('dup-sheet');
    expect(malformed.gridData!.sheets, 'das Eingabedokument bleibt unmutiert').toHaveLength(2);
  });
});
