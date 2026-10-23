// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Data Validation & What-If Analysis test suite

import { describe, it, expect, vi } from 'vitest';
import type { GridCell, GridDataValidationRule, GridScenario } from '../../../../shared/contracts/grid/workspaceGrid';
vi.mock('../../formulas/formula', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../formulas/formula')>();
  return {
    ...actual,
    evaluateFormula: async (formula: string, cells: Record<string, GridCell>) => {
      const normalized = formula.replace(/\s+/gu, '').toUpperCase();
      if (normalized === '=A1*5') return Number(cells.A1?.value ?? 0) * 5;
      if (normalized === '=A1*A1+10') return Number(cells.A1?.value ?? 0) ** 2 + 10;
      if (normalized === '=B1-B2') return Number(cells.B1?.value ?? 0) - Number(cells.B2?.value ?? 0);
      return '#VALUE!';
    },
  };
});
import { validateCellValue, findInvalidCellCoordinates } from '../../validation/gridValidation';
import { executeGoalSeek } from '../../what-if/gridGoalSeek';
import {
  applyScenarioToCells,
  generateScenarioSummary,
  createScenarioSummarySheet,
} from '../../what-if/gridScenarios';

describe('Astraea Grid — Data Validation & What-If Analysis', () => {
  describe('Data Validation Rules & Circle Invalid Data', () => {
    const listRule: GridDataValidationRule = {
      id: 'val-list',
      range: 'A1:A10',
      kind: 'list',
      options: ['Red', 'Green', 'Blue'],
      errorMessage: 'Invalid Color',
    };

    const numRule: GridDataValidationRule = {
      id: 'val-num',
      range: 'B1:B10',
      kind: 'whole-number',
      operator: 'between',
      min: 1,
      max: 100,
      errorMessage: 'Number must be 1-100',
    };

    const textLenRule: GridDataValidationRule = {
      id: 'val-text',
      range: 'C1:C10',
      kind: 'text-length',
      min: 3,
      max: 5,
    };

    it('validates list options (case-insensitive)', () => {
      expect(validateCellValue('A1', { value: 'Red' }, [listRule], {}).isValid).toBe(true);
      expect(validateCellValue('A2', { value: 'green' }, [listRule], {}).isValid).toBe(true);
      expect(validateCellValue('A3', { value: 'Yellow' }, [listRule], {}).isValid).toBe(false);
    });

    it('validates whole number boundaries', () => {
      expect(validateCellValue('B1', { value: 50 }, [numRule], {}).isValid).toBe(true);
      expect(validateCellValue('B2', { value: 0 }, [numRule], {}).isValid).toBe(false);
      expect(validateCellValue('B3', { value: 101 }, [numRule], {}).isValid).toBe(false);
      expect(validateCellValue('B4', { value: 25.5 }, [numRule], {}).isValid).toBe(false); // not whole number
    });

    it('validates text length constraints', () => {
      expect(validateCellValue('C1', { value: 'Code' }, [textLenRule], {}).isValid).toBe(true); // length 4
      expect(validateCellValue('C2', { value: 'AB' }, [textLenRule], {}).isValid).toBe(false); // length 2 < 3
      expect(validateCellValue('C3', { value: 'Toolong' }, [textLenRule], {}).isValid).toBe(false); // length 7 > 5
    });

    it('findInvalidCellCoordinates circles invalid cells across the sheet', () => {
      const sheetCells: Record<string, GridCell> = {
        A1: { value: 'Red' },
        A2: { value: 'Purple' }, // invalid!
        B1: { value: 42 },
        B2: { value: 999 }, // invalid!
        C1: { value: 'Ok' }, // invalid! (length 2 < 3)
        C2: { value: 'Good' },
      };

      const invalid = findInvalidCellCoordinates(sheetCells, [listRule, numRule, textLenRule]);
      expect(invalid.has('A2')).toBe(true);
      expect(invalid.has('B2')).toBe(true);
      expect(invalid.has('C1')).toBe(true);
      expect(invalid.has('A1')).toBe(false);
      expect(invalid.has('B1')).toBe(false);
      expect(invalid.has('C2')).toBe(false);
    });
  });

  describe('Goal Seek (Zielwertsuche)', () => {
    it('finds changing cell value to reach linear target formula', async () => {
      // Cell A1 is changing input, B1 is '=A1 * 5'
      // We want B1 to equal 100 -> A1 should be solved to 20
      const cells: Record<string, GridCell> = {
        A1: { value: 1 },
        B1: { formula: '=A1 * 5', value: 5 },
      };

      const result = await executeGoalSeek(
        {
          setCell: 'B1',
          targetValue: 100,
          byChangingCell: 'A1',
          maxIterations: 100,
          tolerance: 0.0001,
        },
        cells
      );

      expect(result.success).toBe(true);
      expect(result.solution).toBeCloseTo(20, 3);
      expect(result.resultingTargetValue).toBeCloseTo(100, 3);
    });

    it('solves polynomial target (e.g. loan payment / breakeven)', async () => {
      // Cell A1 is changing input, C1 is '=A1 * A1 + 10'
      // We want C1 to equal 59 -> A1 should solve to 7 (or -7)
      const cells: Record<string, GridCell> = {
        A1: { value: 2 },
        C1: { formula: '=A1 * A1 + 10', value: 14 },
      };

      const result = await executeGoalSeek(
        {
          setCell: 'C1',
          targetValue: 59,
          byChangingCell: 'A1',
          maxIterations: 100,
          tolerance: 0.001,
        },
        cells
      );

      expect(result.success).toBe(true);
      expect(Math.abs(result.solution!)).toBeCloseTo(7, 2);
    });
  });

  describe('Scenario Manager', () => {
    const baseCells: Record<string, GridCell> = {
      B1: { value: 100 }, // Revenue
      B2: { value: 60 },  // Cost
      B3: { formula: '=B1 - B2', value: 40 }, // Profit
    };

    const bestCase: GridScenario = {
      id: 'sc-best',
      name: 'Best Case',
      changingCells: ['B1', 'B2'],
      values: { B1: '150', B2: '50' },
    };

    const worstCase: GridScenario = {
      id: 'sc-worst',
      name: 'Worst Case',
      changingCells: ['B1', 'B2'],
      values: { B1: '80', B2: '70' },
    };

    it('applies scenario values to cells', () => {
      const updated = applyScenarioToCells(bestCase, baseCells);
      expect(updated.B1.value).toBe(150);
      expect(updated.B2.value).toBe(50);
    });

    it('generates scenario summary comparison table', async () => {
      const summary = await generateScenarioSummary([bestCase, worstCase], ['B3'], baseCells);
      expect(summary.scenarios.length).toBe(2);
      expect(summary.changingRows.length).toBe(2);
      expect(summary.resultRows.length).toBe(1);

      const resultRow = summary.resultRows[0];
      expect(resultRow).toBeDefined();
      expect(resultRow?.values['sc-best']).toBe(100); // 150 - 50
      expect(resultRow?.values['sc-worst']).toBe(10);  // 80 - 70
    });

    it('creates scenario summary sheet model and cells', async () => {
      const summary = await generateScenarioSummary([bestCase, worstCase], ['B3'], baseCells);
      const { sheet, cells } = createScenarioSummarySheet(summary, 1);
      expect(sheet.name).toBe('Szenario-Bericht 1');
      expect(cells.A1.value).toBe('Szenario-Zusammenfassung (Scenario Summary Report)');
      expect(cells.B4.value).toBe('Best Case');
      expect(cells.C4.value).toBe('Worst Case');
    });
  });
});
