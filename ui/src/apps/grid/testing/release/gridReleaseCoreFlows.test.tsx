// @vitest-environment happy-dom
// STATUS: PLATIN — Release 0.1: die primären Grid-Kernpfade im echten DOM.
//
// Bündelt die Nutzerpfade, die im Release nicht brechen dürfen: Direkttippen/Enter,
// Ctrl+A, Name-Box-Sprung, IME-Schutz der Formelleiste, Sheet-Wechsel mit erhaltenen
// Werten sowie ein 30×20-Start- und 500×30-Navigationsbudget. Zeitbudgets gelten nur für
// happy-dom (kein nativer Frame-Messwert).
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../app/bootstrap/seedDocDefaultsOpenCore';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

function Harness({ start }: { start: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(start);
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
}

async function mount(start: WorkspaceDocument): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Harness, { start }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

async function key(target: Element, name: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function typeInto(target: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function gridRoot(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
  if (!element) throw new Error('Grid root missing');
  element.focus();
  return element;
}

function nameBox(host: HTMLElement): HTMLInputElement {
  const element = host.querySelector<HTMLInputElement>('[data-grid-name-box="true"]');
  if (!element) throw new Error('Name box missing');
  return element;
}

function formulaField(host: HTMLElement): HTMLInputElement {
  const element = host.querySelector<HTMLInputElement>('.vgt-grid-formula-input');
  if (!element) throw new Error('Formula field missing');
  return element;
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('Release 0.1 — Grid Core-Flows', () => {
  it('startet 30×20, committet Direkttippen und Ctrl+A markiert den ganzen Bereich', async () => {
    const started = Date.now();
    const host = await mount(createNewDocument('Grid' as never) as WorkspaceDocument);
    const mountMs = Date.now() - started;
    const grid = gridRoot(host);
    expect(Number(host.querySelector('[role="grid"]')?.getAttribute('aria-rowcount'))).toBe(30);
    expect(Number(host.querySelector('[role="grid"]')?.getAttribute('aria-colcount'))).toBe(20);
    expect(nameBox(host).value).toBe('A1');

    await key(grid, 'N');
    const editor = host.querySelector<HTMLInputElement>('[role="grid"] input[type="text"]');
    expect(editor).not.toBeNull();
    await typeInto(editor!, 'Name');
    await key(grid, 'Enter');
    expect(nameBox(host).value).toBe('A2');
    // Ctrl+A selects the table area, not the browser page.
    await key(grid, 'a', { ctrlKey: true });
    expect(nameBox(host).value).toBe('A1:T30');
    expect(host.querySelector('[data-grid-selection-summary="true"]')?.textContent).toContain('30 rows');
    expect(host.querySelector('[data-grid-selection-summary="true"]')?.textContent).toContain('20 columns');
    // Smoke budget only — happy-dom, not a native frame measurement.
    expect(mountMs).toBeLessThan(5_000);
  });

  it('schützt die Formelleiste vor IME-Enter und springt per Name-Box exakt', async () => {
    const host = await mount(createNewDocument('Grid' as never) as WorkspaceDocument);

    await typeInto(nameBox(host), 'B2');
    await key(nameBox(host), 'Enter');
    expect(nameBox(host).value).toBe('B2');

    await typeInto(formulaField(host), 'Zwischenstand');
    await key(formulaField(host), 'Enter', { isComposing: true });
    // IME composition must not commit or move the selection.
    expect(nameBox(host).value).toBe('B2');
    expect(formulaField(host).value).toBe('Zwischenstand');
    await key(formulaField(host), 'Escape');
    expect(formulaField(host).value).toBe('');
    expect(nameBox(host).value).toBe('B2');

    // A normal Enter still commits through the formula bar and moves down (Excel behaviour).
    await typeInto(formulaField(host), 'Normal');
    await key(formulaField(host), 'Enter');
    expect(nameBox(host).value).toBe('B3');
    expect(formulaField(host).value).toBe('');
  });

  it('wechselt Sheets ohne Datenverlust und behält die aktive Auswahl bedienbar', async () => {
    const host = await mount(createNewDocument('Grid' as never) as WorkspaceDocument);
    const grid = gridRoot(host);
    await key(grid, 'N');
    const editor = host.querySelector<HTMLInputElement>('[role="grid"] input[type="text"]');
    await typeInto(editor!, 'Sheet1-Wert');
    await key(grid, 'Enter');

    const tabs = Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'))
      .filter((tab) => !tab.hasAttribute('data-grid-hidden-sheet'));
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    const sheet2 = tabs.find((tab) => tab.textContent?.trim() === 'Sheet 2');
    expect(sheet2, 'Sheet 2 tab must be reachable').not.toBeUndefined();
    await click(sheet2!);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('Sheet 2');
    const sheet1 = tabs.find((tab) => tab.textContent?.trim() === 'Sheet 1');
    await click(sheet1!);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('Sheet 1');
    await typeInto(nameBox(host), 'A1');
    await key(nameBox(host), 'Enter');
    expect(formulaField(host).value).toBe('Sheet1-Wert');
  });

  it('bleibt bei 500×30 im Virtual-Zweig ohne Freeze in endlicher DOM-Zeit', async () => {
    const big = addSheetToDocument(
      { ...(createNewDocument('Grid' as never) as WorkspaceDocument), gridData: undefined, objects: {}, root_object_ids: [] },
      [],
      'Gross',
      { rows: 500, cols: 30, cells: { A1: { value: 'Start' } } },
    ).updatedDocument;
    const started = Date.now();
    const host = await mount(big);
    const mountMs = Date.now() - started;
    const grid = gridRoot(host);
    expect(host.querySelector('[role="grid"][data-render-backend]'), '500 Zeilen → Virtual-Zweig').not.toBeNull();
    const navigationStarted = Date.now();
    for (let index = 0; index < 6; index += 1) {
      await key(grid, 'ArrowDown');
      await key(grid, 'ArrowRight');
    }
    const navigationMs = Date.now() - navigationStarted;
    expect(nameBox(host).value).toBe('G7');
    expect(mountMs).toBeLessThan(5_000);
    expect(navigationMs).toBeLessThan(2_000);
  });
});
