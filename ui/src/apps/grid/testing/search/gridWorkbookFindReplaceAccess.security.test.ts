import { describe, expect, it } from 'vitest';
import type { GridCell, GridSheetModel } from '../../../../shared/contracts/workspace';
import { authorizeGridWorkbookFindReplace } from '../../search/gridWorkbookFindReplaceAccess';

const userId = 'actor-1';
const userRoles = ['editor'];

function makeSheet(overrides: Partial<GridSheetModel> = {}): GridSheetModel {
  return { id: 'sheet-1', name: 'Sheet 1', tableObjectId: 'table-1', ...overrides };
}

function runAuthorization(params: {
  sheets?: GridSheetModel[];
  cells?: Record<string, Record<string, GridCell>>;
  proposedSheets?: GridSheetModel[];
  proposedCells?: Record<string, Record<string, GridCell>>;
}) {
  const sheets = params.sheets ?? [makeSheet()];
  return authorizeGridWorkbookFindReplace({
    sheets,
    cellsBySheet: params.cells ?? { 'sheet-1': { A1: { value: 'before', bold: true } } },
    proposedSheets: params.proposedSheets ?? sheets,
    proposedCellsBySheet: params.proposedCells ?? { 'sheet-1': { A1: { value: 'after', bold: true } } },
    userId,
    userRoles,
  });
}

describe('Grid workbook find/replace authorization', () => {
  it('rejects the entire workbook batch when one target cell is locked by sheet protection', () => {
    const sheets = [makeSheet(), makeSheet({ id: 'sheet-2', name: 'Protected', tableObjectId: 'table-2', protection: { isProtected: true } })];
    const result = runAuthorization({
      sheets,
      cells: { 'sheet-1': { A1: { value: 'before' } }, 'sheet-2': { B2: { value: 'secret', locked: true } } },
      proposedSheets: sheets,
      proposedCells: { 'sheet-1': { A1: { value: 'after' } }, 'sheet-2': { B2: { value: 'changed', locked: false } } },
    });

    expect(result).toEqual({ allowed: false, reason: 'One or more target cells are protected or read-only.' });
  });

  it('allows a permitted edit while preserving existing cell metadata and ignoring unrelated proposal fields', () => {
    const sheet = makeSheet();
    const currentCell: GridCell = { value: 'before', bold: true, background: '#112233' };
    const result = runAuthorization({
      cells: { 'sheet-1': { A1: currentCell } },
      proposedSheets: [{ ...sheet, name: 'tampered', hidden: true }],
      proposedCells: { 'sheet-1': { A1: { value: 'after', bold: false, background: '#ffffff', formula: '=1+1' } } },
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.cellsBySheet['sheet-1'].A1).toEqual({ value: 'after', bold: true, background: '#112233', formula: '=1+1' });
    expect(result.sheets[0]).toEqual(sheet);
    expect(result.changedCoordinatesBySheet['sheet-1']).toEqual(['A1']);
    expect(result.changedCount).toBe(1);
  });

  it('rejects a comment replacement in a read-only range', () => {
    const sheet = makeSheet({
      rangePermissions: [{ id: 'read-only', range: 'A1:B2', allowedUsers: [], allowedRoles: [], isReadOnly: true }],
      comments: [{ id: 'comment-1', coord: 'A1', author: 'owner', text: 'before', timestamp: 1 }],
    });
    const result = runAuthorization({
      sheets: [sheet],
      cells: { 'sheet-1': { A1: { value: 'same' } } },
      proposedSheets: [{ ...sheet, comments: [{ ...sheet.comments![0], text: 'after' }] }],
      proposedCells: { 'sheet-1': { A1: { value: 'same' } } },
    });

    expect(result).toEqual({ allowed: false, reason: 'A target comment is protected or the replacement proposal changed comment ownership.' });
  });

  it('rejects a formula replacement in a read-only range', () => {
    const sheet = makeSheet({
      rangePermissions: [{ id: 'read-only', range: 'A1:B2', allowedUsers: [], allowedRoles: [], isReadOnly: true }],
    });
    const result = runAuthorization({
      sheets: [sheet],
      cells: { 'sheet-1': { A1: { value: 'same', formula: '=before' } } },
      proposedSheets: [sheet],
      proposedCells: { 'sheet-1': { A1: { value: 'same', formula: '=after' } } },
    });

    expect(result).toEqual({ allowed: false, reason: 'One or more target cells are protected or read-only.' });
  });

  it('rejects cell creation on a protected sheet using the default locked state', () => {
    const sheet = makeSheet({ protection: { isProtected: true } });
    const result = runAuthorization({
      sheets: [sheet],
      cells: { 'sheet-1': {} },
      proposedSheets: [sheet],
      proposedCells: { 'sheet-1': { C3: { value: 'new', locked: false } } },
    });

    expect(result).toEqual({ allowed: false, reason: 'One or more target cells are protected or read-only.' });
  });
});
