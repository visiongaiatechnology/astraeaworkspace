// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Scenario Manager Engine
// Scenario Storage, Application, and Summary Generation

import { GridCell, GridScenario, GridSheetModel } from '../../../shared/contracts/grid/workspaceGrid';
import { evaluateFormula, parseA1, toA1 } from '../formulas/formula';
import { GRID_IMPORT_MAX_CELL_CHARS, GRID_IMPORT_MAX_CELLS, GRID_IMPORT_MAX_COLUMNS, GRID_IMPORT_MAX_ROWS } from '../interchange/gridXlsxOdsRoundtrip';

export interface ScenarioSummaryRow {
  label: string;
  coord: string;
  isResult: boolean;
  values: Record<string, string | number>; // scenarioId -> value
}

export interface ScenarioSummaryTable {
  scenarios: { id: string; name: string }[];
  changingRows: ScenarioSummaryRow[];
  resultRows: ScenarioSummaryRow[];
}

export interface ScenarioCellUpdate {
  updatedCells: Record<string, GridCell>;
  editCoords: string[];
}

export function prepareScenarioCellUpdate(
  scenario: GridScenario,
  cells: Record<string, GridCell>,
  activeSheetId?: string,
): ScenarioCellUpdate {
  if (!scenario || typeof scenario !== 'object' || !scenario.values || typeof scenario.values !== 'object' || Array.isArray(scenario.values)) {
    throw new Error('grid_scenario_shape_invalid');
  }
  if (scenario.sheetId !== undefined && scenario.sheetId !== activeSheetId) {
    throw new Error('grid_scenario_sheet_mismatch');
  }
  const valuesPrototype = Object.getPrototypeOf(scenario.values);
  if (valuesPrototype !== Object.prototype && valuesPrototype !== null) {
    throw new Error('grid_scenario_values_invalid');
  }

  const changes: Array<{ coord: string; value: string | number }> = [];
  for (const coord in scenario.values) {
    if (!Object.prototype.hasOwnProperty.call(scenario.values, coord)) continue;
    if (changes.length >= GRID_IMPORT_MAX_CELLS) throw new Error('grid_scenario_cell_count_limit');
    if (coord.length > 9 || !/^[A-Z]{1,3}[1-9]\d{0,5}$/u.test(coord)) {
      throw new Error('grid_scenario_coordinate_invalid');
    }
    const point = parseA1(coord);
    if (!point || point.row >= GRID_IMPORT_MAX_ROWS || point.col >= GRID_IMPORT_MAX_COLUMNS) {
      throw new Error('grid_scenario_coordinate_limit');
    }
    const value: unknown = scenario.values[coord];
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error('grid_scenario_value_invalid');
    }
    if ((typeof value === 'string' && value.length > GRID_IMPORT_MAX_CELL_CHARS)
      || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error('grid_scenario_value_limit');
    }
    changes.push({ coord, value });
  }

  const updated = { ...cells };
  for (const { coord, value } of changes) {
    const existing = updated[coord] || { value: '' };
    const str = String(value).trim();
    const num = Number(value);
    const parsedVal = Number.isFinite(num) && str !== '' ? num : value;
    updated[coord] = {
      ...existing,
      value: parsedVal,
    };
    delete updated[coord].formula; // values override formulas in changing cells
  }
  return { updatedCells: updated, editCoords: changes.map(({ coord }) => coord) };
}

export function applyScenarioToCells(
  scenario: GridScenario,
  cells: Record<string, GridCell>,
): Record<string, GridCell> {
  return prepareScenarioCellUpdate(scenario, cells).updatedCells;
}

export async function generateScenarioSummary(
  scenarios: GridScenario[],
  resultCoords: string[],
  baseCells: Record<string, GridCell>
): Promise<ScenarioSummaryTable> {
  const changingSet = new Set<string>();
  for (const sc of scenarios) {
    for (const c of sc.changingCells) {
      changingSet.add(c.toUpperCase());
    }
  }

  const changingRows: ScenarioSummaryRow[] = Array.from(changingSet).map((coord) => {
    const values: Record<string, string | number> = {};
    for (const sc of scenarios) {
      values[sc.id] = sc.values[coord] ?? baseCells[coord]?.value ?? '-';
    }
    return {
      label: `Veränderbare Zelle ${coord}`,
      coord,
      isResult: false,
      values,
    };
  });

  const resultRows: ScenarioSummaryRow[] = [];
  for (const coord of resultCoords) {
    const normCoord = coord.toUpperCase();
    const values: Record<string, string | number> = {};

    for (const scenario of scenarios) {
      const workingCells = applyScenarioToCells(scenario, baseCells);
      const formula = baseCells[normCoord]?.formula;
      if (formula) {
        const evalRes = await evaluateFormula(formula, workingCells, { volatilePolicy: 'disabled' });
        values[scenario.id] = typeof evalRes === 'number' || typeof evalRes === 'string' ? evalRes : String(evalRes);
      } else {
        const value = workingCells[normCoord]?.value;
        values[scenario.id] = typeof value === 'number' || typeof value === 'string' ? value : String(value ?? '-');
      }
    }

    resultRows.push({
      label: `Ergebniszelle ${normCoord}`,
      coord: normCoord,
      isResult: true,
      values,
    });
  }

  return {
    scenarios: scenarios.map((s) => ({ id: s.id, name: s.name })),
    changingRows,
    resultRows,
  };
}

/**
 * Creates a new GridSheetModel populated with the Scenario Summary table!
 */
export function createScenarioSummarySheet(
  summary: ScenarioSummaryTable,
  sheetCount: number
): { sheet: GridSheetModel; cells: Record<string, GridCell> } {
  const sheetId = `sheet-scenario-summary-${Date.now()}`;
  const sheetName = `Szenario-Bericht ${sheetCount}`;
  const cells: Record<string, GridCell> = {};

  // Title
  cells['A1'] = { value: 'Szenario-Zusammenfassung (Scenario Summary Report)', bold: true, fontSize: 13 };
  cells['A2'] = { value: `Erstellt am ${new Date().toLocaleDateString('de-DE')}`, italic: true, text_color: '#94a3b8' };

  // Headers: Col A = Name/Coord, Col B.. = Scenarios
  cells['A4'] = { value: 'Zelle / Parameter', bold: true, background: '#1e293b' };
  summary.scenarios.forEach((sc, idx) => {
    const coord = toA1(idx + 1, 3);
    cells[coord] = { value: sc.name, bold: true, background: '#1e293b' };
  });

  let currentRow = 4;

  // Section: Changing cells
  cells[toA1(0, currentRow)] = { value: 'Veränderbare Zellen:', bold: true, text_color: '#38bdf8' };
  currentRow++;

  for (const row of summary.changingRows) {
    cells[toA1(0, currentRow)] = { value: row.coord, text_color: '#cbd5e1' };
    summary.scenarios.forEach((sc, idx) => {
      cells[toA1(idx + 1, currentRow)] = { value: row.values[sc.id] };
    });
    currentRow++;
  }

  // Section: Result cells
  currentRow++;
  cells[toA1(0, currentRow)] = { value: 'Ergebniszellen:', bold: true, text_color: '#34d399' };
  currentRow++;

  for (const row of summary.resultRows) {
    cells[toA1(0, currentRow)] = { value: row.coord, text_color: '#cbd5e1', bold: true };
    summary.scenarios.forEach((sc, idx) => {
      cells[toA1(idx + 1, currentRow)] = { value: row.values[sc.id], bold: true };
    });
    currentRow++;
  }

  const sheet: GridSheetModel = {
    id: sheetId,
    name: sheetName,
    tableObjectId: `table-${sheetId}`,
    tabColor: '#38bdf8',
    colWidths: { 0: 180, 1: 130, 2: 130, 3: 130 },
  };

  return { sheet, cells };
}
