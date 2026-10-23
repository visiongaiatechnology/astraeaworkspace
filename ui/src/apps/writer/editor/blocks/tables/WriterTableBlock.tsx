// STATUS: PLATIN — Sovereign Editable, Styled and Evaluated Writer Table Renderer
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Table,
  Trash2,
  Columns,
  Rows,
  RefreshCw,
  SlidersHorizontal,
  Calculator,
  ArrowUpDown,
} from 'lucide-react';
import type { TableBlockData, TableRowData, TableCellData } from '../../../types';
import type { WriterStyleCatalog } from '../../../../../shared/contracts/workspace';
import {
  addWriterTableColumn,
  addWriterTableRow,
  deleteWriterTableColumn,
  deleteWriterTableRow,
  duplicateWriterTableColumn,
  duplicateWriterTableRow,
  moveWriterTableColumn,
  moveWriterTableRow,
} from '../../../tables/operations/writerTableOperations';
import {
  resolveWriterTableColumnWidths,
  resolveTableCaption,
  sortWriterTable,
} from '../../../tables/operations/writerTableAdvanced';
import {
  resolveTableCellAppearance,
  resolveTableHeaderAppearance,
} from '../../../tables/styles/writerTableStyles';
import { evaluateWriterTableFormulas } from '../../../tables/formulas/writerTableFormula';

interface WriterTableBlockProps {
  tableData: TableBlockData;
  styleCatalog: WriterStyleCatalog;
  onUpdateTable: (updated: TableBlockData) => void;
  onDeleteTable: () => void;
  repeatHeader?: boolean;
  tableIndex?: number;
  onOpenProperties?: () => void;
  readOnly?: boolean;
}

export const WriterTableBlock: React.FC<WriterTableBlockProps> = ({
  tableData,
  styleCatalog: _styleCatalog,
  onUpdateTable,
  onDeleteTable,
  repeatHeader = true,
  tableIndex = 0,
  onOpenProperties,
  readOnly = false,
}) => {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  /**
   * WR-032 — `Tab` walks the cells and grows the table in the last one.
   *
   * The cells are real inputs, so the browser already moves from cell to cell. The end
   * of the table is the interesting case: instead of leaving the table, `Tab` there
   * appends a row and continues in its first cell. The id is remembered across the
   * update because the new cell only exists after the parent re-rendered.
   */
  const pendingCellFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const cellId = pendingCellFocusRef.current;
    if (!cellId) return;
    pendingCellFocusRef.current = null;
    const cell = tableRef.current?.querySelector<HTMLElement>(`[data-writer-table-cell="${cellId}"] input`);
    cell?.focus();
  }, [tableData]);

  const isLiveLinked = tableData.gridSource?.mode === 'Live';
  const totalRows = tableData.rows.length;
  const totalCols = tableData.columns.length;

  // Resolve AutoFit column widths in mm
  const colWidths = resolveWriterTableColumnWidths(tableData, 170);

  // Evaluate any formula cells (=SUM, =AVERAGE etc.)
  const { evaluatedValues } = evaluateWriterTableFormulas(tableData);

  const handleCellChange = (rowIdx: number, cellIdx: number, value: string) => {
    const nextRows = [...tableData.rows];
    nextRows[rowIdx] = {
      ...nextRows[rowIdx],
      cells: nextRows[rowIdx].cells.map((c: TableCellData, i: number) => {
        if (i !== cellIdx) return c;
        const isFormula = value.trim().startsWith('=');
        return {
          ...c,
          content: value,
          formula: isFormula ? value.trim() : undefined,
        };
      }),
    };
    onUpdateTable({ ...tableData, rows: nextRows });
  };

  const handleHeaderChange = (colIdx: number, value: string) => {
    const nextCols = [...tableData.columns];
    nextCols[colIdx] = value;
    onUpdateTable({ ...tableData, columns: nextCols });
  };

  const handleQuickSort = (colIdx: number) => {
    const nextDir = sortDirection === 'asc' ? 'desc' : 'asc';
    setSortDirection(nextDir);
    onUpdateTable(sortWriterTable(tableData, colIdx, nextDir, true));
  };

  const handleQuickSumBelow = () => {
    const lastRowIdx = tableData.rows.length - 1;
    if (lastRowIdx >= 0) {
      const nextRows = tableData.rows.map((row, rIdx) => {
        if (rIdx !== lastRowIdx) return row;
        return {
          ...row,
          cells: row.cells.map((cell, cIdx) =>
            cIdx === totalCols - 1
              ? { ...cell, content: '=SUM(ABOVE)', formula: '=SUM(ABOVE)' }
              : cell
          ),
        };
      });
      onUpdateTable({ ...tableData, totalRowHighlight: true, rows: nextRows });
    }
  };

  const captionText = resolveTableCaption(tableData, tableIndex);
  const showCaption = Boolean(tableData.caption && tableData.caption.trim());
  const captionPosition = tableData.captionPosition ?? 'above';

  const renderCaption = () => (
    <div className="text-xs font-semibold text-slate-300 italic px-1 py-0.5 tracking-wide">
      {captionText}
    </div>
  );

  return (
    <div className="my-4 rounded-xl border border-white/10 bg-slate-950/60 p-3 shadow-md space-y-2.5 group">
      {/* Table Caption (Above) */}
      {showCaption && captionPosition === 'above' && renderCaption()}

      {/* Table Toolbar */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
        <div className="flex items-center space-x-2 text-slate-300">
          <Table className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold">{tableData.caption ? captionText : 'Tabelle'}</span>
          <span className="text-[0.625rem] text-slate-500 font-mono">
            {totalRows} × {totalCols}
          </span>
          {tableData.autoFit && (
            <span className="text-[0.5625rem] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              AutoFit: {tableData.autoFit}
            </span>
          )}
          {isLiveLinked && (
            <span
              className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.625rem] font-semibold text-emerald-300"
              title={tableData.gridSource?.uri}
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Live · v{tableData.gridSource?.sourceVersion}
            </span>
          )}
        </div>

        {!readOnly && <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
          {!isLiveLinked && (
            <>
              <button
                type="button"
                onClick={() => onUpdateTable(addWriterTableRow(tableData))}
                className="flex items-center space-x-1 px-2 py-1 rounded bg-white/5 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-300 text-[0.6875rem]"
                title="Zeile hinzufügen"
              >
                <Rows className="w-3 h-3" />
                <span>+ Zeile</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateTable(addWriterTableColumn(tableData))}
                className="flex items-center space-x-1 px-2 py-1 rounded bg-white/5 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-300 text-[0.6875rem]"
                title="Spalte hinzufügen"
              >
                <Columns className="w-3 h-3" />
                <span>+ Spalte</span>
              </button>
              <button
                type="button"
                onClick={handleQuickSumBelow}
                className="p-1 rounded bg-white/5 hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-300 text-[0.6875rem]"
                aria-label="Summenformel unten (=SUM(ABOVE))" title="Summenformel unten (=SUM(ABOVE))"
              >
                <Calculator className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {onOpenProperties && (
            <button
              type="button"
              onClick={onOpenProperties}
              className="p-1 rounded bg-white/5 hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-300"
              aria-label="Tabelleneigenschaften (Design, AutoFit, Formeln)" title="Tabelleneigenschaften (Design, AutoFit, Formeln)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onDeleteTable}
            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 ml-1"
            aria-label="Tabelle löschen" title="Tabelle löschen"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>}
      </div>

      {/* Table Grid */}
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full border-collapse text-xs table-fixed">
          {/* Column definitions */}
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}mm` }} />
            ))}
            {!readOnly && <col style={{ width: '28px' }} />}
          </colgroup>

          {/* Table Header */}
          {repeatHeader && (
            <thead>
              <tr>
                {tableData.columns.map((col: string, cIdx: number) => {
                  const headerStyle = resolveTableHeaderAppearance(tableData, cIdx, totalCols);
                  return (
                    <th
                      key={cIdx}
                      className="p-2 text-left font-bold border-r border-b"
                      style={{
                        backgroundColor: headerStyle.background,
                        color: headerStyle.color,
                        borderColor: headerStyle.borderColor,
                      }}
                    >
                      <div className="flex items-center justify-between space-x-1">
                        <input
                          type="text"
                          value={col}
                          onChange={(e) => handleHeaderChange(cIdx, e.target.value)}
                          disabled={isLiveLinked}
                          readOnly={readOnly}
                          aria-readonly={readOnly}
                          className="bg-transparent font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 w-full select-text truncate"
                          style={{ color: headerStyle.color }}
                        />
                        {!isLiveLinked && !readOnly && (
                          <div className="flex items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleQuickSort(cIdx)}
                              className="rounded p-0.5 text-slate-400 hover:text-indigo-300"
                              aria-label="Nach dieser Spalte sortieren" title="Nach dieser Spalte sortieren"
                            >
                              <ArrowUpDown className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              disabled={cIdx === 0}
                              onClick={() => onUpdateTable(moveWriterTableColumn(tableData, cIdx, cIdx - 1))}
                              className="rounded p-0.5 text-slate-500 hover:text-blue-300 disabled:opacity-20"
                              aria-label="Spalte nach links" title="Spalte nach links"
                            >
                              <ArrowLeft className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              disabled={cIdx === totalCols - 1}
                              onClick={() => onUpdateTable(moveWriterTableColumn(tableData, cIdx, cIdx + 1))}
                              className="rounded p-0.5 text-slate-500 hover:text-blue-300 disabled:opacity-20"
                              aria-label="Spalte nach rechts" title="Spalte nach rechts"
                            >
                              <ArrowRight className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdateTable(duplicateWriterTableColumn(tableData, cIdx))}
                              className="rounded p-0.5 text-slate-500 hover:text-emerald-300"
                              aria-label="Spalte duplizieren" title="Spalte duplizieren"
                            >
                              <Copy className="h-2.5 w-2.5" />
                            </button>
                            {totalCols > 1 && (
                              <button
                                type="button"
                                onClick={() => onUpdateTable(deleteWriterTableColumn(tableData, cIdx))}
                                className="rounded p-0.5 text-slate-500 hover:text-red-400"
                                aria-label="Spalte löschen" title="Spalte löschen"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
                {!readOnly && <th className="w-7 p-1 text-center bg-slate-900/50 border-b border-white/10" />}
              </tr>
            </thead>
          )}

          {/* Table Body */}
          <tbody>
            {tableData.rows.map((row: TableRowData, rIdx: number) => {
              const rowHeightStyle = row.heightMm ? { minHeight: `${row.heightMm}mm` } : undefined;

              return (
                <tr key={row.id} style={rowHeightStyle} className="border-b border-white/5">
                  {row.cells.map((cell: TableCellData, cIdx: number) => {
                    // If covered by another merged cell's colSpan/rowSpan, skip rendering
                    if (cell.mergedInto) return null;

                    const cellStyle = resolveTableCellAppearance(tableData, rIdx, cIdx, totalRows, totalCols);
                    const isFormula = Boolean(cell.formula || cell.content.trim().startsWith('='));
                    const isEditing = editingCellId === cell.id;
                    const displayValue = isEditing
                      ? cell.formula || cell.content
                      : evaluatedValues[cell.id] ?? cell.content;

                    // Vertical alignment CSS
                    let verticalAlignStyle: React.CSSProperties['verticalAlign'] = 'middle';
                    if (cell.verticalAlignment === 'top') verticalAlignStyle = 'top';
                    else if (cell.verticalAlignment === 'bottom') verticalAlignStyle = 'bottom';

                    // Text rotation style
                    const rotationStyle: React.CSSProperties = {};
                    if (cell.textRotation === 90) {
                      rotationStyle.writingMode = 'vertical-rl';
                      rotationStyle.transform = 'rotate(180deg)';
                    } else if (cell.textRotation === 270) {
                      rotationStyle.writingMode = 'vertical-rl';
                    }

                    return (
                      <td
                        key={cell.id}
                        data-writer-table-cell={cell.id}
                        colSpan={cell.colSpan}
                        rowSpan={cell.rowSpan}
                        className="p-2 border-r last:border-r-0 transition-colors"
                        style={{
                          backgroundColor: cellStyle.background,
                          color: cellStyle.color,
                          borderColor: cellStyle.borderColor,
                          fontWeight: cellStyle.fontWeight,
                          borderBottomStyle: cellStyle.borderBottomStyle as React.CSSProperties['borderBottomStyle'],
                          borderBottomWidth: cellStyle.borderBottomWidth,
                          verticalAlign: verticalAlignStyle,
                        }}
                      >
                        <div style={rotationStyle} className="w-full">
                          <input
                            type="text"
                            value={displayValue}
                            onKeyDown={(event) => {
                              /**
                               * WR-032 — `Tab` in the **last** cell grows the table.
                               *
                               * Everywhere else the browser's own tab order already walks
                               * the cells; only the end of the table needs a decision, and
                               * leaving the table there is the wrong one: the user is
                               * writing rows, not leaving the block.
                               */
                              if (event.key !== 'Tab' || event.shiftKey || readOnly || isLiveLinked) return;
                              const isLastRow = rIdx === totalRows - 1;
                              const isLastColumn = cIdx === totalCols - 1;
                              if (!isLastRow || !isLastColumn) return;
                              event.preventDefault();
                              const nextTable = addWriterTableRow(tableData);
                              const newRow = nextTable.rows[nextTable.rows.length - 1];
                              pendingCellFocusRef.current = newRow?.cells[0]?.id ?? null;
                              onUpdateTable(nextTable);
                            }}
                            onFocus={() => {
                              if (!readOnly) setEditingCellId(cell.id);
                            }}
                            onBlur={() => setEditingCellId(null)}
                            onChange={(e) => {
                              if (!readOnly) handleCellChange(rIdx, cIdx, e.target.value);
                            }}
                            disabled={isLiveLinked}
                            readOnly={readOnly}
                            aria-readonly={readOnly}
                            placeholder="..."
                            className={`bg-transparent w-full outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 select-text ${
                              isFormula && !isEditing ? 'font-mono text-emerald-300 font-semibold' : ''
                            }`}
                            style={{ color: cellStyle.color, fontWeight: cellStyle.fontWeight }}
                            title={isFormula ? `Formel: ${cell.formula || cell.content}` : undefined}
                          />
                        </div>
                      </td>
                    );
                  })}

                  {/* Row Actions Handle */}
                  {!readOnly && <td className="p-1 text-center bg-slate-900/30">
                    {!isLiveLinked && (
                      <div className="flex items-center justify-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          disabled={rIdx === 0}
                          onClick={() => onUpdateTable(moveWriterTableRow(tableData, rIdx, rIdx - 1))}
                          className="rounded p-0.5 text-slate-500 hover:text-blue-300 disabled:opacity-20"
                          aria-label="Zeile nach oben" title="Zeile nach oben"
                        >
                          <ArrowUp className="h-2.5 w-2.5" />
                        </button>
                        <button
                          type="button"
                          disabled={rIdx === totalRows - 1}
                          onClick={() => onUpdateTable(moveWriterTableRow(tableData, rIdx, rIdx + 1))}
                          className="rounded p-0.5 text-slate-500 hover:text-blue-300 disabled:opacity-20"
                          aria-label="Zeile nach unten" title="Zeile nach unten"
                        >
                          <ArrowDown className="h-2.5 w-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateTable(duplicateWriterTableRow(tableData, rIdx))}
                          className="rounded p-0.5 text-slate-500 hover:text-emerald-300"
                          aria-label="Zeile duplizieren" title="Zeile duplizieren"
                        >
                          <Copy className="h-2.5 w-2.5" />
                        </button>
                        {totalRows > 1 && (
                          <button
                            type="button"
                            onClick={() => onUpdateTable(deleteWriterTableRow(tableData, rIdx))}
                            className="rounded p-0.5 text-slate-500 hover:text-red-400"
                            aria-label="Zeile löschen" title="Zeile löschen"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Caption (Below) */}
      {showCaption && captionPosition === 'below' && renderCaption()}
    </div>
  );
};
