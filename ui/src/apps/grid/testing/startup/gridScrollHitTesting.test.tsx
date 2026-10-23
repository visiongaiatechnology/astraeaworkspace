// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/M1: Treffergenauigkeit im gescrollten/virtuellen Grid.
//
// Neue Dimension: die bisherigen Geometrie-Tests liefen bei Scroll 0 und mit kleinen
// Rastern. Diese Datei mountet ein großes Raster (300 Zeilen → automatisch Virtual-Zweig,
// `GridSheetViewport.tsx:61`) und setzt echte `scrollTop`/`scrollLeft`-Werte auf dem
// Scroll-Container inklusive `scroll`-Event. Die Treffer werden über echte
// `mousedown`/`mousemove`/`mouseup`-Events mit `clientX/clientY` geprüft.
//
// Stub-Konstanten: Der Auftrag nennt 100/26-Header und 48/26-Zellen; der Grid-Pointer-
// Resolver rechnet nachweislich mit HEADER_COL_WIDTH=48/HEADER_ROW_HEIGHT=26 und
// GRID_DEFAULT_COL_WIDTH=100/GRID_DEFAULT_ROW_HEIGHT=26
// (`gridVirtualCanvasRenderer.ts:20-21`, `gridAxisSizing.ts:16-17`). Der Stub nutzt die
// echten Grid-Werte; die vertauschten Auftragswerte würden eine andere Zelle treffen.
//
// Befund dieses Laufs (2026-10-18): 5/5 grün; Scroll-Treffer sind korrekt, ein
// Out-of-Viewport-Befund ist dokumentiert.
//   Fall 1: scrollTop=5*26 → Klick bei y=Header+10 trifft **A6** (erste sichtbare Zeile);
//           Virtual-Tree markiert A6. `GridVirtualCanvas.tsx:233-249` addiert scrollTop.
//   Fall 2: scrollLeft=3*100 → Klick bei x=Header+10 trifft **D1**. Horizontaler Offset
//           wird in `gridFreezeGeometry.ts:82-103` korrekt addiert.
//   Fall 3: scrollTop=5*26, Drag A6→A7 → Name-Box **A6:A7**; der Virtual-Tree markiert den
//           aktiven Endpunkt A7 (nicht Anker A6). Kein A1-Rücksprung.
//   Fall 4: **Befund:** Klick unter dem sichtbaren Viewport (y=rect.bottom+20) wird NICHT
//           auf den sichtbaren Bereich geklammert; er landet über die Inhaltshöhe bei
//           **A26** (Zeile außerhalb des Sichtfelds). Erst weit unter der Datenmenge
//           klammert `indexAt` (`gridAxisSizing.ts:90-102`) auf **A300** (letzte Zeile).
//           Kein Throw. Risiko: Pointer außerhalb des Viewports kann eine unsichtbare
//           Zelle auswählen; kleiner/medialer Fix (Viewport-Bound im Resolver).
//   Fall 5: Doppel-Scroll (top=5*26, left=3*100) → Virtual-Treffer **D6**, Backend
//           `data-render-backend`, aria-rowcount=300. Der Virtual-Zweig hat **keinen**
//           DOM-Spalten-Resizer (`GridTableCanvas.tsx`-Resizer fehlt) → AutoFit ist dort
//           nicht als DOM-Geste erreichbar (Paritätslücke). Der DOM-Zweig mit 60 Zeilen
//           nutzt den echten `<td>`-Treffer nach Scroll (`[data-vgt-grid-canvas]`-
//           Scrollcontainer) → A6 und hat den Resizer; kein Throw.
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

vi.setConfig({ testTimeout: 60_000 });

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const BASE: WorkspaceDocument = {
  id: 'grid-scroll-hit-testing',
  title: 'Grid Scroll Hit Testing',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

const VIEWPORT = { left: 100, top: 50, width: 960, height: 540 } as const;
const HEADER_W = 48;
const HEADER_H = 26;
const CELL_W = 100;
const CELL_H = 26;
const GRID_COLS = 12;

function fakeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height }),
  } as DOMRect;
}

let restoreLayout: (() => void) | null = null;

function installLayoutStubs(): void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function layoutStub(this: Element): DOMRect {
    if (this.matches('[role="grid"][data-render-backend]')) {
      return fakeRect(VIEWPORT.left, VIEWPORT.top, VIEWPORT.width, VIEWPORT.height);
    }
    if (this.matches('[data-vgt-grid-root="true"]')) {
      return fakeRect(VIEWPORT.left, VIEWPORT.top, VIEWPORT.width, VIEWPORT.height);
    }
    if (this instanceof HTMLTableCellElement) {
      const row = this.parentElement;
      const rowIndex = row ? Array.from(row.parentElement?.children ?? []).indexOf(row) : 0;
      const cellIndex = row ? Array.from(row.children).indexOf(this) : 0;
      return fakeRect(
        VIEWPORT.left + HEADER_W + Math.max(0, cellIndex - 1) * CELL_W,
        VIEWPORT.top + HEADER_H + Math.max(0, rowIndex) * CELL_H,
        CELL_W,
        CELL_H,
      );
    }
    if (this instanceof HTMLTableElement) {
      return fakeRect(VIEWPORT.left, VIEWPORT.top, HEADER_W + GRID_COLS * CELL_W, 300 * CELL_H);
    }
    return fakeRect(VIEWPORT.left, VIEWPORT.top, 96, 28);
  };
  restoreLayout = () => {
    Element.prototype.getBoundingClientRect = original;
    restoreLayout = null;
  };
}

interface MountedGrid {
  readonly container: HTMLElement;
  readonly error: unknown;
}

let active: { root: Root; container: HTMLElement } | null = null;

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

async function mount(initialDocument: WorkspaceDocument): Promise<MountedGrid> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  active = { root, container };
  let error: unknown = null;
  try {
    await act(async () => {
      root.render(createElement(Harness, { initialDocument }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (reason) {
    error = reason;
  }
  return { container, error };
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

beforeEach(() => {
  installLayoutStubs();
});

afterEach(async () => {
  await unmount();
  restoreLayout?.();
});

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function virtualSurface(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="grid"][data-render-backend]');
}

function domScrollContainer(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-vgt-grid-canvas]');
}

function nameBoxValue(container: HTMLElement): string | null {
  return container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]')?.value ?? null;
}

function selectedGridCellText(container: HTMLElement): string | null {
  return container.querySelector('[role="gridcell"][aria-selected="true"]')?.textContent ?? null;
}

function domCell(container: HTMLElement, rowIndex: number, colIndex: number): HTMLTableCellElement {
  const rows = container.querySelectorAll('tbody tr');
  const row = rows[rowIndex];
  if (!row) throw new Error(`DOM-Zeile ${rowIndex} fehlt`);
  const cells = Array.from(row.querySelectorAll('td')).filter((cell) => cell.getAttribute('scope') !== 'row');
  const cell = cells[colIndex];
  if (!cell) throw new Error(`DOM-Zelle ${rowIndex}/${colIndex} fehlt`);
  return cell as HTMLTableCellElement;
}

async function setScroll(surface: HTMLElement, scroll: { top?: number; left?: number }): Promise<void> {
  await act(async () => {
    if (scroll.top !== undefined) surface.scrollTop = scroll.top;
    if (scroll.left !== undefined) surface.scrollLeft = scroll.left;
    surface.dispatchEvent(new Event('scroll', { bubbles: true }));
    await tick();
  });
}

async function dispatchMouse(target: Element, type: string, clientX: number, clientY: number): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX,
      clientY,
    }));
    await tick();
  });
}

async function clickAt(target: Element, clientX: number, clientY: number): Promise<void> {
  await dispatchMouse(target, 'mousedown', clientX, clientY);
  await dispatchMouse(target, 'mouseup', clientX, clientY);
  await dispatchMouse(target, 'click', clientX, clientY);
}

async function dragFromTo(target: Element, startX: number, startY: number, endX: number, endY: number): Promise<void> {
  await dispatchMouse(target, 'mousedown', startX, startY);
  await dispatchMouse(target, 'mousemove', endX, endY);
  await dispatchMouse(target, 'mouseup', endX, endY);
}

function virtualWorkbook(rows = 300): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', {
    rows,
    cols: GRID_COLS,
    cells: { A1: { value: 'A1' }, A6: { value: 'A6' }, A7: { value: 'A7' }, D1: { value: 'D1' }, D6: { value: 'D6' } },
  }).updatedDocument;
}

function domWorkbook(rows = 60): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', {
    rows,
    cols: GRID_COLS,
    cells: { A1: { value: 'A1' }, A6: { value: 'A6' } },
  }).updatedDocument;
}

describe('Treffergenauigkeit im gescrollten/virtuellen Grid', () => {
  it('Fall 1: Klick nach vertikalem Scroll (5 Zeilen) trifft die erste sichtbare Zeile A6', async () => {
    const mounted = await mount(virtualWorkbook(300));
    expect(mounted.error).toBeNull();
    const surface = virtualSurface(mounted.container);
    expect(surface, '300 Zeilen → Virtual-Zweig').not.toBeNull();
    expect(surface!.getAttribute('aria-rowcount')).toBe('300');

    await setScroll(surface!, { top: 5 * CELL_H });
    await clickAt(
      surface!,
      VIEWPORT.left + HEADER_W + 30,
      VIEWPORT.top + HEADER_H + 10,
    );

    expect(nameBoxValue(mounted.container), 'erste sichtbare Zeile ist A6, nicht A1').toBe('A6');
    expect(selectedGridCellText(mounted.container), 'Virtual-Zweig markiert A6 im accessibility tree').toBe('A6');
  });

  it('Fall 2: Klick nach horizontalem Scroll (3 Spalten) trifft die erste sichtbare Spalte D', async () => {
    const mounted = await mount(virtualWorkbook(300));
    expect(mounted.error).toBeNull();
    const surface = virtualSurface(mounted.container)!;
    await setScroll(surface, { left: 3 * CELL_W, top: 0 });
    await clickAt(
      surface,
      VIEWPORT.left + HEADER_W + 10,
      VIEWPORT.top + HEADER_H + 10,
    );

    expect(nameBoxValue(mounted.container), 'erste sichtbare Spalte ist D, nicht A').toBe('D1');
    expect(selectedGridCellText(mounted.container)).toBe('D1');
  });

  it('Fall 3: Drag über 2 Zeilen nach vertikalem Scroll beginnt bei A6, nicht A1', async () => {
    const mounted = await mount(virtualWorkbook(300));
    expect(mounted.error).toBeNull();
    const surface = virtualSurface(mounted.container)!;
    await setScroll(surface, { top: 5 * CELL_H });

    await dragFromTo(
      surface,
      VIEWPORT.left + HEADER_W + 30,
      VIEWPORT.top + HEADER_H + 10,
      VIEWPORT.left + HEADER_W + 30,
      VIEWPORT.top + HEADER_H + 10 + CELL_H,
    );

    expect(nameBoxValue(mounted.container), 'Range beginnt bei A6 und endet bei A7').toBe('A6:A7');
    // Virtual-Tree markiert den aktiven Endpunkt der Range (A7), nicht den Anker A6.
    expect(selectedGridCellText(mounted.container)).toBe('A7');
  });

  it('Fall 4: Klick unterhalb des sichtbaren Bereichs — kein Throw, dokumentierter Ist-Zustand', async () => {
    const mounted = await mount(virtualWorkbook(300));
    expect(mounted.error).toBeNull();
    const surface = virtualSurface(mounted.container)!;
    await setScroll(surface, { top: 5 * CELL_H });

    const surfaceRect = surface.getBoundingClientRect();
    await clickAt(
      surface,
      surfaceRect.left + HEADER_W + 30,
      surfaceRect.top + surfaceRect.height + 20,
    );
    // Ist-Zustand: y unterhalb des sichtbaren Viewports wird NICHT auf den Viewport
    // geklammert; es landet über die Inhaltshöhe bei A26 (Zeile 26, außerhalb des Sichtfelds).
    expect(mounted.error).toBeNull();
    expect(nameBoxValue(mounted.container)).toBe('A26');

    // Erst weit unterhalb der Datenmenge klammert `rowScale.indexAt` auf die letzte Zeile.
    await clickAt(surface, surfaceRect.left + HEADER_W + 30, surfaceRect.top + 10_000);
    expect(mounted.error).toBeNull();
    expect(nameBoxValue(mounted.container), 'Klammerung auf die letzte Datenzeile').toBe('A300');
  });

  it('Fall 5: Doppel-Scroll trifft D6 im Virtual-Zweig; DOM-Zweig nutzt echte Zellen', async () => {
    const virtual = await mount(virtualWorkbook(300));
    expect(virtual.error).toBeNull();
    const surface = virtualSurface(virtual.container)!;
    await setScroll(surface, { top: 5 * CELL_H, left: 3 * CELL_W });
    await clickAt(
      surface,
      VIEWPORT.left + HEADER_W + 10,
      VIEWPORT.top + HEADER_H + 10,
    );
    expect(nameBoxValue(virtual.container)).toBe('D6');
    expect(surface.getAttribute('data-render-backend')).not.toBeNull();
    // Virtual-Zweig hat keinen DOM-Spalten-Resizer → AutoFit ist dort nicht als DOM-Geste erreichbar.
    expect(virtual.container.querySelector('[data-vgt-grid-column-resizer]')).toBeNull();

    await unmount();

    const dom = await mount(domWorkbook(60));
    expect(dom.error).toBeNull();
    expect(domScrollContainer(dom.container), '≤250 Zeilen → DOM-Zweig mit Scroll-Container').not.toBeNull();
    expect(virtualSurface(dom.container), 'kein Virtual-Backend im DOM-Zweig').toBeNull();
    await setScroll(domScrollContainer(dom.container)!, { top: 5 * CELL_H });
    const cellA6 = domCell(dom.container, 5, 0);
    const cellRect = cellA6.getBoundingClientRect();
    await clickAt(cellA6, cellRect.left + cellRect.width / 2, cellRect.top + cellRect.height / 2);
    expect(nameBoxValue(dom.container), 'DOM-Treffer wird vom echten td-Ziel bestimmt').toBe('A6');
    expect(dom.container.querySelector('[data-vgt-grid-column-resizer]')).not.toBeNull();
  });
});
