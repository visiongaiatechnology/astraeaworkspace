// STATUS: DIAMANT VGT SUPREME
// Authorizes and narrows workbook find/replace proposals to protected value, formula, and comment edits.

import type { GridCell, GridCellComment, GridSheetModel } from '../../../shared/contracts/workspace';
import { validateGridEditAccess } from '../collaboration/gridReviewCollaboration';

const MAX_WORKBOOK_REPLACEMENTS = 10_000;
const GRID_COORDINATE = /^[A-Z]{1,3}[1-9]\d{0,6}$/u;

export interface GridWorkbookFindReplaceAuthorizationInput {
  sheets: readonly GridSheetModel[];
  cellsBySheet: Readonly<Record<string, Readonly<Record<string, GridCell>>>>;
  proposedSheets: readonly GridSheetModel[];
  proposedCellsBySheet: Readonly<Record<string, Readonly<Record<string, GridCell>>>>;
  userId: string;
  userRoles: string[];
}

export type GridWorkbookFindReplaceAuthorization =
  | { allowed: false; reason: string }
  | {
      allowed: true;
      sheets: GridSheetModel[];
      cellsBySheet: Record<string, Record<string, GridCell>>;
      changedCoordinatesBySheet: Record<string, string[]>;
      changedCount: number;
    };

function deny(reason: string): GridWorkbookFindReplaceAuthorization {
  return { allowed: false, reason };
}

export function authorizeGridWorkbookFindReplace(
  input: GridWorkbookFindReplaceAuthorizationInput,
): GridWorkbookFindReplaceAuthorization {
  if (input.sheets.length !== input.proposedSheets.length) return deny('The workbook sheet set changed during replacement.');

  const sheetIds = new Set(input.sheets.map((sheet) => sheet.id));
  if (sheetIds.size !== input.sheets.length) return deny('The workbook contains duplicate sheet identities.');
  if (Object.keys(input.proposedCellsBySheet).some((sheetId) => !sheetIds.has(sheetId))) {
    return deny('The replacement proposal contains an unknown sheet.');
  }

  const proposedSheetsById = new Map<string, GridSheetModel>();
  for (const sheet of input.proposedSheets) {
    if (!sheetIds.has(sheet.id) || proposedSheetsById.has(sheet.id)) return deny('The replacement proposal changed workbook sheet identities.');
    proposedSheetsById.set(sheet.id, sheet);
  }

  const nextSheets: GridSheetModel[] = [];
  const nextCellsBySheet: Record<string, Record<string, GridCell>> = {};
  const changedCoordinatesBySheet: Record<string, string[]> = {};
  let changedCount = 0;

  for (const sheet of input.sheets) {
    const proposedSheet = proposedSheetsById.get(sheet.id);
    if (!proposedSheet || proposedSheet.tableObjectId !== sheet.tableObjectId) {
      return deny('The replacement proposal changed workbook sheet ownership.');
    }

    const currentComments = sheet.comments ?? [];
    const proposedComments = proposedSheet.comments ?? [];
    if (currentComments.length !== proposedComments.length) return deny('The replacement proposal changed the comment set.');

    const nextComments: GridCellComment[] = [];
    for (let index = 0; index < currentComments.length; index += 1) {
      const comment = currentComments[index];
      const proposedComment = proposedComments[index];
      if (!proposedComment || proposedComment.id !== comment.id || proposedComment.coord !== comment.coord) {
        return deny('The replacement proposal changed the comment set or ownership.');
      }
      if (typeof proposedComment.text !== 'string') return deny('The replacement proposal contains an invalid comment.');
      if (proposedComment.text === comment.text) {
        nextComments.push(comment);
        continue;
      }
      if (!GRID_COORDINATE.test(comment.coord)) return deny('The replacement proposal contains an invalid comment target.');

      const access = validateGridEditAccess({
        coord: comment.coord,
        userId: input.userId,
        userRoles: input.userRoles,
        cell: input.cellsBySheet[sheet.id]?.[comment.coord],
        sheetProtection: sheet.protection,
        rangeRules: sheet.rangePermissions ?? [],
      });
      if (!access.allowed) return deny('A target comment is protected or the replacement proposal changed comment ownership.');
      changedCount += 1;
      if (changedCount > MAX_WORKBOOK_REPLACEMENTS) return deny('The replacement proposal exceeds its bounded edit limit.');
      nextComments.push({ ...comment, text: proposedComment.text });
    }

    const beforeCells = input.cellsBySheet[sheet.id] ?? {};
    const proposedCells = input.proposedCellsBySheet[sheet.id] ?? {};
    const nextCells: Record<string, GridCell> = { ...beforeCells };
    const changedCoordinates: string[] = [];
    const coordinates = new Set([...Object.keys(beforeCells), ...Object.keys(proposedCells)]);

    for (const coord of coordinates) {
      const before = beforeCells[coord];
      const proposed = proposedCells[coord];
      if (before && !proposed) return deny('The replacement proposal removed an existing cell.');

      const valueChanged = before?.value !== proposed?.value;
      const formulaChanged = (before?.formula ?? undefined) !== (proposed?.formula ?? undefined);
      if (!valueChanged && !formulaChanged) continue;
      if (!proposed || !GRID_COORDINATE.test(coord)) return deny('The replacement proposal contains an invalid cell target.');
      if (typeof proposed.value !== 'string' && typeof proposed.value !== 'number' && typeof proposed.value !== 'boolean') {
        return deny('The replacement proposal contains an invalid cell value.');
      }

      const access = validateGridEditAccess({
        coord,
        userId: input.userId,
        userRoles: input.userRoles,
        cell: before,
        sheetProtection: sheet.protection,
        rangeRules: sheet.rangePermissions ?? [],
      });
      if (!access.allowed) return deny('One or more target cells are protected or read-only.');

      const updatedCell: GridCell = { ...(before ?? { value: '' }) };
      if (valueChanged) updatedCell.value = proposed.value;
      if (formulaChanged) {
        if (proposed.formula === undefined) delete updatedCell.formula;
        else updatedCell.formula = proposed.formula;
      }
      nextCells[coord] = updatedCell;
      changedCoordinates.push(coord);
      changedCount += 1;
      if (changedCount > MAX_WORKBOOK_REPLACEMENTS) return deny('The replacement proposal exceeds its bounded edit limit.');
    }

    nextCellsBySheet[sheet.id] = nextCells;
    changedCoordinatesBySheet[sheet.id] = changedCoordinates;
    nextSheets.push({
      ...sheet,
      ...(sheet.comments !== undefined || nextComments.length > 0 ? { comments: nextComments } : {}),
    });
  }

  if (changedCount > MAX_WORKBOOK_REPLACEMENTS) return deny('The replacement proposal exceeds its bounded edit limit.');
  return {
    allowed: true,
    sheets: nextSheets,
    cellsBySheet: nextCellsBySheet,
    changedCoordinatesBySheet,
    changedCount,
  };
}
