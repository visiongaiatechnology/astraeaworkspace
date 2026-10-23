import { describe, expect, it, vi } from 'vitest';
import { commitGridSolverSolution } from '../../analysis/gridSolverCommit';

describe('Grid solver solution commit boundary', () => {
  it('submits every solver cell in one authorized batch and audits only after acceptance', async () => {
    const commitCells = vi.fn(async () => true);
    const recordAudit = vi.fn();

    await expect(commitGridSolverSolution(
      { A1: 12, B1: 34.5, C1: -2 },
      commitCells,
      recordAudit,
    )).resolves.toBe(true);

    expect(commitCells).toHaveBeenCalledTimes(1);
    expect(commitCells).toHaveBeenCalledWith({ A1: '12', B1: '34.5', C1: '-2' });
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it('does not emit an applied audit or report success when the batch is denied', async () => {
    const commitCells = vi.fn(async () => false);
    const recordAudit = vi.fn();

    await expect(commitGridSolverSolution({ A1: 12, B1: 34 }, commitCells, recordAudit)).resolves.toBe(false);

    expect(commitCells).toHaveBeenCalledTimes(1);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('rejects malformed, non-finite, empty, and oversized solutions before commit', async () => {
    const commitCells = vi.fn(async () => true);
    const recordAudit = vi.fn();
    const oversized = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`A${index + 1}`, index]));

    await expect(commitGridSolverSolution({ 'A1;B1': 1 }, commitCells, recordAudit)).resolves.toBe(false);
    await expect(commitGridSolverSolution({ A1: Number.NaN }, commitCells, recordAudit)).resolves.toBe(false);
    await expect(commitGridSolverSolution({}, commitCells, recordAudit)).resolves.toBe(false);
    await expect(commitGridSolverSolution(oversized, commitCells, recordAudit)).resolves.toBe(false);

    expect(commitCells).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
