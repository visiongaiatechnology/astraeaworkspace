// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Workbook & Multi-Sheet test suite

import { describe, it, expect } from 'vitest';
import { WorkspaceDocument, GridSheetModel } from '../../../../shared/contracts/workspace';
import {
  addSheetToDocument,
  renameSheetInDocument,
  duplicateSheetInDocument,
  deleteSheetFromDocument,
  reorderSheetInDocument,
  changeTabColorInDocument,
  patchSheetInDocument,
} from '../../workbook/useGridWorkbook';

function createMockDocument(sheetCount = 1): WorkspaceDocument {
  const sheets: GridSheetModel[] = [];
  const objects: WorkspaceDocument['objects'] = {};
  const root_object_ids: string[] = [];

  for (let i = 1; i <= sheetCount; i++) {
    const tableId = `tbl-${i}`;
    const sheetId = `sheet-${i}`;
    sheets.push({
      id: sheetId,
      name: `Sheet ${i}`,
      tableObjectId: tableId,
      zoom: 100,
      showGridlines: true,
      freezeRows: 1,
      freezeCols: 1,
    });
    root_object_ids.push(tableId);
    objects[tableId] = {
      type: 'Table',
      data: {
        id: tableId,
        rows: 25,
        cols: 10,
        cells: {
          A1: { value: `Header ${i}` },
          A2: { value: 100 * i },
        },
      },
    };
  }

  return {
    id: 'doc-1',
    schema_version: 1,
    kind: 'Grid',
    theme_id: 'default',
    title: 'Test Workbook',
    created_at: 1000,
    modified_at: 1000,
    version: 1,
    root_object_ids,
    objects,
    gridData: {
      sheets,
      activeSheetId: sheets[0].id,
      namedRanges: [],
    },
  };
}

describe('Astraea Grid — Workbook & Multi-Sheet Architecture', () => {
  it('adds a new sheet and increments count with unique tableId', () => {
    const doc = createMockDocument(1);
    const { updatedDocument, newSheetId } = addSheetToDocument(doc, doc.gridData!.sheets, 'Q1 Report');

    expect(updatedDocument.gridData!.sheets.length).toBe(2);
    expect(updatedDocument.gridData!.sheets[1].name).toBe('Q1 Report');
    expect(updatedDocument.gridData!.sheets[1].id).toBe(newSheetId);
    expect(updatedDocument.gridData!.activeSheetId).toBe(newSheetId);
    expect(updatedDocument.objects[updatedDocument.gridData!.sheets[1].tableObjectId]).toBeDefined();
  });

  it('rejects summary-sheet creation when workbook structure protection is active', () => {
    const doc = createMockDocument(1);
    doc.gridData!.workbookProtection = { isProtected: true, allowStructureChanges: false };

    expect(() => addSheetToDocument(doc, doc.gridData!.sheets, 'Scenario Summary', {
      rows: 30,
      cols: 10,
      cells: { A1: { value: 'Summary' } },
    })).toThrow('grid_workbook_structure_protected');
    expect(doc.gridData!.sheets).toHaveLength(1);
    expect(doc.root_object_ids).toEqual(['tbl-1']);
  });

  it('adds authorized initial sheet content with generated workbook identities', () => {
    const doc = createMockDocument(1);
    const { updatedDocument, newSheetId } = addSheetToDocument(doc, doc.gridData!.sheets, 'Scenario Summary', {
      rows: 30,
      cols: 10,
      cells: { A1: { value: 'Summary' } },
      tabColor: '#38bdf8',
      colWidths: { 0: 180 },
    });
    const sheet = updatedDocument.gridData!.sheets[1];
    const table = updatedDocument.objects[sheet.tableObjectId];

    expect(sheet.id).toBe(newSheetId);
    expect(sheet.tableObjectId).not.toBe('table-sheet-scenario-summary');
    expect(sheet.tabColor).toBe('#38bdf8');
    expect(sheet.colWidths).toEqual({ 0: 180 });
    expect(table?.type === 'Table' ? table.data : null).toEqual({
      id: sheet.tableObjectId,
      rows: 30,
      cols: 10,
      cells: { A1: { value: 'Summary' } },
    });
  });

  it('renames an existing sheet', () => {
    const doc = createMockDocument(2);
    const updated = renameSheetInDocument(doc, 'sheet-1', 'Renamed Revenue');

    expect(updated.gridData!.sheets[0].name).toBe('Renamed Revenue');
    expect(updated.gridData!.sheets[1].name).toBe('Sheet 2');
  });

  it('duplicates a sheet with deep-cloned cell data', () => {
    const doc = createMockDocument(1);
    const res = duplicateSheetInDocument(doc, doc.gridData!.sheets, 'sheet-1');
    expect(res).not.toBeNull();

    const updated = res!.updatedDocument;
    expect(updated.gridData!.sheets.length).toBe(2);
    const dupSheet = updated.gridData!.sheets[1];
    expect(dupSheet.name).toBe('Sheet 1 (Copy)');
    expect(dupSheet.id).not.toBe('sheet-1');

    const dupTable = updated.objects[dupSheet.tableObjectId]?.data as any;
    expect(dupTable.cells.A1.value).toBe('Header 1');
    expect(dupTable.cells.A2.value).toBe(100);
  });

  it('prevents deleting the last remaining sheet', () => {
    const doc = createMockDocument(1);
    const res = deleteSheetFromDocument(doc, doc.gridData!.sheets, 'sheet-1', 'sheet-1');
    expect(res).toBeNull();
  });

  it('deletes a sheet and safely shifts active sheet', () => {
    const doc = createMockDocument(3);
    const res = deleteSheetFromDocument(doc, doc.gridData!.sheets, 'sheet-2', 'sheet-2');
    expect(res).not.toBeNull();

    const updated = res!.updatedDocument;
    expect(updated.gridData!.sheets.length).toBe(2);
    expect(updated.gridData!.sheets.map((s) => s.id)).toEqual(['sheet-1', 'sheet-3']);
    expect(res!.nextActiveId).toBe('sheet-1');
  });

  it('reorders sheet tabs left and right', () => {
    const doc = createMockDocument(3);
    const shiftedRight = reorderSheetInDocument(doc, doc.gridData!.sheets, 'sheet-1', 'right');
    expect(shiftedRight!.gridData!.sheets.map((s) => s.id)).toEqual(['sheet-2', 'sheet-1', 'sheet-3']);

    const shiftedLeft = reorderSheetInDocument(shiftedRight!, shiftedRight!.gridData!.sheets, 'sheet-3', 'left');
    expect(shiftedLeft!.gridData!.sheets.map((s) => s.id)).toEqual(['sheet-2', 'sheet-3', 'sheet-1']);
  });

  it('updates tab color and sheet properties (zoom, freeze panes)', () => {
    const doc = createMockDocument(1);
    const colored = changeTabColorInDocument(doc, 'sheet-1', '#22c55e');
    expect(colored.gridData!.sheets[0].tabColor).toBe('#22c55e');

    const patched = patchSheetInDocument(colored, 'sheet-1', { freezeRows: 2, freezeCols: 3, zoom: 125 });
    expect(patched.gridData!.sheets[0].freezeRows).toBe(2);
    expect(patched.gridData!.sheets[0].freezeCols).toBe(3);
    expect(patched.gridData!.sheets[0].zoom).toBe(125);
  });
});
