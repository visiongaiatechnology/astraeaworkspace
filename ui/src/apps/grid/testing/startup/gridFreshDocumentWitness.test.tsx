// @vitest-environment happy-dom
// STATUS: PLATIN — GR-002 (Neu-Dokument-Pfad): the first worksheet really starts at A1
//
// GR-002 asks for "Leere Mappe mit echter A1-Zelle statt Kulissen-Raster". The other Grid
// witnesses build their document with `addSheetToDocument`; this one starts where the user
// starts: `createNewDocument('Grid')` — the production factory behind "Neues Dokument → Grid".
// It must produce a workbook whose A1 is the selected cell and accepts the very first value.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../app/bootstrap/seedDocDefaultsOpenCore';
import { GridSheet } from '../../GridSheet';

vi.setConfig({ testTimeout: 60_000 });

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

function ControlledGrid({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
  return createElement(GridSheet, {
    document,
    onUpdateDocument: (next: WorkspaceDocument) => setDocument(next),
    onUpdateWorkspaceDocument: (next: WorkspaceDocument) => setDocument(next),
    onSelectSelectionType: vi.fn(),
    onCreateChart: vi.fn(),
    networkCapability: 'offline' as never,
    keyVaultUnlocked: false,
    workspaceDocuments: {},
  } as never);
}

async function mountFresh(): Promise<{ host: HTMLElement; workbook: WorkspaceDocument }> {
  // `workbook`, not `document`: a local `document` shadows the DOM global used below.
  const workbook = createNewDocument('Grid' as never) as WorkspaceDocument;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledGrid, { start: workbook }));
  });
  return { host: container, workbook };
}

function gridRoot(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
  if (!element) throw new Error('Grid root missing');
  element.focus();
  return element;
}

function formulaField(host: HTMLElement): HTMLInputElement {
  const field = host.querySelector<HTMLInputElement>('.vgt-grid-formula-input');
  if (!field) throw new Error('formula bar input missing');
  return field;
}

function editor(host: HTMLElement): HTMLInputElement | null {
  return host.querySelector<HTMLInputElement>('[role="grid"] input[type="text"]');
}

async function key(target: HTMLElement, name: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  });
}

async function typeInto(target: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  });
}

describe('GR-002 — a brand-new workbook starts operable at A1', () => {
  it('creates a workbook with two sheets and renders the sheet at A1', async () => {
    const { host, workbook } = await mountFresh();
    expect(workbook.kind).toBe('Grid');
    expect(workbook.gridData?.sheets.map((sheet) => sheet.name), 'die Fabrik legt zwei Blätter an').toEqual(['Sheet 1', 'Sheet 2']);
    expect(workbook.gridData?.activeSheetId, 'das erste Blatt ist aktiv').toBe(workbook.gridData?.sheets[0]!.id);

    expect(host.querySelector('[role="grid"]'), 'ein echtes Raster, kein Kulissen-Platzhalter').not.toBeNull();
    expect(host.querySelector('[data-vgt-grid-selection="active-cell"]'), 'A1 ist ausgewählt').not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('[data-grid-name-box="true"]')?.value, 'die Name-Box zeigt A1').toBe('A1');
    expect(formulaField(host).value, 'die Formelzeile ist bei einer leeren A1 leer').toBe('');
    expect(host.textContent, 'beide Blätter sind erreichbar').toContain('Sheet 2');
  });

  it('zeigt im neuen Grid 20 Spalten bis T (beide Tabellen)', async () => {
    const { host, workbook } = await mountFresh();
    const tables = workbook.root_object_ids
      .map((id) => workbook.objects[id])
      .filter((object): object is { type: 'Table'; data: TableObject } => object?.type === 'Table');
    expect(tables, 'die Fabrik legt zwei Table-Objekte an').toHaveLength(2);
    for (const table of tables) {
      expect(table.data.rows).toBe(30);
      expect(table.data.cols, 'neues Grid reicht bis Spalte T').toBe(20);
    }
    const grid = host.querySelector('[role="grid"]');
    expect(Number(grid?.getAttribute('aria-colcount'))).toBe(20);
    expect(host.querySelector('th[aria-colindex="20"]')?.textContent?.trim()).toBe('T');
  });

  it('accepts the first value typed into A1 and continues in A2 (user path J1)', async () => {
    const { host } = await mountFresh();
    const grid = gridRoot(host);

    // Direct typing: the first character opens the draft.
    await key(grid, 'N');
    const draft = editor(host);
    expect(draft, 'Direkttippen öffnet den Entwurf in A1').not.toBeNull();
    await typeInto(draft!, 'Name');

    await key(grid, 'Enter');

    // Enter commits and moves one row down; the new active cell is A2.
    expect(host.querySelector('[role="grid"] input[type="text"]'), 'der Editor ist geschlossen').toBeNull();
    expect(formulaField(host).value, 'die aktive Zelle ist A2 und leer').toBe('');
    await key(grid, 'Enter', { shiftKey: true });
    expect(formulaField(host).value, 'zurück in A1 steht der committete Wert').toBe('Name');
    expect(host.querySelector('[data-vgt-grid-selection="active-cell"]'), 'A1 bleibt eine echte Zelle').not.toBeNull();
  });
});
