// @vitest-environment happy-dom
// STATUS: PLATIN — GR-004/M1: Copy → Cut → Paste → Paste-Special über die echte
// Tastatur-/Sheet-Oberfläche.
//
// Mount wie `gridSheetEditStateWitness`: kontrolliertes GridSheet mit useState-Dokument,
// echte `keydown`-Events (Ctrl+C/X/V, Ctrl+Shift+V) am `[data-vgt-grid-root]` und echte
// Zellklicks. Geprüft wird der produktive Tastaturpfad (`useGridKeyboardController` →
// `useGridRangeEditingController`), nicht nur die reinen Clipboard-Funktionen.
//
// Befund dieses Laufs (2026-10-18): 6/6 grün.
//   Fall 1: A1:B2 (Quelle/10/Formel =B1*2/30) → D1:E2: Werte korrekt, Original
//           unverändert. Formel relativ verschoben: `=B1*2` → `=E1*2` (pasteSpecialToRange,
//           `gridSelection.ts:269-274`). **Ist:** der gecachte Wert bleibt 20 (keine
//           Neuberechnung beim Paste; `value` wird unverändert mitkopiert).
//   Fall 2: Ctrl+X A1 → Ctrl+V C1: A1 weg, C1='Quelle'; Ziel-Alt C1-Alt wird überschrieben.
//           **Ein** Ctrl+Z stellt A1='Quelle' und C1='C1-Alt' wieder her (ein
//           Dokument-Commit im Paste-Pfad; kein separater Cut-Schritt).
//   Fall 3: Paste überschreibt C1; ein Ctrl+Z stellt C1-Alt wieder her; A1 unverändert.
//   Fall 4: Ctrl+Shift+V (Paste-Special „values", `gridNavigation.ts:87-90` →
//           `useGridKeyboardController.ts:78-89`) übernimmt C2.value=20 ohne `formula`;
//           die Quellformel A2 bleibt. Tastaturpfad existiert.
//   Fall 5: Ctrl+V ohne Copy: kein Throw, kein Dokument-Write, Alert
//           „Die Zwischenablage ist leer – zuerst Zellen kopieren oder ausschneiden."
//   Fall 6: **Bekannte Lücke:** Ctrl-Klick-Zusatzrange A1 + B2; Ctrl+C kopiert nur die
//           Primär-Range B2 (pasteSpecialToRange erhält nur diese), D1=30, E1 leer.
//           Ursache `useGridRangeEditingController.ts:52-54` (captureGridClipboard mit
//           `args.selectedRange`, nicht `selectionRanges`).
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridCell, TableObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';
import { parseA1 } from '../../formulas/formula';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-clipboard-interactive',
  title: 'Grid Clipboard Interactive',
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
    cells: {
      A1: { value: 'Quelle' },
      B1: { value: 10 },
      A2: { value: 20, formula: '=B1*2' },
      B2: { value: 30 },
      C1: { value: 'C1-Alt' },
      C2: { value: 'C2-Alt' },
    },
  }).updatedDocument;
}

interface MountedGrid {
  readonly container: HTMLElement;
  readonly error: unknown;
  readonly latestDocument: () => WorkspaceDocument;
}

let active: { root: Root; container: HTMLElement } | null = null;

function ControlledGrid({
  start,
  onUpdate,
}: {
  start: WorkspaceDocument;
  onUpdate: (document: WorkspaceDocument) => void;
}) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  return createElement(GridSheet, {
    document,
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
    workspaceDocuments: {},
  });
}

async function mount(): Promise<MountedGrid> {
  const initial = workbook();
  let latest = initial;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  active = { root, container };
  let error: unknown = null;
  try {
    await act(async () => {
      root.render(createElement(ControlledGrid, {
        start: initial,
        onUpdate: (next: WorkspaceDocument) => { latest = next; },
      }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (reason) {
    error = reason;
  }
  return { container, error, latestDocument: () => latest };
}

async function unmount(): Promise<void> {
  if (!active) return;
  const { root, container } = active;
  active = null;
  try {
    await act(async () => {
      root.unmount();
    });
  } finally {
    container.remove();
  }
}

afterEach(async () => {
  await unmount();
});

function gridRoot(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
  if (!element) throw new Error('Grid root missing');
  element.focus();
  return element;
}

function nameBox(container: HTMLElement): HTMLInputElement {
  const field = container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]');
  if (!field) throw new Error('Namensfeld fehlt');
  return field;
}

function documentCell(documentUnderTest: WorkspaceDocument, coord: string): GridCell | undefined {
  for (const object of Object.values(documentUnderTest.objects)) {
    if (object.type === 'Table') return (object.data as TableObject).cells[coord];
  }
  return undefined;
}

function cellElement(container: HTMLElement, coord: string): HTMLElement {
  const parsed = parseA1(coord);
  if (!parsed) throw new Error(`Ungültige Koordinate ${coord}`);
  const rows = container.querySelectorAll<HTMLTableRowElement>('tbody tr');
  const row = rows[parsed.row];
  if (!row) throw new Error(`Zeile ${coord} fehlt`);
  const dataCells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td')).filter(
    (cell) => cell.getAttribute('scope') !== 'row',
  );
  const cell = dataCells[parsed.col];
  if (!cell) throw new Error(`Zelle ${coord} fehlt`);
  return cell;
}

async function clickCell(
  container: HTMLElement,
  coord: string,
  modifiers: { shiftKey?: boolean; ctrlKey?: boolean } = {},
): Promise<void> {
  const cell = cellElement(container, coord);
  await act(async () => {
    for (const type of ['mousedown', 'mouseup', 'click'] as const) {
      cell.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...modifiers,
      }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function key(target: Element, name: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return event;
}

async function selectRange(container: HTMLElement, start: string, end: string): Promise<void> {
  await clickCell(container, start);
  const startCoord = parseA1(start)!;
  const endCoord = parseA1(end)!;
  const root = gridRoot(container);
  for (let col = startCoord.col; col < endCoord.col; col += 1) {
    await key(root, 'ArrowRight', { shiftKey: true });
  }
  for (let row = startCoord.row; row < endCoord.row; row += 1) {
    await key(root, 'ArrowDown', { shiftKey: true });
  }
}

describe('Interaktiver Clipboard-Flow (Ctrl+C/X/V) — Ist-Zustand', () => {
  it('Fall 1: Copy+Past A1:B2 → D1:E2; Original unverändert, Formelverschiebung dokumentiert', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    await selectRange(mounted.container, 'A1', 'B2');
    expect(nameBox(mounted.container).value).toBe('A1:B2');

    await key(gridRoot(mounted.container), 'c', { ctrlKey: true });
    await clickCell(mounted.container, 'D1');
    await key(gridRoot(mounted.container), 'v', { ctrlKey: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const documentAfter = mounted.latestDocument();
    expect(documentCell(documentAfter, 'D1')?.value).toBe('Quelle');
    expect(documentCell(documentAfter, 'E1')?.value).toBe(10);
    expect(documentCell(documentAfter, 'E2')?.value).toBe(30);
    expect(documentCell(documentAfter, 'D2')?.formula).toBe('=E1*2');
    // Ist-Zustand: der gecachte Wert wird beim Paste nicht neu berechnet (bleibt 20).
    expect(documentCell(documentAfter, 'D2')?.value).toBe(20);

    // Original bleibt unverändert.
    expect(documentCell(documentAfter, 'A1')).toEqual({ value: 'Quelle' });
    expect(documentCell(documentAfter, 'B1')?.value).toBe(10);
    expect(documentCell(documentAfter, 'A2')?.formula).toBe('=B1*2');
    expect(documentCell(documentAfter, 'B2')?.value).toBe(30);
  });

  it('Fall 2: Cut A1 → C1, A1 leer; ein Undo stellt den Cut wieder her', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    await clickCell(mounted.container, 'A1');
    await key(gridRoot(mounted.container), 'x', { ctrlKey: true });
    await clickCell(mounted.container, 'C1');
    await key(gridRoot(mounted.container), 'v', { ctrlKey: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const afterPaste = mounted.latestDocument();
    expect(documentCell(afterPaste, 'A1')).toBeUndefined();
    expect(documentCell(afterPaste, 'C1')?.value).toBe('Quelle');

    await key(gridRoot(mounted.container), 'z', { ctrlKey: true });
    const afterUndo = mounted.latestDocument();
    expect(documentCell(afterUndo, 'A1')?.value).toBe('Quelle');
    expect(documentCell(afterUndo, 'C1')?.value, 'das überschriebene Ziel wird mit-undoed').toBe('C1-Alt');
  });

  it('Fall 3: Paste überschreibt Ziel C1; ein Undo stellt den Zielwert wieder her', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    await clickCell(mounted.container, 'A1');
    await key(gridRoot(mounted.container), 'c', { ctrlKey: true });
    await clickCell(mounted.container, 'C1');
    await key(gridRoot(mounted.container), 'v', { ctrlKey: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(documentCell(mounted.latestDocument(), 'C1')?.value).toBe('Quelle');

    await key(gridRoot(mounted.container), 'z', { ctrlKey: true });
    const afterUndo = mounted.latestDocument();
    expect(documentCell(afterUndo, 'C1')?.value).toBe('C1-Alt');
    expect(documentCell(afterUndo, 'A1')?.value).toBe('Quelle');
  });

  it('Fall 4: Ctrl+Shift+V (Paste Special values) übernimmt nur den Wert, keine Formel', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    await clickCell(mounted.container, 'A2');
    await key(gridRoot(mounted.container), 'c', { ctrlKey: true });
    await clickCell(mounted.container, 'C2');
    await key(gridRoot(mounted.container), 'v', { ctrlKey: true, shiftKey: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const documentAfter = mounted.latestDocument();
    expect(documentCell(documentAfter, 'C2')?.value).toBe(20);
    expect(documentCell(documentAfter, 'C2')?.formula).toBeUndefined();
    expect(documentCell(documentAfter, 'A2')?.formula).toBe('=B1*2');
  });

  it('Fall 5: Ctrl+V mit leerer Zwischenablage — kein Throw, kein Dokument-Write, Alert', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    const before = structuredClone(mounted.latestDocument());
    await key(gridRoot(mounted.container), 'v', { ctrlKey: true });
    const after = mounted.latestDocument();
    const alert = mounted.container.querySelector('[role="alert"]');
    expect(after).toEqual(before);
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Zwischenablage');
  });

  it('Fall 6: Copy über mehrere Ranges (Ctrl-Klick) — Ist: nur die Primär-Range', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    await clickCell(mounted.container, 'A1');
    await clickCell(mounted.container, 'B2', { ctrlKey: true });
    await key(gridRoot(mounted.container), 'c', { ctrlKey: true });
    await clickCell(mounted.container, 'D1');
    await key(gridRoot(mounted.container), 'v', { ctrlKey: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const documentAfter = mounted.latestDocument();
    expect(documentCell(documentAfter, 'D1')?.value, 'nur die Primär-Range B2 wird kopiert').toBe(30);
    expect(documentCell(documentAfter, 'E1')).toBeUndefined();
    expect(documentCell(documentAfter, 'D1')?.value).not.toBe('Quelle');
  });
});
