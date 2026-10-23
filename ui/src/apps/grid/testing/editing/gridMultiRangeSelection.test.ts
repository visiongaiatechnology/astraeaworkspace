// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/M1: disjunkte Ranges (Ctrl-Klick) und Clipboard über mehrere Ranges.
//
// Keine React-freie Auswahl-API: genutzt wird der echte `useGridState`-Hook in einem
// kontrollierten Harness (wie `gridSelectionCoherenceAfterStructure.test.ts`). Die
// Mehrfachauswahl ist `disjointRanges` + primäre `selectedRange`; `selectionRanges` ist die
// abgeleitete Gesamtliste. `copySelection` und Clear/Format laufen über die echten Handler.
//
// Befund dieses Laufs (2026-10-18): 5/5 grün.
//   Fall 1: Ctrl-fähiges Add (handleCellClick additive) erzeugt disjointRanges ['A1','B2'];
//           selectedRange bleibt die aktuelle Primär-Range (B2/C3); selectionRanges ist
//           ['A1','B2','C3']. Funktioniert (`useGridSelectionController.ts:38-55`).
//   Fall 2: **Lücke:** copySelection kopiert **nur** die Primär-Range. Clipboard hat
//           sourceRange C3 und cells {C3}; A1/B2 fehlen. Ursache:
//           `useGridRangeEditingController.ts:52-54` ruft `captureGridClipboard(...,
//           args.selectedRange, ...)` — `selectionRanges` wird ignoriert. Es gibt hier keine
//           TSV-Serialisierung; der strukturierte Payload ist für die Primär-Range deterministisch.
//   Fall 3: applyFormatToSelection/applyNumberFormatToSelection wirken auf **alle**
//           selectionRanges (`useGridState.ts:383-393` bzw. Zahlformat-Funktion): A1/B2/C3
//           werden fett + Zahlformat. Funktioniert.
//   Fall 4: Delete leert alle Ranges (Clear nutzt selectionRanges,
//           `useGridRangeEditingController.ts:79-92`); der Tastaturpfad pusht genau einen
//           Undo-Eintrag (`useGridKeyboardController.ts:100-104`), ein lokales Undo stellt
//           A1/B2/C3 wieder her. Funktioniert.
//   Fall 5: **Lücke:** Escape im Navigationsmodus räumt disjointRanges nicht auf; nach
//           Escape bleibt ['A1','B2'] stehen. `clearDisjointSelections` existiert
//           (`useGridRangeEditingController.ts:100`), ist aber nicht an Escape verdrahtet;
//           der Navigations-Switch in `gridNavigation.ts:239-281` behandelt Escape nicht.
//           Ein normaler Klick (additive=false) setzt die Zusatz-Ranges zurück
//           (`useGridSelectionController.ts:38-55`).
import { act, createElement, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridCell, TableObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useGridState, type GridStateController } from '../../state/useGridState';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-multi-range-selection',
  title: 'Grid Multi-Range Selection',
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
  const state = useGridState({
    document,
    workspaceDocuments: {},
    onUpdateDocument: setDocument,
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
  });
  apiRef.current = {
    getState: () => stateRef.current,
    getDocument: () => documentRef.current,
  };
  useEffect(() => {
    onReady(apiRef.current);
  }, [onReady]);
  return createElement('div', { 'data-grid-multi-range-harness': 'true' });
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

function workbook(): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', {
    rows: 10,
    cols: 5,
    cells: {
      A1: { value: 'A1' },
      B2: { value: 'B2' },
      C3: { value: 'C3' },
      D4: { value: 'D4' },
    },
  }).updatedDocument;
}

function cellOf(documentUnderTest: WorkspaceDocument, coord: string): GridCell | undefined {
  for (const object of Object.values(documentUnderTest.objects)) {
    if (object.type === 'Table') return (object.data as TableObject).cells[coord];
  }
  return undefined;
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

async function addRange(api: HarnessApi, coord: string): Promise<void> {
  await act(async () => {
    api.getState().handleCellClick(coord, false, true);
    await tick();
  });
}

function deleteEvent(): never {
  return {
    key: 'Delete',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    keyCode: 46,
    nativeEvent: { isComposing: false },
    preventDefault: () => undefined,
  } as never;
}

function escapeEvent(): never {
  return {
    key: 'Escape',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    keyCode: 27,
    nativeEvent: { isComposing: false },
    preventDefault: () => undefined,
  } as never;
}

async function press(api: HarnessApi, event: never): Promise<void> {
  await act(async () => {
    api.getState().handleKeyDownGrid(event);
    await tick();
  });
}

async function multiSelection(api: HarnessApi): Promise<void> {
  await selectCell(api, 'A1');
  await addRange(api, 'B2');
  await addRange(api, 'C3');
}

describe('Mehrfachauswahl (disjunkte Ranges) — Ist-Zustand', () => {
  it('Fall 1: Range bilden — disjointRanges enthält die Zusatz-Range, selectedRange bleibt primär', async () => {
    const api = await mountState(workbook());
    await selectCell(api, 'A1');
    expect(api.getState().selectedRange).toBe('A1');
    expect(api.getState().disjointRanges).toEqual([]);

    await addRange(api, 'B2');
    const afterFirstAdd = api.getState();
    expect(afterFirstAdd.disjointRanges).toEqual(['A1']);
    expect(afterFirstAdd.selectedRange).toBe('B2');
    expect(afterFirstAdd.selectionRanges).toEqual(['A1', 'B2']);

    await addRange(api, 'C3');
    const afterSecondAdd = api.getState();
    expect(afterSecondAdd.disjointRanges).toEqual(['A1', 'B2']);
    expect(afterSecondAdd.selectedRange).toBe('C3');
    expect(afterSecondAdd.selectionRanges).toEqual(['A1', 'B2', 'C3']);
  });

  it('Fall 2: Kopieren über Mehrfachauswahl — Ist: nur die Primär-Range landet in der Zwischenablage', async () => {
    const api = await mountState(workbook());
    await multiSelection(api);
    await act(async () => {
      api.getState().copySelection();
      await tick();
    });
    const clipboard = api.getState().clipboard;
    expect(clipboard).not.toBeNull();
    expect(clipboard!.sourceRange).toBe('C3');
    expect(Object.keys(clipboard!.cells)).toEqual(['C3']);
    expect(clipboard!.cells.A1, 'disjunkte Range A1 wird NICHT mitkopiert').toBeUndefined();
    expect(clipboard!.cells.B2, 'disjunkte Range B2 wird NICHT mitkopiert').toBeUndefined();
  });

  it('Fall 3: Formatierung wirkt auf alle selectionRanges (nicht nur primär)', async () => {
    const api = await mountState(workbook());
    await multiSelection(api);
    await act(async () => {
      api.getState().applyFormatToSelection({ bold: true });
      await tick();
    });
    await act(async () => {
      api.getState().applyNumberFormatToSelection('number');
      await tick();
    });

    const documentAfter = api.getDocument();
    for (const coord of ['A1', 'B2', 'C3']) {
      const cell = cellOf(documentAfter, coord);
      expect(cell?.bold, `${coord} muss fett sein`).toBe(true);
      expect(cell?.format, `${coord} muss das Zahlenformat tragen`).toBe('number');
    }
  });

  it('Fall 4: Delete leert alle Ranges in einem Schritt; ein lokales Undo stellt alles wieder her', async () => {
    const api = await mountState(workbook());
    await multiSelection(api);
    await press(api, deleteEvent());

    const afterDelete = api.getDocument();
    for (const coord of ['A1', 'B2', 'C3']) {
      expect(cellOf(afterDelete, coord)?.value ?? '', `${coord} muss geleert sein`).toBe('');
    }

    await act(async () => {
      api.getState().handleUndo();
      await tick();
    });
    const afterUndo = api.getDocument();
    expect(cellOf(afterUndo, 'A1')?.value).toBe('A1');
    expect(cellOf(afterUndo, 'B2')?.value).toBe('B2');
    expect(cellOf(afterUndo, 'C3')?.value).toBe('C3');
  });

  it('Fall 5 (gehärtet): Escape hebt die disjunkten Ranges auf, genau wie ein normaler Klick', async () => {
    const api = await mountState(workbook());
    await multiSelection(api);
    expect(api.getState().disjointRanges).toEqual(['A1', 'B2']);

    // Runde 19: Escape räumt die Zusatz-Ranges jetzt auf (vorher blieb die Auswahl hängen).
    await press(api, escapeEvent());
    expect(
      api.getState().disjointRanges,
      'Escape im Navigationsmodus räumt disjunkte Ranges auf',
    ).toEqual([]);
    // Die Primär-Range bleibt unangetastet.
    expect(api.getState().selectedRange).toBe('C3');

    // Ein normaler Klick setzt weiterhin alles wie bisher.
    await act(async () => {
      api.getState().handleCellClick('B2', false, false);
      await tick();
    });
    expect(api.getState().disjointRanges).toEqual([]);
    expect(api.getState().selectedRange).toBe('B2');
  });
});
