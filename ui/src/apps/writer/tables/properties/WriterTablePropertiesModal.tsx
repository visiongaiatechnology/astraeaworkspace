// STATUS: PLATIN — Sovereign Table Properties Modal Orchestrator
import React, { useState } from 'react';
import {
  X,
  Table as TableIcon,
  LayoutGrid,
  Columns,
  Rows,
  Calculator,
  Palette,
} from 'lucide-react';
import type {
  WriterTableBlockData,
  WriterCellVerticalAlignment,
  WriterCellTextRotation,
} from '../../../../shared/contracts/workspace';
import {
  mergeWriterTableCells,
  splitWriterTableCell,
  splitWriterTable,
  sortWriterTable,
  resolveWriterTableColumnWidths,
} from '../operations/writerTableAdvanced';
import {
  TableGeneralTab,
  TableRowTab,
  TableStylesTab,
  TableCellTab,
  TableToolsTab,
} from './WriterTableModalTabs';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WRITER_TABLE_PROPERTIES_COPY } from './writerTablePropertiesLocale';

interface WriterTablePropertiesModalProps {
  isOpen: boolean;
  table: WriterTableBlockData | null;
  onClose: () => void;
  onUpdateTable: (updated: WriterTableBlockData) => void;
  onSplitTable?: (top: WriterTableBlockData, bottom: WriterTableBlockData) => void;
}

type TabKey = 'table' | 'styles' | 'row' | 'cell' | 'tools';

export const WriterTablePropertiesModal: React.FC<WriterTablePropertiesModalProps> = ({
  isOpen,
  table,
  onClose,
  onUpdateTable,
  onSplitTable,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = WRITER_TABLE_PROPERTIES_COPY[locale];
  const [activeTab, setActiveTab] = useState<TabKey>('table');
  const [selectedRow, setSelectedRow] = useState<number>(0);
  const [selectedCol, setSelectedCol] = useState<number>(0);

  const [mergeRange, setMergeRange] = useState({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
  const [sortCol, setSortCol] = useState<number>(0);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [sortNumeric, setSortNumeric] = useState<boolean>(false);
  const [splitAtRow, setSplitAtRow] = useState<number>(1);

  if (!isOpen || !table) return null;

  const rowCount = table.rows.length;
  const colCount = table.columns.length;
  const columnWidths = resolveWriterTableColumnWidths(table, 170);

  const handleUpdate = (patch: Partial<WriterTableBlockData>) => {
    onUpdateTable({ ...table, ...patch });
  };

  const handleWidthChange = (idx: number, val: number) => {
    const nextWidths = [...columnWidths];
    nextWidths[idx] = Math.max(10, Math.min(200, val));
    onUpdateTable({ ...table, autoFit: 'fixed', columnWidthsMm: nextWidths });
  };

  const handleExecuteMerge = () => {
    onUpdateTable(mergeWriterTableCells(table, mergeRange));
  };

  const handleExecuteSplitCell = () => {
    onUpdateTable(splitWriterTableCell(table, selectedRow, selectedCol));
  };

  const handleExecuteSort = () => {
    onUpdateTable(sortWriterTable(table, sortCol, sortDir, sortNumeric));
  };

  const handleExecuteSplitTable = () => {
    if (splitAtRow > 0 && splitAtRow < rowCount && onSplitTable) {
      const [top, bottom] = splitWriterTable(table, splitAtRow);
      onSplitTable(top, bottom);
      onClose();
    }
  };

  const handleApplyFormula = (formula: string) => {
    const nextRows = table.rows.map((row, rIdx) => {
      if (rIdx !== selectedRow) return row;
      return {
        ...row,
        cells: row.cells.map((cell, cIdx) => (cIdx === selectedCol ? { ...cell, formula, content: formula } : cell)),
      };
    });
    onUpdateTable({ ...table, rows: nextRows });
  };

  const handleSetVerticalAlign = (align: WriterCellVerticalAlignment) => {
    const nextRows = table.rows.map((row, rIdx) => {
      if (rIdx !== selectedRow) return row;
      return {
        ...row,
        cells: row.cells.map((cell, cIdx) => (cIdx === selectedCol ? { ...cell, verticalAlignment: align } : cell)),
      };
    });
    onUpdateTable({ ...table, rows: nextRows });
  };

  const handleSetTextRotation = (rot: WriterCellTextRotation) => {
    const nextRows = table.rows.map((row, rIdx) => {
      if (rIdx !== selectedRow) return row;
      return {
        ...row,
        cells: row.cells.map((cell, cIdx) => (cIdx === selectedCol ? { ...cell, textRotation: rot } : cell)),
      };
    });
    onUpdateTable({ ...table, rows: nextRows });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <TableIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-wide">{copy.title}</h2>
              <p className="text-xs text-slate-400">
                {copy.tableDimensions(rowCount, colCount, table.id.slice(0, 8))}
              </p>
            </div>
          </div>
          <button aria-label={copy.closeDialog}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-1 text-xs">
          {[
            { key: 'table', label: copy.tabs.table, icon: LayoutGrid },
            { key: 'styles', label: copy.tabs.styles, icon: Palette },
            { key: 'row', label: copy.tabs.row, icon: Rows },
            { key: 'cell', label: copy.tabs.cell, icon: Columns },
            { key: 'tools', label: copy.tabs.tools, icon: Calculator },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as TabKey)}
              className={`flex items-center gap-2 px-3 py-3 border-b-2 font-medium transition-colors ${
                activeTab === key
                  ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {activeTab === 'table' && (
            <TableGeneralTab
              table={table}
              columnWidths={columnWidths}
              onUpdate={handleUpdate}
              onWidthChange={handleWidthChange}
              copy={copy.general}
            />
          )}

          {activeTab === 'styles' && (
            <TableStylesTab table={table} onUpdate={handleUpdate} copy={{ styles: copy.styles, presets: copy.presets }} />
          )}

          {activeTab === 'row' && (
            <TableRowTab
              table={table}
              selectedRow={selectedRow}
              onSelectRow={setSelectedRow}
              onSetKeepTogether={(cantSplit) => {
                const nextRows = table.rows.map((row, idx) => (idx === selectedRow ? { ...row, cantSplit } : row));
                onUpdateTable({ ...table, rows: nextRows });
              }}
              copy={copy.row}
            />
          )}

          {activeTab === 'cell' && (
            <TableCellTab
              table={table}
              selectedRow={selectedRow}
              selectedCol={selectedCol}
              setSelectedRow={setSelectedRow}
              setSelectedCol={setSelectedCol}
              onSetVerticalAlign={handleSetVerticalAlign}
              onSetTextRotation={handleSetTextRotation}
              mergeRange={mergeRange}
              setMergeRange={setMergeRange}
              onMerge={handleExecuteMerge}
              onSplitCell={handleExecuteSplitCell}
              copy={copy.cell}
            />
          )}

          {activeTab === 'tools' && (
            <TableToolsTab
              table={table}
              selectedRow={selectedRow}
              selectedCol={selectedCol}
              onApplyFormula={handleApplyFormula}
              sortCol={sortCol}
              sortDir={sortDir}
              sortNumeric={sortNumeric}
              setSortCol={setSortCol}
              setSortDir={setSortDir}
              setSortNumeric={setSortNumeric}
              onSort={handleExecuteSort}
              splitAtRow={splitAtRow}
              setSplitAtRow={setSplitAtRow}
              onSplitTable={handleExecuteSplitTable}
              copy={copy.tools}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-800 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            {copy.close}
          </button>
        </div>
      </div>
    </div>
  );
};
