// STATUS: DIAMANT VGT SUPREME
// Bounded one-/two-variable what-if tables evaluated by the canonical Formula Core.

import type { GridCell } from '../../../shared/contracts/workspace';
import { evaluateFormula, toA1 } from '../formulas/formula';

const MAX_AXIS_VALUES = 256;
const MAX_RESULTS = 65_536;
function parseA1(coord:string):{col:number;row:number}|null{const m=coord.trim().toUpperCase().match(/^([A-Z]{1,3})([1-9]\d{0,6})$/);if(!m)return null;let col=0;for(const ch of m[1])col=col*26+ch.charCodeAt(0)-64;return {col:col-1,row:Number(m[2])-1};}

export interface GridWhatIfDataTableRequest {formulaCell:string;columnInputCell:string;columnValues:number[];rowInputCell?:string;rowValues?:number[];outputAnchor:string;}
export interface GridWhatIfDataTableResult {headers:string[];rows:Array<{label:string;values:Array<number|string>}>;outputCells:Record<string,number|string>;evaluations:number;}

export async function runGridWhatIfDataTable(cells:Record<string,GridCell>,request:GridWhatIfDataTableRequest):Promise<GridWhatIfDataTableResult>{
  const formulaCoord=request.formulaCell.trim().toUpperCase(),colInput=request.columnInputCell.trim().toUpperCase(),rowInput=request.rowInputCell?.trim().toUpperCase();
  const anchor=parseA1(request.outputAnchor);if(!parseA1(formulaCoord)||!parseA1(colInput)||!anchor||(rowInput&&!parseA1(rowInput)))throw new Error('data_table_invalid_coordinate');
  const formula=cells[formulaCoord]?.formula;if(!formula)throw new Error('data_table_formula_required');
  const colValues=request.columnValues.filter(Number.isFinite).slice(0,MAX_AXIS_VALUES);const rowValues=(request.rowValues??[]).filter(Number.isFinite).slice(0,MAX_AXIS_VALUES);
  if(!colValues.length)throw new Error('data_table_values_required');if(rowInput&&!rowValues.length)throw new Error('data_table_row_values_required');
  const evaluations=colValues.length*Math.max(1,rowValues.length);if(evaluations>MAX_RESULTS)throw new Error('data_table_result_limit');
  const evaluate=async(colValue:number,rowValue?:number):Promise<number|string>=>{const working:Record<string,GridCell>={...cells,[colInput]:{...(cells[colInput]??{value:0}),value:colValue,formula:undefined}};if(rowInput&&rowValue!==undefined)working[rowInput]={...(cells[rowInput]??{value:0}),value:rowValue,formula:undefined};const value=await evaluateFormula(formula,working,{volatilePolicy:'disabled'});const numeric=Number(value);return Number.isFinite(numeric)?Math.round(numeric*1e10)/1e10:String(value);};
  const headers=rowInput?['Input',...rowValues.map((value)=>`${rowInput}=${value}`)]:['Input',formulaCoord];
  const rows:Array<{label:string;values:Array<number|string>}>=[];
  for(const colValue of colValues){const values:Array<number|string>=[];if(rowInput){for(const rowValue of rowValues)values.push(await evaluate(colValue,rowValue));}else values.push(await evaluate(colValue));rows.push({label:`${colInput}=${colValue}`,values});}
  const outputCells:Record<string,number|string>={};headers.forEach((header,index)=>{outputCells[toA1(anchor.col+index,anchor.row)]=header;});rows.forEach((row,rowIndex)=>{outputCells[toA1(anchor.col,anchor.row+rowIndex+1)]=row.label;row.values.forEach((value,colIndex)=>{outputCells[toA1(anchor.col+colIndex+1,anchor.row+rowIndex+1)]=value;});});
  return {headers,rows,outputCells,evaluations};
}
