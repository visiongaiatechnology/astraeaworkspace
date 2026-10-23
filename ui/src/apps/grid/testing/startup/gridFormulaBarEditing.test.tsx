// @vitest-environment happy-dom
// STATUS: PLATIN — GR-004/M1: Formelleisten-/Wertfeld-Semantik interaktiv.
//
// Mount wie `gridSheetEditStateWitness`: kontrolliertes GridSheet mit useState-Dokument,
// echte `input`/`keydown`-Events auf `.vgt-grid-formula-input` und dem Namensfeld.
//
// Befund dieses Laufs (2026-10-18): 6/6 Tests grün; Ist-Verhalten mit Lücken.
//   Fall 1: Formelfeld-Enter committet A1 korrekt (A1='Neu', A2 bleibt 'A2-Alt'), aber der
//           Enter-Event bubbelt zum Grid-Root und die Navigation bewegt die Auswahl nach A2;
//           Formelfeld/Name-Box zeigen danach A2. **Lücke:** `GridFormulaBar.tsx:357-359`
//           behandelt Enter ohne `stopPropagation`/`preventDefault`; der Root-Handler
//           `GridSheet.tsx:384` läuft zusätzlich (`gridNavigation.ts:261-275`, Enter nach
//           unten). Kein Doppel-Commit, aber Auswahl-/Fokus-Drift.
//   Fall 2: `=SUM(B1:B2)` wird als Formel gespeichert (`formula` gesetzt); der UI-Wert ist
//           im happy-dom **#CALC!**, weil der Formel-IPC-Daemon unter 127.0.0.1:5042 fehlt
//           (`formula.ts:175-199`, `authenticatedIpcFetch`). Der lokale Engine liefert 25;
//           die Formel wird nach dem Enter-Bug durch erneutes Klicken auf A1 angezeigt.
//   Fall 3: **Lücke:** direkter Formelfeld-Edit (ohne F2) + Escape verwirft den Draft nicht;
//           das Feld behält „VERWORFEN", das Dokument bleibt unverändert, `preventDefault`
//           bleibt false. Es gibt keinen Escape-Zweig im Formelfeld
//           (`GridFormulaBar.tsx:357-372`); der Root behandelt Escape nur im Editierzustand
//           (`gridNavigation.ts:202-213`). Mit F2 (gemeinsamer Editierzustand) funktioniert
//           Escape: Feld wird auf den Zellwert zurückgesetzt, nichts committet.
//   Fall 4: `=1/0` wird als Formel gespeichert, UI-Wert **#CALC!** (IPC fehlt); `=FOO(`
//           wird gespeichert, UI-Wert **#VALUE!** (lokaler Fallback). Kein Throw, Zelle
//           bleibt konsistent; die Fehlerwerte sind im Test-Ist dokumentiert.
//   Fall 5: **Lücke:** Enter im Namensfeld bubbelt ebenfalls zum Root; nach „B2" steht die
//           Auswahl auf **A2**, nach „A1:B3" auf **A3**, nach dem ungültigen „XYZ" auf
//           **A4** (Alert: Spalte außerhalb des Rasters, kein Throw). Ursache:
//           `GridFormulaBar.tsx:308-317` ruft `onGoToSelection` ohne `stopPropagation`;
//           der Root-Enter (`gridNavigation.ts:261-275`) überschreibt den Sprung mit der
//           veralteten Auswahl +1 Zeile.
//   Fall 6: Strg+Z außerhalb des Formelfelds nimmt den Formelleisten-Commit in **einem**
//           Schritt zurück; A1 und das Feld zeigen wieder den alten Wert.
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridCell, TableObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-formula-bar-editing',
  title: 'Grid Formula Bar Editing',
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
      A1: { value: 'A1-Alt' },
      A2: { value: 'A2-Alt' },
      B1: { value: 10 },
      B2: { value: 15 },
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

function formulaField(container: HTMLElement): HTMLInputElement {
  const field = container.querySelector<HTMLInputElement>('.vgt-grid-formula-input');
  if (!field) throw new Error('Formel-/Wertfeld fehlt');
  return field;
}

function nameBox(container: HTMLElement): HTMLInputElement {
  const field = container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]');
  if (!field) throw new Error('Namensfeld fehlt');
  return field;
}

function activeCell(container: HTMLElement): Element | null {
  return container.querySelector('[data-vgt-grid-selection="active-cell"]');
}

function documentCell(documentUnderTest: WorkspaceDocument, coord: string): GridCell | undefined {
  for (const object of Object.values(documentUnderTest.objects)) {
    if (object.type === 'Table') return (object.data as TableObject).cells[coord];
  }
  return undefined;
}

async function typeInto(target: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
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

async function clickGuideCell(container: HTMLElement, anchor: 'Grid:first' | 'Grid:second'): Promise<void> {
  const cell = container.querySelector<HTMLElement>(`[data-vgt-app-guide-anchor="${anchor}"]`);
  if (!cell) throw new Error(`Guide-Zelle ${anchor} fehlt`);
  await act(async () => {
    for (const type of ['mousedown', 'mouseup', 'click'] as const) {
      cell.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Formelleisten-/Wertfeld-Semantik interaktiv', () => {
  it('Fall 1: Direkteingabe im Formelfeld committet A1; Enter bewegt wie in Excel eine Zeile weiter', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    const formula = formulaField(mounted.container);
    expect(formula.value).toBe('A1-Alt');
    expect(nameBox(mounted.container).value).toBe('A1');

    await typeInto(formula, 'Neu');
    const enter = await key(formula, 'Enter');

    expect(documentCell(mounted.latestDocument(), 'A1')?.value).toBe('Neu');
    expect(documentCell(mounted.latestDocument(), 'A2')?.value).toBe('A2-Alt');
    // Excel-konform: Enter committet A1 und setzt die Auswahl eine Zeile tiefer fort.
    // (Vor Runde 20 wurde das als Enter-Bubble gepinnt; der Commit war immer korrekt.)
    expect(enter.defaultPrevented).toBe(true);
    expect(nameBox(mounted.container).value).toBe('A2');
    expect(formulaField(mounted.container).value).toBe('A2-Alt');
  });

  it('Fall 2: Formel =SUM(B1:B2) wird gespeichert und beim Wiedersehen als Formel gezeigt', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    const formula = formulaField(mounted.container);

    await typeInto(formula, '=SUM(B1:B2)');
    await key(formula, 'Enter');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const a1 = documentCell(mounted.latestDocument(), 'A1');
    expect(a1?.formula).toBe('=SUM(B1:B2)');
    // Der UI-Formelpfad läuft über den IPC-Transport; in happy-dom ist kein Formel-Daemon
    // erreichbar, deshalb ist der Ist-Wert #CALC!. Der lokale Engine beweist die Semantik.
    expect(a1?.value).toBe('#CALC!');
    expect(evaluateGridFormulaLocal('=SUM(B1:B2)', {
      B1: { value: 10 },
      B2: { value: 15 },
    })).toBe(25);

    // Nach dem Enter-Bug steht die Auswahl auf A2; A1 erneut anklicken und Formel prüfen.
    await clickGuideCell(mounted.container, 'Grid:first');
    expect(nameBox(mounted.container).value).toBe('A1');
    expect(formulaField(mounted.container).value).toBe('=SUM(B1:B2)');
  });

  it('Fall 3 (gehärtet): Escape verwirft den direkten Formelfeld-Draft, F2-Edit bricht ebenfalls ab', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    const formula = formulaField(mounted.container);

    await typeInto(formula, 'VERWORFEN');
    const directEscape = await key(formula, 'Escape');
    // Runde 20: das Formelfeld hat jetzt einen eigenen Escape-Zweig (Draft verwerfen, Zellwert
    // wiederherstellen); vorher blieb der verworfene Text stehen und der Key blutete zum Root.
    expect(directEscape.defaultPrevented).toBe(true);
    expect(documentCell(mounted.latestDocument(), 'A1')?.value).toBe('A1-Alt');
    expect(formulaField(mounted.container).value, 'Escape stellt den Zellwert im Formelfeld wieder her').toBe('A1-Alt');

    // F2 setzt den gemeinsamen Editierzustand; Escape bricht ihn ab.
    await clickGuideCell(mounted.container, 'Grid:first');
    await key(gridRoot(mounted.container), 'F2');
    await typeInto(formulaField(mounted.container), 'F2-VERWORFEN');
    const f2Escape = await key(formulaField(mounted.container), 'Escape');
    expect(f2Escape.defaultPrevented).toBe(true);
    expect(formulaField(mounted.container).value).toBe('A1-Alt');
    expect(documentCell(mounted.latestDocument(), 'A1')?.value).toBe('A1-Alt');
  });

  it('Fall 4: ungültige Formeln werfen nicht und hinterlassen konsistente Zelle + Formel', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();

    await typeInto(formulaField(mounted.container), '=1/0');
    await key(formulaField(mounted.container), 'Enter');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await clickGuideCell(mounted.container, 'Grid:first');
    const div = documentCell(mounted.latestDocument(), 'A1');

    await typeInto(formulaField(mounted.container), '=FOO(');
    await key(formulaField(mounted.container), 'Enter');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await clickGuideCell(mounted.container, 'Grid:first');
    const bad = documentCell(mounted.latestDocument(), 'A1');

    expect(div?.formula).toBe('=1/0');
    expect(div?.value).toBe('#CALC!');
    expect(bad?.formula).toBe('=FOO(');
    expect(bad?.value).toBe('#VALUE!');
  });

  it('Fall 5 (gehärtet): Namensfeld springt exakt auf B2 bzw. A1:B3, ungültiges XYZ bleibt definiert', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();

    await typeInto(nameBox(mounted.container), 'B2');
    await key(nameBox(mounted.container), 'Enter');
    // Runde 20: der Enter-Key wird im Namensfeld gestoppt (kein Bubble zum Grid-Root), der
    // Sprung bleibt exakt; vorher überschrieb der Root-Handler ihn mit „eine Zeile weiter".
    expect(activeCell(mounted.container)?.textContent).toBe(String(documentCell(mounted.latestDocument(), 'B2')?.value));
    expect(nameBox(mounted.container).value).toBe('B2');

    await typeInto(nameBox(mounted.container), 'A1:B3');
    await key(nameBox(mounted.container), 'Enter');
    expect(nameBox(mounted.container).value).toBe('A1:B3');

    await typeInto(nameBox(mounted.container), 'XYZ');
    await key(nameBox(mounted.container), 'Enter');
    // Die ungültige Eingabe ändert die Auswahl nicht und meldet den Fehler.
    expect(nameBox(mounted.container).value).toBe('A1:B3');
    expect(mounted.container.querySelector('[role="alert"]')?.textContent).toContain('XYZ');
  });

  it('Fall 6: Strg+Z außerhalb des Formelfelds nimmt den Formelleisten-Commit zurück', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    await typeInto(formulaField(mounted.container), 'Undo-Neu');
    await key(formulaField(mounted.container), 'Enter');
    expect(documentCell(mounted.latestDocument(), 'A1')?.value).toBe('Undo-Neu');

    await clickGuideCell(mounted.container, 'Grid:first');
    await key(gridRoot(mounted.container), 'z', { ctrlKey: true });
    expect(documentCell(mounted.latestDocument(), 'A1')?.value).toBe('A1-Alt');
    expect(formulaField(mounted.container).value).toBe('A1-Alt');
  });
});
