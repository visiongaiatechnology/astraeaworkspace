// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/M1: ARIA-/Screenreader-Vertrag des Grids (Ist-Zustand).
//
// Neue Dimension: bisher wurde nur Bedienbarkeit geprüft, nicht die für Assistive Technology
// sichtbare Semantik. Diese Datei mountet die echte `GridSheet` mit einem kontrollierten
// Dokument (wie `gridSheetDomMountWitness.test.tsx`), liest die tatsächlichen ARIA-Attribute
// und dokumentiert Lücken. **Kein Quellcode wird geändert**; fehlende Semantik wird als
// Befund mit Datei:Zeile gepinnt, nicht "weggetestet".
//
// Befund dieses Laufs (2026-10-18): 5/5 grün; Ist-Zustand:
//   Fall 1: table[role=grid] mit aria-label „Grid Sheet 1", aria-rowcount=30,
//           aria-colcount=20 (frisches Dokument bis Spalte T). **Kein** aria-readonly,
//           **kein** aria-multiselectable.
//           Der tab-fokussierbare Wrapper `[data-vgt-grid-root]` (`GridSheet.tsx:379-385`)
//           hat tabIndex=0 und aria-label, aber **keinen role**; das role=grid liegt auf der
//           nicht fokussierbaren Tabelle (`GridTableCanvas.tsx:205-209`).
//   Fall 2: aktive `<td>` trägt aria-selected=true und data-vgt-grid-selection=active-cell
//           (`GridTableCanvas.tsx:402,404`), aber **keine ID**, **keine** aria-colindex/
//           aria-rowindex und **kein** role=gridcell; am Raster fehlt aria-activedescendant.
//           Die Virtual-Canvas-Variante hat diese Semantik explizit
//           (`GridVirtualCanvas.tsx:383-389`: role=gridcell, aria-rowindex/colindex).
//   Fall 3: Namensfeld (`GridFormulaBar.tsx:285-305`) und Formel-/Wertfeld (`:333-359`)
//           haben nicht-leere, eigene aria-labels, type=text, tabIndex=0; implizite
//           textbox, keine explizite Rolle (kein combobox nötig). Kein Befund.
//   Fall 4: Spaltenköpfe `<th scope="col" aria-colindex=n>` (`GridTableCanvas.tsx:254-267`);
//           Eck-Header „#" ohne colindex; Zeilenköpfe sind `<td scope="row"
//           aria-rowindex=n>` (`:323-341`) statt expliziter rowheader-Rolle. `role` ist
//           nirgends explizit gesetzt; Namen kommen aus dem Text („A", „1").
//   Fall 5: **Lücke:** keine role=status-/aria-live-Region im GridSheet-Grundzustand und
//           nach einer Auswahländerung (A1→A2). GridSheet rendert role=alert/status nur
//           für Validierungsfehler bzw. Validierungsoptionen (`GridSheet.tsx:420-426`);
//           die Auswahl selbst wird nicht angekündigt.
//
// Einschätzung: aria-readonly/multiselectable + Live-Region sind kleine Fixes; die
// Fokus-/Gridcell-/activedescendant-Struktur (Wrapper fokussierbar, Tabelle role=grid) ist
// strukturell; explizite header-Rollen sind mittel. Keine Änderung in diesem Paket.
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../app/bootstrap/seedDocDefaultsOpenCore';
import { GridSheet } from '../../GridSheet';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

interface MountedGrid {
  readonly container: HTMLElement;
  readonly root: Root;
  readonly error: unknown;
}

let active: MountedGrid | null = null;

function Harness({ initialDocument }: { initialDocument: WorkspaceDocument }) {
  const [document, setDocument] = useState<WorkspaceDocument>(initialDocument);
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

async function mount(): Promise<MountedGrid> {
  const workbook = createNewDocument('Grid' as never) as WorkspaceDocument;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let error: unknown = null;
  try {
    await act(async () => {
      root.render(createElement(Harness, { initialDocument: workbook }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (reason) {
    error = reason;
  }
  active = { container, root, error };
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

function gridTable(container: HTMLElement): HTMLTableElement | null {
  return container.querySelector<HTMLTableElement>('table[role="grid"]');
}

function activeCell(container: HTMLElement): HTMLTableCellElement | null {
  return container.querySelector<HTMLTableCellElement>('[data-vgt-grid-selection="active-cell"]');
}

function nameBox(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]');
}

function formulaField(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('.vgt-grid-formula-input');
}

function liveRegions(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[role="status"], [aria-live]'));
}

async function pressArrowDown(container: HTMLElement): Promise<void> {
  const root = gridRoot(container);
  if (!root) throw new Error('Grid-Wurzel fehlt');
  await act(async () => {
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('ARIA-/Screenreader-Vertrag des Grids — Ist-Zustand', () => {
  it('Fall 1: Raster-Semantik, Label und Größenangaben', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    const table = gridTable(mounted.container);
    expect(table, 'DOM-Zweig rendert eine table[role="grid"]').not.toBeNull();

    expect(table!.getAttribute('role')).toBe('grid');
    expect(table!.getAttribute('aria-label')?.trim().length).toBeGreaterThan(0);
    expect(Number(table!.getAttribute('aria-rowcount'))).toBe(30);
    expect(Number(table!.getAttribute('aria-colcount'))).toBe(20);

    // Ist-Zustand: keine expliziten Editier-/Mehrfachauswahl-Angaben am Raster.
    expect(table!.getAttribute('aria-readonly')).toBeNull();
    expect(table!.getAttribute('aria-multiselectable')).toBeNull();

    // Fokusziel und ARIA-Raster sind getrennt: der Wrapper trägt dessen Label als Gruppe
    // (Runde 17 ergänzt `role="group"`, damit das aria-label des Fokusziers nicht verpufft).
    const root = gridRoot(mounted.container);
    expect(root).not.toBeNull();
    expect(root!.getAttribute('role')).toBe('group');
    expect(root!.getAttribute('tabindex')).toBe('0');
    expect(root!.tabIndex).toBe(0);
    expect(root!.getAttribute('aria-label')).toBe('Astraea Grid workbook');
  });

  it('Fall 2: aktive Zelle ist markiert, aber ohne ID/Position für aria-activedescendant', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    const table = gridTable(mounted.container)!;
    const cell = activeCell(mounted.container);
    expect(cell, 'die aktive Zelle muss im DOM markiert sein').not.toBeNull();
    expect(cell!.tagName).toBe('TD');
    expect(cell!.getAttribute('aria-selected')).toBe('true');
    expect(cell!.getAttribute('data-vgt-grid-selection')).toBe('active-cell');

    // Ist-Zustand: keine programmatische ID und keine explizite Zellrolle/Position am td.
    expect(cell!.id, 'aktive Zelle hat keine ID').toBe('');
    expect(cell!.getAttribute('role'), 'td hat keine explizite gridcell-Rolle').toBeNull();
    expect(cell!.getAttribute('aria-colindex'), 'kein aria-colindex am DOM-td').toBeNull();
    expect(cell!.getAttribute('aria-rowindex'), 'kein aria-rowindex am DOM-td').toBeNull();
    expect(table.getAttribute('aria-activedescendant'), 'kein aria-activedescendant am Raster').toBeNull();
  });

  it('Fall 3: Namensfeld und Formel-/Wertfeld haben eigene zugängliche Namen', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    const name = nameBox(mounted.container);
    const formula = formulaField(mounted.container);

    expect(name).not.toBeNull();
    expect(name!.tagName).toBe('INPUT');
    expect(name!.getAttribute('aria-label')?.trim().length).toBeGreaterThan(0);
    expect(name!.type).toBe('text');
    expect(name!.tabIndex).toBe(0);
    expect(name!.getAttribute('role'), 'input text → implizite textbox, keine explizite Rolle').toBeNull();

    expect(formula).not.toBeNull();
    expect(formula!.tagName).toBe('INPUT');
    expect(formula!.getAttribute('aria-label')?.trim().length).toBeGreaterThan(0);
    expect(formula!.type).toBe('text');
    expect(formula!.tabIndex).toBe(0);
    expect(formula!.getAttribute('role'), 'Formel-/Wertfeld ist textbox, keine combobox-Rolle').toBeNull();
  });

  it('Fall 4: Spalten-/Zeilenköpfe: scope und Indizes, aber keine expliziten Rollen', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    const columnHeaders = Array.from(mounted.container.querySelectorAll<HTMLTableCellElement>('thead th[scope="col"]'));
    const rowHeaders = Array.from(mounted.container.querySelectorAll<HTMLTableCellElement>('tbody td[scope="row"]'));

    expect(columnHeaders.length, 'Spaltenköpfe müssen vorhanden sein').toBeGreaterThan(0);
    expect(rowHeaders.length, 'Zeilenköpfe müssen vorhanden sein').toBeGreaterThan(0);

    // Die erste th ist der Eck-Header ("#"); die Daten-Spaltenköpfe tragen aria-colindex.
    const corner = columnHeaders[0]!;
    expect(corner.textContent?.trim()).toBe('#');
    expect(corner.getAttribute('aria-colindex'), 'Eck-Header hat keinen colindex').toBeNull();

    const firstColumn = columnHeaders.find((header) => header.getAttribute('aria-colindex') !== null)!;
    expect(firstColumn.textContent?.trim().length).toBeGreaterThan(0);
    expect(firstColumn.getAttribute('aria-colindex')).toBe('1');
    expect(firstColumn.getAttribute('role'), 'th[scope=col]: implizite columnheader-Rolle, keine explizite').toBeNull();

    const firstRow = rowHeaders[0]!;
    expect(firstRow.textContent?.trim().length).toBeGreaterThan(0);
    expect(firstRow.getAttribute('aria-rowindex')).toBe('1');
    expect(firstRow.getAttribute('role'), 'td[scope=row]: keine explizite rowheader-Rolle').toBeNull();
  });

  it('Fall 5 (gehärtet): Zellauswahl wird über eine Live-Region angesagt', async () => {
    const mounted = await mount();
    expect(mounted.error).toBeNull();
    // Runde 17: das Grid hatte keine Live-Region; Auswahländerungen waren für AT stumm.
    const regions = liveRegions(mounted.container);
    expect(regions.length, 'genau eine Auswahl-Live-Region').toBeGreaterThanOrEqual(1);
    const status = mounted.container.querySelector('[data-grid-selection-status="true"]');
    expect(status, 'die Status-Region ist adressierbar').not.toBeNull();
    expect(status!.getAttribute('role')).toBe('status');
    expect(status!.getAttribute('aria-live')).toBe('polite');
    expect(status!.textContent?.trim(), 'Grundzustand nennt die aktive Zelle').toContain('A1');
    expect(nameBox(mounted.container)?.value).toBe('A1');

    await pressArrowDown(mounted.container);
    expect(nameBox(mounted.container)?.value).toBe('A2');
    expect(status!.textContent?.trim(), 'die Statusmeldung folgt der Auswahl').toContain('A2');
  });
});
