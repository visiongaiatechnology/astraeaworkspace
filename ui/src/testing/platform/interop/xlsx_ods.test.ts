// STATUS: DIAMANT VGT SUPREME
// Interop tests for XLSX and ODS binary import / export roundtrips

import { describe, it, expect } from 'vitest';
import { exportXlsx, importXlsx } from '../../../platform/interop/xlsx';
import { exportOds, importOds } from '../../../platform/interop/ods';
import { WorkspaceDocument, TableObject } from '../../../shared/contracts/workspace';

function createSampleWorkbook(): WorkspaceDocument {
  const tableId1 = 'tbl-sheet-1';
  const tableId2 = 'tbl-sheet-2';

  const table1: TableObject = {
    id: tableId1,
    rows: 10,
    cols: 6,
    cells: {
      A1: { value: 'Product' },
      B1: { value: 'Quantity' },
      C1: { value: 'Price' },
      D1: { value: 'Total', formula: '=B1*C1' },
      A2: { value: 'Widget Alpha' },
      B2: { value: 15 },
      C2: { value: 24.5 },
      D2: { value: 367.5, formula: '=B2*C2' },
      A3: { value: 'Active Status' },
      B3: { value: true },
      A4: { value: 'Special & Characters: <>&"\'' },
    },
  };

  const table2: TableObject = {
    id: tableId2,
    rows: 5,
    cols: 4,
    cells: {
      A1: { value: 'Summary Sheet' },
      B1: { value: 1000 },
      C1: { value: 2000 },
      D1: { value: 3000, formula: '=SUM(B1:C1)' },
    },
  };

  return {
    schema_version: 1,
    id: 'doc-wb-test-01',
    title: 'Financial Model Test',
    kind: 'Grid',
    created_at: Date.now(),
    modified_at: Date.now(),
    version: 1,
    theme_id: 'default',
    root_object_ids: [tableId1, tableId2],
    objects: {
      [tableId1]: { type: 'Table', data: table1 },
      [tableId2]: { type: 'Table', data: table2 },
    },
    gridData: {
      sheets: [
        { id: 'sheet-1', name: 'Sales Data', tableObjectId: tableId1 },
        { id: 'sheet-2', name: 'Summary', tableObjectId: tableId2 },
      ],
      activeSheetId: 'sheet-1',
      namedRanges: [],
    },
  };
}

describe('Native XLSX Core Interoperability Roundtrip', () => {
  it('exports to binary XLSX and re-imports preserving sheets, values and formulas', async () => {
    const originalDoc = createSampleWorkbook();
    const xlsxBytes = exportXlsx(originalDoc);

    expect(xlsxBytes).toBeInstanceOf(Uint8Array);
    expect(xlsxBytes.byteLength).toBeGreaterThan(500);

    // Re-import the exported XLSX
    const importedDoc = await importXlsx(xlsxBytes, 'Financial Model Test.xlsx');

    expect(importedDoc.kind).toBe('Grid');
    expect(importedDoc.gridData?.sheets.length).toBe(2);
    expect(importedDoc.gridData?.sheets[0].name).toBe('Sales Data');
    expect(importedDoc.gridData?.sheets[1].name).toBe('Summary');

    // Check Sheet 1 Cells
    const sheet1TblId = importedDoc.gridData?.sheets[0].tableObjectId!;
    const sheet1Table = importedDoc.objects[sheet1TblId].data as TableObject;

    expect(sheet1Table.cells['A1'].value).toBe('Product');
    expect(sheet1Table.cells['B2'].value).toBe(15);
    expect(sheet1Table.cells['C2'].value).toBe(24.5);
    expect(sheet1Table.cells['D2'].formula).toBe('=B2*C2');
    expect(sheet1Table.cells['B3'].value).toBe(true);
    expect(sheet1Table.cells['A4'].value).toBe('Special & Characters: <>&"\'');

    // Check Sheet 2 Cells
    const sheet2TblId = importedDoc.gridData?.sheets[1].tableObjectId!;
    const sheet2Table = importedDoc.objects[sheet2TblId].data as TableObject;

    expect(sheet2Table.cells['A1'].value).toBe('Summary Sheet');
    expect(sheet2Table.cells['B1'].value).toBe(1000);
    expect(sheet2Table.cells['D1'].formula).toBe('=SUM(B1:C1)');
  });
});

describe('Native ODS Core Interoperability Roundtrip', () => {
  it('exports to binary ODS and re-imports preserving sheets, values, formulas and booleans', async () => {
    const originalDoc = createSampleWorkbook();
    const odsBytes = exportOds(originalDoc);

    expect(odsBytes).toBeInstanceOf(Uint8Array);
    expect(odsBytes.byteLength).toBeGreaterThan(500);

    // Re-import the exported ODS
    const importedDoc = await importOds(odsBytes, 'Financial Model Test.ods');

    expect(importedDoc.kind).toBe('Grid');
    expect(importedDoc.gridData?.sheets.length).toBe(2);
    expect(importedDoc.gridData?.sheets[0].name).toBe('Sales Data');
    expect(importedDoc.gridData?.sheets[1].name).toBe('Summary');

    // Check Sheet 1 Cells
    const sheet1TblId = importedDoc.gridData?.sheets[0].tableObjectId!;
    const sheet1Table = importedDoc.objects[sheet1TblId].data as TableObject;

    expect(sheet1Table.cells['A1'].value).toBe('Product');
    expect(sheet1Table.cells['B2'].value).toBe(15);
    expect(sheet1Table.cells['C2'].value).toBe(24.5);
    expect(sheet1Table.cells['D2'].formula).toBe('=B2*C2');
    expect(sheet1Table.cells['B3'].value).toBe(true);

    // Check Sheet 2 Cells
    const sheet2TblId = importedDoc.gridData?.sheets[1].tableObjectId!;
    const sheet2Table = importedDoc.objects[sheet2TblId].data as TableObject;

    expect(sheet2Table.cells['A1'].value).toBe('Summary Sheet');
    expect(sheet2Table.cells['B1'].value).toBe(1000);
    expect(sheet2Table.cells['D1'].formula).toBe('=SUM(B1:C1)');
  });
});
