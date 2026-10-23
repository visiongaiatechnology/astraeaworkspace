// STATUS: DIAMANT VGT SUPREME
// Bounded dynamic-array spill planning and stale-spill cleanup: Paket 25
// (AST-0361..0365).

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import {
  GRID_MAX_COLUMNS,
  GRID_MAX_ROWS,
  columnName,
  diffSpillProvenance,
  planGridFormulaSpill,
  provenanceFromPlans,
  spillOwnershipIndex,
} from '../../formulas/gridFormulaSpill';
import { toA1 } from '../../formulas/formula';
import { applySpill, extractReferencesFromFormula } from '../../formulas/gridFormulaReferences';
import { evaluateGridFormulaLocal, recalculateGridWithSpill } from '../../formulas/gridFormulaEngine';
import { GRID_FORMULA_LIMITS } from '../../formulas/gridFormulaLimits';

function grid(data: Record<string, Partial<GridCell>>): Record<string, GridCell> {
  const result: Record<string, GridCell> = {};
  for (const [coord, cell] of Object.entries(data)) {
    result[coord] = { value: cell.value ?? '', formula: cell.formula };
  }
  return result;
}

describe('Paket 25 — spill planning', () => {
  it('treats a scalar result as a scalar write', () => {
    const plan = planGridFormulaSpill('A1', 42, {});
    expect(plan.kind).toBe('scalar');
    expect(plan.value).toBe(42);
    expect(plan.spilled).toEqual({});
    expect(plan.error).toBeNull();
    expect(plan.footprint).toEqual(['A1']);
  });

  it('collapses a 1x1 matrix to its scalar', () => {
    const plan = planGridFormulaSpill('B2', [[7]], {});
    expect(plan.kind).toBe('scalar');
    expect(plan.value).toBe(7);
  });

  it('plans a 2x2 footprint deterministically', () => {
    const plan = planGridFormulaSpill('A1', [[1, 2], [3, 4]], {});
    expect(plan.kind).toBe('spill');
    expect(plan.value).toBe(1);
    expect(plan.spilled).toEqual({ B1: 2, A2: 3, B2: 4 });
    expect(plan.footprint).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('reports the blocking cells instead of silently overwriting them', () => {
    const cells = grid({ B1: { value: 'x' }, B2: { value: 0 } });
    const plan = planGridFormulaSpill('A1', [[1, 2], [3, 4]], cells);
    expect(plan.kind).toBe('blocked');
    expect(plan.value).toBe('#SPILL!');
    expect(plan.error).toBe('#SPILL!');
    expect(plan.blockedBy).toEqual(['B1', 'B2']);
    expect(plan.spilled).toEqual({});
  });

  it('treats a formula cell as blocking even when it holds no value', () => {
    const plan = planGridFormulaSpill('A1', [[1, 2]], grid({ B1: { formula: '=1+1' } }));
    expect(plan.kind).toBe('blocked');
    expect(plan.blockedBy).toEqual(['B1']);
  });

  it('reports an out-of-raster footprint as #SPILL! without throwing', () => {
    const lastColumn = `${columnName(GRID_MAX_COLUMNS - 1)}1`;
    expect(lastColumn).toBe('XFD1');
    const plan = planGridFormulaSpill(lastColumn, [[1, 2]], {});
    expect(plan.kind).toBe('out-of-bounds');
    expect(plan.error).toBe('#SPILL!');
    expect(plan.footprint).toEqual([]);

    const lastRow = `A${GRID_MAX_ROWS}`;
    expect(planGridFormulaSpill(lastRow, [[1], [2]], {}).kind).toBe('out-of-bounds');
    // One cell inside the raster is still valid.
    expect(planGridFormulaSpill(lastRow, [[1]], {}).kind).toBe('scalar');
  });

  it('refuses to spill more cells than the canonical budget', () => {
    const plan = planGridFormulaSpill('A1', [[1, 2], [3, 4]], {}, {
      limits: { ...GRID_FORMULA_LIMITS, maxSpillCells: 2 },
    });
    expect(plan.kind).toBe('too-large');
    expect(plan.error).toBe('#SPILL!');
  });

  it('counts cells owned by another spill as blockers', () => {
    const plan = planGridFormulaSpill('A1', [[1, 2]], {}, { occupiedBySpill: new Set(['B1']) });
    expect(plan.kind).toBe('blocked');
    expect(plan.blockedBy).toEqual(['B1']);
  });
});

describe('Paket 25 — legacy defect counter-check', () => {
  it('the old coordinate expansion threw at the sheet edge; the planner does not', () => {
    // The previous implementation built spill coordinates with `toA1` and no bounds
    // check, so a dynamic array at the last column threw `formula_coordinate_out_of_range`
    // straight out of the recalculation loop instead of showing `#SPILL!`.
    expect(() => toA1(GRID_MAX_COLUMNS, 0)).toThrow(/formula_coordinate_out_of_range/);
    expect(() => applySpill('XFD1', [[1, 2]], {})).not.toThrow();
    expect(applySpill('XFD1', [[1, 2]], {}).error).toBe('#SPILL!');
  });

  it('applySpill keeps the documented scalar, spill and collision results', () => {
    expect(applySpill('A1', 42, {}).spilledCells).toEqual({});
    const spilled = applySpill('A1', [[1, 2], [3, 4]], {});
    expect(spilled.value).toBe(1);
    expect(spilled.spilledCells).toEqual({ B1: 2, A2: 3, B2: 4 });
    const blocked = applySpill('A1', [[1, 2], [3, 4]], grid({ B1: { value: 'x' } }));
    expect(blocked.value).toBe('#SPILL!');
    expect(blocked.error).toBe('#SPILL!');
    expect(blocked.spilledCells).toEqual({});
    expect(blocked.blockedBy).toEqual(['B1']);
  });
});

describe('Paket 25 — stale spill cleanup', () => {
  it('computes the cells an old spill must release', () => {
    const previous = [{ owner: 'A1', cells: ['A2', 'A3'] }];
    const next = [{ owner: 'A1', cells: ['A2'] }];
    expect(diffSpillProvenance(previous, next)).toEqual(['A3']);
    expect(diffSpillProvenance(previous, [])).toEqual(['A2', 'A3']);
    expect(diffSpillProvenance([], next)).toEqual([]);
    expect(diffSpillProvenance(previous, previous)).toEqual([]);
  });

  it('keeps overlap between two owners claimed', () => {
    const previous = [
      { owner: 'A1', cells: ['A2'] },
      { owner: 'C1', cells: ['C2'] },
    ];
    const next = [{ owner: 'A1', cells: ['A2', 'A3'] }];
    expect(diffSpillProvenance(previous, next)).toEqual(['C2']);
  });

  it('builds provenance and an ownership index from plans', () => {
    const plans = [
      planGridFormulaSpill('A1', [[1, 2], [3, 4]], {}),
      planGridFormulaSpill('D1', 5, {}),
    ];
    const provenance = provenanceFromPlans(plans);
    expect(provenance).toEqual([{ owner: 'A1', cells: ['A2', 'B1', 'B2'] }]);
    const index = spillOwnershipIndex(provenance);
    expect(index.get('B2')).toBe('A1');
    expect(index.get('D1')).toBeUndefined();
  });

  it('clears cells released by a shrinking dynamic array', () => {
    const first = recalculateGridWithSpill(grid({ A1: { formula: '=SEQUENCE(1, 3)' } }));
    expect(first.spillProvenance).toEqual([{ owner: 'A1', cells: ['B1', 'C1'] }]);
    expect(first.updatedCells.C1?.value).toBe(3);

    // The stale spill output is still present in the cell map the caller hands back in.
    const second = recalculateGridWithSpill(
      grid({ A1: { formula: '=SEQUENCE(1, 1)' }, B1: { value: 2 }, C1: { value: 3 } }),
      {},
      first.spillProvenance,
    );
    expect(second.clearedSpillCells).toEqual(['B1', 'C1']);
    expect(second.updatedCells.B1?.value).toBe('');
    expect(second.updatedCells.C1?.value).toBe('');
    expect(second.spillProvenance).toEqual([]);
  });

  it('reports a blocked dynamic array through the recalculation loop', () => {
    const result = recalculateGridWithSpill(
      grid({ A1: { formula: '=SEQUENCE(2, 2)' }, B1: { value: 'blocker' } }),
    );
    expect(result.spillErrors).toEqual(['A1']);
    expect(result.updatedCells.A1?.value).toBe('#SPILL!');
    expect(result.updatedCells.B1?.value).toBe('blocker');
  });

  it('orchestrates UNIQUE over a range and reports a conflict with an occupied spill cell', () => {
    const cells = grid({
      A2: { value: 'Alpha' },
      A3: { value: 'Beta' },
      A4: { value: 'Alpha' },
      A5: { value: 'Gamma' },
      C2: { value: 'occupied' },
    });
    const unique = evaluateGridFormulaLocal('=UNIQUE(A2:A5)', cells);
    expect(unique).toEqual([['Alpha'], ['Beta'], ['Gamma']]);

    // A free origin spills downwards into its own column: three rows -> two spills.
    const free = applySpill('B1', unique, cells);
    expect(free.error).toBeUndefined();
    expect(free.spilledCells).toEqual({ B2: 'Beta', B3: 'Gamma' });

    // C2 is occupied, so the same dynamic array must be reported as a conflict.
    const conflicting = applySpill('C1', unique, cells);
    expect(conflicting.error).toBe('#SPILL!');
    expect(conflicting.value).toBe('#SPILL!');
    expect(conflicting.blockedBy).toEqual(['C2']);
    expect(conflicting.spilledCells).toEqual({});

    const reported = recalculateGridWithSpill(
      grid({
        A2: { value: 'Alpha' },
        A3: { value: 'Beta' },
        A4: { value: 'Alpha' },
        A5: { value: 'Gamma' },
        C1: { formula: '=UNIQUE(A2:A5)' },
        C2: { value: 'occupied' },
      }),
    );
    expect(reported.spillErrors).toEqual(['C1']);
    expect(reported.updatedCells.C1?.value).toBe('#SPILL!');
    expect(reported.updatedCells.C2?.value).toBe('occupied');
  });

  it('bounds a whole-column reference instead of materialising it', () => {
    const cells = grid({ A1: { value: 1 }, A1048576: { value: 2 } });
    const started = Date.now();
    expect(evaluateGridFormulaLocal('=SUM(A:A)', cells)).toBe('#REF!');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('extracts no precedent from a whole-column reference it cannot expand', () => {
    expect(extractReferencesFromFormula('=SUM(A:A)')).toEqual([]);
  });
});
