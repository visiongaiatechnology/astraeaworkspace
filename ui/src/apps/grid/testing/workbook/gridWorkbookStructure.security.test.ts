import { describe, expect, it } from 'vitest';
import type { GridSheetModel, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { applyGridStructureEdit } from '../../workbook/gridWorkbookStructure';

function makeDocument(workbookProtection?: NonNullable<WorkspaceDocument['gridData']>['workbookProtection']): WorkspaceDocument {
  const sheet: GridSheetModel = { id: 'sheet-1', name: 'Sheet 1', tableObjectId: 'table-1' };
  return {
    id: 'doc-1',
    schema_version: 1,
    kind: 'Grid',
    theme_id: 'default',
    title: 'Protected workbook test',
    created_at: 1,
    modified_at: 1,
    version: 1,
    root_object_ids: ['table-1'],
    objects: {
      'table-1': {
        type: 'Table',
        data: {
          id: 'table-1',
          rows: 5,
          cols: 3,
          cells: { A2: { value: 'row two' }, B1: { value: 0, formula: '=A2*2' } },
        },
      },
    },
    gridData: {
      sheets: [sheet],
      activeSheetId: sheet.id,
      namedRanges: [],
      ...(workbookProtection ? { workbookProtection } : {}),
    },
  };
}

describe('Grid workbook structure protection', () => {
  it('rejects row edits on a protected workbook before changing cells or references', () => {
    const document = makeDocument({ isProtected: true, allowStructureChanges: false });

    expect(() => applyGridStructureEdit(document, 'sheet-1', { kind: 'delete-row', index: 1 })).toThrow('grid_workbook_structure_protected');
    expect(document.objects['table-1']?.type === 'Table' ? document.objects['table-1'].data.cells : null).toEqual({
      A2: { value: 'row two' },
      B1: { value: 0, formula: '=A2*2' },
    });
    expect(document.version).toBe(1);
  });

  it('allows explicitly permitted structural edits and remaps cells and formulas', () => {
    const document = makeDocument({ isProtected: true, allowStructureChanges: true });
    const updated = applyGridStructureEdit(document, 'sheet-1', { kind: 'insert-row', index: 1 });
    const table = updated.objects['table-1'];

    expect(updated.version).toBe(2);
    expect(table?.type === 'Table' ? table.data.rows : null).toBe(6);
    expect(table?.type === 'Table' ? table.data.cells : null).toEqual({
      A3: { value: 'row two' },
      B1: { value: 0, formula: '=A3*2' },
    });
  });
});
