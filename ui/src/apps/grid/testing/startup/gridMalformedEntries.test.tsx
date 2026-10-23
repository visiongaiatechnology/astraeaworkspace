// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/M1: fehlerhafte **Einträge** auf Dokument-/Sheet-/Zell-Ebene.
//
// Bisherige Startup-Witnesse prüften Formen (fehlende Sheets, fehlende cells, Nullwerte in
// Zellfeldern), aber nicht `null`/`{}`-Einträge in `objects`, `cells`, `sheets` oder
// vertragsbrüchige Table-/Protection-Felder. Diese Datei mountet die echte `GridSheet` mit
// kontrolliertem `useState`-Dokument (wie `gridStartupFailureModes.test.tsx`) und misst:
//   * wirft der Mount?
//   * falls nein: kontrolliertes Raster (Name-Box A1, Zellen) oder stiller korrupter Zustand?
//   * falls ja: exakter Fehler als Befund gepinnt (kein Quellcode-Fix in diesem Paket).
//
// Befund dieses Laufs (2026-10-18): 6/6 grün; ein harter Throw, mehrere stille Korruptions-
// zustände.
//   Fall 1: **kein Throw, aber stiller Fallback:** Table-Eintrag ist `null`; `tableObj` wird
//           null, die Init-Defaults 25×10 bleiben stehen (`useGridState.ts:115-116,128-129`),
//           das Grid rendert ein leeres 25×10-Raster (td=300, A1, kein Alert). Die Sheet-
//           Referenz auf das fehlende Table wird nicht diagnostiziert.
//   Fall 2: kein Throw; `cells.A1=null` und `cells.B1={}` werden vom Renderer als leer
//           behandelt (`gridUtils.ts:156-157`), C1-Text rendert normal (30×12, td=420).
//           Kein Alert; stiller Umgang mit vertragsbrüchigen Zell-Einträgen.
//   Fall 3: **Throw:** `TypeError: Cannot read properties of null (reading 'id')` bei
//           `useGridWorkbook.ts:53:57` — `workbookSheets.find((s) => s.id === activeSheetId)`
//           dereferenziert den null-Sheet-Eintrag. Kein Raster (grid=null, td=0), keine
//           kontrollierte Ablehnung. Ein Filter/Guard auf `workbookSheets` wäre ein
//           Einzeiler-Fix (nicht in diesem Paket geändert).
//   Fall 4: kein Throw, aber mehrere stille Korruptionszustände:
//           rows:null → 1×12 (Math.max(1,null)), rows:'30' → 30×12 (String-Koerzierung),
//           rows:NaN → aria-rowcount="NaN", td=0 (kein Zellraster), cols:null → 30×1,
//           cols:'12' → 30×12, cols:NaN → aria-colcount="NaN", td=60; cells als String/Array
//           mounten 30×12, aber der Zelltext fehlt (Daten werden ignoriert). Ursache:
//           `useGridState.ts:182-187` (`Math.max(1, ...)`) bzw. `:132` (`cells || {}`)
//           ohne Typ-/NaN-Validierung.
//   Fall 5: kein Throw; `root_object_ids: [null, 42]` wird von
//           `useGridState.ts:67-69` still ignoriert (Property-Zugriff koerziert), das
//           gültige Sheet/Table rendert normal (30×12, td=420). Kein Alert; kein Typ-Check.
//   Fall 6: kein Throw; `workbookProtection` als []/String wird von
//           `validateWorkbookStructureMutation` (`gridReviewCollaboration.ts:107-109`)
//           per optional chain als „nicht geschützt" gelesen (fail-open). Mount 30×12,
//           keine Meldung; `applyGridStructureEdit` führt die Strukturänderung aus
//           (rows 30→31). Sicherheitsrelevanter Befund; kleiner Guard möglich.
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GridCell,
  GridDocumentModel,
  GridSheetModel,
  GridWorkbookProtectionSettings,
  TableObject,
  WorkspaceDocument,
  WorkspaceObject,
} from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { applyGridStructureEdit } from '../../workbook/gridWorkbookStructure';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.setConfig({ testTimeout: 60_000 });

const CELL_TEXT = 'Astraea-Eintrag-Fehlermodus';

interface MountedGrid {
  readonly container: HTMLElement;
  readonly error: unknown;
  readonly root: Root;
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

async function mount(initialDocument: WorkspaceDocument): Promise<MountedGrid> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
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
    // Ein geworfener Mount hinterlässt eine unbrauchbare Wurzel.
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
  readonly alert: string | null;
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
    alert: container.querySelector('[role="alert"]')?.textContent ?? null,
  };
}

function expectControlledGrid(state: Observation): void {
  expect(state.grid, 'Rasterfläche muss gerendert werden').not.toBeNull();
  expect(state.nameBox?.value, 'A1 muss ausgewählt sein').toBe('A1');
  expect(state.selectedCell, 'eine aktive Zelle muss markiert sein').not.toBeNull();
  expect(state.tdCount, 'es müssen Datenzellen gerendert sein').toBeGreaterThan(0);
}

function baseDocument(overrides: Partial<WorkspaceDocument>): WorkspaceDocument {
  return {
    id: 'grid-malformed-entries',
    title: 'Grid malformed entries',
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

function tableObject(rows: unknown, cols: unknown, cells: unknown): WorkspaceObject {
  return {
    type: 'Table',
    data: { id: 'table-1', rows, cols, cells } as unknown as TableObject,
  };
}

function sheet(id: string, tableObjectId: string): GridSheetModel {
  return { id, name: 'Sheet 1', tableObjectId };
}

function gridDocument(activeSheetId: string | undefined, sheets: unknown[]): GridDocumentModel {
  return {
    sheets: sheets as GridSheetModel[],
    ...(activeSheetId === undefined ? {} : { activeSheetId }),
  };
}

function documentWith(options: {
  readonly id: string;
  readonly objects: Record<string, unknown>;
  readonly sheets: unknown[];
  readonly activeSheetId?: string;
  readonly rootObjectIds?: unknown[];
  readonly workbookProtection?: unknown;
}): WorkspaceDocument {
  return baseDocument({
    id: options.id,
    root_object_ids: (options.rootObjectIds ?? []) as string[],
    objects: options.objects as WorkspaceDocument['objects'],
    gridData: {
      ...gridDocument(options.activeSheetId, options.sheets),
      ...(options.workbookProtection === undefined
        ? {}
        : { workbookProtection: options.workbookProtection as GridWorkbookProtectionSettings }),
    },
  });
}

describe('GR-001 — fehlerhafte Einträge in objects/cells/sheets', () => {
  it('Fall 1: objects-Eintrag ist null, Sheet referenziert ihn', async () => {
    const documentUnderTest = documentWith({
      id: 'entry-null-object',
      objects: { 'grid-table-1': null },
      sheets: [sheet('s1', 'grid-table-1')],
      activeSheetId: 's1',
      rootObjectIds: ['grid-table-1'],
    });
    const mounted = await mount(documentUnderTest);
    const state = observe(mounted.container);

    expect(mounted.error, 'null-Objekt darf den Mount nicht werfen').toBeNull();
    expectControlledGrid(state);
    expect(state.rowCount, 'Init-Default 25 statt fehlendem Table').toBe('25');
    expect(state.colCount, 'Init-Default 10 statt fehlendem Table').toBe('10');
    expect(state.tdCount).toBe(300);
    expect(state.text, 'der Table-Zelltext darf nicht erscheinen').not.toContain(CELL_TEXT);
    expect(state.alert, 'der Fallback wird nicht diagnostiziert').toBeNull();
  });

  it('Fall 2: cells enthalten null-Zelle und leeres Zellobjekt', async () => {
    const documentUnderTest = documentWith({
      id: 'entry-null-cells',
      objects: {
        'table-1': tableObject(30, 12, {
          A1: null,
          B1: {},
          C1: { value: CELL_TEXT },
        } as unknown as Record<string, GridCell>),
      },
      sheets: [sheet('s1', 'table-1')],
      activeSheetId: 's1',
      rootObjectIds: ['table-1'],
    });
    const mounted = await mount(documentUnderTest);
    const state = observe(mounted.container);

    expect(mounted.error, 'null-/leere Zell-Einträge dürfen nicht werfen').toBeNull();
    expectControlledGrid(state);
    expect(state.rowCount).toBe('30');
    expect(state.colCount).toBe('12');
    expect(state.tdCount).toBe(420);
    expect(state.text, 'C1 mit gültigem Wert rendert weiterhin').toContain(CELL_TEXT);
    expect(state.selectedCell?.textContent?.trim(), 'A1 (null) rendert leer').toBe('');
    expect(state.alert, 'kein stiller Zell-Fehler wird gemeldet').toBeNull();
  });

  it('Fall 3 (gehärtet): null-Sheet-Einträge werden gefiltert, das Raster mountet', async () => {
    const documentUnderTest = documentWith({
      id: 'entry-null-sheet',
      objects: { 'table-1': tableObject(30, 12, { A1: { value: CELL_TEXT } }) },
      sheets: [null, sheet('s1', 'table-1')],
      activeSheetId: 's1',
      rootObjectIds: ['table-1'],
    });
    const mounted = await mount(documentUnderTest);
    const state = observe(mounted.container);

    // Runde 24: der null-Eintrag wurde vorher ungefiltert an `useGridWorkbook` weitergereicht
    // und warf `Cannot read properties of null (reading 'id')` — jetzt wird er übersprungen,
    // das gültige Sheet bleibt und das Dokument selbst unverändert.
    expect(mounted.error, 'null-Sheet-Eintrag darf den Mount nicht werfen').toBeNull();
    expectControlledGrid(state);
    expect(state.rowCount).toBe('30');
    expect(state.colCount).toBe('12');
    expect(state.tdCount).toBe(420);
    expect(state.text).toContain(CELL_TEXT);
    expect(state.alert, 'gefiltert ohne Diagnose, das gültige Sheet bleibt').toBeNull();
  });

  it('Fall 4 (gehärtet): rows/cols NaN werden auf 1 geklemmt; Zellen als Nicht-Objekt bleiben leer', async () => {
    const variants = [
      { label: 'rows-null', rows: null, cols: 12, cells: { A1: { value: CELL_TEXT } }, rowCount: '1', colCount: '12', tdCount: 14, textVisible: true },
      { label: 'rows-string', rows: '30', cols: 12, cells: { A1: { value: CELL_TEXT } }, rowCount: '30', colCount: '12', tdCount: 420, textVisible: true },
      // Runde 24: NaN lieferte vorher `aria-rowcount="NaN"` und ein Raster ohne Zellen; jetzt 1.
      { label: 'rows-nan', rows: Number.NaN, cols: 12, cells: { A1: { value: CELL_TEXT } }, rowCount: '1', colCount: '12', tdCount: 14, textVisible: true },
      { label: 'cols-null', rows: 30, cols: null, cells: { A1: { value: CELL_TEXT } }, rowCount: '30', colCount: '1', tdCount: 90, textVisible: true },
      { label: 'cols-string', rows: 30, cols: '12', cells: { A1: { value: CELL_TEXT } }, rowCount: '30', colCount: '12', tdCount: 420, textVisible: true },
      { label: 'cols-nan', rows: 30, cols: Number.NaN, cells: { A1: { value: CELL_TEXT } }, rowCount: '30', colCount: '1', tdCount: 90, textVisible: true },
      { label: 'cells-string', rows: 30, cols: 12, cells: 'kaputt', rowCount: '30', colCount: '12', tdCount: 420, textVisible: false },
      { label: 'cells-array', rows: 30, cols: 12, cells: ['A1', { value: CELL_TEXT }], rowCount: '30', colCount: '12', tdCount: 420, textVisible: false },
    ];
    for (const variant of variants) {
      const documentUnderTest = documentWith({
        id: `entry-table-${variant.label}`,
        objects: { 'table-1': tableObject(variant.rows, variant.cols, variant.cells) },
        sheets: [sheet('s1', 'table-1')],
        activeSheetId: 's1',
        rootObjectIds: ['table-1'],
      });
      const mounted = await mount(documentUnderTest);
      const state = observe(mounted.container);
      expect(mounted.error, `${variant.label}: Mount darf nicht werfen`).toBeNull();
      expect(state.grid, `${variant.label}: Rasterfläche vorhanden`).not.toBeNull();
      expect(state.nameBox?.value, `${variant.label}: Namensfeld A1`).toBe('A1');
      expect(state.rowCount, `${variant.label}: aria-rowcount`).toBe(variant.rowCount);
      expect(state.colCount, `${variant.label}: aria-colcount`).toBe(variant.colCount);
      expect(state.tdCount, `${variant.label}: gerenderte Datenzellen`).toBe(variant.tdCount);
      expect(state.text.includes(CELL_TEXT), `${variant.label}: Zelltext-Sichtbarkeit`).toBe(variant.textVisible);
      expect(state.alert, `${variant.label}: keine Diagnose`).toBeNull();
      await unmount();
    }
  });

  it('Fall 5: root_object_ids enthält null und 42', async () => {
    const documentUnderTest = documentWith({
      id: 'entry-root-ids',
      objects: { 'table-1': tableObject(30, 12, { A1: { value: CELL_TEXT } }) },
      sheets: [sheet('s1', 'table-1')],
      activeSheetId: 's1',
      rootObjectIds: [null, 42],
    });
    const mounted = await mount(documentUnderTest);
    const state = observe(mounted.container);

    expect(mounted.error, 'Nicht-String-IDs dürfen den Mount nicht werfen').toBeNull();
    expectControlledGrid(state);
    expect(state.rowCount).toBe('30');
    expect(state.colCount).toBe('12');
    expect(state.tdCount).toBe(420);
    expect(state.text).toContain(CELL_TEXT);
    expect(state.alert, 'die Nicht-String-IDs werden still ignoriert').toBeNull();
  });

  it('Fall 6: workbookProtection ist [] bzw. String statt Objekt', async () => {
    for (const protection of [[], 'protected']) {
      const documentUnderTest = documentWith({
        id: `entry-protection-${Array.isArray(protection) ? 'array' : 'string'}`,
        objects: { 'table-1': tableObject(30, 12, { A1: { value: CELL_TEXT } }) },
        sheets: [sheet('s1', 'table-1')],
        activeSheetId: 's1',
        rootObjectIds: ['table-1'],
        workbookProtection: protection,
      });
      const mounted = await mount(documentUnderTest);
      const state = observe(mounted.container);
      let structureError: unknown = null;
      let structureRows: number | null = null;
      try {
        const updated = applyGridStructureEdit(documentUnderTest, 's1', { kind: 'insert-row', index: 0, count: 1 });
        structureRows = ((updated.objects['table-1']?.data as TableObject).rows as number);
      } catch (reason) {
        structureError = reason;
      }

      expect(mounted.error, `${typeof protection}: Mount darf nicht werfen`).toBeNull();
      expectControlledGrid(state);
      expect(state.tdCount).toBe(420);
      expect(state.alert, `${typeof protection}: keine Schutz-Diagnose`).toBeNull();
      expect(structureError, `${typeof protection}: Struktur-Edit wirft nicht`).toBeNull();
      expect(structureRows, `${typeof protection}: fail-open, Strukturänderung wird ausgeführt`).toBe(31);
      await unmount();
    }
  });
});
