// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Editing, Paste Special, AutoFill & Merging test suite

import { describe, it, expect } from 'vitest';
import { GridCell } from '../../../../shared/contracts/grid/workspaceGrid';
import { applyPasteSpecial } from '../../clipboard/gridPasteSpecial';
import { executeAutoFill, shiftFormulaReferences } from '../../editing/gridAutoFill';
import { mergeGridCells, unmergeGridCells, clearGridRangeValues } from '../../editing/gridSelection';

describe('Astraea Grid — Editing, Paste Special, AutoFill & Selection Operations', () => {
  describe('shiftFormulaReferences', () => {
    it('shifts unanchored relative references correctly', () => {
      expect(shiftFormulaReferences('=A1+B1', 1, 0)).toBe('=A2+B2');
      expect(shiftFormulaReferences('=A1+B1', 0, 1)).toBe('=B1+C1');
      expect(shiftFormulaReferences('=A1+B1', 2, 3)).toBe('=D3+E3');
    });

    it('respects column and row absolute anchors', () => {
      expect(shiftFormulaReferences('=$A$1+$B$1', 5, 5)).toBe('=$A$1+$B$1');
      expect(shiftFormulaReferences('=$A1+B$1', 2, 2)).toBe('=$A3+D$1');
    });

    it('handles complex ranges and functions', () => {
      expect(shiftFormulaReferences('=SUM(A1:A10)', 1, 0)).toBe('=SUM(A2:A11)');
      expect(shiftFormulaReferences('=IF(A1>0, B1, $C$1)', 3, 1)).toBe('=IF(B4>0, C4, $C$1)');
    });
  });

  describe('executeAutoFill', () => {
    it('generates linear numeric sequence from 2 cells', () => {
      const cells: Record<string, GridCell> = {
        A1: { value: 10 },
        A2: { value: 20 },
      };
      const result = executeAutoFill(['A1', 'A2'], 'A5', cells, 'linear');
      expect(result.updatedCells.A3?.value).toBe(30);
      expect(result.updatedCells.A4?.value).toBe(40);
      expect(result.updatedCells.A5?.value).toBe(50);
    });

    it('generates growth/geometric series', () => {
      const cells: Record<string, GridCell> = {
        A1: { value: 2 },
        A2: { value: 4 },
      };
      const result = executeAutoFill(['A1', 'A2'], 'A4', cells, 'growth');
      expect(result.updatedCells.A3?.value).toBe(8);
      expect(result.updatedCells.A4?.value).toBe(16);
    });

    it('autofills weekdays in English and German', () => {
      const cellsEN: Record<string, GridCell> = { A1: { value: 'Monday' } };
      const resEN = executeAutoFill(['A1'], 'A3', cellsEN, 'auto');
      expect(resEN.updatedCells.A2?.value).toBe('Tuesday');
      expect(resEN.updatedCells.A3?.value).toBe('Wednesday');

      const cellsDE: Record<string, GridCell> = { B1: { value: 'Montag' } };
      const resDE = executeAutoFill(['B1'], 'B3', cellsDE, 'auto');
      expect(resDE.updatedCells.B2?.value).toBe('Dienstag');
      expect(resDE.updatedCells.B3?.value).toBe('Mittwoch');
    });

    it('autofills months', () => {
      const cells: Record<string, GridCell> = { A1: { value: 'January' } };
      const res = executeAutoFill(['A1'], 'A3', cells, 'auto');
      expect(res.updatedCells.A2?.value).toBe('February');
      expect(res.updatedCells.A3?.value).toBe('March');
    });

    it('autofills formulas with shifted references', () => {
      const cells: Record<string, GridCell> = {
        C1: { formula: '=A1+B1', value: 3 },
      };
      const res = executeAutoFill(['C1'], 'C3', cells, 'auto');
      expect(res.updatedCells.C2?.formula).toBe('=A2+B2');
      expect(res.updatedCells.C3?.formula).toBe('=A3+B3');
    });
  });

  describe('applyPasteSpecial', () => {
    const sourceCells: Record<string, GridCell> = {
      A1: { value: 100, formula: '=10*10', bold: true, background: '#ff0000' },
      A2: { value: 200, formula: '=20*10', bold: false, italic: true },
    };

    it('pastes values only (stripping formulas and styles)', () => {
      const targetCells: Record<string, GridCell> = {};
      const res = applyPasteSpecial(sourceCells, ['A1', 'A2'], 'B1', targetCells, {
        mode: 'values',
        operation: 'none',
      });
      expect(res.updatedCells.B1?.value).toBe(100);
      expect(res.updatedCells.B1?.formula).toBeUndefined();
      expect(res.updatedCells.B1?.bold).toBeUndefined();
      expect(res.updatedCells.B2?.value).toBe(200);
    });

    it('pastes formulas only (shifting relative coordinates)', () => {
      const targetCells: Record<string, GridCell> = {};
      const res = applyPasteSpecial(sourceCells, ['A1', 'A2'], 'C1', targetCells, {
        mode: 'formulas',
        operation: 'none',
      });
      expect(res.updatedCells.C1?.formula).toBe('=10*10');
      expect(res.updatedCells.C1?.background).toBeUndefined();
    });

    it('pastes formats only (retaining existing target values)', () => {
      const targetCells: Record<string, GridCell> = {
        B1: { value: 'Keep Me' },
      };
      const res = applyPasteSpecial(sourceCells, ['A1'], 'B1', targetCells, {
        mode: 'formats',
        operation: 'none',
      });
      expect(res.updatedCells.B1?.value).toBe('Keep Me');
      expect(res.updatedCells.B1?.bold).toBe(true);
      expect(res.updatedCells.B1?.background).toBe('#ff0000');
    });

    it('performs mathematical operations: add, subtract, multiply, divide', () => {
      const targetCells: Record<string, GridCell> = {
        B1: { value: 50 },
      };
      // Add
      const addRes = applyPasteSpecial(sourceCells, ['A1'], 'B1', targetCells, {
        mode: 'values',
        operation: 'add',
      });
      expect(addRes.updatedCells.B1?.value).toBe(150);

      // Subtract
      const subRes = applyPasteSpecial(sourceCells, ['A1'], 'B1', targetCells, {
        mode: 'values',
        operation: 'subtract',
      });
      expect(subRes.updatedCells.B1?.value).toBe(-50);

      // Multiply
      const mulRes = applyPasteSpecial(sourceCells, ['A1'], 'B1', targetCells, {
        mode: 'values',
        operation: 'multiply',
      });
      expect(mulRes.updatedCells.B1?.value).toBe(5000);

      // Divide
      const divRes = applyPasteSpecial(sourceCells, ['A1'], 'B1', targetCells, {
        mode: 'values',
        operation: 'divide',
      });
      expect(divRes.updatedCells.B1?.value).toBe(0.5);
    });

    it('transposes rows to columns', () => {
      const targetCells: Record<string, GridCell> = {};
      // source is vertical A1, A2
      const res = applyPasteSpecial(sourceCells, ['A1', 'A2'], 'B1', targetCells, {
        mode: 'values',
        operation: 'none',
        transpose: true,
      });
      // transposed becomes horizontal B1, C1
      expect(res.updatedCells.B1?.value).toBe(100);
      expect(res.updatedCells.C1?.value).toBe(200);
    });
  });

  describe('mergeGridCells and unmergeGridCells', () => {
    it('merges a range, keeping the top-left value and clearing the rest', () => {
      const cells: Record<string, GridCell> = {
        A1: { value: 'Master Value', bold: true },
        A2: { value: 'Secondary' },
        B1: { value: 'Tertiary' },
        B2: { value: 'Quaternary' },
      };
      const { updatedCells, primaryCoord } = mergeGridCells(cells, 'A1:B2');
      expect(primaryCoord).toBe('A1');
      expect(updatedCells.A1?.value).toBe('Master Value');
      expect(updatedCells.A2).toBeUndefined();
      expect(updatedCells.B1).toBeUndefined();
      expect(updatedCells.B2).toBeUndefined();
    });

    it('unmerges a range without destroying top-left content', () => {
      const cells: Record<string, GridCell> = {
        A1: { value: 'Master Value' },
        A2: { value: '' },
      };
      const updated = unmergeGridCells(cells, 'A1:A2');
      expect(updated.A1?.value).toBe('Master Value');
    });
  });

  describe('clearGridRangeValues', () => {
    it('clears cell values and formulas across range', () => {
      const cells: Record<string, GridCell> = {
        A1: { value: 10, formula: '=5*2', bold: true },
        A2: { value: 'Test', background: '#ccc' },
      };
      const updated = clearGridRangeValues(cells, 'A1:A2');
      expect(updated.A1?.value).toBe('');
      expect(updated.A1?.formula).toBeUndefined();
      expect(updated.A1?.bold).toBe(true); // format preserved!
      expect(updated.A2?.value).toBe('');
      expect(updated.A2?.background).toBe('#ccc');
    });
  });
});
