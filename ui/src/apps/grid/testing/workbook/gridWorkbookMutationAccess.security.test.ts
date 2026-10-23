import { describe, expect, it } from 'vitest';
import { authorizeGridWorkbookCellMapMutation } from '../../workbook/gridWorkbookMutationAccess';
import type { GridCell } from '../../../../shared/contracts/workspace';

describe('Grid workbook mutation authorization preflight', () => {
  it('rejects protected workbook structure before preparing any cell mutation', () => {
    const currentCells = { A1: { value: 'header' } } satisfies Record<string, GridCell>;
    const proposedCells = { A1: { value: 'Table1', bold: true } } satisfies Record<string, GridCell>;

    expect(() => authorizeGridWorkbookCellMapMutation({
      workbookProtection: { isProtected: true, allowStructureChanges: false },
      currentCells,
      proposedCells,
    })).toThrow('grid_workbook_structure_protected');
    expect(currentCells).toEqual({ A1: { value: 'header' } });
  });

  it('returns every changed coordinate for caller-owned cell permission checks', () => {
    const currentCells = {
      A1: { value: 'header' },
      B2: { value: 4 },
      C3: { value: 'remove' },
    } satisfies Record<string, GridCell>;
    const proposedCells = {
      A1: { value: 'Header', bold: true },
      B2: currentCells.B2,
      D4: { value: 8, formula: '=B2*2' },
    } satisfies Record<string, GridCell>;

    expect(authorizeGridWorkbookCellMapMutation({
      workbookProtection: { isProtected: true, allowStructureChanges: true },
      currentCells,
      proposedCells,
    })).toEqual(['A1', 'C3', 'D4']);
  });

  it('still applies the structure guard to metadata-only mutations', () => {
    const currentCells = { A1: { value: 'header' } } satisfies Record<string, GridCell>;

    expect(authorizeGridWorkbookCellMapMutation({
      currentCells,
      proposedCells: currentCells,
    })).toEqual([]);
    expect(() => authorizeGridWorkbookCellMapMutation({
      workbookProtection: { isProtected: true },
      currentCells,
      proposedCells: currentCells,
    })).toThrow('grid_workbook_structure_protected');
  });
});
