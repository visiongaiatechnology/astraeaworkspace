// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/M1: Undo/Redo-Kohärenz über gemischte Grid-Operationen.
//
// Es gibt keine öffentliche, React-freie Undo-API: die kanonische History ist der Hook
// `useGridDocumentHistory` (`apps/grid/history/useGridDocumentHistory.ts`), den `GridSheet`
// mit `documentHistory.commit/undo/redo` verdrahtet. Diese Datei mountet den Hook in einen
// kleinen kontrollierten Harness und committet echte Dokumentmutationen über die vorhandenen
// puren Grid-Funktionen (Struktur, Umbenennen, Tab-Farbe, AutoFill, Zellstil, Zahlenformat,
// Range-Permission). Der Seam ist damit ausdrücklich: React-Hook als History-Autorität,
// darunter die echten Dokumentmutatoren; keine UI-Events und keine zweite History.
//
// Befund dieses Laufs (2026-10-18): 3/3 grün, **keine Lücke** in der History-Kohärenz.
//   (a)+(b)+(c): 13 gemischte Operationen; undoCount = 13, danach ist der Dokumentzustand
//       tief gleich dem Startzustand. Ein weiteres Undo liefert false und ändert nichts.
//       redoCount = 13, danach tief gleich dem Zustand vor dem Undo. Ein weiteres Redo
//       liefert false und ändert nichts.
//   (d): 5 Operationen, 2 Undos, 1 neue Operation → der neue Commit verwirft den Redo-Zweig;
//       `redo()` liefert false, der Zustand bleibt der Branch-Zustand.
//   Leerer Stack: Undo/Redo am Anfang/Ende liefern false und werfen nicht.
//
// Belegt: `useGridDocumentHistory` speichert vollständige Dokument-Snapshots, Undo/Redo
// stellen sie exakt wieder her, und ein Commit nach Undo verwirft den Redo-Zweig
// (`apps/grid/history/useGridDocumentHistory.ts:19-44`). Keine Quellcodeänderung nötig.
import { act, createElement, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GridCell,
  GridRangePermissionRule,
  GridSheetModel,
  TableObject,
  WorkspaceDocument,
} from '../../../../shared/contracts/workspace';
import { useGridDocumentHistory } from '../../history/useGridDocumentHistory';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';
import {
  changeTabColorInDocument,
  patchSheetInDocument,
  renameSheetInDocument,
} from '../../workbook/gridWorkbookOperations';
import { applyGridStructureEdit } from '../../workbook/gridWorkbookStructure';
import { applyGridCellStyle } from '../../formatting/gridFormattingEngine';
import { gridNumberFormatPatch } from '../../formatting/gridNumberFormat';
import { executeAutoFill } from '../../editing/gridAutoFill';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-undo-redo-integrity',
  title: 'Grid Undo/Redo Integrity',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function startDocument(): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', {
    rows: 10,
    cols: 5,
    cells: {
      A1: { value: 1, dataType: 'integer', format: 'number' },
      B1: { value: 2, dataType: 'integer', format: 'number' },
      C1: { value: 3, dataType: 'integer', format: 'number' },
    },
  }).updatedDocument;
}

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

function activeSheet(documentUnderTest: WorkspaceDocument): GridSheetModel {
  const gridData = documentUnderTest.gridData;
  const sheet = gridData?.sheets.find((candidate) => candidate.id === gridData.activeSheetId)
    ?? gridData?.sheets[0];
  if (!sheet) throw new Error('aktives Blatt fehlt');
  return sheet;
}

function activeTable(documentUnderTest: WorkspaceDocument): TableObject {
  const sheet = activeSheet(documentUnderTest);
  const object = documentUnderTest.objects[sheet.tableObjectId];
  if (!object || object.type !== 'Table') throw new Error('aktives Table-Objekt fehlt');
  return object.data as TableObject;
}

/** Immutable Zellmutation auf dem aktiven Blatt; true = echter History-Commit. */
function updateCell(
  documentUnderTest: WorkspaceDocument,
  coord: string,
  update: (cell: GridCell | undefined) => GridCell | undefined,
): WorkspaceDocument {
  const next = structuredClone(documentUnderTest);
  const table = activeTable(next);
  const cell = update(table.cells[coord]);
  if (cell === undefined) delete table.cells[coord];
  else table.cells[coord] = cell;
  next.version += 1;
  next.modified_at = Date.now();
  return next;
}

function fillDown(documentUnderTest: WorkspaceDocument, source: string, target: string): WorkspaceDocument {
  const next = structuredClone(documentUnderTest);
  const table = activeTable(next);
  const result = executeAutoFill([source], target, table.cells);
  table.cells = result.updatedCells;
  next.version += 1;
  next.modified_at = Date.now();
  return next;
}

type DocumentOperation = { readonly name: string; readonly run: (documentUnderTest: WorkspaceDocument) => WorkspaceDocument };

/** Gemischte M1-Operationen (13 Stück, > geforderte 12). */
const OPERATIONS: readonly DocumentOperation[] = [
  {
    name: 'A1-Wert setzen',
    run: (documentUnderTest) => updateCell(documentUnderTest, 'A1', (cell) => ({ ...(cell ?? { value: 0 }), value: 10 })),
  },
  {
    name: 'B1-Formel setzen',
    run: (documentUnderTest) => updateCell(documentUnderTest, 'B1', (cell) => ({ ...(cell ?? { value: 0 }), value: 11, formula: '=A1+1', dataType: 'formula' })),
  },
  {
    name: 'C1 leeren',
    run: (documentUnderTest) => updateCell(documentUnderTest, 'C1', () => undefined),
  },
  {
    name: 'Zeile einfügen',
    run: (documentUnderTest) => applyGridStructureEdit(documentUnderTest, activeSheet(documentUnderTest).id, { kind: 'insert-row', index: 2, count: 1 }),
  },
  {
    name: 'Spalte einfügen',
    run: (documentUnderTest) => applyGridStructureEdit(documentUnderTest, activeSheet(documentUnderTest).id, { kind: 'insert-col', index: 1, count: 1 }),
  },
  {
    name: 'Zeile löschen',
    run: (documentUnderTest) => applyGridStructureEdit(documentUnderTest, activeSheet(documentUnderTest).id, { kind: 'delete-row', index: 3, count: 1 }),
  },
  {
    name: 'Zellsperre (Range-Permission) setzen',
    run: (documentUnderTest) => {
      const permission: GridRangePermissionRule = {
        id: 'lock-a1',
        range: 'A1',
        allowedUsers: [],
        allowedRoles: ['editor'],
        isReadOnly: true,
      };
      return patchSheetInDocument(documentUnderTest, activeSheet(documentUnderTest).id, { rangePermissions: [permission] });
    },
  },
  {
    name: 'Formatierung (Heading) setzen',
    run: (documentUnderTest) => updateCell(documentUnderTest, 'A1', (cell) => applyGridCellStyle(cell, 'Heading')),
  },
  {
    name: 'Blatt umbenennen',
    run: (documentUnderTest) => renameSheetInDocument(documentUnderTest, activeSheet(documentUnderTest).id, 'Umsatz 2026'),
  },
  {
    name: 'Fill down A1→A4',
    run: (documentUnderTest) => fillDown(documentUnderTest, 'A1', 'A4'),
  },
  {
    name: 'Tab-Farbe setzen',
    run: (documentUnderTest) => changeTabColorInDocument(documentUnderTest, activeSheet(documentUnderTest).id, '#2563eb'),
  },
  {
    name: 'Zahlenformat setzen',
    run: (documentUnderTest) => updateCell(documentUnderTest, 'A1', (cell) => ({ ...(cell ?? { value: 0 }), ...gridNumberFormatPatch('number') })),
  },
  {
    name: 'Blattschutz setzen',
    run: (documentUnderTest) => patchSheetInDocument(documentUnderTest, activeSheet(documentUnderTest).id, {
      protection: { isProtected: true, allowSelectLockedCells: true },
    }),
  },
];

async function commit(api: HistoryApi, name: string, run: DocumentOperation['run']): Promise<void> {
  const previous = api.getCurrent();
  const next = run(previous);
  expect(next, `Operation "${name}" muss den Dokumentzustand ändern`).not.toBe(previous);
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

async function applyOperations(api: HistoryApi, operations: readonly DocumentOperation[]): Promise<void> {
  for (const operation of operations) await commit(api, operation.name, operation.run);
}

describe('Grid Undo/Redo-Integrität über gemischte Operationen', () => {
  it('(a)+(b)+(c): Undo bis zum exakten Start, Redo bis zum exakten Ende, Grenzen werfen nicht', async () => {
    /**
     * **Ein** Fixture-Objekt für Baseline und Mount.
     *
     * `startDocument()` läuft durch `addSheetToDocument`, das `modified_at: Date.now()` setzt.
     * Zwei getrennte Aufrufe (einer für die Baseline, einer für den Mount) liegen im schnellen
     * Lauf in derselben Millisekunde und sind tief gleich; unter paralleler Last (volle
     * Grid-Suite) kann die Millisekunde wechseln und der Undo-Vergleich schlug scheinbar fehl —
     * ein Fixture-Flake, kein Produktfehler (isoliert war der Test immer grün).
     */
    const baseline = startDocument();
    const start = structuredClone(baseline);
    const api = await mountHistory(baseline);

    await applyOperations(api, OPERATIONS);
    const end = structuredClone(api.getCurrent());
    expect(end).not.toEqual(start);

    let undoCount = 0;
    while (await undo(api)) {
      undoCount += 1;
      if (undoCount > OPERATIONS.length + 2) throw new Error('Undo-Schleife terminiert nicht');
    }
    expect(undoCount, 'jede Operation muss genau einen Undo-Schritt haben').toBe(OPERATIONS.length);
    expect(api.getCurrent(), 'Undo bis zum Anfang muss exakt den Startzustand liefern').toEqual(start);

    // (c) Undo über den Anfang hinaus: kein Throw, keine Zustandsänderung.
    expect(await undo(api)).toBe(false);
    expect(api.getCurrent()).toEqual(start);

    let redoCount = 0;
    while (await redo(api)) {
      redoCount += 1;
      if (redoCount > OPERATIONS.length + 2) throw new Error('Redo-Schleife terminiert nicht');
    }
    expect(redoCount, 'jede Operation muss genau einen Redo-Schritt haben').toBe(OPERATIONS.length);
    expect(api.getCurrent(), 'Redo bis zum Ende muss exakt den Zustand vor dem Undo liefern').toEqual(end);

    // (c) Redo über das Ende hinaus: kein Throw, keine Zustandsänderung.
    expect(await redo(api)).toBe(false);
    expect(api.getCurrent()).toEqual(end);
  });

  it('(d): 5 Ops, 2 Undos, 1 neue Op → Redo-Stack ist leer und wirkungslos', async () => {
    const api = await mountHistory(startDocument());
    await applyOperations(api, OPERATIONS.slice(0, 5));
    const afterFive = structuredClone(api.getCurrent());

    expect(await undo(api)).toBe(true);
    expect(await undo(api)).toBe(true);
    const afterTwoUndos = structuredClone(api.getCurrent());
    expect(afterTwoUndos).not.toEqual(afterFive);

    // Neue Operation nach dem Undo: der Redo-Zweig muss verworfen werden (Branch).
    const branch = updateCell(api.getCurrent(), 'A1', (cell) => ({ ...(cell ?? { value: 0 }), value: 'BRANCH' }));
    await act(async () => {
      api.commit(branch);
      await tick();
    });
    const afterBranch = structuredClone(api.getCurrent());

    expect(await redo(api), 'nach einer neuen Operation darf Redo nichts mehr liefern').toBe(false);
    expect(api.getCurrent()).toEqual(afterBranch);
  });

  it('Undo/Redo über den leeren Stack am Beginn und Ende werfen nie', async () => {
    const api = await mountHistory(startDocument());
    expect(await undo(api)).toBe(false);
    expect(await redo(api)).toBe(false);

    await commit(api, 'A1-Wert setzen', OPERATIONS[0]!.run);
    expect(await redo(api)).toBe(false);
    expect(await undo(api)).toBe(true);
    expect(await undo(api)).toBe(false);
    expect(await redo(api)).toBe(true);
    expect(await redo(api)).toBe(false);
  });
});
