// STATUS: DIAMANT VGT SUPREME
// Astraea Grid renderer parity boundary: DOM/virtual canvas + real independently scrollable split panes.

import React from 'react';
import type { GridCell, GridFilterRule, GridSheetModel } from '../../../shared/contracts/workspace';
import type { GridAxis } from './gridAxisSizing';
import { GridTableCanvas } from './GridTableCanvas';
import { GridVirtualCanvas } from './GridVirtualCanvas';

interface GridSheetViewportProps {
  sheet: GridSheetModel;
  cells: Record<string,GridCell>;
  rowCount: number;
  colCount: number;
  rowProjection: number[] | null;
  visibleRowIndices: number[];
  selectedCell: string;
  selectedRange: string;
  selectedRanges: string[];
  isEditing: boolean;
  formulaInput: string;
  dragOverCoord: string | null;
  inlineInputRef: React.RefObject<HTMLInputElement | null>;
  invalidCoords: Set<string>;
  isCirclingInvalid: boolean;
  onChangeFormulaInput: (value:string)=>void;
  onCellClick: (coord:string,extend?:boolean,additive?:boolean)=>void;
  onCellDoubleClick: (coord:string)=>void;
  onCellMouseDown: (event:React.MouseEvent,coord:string)=>void;
  onCellMouseEnter: (coord:string)=>void;
  onDragStartCell: (event:React.DragEvent,coord:string,fill?:boolean)=>void;
  onDragOverCell: (event:React.DragEvent,coord:string)=>void;
  onDropCell: (event:React.DragEvent,coord:string)=>void;
  onSelectColumn: (index:number,additive?:boolean)=>void;
  onSelectRow: (index:number,additive?:boolean)=>void;
  onSelectAll: ()=>void;
  onResizeTable: (rows:number,cols:number)=>void;
  /** AST-0391: the AutoFilter entry needs the active rules and their writer in **both** renderers. */
  filterRules: readonly GridFilterRule[];
  onUpdateFilters: (rules: readonly GridFilterRule[]) => void;
  onAxisResize: (axis:GridAxis,index:number,size:number)=>void;
  onAxisAutoFit: (axis:GridAxis,index:number)=>void;
  onCopy: ()=>void;
  onCut: ()=>void;
  onPaste: ()=>void;
  onOpenPasteSpecial: ()=>void;
  onOpenGoalSeek: ()=>void;
  onMergeCells: ()=>void;
  onUnmergeCells: ()=>void;
  onClearContents: ()=>void;
  onCommitValue: (coord:string,value:string)=>void;
  onOpenComments: ()=>void;
  onOpenFindReplace: ()=>void;
}

export const GridSheetViewport: React.FC<GridSheetViewportProps> = (props) => {
  const splitRows = Math.max(0, props.sheet.splitPanes?.row ?? 0);
  const splitCols = Math.max(0, props.sheet.splitPanes?.col ?? 0);
  const paneCount = splitRows > 0 && splitCols > 0 ? 4 : splitRows > 0 || splitCols > 0 ? 2 : 1;
  const gridClass = paneCount === 4 ? 'grid-cols-2 grid-rows-2' : splitCols > 0 ? 'grid-cols-2 grid-rows-1' : splitRows > 0 ? 'grid-cols-1 grid-rows-2' : 'grid-cols-1 grid-rows-1';
  const useVirtual = props.sheet.useVirtualCanvas || props.rowCount > 250 || props.colCount > 30;

  const pane = (index:number) => <div key={index} className="relative min-w-0 min-h-0 overflow-hidden border-r border-b border-blue-500/20" aria-label={`Grid pane ${index+1} of ${paneCount}`}>
    {useVirtual ? <GridVirtualCanvas
      sheet={props.sheet} cells={props.cells} colCount={props.colCount} rowCount={props.rowCount} rowProjection={props.rowProjection}
      selectedCell={props.selectedCell} selectedRange={props.selectedRange} selectedRanges={props.selectedRanges}
      isEditing={props.isEditing} formulaInput={props.formulaInput} dragOverCoord={props.dragOverCoord}
      invalidCoords={props.invalidCoords} isCirclingInvalid={props.isCirclingInvalid}
      onChangeFormulaInput={props.onChangeFormulaInput} onCellClick={props.onCellClick} onCellDoubleClick={props.onCellDoubleClick}
      onSelectColumn={props.onSelectColumn} onSelectRow={props.onSelectRow} onSelectAll={props.onSelectAll}
      filterRules={props.filterRules} onUpdateFilters={props.onUpdateFilters}
    /> : <GridTableCanvas
      sheet={props.sheet} cells={props.cells} colCount={props.colCount} rowCount={props.rowCount} visibleRowIndices={props.visibleRowIndices}
      selectedCell={props.selectedCell} selectedRange={props.selectedRange} selectedRanges={props.selectedRanges}
      isEditing={props.isEditing} formulaInput={props.formulaInput} dragOverCoord={props.dragOverCoord} inlineInputRef={props.inlineInputRef}
      invalidCoords={props.invalidCoords} isCirclingInvalid={props.isCirclingInvalid}
      onChangeFormulaInput={props.onChangeFormulaInput} onCellClick={props.onCellClick} onCellDoubleClick={props.onCellDoubleClick}
      onCellMouseDown={props.onCellMouseDown} onCellMouseEnter={props.onCellMouseEnter} onDragStartCell={props.onDragStartCell}
      onDragOverCell={props.onDragOverCell} onDropCell={props.onDropCell} onSelectColumn={props.onSelectColumn} onSelectRow={props.onSelectRow}
      onSelectAll={props.onSelectAll} onResizeTable={props.onResizeTable} onAxisResize={props.onAxisResize} onAxisAutoFit={props.onAxisAutoFit}
      filterRules={props.filterRules} onUpdateFilters={props.onUpdateFilters}
      onCopy={props.onCopy} onCut={props.onCut} onPaste={props.onPaste}
      onOpenPasteSpecial={props.onOpenPasteSpecial} onOpenGoalSeek={props.onOpenGoalSeek} onMergeCells={props.onMergeCells}
      onUnmergeCells={props.onUnmergeCells} onClearContents={props.onClearContents} onCommitValue={props.onCommitValue}
      onOpenComments={props.onOpenComments} onOpenFindReplace={props.onOpenFindReplace}
    />}
    {index === 0 && paneCount > 1 && <div className="absolute top-1 right-1 z-30 px-1.5 py-0.5 rounded bg-blue-950/80 text-[0.5625rem] text-blue-200 pointer-events-none">SPLIT {splitRows ? `R${splitRows}` : ''}{splitRows&&splitCols?' · ':''}{splitCols ? `C${splitCols}` : ''}</div>}
  </div>;

  return <div className={`flex-1 min-w-0 min-h-0 grid ${gridClass}`} role="group" aria-label={paneCount > 1 ? `Split Grid view with ${paneCount} independently scrollable panes` : 'Grid view'}>
    {Array.from({length:paneCount},(_,index)=>pane(index))}
  </div>;
};
