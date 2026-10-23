// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001: Layout-/Geometrie-Witness für den Grid-Startup.
//
// Bisherige Grid-DOM-Witnesse laufen mit den 0×0-Rects von happy-dom. Dadurch sind die
// echten Mess-/Pointer-Pfade ungetestet: `GridVirtualCanvas.tsx:233-249` bildet einen
// Mausklick über `event.currentTarget.getBoundingClientRect()` auf eine Zelle ab; ohne
// belastbare Rect-Werte landet der Klick mathematisch immer im selben (falschen) Bereich.
// Diese Datei ersetzt `Element.prototype.getBoundingClientRect` durch einen kontrollierten,
// elementtyp-abhängigen Stub und fährt echte DOM-Events:
//   Fall 1: Klick in eine leere Zelle / unter das Raster → definierter Auswahlzustand.
//   Fall 2: Klick auf eine bestimmte Zelle → genau diese Zelle ist `active-cell` (DOM + Virtual).
//   Fall 3: AutoFit per Doppelklick auf den Spalten-Resizer → colWidths werden geschrieben.
//   Fall 4: Virtual-Zweig (>250 Zeilen): Scroll-Event + Klick + ArrowDown → definierter Zustand.
//
// Stub-Konstanten: Der Auftrag nennt 96×28-Zellen und 24-px-Header (Writer-/Present-Anmutung).
// Der Grid-Pointer-Resolver rechnet nachweislich mit anderen echten Konstanten:
//   HEADER_COL_WIDTH=48, HEADER_ROW_HEIGHT=26 (`gridVirtualCanvasRenderer.ts:20-21`)
//   GRID_DEFAULT_COL_WIDTH=100, GRID_DEFAULT_ROW_HEIGHT=26 (`gridAxisSizing.ts:16-17`)
// Deshalb verwendet der Stub die echten Grid-Werte; mit 96×28/24 wäre die Pointer-Messung
// gegenüber dem Code unter Test inkonsistent und damit wertlos. Der Stub ist bewusst
// NICHT bei (0,0): der Viewport liegt bei (100,50), damit ein fehlender/vergessener Stub
// die Klickkoordinaten sichtbar falsch abbildet und der Test rot wird.
//
// Befund dieses Laufs (2026-10-18):
//   Fall 1: kein Throw; Klick in die leere C3 → active-cell exakt C3 (Namensfeld C3);
//           Klick unter das Raster → kein Throw, Auswahl bleibt C3.
//   Fall 2: kein Throw; DOM-Klick B2 → genau B2 active-cell; Virtual-Klick mit gestubbter
//           Rect (Viewport bei 100/50) → Namensfeld B2, aria-selected gridcell B2.
//   Fall 3: kein Throw; AutoFit-Doppelklick auf den B-Resizer schreibt colWidths[1]=48.
//   Fall 4: kein Throw; 300 Zeilen (>250), scrollTop=130, Klick → A6, ArrowDown → A7;
//           aria-rowcount=300.
//   Kontrolle: Mit den echten happy-dom-0×0-Rects bildet derselbe absolute Klick C4
//           statt B2 ab — die 0-Rect-Umgebung war also für Geometrieprüfungen blind,
//           aber auch dieser Pfad wirft nicht.
//
// 0-Rect-Erklärung: Für die hier untersuchten Grid-Pfade **widerlegt**. Der einzige echte
// Rect-Konsument im Grid ist die Virtual-Pointer-Abbildung
// (`GridVirtualCanvas.tsx:234-237` → `gridFreezeGeometry.ts:82-103`); unter realistischen
// Rects löst sie korrekt auf und wirft nicht. Damit erklärt 0×0 die frühere
// Nicht-Reproduzierbarkeit des nativen Crashs nicht; die Ursache liegt außerhalb dieser
// DOM-Pfade (nach Round 3 weiterhin Host-API-/WebView2-Verdacht, z. B. `crypto.randomUUID`).
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument, patchSheetInDocument } from '../../workbook/gridWorkbookOperations';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.setConfig({ testTimeout: 60_000 });

const BASE: WorkspaceDocument = {
  id: 'grid-layout-geometry-witness',
  title: 'Grid layout geometry witness',
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

/** Elementtyp-abhängiger Layout-Stub; gibt die Restore-Funktion zurück. */
function installLayoutStubs(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function layoutStub(this: Element): DOMRect {
    const element = this;
    if (element.matches('[role="grid"][data-render-backend]')) {
      return fakeRect(VIEWPORT.left, VIEWPORT.top, VIEWPORT.width, VIEWPORT.height);
    }
    if (element.matches('[data-vgt-grid-root="true"]')) {
      return fakeRect(VIEWPORT.left, VIEWPORT.top, VIEWPORT.width, VIEWPORT.height);
    }
    if (element instanceof HTMLTableElement && element.getAttribute('role') === 'grid') {
      return fakeRect(
        VIEWPORT.left,
        VIEWPORT.top,
        HEADER_W + GRID_COLS * CELL_W + 40,
        HEADER_H + 30 * CELL_H,
      );
    }
    if (element instanceof HTMLTableCellElement) {
      const row = element.parentElement;
      const rowIndex = row ? Array.from(row.parentElement?.children ?? []).indexOf(row) : -1;
      if (element.tagName === 'TD') {
        const cellIndex = row ? Array.from(row.children).indexOf(element) : -1;
        const colIndex = Math.max(0, cellIndex - 1);
        return fakeRect(
          VIEWPORT.left + HEADER_W + colIndex * CELL_W,
          VIEWPORT.top + HEADER_H + Math.max(0, rowIndex) * CELL_H,
          CELL_W,
          CELL_H,
        );
      }
      if (element.tagName === 'TH') {
        const inHead = element.closest('thead') !== null;
        if (inHead) {
          const headerIndex = row ? Array.from(row.children).indexOf(element) : -1;
          const isCorner = headerIndex === 0;
          return fakeRect(
            VIEWPORT.left + (isCorner ? 0 : HEADER_W + (headerIndex - 1) * CELL_W),
            VIEWPORT.top,
            isCorner ? HEADER_W : CELL_W,
            HEADER_H,
          );
        }
        return fakeRect(
          VIEWPORT.left,
          VIEWPORT.top + HEADER_H + Math.max(0, rowIndex) * CELL_H,
          HEADER_W,
          CELL_H,
        );
      }
    }
    if (element.tagName === 'CANVAS') {
      return fakeRect(VIEWPORT.left, VIEWPORT.top, VIEWPORT.width, VIEWPORT.height);
    }
    // Generische Chrome-Elemente: 96×28 aus der Auftragsvorgabe.
    return fakeRect(VIEWPORT.left, VIEWPORT.top, 96, 28);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

interface MountedGrid {
  readonly container: HTMLElement;
  readonly root: Root;
  readonly error: unknown;
  readonly latestDocument: () => WorkspaceDocument;
}

let activeMount: MountedGrid | null = null;

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
  activeMount = { container, root, error, latestDocument: () => latestDocument };
  return activeMount;
}

async function unmount(): Promise<void> {
  if (!activeMount) return;
  const { root, container } = activeMount;
  activeMount = null;
  try {
    await act(async () => {
      root.unmount();
    });
  } catch {
    // Nach einem geworfenen Mount ist die Wurzel unbrauchbar; der Befund bleibt erhalten.
  } finally {
    container.remove();
  }
}

afterEach(async () => {
  await unmount();
});

function domWorkbook(): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', {
    rows: 30,
    cols: GRID_COLS,
    cells: {
      A1: { value: 'A1' },
      B1: { value: 'B1' },
      B2: { value: 'B2' },
      C3: { value: '' },
    },
  }).updatedDocument;
}

function virtualWorkbook(rows = 300): WorkspaceDocument {
  const added = addSheetToDocument(BASE, [], 'Sheet 1', {
    rows,
    cols: GRID_COLS,
    cells: { A1: { value: 'A1' }, B2: { value: 'B2' } },
  });
  return patchSheetInDocument(added.updatedDocument, added.newSheetId, { useVirtualCanvas: true });
}

function gridRoot(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-vgt-grid-root="true"]');
}

function virtualSurface(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="grid"][data-render-backend]');
}

function nameBoxValue(container: HTMLElement): string | null {
  return container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]')?.value ?? null;
}

function activeCell(container: HTMLElement): Element | null {
  return container.querySelector('[data-vgt-grid-selection="active-cell"]');
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

async function doubleClickAt(target: Element, clientX: number, clientY: number): Promise<void> {
  await dispatchMouse(target, 'dblclick', clientX, clientY);
}

async function pressArrowDown(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
  });
}

function domCell(container: HTMLElement, rowIndex: number, colIndex: number): HTMLTableCellElement {
  const rows = container.querySelectorAll('tbody tr');
  const row = rows[rowIndex];
  if (!row) throw new Error(`DOM-Zeile ${rowIndex} fehlt`);
  // Die erste `<td>` jeder Zeile ist der Zeilenkopf (`scope="row"`), keine Datenzelle.
  const cells = Array.from(row.querySelectorAll('td')).filter(
    (cell) => cell.getAttribute('scope') !== 'row',
  );
  const cell = cells[colIndex];
  if (!cell) throw new Error(`DOM-Zelle ${rowIndex}/${colIndex} fehlt`);
  return cell as HTMLTableCellElement;
}

describe('GR-001 — Grid-Layout-/Geometrie-Witness', () => {
  it('Fall 1: Klick in leere Zelle und unter das Raster → definierter Auswahlzustand', async () => {
    const restore = installLayoutStubs();
    try {
      const mounted = await mount(domWorkbook());
      expect(mounted.error).toBeNull();
      expect(gridRoot(mounted.container)).not.toBeNull();

      const emptyCell = domCell(mounted.container, 2, 2); // C3, kein Text
      expect(emptyCell.textContent?.trim()).toBe('');
      const emptyRect = emptyCell.getBoundingClientRect();
      await clickAt(emptyCell, emptyRect.left + emptyRect.width / 2, emptyRect.bottom - 2);

      const selected = activeCell(mounted.container);
      expect(nameBoxValue(mounted.container)).toBe('C3');
      expect(selected).toBe(emptyCell);
      expect(selected?.textContent?.trim()).toBe('');

      // Freier Bereich unterhalb der Tabelle: kein Throw, Auswahl bleibt definiert.
      const table = mounted.container.querySelector('table[role="grid"]');
      expect(table).not.toBeNull();
      const tableRect = table!.getBoundingClientRect();
      await clickAt(table!, tableRect.left + 8, tableRect.bottom + 12);
      expect(mounted.error).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('C3');
    } finally {
      restore();
    }
  });

  it('Fall 2: Klick auf eine bestimmte Zelle → genau diese Zelle ist active-cell (DOM + Virtual)', async () => {
    const restore = installLayoutStubs();
    try {
      const dom = await mount(domWorkbook());
      expect(dom.error).toBeNull();
      const b2 = domCell(dom.container, 1, 1);
      const rect = b2.getBoundingClientRect();
      await clickAt(b2, rect.left + rect.width / 2, rect.top + rect.height / 2);
      expect(nameBoxValue(dom.container)).toBe('B2');
      expect(activeCell(dom.container)).toBe(b2);
      expect(activeCell(dom.container)?.textContent?.trim()).toBe('B2');
      expect(dom.container.querySelectorAll('[data-vgt-grid-selection="active-cell"]').length).toBe(1);
      await unmount();

      const virtual = await mount(virtualWorkbook(60));
      expect(virtual.error).toBeNull();
      const surface = virtualSurface(virtual.container);
      expect(surface).not.toBeNull();
      const surfaceRect = surface!.getBoundingClientRect();
      await dispatchMouse(
        surface!,
        'mousedown',
        surfaceRect.left + HEADER_W + CELL_W + CELL_W / 2,
        surfaceRect.top + HEADER_H + CELL_H + CELL_H / 2,
      );
      expect(nameBoxValue(virtual.container)).toBe('B2');
      expect(virtual.container.querySelector('[role="gridcell"][aria-selected="true"]')?.textContent).toBe('B2');
    } finally {
      restore();
    }
  });

  it('Fall 3: AutoFit per Doppelklick auf den Spalten-Resizer schreibt colWidths', async () => {
    const restore = installLayoutStubs();
    try {
      const mounted = await mount(domWorkbook());
      expect(mounted.error).toBeNull();
      const resizer = mounted.container.querySelector('[data-vgt-grid-column-resizer="1"]');
      expect(resizer).not.toBeNull();
      const rect = resizer!.getBoundingClientRect();
      await doubleClickAt(resizer!, rect.left + rect.width / 2, rect.top + rect.height / 2);

      const sheet = mounted.latestDocument().gridData?.sheets.find(
        (candidate) => candidate.id === mounted.latestDocument().gridData?.activeSheetId,
      );
      expect(mounted.error).toBeNull();
      expect(typeof sheet?.colWidths?.[1], 'AutoFit muss die Breite der B-Spalte schreiben').toBe('number');
      expect(sheet?.colWidths?.[1]).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it('Kontrolle: 0×0-Rects bilden denselben Klick falsch ab (kein Throw)', async () => {
    // Kalibrierung für die 0-Rect-Frage: derselbe absolute Client-Punkt, der mit dem
    // gestubbten Viewport (100/50) B2 trifft, trifft unter happy-dom-Default (0×0) eine
    // andere Zelle. Das belegt, dass frühere Witnesse die Pointer-Geometrie nicht messen
    // konnten — aber auch dieser Pfad wirft nicht.
    const zero = await mount(virtualWorkbook(60));
    expect(zero.error).toBeNull();
    const surface = virtualSurface(zero.container);
    expect(surface).not.toBeNull();
    const rect = surface!.getBoundingClientRect();
    expect(rect.width, 'happy-dom-Default ohne Stub ist 0').toBe(0);

    await dispatchMouse(
      surface!,
      'mousedown',
      VIEWPORT.left + HEADER_W + CELL_W + CELL_W / 2,
      VIEWPORT.top + HEADER_H + CELL_H + CELL_H / 2,
    );
    const selectedUnderZeroRects = nameBoxValue(zero.container);
    expect(selectedUnderZeroRects, 'ohne Rect-Stub landet derselbe Klick auf C4').toBe('C4');
    expect(zero.error).toBeNull();
  });

  it('Fall 4: Virtual-Zweig (>250 Zeilen): Scroll + Klick + ArrowDown → definierter Zustand', async () => {
    const restore = installLayoutStubs();
    try {
      const mounted = await mount(virtualWorkbook(300));
      expect(mounted.error).toBeNull();
      const surface = virtualSurface(mounted.container);
      expect(surface).not.toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A1');

      const surfaceRect = surface!.getBoundingClientRect();
      await act(async () => {
        surface!.scrollTop = 5 * CELL_H;
        surface!.dispatchEvent(new Event('scroll'));
        await tick();
      });

      await dispatchMouse(
        surface!,
        'mousedown',
        surfaceRect.left + HEADER_W + 0 * CELL_W + CELL_W / 2,
        surfaceRect.top + HEADER_H + 0 * CELL_H + CELL_H / 2,
      );
      expect(surface!.getAttribute('aria-rowcount')).toBe('300');
      expect(nameBoxValue(mounted.container)).toBe('A6');

      await pressArrowDown(surface!);
      expect(mounted.error).toBeNull();
      expect(nameBoxValue(mounted.container)).toBe('A7');
    } finally {
      restore();
    }
  });
});
