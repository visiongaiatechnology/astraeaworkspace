// STATUS: PLATIN
import { describe, expect, it } from 'vitest';
import { collectDirtyFormulaCells } from '../../formulas/gridFormulaRecalc';

describe('Grid formula dependency collection', () => {
  it('builds one reverse-reference index for batch edits and returns transitive dependents', () => {
    const dirty = collectDirtyFormulaCells(['A1', 'B1'], {
      A1: { value: 1 },
      B1: { value: 2, formula: '=A1+1' },
      C1: { value: 3, formula: '=B1+1' },
      D1: { value: 2, formula: '=A1+A1' },
      E1: { value: 0, formula: '=Z1+1' },
    });

    expect([...dirty].sort()).toEqual(['C1', 'D1']);
  });

  it('respects the requested dirty-node cap', () => {
    const dirty = collectDirtyFormulaCells(['A1'], {
      B1: { value: 0, formula: '=A1' },
      C1: { value: 0, formula: '=A1' },
    }, 1);

    expect(dirty.size).toBe(1);
  });
});
