// STATUS: PLATIN
import { describe, expect, it } from 'vitest';
import { GRID_IMPORT_MAX_CELL_CHARS, GRID_IMPORT_MAX_CELLS } from '../../interchange/gridXlsxOdsRoundtrip';
import { prepareScenarioCellUpdate } from '../../what-if/gridScenarios';
import type { GridScenario } from '../../../../shared/contracts/grid/workspaceGrid';

const createScenario = (values: Record<string, string | number>, sheetId = 'sheet-1'): GridScenario => ({
  id: 'scenario-1',
  name: 'Scenario 1',
  sheetId,
  changingCells: Object.keys(values),
  values,
});

describe('Grid scenario mutation input boundaries', () => {
  it('prepares bounded canonical edits and removes the previous formula', () => {
    const cells = { A1: { value: 5, formula: '=B1', bold: true }, B1: { value: 7 } };
    const scenario = createScenario({ A1: '12', B1: 'literal' });

    const prepared = prepareScenarioCellUpdate(scenario, cells, 'sheet-1');

    expect(prepared.editCoords).toEqual(['A1', 'B1']);
    expect(prepared.updatedCells.A1).toEqual({ value: 12, bold: true });
    expect(prepared.updatedCells.B1).toEqual({ value: 'literal' });
    expect(cells.A1).toEqual({ value: 5, formula: '=B1', bold: true });
  });

  it('rejects foreign-sheet and malformed or out-of-range coordinates', () => {
    expect(() => prepareScenarioCellUpdate(createScenario({ A1: 1 }, 'sheet-2'), {}, 'sheet-1'))
      .toThrow('grid_scenario_sheet_mismatch');
    for (const coord of ['a1', '__proto__', 'A0', 'IW1', 'A50001']) {
      expect(() => prepareScenarioCellUpdate(createScenario({ [coord]: 1 }), {}, 'sheet-1'))
        .toThrow();
    }
  });

  it('rejects invalid values, oversized text, and excessive mutation counts', () => {
    expect(() => prepareScenarioCellUpdate(createScenario({ A1: Number.POSITIVE_INFINITY }), {}, 'sheet-1'))
      .toThrow('grid_scenario_value_limit');
    expect(() => prepareScenarioCellUpdate(createScenario({ A1: 'x'.repeat(GRID_IMPORT_MAX_CELL_CHARS + 1) }), {}, 'sheet-1'))
      .toThrow('grid_scenario_value_limit');

    const tooManyValues = Object.fromEntries(Array.from({ length: GRID_IMPORT_MAX_CELLS + 1 }, (_, index) => [
      `${String.fromCharCode(65 + (index % 26))}${Math.floor(index / 26) + 1}`,
      index,
    ]));
    expect(() => prepareScenarioCellUpdate(createScenario(tooManyValues), {}, 'sheet-1'))
      .toThrow('grid_scenario_cell_count_limit');
  });

  it('rejects non-plain value dictionaries', () => {
    const scenario = createScenario({ A1: 1 });
    Object.setPrototypeOf(scenario.values, []);

    expect(() => prepareScenarioCellUpdate(scenario, {}, 'sheet-1'))
      .toThrow('grid_scenario_values_invalid');
  });
});
