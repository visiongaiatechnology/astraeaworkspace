// STATUS: PLATIN — Wächter für AST-0391: der sichtbare Spaltenkopf-AutoFilter-EINSTIEG im gerenderten Raster.
//
// Warum dieser Zeuge anders misst als die Vorarbeit:
//
// `data/gridAutoFilter.ts` ist das **Datenmodell** („backt" den Dropdown) und war von genau einer
// Produktionsdatei importiert: `filters/GridSlicerModal.tsx` — einem **Modal**, also einem *anderen Ort*.
// Ein Modell ist kein Einstieg, ein Handler ist kein Einstieg, ein Import ist kein Einstieg.
// **Ein Element im gerenderten Markup ist ein Einstieg.**
//
// Deshalb hat diese Datei **zwei** Zeugenarten, und beide sind nötig:
//
//   A) MARKUP-ZEUGE   — rendert und prüft gerenderte Elemente (`data-*`, `aria-*`, `role`). Belegt: das
//                       Element EXISTIERT. Und er prüft **Wirkung, nicht Anwesenheit**: derselbe Zeuge
//                       rendert zweimal mit unterschiedlicher Datenlage und verlangt, dass sich das Markup
//                       unterscheidet. Ein Zeuge, der nur Anwesenheit prüft, ist wertlos — er bleibt grün,
//                       wenn man die Wirkung per Mutation entfernt.
//
//   B) HANDLER-ZEUGE  — fährt die reinen Steuerfunktionen aus `filters/gridAutoFilterControl.ts`, die die
//                       gerenderten Elemente aufrufen. Belegt: das Element BEWIRKT etwas.
//
// Was NICHT belegt ist: die echte Bedienung. `ui/` hat kein jsdom, kein happy-dom und kein
// `@testing-library`, und `renderToStaticMarkup` rendert nie neu und löst kein Ereignis aus. Klick, Tastatur
// und Fokus sind `NOT_TESTED` und werden hier auch nicht behauptet.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GridCell, GridFilterRule, GridSheetModel, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridTableCanvas } from '../../canvas/GridTableCanvas';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';
import {
  MAX_AUTOFILTER_SELECTION,
  type AutoFilterValueSet,
} from '../../data/gridAutoFilter';
import {
  buildAutoFilterMenu,
  hasAutoFilterRule,
  resetAutoFilterColumnAction,
  searchAutoFilterOptions,
  selectAllAutoFilterOptionsAction,
  toggleAutoFilterOptionAction,
} from '../../filters/gridAutoFilterControl';

// Ein Zellwert, den kein Klassenname, keine Kennung und kein Etikett enthält: `toContain` kann damit
// ausschließlich gerenderten Zellinhalt treffen.
const CELL_TEXT = 'Astraea-AutoFilter-9c41';

const SHEET: GridSheetModel = {
  id: 'sheet-autofilter-witness',
  name: 'Sheet 1',
  tableObjectId: 'tbl-autofilter-witness',
  freezeRows: 0,
  freezeCols: 0,
  showGridlines: true,
  zoom: 100,
};

/** Spalte A mit drei verschiedenen Werten, einer davon doppelt — die kleinste Datenlage mit Anzahl > 1. */
const CELLS: Record<string, GridCell> = {
  A1: { value: 'Region' },
  A2: { value: 'Nord' },
  A3: { value: 'Süd' },
  A4: { value: 'Nord' },
  A5: { value: 'Ost' },
  B2: { value: CELL_TEXT },
};

const COL_COUNT = 4;
// Header row 0 + exactly four data rows A2..A5. Deliberately no empty data row here: the three distinct
// values are the smallest data set that fills the checklist. The blank label is exercised in its own test.
const ROW_COUNT = 5;
const BLANKS = '(Leer)';

function renderCanvas(overrides: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(GridTableCanvas, {
      sheet: SHEET,
      cells: CELLS,
      colCount: COL_COUNT,
      rowCount: ROW_COUNT,
      visibleRowIndices: Array.from({ length: ROW_COUNT }, (_, index) => index),
      selectedCell: 'A1',
      selectedRange: 'A1',
      selectedRanges: ['A1'],
      isEditing: false,
      formulaInput: '',
      dragOverCoord: null,
      inlineInputRef: { current: null },
      invalidCoords: new Set<string>(),
      isCirclingInvalid: false,
      onChangeFormulaInput: vi.fn(),
      onCellClick: vi.fn(),
      onCellDoubleClick: vi.fn(),
      onCellMouseDown: vi.fn(),
      onCellMouseEnter: vi.fn(),
      onDragStartCell: vi.fn(),
      onDragOverCell: vi.fn(),
      onDropCell: vi.fn(),
      onSelectColumn: vi.fn(),
      onSelectRow: vi.fn(),
      onSelectAll: vi.fn(),
      onResizeTable: vi.fn(),
      // Der Einstieg lebt vom Schreibpfad: ohne ihn wäre der Knopf eine Scheinfunktion.
      filterRules: [],
      onUpdateFilters: vi.fn(),
      ...overrides,
    } as never),
  );
}

/** Nur der Kopfbereich des gerenderten Rasters — der Einstieg muss im **Spaltenkopf** liegen, nicht irgendwo. */
function headerSlice(html: string): string {
  const start = html.indexOf('<thead');
  const end = html.indexOf('</thead>');
  return start >= 0 && end > start ? html.slice(start, end) : '';
}

/** Der Dokumentweg, den die Anwendung selbst schreibt — kein von Hand erfundenes Dokument. */
function populatedDocument(rules: readonly GridFilterRule[] = []): WorkspaceDocument {
  const base: WorkspaceDocument = {
    id: 'grid-autofilter-witness',
    title: 'Grid AutoFilter witness',
    kind: 'Grid',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  };
  const seeded = addSheetToDocument(base, [], 'Sheet 1', { cells: CELLS }).updatedDocument;
  const sheets = seeded.gridData?.sheets ?? [];
  return {
    ...seeded,
    gridData: {
      ...(seeded.gridData ?? { sheets }),
      sheets: sheets.map((sheet, index) => (index === 0 ? { ...sheet, filters: [...rules] } : sheet)),
    },
  };
}

function renderSheet(rules: readonly GridFilterRule[] = []): string {
  return renderToStaticMarkup(
    createElement(GridSheet, {
      document: populatedDocument(rules),
      onUpdateDocument: vi.fn(),
      onSelectSelectionType: vi.fn(),
      onCreateChart: vi.fn(),
      networkCapability: 'offline' as never,
      keyVaultUnlocked: false,
      workspaceDocuments: {},
    } as never),
  );
}

const RULE_NORD: GridFilterRule = { id: 'witness-1', column: 'A', operator: 'not-equals', value: 'Nord' };
const RULE_CONTAINS: GridFilterRule = { id: 'witness-2', column: 'A', operator: 'contains', value: 'or' };
const RULE_OTHER_COLUMN: GridFilterRule = { id: 'witness-3', column: 'B', operator: 'equals', value: 'x' };

// ---------------------------------------------------------------------------------------------------
// A) MARKUP-ZEUGE — das Element EXISTIERT, und sein Markup hängt an der Datenlage (Wirkung, nicht Anwesenheit)
// ---------------------------------------------------------------------------------------------------

describe('AST-0391/A — der Spaltenkopf trägt einen sichtbaren AutoFilter-Einstieg', () => {
  it('rendert den Einstieg im gerenderten Markup, nicht nur im Modell', () => {
    const html = renderCanvas();
    const header = headerSlice(html);
    // Positivbeweis: der Kopf wurde überhaupt gefunden und trägt die Spaltenbuchstaben.
    expect(header, 'kein <thead> im Markup').not.toBe('');
    expect(header, 'Spaltenkopf A fehlt').toContain('>A<');
    // Der eigentliche Gegenstand: ein **gerendertes Element**, kein Bezeichner.
    expect(html, 'kein sichtbarer AutoFilter-Einstieg im Spaltenkopf').toContain('data-vgt-grid-autofilter-trigger="A"');
  });

  it('gibt dem Einstieg eine Bediensemantik, die Hilfstechnik erreicht', () => {
    const header = headerSlice(renderCanvas());
    expect(header).toContain('aria-haspopup="listbox"');
    expect(header).toContain('role="button"');
    expect(header).toMatch(/aria-label="[^"]*A[^"]*"/u);
    expect(header).toContain('aria-expanded="false"');
  });

  it('rendert im geschlossenen Zustand kein Bedienfeld', () => {
    const html = renderCanvas();
    expect(html).toContain('data-vgt-grid-autofilter-trigger="A"');
    expect(html, 'Bedienfeld ist ohne Öffnen gerendert').not.toContain('data-vgt-grid-autofilter-panel');
    expect(html, 'Liste ist ohne Öffnen gerendert').not.toContain('data-vgt-grid-autofilter-option');
  });

  it('gibt jeder sichtbaren Spalte einen eigenen Einstieg — nicht nur der ersten', () => {
    const html = renderCanvas();
    for (const letter of ['A', 'B', 'C', 'D']) {
      expect(html, `Einstieg für Spalte ${letter} fehlt`).toContain(`data-vgt-grid-autofilter-trigger="${letter}"`);
    }
    expect(html).not.toContain('data-vgt-grid-autofilter-trigger="E"');
  });

  // WIRKUNG STATT ANWESENHEIT: derselbe Zeuge rendert zweimal. Nur die Datenlage ändert sich, und das
  // Markup muss sich mit ihr ändern. Eine Mutation, die die Regel nicht mehr bis in den Kopf trägt,
  // macht genau diese Zusicherung rot — die reine Anwesenheitsprüfung oben bliebe grün.
  it('markiert nur die Spalte als gefiltert, die wirklich eine Regel trägt', () => {
    const ohne = renderCanvas();
    const mit = renderCanvas({ filterRules: [RULE_NORD] });
    expect(ohne, 'ohne Regel als gefiltert markiert').not.toContain('data-vgt-grid-autofilter-active="true"');
    expect(mit, 'Regel erreicht den Kopf nicht').toContain('data-vgt-grid-autofilter-active="true"');
    expect(mit.match(/data-vgt-grid-autofilter-active="true"/gu) ?? []).toHaveLength(1);
    // Und die markierte Spalte ist A, nicht irgendeine.
    const activeColumn = /data-vgt-grid-autofilter-trigger="([A-Z]+)"[^>]*data-vgt-grid-autofilter-active="true"/u.exec(mit);
    expect(activeColumn?.[1], 'falsche Spalte markiert').toBe('A');
  });

  it('schaltet den Einstieg sichtbar ab, wenn der Blattschutz das Filtern verbietet', () => {
    const frei = renderCanvas();
    const gesperrt = renderCanvas({ sheet: { ...SHEET, protection: { isProtected: true, allowFilter: false } } });
    expect(frei).not.toContain('disabled=""');
    expect(gesperrt, 'Einstieg trotz Filterverbot bedienbar').toContain('disabled=""');
  });

  it('verkabelt den Einstieg bis in das echte Blatt (GridSheet → Viewport → Canvas)', () => {
    // Ohne diesen Test könnte der Einstieg in einer Komponente leben, die niemand mountet.
    const html = renderSheet();
    expect(html, 'Raster nicht gerendert').toContain('role="grid"');
    // CELL_TEXT steht in keiner Klasse, Kennung oder Beschriftung: der Treffer kann nur gerenderter Zellinhalt sein.
    expect(html, 'Zellinhalt nicht gerendert').toContain(CELL_TEXT);
    expect(html, 'Einstieg fehlt im echten Blatt').toContain('data-vgt-grid-autofilter-trigger="A"');
    // Und die gespeicherte Regel des Dokuments kommt im Kopf an — die Kette trägt Daten, nicht nur Markup.
    expect(renderSheet(), 'ohne Regel als gefiltert markiert').not.toContain('data-vgt-grid-autofilter-active="true"');
    expect(renderSheet([RULE_NORD]), 'gespeicherte Regel erreicht den Kopf nicht').toContain('data-vgt-grid-autofilter-active="true"');
  });
});

// ---------------------------------------------------------------------------------------------------
// B) HANDLER-ZEUGE — das Element BEWIRKT etwas
// ---------------------------------------------------------------------------------------------------

function menue(rules: readonly GridFilterRule[] = [], cells: Record<string, GridCell> = CELLS, rowCount = ROW_COUNT) {
  const result = buildAutoFilterMenu({ cells, rowCount, column: 'A', rules, blankLabel: BLANKS });
  if (!result.ok) throw new Error(`Menue nicht baubar: ${result.code}`);
  return result.menu;
}

describe('AST-0391/B — der Einstieg bewirkt eine Änderung der Filterregeln', () => {
  it('leitet den Zustand aus den Regeln ab: keine Regel heißt „alles angehakt"', () => {
    const menu = menue();
    expect(menu.checked.slice().sort()).toEqual(['Nord', 'Ost', 'Süd']);
    expect(menu.hasFilter).toBe(false);
    expect(menu.foreignRuleCount).toBe(0);
    // Die Anzahl je Wert kommt aus dem Modell, nicht aus einer zweiten Zählung.
    expect(menu.valueSet.values.find((entry) => entry.value === 'Nord')?.count).toBe(2);
    expect(menu.valueSet.scannedRows).toBe(ROW_COUNT - 1);
  });

  it('erzeugt beim Abwählen genau eine Regel und liest sie exakt zurück', () => {
    const menu = menue();
    const action = toggleAutoFilterOptionAction(menu, 'Nord', []);
    expect(action.ok).toBe(true);
    if (!action.ok) return;
    expect(action.rules).toEqual([
      { id: 'autofilter-A:0', column: 'A', operator: 'not-equals', value: 'Nord' },
    ]);
    expect(action.menu.checked.slice().sort()).toEqual(['Ost', 'Süd']);
    expect(action.menu.hasFilter).toBe(true);

    // Rückrichtung: die geschriebenen Regeln ergeben wieder denselben Haken-Zustand.
    const wieder = menue(action.rules);
    expect(wieder.checked.slice().sort()).toEqual(['Ost', 'Süd']);
    expect(wieder.foreignRuleCount).toBe(0);
  });

  it('fällt bei genau einem angehakten Wert auf die exakte Gleichheit zurück', () => {
    const zwei = menue([RULE_NORD]);
    expect(zwei.checked.slice().sort()).toEqual(['Ost', 'Süd']);
    const action = toggleAutoFilterOptionAction(zwei, 'Süd', [RULE_NORD]);
    expect(action.ok).toBe(true);
    if (!action.ok) return;
    expect(action.rules).toEqual([{ id: 'autofilter-A', column: 'A', operator: 'equals', value: 'Ost' }]);
    expect(menue(action.rules).checked).toEqual(['Ost']);
  });

  it('weigert sich, die Auswahl zu leeren — und sagt es, statt still den Filter zu entfernen', () => {
    const eins = menue([{ id: 'autofilter-A', column: 'A', operator: 'equals', value: 'Ost' }]);
    expect(eins.checked).toEqual(['Ost']);
    const action = toggleAutoFilterOptionAction(eins, 'Ost', [{ id: 'autofilter-A', column: 'A', operator: 'equals', value: 'Ost' }]);
    // Ohne diese Weigerung würde „letzten Haken entfernen" die Spalte entsperren, obwohl der Nutzer
    // glaubt, gerade alle Zeilen auszublenden — das Modell kann „nichts angehakt" nicht ausdrücken.
    expect(action).toEqual({ ok: false, reason: 'selection-would-be-empty' });
  });

  it('stellt „Alle auswählen" als regel freien Zustand her, nicht als 256 Gleichheitsregeln', () => {
    const gefiltert = menue([RULE_NORD]);
    const action = selectAllAutoFilterOptionsAction(gefiltert, [RULE_NORD]);
    expect(action.ok).toBe(true);
    if (!action.ok) return;
    expect(action.rules).toEqual([]);
    expect(action.menu.hasFilter).toBe(false);
    expect(action.menu.checked.slice().sort()).toEqual(['Nord', 'Ost', 'Süd']);
  });

  it('entfernt beim Zurücksetzen genau die Regeln dieser Spalte, auch nicht darstellbare', () => {
    const fremd = menue([RULE_CONTAINS, RULE_OTHER_COLUMN]);
    // Eine `contains`-Regel ist für die Hakenliste nicht darstellbar: sie zeigt „alles angehakt", obwohl
    // Zeilen ausgeblendet werden. Das wird berichtet, nicht verschwiegen.
    expect(fremd.foreignRuleCount).toBe(1);
    expect(fremd.hasFilter).toBe(true);
    expect(fremd.checked.slice().sort()).toEqual(['Nord', 'Ost', 'Süd']);

    const action = resetAutoFilterColumnAction(fremd, [RULE_CONTAINS, RULE_OTHER_COLUMN]);
    expect(action.ok).toBe(true);
    if (!action.ok) return;
    expect(action.rules).toEqual([RULE_OTHER_COLUMN]);
    expect(action.menu.hasFilter).toBe(false);
  });

  it('sucht in der begrenzten Werteliste und meldet, wie viele Werte dabei verschwinden', () => {
    const menu = menue();
    expect(searchAutoFilterOptions(menu, 'no').shown.map((entry) => entry.value)).toEqual(['Nord']);
    expect(searchAutoFilterOptions(menu, 'no').hidden).toBe(2);
    expect(searchAutoFilterOptions(menu, '  ').shown).toHaveLength(3);
    expect(searchAutoFilterOptions(menu, 'gibtesnicht').shown).toHaveLength(0);
  });

  it('erbt die Obergrenze des Modells, statt sie zu umgehen', () => {
    const viele: Record<string, GridCell> = { A1: { value: 'Region' } };
    const rows = MAX_AUTOFILTER_SELECTION + 4;
    for (let row = 1; row <= rows; row += 1) viele[`A${row + 1}`] = { value: `v${row}` };
    const menu = menue([], viele, rows + 1);
    expect(menu.valueSet.values).toHaveLength(rows);
    const action = selectAllAutoFilterOptionsAction(menu, []);
    expect(action).toEqual({ ok: false, reason: 'selection-too-large' });
  });

  it('erkennt eine Regel als „vorhanden", ohne die Zellwerte zu lesen (billiger Auslöser-Zustand)', () => {
    expect(hasAutoFilterRule([], 'A')).toBe(false);
    expect(hasAutoFilterRule([RULE_NORD], 'A')).toBe(true);
    expect(hasAutoFilterRule([RULE_NORD], 'a')).toBe(true);
    expect(hasAutoFilterRule([RULE_OTHER_COLUMN], 'A')).toBe(false);
  });

  it('meldet ein leeres Blatt als leere Werteliste statt als erfundenen Wert', () => {
    const result = buildAutoFilterMenu({ cells: {}, rowCount: 1, column: 'A', rules: [], blankLabel: BLANKS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.menu.valueSet.values).toHaveLength(0);
    expect(result.menu.checked).toHaveLength(0);
  });

  it('weist eine ungültige Spaltenkennung ab, statt einen leeren Einstieg zu behaupten', () => {
    const result = buildAutoFilterMenu({ cells: CELLS, rowCount: ROW_COUNT, column: '1A', rules: [], blankLabel: BLANKS });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('autofilter_invalid_column');
  });

  it('benennt leere Zellen mit dem übergebenen, übersetzten Etikett', () => {
    const mitLeerzelle: Record<string, GridCell> = { ...CELLS, A6: { value: '' } };
    const menu = menue([], mitLeerzelle, ROW_COUNT + 1);
    expect(menu.valueSet.values.map((entry) => entry.value)).toContain(BLANKS);
    const nurLeer: AutoFilterValueSet = menu.valueSet;
    expect(nurLeer.selected.length).toBeGreaterThan(0);
  });
});
