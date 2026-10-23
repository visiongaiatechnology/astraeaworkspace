// @vitest-environment happy-dom
// STATUS: PLATIN — GR-004: F2, double click and the formula bar are ONE edit state
//
// The M1 contract for GR-004 is one draft, one commit, one cancel:
//   * the inline editor (F2 / double click) and the formula bar edit the **same** draft;
//   * Escape restores the cell value in both paths and leaves the edit;
//   * Enter commits the draft and closes the editor in both paths.
//
// Red-before (measured with this file): the formula bar wrote into `formulaInput` but had no
// Escape handler and never left the edit state, so a cancelled formula-bar edit stayed as a
// live draft and the inline editor kept showing it — two states claiming to be one.
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const BASE: WorkspaceDocument = {
  id: 'grid-edit-state',
  title: 'Grid edit state',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

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

/**
 * Controlled mount: the Grid is a projection of the document, so a commit can only become
 * visible when the harness feeds the updated document back — exactly like the real frame does.
 */
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

async function mount(): Promise<HTMLElement> {
  const workbook = addSheetToDocument(BASE, [], 'Sheet 1', { cells: { A1: { value: 'A1-Inhalt' } } }).updatedDocument;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledGrid, { start: workbook }));
  });
  return container;
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

function inlineEditor(host: HTMLElement): HTMLInputElement | null {
  return host.querySelector<HTMLInputElement>('td input[type="text"]');
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

describe('GR-004 — one edit state for F2, double click and the formula bar', () => {
  it('F2 and the formula bar show the same draft', async () => {
    const host = await mount();
    await key(gridRoot(host), 'F2');
    expect(inlineEditor(host), 'F2 öffnet den Zelleneditor').not.toBeNull();
    expect(formulaField(host).value, 'die Formelleiste zeigt den Zellwert').toBe('A1-Inhalt');

    await typeInto(inlineEditor(host)!, 'A1-Inhalt A');
    expect(formulaField(host).value, 'Tippen im Editor spiegelt sich in die Formelleiste').toBe('A1-Inhalt A');
  });

  it('typing in the formula bar updates the inline draft', async () => {
    const host = await mount();
    await key(gridRoot(host), 'F2');
    await typeInto(formulaField(host), '=SUM(1;2)');
    expect(inlineEditor(host)!.value, 'die Formelleiste tippt in denselben Entwurf').toBe('=SUM(1;2)');
  });

  it('Escape in the formula bar cancels the draft and leaves the edit state', async () => {
    const host = await mount();
    await key(gridRoot(host), 'F2');
    await typeInto(formulaField(host), 'verworfen');
    expect(formulaField(host).value).toBe('verworfen');

    await key(formulaField(host), 'Escape');

    expect(formulaField(host).value, 'Escape stellt den Zellwert wieder her').toBe('A1-Inhalt');
    expect(inlineEditor(host), 'Escape schließt den Editor').toBeNull();
  });

  it('Enter in the formula bar commits once, closes the editor and moves down', async () => {
    const host = await mount();
    await key(gridRoot(host), 'F2');
    await typeInto(formulaField(host), 'Neu');

    await key(formulaField(host), 'Enter');

    expect(inlineEditor(host), 'Enter beendet die Bearbeitung').toBeNull();
    // Excel direction: the committed edit moves one row down, so the bar shows the new cell.
    expect(formulaField(host).value, 'der Folgeabsatz ist die neue aktive Zelle').toBe('');
    // Going back proves the value was committed, not dropped.
    await key(gridRoot(host), 'Enter', { shiftKey: true });
    expect(formulaField(host).value, 'der committete Wert steht in A1').toBe('Neu');
  });

  it('double click opens the same editor with the cell value', async () => {
    const host = await mount();
    const firstCell = host.querySelector<HTMLElement>('[data-vgt-app-guide-anchor="Grid:first"]');
    expect(firstCell, 'A1 muss adressierbar sein').not.toBeNull();
    await act(async () => {
      firstCell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });
    expect(inlineEditor(host)?.value, 'Doppelklick öffnet denselben Entwurf').toBe('A1-Inhalt');
    expect(formulaField(host).value).toBe('A1-Inhalt');
  });

  it('Escape in the cell editor keeps the formula bar in sync', async () => {
    const host = await mount();
    await key(gridRoot(host), 'F2');
    await typeInto(inlineEditor(host)!, 'Zwischenstand');
    expect(formulaField(host).value).toBe('Zwischenstand');

    await key(gridRoot(host), 'Escape');

    expect(inlineEditor(host)).toBeNull();
    expect(formulaField(host).value, 'auch der Zellen-Abbruch stellt die Formelleiste zurück').toBe('A1-Inhalt');
  });
});
