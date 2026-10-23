// STATUS: DIAMANT VGT SUPREME
// Deterministic refresh, schema-drift, diagnostics and lineage for persisted Grid queries.

import type { GridQueryDefinition, GridQueryErrorRow } from '../../../shared/contracts/workspace';
import { sha256GridHex } from '../security/gridWebCryptoIntegrity';
import { executeQueryPipeline, type QueryColumn, type QueryTable } from './gridPowerQuery';

const MAX_LINEAGE=128;const MAX_ERRORS=2_000;
function sameColumn(a:QueryColumn,b:QueryColumn):boolean{return a.name===b.name&&a.type===b.type;}
function schemaDrift(expected:QueryColumn[],actual:QueryColumn[]):'none'|'additive'|'breaking'{if(expected.length===actual.length&&expected.every((item,index)=>sameColumn(item,actual[index])))return 'none';if(expected.every((item,index)=>actual[index]&&sameColumn(item,actual[index]))&&actual.length>=expected.length)return 'additive';return 'breaking';}
function validateRows(table:QueryTable):GridQueryErrorRow[]{const errors:GridQueryErrorRow[]=[];table.rows.forEach((row,rowIndex)=>table.columns.forEach((column,colIndex)=>{const value=row[colIndex];if(value===null||value==='')return;let valid=true;if(column.type==='number')valid=typeof value==='number'&&Number.isFinite(value);else if(column.type==='boolean')valid=typeof value==='boolean';else if(column.type==='date')valid=typeof value==='string'&&!Number.isNaN(Date.parse(value));if(!valid&&errors.length<MAX_ERRORS)errors.push({sourceRow:rowIndex+2,stepId:'schema-validation',column:column.name,message:`Expected ${column.type}`});}));return errors;}

export async function refreshGridQuery(definition:GridQueryDefinition,sourceTable:QueryTable):Promise<{definition:GridQueryDefinition;table:QueryTable;drift:'none'|'additive'|'breaking'}>{
  const drift=schemaDrift(definition.schema,sourceTable.columns);
  if(definition.schema.length&&definition.schemaDriftPolicy==='strict'&&drift!=='none')throw new Error(`query_schema_drift_${drift}`);
  if(definition.schema.length&&definition.schemaDriftPolicy==='additive'&&drift==='breaking')throw new Error('query_schema_drift_breaking');
  const result=executeQueryPipeline(sourceTable.columns,sourceTable.rows,definition.steps as Parameters<typeof executeQueryPipeline>[2]);
  const table:QueryTable={columns:result.columns,rows:result.rows};const errorRows=validateRows(table);
  const {digestHex}=await sha256GridHex(table.columns);const now=Date.now();
  const next:GridQueryDefinition={...definition,schema:table.columns.map((column)=>({...column})),errorRows,lastRefreshAt:now,lastSchemaDigest:digestHex,lineage:[...definition.lineage,{sourceKind:definition.source.kind,sourceLabel:definition.source.label,sourceDocumentId:definition.source.documentId,refreshedAt:now,schemaDigest:digestHex,rowCount:table.rows.length}].slice(-MAX_LINEAGE)};
  return {definition:next,table,drift};
}
