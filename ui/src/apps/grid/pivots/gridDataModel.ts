// STATUS: DIAMANT VGT SUPREME
// Local-only relational Grid Data Model. No network, no dynamic JavaScript execution.

import type { GridCell, GridDataModelMeasure, GridDataModelRelationship, GridStructuredTable } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';
import { evaluateGridSafeExpression } from '../../../shared/expressions/gridSafeExpression';

const MAX_MODEL_ROWS = 100_000;
const MAX_MODEL_RELATIONSHIPS = 128;
const MAX_MODEL_MEASURES = 128;

export interface GridDataModelTableInput { table: GridStructuredTable; cells: Record<string,GridCell>; }
export interface GridRelationshipInspection {
  relationshipId:string;
  valid:boolean;
  primaryUnique:boolean;
  foreignMatched:number;
  foreignUnmatched:number;
  issues:string[];
}

function tableRows(input:GridDataModelTableInput):Array<Record<string,unknown>>{
  const bounds=parseGridRange(input.table.range); if(!bounds)throw new Error('data_model_invalid_table_range');
  const start=input.table.hasHeaders?bounds.startRow+1:bounds.startRow, end=input.table.hasTotalsRow?bounds.endRow-1:bounds.endRow;
  if(end-start+1>MAX_MODEL_ROWS)throw new Error('data_model_row_limit'); const rows:Array<Record<string,unknown>>=[];
  for(let r=start;r<=end;r++){const record:Record<string,unknown>={};input.table.columns.forEach((column,index)=>{record[column.name]=input.cells[toA1(bounds.startCol+index,r)]?.value??null;record[`${input.table.name}.${column.name}`]=record[column.name];});rows.push(record);}return rows;
}

function findTable(inputs:readonly GridDataModelTableInput[],id:string):GridDataModelTableInput{
  const found=inputs.find((item)=>item.table.id===id);if(!found)throw new Error(`data_model_table_missing:${id}`);return found;
}

export function inspectGridDataModelRelationships(inputs:readonly GridDataModelTableInput[],relationships:readonly GridDataModelRelationship[]):GridRelationshipInspection[]{
  if(relationships.length>MAX_MODEL_RELATIONSHIPS)throw new Error('data_model_relationship_limit');
  return relationships.map((relationship)=>{
    const issues:string[]=[]; let primaryUnique=false,foreignMatched=0,foreignUnmatched=0;
    try{
      if(relationship.primaryTableId===relationship.foreignTableId)issues.push('self_relationship_not_allowed');
      const primary=findTable(inputs,relationship.primaryTableId),foreign=findTable(inputs,relationship.foreignTableId);
      if(!primary.table.columns.some((column)=>column.name===relationship.primaryColumn))issues.push('primary_column_missing');
      if(!foreign.table.columns.some((column)=>column.name===relationship.foreignColumn))issues.push('foreign_column_missing');
      if(issues.length)return {relationshipId:relationship.id,valid:false,primaryUnique:false,foreignMatched,foreignUnmatched,issues};
      const primaryRows=tableRows(primary),foreignRows=tableRows(foreign); const keys=primaryRows.map((row)=>String(row[relationship.primaryColumn]??'')); primaryUnique=new Set(keys).size===keys.length;
      if(!primaryUnique)issues.push('primary_key_not_unique'); const keySet=new Set(keys); for(const row of foreignRows){if(keySet.has(String(row[relationship.foreignColumn]??'')))foreignMatched++;else foreignUnmatched++;}
      if(foreignUnmatched)issues.push('foreign_rows_unmatched');
    }catch(error){issues.push(error instanceof Error?error.message:'relationship_inspection_failed');}
    return {relationshipId:relationship.id,valid:issues.every((issue)=>issue==='foreign_rows_unmatched'),primaryUnique,foreignMatched,foreignUnmatched,issues};
  });
}

export function joinGridDataModel(inputs:readonly GridDataModelTableInput[],relationships:readonly GridDataModelRelationship[],rootTableId:string):Array<Record<string,unknown>>{
  const inspections=inspectGridDataModelRelationships(inputs,relationships); if(inspections.some((item)=>!item.valid))throw new Error('data_model_relationship_invalid');
  let rows=tableRows(findTable(inputs,rootTableId)); const visited=new Set([rootTableId]);
  for(const relationship of relationships){
    const rootIsPrimary=visited.has(relationship.primaryTableId),rootIsForeign=visited.has(relationship.foreignTableId); if(!rootIsPrimary&&!rootIsForeign)continue;
    const nextId=rootIsPrimary?relationship.foreignTableId:relationship.primaryTableId; if(visited.has(nextId))continue;
    const next=tableRows(findTable(inputs,nextId)); const leftKey=rootIsPrimary?`${findTable(inputs,relationship.primaryTableId).table.name}.${relationship.primaryColumn}`:`${findTable(inputs,relationship.foreignTableId).table.name}.${relationship.foreignColumn}`;
    const rightTable=findTable(inputs,nextId).table; const rightColumn=rootIsPrimary?relationship.foreignColumn:relationship.primaryColumn; const rightKey=`${rightTable.name}.${rightColumn}`;
    const index=new Map<string,Array<Record<string,unknown>>>(); for(const row of next){const key=String(row[rightKey]??row[rightColumn]??'');const list=index.get(key)??[];list.push(row);index.set(key,list);}
    const joined:Array<Record<string,unknown>>=[]; for(const row of rows){const key=String(row[leftKey]??'');const matches=index.get(key)??[{}];for(const match of matches){joined.push({...row,...match});if(joined.length>MAX_MODEL_ROWS)throw new Error('data_model_join_limit');}}
    rows=joined;visited.add(nextId);
  }
  return rows;
}

function numericVariables(record:Record<string,unknown>):Record<string,number>{const vars:Record<string,number>={};for(const [key,value] of Object.entries(record)){const n=Number(value);if(Number.isFinite(n)){const safe=key.replace(/[^A-Za-z0-9_]/g,'_').replace(/^([^A-Za-z_])/,'_$1').slice(0,128);vars[safe]=n;}}return vars;}

export function applyGridDataModelCalculatedColumn(records:readonly Record<string,unknown>[],name:string,formula:string):Array<Record<string,unknown>>{
  const safeName=name.trim().slice(0,128);if(!safeName)throw new Error('data_model_calculated_column_name_required');
  return records.slice(0,MAX_MODEL_ROWS).map((record)=>({...record,[safeName]:evaluateGridSafeExpression(formula,numericVariables(record))}));
}

export function evaluateGridDataModelMeasures(records:readonly Record<string,unknown>[],measures:readonly GridDataModelMeasure[]):Record<string,number>{
  if(measures.length>MAX_MODEL_MEASURES)throw new Error('data_model_measure_limit'); const aggregateVars:Record<string,number>={COUNT:records.length};
  for(const record of records){for(const [key,value] of Object.entries(numericVariables(record)))aggregateVars[`SUM_${key}`]=(aggregateVars[`SUM_${key}`]??0)+value;}
  const result:Record<string,number>={}; for(const measure of measures){const value=evaluateGridSafeExpression(measure.formula,{...aggregateVars,...result});result[measure.name.slice(0,128)]=Math.round(value*1e10)/1e10;}return result;
}
