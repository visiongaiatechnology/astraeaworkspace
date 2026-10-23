// STATUS: DIAMANT VGT SUPREME — bounded portable Grid CSV/TSV/JSON serialization.
import type { GridCell } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';
import { formatGridLocaleValue } from '../locale/gridLocale';
import { neutralizeSpreadsheetFormulaInjection } from '../../../shared/security/spreadsheetSafety';
import { deliverExportText, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';

const MAX_EXPORT_CELLS = 250_000;

export type GridPortableExportFormat = 'csv' | 'tsv' | 'json';
export interface GridPortableExportOptions { range?: string; locale?: string; localeAware?: boolean; }

function bounds(colCount:number,rowCount:number,range?:string){
  const parsed=range?parseGridRange(range):null;
  if(range&&!parsed)throw new Error('grid_export_range_invalid');
  const startCol=parsed?.startCol??0,endCol=parsed?.endCol??Math.max(0,colCount-1),startRow=parsed?.startRow??0,endRow=parsed?.endRow??Math.max(0,rowCount-1);
  const count=(endCol-startCol+1)*(endRow-startRow+1);
  if(count<0||count>MAX_EXPORT_CELLS)throw new Error('grid_export_cell_limit');
  return {startCol,endCol,startRow,endRow};
}
function escapeDelimited(value:string,delimiter:string){return value.includes('"')||value.includes('\r')||value.includes('\n')||value.includes(delimiter)?`"${value.replace(/"/gu,'""')}"`:value;}
function portableValue(cell:GridCell|undefined,options:GridPortableExportOptions):GridCell['value']|''{
  if(!cell)return '';
  if(options.localeAware)return formatGridLocaleValue(cell,options.locale);
  return cell.value??'';
}

export function buildGridPortableExport(cells:Record<string,GridCell>,colCount:number,rowCount:number,format:GridPortableExportFormat,options:GridPortableExportOptions={}):string{
  const b=bounds(colCount,rowCount,options.range);
  if(format==='json'){
    const rows:Array<Array<GridCell['value']|''>>=[];
    for(let r=b.startRow;r<=b.endRow;r++){const row:Array<GridCell['value']|''>=[];for(let c=b.startCol;c<=b.endCol;c++)row.push(portableValue(cells[toA1(c,r)],options));rows.push(row);}
    return JSON.stringify({range:options.range??null,rows});
  }
  const delimiter=format==='tsv'?'\t':',';
  const lines:string[]=[];
  for(let r=b.startRow;r<=b.endRow;r++){const row:string[]=[];for(let c=b.startCol;c<=b.endCol;c++)row.push(escapeDelimited(neutralizeSpreadsheetFormulaInjection(portableValue(cells[toA1(c,r)],options)),delimiter));lines.push(row.join(delimiter));}
  return lines.join('\r\n');
}

const PORTABLE_EXPORT_MIME: Readonly<Record<GridPortableExportFormat, string>> = {
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

/** Native save first; the browser fallback stays a download and is reported as such. */
export function downloadGridPortableExport(text:string,format:GridPortableExportFormat,filename:string):Promise<ExportDeliveryResult>{
  return deliverExportText(text,{
    suggestedName:filename,
    extensions:[format],
    mimeType:PORTABLE_EXPORT_MIME[format],
  });
}
