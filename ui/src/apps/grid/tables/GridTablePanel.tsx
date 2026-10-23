// STATUS: DIAMANT VGT SUPREME
// Structured Table management surface. All mutations are delegated to bounded cores.

import React, { useState } from 'react';
import type { GridStructuredTable, GridTableColumn } from '../../../shared/contracts/grid/workspaceGrid';
import type { GridTableInterchangeFormat } from './interchange/gridStructuredTableInterop';

interface GridTablePanelProps {
  tables: readonly GridStructuredTable[];
  selectedRange: string;
  onCreate: (options: { range: string; name?: string; hasHeaders: boolean; styleTheme: NonNullable<GridStructuredTable['styleTheme']> }) => void;
  onRename: (tableId: string, name: string) => void;
  onPatch: (tableId: string, patch: Partial<GridStructuredTable>) => void;
  onToggleTotals: (tableId: string) => void;
  onSetTotalFunction: (tableId: string, columnName: string, fn: GridTableColumn['totalFunction']) => void;
  onSetCalculatedColumn: (tableId: string, columnName: string, formula: string) => void;
  onExport: (tableId: string, format: GridTableInterchangeFormat) => void;
  onImport: (text: string, format: GridTableInterchangeFormat, name?: string) => void;
  onPublishDataset: (tableId: string) => Promise<string>;
}

const themes: Array<NonNullable<GridStructuredTable['styleTheme']>> = ['blue','dark','emerald','purple','amber'];
const totals: Array<NonNullable<GridTableColumn['totalFunction']>> = ['none','sum','count','average','min','max','stdDev','var'];

export const GridTablePanel: React.FC<GridTablePanelProps> = ({
  tables, selectedRange, onCreate, onRename, onPatch, onToggleTotals, onSetTotalFunction,
  onSetCalculatedColumn, onExport, onImport, onPublishDataset,
}) => {
  const [name, setName] = useState('');
  const [hasHeaders, setHasHeaders] = useState(true);
  const [styleTheme, setStyleTheme] = useState<NonNullable<GridStructuredTable['styleTheme']>>('blue');
  const [importFormat, setImportFormat] = useState<GridTableInterchangeFormat>('csv');
  const [importName, setImportName] = useState('');
  const [importText, setImportText] = useState('');
  const [formulaDrafts, setFormulaDrafts] = useState<Record<string,string>>({});
  const [status, setStatus] = useState<string>('');

  return <div className="space-y-4">
    <section className="space-y-2">
      <h3 className="font-semibold text-slate-200">Structured Table</h3>
      <div className="text-[0.625rem] text-slate-500">Selection: {selectedRange}</div>
      <input value={name} onChange={e=>setName(e.target.value)} className="vgt-input w-full" placeholder={`Table${tables.length + 1}`}/>
      <div className="grid grid-cols-2 gap-2">
        <select value={styleTheme} onChange={e=>setStyleTheme(e.target.value as typeof styleTheme)} className="vgt-input">
          {themes.map(theme=><option key={theme} value={theme}>{theme}</option>)}
        </select>
        <label className="flex items-center justify-between rounded bg-white/5 px-2 text-[0.625rem] text-slate-300">Headers<input type="checkbox" checked={hasHeaders} onChange={e=>setHasHeaders(e.target.checked)}/></label>
      </div>
      <button type="button" onClick={()=>{onCreate({range:selectedRange,name:name.trim()||undefined,hasHeaders,styleTheme});setName('')}} className="vgt-button-primary w-full">Create Table from Selection</button>
    </section>

    <section className="space-y-3 border-t border-white/10 pt-3">
      {tables.length === 0 && <div className="text-[0.625rem] text-slate-500">No structured tables on this sheet.</div>}
      {tables.map(table=><div key={table.id} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <div className="flex gap-2">
          <input defaultValue={table.name} onBlur={e=>{if(e.target.value.trim()!==table.name)onRename(table.id,e.target.value)}} className="vgt-input min-w-0 flex-1" aria-label={`Table name ${table.name}`}/>
          <select value={table.styleTheme ?? 'blue'} onChange={e=>onPatch(table.id,{styleTheme:e.target.value as GridStructuredTable['styleTheme']})} className="vgt-input w-24">
            {themes.map(theme=><option key={theme} value={theme}>{theme}</option>)}
          </select>
        </div>
        <div className="text-[0.625rem] text-slate-500">{table.range} · {table.columns.length} columns</div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={()=>onToggleTotals(table.id)} className="vgt-button-secondary">{table.hasTotalsRow?'Remove Totals':'Add Totals'}</button>
          {(['csv','tsv','json'] as GridTableInterchangeFormat[]).map(format=><button key={format} type="button" onClick={()=>onExport(table.id,format)} className="vgt-button-secondary">{format.toUpperCase()}</button>)}
          <button type="button" onClick={async()=>{try{setStatus(await onPublishDataset(table.id))}catch(e){setStatus(e instanceof Error?e.message:'Dataset publish failed')}}} className="vgt-button-secondary">Live Dataset</button>
        </div>
        <div className="space-y-1 border-t border-white/10 pt-2">
          {table.columns.map(column=>{
            const key=`${table.id}:${column.name}`;
            return <div key={column.name} className="grid grid-cols-[1fr_90px] gap-1 items-center">
              <div className="min-w-0">
                <div className="truncate text-[0.625rem] text-slate-300">{column.name}</div>
                <div className="flex gap-1 mt-1"><input value={formulaDrafts[key] ?? column.calculatedFormula ?? ''} onChange={e=>setFormulaDrafts(prev=>({...prev,[key]:e.target.value}))} className="vgt-input min-w-0 flex-1" placeholder="=A2*B2"/><button type="button" onClick={()=>onSetCalculatedColumn(table.id,column.name,formulaDrafts[key] ?? column.calculatedFormula ?? '')} className="vgt-button-secondary">Apply</button></div>
              </div>
              <select value={column.totalFunction ?? 'none'} onChange={e=>onSetTotalFunction(table.id,column.name,e.target.value as GridTableColumn['totalFunction'])} className="vgt-input">
                {totals.map(total=><option key={total} value={total}>{total}</option>)}
              </select>
            </div>;
          })}
        </div>
      </div>)}
    </section>

    <section className="space-y-2 border-t border-white/10 pt-3">
      <h3 className="font-semibold text-slate-200">Import to active cell</h3>
      <div className="grid grid-cols-2 gap-2"><select value={importFormat} onChange={e=>setImportFormat(e.target.value as GridTableInterchangeFormat)} className="vgt-input"><option value="csv">CSV</option><option value="tsv">TSV</option><option value="json">JSON records</option></select><input value={importName} onChange={e=>setImportName(e.target.value)} className="vgt-input" placeholder="Table name"/></div>
      <textarea value={importText} onChange={e=>setImportText(e.target.value)} maxLength={5*1024*1024} rows={5} className="vgt-input w-full resize-y font-mono text-[0.625rem]" placeholder={importFormat==='json'?'[{"Name":"A","Value":1}]':'Name,Value\nA,1'}/>
      <button type="button" disabled={!importText.trim()} onClick={()=>{onImport(importText,importFormat,importName.trim()||undefined);setImportText('')}} className="vgt-button-primary w-full disabled:opacity-40">Import as Structured Table</button>
    </section>
    {status && <div className="rounded bg-emerald-500/10 px-2 py-1 text-[0.625rem] text-emerald-300 break-all">{status}</div>}
  </div>;
};
