import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type {
  GridAnalysisAuditKind,
  GridCell,
  GridCellComment,
  GridDataModel,
  GridNamedRange,
  GridPivotDefinition,
  GridSheetModel,
  GridStructuredTable,
  GridTableColumn,
  TableObject,
  WorkspaceDocument,
} from '../../../../shared/contracts/workspace';
import { buildPivotTableModel, pivotTableModelToCells } from '../../pivots/gridPivotModel';
import { isValidGridNamedRangeName } from '../../editing/gridSelection';
import { createStructuredTable, renameStructuredTable, setStructuredTableTotalFunction, toggleTableTotalsRow } from '../../tables/gridStructuredTables';
import { validateTableRange } from '../../data/gridStructuredTableModel';
import { createTableWorkspaceDataset, propagateColumnFormula } from '../../tables/gridTableFeatures';
import { importStructuredTableData, type GridTableInterchangeFormat } from '../../tables/interchange/gridStructuredTableInterop';
import { deliverGridTableExport } from '../../interchange/gridTableExport';
import { gridExportDeliveryText, gridExportFailureText } from '../../interchange/gridExportStatus';
import { appendGridComment, resolveGridCommentThread, validateWorkbookStructureMutation } from '../../collaboration/gridReviewCollaboration';
import { createGridAnalysisAuditRecord } from '../../analysis/gridAnalysisAudit';
import { authorizeGridWorkbookCellMapMutation } from '../gridWorkbookMutationAccess';

interface GridSheetDataActionsArgs {
  document: WorkspaceDocument;
  documentRef: React.MutableRefObject<WorkspaceDocument>;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  workbookSheets: NonNullable<WorkspaceDocument['gridData']>['sheets'];
  activeSheetId: string;
  setActiveSheetId: Dispatch<SetStateAction<string>>;
  activeSheetModel?: GridSheetModel;
  primaryTableId?: string;
  tableObj: TableObject | null;
  cells: Record<string, GridCell>;
  persistCellChanges: (cells: Record<string, GridCell>, coords: readonly string[], sheetPatch?: Partial<GridSheetModel>) => boolean;
  selectedCell: string;
  selectedRange: string;
  setSelectedCell: Dispatch<SetStateAction<string>>;
  setSelectionAnchor: Dispatch<SetStateAction<string>>;
  setSelectionFocus: Dispatch<SetStateAction<string>>;
  setValidationError: Dispatch<SetStateAction<string | null>>;
  /** Optional non-error channel: honest export success/download status. */
  onExportNotice?: (message: string | null) => void;
  updateActiveSheet: (patch: Partial<GridSheetModel>) => void;
}

export function useGridSheetDataActions(args: GridSheetDataActionsArgs) {
  const handleCreatePivot = useCallback((definition: GridPivotDefinition) => {
    if (!args.tableObj || !args.primaryTableId || !args.document.gridData || !args.activeSheetModel) return;
    try {
      validateWorkbookStructureMutation(args.document.gridData.workbookProtection);
      const model = buildPivotTableModel(args.cells, definition);
      const tableObjectId = `grid-pivot-table-${definition.id}`;
      const sheetId = `grid-pivot-sheet-${definition.id}`;
      const pivotCells = pivotTableModelToCells(model, definition);
      const sourceSheets = args.document.gridData.sheets.map((sheet) => sheet.id === args.activeSheetModel?.id
        ? { ...sheet, pivots: [...(sheet.pivots ?? []).filter((pivot) => pivot.id !== definition.id), definition] }
        : sheet);
      const sheets = [...sourceSheets.filter((sheet) => sheet.id !== sheetId), { id: sheetId, name: definition.name, tableObjectId }];
      args.onUpdateDocument({
        ...args.document, version: args.document.version + 1, modified_at: Date.now(),
        root_object_ids: args.document.root_object_ids.includes(tableObjectId) ? args.document.root_object_ids : [...args.document.root_object_ids, tableObjectId],
        objects: { ...args.document.objects, [tableObjectId]: { type: 'Table', data: { id: tableObjectId, rows: Math.max(25, model.rows.length + 2), cols: Math.max(2, model.rowFields.length + model.columnKeys.length * model.valueFields.length), cells: pivotCells } } },
        gridData: { ...args.document.gridData, sheets, activeSheetId: sheetId },
      });
      args.setActiveSheetId(sheetId);
      args.setValidationError(null);
    } catch (error) {
      args.setValidationError(error instanceof Error && error.message === 'grid_workbook_structure_protected'
        ? 'Workbook structure is protected. Pivot tables cannot be created or changed.'
        : error instanceof Error ? error.message : 'Pivot creation failed.');
    }
  }, [args]);

  const handleUpdatePivotDefinition = useCallback((definition: GridPivotDefinition) => {
    if (!args.document.gridData || !args.activeSheetModel || !args.tableObj) return;
    try {
      validateWorkbookStructureMutation(args.document.gridData.workbookProtection);
      const model = buildPivotTableModel(args.cells, definition);
      const derivedTableId = `grid-pivot-table-${definition.id}`;
      const existing = args.document.objects[derivedTableId];
      const sheets = args.document.gridData.sheets.map((sheet) => sheet.id === args.activeSheetModel?.id
        ? { ...sheet, pivots: (sheet.pivots ?? []).map((pivot) => pivot.id === definition.id ? definition : pivot) }
        : sheet);
      args.onUpdateDocument({
        ...args.document, version: args.document.version + 1, modified_at: Date.now(),
        objects: existing?.type === 'Table' ? { ...args.document.objects, [derivedTableId]: { type: 'Table', data: { ...existing.data, cells: pivotTableModelToCells(model, definition), rows: Math.max(25, model.rows.length + 2), cols: Math.max(2, model.rowFields.length + model.columnKeys.length * model.valueFields.length) } } } : args.document.objects,
        gridData: { ...args.document.gridData, sheets },
      });
      args.setValidationError(null);
    } catch (error) {
      args.setValidationError(error instanceof Error && error.message === 'grid_workbook_structure_protected'
        ? 'Workbook structure is protected. Pivot tables cannot be created or changed.'
        : error instanceof Error ? error.message : 'Pivot refresh failed.');
    }
  }, [args]);

  const handleUpdateDataModel = useCallback((dataModel: GridDataModel) => {
    if (!args.document.gridData) return;
    try {
      validateWorkbookStructureMutation(args.document.gridData.workbookProtection);
      args.onUpdateDocument({ ...args.document, version: args.document.version + 1, modified_at: Date.now(), gridData: { ...args.document.gridData, dataModel } });
      args.setValidationError(null);
    } catch (error) {
      args.setValidationError(error instanceof Error && error.message === 'grid_workbook_structure_protected'
        ? 'Workbook structure is protected. The data model cannot be changed.'
        : error instanceof Error ? error.message : 'Data model update failed.');
    }
  }, [args]);

  const handleCreateNamedRange = useCallback((name: string) => {
    if (!args.document.gridData || !args.activeSheetModel) return;
    try {
      validateWorkbookStructureMutation(args.document.gridData.workbookProtection);
      const trimmed = name.trim();
      if (!isValidGridNamedRangeName(trimmed)) { args.setValidationError('Named range must start with a letter/_ and cannot look like a cell reference.'); return; }
      if ((args.document.gridData.namedRanges ?? []).some((entry) => entry.name.toLowerCase() === trimmed.toLowerCase())) { args.setValidationError(`Named range ${trimmed} already exists.`); return; }
      const named: GridNamedRange = { id: `named-range-${Date.now()}`, name: trimmed, sheetId: args.activeSheetModel.id, range: args.selectedRange };
      args.onUpdateDocument({ ...args.document, version: args.document.version + 1, modified_at: Date.now(), gridData: { ...args.document.gridData, namedRanges: [...(args.document.gridData.namedRanges ?? []), named] } });
      args.setValidationError(null);
    } catch (error) {
      args.setValidationError(error instanceof Error && error.message === 'grid_workbook_structure_protected'
        ? 'Workbook structure is protected. Named ranges cannot be changed.'
        : error instanceof Error ? error.message : 'Named range update failed.');
    }
  }, [args]);

  const handleDeleteNamedRange = useCallback((id: string) => {
    if (!args.document.gridData) return;
    try {
      validateWorkbookStructureMutation(args.document.gridData.workbookProtection);
      args.onUpdateDocument({ ...args.document, version: args.document.version + 1, modified_at: Date.now(), gridData: { ...args.document.gridData, namedRanges: (args.document.gridData.namedRanges ?? []).filter((entry) => entry.id !== id) } });
      args.setValidationError(null);
    } catch (error) {
      args.setValidationError(error instanceof Error && error.message === 'grid_workbook_structure_protected'
        ? 'Workbook structure is protected. Named ranges cannot be changed.'
        : error instanceof Error ? error.message : 'Named range update failed.');
    }
  }, [args]);

  const handleSelectNamedRange = useCallback((named: GridNamedRange) => {
    const [start, end = start] = named.range.split(':');
    if (named.sheetId !== args.activeSheetId) args.setActiveSheetId(named.sheetId);
    args.setSelectionAnchor(start); args.setSelectionFocus(end); args.setSelectedCell(start);
  }, [args]);

  const persistStructuredTableState = useCallback((nextTables: GridStructuredTable[], nextCells = args.cells): boolean => {
    if (!args.document.gridData || !args.activeSheetModel || !args.primaryTableId || !args.tableObj) return false;
    let changedCoordinates: string[];
    try {
      changedCoordinates = authorizeGridWorkbookCellMapMutation({
        workbookProtection: args.document.gridData.workbookProtection,
        currentCells: args.cells,
        proposedCells: nextCells,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'grid_workbook_structure_protected') {
        args.setValidationError('Workbook structure is protected. Structured tables cannot be changed.');
        return false;
      }
      throw error;
    }
    return args.persistCellChanges(nextCells, changedCoordinates, { tables: nextTables });
  }, [args]);

  const handleTableCreate = useCallback((options: { range: string; name?: string; hasHeaders: boolean; styleTheme: NonNullable<GridStructuredTable['styleTheme']> }) => {
    if (!args.activeSheetModel) return;
    try {
      /**
       * **Vorprüfung mit dem begrenzten Modell** (W-313): Grenzen werden genannt, eine Zeilengrenze gibt es
       * jetzt überhaupt, und die Kopfzeilen-Anforderung wird nur gestellt, wenn der Aufrufer eine Kopfzeile
       * verlangt — sonst würde eine gültige einzeilige Tabelle ohne Kopfzeile abgelehnt.
       */
      const vorab = validateTableRange(options.range).filter(
        (issue) => issue.code !== 'table_has_no_header_row' || options.hasHeaders,
      );
      if (vorab.length > 0) {
        args.setValidationError(`Tabelle abgelehnt: ${vorab.map((issue) => `${issue.code} (${issue.detail})`).join('; ')}`);
        return;
      }
      const result = createStructuredTable(options, args.cells, args.activeSheetModel.tables ?? [], args.activeSheetModel.id);
      if (!persistStructuredTableState([...(args.activeSheetModel.tables ?? []), result.table], result.updatedCells)) return;
      args.setValidationError(null);
    } catch (error) { args.setValidationError(error instanceof Error ? error.message : 'Table creation failed.'); }
  }, [args, persistStructuredTableState]);

  const handleTableRename = useCallback((tableId: string, name: string) => {
    if (!args.activeSheetModel) return;
    try {
      const tables = args.activeSheetModel.tables ?? [];
      if (!persistStructuredTableState(tables.map((table) => table.id === tableId ? renameStructuredTable(table, name, tables) : table))) return;
      args.setValidationError(null);
    } catch (error) { args.setValidationError(error instanceof Error ? error.message : 'Table rename failed.'); }
  }, [args, persistStructuredTableState]);

  const handleTablePatch = useCallback((tableId: string, patch: Partial<GridStructuredTable>) => {
    if (!args.activeSheetModel) return;
    persistStructuredTableState((args.activeSheetModel.tables ?? []).map((table) => table.id === tableId ? { ...table, ...patch, id: table.id, sheetId: table.sheetId, range: table.range, columns: table.columns } : table));
  }, [args, persistStructuredTableState]);

  const handleTableToggleTotals = useCallback((tableId: string) => {
    const tables = args.activeSheetModel?.tables ?? [], table = tables.find((item) => item.id === tableId); if (!table) return;
    const result = toggleTableTotalsRow(table, args.cells);
    persistStructuredTableState(tables.map((item) => item.id === tableId ? result.table : item), result.updatedCells);
  }, [args, persistStructuredTableState]);

  const handleTableSetTotalFunction = useCallback((tableId: string, columnName: string, fn: GridTableColumn['totalFunction']) => {
    const tables = args.activeSheetModel?.tables ?? [], table = tables.find((item) => item.id === tableId); if (!table) return;
    const result = setStructuredTableTotalFunction(table, columnName, fn, args.cells);
    persistStructuredTableState(tables.map((item) => item.id === tableId ? result.table : item), result.updatedCells);
  }, [args, persistStructuredTableState]);

  const handleTableSetCalculatedColumn = useCallback((tableId: string, columnName: string, formula: string) => {
    const tables = args.activeSheetModel?.tables ?? [], table = tables.find((item) => item.id === tableId); if (!table) return;
    if (!formula.trim().startsWith('=')) { args.setValidationError('Calculated column formula must start with =.'); return; }
    const result = propagateColumnFormula(table, columnName, formula.trim(), args.cells);
    if (!persistStructuredTableState(tables.map((item) => item.id === tableId ? result.table : item), result.updatedCells)) return;
    args.setValidationError(null);
  }, [args, persistStructuredTableState]);

  /**
   * Table export delivery. Release Beta 0.1: the previous inline anchor produced no reliable file in
   * the native WebView and reported nothing. The delivery now runs through the native save dialog +
   * atomic write and reports "gespeichert" only after the write was confirmed.
   */
  const handleTableExport = useCallback(async (tableId: string, format: GridTableInterchangeFormat) => {
    const table = args.activeSheetModel?.tables?.find((item) => item.id === tableId); if (!table) return;
    try {
      const result = await deliverGridTableExport(table, args.cells, format);
      args.setValidationError(null);
      args.onExportNotice?.(gridExportDeliveryText(result));
    } catch (error) {
      args.onExportNotice?.(null);
      args.setValidationError(gridExportFailureText(error));
    }
  }, [args]);

  const handleTableImport = useCallback((text: string, format: GridTableInterchangeFormat, name?: string) => {
    if (!args.activeSheetModel) return;
    try {
      const result = importStructuredTableData(text, format, args.activeSheetModel.id, args.selectedCell, args.activeSheetModel.tables ?? [], args.cells, name);
      if (!persistStructuredTableState([...(args.activeSheetModel.tables ?? []), result.table], result.updatedCells)) return;
      args.setValidationError(null);
    } catch (error) { args.setValidationError(error instanceof Error ? error.message : 'Table import failed.'); }
  }, [args, persistStructuredTableState]);

  const handleTablePublishDataset = useCallback(async (tableId: string): Promise<string> => {
    const table = args.activeSheetModel?.tables?.find((item) => item.id === tableId); if (!table) throw new Error('Table not found.');
    const dataset = await createTableWorkspaceDataset(table, args.cells);
    return `${dataset.datasetId} · ${dataset.recordCount} records · ${dataset.syncDigest}`;
  }, [args]);

  const handleAddComment = useCallback((comment: GridCellComment) => {
    if (args.activeSheetModel) args.updateActiveSheet({ comments: appendGridComment(args.activeSheetModel.comments ?? [], comment) });
  }, [args]);
  const handleToggleResolveComment = useCallback((id: string) => {
    if (!args.activeSheetModel) return;
    const current = (args.activeSheetModel.comments ?? []).find((comment) => comment.id === id);
    args.updateActiveSheet({ comments: resolveGridCommentThread(args.activeSheetModel.comments ?? [], id, !(current?.resolved ?? false)) });
  }, [args]);
  const handleDeleteComment = useCallback((id: string) => {
    if (args.activeSheetModel) args.updateActiveSheet({ comments: (args.activeSheetModel.comments ?? []).filter((comment) => comment.id !== id) });
  }, [args]);

  const recordAnalysisAudit = useCallback(async (kind: GridAnalysisAuditKind, input: unknown, result: unknown, summary: string) => {
    try {
      const current = args.documentRef.current;
      const record = await createGridAnalysisAuditRecord(kind, input, result, summary, current.gridData?.activeSheetId);
      const latest = args.documentRef.current;
      args.onUpdateDocument({ ...latest, version: latest.version + 1, modified_at: Date.now(), gridData: { ...(latest.gridData ?? { sheets: args.workbookSheets }), analysisAudits: [...(latest.gridData?.analysisAudits ?? []), record].slice(-256) } });
    } catch (cause) { console.error('grid_analysis_audit_failed', cause); }
  }, [args]);

  return {
    handleCreatePivot, handleUpdatePivotDefinition, handleUpdateDataModel, handleCreateNamedRange, handleDeleteNamedRange,
    handleSelectNamedRange, handleTableCreate, handleTableRename, handleTablePatch, handleTableToggleTotals,
    handleTableSetTotalFunction, handleTableSetCalculatedColumn, handleTableExport, handleTableImport, handleTablePublishDataset,
    handleAddComment, handleToggleResolveComment, handleDeleteComment, recordAnalysisAudit,
  };
}
