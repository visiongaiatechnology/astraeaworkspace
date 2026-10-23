// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001: sechs Fehlermodi des Grid-Startups werden in einem echten DOM ausgeführt.
//
// Befund (gemessen 2026-10-18, dieser Lauf): **6/6 grün, kein Throw.** Keiner der sechs
// Dokumentzustände löst in `GridSheet` eine Ausnahme aus; jeder wird kontrolliert abgefangen
// und rendert einen definierten Zustand (Tabelle + A1-Auswahl + Namensfeld A1). Damit ist
// keiner dieser Modi ein *im DOM belegter* Kandidat für den nativen „Modul wurde sicher
// angehalten"-Crash. Das schließt eine native Ursache außerhalb von happy-dom (WebView2,
// Layout/Messung, Desktop-Bridge) nicht aus — genau deshalb bleibt GRID-INV-011 gültig.
//
// Warum diese Datei: `gridSheetDomMountWitness.test.tsx` deckt den Produktionspfad und zwei
// Negativfälle ab. Der native Crash trat beim Öffnen einer realen Mappe auf; ein beschädigtes
// oder migriertes Dokument kann aber ganz andere Felder verletzen. Die sechs Fälle unten sind
// genau die Dokumentformen, die in einer alten/beschädigten `.vgrid` plausibel sind.
//
// Jeder Fall mountet die echte `GridSheet` mit `createRoot` + `act` und kontrolliertem
// `useState`-Dokument (wie im Produktions-Frame). Geprüft werden zwei Dinge:
//   1. wirft der Mount? (nur dann wäre der Modus ein Crash-Kandidat)
//   2. welcher definierte Zustand entsteht stattdessen? (Raster, A1, Namensfeld, Zeilen/Spalten)
//
// Wird ein Fall künftig rot, lautet die Regel: **nicht den Quellcode ändern**. Den Wurf im
// Kommentar als Befund festhalten und den Fall als `it.fails` mit dem gemessenen Fehler
// abschließen; die übrigen Fälle bleiben grün.
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GridCell,
  GridDocumentModel,
  GridSheetModel,
  TableObject,
  WorkspaceDocument,
  WorkspaceObject,
} from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';

// React 19 verlangt diese Markierung, damit `act` die Umgebung als Testumgebung erkennt;
// ohne sie entstehen nur Warnungen auf stderr, das Verhalten ist identisch.
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.setConfig({ testTimeout: 60_000 });

/** Zellinhalt, den kein Chrome-Token enthält: nur echtes Zellrendering kann ihn treffen. */
const GRID_CELL_TEXT = 'Astraea-Zelle-Fehlermodus';

interface ControlledMount {
  readonly container: HTMLElement;
  readonly error: unknown;
  readonly root: Root;
}

let active: ControlledMount | null = null;

/**
 * Kontrolliertes Dokument wie im Produktions-Frame: `useState` hält den Dokumentstand,
 * `onUpdateDocument` schreibt ihn zurück. So kann ein späterer Commit nicht an einer
 * veralteten Prop hängen.
 */
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

async function mount(initialDocument: WorkspaceDocument): Promise<ControlledMount> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let error: unknown = null;
  try {
    await act(async () => {
      root.render(createElement(Harness, { initialDocument }));
    });
    // Zweiter Durchlauf: Zustand aus Effekten (aktives Blatt, Zellmodell) wird nachgereicht.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } catch (reason) {
    error = reason;
  }
  active = { container, error, root };
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
    // Ein bereits geworfener Mount hinterlässt eine unbrauchbare Wurzel; das Aufräumen
    // darf den ursprünglichen Fehler nicht verdecken.
  } finally {
    container.remove();
  }
}

afterEach(async () => {
  await unmount();
});

interface Observation {
  readonly grid: Element | null;
  readonly nameBox: HTMLInputElement | null;
  readonly selectedCell: Element | null;
  readonly rowCount: string | null;
  readonly colCount: string | null;
  readonly tdCount: number;
  readonly text: string;
}

function observe(container: HTMLElement): Observation {
  const grid = container.querySelector('[role="grid"]');
  return {
    grid,
    nameBox: container.querySelector<HTMLInputElement>('[data-grid-name-box="true"]'),
    selectedCell: container.querySelector('[data-vgt-grid-selection="active-cell"]'),
    rowCount: grid?.getAttribute('aria-rowcount') ?? null,
    colCount: grid?.getAttribute('aria-colcount') ?? null,
    tdCount: container.querySelectorAll('td').length,
    text: container.textContent ?? '',
  };
}

/** Gemeinsame Mindestanforderung an einen kontrollierten Zustand: Raster, A1, Zellen. */
function expectControlledGrid(state: Observation): void {
  expect(state.grid, 'die Rasterfläche muss gerendert werden').not.toBeNull();
  expect(state.nameBox?.value, 'A1 muss ausgewählt sein').toBe('A1');
  expect(state.selectedCell, 'eine aktive Zelle muss markiert sein').not.toBeNull();
  expect(state.tdCount, 'es müssen Datenzellen gerendert sein').toBeGreaterThan(0);
}

function baseDocument(overrides: Partial<WorkspaceDocument>): WorkspaceDocument {
  return {
    id: 'grid-failure-mode',
    title: 'Grid failure mode',
    kind: 'Grid',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    ...overrides,
  };
}

/**
 * Table-Objekt für ein Blatt. `cells` wird absichtlich weggelassen, wenn der jeweilige
 * Fehlermodus genau das prüft (Fall 3); der Cast ist nötig, weil der Contract `cells`
 * als Pflichtfeld führt und wir hier eine Vertragsverletzung simulieren.
 */
function tableObject(rows: number, cols: number, cells?: Record<string, GridCell>): WorkspaceObject {
  // Der Cast ist Absicht: Fall 3 simuliert einen Vertragsbruch (`data.cells` fehlt), den der
  // Contract als Pflichtfeld führt. Beim Laufzeit-Renderer ist genau dieser Zustand zu prüfen.
  const data = { id: 'table-1', rows, cols, ...(cells === undefined ? {} : { cells }) } as TableObject;
  return { type: 'Table', data };
}

function gridDocument(activeSheetId: string | undefined, sheets: GridSheetModel[]): GridDocumentModel {
  return { sheets, ...(activeSheetId === undefined ? {} : { activeSheetId }) };
}

function emptySheet(id: string, tableObjectId: string): GridSheetModel {
  return { id, name: 'Sheet 1', tableObjectId };
}

function customDocument(options: {
  readonly id: string;
  readonly rootObjectIds: string[];
  readonly objects: WorkspaceDocument['objects'];
  readonly grid?: GridDocumentModel;
}): WorkspaceDocument {
  return baseDocument({
    id: options.id,
    root_object_ids: options.rootObjectIds,
    objects: options.objects,
    ...(options.grid === undefined ? {} : { gridData: options.grid }),
  });
}

describe('GR-001 — Grid-Startup-Fehlermodi in einem echten DOM', () => {
  it('Fall 1: gridData.sheets leer, aber root_object_ids enthält ein gültiges Table-Objekt', async () => {
    // Beobachtet: kein Throw. `useGridState.ts:70-74` synthetisiert aus dem gefundenen
    // root-Table ein Ersatzblatt (`sheet-fallback`); das Grid rendert daraus 30×12,
    // A1 ist ausgewählt, das Namensfeld zeigt A1, der Zelltext ist sichtbar.
    // Kontrolliert abgefangen — kein Crash-Kandidat in diesem DOM.
    const documentUnderTest = customDocument({
      id: 'fall-1-empty-sheets',
      rootObjectIds: ['table-1'],
      objects: { 'table-1': tableObject(30, 12, { A1: { value: GRID_CELL_TEXT } }) },
      grid: gridDocument(undefined, []),
    });

    const { container, error } = await mount(documentUnderTest);
    const state = observe(container);

    expect(error, 'der Mount darf keine Ausnahme werfen').toBeNull();
    expectControlledGrid(state);
    expect(state.rowCount).toBe('30');
    expect(state.colCount).toBe('12');
    expect(state.text).toContain(GRID_CELL_TEXT);
  });

  it('Fall 2: gridData.activeSheetId zeigt auf ein nicht existierendes Sheet', async () => {
    // Beobachtet: kein Throw. `useGridWorkbook.ts:53` fällt auf das erste vorhandene Blatt
    // zurück (`find(...) ?? sheets[0]`), das Grid rendert dieses Blatt (30×12, A1, Zelltext).
    // Die veraltete `activeSheetId` bleibt im Dokumentzustand stehen, wird für die Anzeige
    // aber nicht mehr konsultiert: stiller Fallback statt Ausnahme.
    const documentUnderTest = customDocument({
      id: 'fall-2-ghost-sheet',
      rootObjectIds: ['table-1'],
      objects: { 'table-1': tableObject(30, 12, { A1: { value: GRID_CELL_TEXT } }) },
      grid: gridDocument('sheet-does-not-exist', [emptySheet('sheet-1', 'table-1')]),
    });

    const { container, error } = await mount(documentUnderTest);
    const state = observe(container);

    expect(error, 'der Mount darf keine Ausnahme werfen').toBeNull();
    expectControlledGrid(state);
    expect(state.rowCount).toBe('30');
    expect(state.colCount).toBe('12');
    expect(state.text).toContain(GRID_CELL_TEXT);
  });

  it('Fall 3: Table-Objekt existiert, aber data.cells fehlt (undefined)', async () => {
    // Beobachtet: kein Throw. `useGridState.ts:116` ersetzt fehlende Zellen durch `{}`;
    // das Grid rendert ein leeres 30×12-Raster mit A1-Auswahl und Namensfeld A1.
    // Der fehlende Zellbestand wird still als leer behandelt (keine Fehlermeldung) —
    // das ist ein Diagnose-Gap, aber kein Crash-Kandidat in diesem DOM.
    const documentUnderTest = customDocument({
      id: 'fall-3-missing-cells',
      rootObjectIds: ['table-1'],
      objects: { 'table-1': tableObject(30, 12) },
      grid: gridDocument('sheet-1', [emptySheet('sheet-1', 'table-1')]),
    });

    const { container, error } = await mount(documentUnderTest);
    const state = observe(container);

    expect(error, 'der Mount darf keine Ausnahme werfen').toBeNull();
    expectControlledGrid(state);
    expect(state.rowCount).toBe('30');
    expect(state.colCount).toBe('12');
    expect(state.text, 'ohne cells darf kein erfundener Zelltext erscheinen').not.toContain(GRID_CELL_TEXT);
  });

  it('Fall 4: Zelle mit unerwartetem dataType und value=null', async () => {
    // Beobachtet: kein Throw. `formatCellValue` liefert für `value === null` den leeren
    // String (`compat/gridUtils.ts:157`); der unbekannte `dataType` wird vom Renderer nicht
    // ausgewertet. A1 bleibt leer, B1 mit gültigem Text rendert normal; A1 bleibt ausgewählt.
    const documentUnderTest = customDocument({
      id: 'fall-4-hostile-cell',
      rootObjectIds: ['table-1'],
      objects: {
        'table-1': tableObject(30, 12, {
          A1: { value: null, dataType: 'definitely-not-a-grid-data-type' } as unknown as GridCell,
          B1: { value: 'sichtbarer-text', dataType: 'also-not-a-grid-data-type' } as unknown as GridCell,
        }),
      },
      grid: gridDocument('sheet-1', [emptySheet('sheet-1', 'table-1')]),
    });

    const { container, error } = await mount(documentUnderTest);
    const state = observe(container);

    expect(error, 'der Mount darf keine Ausnahme werfen').toBeNull();
    expectControlledGrid(state);
    expect(state.selectedCell?.textContent?.trim(), 'A1 mit value=null rendert leer').toBe('');
    expect(state.text).toContain('sichtbarer-text');
  });

  it('Fall 5: root_object_ids zeigt auf einen fehlenden Table, gridData ist gültig', async () => {
    // Beobachtet: kein Throw. `useGridState.ts:99-100` nimmt `primaryTableId` aus dem aktiven
    // Blatt; der fehlende root-Table wird beim Rendern nie konsultiert. Das Grid rendert
    // 30×12 mit A1-Auswahl und Zelltext. Kontrolliert — aber die Dokument-Invariante
    // „root_object_ids zeigt auf existierende Objekte" bleibt verletzt (stiller Zustand).
    const documentUnderTest = customDocument({
      id: 'fall-5-missing-root-table',
      rootObjectIds: ['table-does-not-exist'],
      objects: { 'table-1': tableObject(30, 12, { A1: { value: GRID_CELL_TEXT } }) },
      grid: gridDocument('sheet-1', [emptySheet('sheet-1', 'table-1')]),
    });

    const { container, error } = await mount(documentUnderTest);
    const state = observe(container);

    expect(error, 'der Mount darf keine Ausnahme werfen').toBeNull();
    expectControlledGrid(state);
    expect(state.rowCount).toBe('30');
    expect(state.colCount).toBe('12');
    expect(state.text).toContain(GRID_CELL_TEXT);
  });

  it('Fall 6: Extremwerte rows=0/cols=0 und rows=-5', async () => {
    // Beobachtet: kein Throw. Der Effekt in `useGridState.ts:166-171` klemmt die Maße beim
    // Nachreichen auf mindestens 1. rows:0/cols:0 rendert 1×1 (A1 ausgewählt, Namensfeld A1);
    // rows:-5/cols:12 rendert 1×12 (eine Zeile, zwölf Spalten). Kein negativer/0-Renderer-
    // Zustand, keine Ausnahme.
    const zero = customDocument({
      id: 'fall-6-zero-size',
      rootObjectIds: ['table-1'],
      objects: { 'table-1': tableObject(0, 0) },
      grid: gridDocument('sheet-1', [emptySheet('sheet-1', 'table-1')]),
    });
    const zeroMount = await mount(zero);
    const zeroState = observe(zeroMount.container);

    expect(zeroMount.error, 'rows:0/cols:0 darf keine Ausnahme werfen').toBeNull();
    expectControlledGrid(zeroState);
    expect(zeroState.rowCount, '0 Zeilen werden auf 1 geklemmt').toBe('1');
    expect(zeroState.colCount, '0 Spalten werden auf 1 geklemmt').toBe('1');
    await unmount();

    const negative = customDocument({
      id: 'fall-6-negative-size',
      rootObjectIds: ['table-1'],
      objects: { 'table-1': tableObject(-5, 12) },
      grid: gridDocument('sheet-1', [emptySheet('sheet-1', 'table-1')]),
    });
    const negativeMount = await mount(negative);
    const negativeState = observe(negativeMount.container);

    expect(negativeMount.error, 'rows:-5 darf keine Ausnahme werfen').toBeNull();
    expectControlledGrid(negativeState);
    expect(negativeState.rowCount, 'negative Zeilen werden auf 1 geklemmt').toBe('1');
    expect(negativeState.colCount, 'die 12 gültigen Spalten bleiben erhalten').toBe('12');
  });
});
