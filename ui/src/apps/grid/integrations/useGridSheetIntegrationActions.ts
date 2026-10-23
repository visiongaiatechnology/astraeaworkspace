import { useCallback } from 'react';
import type { GridCell, GridPrintSettings, GridSheetModel, ReferenceMode, TableObject, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { buildGridCsv, downloadGridCsv } from '../interchange/gridCsv';
import { buildGridPdf, downloadGridPdf } from '../interchange/gridPdfExport';
import { buildGridPortableExport, downloadGridPortableExport, type GridPortableExportFormat } from '../interchange/gridPortableExport';
import {
  buildGridWorkbookExport,
  downloadGridWorkbookExport,
  gridExportRecordSummary,
  type GridWorkbookExportFormat,
} from '../interchange/gridWorkbookExport';
import { buildGridPrintableHtml, printGridSheet } from '../print/gridPrint';
import { applySparklineToCell } from '../visualization/gridSparklineEngine';
import { publishGridChartToWorkspaceTargetDetailed } from './gridChartPublish';
import { createGridPublishObject, deleteGridPublishObject, publishGridObjectToWorkspaceTarget, type GridPublishRequest } from './gridWorkspacePublish';
import { appendProtectedGridDatasetToVault, createProtectedGridDatasetVaultFile } from './gridWorkspaceSecureExchange';
import { gridExportDeliveryText, gridExportFailureText } from '../interchange/gridExportStatus';

interface IntegrationActionsArgs {
  document: WorkspaceDocument;
  workspaceDocuments?: Record<string, WorkspaceDocument>;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  persistWorkspaceDocument: (doc: WorkspaceDocument) => void;
  activeSheetModel?: GridSheetModel;
  workbookSheets: NonNullable<WorkspaceDocument['gridData']>['sheets'];
  primaryTableId?: string;
  tableObj: TableObject | null;
  cells: Record<string, GridCell>;
  visibleRowIndices: readonly number[];
  colCount: number;
  rowCount: number;
  selectedRange: string;
  setValidationError: (value: string | null) => void;
  /** Optional non-error channel for the honest export preservation report. */
  onExportNotice?: (message: string | null) => void;
}

export function useGridSheetIntegrationActions(args: IntegrationActionsArgs) {
  const handleApplySparkline = useCallback((sourceRange: string, targetCell: string, type: 'line'|'column'|'win-loss', color: string) => {
    if (!args.primaryTableId || !args.tableObj) return;
    try {
      const updatedCells = applySparklineToCell(args.cells, targetCell, sourceRange, type, color);
      args.onUpdateDocument({ ...args.document, version: args.document.version + 1, modified_at: Date.now(), objects: { ...args.document.objects, [args.primaryTableId]: { type: 'Table', data: { ...args.tableObj, cells: updatedCells } } } });
      args.setValidationError(null);
    } catch (error) { args.setValidationError(error instanceof Error ? error.message : 'Sparkline creation failed.'); }
  }, [args]);

  const handlePublishChart = useCallback((chartId: string, targetDocumentId: string, mode: ReferenceMode, slideIndex?: number) => {
    const target = args.workspaceDocuments?.[targetDocumentId];
    if (!target) { args.setValidationError('Chart publish target is unavailable.'); return; }
    try {
      const outcome = publishGridChartToWorkspaceTargetDetailed(args.document, chartId, target, mode, slideIndex);
      args.persistWorkspaceDocument(outcome.document);
      args.setValidationError(null);
      args.onExportNotice?.(outcome.summary);
    }
    catch (error) { args.onExportNotice?.(null); args.setValidationError(error instanceof Error ? error.message : 'Chart publish failed.'); }
  }, [args]);

  const handleCreatePublishObject = useCallback((request: GridPublishRequest) => {
    try { args.onUpdateDocument(createGridPublishObject(args.document, request)); args.setValidationError(null); }
    catch (error) { args.setValidationError(error instanceof Error ? error.message : 'Grid publish object creation failed.'); }
  }, [args]);
  const handleDeletePublishObject = useCallback((definitionId: string) => {
    try { args.onUpdateDocument(deleteGridPublishObject(args.document, definitionId)); args.setValidationError(null); }
    catch (error) { args.setValidationError(error instanceof Error ? error.message : 'Grid publish object deletion failed.'); }
  }, [args]);
  const handlePublishObject = useCallback((definitionId: string, targetDocumentId: string, mode: ReferenceMode) => {
    const target = args.workspaceDocuments?.[targetDocumentId];
    if (!target) { args.setValidationError('Workspace publish target is unavailable.'); return; }
    try { args.persistWorkspaceDocument(publishGridObjectToWorkspaceTarget(args.document, definitionId, target, mode)); args.setValidationError(null); }
    catch (error) { args.setValidationError(error instanceof Error ? error.message : 'Workspace publish failed.'); }
  }, [args]);

  const handleProtectToVault = useCallback(async (definitionId: string, vaultDocumentId: string): Promise<string> => {
    const vault = args.workspaceDocuments?.[vaultDocumentId];
    if (!vault) throw new Error('Vault target is unavailable.');
    const file = await createProtectedGridDatasetVaultFile(args.document, definitionId);
    args.persistWorkspaceDocument(appendProtectedGridDatasetToVault(vault, file));
    return `Encrypted VGT dataset sealed · ${file.name} · SHA-256 ${file.encryptedHash.slice(0, 16)}…`;
  }, [args]);

  const handlePrintSheet = useCallback(() => {
    if (!args.activeSheetModel) return;
    const settings: GridPrintSettings = args.activeSheetModel.printSettings ?? { paperSize: 'A4', orientation: 'portrait', margins: 'normal', fitToWidth: true, showGridlines: true, repeatHeaderRow: true };
    try {
      printGridSheet(buildGridPrintableHtml(args.document.title, args.activeSheetModel.name, args.cells, Array.from(args.visibleRowIndices), args.colCount, settings));
      // A print preview is not an exported file; the status must never claim one.
      args.setValidationError(null);
      args.onExportNotice?.('Druckvorschau geöffnet — der Systemdialog übernimmt die Druckausgabe, es wurde keine Datei exportiert.');
    }
    catch (error) { args.onExportNotice?.(null); args.setValidationError(error instanceof Error ? error.message : 'Unable to open print preview.'); }
  }, [args]);

  const handleExportCsv = useCallback(async () => {
    try {
      const result = await downloadGridCsv(buildGridCsv(args.cells, args.colCount, args.rowCount), `${args.document.title.replace(/\s+/g, '_')}_${args.activeSheetModel?.name ?? 'Sheet'}.csv`);
      args.setValidationError(null);
      args.onExportNotice?.(gridExportDeliveryText(result));
    } catch (error) { args.onExportNotice?.(null); args.setValidationError(gridExportFailureText(error)); }
  }, [args]);
  const handleExportPortable = useCallback(async (format: GridPortableExportFormat, range?: string) => {
    try {
      const text = buildGridPortableExport(args.cells, args.colCount, args.rowCount, format, { range, locale: args.document.gridData?.locale, localeAware: true });
      const result = await downloadGridPortableExport(text, format, `${args.document.title.replace(/\s+/g, '_')}_${args.activeSheetModel?.name ?? 'Sheet'}.${format}`);
      args.setValidationError(null);
      args.onExportNotice?.(gridExportDeliveryText(result));
    } catch (error) { args.onExportNotice?.(null); args.setValidationError(gridExportFailureText(error)); }
  }, [args]);
  const handleExportPdf = useCallback(async (scope: 'selection' | 'all-visible-sheets') => {
    if (!args.activeSheetModel) return;
    try {
      const selections = scope === 'selection'
        ? [{ sheetId: args.activeSheetModel.id, range: args.selectedRange }]
        : args.workbookSheets.filter((sheet) => !sheet.hidden && !sheet.veryHidden).map((sheet) => ({ sheetId: sheet.id, range: sheet.printSettings?.printArea }));
      const result = await downloadGridPdf(buildGridPdf(args.document, selections), `${args.document.title.replace(/\s+/g, '_')}.pdf`);
      args.setValidationError(null);
      args.onExportNotice?.(gridExportDeliveryText(result));
    } catch (error) { args.onExportNotice?.(null); args.setValidationError(gridExportFailureText(error)); }
  }, [args]);

  /**
   * Real XLSX/ODS workbook export. The built package is structurally verified (ZIP container +
   * mandatory parts) and the preservation record is surfaced so the user sees what was and was not kept.
   */
  const handleExportWorkbook = useCallback(async (format: GridWorkbookExportFormat): Promise<boolean> => {
    try {
      const exported = await buildGridWorkbookExport(args.document, format);
      const delivery = await downloadGridWorkbookExport(exported.bytes, exported.fileName, format);
      args.setValidationError(null);
      args.onExportNotice?.(`${gridExportRecordSummary(exported.record)} · ${gridExportDeliveryText(delivery)}`);
      return true;
    } catch (error) {
      args.onExportNotice?.(null);
      args.setValidationError(gridExportFailureText(error));
      return false;
    }
  }, [args]);

  return { handleApplySparkline, handlePublishChart, handleCreatePublishObject, handleDeletePublishObject, handlePublishObject, handleProtectToVault, handlePrintSheet, handleExportCsv, handleExportPortable, handleExportPdf, handleExportWorkbook };
}
