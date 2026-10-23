// @vitest-environment happy-dom
// STATUS: PLATIN — „Mehr sichtbar, was man gerade bearbeitet" (Runde 41).
//
// Prüft den sichtbaren Bearbeitungs-Kontext: Name-Box-Range, aktive Zelle/Range mit
// Rahmen, Kopfzeilen-Highlight, sichtbare Auswahl-Summary (Zeilen/Spalten/Summe/Mittelwert/
// Format) als aria-live-Status und ein klares Formelleisten-Ziel. Keine Attrappen: alle
// Werte kommen aus dem echten Zellbestand und `selectedRange`.
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';
import { buildGridSelectionSummary } from '../../toolbar/gridSelectionSummary';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-selection-visibility',
  title: 'Grid Selection Visibility',
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
    rows: 30,
    cols: 20,
    cells: { A1: { value: 10 }, B1: { value: 20 }, A2: { value: 30 }, B2: { value: 40 } },
  }).updatedDocument;
}

let root: Root | null = null;
let container: HTMLElement | null = null;

function ControlledGrid({ start }: { start: WorkspaceDocument }) {
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
  });
}

async function mountGrid(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ControlledGrid, { start: workbook() }));
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

async function click(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function selectA1B2(host: HTMLElement): Promise<void> {
  const grid = host.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
  expect(grid).not.toBeNull();
  grid!.focus();
  await key(grid!, 'ArrowRight', { shiftKey: true });
  await key(grid!, 'ArrowDown', { shiftKey: true });
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('Grid-Auswahl sichtbar und verständlich', () => {
  it('Summary-Helper berechnet Zeilen, Spalten, Summe, Mittelwert und Format', () => {
    const cells = { A1: { value: 10 }, B1: { value: 20 }, A2: { value: 30 }, B2: { value: 40 } };
    const general = buildGridSelectionSummary('A1:B2', cells, cells.A1);
    expect(general).toMatchObject({ range: 'A1:B2', rows: 2, columns: 2, cellCount: 4, numericCount: 4, sum: 100, average: 25 });
    expect(general.formatId).toBe('general');

    const currency = buildGridSelectionSummary('A1:B2', cells, { value: 10, format: 'currency', numberFormatCode: '$#,##0.00' });
    expect(currency.formatId).toBe('currency');
    expect(currency.formatLabel).toBe('Currency');
  });

  it('zeigt Name-Box-Range, Zell-/Header-Highlight und Formelleisten-Ziel', async () => {
    const host = await mountGrid();
    const nameBox = host.querySelector<HTMLInputElement>('[data-grid-name-box="true"]');
    expect(nameBox?.value).toBe('A1');

    const active = host.querySelector('[data-vgt-grid-selection="active-cell"]');
    expect(active?.className).toContain('outline-blue-400');
    // A1 is the active cell in the first row and first column.
    expect(host.querySelector('thead th[aria-colindex="1"]')?.getAttribute('data-vgt-grid-selected-header')).toBe('column');
    expect(host.querySelector('tbody tr td[scope="row"]')?.getAttribute('data-vgt-grid-selected-header')).toBe('row');

    const formulaTarget = host.querySelector('[data-grid-formula-target="true"]');
    expect(formulaTarget?.textContent?.trim()).toBe('A1');
    expect(host.querySelector<HTMLInputElement>('.vgt-grid-formula-input')?.getAttribute('aria-label')).toContain('A1');
  });

  it('aktualisiert die sichtbare Auswahl-Summary bei Shift+Pfeilen und bietet sie als Live-Region', async () => {
    const host = await mountGrid();
    await selectA1B2(host);

    const nameBox = host.querySelector<HTMLInputElement>('[data-grid-name-box="true"]');
    expect(nameBox?.value).toBe('A1:B2');
    const summary = host.querySelector('[data-grid-selection-summary="true"]');
    expect(summary).not.toBeNull();
    expect(summary!.getAttribute('role')).toBe('status');
    expect(summary!.getAttribute('aria-live')).toBe('polite');
    expect(summary!.textContent).toContain('A1:B2');
    expect(summary!.textContent).toContain('2 rows');
    expect(summary!.textContent).toContain('2 columns');
    expect(summary!.querySelector('[data-grid-selection-summary-sum]')?.textContent).toContain('100');
    expect(summary!.textContent).toContain('Average');
    expect(summary!.textContent).toContain('25');
    expect(summary!.textContent).toContain('Format General');

    expect(host.querySelector('thead th[aria-colindex="1"]')?.getAttribute('data-vgt-grid-selected-header')).toBe('column');
    expect(host.querySelector('thead th[aria-colindex="2"]')?.getAttribute('data-vgt-grid-selected-header')).toBe('column');
    const rowHeaders = host.querySelectorAll('tbody tr td[scope="row"]');
    expect(rowHeaders[0]?.getAttribute('data-vgt-grid-selected-header')).toBe('row');
    expect(rowHeaders[1]?.getAttribute('data-vgt-grid-selected-header')).toBe('row');
    // Nicht ausgewählte Header bleiben neutral.
    expect(host.querySelector('thead th[aria-colindex="3"]')?.getAttribute('data-vgt-grid-selected-header')).toBeNull();

    const rangeCells = host.querySelectorAll('[data-vgt-grid-selection="range"]');
    expect(rangeCells.length).toBeGreaterThan(0);
    expect(rangeCells[0]?.className).toContain('outline-blue-400');
  });

  it('macht das Zahlenformat der aktiven Zelle in der Statuszeile sichtbar', async () => {
    const host = await mountGrid();
    const currency = host.querySelector<HTMLButtonElement>('[data-grid-format-action="currency"]');
    expect(currency).not.toBeNull();
    expect(currency!.getAttribute('title')).toContain('$#,##0.00');
    await click(currency!);
    const summary = host.querySelector('[data-grid-selection-summary="true"]');
    expect(summary?.querySelector('[data-grid-selection-summary-format]')?.textContent).toMatch(/Currency/i);
    expect(summary?.textContent).toContain('A1');
    expect(summary?.textContent).toContain('Format');
  });
});
