// STATUS: PLATIN — Modular Tab Panes for Writer Table Properties Modal
import React from 'react';
import {
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  RotateCw,
  ArrowUpDown,
  Split,
  Merge,
  Check,
} from 'lucide-react';
import type {
  WriterTableBlockData,
  WriterTableAutoFitMode,
  WriterCellVerticalAlignment,
  WriterCellTextRotation,
  WriterCaptionPosition,
} from '../../../../shared/contracts/workspace';
import { WRITER_TABLE_DESIGN_PRESETS } from '../styles/writerTableStyles';
import type { WriterTablePropertiesCopy } from './writerTablePropertiesLocale';

export interface TableGeneralTabProps {
  table: WriterTableBlockData;
  columnWidths: number[];
  onUpdate: (patch: Partial<WriterTableBlockData>) => void;
  onWidthChange: (idx: number, val: number) => void;
  copy: WriterTablePropertiesCopy['general'];
}

export const TableGeneralTab: React.FC<TableGeneralTabProps> = ({
  table,
  columnWidths,
  onUpdate,
  onWidthChange,
  copy,
}) => {
  const currentAutoFit = table.autoFit ?? 'window';

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-slate-300 font-semibold mb-2">{copy.autoFitLabel}</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { mode: 'window', ...copy.autoFit.window },
            { mode: 'contents', ...copy.autoFit.contents },
            { mode: 'fixed', ...copy.autoFit.fixed },
          ].map(({ mode, label, description }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onUpdate({ autoFit: mode as WriterTableAutoFitMode })}
              className={`p-3 rounded-xl border text-left transition-all ${
                currentAutoFit === mode
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                  : 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="font-semibold text-slate-200">{label}</div>
              <div className="text-[0.625rem] text-slate-500 mt-1">{description}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-slate-300 font-semibold mb-2">{copy.columnWidths}</label>
        <div className="grid grid-cols-4 gap-2">
          {table.columns.map((colName, idx) => (
            <div key={idx} className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
              <div className="text-[0.625rem] text-slate-400 truncate font-mono mb-1">{colName}</div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={columnWidths[idx] ?? 30}
                  onChange={(e) => onWidthChange(idx, parseFloat(e.target.value) || 20)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 text-xs"
                  step="1"
                  min="10"
                  max="200"
                />
                <span className="text-[0.625rem] text-slate-500">mm</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-3">
        <label className="block text-slate-300 font-semibold">{copy.caption}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={table.caption ?? ''}
            onChange={(e) => onUpdate({ caption: e.target.value })}
            placeholder={copy.captionPlaceholder}
            className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-indigo-500"
          />
          <select
            value={table.captionPosition ?? 'above'}
            onChange={(e) => onUpdate({ captionPosition: e.target.value as WriterCaptionPosition })}
            className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
          >
            <option value="above">{copy.captionPosition.above}</option>
            <option value="below">{copy.captionPosition.below}</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={table.repeatHeaderRow !== false}
            onChange={(e) => onUpdate({ repeatHeaderRow: e.target.checked })}
            className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
          />
          <span>{copy.repeatHeader}</span>
        </label>
      </div>
    </div>
  );
};

export interface TableRowTabProps {
  table: WriterTableBlockData;
  selectedRow: number;
  onSelectRow: (row: number) => void;
  onSetKeepTogether: (keepTogether: boolean) => void;
  copy: WriterTablePropertiesCopy['row'];
}

export const TableRowTab: React.FC<TableRowTabProps> = ({
  table,
  selectedRow,
  onSelectRow,
  onSetKeepTogether,
  copy,
}) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
      <span className="text-slate-300 font-semibold">{copy.activeRow}:</span>
      <select
        value={selectedRow}
        onChange={(event) => onSelectRow(parseInt(event.target.value, 10))}
        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
      >
        {table.rows.map((_, idx) => (
          <option key={idx} value={idx}>
            {copy.rowOption(idx + 1, Boolean(table.totalRowHighlight && idx === table.rows.length - 1))}
          </option>
        ))}
      </select>
    </div>

    <label className="flex items-center gap-2 text-slate-300 cursor-pointer bg-slate-800/30 p-3 rounded-lg border border-slate-700/40">
      <input
        type="checkbox"
        checked={table.rows[selectedRow]?.cantSplit ?? false}
        onChange={(event) => onSetKeepTogether(event.target.checked)}
        className="rounded bg-slate-800 border-slate-700 text-indigo-600"
      />
      <div>
        <div className="font-semibold text-slate-200">{copy.keepTogether}</div>
        <div className="text-[0.625rem] text-slate-400">{copy.keepTogetherHelp}</div>
      </div>
    </label>
  </div>
);

export interface TableStylesTabProps {
  table: WriterTableBlockData;
  onUpdate: (patch: Partial<WriterTableBlockData>) => void;
  copy: Pick<WriterTablePropertiesCopy, 'styles' | 'presets'>;
}

export const TableStylesTab: React.FC<TableStylesTabProps> = ({ table, onUpdate, copy }) => (
  <div className="space-y-5">
    <label className="block text-slate-300 font-semibold mb-2">{copy.styles.presets}</label>
    <div className="grid grid-cols-3 gap-2.5">
      {WRITER_TABLE_DESIGN_PRESETS.map((preset) => {
        const localizedPreset = copy.presets[preset.id] ?? {
          label: copy.styles.unknownPreset,
          description: copy.styles.unknownPresetDescription,
        };
        return (
        <button
          key={preset.id}
          type="button"
          onClick={() => onUpdate({ styleId: preset.id })}
          className={`p-3 rounded-xl border text-left transition-all ${
            (table.styleId ?? 'grid-neutral') === preset.id
              ? 'border-indigo-500 bg-indigo-500/15'
              : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-200">{localizedPreset.label}</span>
            {(table.styleId ?? 'grid-neutral') === preset.id && (
              <Check className="w-3.5 h-3.5 text-indigo-400" />
            )}
          </div>
          <div className="h-6 rounded border flex overflow-hidden" style={{ borderColor: preset.borderColor }}>
            <div className="w-1/3 h-full" style={{ backgroundColor: preset.headerBackground }} />
            <div className="w-1/3 h-full" style={{ backgroundColor: preset.rowBackground }} />
            <div className="w-1/3 h-full" style={{ backgroundColor: preset.alternateRowBackground }} />
          </div>
          <div className="text-[0.625rem] text-slate-500 mt-1.5 break-words">{localizedPreset.description}</div>
        </button>
        );
      })}
    </div>

    <div className="border-t border-slate-800 pt-4 space-y-2.5">
      <label className="block text-slate-300 font-semibold mb-2">{copy.styles.designOptions}</label>
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: 'headerRowHighlight', label: copy.styles.highlightHeader, val: table.headerRowHighlight !== false },
          { key: 'totalRowHighlight', label: copy.styles.highlightTotal, val: !!table.totalRowHighlight },
          { key: 'alternatingRows', label: copy.styles.alternatingRows, val: table.alternatingRows !== false },
          { key: 'firstColumnHighlight', label: copy.styles.highlightFirstColumn, val: !!table.firstColumnHighlight },
          { key: 'lastColumnHighlight', label: copy.styles.highlightLastColumn, val: !!table.lastColumnHighlight },
        ].map(({ key, label, val }) => (
          <label key={key} className="flex items-center gap-2 text-slate-300 cursor-pointer bg-slate-800/30 p-2 rounded-lg">
            <input
              type="checkbox"
              checked={val}
              onChange={(e) => onUpdate({ [key]: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  </div>
);

export interface TableCellTabProps {
  table: WriterTableBlockData;
  selectedRow: number;
  selectedCol: number;
  setSelectedRow: (r: number) => void;
  setSelectedCol: (c: number) => void;
  onSetVerticalAlign: (align: WriterCellVerticalAlignment) => void;
  onSetTextRotation: (rot: WriterCellTextRotation) => void;
  mergeRange: { startRow: number; startCol: number; endRow: number; endCol: number };
  setMergeRange: React.Dispatch<React.SetStateAction<{ startRow: number; startCol: number; endRow: number; endCol: number }>>;
  onMerge: () => void;
  onSplitCell: () => void;
  copy: WriterTablePropertiesCopy['cell'];
}

export const TableCellTab: React.FC<TableCellTabProps> = ({
  table,
  selectedRow,
  selectedCol,
  setSelectedRow,
  setSelectedCol,
  onSetVerticalAlign,
  onSetTextRotation,
  mergeRange,
  setMergeRange,
  onMerge,
  onSplitCell,
  copy,
}) => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
      <div>
        <label className="block text-slate-400 text-[0.625rem] mb-1 font-mono">{copy.row}</label>
        <select
          value={selectedRow}
          onChange={(e) => setSelectedRow(parseInt(e.target.value, 10))}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
        >
          {table.rows.map((_, idx) => (
            <option key={idx} value={idx}>{copy.rowOption(idx + 1)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-slate-400 text-[0.625rem] mb-1 font-mono">{copy.column}</label>
        <select
          value={selectedCol}
          onChange={(e) => setSelectedCol(parseInt(e.target.value, 10))}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
        >
          {table.columns.map((name, idx) => (
            <option key={idx} value={idx}>{name}</option>
          ))}
        </select>
      </div>
    </div>

    <div>
      <label className="block text-slate-300 font-semibold mb-2">{copy.verticalAlignment}</label>
      <div className="grid grid-cols-3 gap-2">
        {[
          { align: 'top', label: copy.alignment.top, icon: AlignVerticalJustifyStart },
          { align: 'middle', label: copy.alignment.middle, icon: AlignVerticalJustifyCenter },
          { align: 'bottom', label: copy.alignment.bottom, icon: AlignVerticalJustifyEnd },
        ].map(({ align, label, icon: Icon }) => (
          <button
            key={align}
            type="button"
            onClick={() => onSetVerticalAlign(align as WriterCellVerticalAlignment)}
            className="p-2 rounded-lg border border-slate-700/60 bg-slate-800/40 hover:border-indigo-500 flex items-center justify-center gap-2"
          >
            <Icon className="w-4 h-4 text-indigo-400" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>

    <div>
      <label className="block text-slate-300 font-semibold mb-2">{copy.textRotation}</label>
      <div className="grid grid-cols-3 gap-2">
        {[
          { rot: 0, label: copy.rotation.normal },
          { rot: 90, label: copy.rotation.vertical },
          { rot: 270, label: copy.rotation.rotated },
        ].map(({ rot, label }) => (
          <button
            key={rot}
            type="button"
            onClick={() => onSetTextRotation(rot as WriterCellTextRotation)}
            className="p-2 rounded-lg border border-slate-700/60 bg-slate-800/40 hover:border-indigo-500 flex items-center justify-center gap-2"
          >
            <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>

    <div className="border-t border-slate-800 pt-4 space-y-3">
      <label className="block text-slate-300 font-semibold">{copy.mergeSplit}</label>
      <div className="grid grid-cols-4 gap-2 text-[0.625rem]">
        <label>{copy.fromRow}<input aria-label={copy.fromRow} type="number" min="0" max={table.rows.length - 1} value={mergeRange.startRow} onChange={(e) => setMergeRange((prev) => ({ ...prev, startRow: parseInt(e.target.value, 10) || 0 }))} className="w-full bg-slate-800 p-1 rounded" /></label>
        <label>{copy.fromColumn}<input aria-label={copy.fromColumn} type="number" min="0" max={table.columns.length - 1} value={mergeRange.startCol} onChange={(e) => setMergeRange((prev) => ({ ...prev, startCol: parseInt(e.target.value, 10) || 0 }))} className="w-full bg-slate-800 p-1 rounded" /></label>
        <label>{copy.toRow}<input aria-label={copy.toRow} type="number" min="0" max={table.rows.length - 1} value={mergeRange.endRow} onChange={(e) => setMergeRange((prev) => ({ ...prev, endRow: parseInt(e.target.value, 10) || 0 }))} className="w-full bg-slate-800 p-1 rounded" /></label>
        <label>{copy.toColumn}<input aria-label={copy.toColumn} type="number" min="0" max={table.columns.length - 1} value={mergeRange.endCol} onChange={(e) => setMergeRange((prev) => ({ ...prev, endCol: parseInt(e.target.value, 10) || 0 }))} className="w-full bg-slate-800 p-1 rounded" /></label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onMerge}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
        >
          <Merge className="w-3.5 h-3.5" />
          <span>{copy.mergeRange}</span>
        </button>
        <button
          type="button"
          onClick={onSplitCell}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
        >
          <Split className="w-3.5 h-3.5" />
          <span>{copy.splitActiveCell}</span>
        </button>
      </div>
    </div>
  </div>
);

export interface TableToolsTabProps {
  table: WriterTableBlockData;
  selectedRow: number;
  selectedCol: number;
  onApplyFormula: (formula: string) => void;
  sortCol: number;
  sortDir: 'asc' | 'desc';
  sortNumeric: boolean;
  setSortCol: (c: number) => void;
  setSortDir: (d: 'asc' | 'desc') => void;
  setSortNumeric: (n: boolean) => void;
  onSort: () => void;
  splitAtRow: number;
  setSplitAtRow: (r: number) => void;
  onSplitTable?: () => void;
  copy: WriterTablePropertiesCopy['tools'];
}

export const TableToolsTab: React.FC<TableToolsTabProps> = ({
  table,
  selectedRow,
  selectedCol,
  onApplyFormula,
  sortCol,
  sortDir,
  sortNumeric,
  setSortCol,
  setSortDir,
  setSortNumeric,
  onSort,
  splitAtRow,
  setSplitAtRow,
  onSplitTable,
  copy,
}) => (
  <div className="space-y-5">
    <div>
      <label className="block text-slate-300 font-semibold mb-2">{copy.formulaInCell(selectedRow + 1, selectedCol + 1)}</label>
      <div className="grid grid-cols-4 gap-2">
        {[
          '=SUM(ABOVE)',
          '=SUM(LEFT)',
          '=AVERAGE(ABOVE)',
          '=AVERAGE(LEFT)',
          '=COUNT(ABOVE)',
          '=MIN(ABOVE)',
          '=MAX(ABOVE)',
          '=PRODUCT(ABOVE)',
        ].map((formula) => (
          <button
            key={formula}
            type="button"
            onClick={() => onApplyFormula(formula)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-indigo-600/30 text-indigo-300 border border-slate-700 hover:border-indigo-500 font-mono text-[0.6875rem] text-center"
          >
            {formula}
          </button>
        ))}
      </div>
    </div>

    <div className="border-t border-slate-800 pt-4 space-y-3">
      <label className="block text-slate-300 font-semibold">{copy.sortTableByColumn}</label>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[0.625rem] text-slate-400 mb-1">{copy.column}</label>
          <select
            value={sortCol}
            onChange={(e) => setSortCol(parseInt(e.target.value, 10))}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
          >
            {table.columns.map((colName, idx) => (
              <option key={idx} value={idx}>{colName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[0.625rem] text-slate-400 mb-1">{copy.direction}</label>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
          >
            <option value="asc">{copy.ascending}</option>
            <option value="desc">{copy.descending}</option>
          </select>
        </div>
        <div>
          <label className="block text-[0.625rem] text-slate-400 mb-1">{copy.dataType}</label>
          <select
            value={sortNumeric ? 'numeric' : 'text'}
            onChange={(e) => setSortNumeric(e.target.value === 'numeric')}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
          >
            <option value="text">{copy.text}</option>
            <option value="numeric">{copy.numeric}</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={onSort}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        <span>{copy.sortNow}</span>
      </button>
    </div>

    {table.rows.length > 2 && onSplitTable && (
      <div className="border-t border-slate-800 pt-4 space-y-3">
        <label className="block text-slate-300 font-semibold">{copy.splitTable}</label>
        <div className="flex items-center gap-3">
          <label htmlFor="writer-table-split-before-row">{copy.splitBeforeRow}</label>
          <input
            id="writer-table-split-before-row"
            type="number"
            min="1"
            max={table.rows.length - 1}
            value={splitAtRow}
            onChange={(e) => setSplitAtRow(parseInt(e.target.value, 10) || 1)}
            className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
          />
          <button
            type="button"
            onClick={onSplitTable}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
          >
            {copy.split}
          </button>
        </div>
      </div>
    )}
  </div>
);
