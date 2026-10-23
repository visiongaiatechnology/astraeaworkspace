import type { GridCell, GridWorkbookProtectionSettings } from '../../../shared/contracts/workspace';
import { validateWorkbookStructureMutation } from '../collaboration/gridReviewCollaboration';

export function authorizeGridWorkbookCellMapMutation(params: {
  workbookProtection?: GridWorkbookProtectionSettings;
  currentCells: Record<string, GridCell>;
  proposedCells: Record<string, GridCell>;
}): string[] {
  validateWorkbookStructureMutation(params.workbookProtection);

  const coordinates = new Set(Object.keys(params.currentCells));
  for (const coordinate of Object.keys(params.proposedCells)) coordinates.add(coordinate);

  const changed: string[] = [];
  for (const coordinate of coordinates) {
    if (params.currentCells[coordinate] !== params.proposedCells[coordinate]) changed.push(coordinate);
  }
  return changed;
}
