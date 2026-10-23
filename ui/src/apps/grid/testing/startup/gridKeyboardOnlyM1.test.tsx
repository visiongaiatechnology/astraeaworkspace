// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/M1: Tastatur-only-Workflow des Grids.
//
// Present hat in derselben Dimension drei echte Bedienlücken gezeigt; für Grid war der
// reine Tastaturpfad nie geprüft. happy-dom besitzt **kein** Tab-Traversal: Fokus wird
// daher manuell auf `[data-vgt-grid-root="true"]` gesetzt und jede Taste als echtes
// `keydown`-Event auf die Grid-Wurzel dispatcht. Die Formelleisten-Erreichbarkeit wird
// deshalb nur über `tabIndex` geprüft (keine Traversal-Simulation).
//
// Diese Datei dokumentiert beobachtete Lücken als explizite Erwartung („rot-vor-Fix");
// Quellcode wird nicht geändert.
//
// Befund dieses Laufs (2026-10-18): 6/6 grün.
//   Fall 1: Direktentwurf N → Inline-Editor (Wert N) → Input „Name" → Enter committet
//           A1=Name und bewegt die Auswahl nach A2. Funktioniert.
//   Fall 2: F2 öffnet den Editor mit „Start"; Escape schließt, Dokument bleibt unverändert.
//           Funktioniert.
//   Fall 3: Tab/Shift+Tab horizontal, Enter nach unten, Home und Strg+End springen korrekt.
//           ⚠️ Ursprünglich gefundene Lücke (in Runde 12 behoben): Shift+Enter setzte die
//           aktive Zelle nach A1, erweiterte aber die Auswahl zu A1:A2, weil der Resolver
//           `shift` als `extend` an `moveTo` gab (`gridNavigation.ts:271`).
//           `extend` an `moveTo` übergibt (`gridNavigation.ts:271`). Erwartet wäre reine
//           Vertikalbewegung; Ist-Zustand ist gepinnt.
//   Fall 4: Entf leert A1, Strg+Z stellt „Start" wieder her, Strg+Y leert erneut.
//           Funktioniert (Dokument-Assertions).
//   Fall 5: Strg+S am Grid-Root → `defaultPrevented === false`; Save bleibt Shell-Sache.
//   Fall 6: Namensfeld und Formel-/Wertfeld haben `tabIndex=0` (happy-dom hat kein
//           Tab-Traversal; daher nur die programmatische Erreichbarkeit geprüft).
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridCell, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-keyboard-only-m1',
  title: 'Grid keyboard-only M1',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function workbook(cells: Record<string, GridCell>): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', { rows: 30, cols: 12, cells }).updatedDocument;
}

interface MountedGrid {
  readonly container: HTMLElement;
  readonly root: Root;
  readonly error: unknown;
  readonly latestDocument: () => WorkspaceDocument;
}

let active: MountedGrid | null = null;

function Harness({
  initialDocument,
  onDocumentUpdate,
}: {
  initialDocument: WorkspaceDocument;
  onDocumentUpdate: (document: WorkspaceDocument) => void;
}) {
  const [document, setDocument] = useState<WorkspaceDocument>(initialDocument);
  return createElement(GridSheet, {
    document,
    workspaceDocuments: {},
    onUpdateDocument: (next: WorkspaceDocument) => {
      onDocumentUpdate(next);
      setDocument(next);
    },
    onUpdateWorkspaceDocument: (next: WorkspaceDocument) => {
      onDocumentUpdate(next);
      setDocument(next);
    },
    onSelectSelectionType: () => undefined,
    onCreateChart: () => undefined,
    networkCapability: 'None',
    keyVaultUnlocked: false,
  });
}

async function mount(initialDocument: WorkspaceDocument): Promise<MountedGrid> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestDocument = initialDocument;
  let error: unknown = null;
  try {
    await act(async () => {
      root.render(
        createElement(Harness, {
          initialDocument,
          onDocumentUpdate: (next: WorkspaceDocument) => {
            latestDocument = next;
          },
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (reason) {
    error = reason;
  }
  active = { container, root, error, latestDocument: () => latestDocument };
  return active;
}

async function unmount(): Promise<void> {
  if (!active) return;
  const { root, container } = active;
  active = null;
  try {
    await act(async () => {
      root.unmount();
    });
  } catch {
    // Ein geworfener Mount hinterlässt eine unbrauchbare Wurzel; der Befund bleibt.
  } finally {
    container.remove();
  }
}

afterEach(async () => {
  await unmount();
});

function gridRoot(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
}

function nameBox(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]');
}

function activeCell(container: HTMLElement): Element | null {
  return container.querySelector('[data-vgt-grid-selection="active-cell"]');
}

function formulaInput(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('.vgt-grid-formula-input');
}

function inlineEditor(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('[role="grid"] input[type="text"]');
}

function activeSheetCells(documentUnderTest: WorkspaceDocument): Record<string, GridCell> {
  const gridData = documentUnderTest.gridData;
  const sheet = gridData?.sheets.find((candidate) => candidate.id === gridData.activeSheetId)
    ?? gridData?.sheets[0];
  if (!sheet) return {};
  const table = documentUnderTest.objects[sheet.tableObjectId]?.data as { cells?: Record<string, GridCell> } | undefined;
  return table?.cells ?? {};
}

async function focusGrid(container: HTMLElement): Promise<void> {
  const root = gridRoot(container);
  if (!root) throw new Error('Grid-Wurzel fehlt');
  await act(async () => {
    root.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pressKey(
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return event;
}

async function typeIntoEditor(editor: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(editor, value);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('GR-001/M1 — Grid Tastatur-only', () => {
  it('Fall 1: Direktentwurf mit N, weitere Zeichen, Enter committet und geht eine Zeile tiefer', async () => {
    const mounted = await mount(workbook({}));
    expect(mounted.error).toBeNull();
    await focusGrid(mounted.container);

    await pressKey(gridRoot(mounted.container)!, 'N');
    const editor = inlineEditor(mounted.container);
    expect(editor, 'Inline-Editor muss nach dem ersten Zeichen erscheinen').not.toBeNull();
    expect(editor?.value).toBe('N');

    await typeIntoEditor(editor!, 'Name');
    const enter = await pressKey(gridRoot(mounted.container)!, 'Enter');
    expect(enter.defaultPrevented).toBe(true);

    expect(activeSheetCells(mounted.latestDocument()).A1?.value).toBe('Name');
    expect(nameBox(mounted.container)?.value).toBe('A2');
  });

  it('Fall 2: F2 öffnet den Editor mit Zellwert; Escape schließt ohne Änderung', async () => {
    const mounted = await mount(workbook({ A1: { value: 'Start' } }));
    expect(mounted.error).toBeNull();
    await focusGrid(mounted.container);

    await pressKey(gridRoot(mounted.container)!, 'F2');
    const editor = inlineEditor(mounted.container);
    expect(editor, 'F2 muss den Inline-Editor öffnen').not.toBeNull();
    expect(editor?.value).toBe('Start');

    const escape = await pressKey(editor!, 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(inlineEditor(mounted.container), 'Escape muss den Editor schließen').toBeNull();
    expect(activeSheetCells(mounted.latestDocument()).A1?.value).toBe('Start');
    expect(nameBox(mounted.container)?.value).toBe('A1');
  });

  it('Fall 3: Tab/Shift+Tab horizontal, Enter/Shift+Enter vertikal, Home/Ctrl+End springen', async () => {
    const mounted = await mount(workbook({
      A1: { value: 'A1' },
      B2: { value: 'B2' },
      C3: { value: 'C3' },
    }));
    expect(mounted.error).toBeNull();
    await focusGrid(mounted.container);
    const root = gridRoot(mounted.container)!;

    await pressKey(root, 'Tab');
    expect(nameBox(mounted.container)?.value).toBe('B1');
    await pressKey(root, 'Tab', { shiftKey: true });
    expect(nameBox(mounted.container)?.value).toBe('A1');

    await pressKey(root, 'Enter');
    expect(nameBox(mounted.container)?.value).toBe('A2');
    await pressKey(root, 'Enter', { shiftKey: true });
    // Behoben in Runde 12: Shift+Enter bewegt nur nach oben (A2→A1) und darf die Auswahl NICHT
    // erweitern. Der Resolver gab `shift` früher als `extend` an `moveTo` weiter, was hier die
    // Range `A1:A2` erzeugte (Witness `gridKeyboardOnlyM1` hat es aufgedeckt).
    expect(nameBox(mounted.container)?.value).toBe('A1');
    expect(activeCell(mounted.container)?.textContent?.trim()).toBe('A1');

    await pressKey(root, 'End', { ctrlKey: true });
    expect(nameBox(mounted.container)?.value).toBe('C3');
    await pressKey(root, 'Home');
    expect(nameBox(mounted.container)?.value).toBe('A3');
  });

  it('Fall 4: Entf leert, Strg+Z stellt wieder her, Strg+Y leert erneut', async () => {
    const mounted = await mount(workbook({ A1: { value: 'Start' } }));
    expect(mounted.error).toBeNull();
    await focusGrid(mounted.container);
    const root = gridRoot(mounted.container)!;

    await pressKey(root, 'Delete');
    expect(activeSheetCells(mounted.latestDocument()).A1?.value ?? '').toBe('');

    await pressKey(root, 'z', { ctrlKey: true });
    expect(activeSheetCells(mounted.latestDocument()).A1?.value).toBe('Start');

    await pressKey(root, 'y', { ctrlKey: true });
    expect(activeSheetCells(mounted.latestDocument()).A1?.value ?? '').toBe('');
  });

  it('Fall 5: Strg+S wird nicht vom Grid-Root abgefangen', async () => {
    const mounted = await mount(workbook({ A1: { value: 'Start' } }));
    expect(mounted.error).toBeNull();
    await focusGrid(mounted.container);

    const save = await pressKey(gridRoot(mounted.container)!, 's', { ctrlKey: true });
    expect(save.defaultPrevented, 'Save gehört der Shell, nicht dem Grid').toBe(false);
  });

  it('Fall 6: Formelleiste ist per tabIndex erreichbar (keine Traversal-Simulation)', async () => {
    const mounted = await mount(workbook({ A1: { value: 'Start' } }));
    expect(mounted.error).toBeNull();

    const nameField = nameBox(mounted.container);
    const formulaField = formulaInput(mounted.container);
    expect(nameField).not.toBeNull();
    expect(formulaField).not.toBeNull();
    // happy-dom hat kein Tab-Traversal; geprüft wird nur die programmatische Erreichbarkeit.
    expect(nameField!.tabIndex, 'Namensfeld muss im Tab-Ring sein').toBe(0);
    expect(formulaField!.tabIndex, 'Formel-/Wertfeld muss im Tab-Ring sein').toBe(0);
  });
});
