const MAX_SOLVER_COMMIT_CELLS = 32;
const GRID_COORDINATE = /^[A-Z]{1,3}[1-9]\d{0,6}$/u;

export async function commitGridSolverSolution(
  solution: Record<string, number>,
  commitCells: (cells: Record<string, string>) => boolean | Promise<boolean>,
  recordAppliedAudit: () => void,
): Promise<boolean> {
  const entries = Object.entries(solution);
  if (entries.length === 0 || entries.length > MAX_SOLVER_COMMIT_CELLS) return false;

  const cellValues: Record<string, string> = {};
  for (const [coordinate, value] of entries) {
    if (!GRID_COORDINATE.test(coordinate) || !Number.isFinite(value)) return false;
    cellValues[coordinate] = String(value);
  }

  const committed = await commitCells(cellValues);
  if (!committed) return false;
  recordAppliedAudit();
  return true;
}
