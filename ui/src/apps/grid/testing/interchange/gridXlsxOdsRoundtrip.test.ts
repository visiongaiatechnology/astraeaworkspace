// STATUS: PLATIN
import { describe, expect, it } from 'vitest';
import type { GridQueryDefinition, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { importGridCells, type GridCellImportControllerDependencies } from '../../state/useGridCellImportController';
import {
  exportCellsToCsv,
  GRID_IMPORT_MAX_BYTES,
  GRID_IMPORT_MAX_CELLS,
  GRID_IMPORT_MAX_TABLE_CELLS,
  importCsvTsv,
  importSpreadsheetDocument,
} from '../../interchange/gridXlsxOdsRoundtrip';

describe('Grid spreadsheet import boundaries and coordinates', () => {
  it('maps and exports columns beyond Z using canonical A1 coordinates', () => {
    const imported = importCsvTsv(Array.from({ length: 28 }, (_, index) => `v${index}`).join(','));
    expect(imported.cells.Z1).toBe('v25');
    expect(imported.cells.AA1).toBe('v26');
    expect(imported.cells.AB1).toBe('v27');

    const roundtrip = importCsvTsv(exportCellsToCsv({ Z1: 'z', AA1: 'aa', AB1: 'ab' }, 1, 28));
    expect(roundtrip.cells).toMatchObject({ Z1: 'z', AA1: 'aa', AB1: 'ab' });
  });

  it('preserves quoted delimiters and embedded line breaks', () => {
    const imported = importCsvTsv('A,"North, West"\r\nB,"Second\nline"');
    expect(imported.cells).toMatchObject({ A1: 'A', B1: 'North, West', A2: 'B', B2: 'Second\nline' });
  });

  it('rejects imports over the UTF-8 byte budget and the sheet cell budget', () => {
    expect(() => importCsvTsv('x'.repeat(GRID_IMPORT_MAX_BYTES + 1))).toThrow('grid_import_byte_limit');
    const maxWidthRow = Array.from({ length: 256 }, () => 'x').join(',');
    expect(() => importCsvTsv(Array.from({ length: Math.floor(GRID_IMPORT_MAX_TABLE_CELLS / 256) + 1 }, () => maxWidthRow).join('\n')))
      .toThrow('grid_import_table_cell_limit');
  });

  it('keeps the cell-dictionary budget separate from the sheet budget', () => {
    // JSON cell dictionaries stay at the small, history-safe budget.
    const dictionary = Object.fromEntries(Array.from({ length: GRID_IMPORT_MAX_CELLS + 1 }, (_, index) => [
      `${String.fromCharCode(65 + (index % 26))}${Math.floor(index / 26) + 1}`,
      index,
    ]));
    expect(() => importSpreadsheetDocument(JSON.stringify(dictionary), 'sheet.json', 'json'))
      .toThrow('grid_import_cell_count_limit');
  });

  it('rejects JSON null, nested values, malformed coordinates, and out-of-range cells', () => {
    for (const invalid of ['null', '[]', '{"A1":{"nested":true}}', '{"__proto__":"x"}', '{"XFC1":"outside"}']) {
      expect(() => importSpreadsheetDocument(invalid, 'sheet.json', 'json')).toThrow();
    }
    expect(() => importSpreadsheetDocument('{broken', 'sheet.json', 'json')).toThrow();
  });

  it('normalizes valid JSON cell keys and primitive values into a safe dictionary', () => {
    const imported = importSpreadsheetDocument('{"a1":"label","AA1":27,"AB2":true}', 'sheet.json', 'json');
    expect(imported.cells).toMatchObject({ A1: 'label', AA1: '27', AB2: 'true' });
    expect(Object.getPrototypeOf(imported.cells)).toBeNull();
  });

  it('validates, calculates, and persists an imported workbook batch with its query metadata once', async () => {
    const query: GridQueryDefinition = {
      id: 'query-current',
      name: 'Current query',
      source: { kind: 'csv', label: 'Import' },
      steps: [],
      schema: [],
      schemaDriftPolicy: 'strict',
      lineage: [],
      errorRows: [],
      offlineCache: { mode: 'none' },
    };
    const harness = createImportHarness({
      evaluateFormula: async (formula) => formula === '=SUM(1,2)' ? 3 : '#VALUE!',
    });

    await expect(importGridCells(harness.dependencies, { B2: 'literal', a1: '=SUM(1,2)' }, query)).resolves.toBe(true);

    expect(harness.commits).toHaveLength(1);
    expect(harness.commits[0]?.coordinates).toEqual(['A1', 'B2']);
    expect(harness.commits[0]?.cells).toMatchObject({ A1: { formula: '=SUM(1,2)', value: 3 }, B2: { value: 'literal' } });
    expect(harness.commits[0]?.gridDataPatch?.queries).toEqual([query]);
    expect(harness.errorMessages).toEqual([null]);
  });

  it('does not commit denied or malformed batches and returns only the generic failure for evaluation errors', async () => {
    const denied = createImportHarness({ canEditCoordinates: () => false });
    await expect(importGridCells(denied.dependencies, { A1: 'blocked' })).resolves.toBe(false);
    expect(denied.commits).toHaveLength(0);

    const malformed = createImportHarness();
    await expect(importGridCells(malformed.dependencies, { XFC1: 'out of range' })).rejects.toThrow('grid_import_coordinate_limit');
    expect(malformed.commits).toHaveLength(0);

    const failedEvaluation = createImportHarness({ evaluateFormula: async () => { throw new Error('private engine detail'); } });
    await expect(importGridCells(failedEvaluation.dependencies, { A1: '=1+1' })).resolves.toBe(false);
    expect(failedEvaluation.commits).toHaveLength(0);
    expect(failedEvaluation.errorMessages).toEqual(['Der Tabellenimport konnte nicht sicher angewendet werden.']);
  });
});

function createImportHarness(overrides: Partial<GridCellImportControllerDependencies> = {}) {
  const errorMessages: (string | null)[] = [];
  const commits: Array<{
    cells: Parameters<GridCellImportControllerDependencies['persistCellChanges']>[0];
    coordinates: readonly string[];
    gridDataPatch: Parameters<GridCellImportControllerDependencies['persistCellChanges']>[3];
  }> = [];
  const document = {
    version: 1,
    modified_at: 0,
    objects: {},
    gridData: { sheets: [], queries: [], namedRanges: [], calculationMode: 'automatic' },
  } as unknown as WorkspaceDocument;
  const dependencies: GridCellImportControllerDependencies = {
    hasActiveTable: true,
    primaryTableId: 'table-1',
    canEditCoordinates: () => true,
    cells: {},
    document,
    activeSheetModel: { id: 'sheet-1', name: 'Sheet 1', tableObjectId: 'table-1', tables: [], validations: [] },
    setValidationError: (message) => errorMessages.push(message),
    formulaEvaluationContext: () => ({}),
    persistCellChanges: (cells, coordinates, _sheetPatch, gridDataPatch) => {
      commits.push({ cells, coordinates, gridDataPatch });
      return true;
    },
    prepareFormulaForEvaluation: (formula) => formula,
    shouldRecalculateDependent: () => true,
    evaluateFormula: async () => '#VALUE!',
    ...overrides,
  };

  return { dependencies, errorMessages, commits };
}
