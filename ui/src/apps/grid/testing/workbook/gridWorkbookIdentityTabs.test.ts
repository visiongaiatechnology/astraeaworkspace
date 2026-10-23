// STATUS: DIAMANT VGT SUPREME
// Astraea Grid workbook identity, tab switching and structural-edit risk tests.

import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { addSheetToDocument, duplicateSheetInDocument, nextGridSheetIdentity } from '../../workbook/gridWorkbookOperations';
import { nextGridWorkbookTabIndex, resolveGridWorkbookTabKey } from '../../workbook/gridWorkbookTabs';
import { describeGridStructureEditRisk } from '../../workbook/gridWorkbookStructure';

function createDocument(): WorkspaceDocument {
  return {
    id: 'doc-1',
    version: 1,
    modified_at: 1,
    root_object_ids: ['grid-table-1'],
    objects: { 'grid-table-1': { type: 'Table', data: { id: 'grid-table-1', rows: 25, cols: 10, cells: {} } } },
    gridData: {
      sheets: [{ id: 'grid-sheet-1', name: 'Sheet 1', tableObjectId: 'grid-table-1' }],
      activeSheetId: 'grid-sheet-1',
    },
  } as unknown as WorkspaceDocument;
}

describe('Grid workbook identity', () => {
  it('derives the next identity deterministically without a clock', () => {
    const existing = [{ id: 'grid-sheet-1', tableObjectId: 'grid-table-1' }];
    const first = nextGridSheetIdentity(existing);
    const second = nextGridSheetIdentity(existing);
    expect(first).toEqual({ sheetId: 'grid-sheet-2', tableObjectId: 'grid-table-2' });
    expect(second).toEqual(first);
  });

  it('skips identities that are already taken', () => {
    const existing = [
      { id: 'grid-sheet-1', tableObjectId: 'grid-table-1' },
      { id: 'grid-sheet-2', tableObjectId: 'grid-table-9' },
    ];
    // The counter is shared by both prefixes, so the pair is unique by construction.
    expect(nextGridSheetIdentity(existing)).toEqual({ sheetId: 'grid-sheet-10', tableObjectId: 'grid-table-10' });
  });

  it('never collides when two sheets are added in the same millisecond', () => {
    const first = addSheetToDocument(createDocument(), [{ id: 'grid-sheet-1', name: 'Sheet 1', tableObjectId: 'grid-table-1' }], 'Zwei');
    const firstSheets = first.updatedDocument.gridData?.sheets ?? [];
    const second = addSheetToDocument(first.updatedDocument, firstSheets, 'Drei');
    const secondSheets = second.updatedDocument.gridData?.sheets ?? [];
    expect(new Set(secondSheets.map((sheet) => sheet.id)).size).toBe(3);
    expect(new Set(secondSheets.map((sheet) => sheet.tableObjectId)).size).toBe(3);
    for (const sheet of secondSheets) {
      expect(sheet.id).not.toContain('NaN');
      expect(second.updatedDocument.objects[sheet.tableObjectId]).toBeDefined();
    }
  });

  it('duplicates a sheet with a fresh identity that does not exist yet', () => {
    const document = createDocument();
    const result = duplicateSheetInDocument(document, document.gridData!.sheets, 'grid-sheet-1');
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.newSheetId).not.toBe('grid-sheet-1');
    expect(result.updatedDocument.gridData?.sheets).toHaveLength(2);
    expect(result.updatedDocument.objects[result.updatedDocument.gridData!.sheets[1].tableObjectId]).toBeDefined();
  });
});

describe('Grid workbook tab keyboard switching', () => {
  const tabs = [
    { id: 'a' },
    { id: 'b', hidden: true },
    { id: 'c' },
  ];

  it('switches to the next visible sheet on Ctrl+PageDown and skips hidden sheets', () => {
    expect(resolveGridWorkbookTabKey({ key: 'PageDown', ctrlKey: true }, tabs, 'a')).toEqual({ kind: 'activate', sheetId: 'c' });
  });

  it('switches back on Ctrl+PageUp and stops at the first sheet', () => {
    expect(resolveGridWorkbookTabKey({ key: 'PageUp', ctrlKey: true }, tabs, 'c')).toEqual({ kind: 'activate', sheetId: 'a' });
    expect(resolveGridWorkbookTabKey({ key: 'PageUp', ctrlKey: true }, tabs, 'a')).toEqual({ kind: 'none' });
  });

  it('stops at the last sheet instead of wrapping around', () => {
    expect(resolveGridWorkbookTabKey({ key: 'PageDown', ctrlKey: true }, tabs, 'c')).toEqual({ kind: 'none' });
    expect(nextGridWorkbookTabIndex(tabs, 2, 1)).toBe(-1);
    // Without an active tab the first selectable one wins.
    expect(nextGridWorkbookTabIndex(tabs, -1, 1)).toBe(0);
  });

  it('moves with the arrow keys, Home and End on the tab strip', () => {
    expect(resolveGridWorkbookTabKey({ key: 'ArrowRight' }, tabs, 'a')).toEqual({ kind: 'activate', sheetId: 'c' });
    expect(resolveGridWorkbookTabKey({ key: 'ArrowLeft' }, tabs, 'c')).toEqual({ kind: 'activate', sheetId: 'a' });
    expect(resolveGridWorkbookTabKey({ key: 'Home' }, tabs, 'c')).toEqual({ kind: 'activate', sheetId: 'a' });
    expect(resolveGridWorkbookTabKey({ key: 'End' }, tabs, 'a')).toEqual({ kind: 'activate', sheetId: 'c' });
  });

  it('ignores unrelated keys, unmodified paging and IME composition', () => {
    expect(resolveGridWorkbookTabKey({ key: 'PageDown' }, tabs, 'a')).toEqual({ kind: 'none' });
    expect(resolveGridWorkbookTabKey({ key: 'x' }, tabs, 'a')).toEqual({ kind: 'none' });
    expect(resolveGridWorkbookTabKey({ key: 'ArrowRight', isComposing: true }, tabs, 'a')).toEqual({ kind: 'none' });
  });
});

describe('Grid structural edit risk', () => {
  const document = (): WorkspaceDocument => {
    const base = createDocument();
    return {
      ...base,
      objects: { 'grid-table-1': { type: 'Table', data: { id: 'grid-table-1', rows: 25, cols: 10, cells: { A1: { value: 'keep' }, B2: { value: 'gone' }, C3: { value: '' } } } } },
    } as unknown as WorkspaceDocument;
  };

  it('reports the occupied cells a row deletion would remove', () => {
    const risk = describeGridStructureEditRisk(document(), 'grid-sheet-1', { kind: 'delete-row', index: 1, count: 1 });
    expect(risk.dangerous).toBe(true);
    expect(risk.affectedCells).toBe(1);
    expect(risk.message).toContain('1 belegte Zelle');
  });

  it('counts only occupied cells, not empty ones', () => {
    const risk = describeGridStructureEditRisk(document(), 'grid-sheet-1', { kind: 'delete-row', index: 2, count: 1 });
    expect(risk.affectedCells).toBe(0);
    expect(risk.dangerous).toBe(false);
    expect(risk.message).toBeNull();
  });

  it('treats inserting and moving as harmless', () => {
    expect(describeGridStructureEditRisk(document(), 'grid-sheet-1', { kind: 'insert-row', index: 1, count: 2 }).dangerous).toBe(false);
    expect(describeGridStructureEditRisk(document(), 'grid-sheet-1', { kind: 'move-row', from: 1, to: 5, count: 1 }).dangerous).toBe(false);
  });

  it('is defensive for an unknown sheet or a missing table', () => {
    expect(describeGridStructureEditRisk(document(), 'nope', { kind: 'delete-row', index: 0, count: 1 }).dangerous).toBe(false);
  });
});
