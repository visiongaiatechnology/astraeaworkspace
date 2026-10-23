import React, { useState } from 'react';
import {
  GridPivotDefinition,
  GridPrintSettings,
  GridSheetModel,
  GridNamedRange,
  GridCell,
  GridStructuredTable,
  GridTableColumn,
  ChartObject,
  ReferenceMode,
  GridDataModel,
  GridPublishObjectDefinition,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import { BarChart3, Filter, Link2, Palette, Printer, Table2, X, SlidersHorizontal } from 'lucide-react';
import { GridPrintPanel } from '../print/GridPrintPanel';
import type { GridPortableExportFormat } from '../interchange/gridPortableExport';
import { GridFormattingPanel } from '../formatting/GridFormattingPanel';
import type { GridFormatIssue } from '../formatting/gridFormatValidation';
import type { GridNumberFormatId } from '../formatting/gridNumberFormat';
import type { GridStructuredTableTheme } from '../formatting/gridFormattingEngine';
import { GridTablePanel } from '../tables/GridTablePanel';
import { GridDataPanel } from './GridDataPanel';
import type { GridTableInterchangeFormat } from '../tables/interchange/gridStructuredTableInterop';
import { GridVisualizationPanel } from '../charts/GridVisualizationPanel';
import { GridPivotPanel } from '../pivots/GridPivotPanel';
import type { GridDataModelTableInput } from '../pivots/gridDataModel';
import type { GridChartPublishTarget } from '../integrations/gridChartPublish';
import { GridIntegrationPanel } from '../integrations/GridIntegrationPanel';
import type { GridPublishRequest, GridWorkspacePublishTarget } from '../integrations/gridWorkspacePublish';
import { GridSheetEditPanel } from './GridSheetEditPanel';
import type { FlashFillTransform, GridGoToSpecialKind, GridTransferMode } from '../editing/gridAdvancedEditing';
import type { GridStructureEdit } from '../workbook/gridWorkbookStructure';
import type { GridRichTextRun } from '../editing/gridCellTypes';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_OFFICE_COPY } from '../locale/gridOfficeLocale';

interface GridProfessionalPanelProps {
  sheet: GridSheetModel;
  selectedCell: string;
  selectedRange: string;
  namedRanges: GridNamedRange[];
  activeCell?: GridCell;
  onUpdateSheet: (patch: Partial<GridSheetModel>) => void;
  cells: Record<string, GridCell>;
  /** Active sheet extents; the data panel uses them to validate and preview a multi-level sort. */
  rowCount?: number;
  colCount?: number;
  dataModel?: GridDataModel;
  dataModelTables: GridDataModelTableInput[];
  onCreatePivot: (definition: GridPivotDefinition) => void;
  onUpdatePivot: (definition: GridPivotDefinition) => void;
  onUpdateDataModel: (model: GridDataModel) => void;
  onCreateNamedRange: (name: string) => void;
  onDeleteNamedRange: (id: string) => void;
  onSelectNamedRange: (range: GridNamedRange) => void;
  onApplyFormat: (patch: Partial<GridCell>) => GridFormatIssue | null;
  onApplyNumberFormat: (id: GridNumberFormatId) => void;
  onApplyCellStyle: (styleName: string) => void;
  onApplyTableStyle: (tableId: string, theme: GridStructuredTableTheme) => void;
  onFillSelection: () => void;
  formatPainterActive: boolean;
  onToggleFormatPainter: () => void;
  onApplyFormatPainter: () => void;
  onAutoFitSelection: () => void;
  onTableCreate: (options: { range: string; name?: string; hasHeaders: boolean; styleTheme: NonNullable<GridStructuredTable['styleTheme']> }) => void;
  onTableRename: (tableId: string, name: string) => void;
  onTablePatch: (tableId: string, patch: Partial<GridStructuredTable>) => void;
  onTableToggleTotals: (tableId: string) => void;
  onTableSetTotalFunction: (tableId: string, columnName: string, fn: GridTableColumn['totalFunction']) => void;
  onTableSetCalculatedColumn: (tableId: string, columnName: string, formula: string) => void;
  onTableExport: (tableId: string, format: GridTableInterchangeFormat) => void;
  onTableImport: (text: string, format: GridTableInterchangeFormat, name?: string) => void;
  onTablePublishDataset: (tableId: string) => Promise<string>;
  onOpenValidation: () => void;
  onOpenSlicers: () => void;
  onToggleCircleInvalid: () => void;
  isCirclingInvalid: boolean;
  charts: ChartObject[];
  chartPublishTargets: GridChartPublishTarget[];
  onOpenChartStudio: () => void;
  onApplySparkline: (sourceRange: string, targetCell: string, type: 'line'|'column'|'win-loss', color: string) => void;
  /** `slideIndex` ist nur für ein Present-Ziel bedeutsam und wird sonst ignoriert. */
  onPublishChart: (chartId: string, targetDocumentId: string, mode: ReferenceMode, slideIndex?: number) => void;
  onPrint: () => void;
  onExportPdf: (scope: 'selection'|'all-visible-sheets') => void;
  onExportPortable: (format: GridPortableExportFormat, range?: string) => void;
  workspaceDocuments: WorkspaceDocument[];
  publishObjects: GridPublishObjectDefinition[];
  publishTargets: GridWorkspacePublishTarget[];
  onCreatePublishObject: (request: GridPublishRequest) => void;
  onDeletePublishObject: (id: string) => void;
  onPublishObject: (definitionId: string, targetDocumentId: string, mode: ReferenceMode) => void;
  onProtectToVault: (definitionId: string, vaultDocumentId: string) => Promise<string>;
  selectionRanges: string[];
  workbookLocale: string;
  workbookCalculationMode: 'automatic'|'manual'|'automatic-except-data-tables';
  onPatchWorkbook: (patch: { locale?: string; calculationMode?: 'automatic'|'manual'|'automatic-except-data-tables'; properties?: Record<string,string> }) => void;
  onStructureEdit: (edit: GridStructureEdit) => void;
  onSetAxisHidden: (axis: 'row'|'col', hidden: boolean) => void;
  onGroupAxis: (axis: 'row'|'col', collapsed?: boolean) => void;
  onGoTo: (target: string) => boolean;
  onGoToSpecial: (kind: GridGoToSpecialKind) => number;
  onTransferSelection: (target: string, mode: GridTransferMode) => boolean;
  onFlashFill: (target: string, transform: FlashFillTransform) => number;
  onAddDisjoint: () => void;
  onClearDisjoint: () => void;
  onSetRichTextCell: (coord: string, runs: readonly GridRichTextRun[]) => void;
  onClose: () => void;
}

type PanelTab = 'sheet' | 'data' | 'tables' | 'conditional' | 'visualize' | 'pivot' | 'integrate' | 'print';

const defaultPrint: GridPrintSettings = {
  paperSize: 'A4', orientation: 'portrait', margins: 'normal', fitToWidth: true, showGridlines: true, repeatHeaderRow: true,
};

export const GridProfessionalPanel: React.FC<GridProfessionalPanelProps> = ({
  sheet, selectedCell, selectedRange, namedRanges, activeCell, onUpdateSheet, cells, rowCount, colCount, dataModel, dataModelTables, onCreatePivot, onUpdatePivot, onUpdateDataModel, onCreateNamedRange, onDeleteNamedRange, onSelectNamedRange, onApplyFormat, onApplyNumberFormat, onApplyTableStyle, onFillSelection, formatPainterActive, onApplyCellStyle, onToggleFormatPainter, onApplyFormatPainter, onAutoFitSelection, onTableCreate, onTableRename, onTablePatch, onTableToggleTotals, onTableSetTotalFunction, onTableSetCalculatedColumn, onTableExport, onTableImport, onTablePublishDataset, onOpenValidation, onOpenSlicers, onToggleCircleInvalid, isCirclingInvalid, charts, chartPublishTargets, onOpenChartStudio, onApplySparkline, onPublishChart, onPrint, onExportPdf, onExportPortable, workspaceDocuments, publishObjects, publishTargets, onCreatePublishObject, onDeletePublishObject, onPublishObject, onProtectToVault, selectionRanges, workbookLocale, workbookCalculationMode, onPatchWorkbook, onStructureEdit, onSetAxisHidden, onGroupAxis, onGoTo, onGoToSpecial, onTransferSelection, onFlashFill, onAddDisjoint, onClearDisjoint, onSetRichTextCell, onClose,
}) => {
  const [tab, setTab] = useState<PanelTab>('sheet');
  const { locale } = useWorkspaceLocale();
  const copy = GRID_OFFICE_COPY[locale].professional;

  const printSettings = sheet.printSettings ?? defaultPrint;
  const tabButton = (value: PanelTab, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => setTab(value)} className={`min-w-0 flex-1 flex items-center justify-center gap-1 px-1.5 py-2 rounded text-[0.6875rem] leading-tight text-center break-words ${tab === value ? 'bg-blue-600/25 text-blue-200 border border-blue-500/30' : 'text-slate-400 hover:bg-white/5'}`}>
      {icon}{label}
    </button>
  );


  return <aside className="w-full max-w-[360px] shrink-0 border-l border-white/10 bg-slate-950/95 flex flex-col overflow-hidden">
    <div className="h-11 px-3 flex items-center justify-between border-b border-white/10">
      <div className="min-w-0"><div className="truncate text-xs font-bold text-white" title={copy.title}>{copy.title}</div><div className="truncate text-[0.625rem] text-slate-500">{sheet.name}</div></div>
      <button aria-label={copy.close} type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-slate-400"><X className="w-4 h-4"/></button>
    </div>
    <div className="p-2 grid grid-cols-4 gap-1 border-b border-white/10">
      {tabButton('sheet',copy.tabs.sheet,<SlidersHorizontal className="w-3 h-3 shrink-0"/>)}
      {tabButton('data',copy.tabs.data,<Filter className="w-3 h-3 shrink-0"/>)}
      {tabButton('tables',copy.tabs.tables,<Table2 className="w-3 h-3 shrink-0"/>)}
      {tabButton('conditional',copy.tabs.conditional,<Palette className="w-3 h-3 shrink-0"/>)}
      {tabButton('visualize',copy.tabs.visualize,<BarChart3 className="w-3 h-3 shrink-0"/>)}
      {tabButton('pivot',copy.tabs.pivot,<Table2 className="w-3 h-3 shrink-0"/>)}
      {tabButton('integrate',copy.tabs.integrate,<Link2 className="w-3 h-3 shrink-0"/>)}
      {tabButton('print',copy.tabs.print,<Printer className="w-3 h-3 shrink-0"/>)}
    </div>
    <div className="flex-1 overflow-auto p-3 text-xs space-y-4">
      {tab === 'sheet' && <GridSheetEditPanel sheet={sheet} selectedCell={selectedCell} selectedRange={selectedRange} selectionRanges={selectionRanges} locale={workbookLocale} calculationMode={workbookCalculationMode} onUpdateSheet={onUpdateSheet} onPatchWorkbook={onPatchWorkbook} onStructureEdit={onStructureEdit} onSetAxisHidden={onSetAxisHidden} onGroupAxis={onGroupAxis} onGoTo={onGoTo} onGoToSpecial={onGoToSpecial} onTransferSelection={onTransferSelection} onFlashFill={onFlashFill} onAddDisjoint={onAddDisjoint} onClearDisjoint={onClearDisjoint} onSetRichTextCell={onSetRichTextCell} />}
      {tab === 'data' && <GridDataPanel
        sheet={sheet}
        selectedRange={selectedRange}
        namedRanges={namedRanges}
        onUpdateSheet={onUpdateSheet}
        onCreateNamedRange={onCreateNamedRange}
        onDeleteNamedRange={onDeleteNamedRange}
        onSelectNamedRange={onSelectNamedRange}
        onFillSelection={onFillSelection}
        onOpenValidation={onOpenValidation}
        onOpenSlicers={onOpenSlicers}
        onToggleCircleInvalid={onToggleCircleInvalid}
        isCirclingInvalid={isCirclingInvalid}
        cells={cells}
        columnCount={colCount}
        rowCount={rowCount}
      />}
      {tab === 'tables' && <GridTablePanel
        tables={sheet.tables ?? []}
        selectedRange={selectedRange}
        onCreate={onTableCreate}
        onRename={onTableRename}
        onPatch={onTablePatch}
        onToggleTotals={onTableToggleTotals}
        onSetTotalFunction={onTableSetTotalFunction}
        onSetCalculatedColumn={onTableSetCalculatedColumn}
        onExport={onTableExport}
        onImport={onTableImport}
        onPublishDataset={onTablePublishDataset}
      />}
      {tab === 'conditional' && <GridFormattingPanel
        sheet={sheet}
        selectedRange={selectedRange}
        selectedCell={selectedCell}
        activeCell={activeCell}
        cells={cells}
        formatPainterActive={formatPainterActive}
        onUpdateSheet={onUpdateSheet}
        onApplyFormat={onApplyFormat}
        onApplyNumberFormat={onApplyNumberFormat}
        onApplyCellStyle={onApplyCellStyle}
        onApplyTableStyle={onApplyTableStyle}
        onToggleFormatPainter={onToggleFormatPainter}
        onApplyFormatPainter={onApplyFormatPainter}
        onAutoFitSelection={onAutoFitSelection}
      />}
      {tab === 'visualize' && <GridVisualizationPanel selectedCell={selectedCell} selectedRange={selectedRange} charts={charts} publishTargets={chartPublishTargets} onOpenChartStudio={onOpenChartStudio} onApplySparkline={onApplySparkline} onPublishChart={onPublishChart} />}
      {tab === 'pivot' && <GridPivotPanel sheet={sheet} cells={cells} dataModel={dataModel} dataModelTables={dataModelTables} onCreatePivot={onCreatePivot} onUpdatePivot={onUpdatePivot} onUpdateDataModel={onUpdateDataModel} />}
      {tab === 'integrate' && <GridIntegrationPanel sheet={sheet} selectedCell={selectedCell} selectedRange={selectedRange} publishObjects={publishObjects} publishTargets={publishTargets} workspaceDocuments={workspaceDocuments} tables={sheet.tables ?? []} onCreatePublishObject={onCreatePublishObject} onDeletePublishObject={onDeletePublishObject} onPublishObject={onPublishObject} onProtectToVault={onProtectToVault} />}
      {tab === 'print' && <GridPrintPanel settings={printSettings} selectedRange={selectedRange} onChange={(next)=>onUpdateSheet({printSettings:next})} onPrint={onPrint} onExportPdf={onExportPdf} onExportPortable={onExportPortable}/>}
    </div>
  </aside>;
};
