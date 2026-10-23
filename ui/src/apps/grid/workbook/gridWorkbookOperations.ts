// STATUS: DIAMANT VGT SUPREME
// React-free Astraea Grid workbook structure operations.

import type { GridCell, GridSheetModel, TableObject, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { validateWorkbookStructureMutation } from '../collaboration/gridReviewCollaboration';

export interface AddSheetResult {
  updatedDocument: WorkspaceDocument;
  newSheetId: string;
}

export interface GridSheetInitialContent {
  rows?: number;
  cols?: number;
  cells?: Record<string, GridCell>;
  tabColor?: string;
  colWidths?: Record<number, number>;
}

const MAX_IDENTIFIER_PROBE = 1_000_000;

/**
 * Deterministic, collision free sheet/table identity. The former Date.now() based
 * identity produced identical ids for two sheets created in the same millisecond
 * and was not reproducible, so it could not satisfy stable-id requirements.
 */
export function nextGridSheetIdentity(
  existing: readonly { readonly id: string; readonly tableObjectId: string }[],
): { readonly sheetId: string; readonly tableObjectId: string } {
  const used = new Set<string>();
  let highest = 0;
  for (const entry of existing) {
    used.add(entry.id);
    used.add(entry.tableObjectId);
    for (const candidate of [entry.id, entry.tableObjectId]) {
      const match = /^grid-(?:sheet|table)-(\d+)$/.exec(candidate);
      if (match) highest = Math.max(highest, Number(match[1]));
    }
  }
  let next = highest + 1;
  for (let probe = 0; probe < MAX_IDENTIFIER_PROBE; probe += 1) {
    const sheetId = `grid-sheet-${next}`;
    const tableObjectId = `grid-table-${next}`;
    if (!used.has(sheetId) && !used.has(tableObjectId)) return { sheetId, tableObjectId };
    next += 1;
  }
  throw new Error('grid_workbook_identity_exhausted');
}

export function addSheetToDocument(
  document: WorkspaceDocument,
  workbookSheets: GridSheetModel[],
  name?: string,
  initialContent: GridSheetInitialContent = {},
): AddSheetResult {
  validateWorkbookStructureMutation(document.gridData?.workbookProtection);
  const nextNo = workbookSheets.length + 1;
  const { sheetId, tableObjectId } = nextGridSheetIdentity(workbookSheets);
  const nextSheet: GridSheetModel = {
    id: sheetId,
    name: name?.trim() || `Sheet ${nextNo}`,
    tableObjectId,
    zoom: 100,
    showGridlines: true,
    ...(initialContent.tabColor ? { tabColor: initialContent.tabColor } : {}),
    ...(initialContent.colWidths ? { colWidths: initialContent.colWidths } : {}),
  };
  const updatedDocument: WorkspaceDocument = {
    ...document,
    version: document.version + 1,
    modified_at: Date.now(),
    root_object_ids: [...document.root_object_ids, tableObjectId],
    objects: {
      ...document.objects,
      [tableObjectId]: {
        type: 'Table',
        data: {
          id: tableObjectId,
          rows: initialContent.rows ?? 25,
          cols: initialContent.cols ?? 10,
          cells: initialContent.cells ?? {},
        },
      },
    },
    gridData: {
      ...(document.gridData ?? { sheets: workbookSheets }),
      sheets: [...workbookSheets, nextSheet],
      activeSheetId: sheetId,
    },
  };
  return { updatedDocument, newSheetId: sheetId };
}

export function renameSheetInDocument(document: WorkspaceDocument, sheetId: string, newName: string): WorkspaceDocument {
  if (!document.gridData || !newName.trim()) return document;
  validateWorkbookStructureMutation(document.gridData.workbookProtection);
  const name = newName.trim();
  if (document.gridData.sheets.some((sheet) => sheet.id !== sheetId && sheet.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) {
    throw new Error('sheet_name_conflict');
  }
  /**
   * GR-001 (M1) — a corrupted document may carry the same sheet id twice.
   *
   * The measured behaviour was "both sheets get renamed" for `patch`/`rename` but "only the first
   * one" for structure edits; silently mutating two sheets at once is the worse surprise and made
   * the result depend on which function the user happened to invoke. Every sheet operation now
   * targets exactly one sheet: the **first** match (the same rule `applyGridStructureEdit` uses).
   */
  const targetIndex = document.gridData.sheets.findIndex((sheet) => sheet.id === sheetId);
  if (targetIndex < 0) return document;
  const sheets = document.gridData.sheets.map((sheet, index) => (index === targetIndex ? { ...sheet, name } : sheet));
  return { ...document, version: document.version + 1, modified_at: Date.now(), gridData: { ...document.gridData, sheets } };
}

export interface DuplicateSheetResult {
  updatedDocument: WorkspaceDocument;
  newSheetId: string;
}

export function duplicateSheetInDocument(
  document: WorkspaceDocument,
  workbookSheets: GridSheetModel[],
  sheetId: string,
): DuplicateSheetResult | null {
  validateWorkbookStructureMutation(document.gridData?.workbookProtection);
  const source = workbookSheets.find((sheet) => sheet.id === sheetId);
  if (!source || !document.gridData) return null;
  const { sheetId: nextSheetId, tableObjectId: nextTableId } = nextGridSheetIdentity(workbookSheets);
  const sourceTable = document.objects[source.tableObjectId]?.data as TableObject | undefined;
  const clonedCells: Record<string, GridCell> = {};
  for (const [coord, cell] of Object.entries(sourceTable?.cells ?? {})) clonedCells[coord] = { ...cell };
  const duplicateSheet: GridSheetModel = { ...source, id: nextSheetId, name: `${source.name} (Copy)`, tableObjectId: nextTableId };
  const updatedDocument: WorkspaceDocument = {
    ...document,
    version: document.version + 1,
    modified_at: Date.now(),
    root_object_ids: [...document.root_object_ids, nextTableId],
    objects: {
      ...document.objects,
      [nextTableId]: { type: 'Table', data: { id: nextTableId, rows: sourceTable?.rows ?? 25, cols: sourceTable?.cols ?? 10, cells: clonedCells } },
    },
    gridData: { ...document.gridData, sheets: [...workbookSheets, duplicateSheet], activeSheetId: nextSheetId },
  };
  return { updatedDocument, newSheetId: nextSheetId };
}

export interface DeleteSheetResult {
  updatedDocument: WorkspaceDocument;
  nextActiveId: string;
}

export function deleteSheetFromDocument(
  document: WorkspaceDocument,
  workbookSheets: GridSheetModel[],
  sheetId: string,
  activeSheetId: string,
): DeleteSheetResult | null {
  if (workbookSheets.length <= 1 || !document.gridData) return null;
  validateWorkbookStructureMutation(document.gridData.workbookProtection);
  /**
   * GR-001 (M1) — remove exactly **one** sheet, determined by index, not by id filter.
   *
   * With a corrupted document (two sheets sharing an id) the old `filter(sheet.id !== sheetId)`
   * removed both, `remaining` became empty and `remaining[0].id` threw a TypeError. The measured
   * witness `gridMultiSheetIntegrity` pinned that throw; deleting is now deterministic and cannot
   * throw on a malformed sheet list.
   */
  const deletedIndex = workbookSheets.findIndex((sheet) => sheet.id === sheetId);
  if (deletedIndex < 0) return null;
  const deleted = workbookSheets[deletedIndex];
  const remaining = [...workbookSheets.slice(0, deletedIndex), ...workbookSheets.slice(deletedIndex + 1)];
  const nextActiveId = activeSheetId === sheetId ? (remaining[0]?.id ?? activeSheetId) : activeSheetId;
  const objects = { ...document.objects };
  delete objects[deleted.tableObjectId];
  const rootObjectIds = document.root_object_ids.filter((id) => id !== deleted.tableObjectId);
  const updatedDocument: WorkspaceDocument = {
    ...document,
    version: document.version + 1,
    modified_at: Date.now(),
    root_object_ids: rootObjectIds,
    objects,
    gridData: { ...document.gridData, sheets: remaining, activeSheetId: nextActiveId },
  };
  return { updatedDocument, nextActiveId };
}

export function reorderSheetInDocument(
  document: WorkspaceDocument,
  workbookSheets: GridSheetModel[],
  sheetId: string,
  direction: 'left' | 'right',
): WorkspaceDocument | null {
  if (!document.gridData) return null;
  validateWorkbookStructureMutation(document.gridData.workbookProtection);
  const index = workbookSheets.findIndex((sheet) => sheet.id === sheetId);
  if (index < 0) return null;
  const targetIndex = direction === 'left' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= workbookSheets.length) return null;
  const sheets = [...workbookSheets];
  const [removed] = sheets.splice(index, 1);
  sheets.splice(targetIndex, 0, removed);
  return { ...document, version: document.version + 1, modified_at: Date.now(), gridData: { ...document.gridData, sheets } };
}

export function changeTabColorInDocument(document: WorkspaceDocument, sheetId: string, tabColor?: string): WorkspaceDocument {
  if (!document.gridData) return document;
  // First match only (see `renameSheetInDocument`): duplicate ids must not mutate two sheets.
  const targetIndex = document.gridData.sheets.findIndex((sheet) => sheet.id === sheetId);
  if (targetIndex < 0) return document;
  const sheets = document.gridData.sheets.map((sheet, index) => (index === targetIndex ? { ...sheet, tabColor } : sheet));
  return { ...document, version: document.version + 1, modified_at: Date.now(), gridData: { ...document.gridData, sheets } };
}

export function patchSheetInDocument(
  document: WorkspaceDocument,
  sheetId: string,
  patch: Partial<GridSheetModel>,
): WorkspaceDocument {
  if (!document.gridData) return document;
  // First match only (see `renameSheetInDocument`): duplicate ids must not mutate two sheets.
  const targetIndex = document.gridData.sheets.findIndex((sheet) => sheet.id === sheetId);
  if (targetIndex < 0) return document;
  const sheets = document.gridData.sheets.map((sheet, index) => (index === targetIndex ? { ...sheet, ...patch } : sheet));
  return { ...document, version: document.version + 1, modified_at: Date.now(), gridData: { ...document.gridData, sheets } };
}

export function setSheetVisibilityInDocument(
  document: WorkspaceDocument,
  sheetId: string,
  visibility: 'visible'|'hidden'|'very-hidden',
): WorkspaceDocument {
  if (!document.gridData) return document;
  validateWorkbookStructureMutation(document.gridData.workbookProtection);
  const target = document.gridData.sheets.find((sheet) => sheet.id === sheetId);
  if (!target) return document;
  if (visibility !== 'visible') {
    const otherVisible = document.gridData.sheets.some((sheet) => sheet.id !== sheetId && !sheet.hidden && !sheet.veryHidden);
    if (!otherVisible) throw new Error('workbook_requires_visible_sheet');
  }
  const sheets = document.gridData.sheets.map((sheet) => sheet.id === sheetId
    ? { ...sheet, hidden: visibility === 'hidden', veryHidden: visibility === 'very-hidden' }
    : sheet);
  const activeSheetId = (visibility !== 'visible' && document.gridData.activeSheetId === sheetId)
    ? sheets.find((sheet) => !sheet.hidden && !sheet.veryHidden)?.id
    : document.gridData.activeSheetId;
  return { ...document, version: document.version + 1, modified_at: Date.now(), gridData: { ...document.gridData, sheets, activeSheetId } };
}
