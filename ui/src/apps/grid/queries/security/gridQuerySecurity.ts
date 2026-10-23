// STATUS: DIAMANT VGT SUPREME
// Query connector/caching security boundary. Secrets never live in Grid query definitions.

import type { GridQueryDefinition, GridQuerySourceDefinition, NetworkCapability, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { packContainer, unpackContainer } from '../../../../platform/containers/container';
import { createGridSecureId } from '../../security/gridWebCryptoIntegrity';
import { assertQueryTableLimits, type QueryColumn, type QueryTable } from '../gridPowerQuery';
import { GRID_QUERY_MAX_LOADED_CELLS, GRID_QUERY_MAX_ROWS } from '../gridQueryLimits';

const EXTERNAL_KINDS=new Set(['sql','rest','file']);

export interface GridQuerySecurityContext {
  networkCapability: NetworkCapability;
  keyVaultUnlocked: boolean;
}

export function assertQuerySourceSecurity(source:GridQuerySourceDefinition,context:GridQuerySecurityContext):void {
  const external=EXTERNAL_KINDS.has(source.kind);
  if(!external)return;
  if(source.label.length>256||!source.resource?.trim()||source.resource.length>1024
    ||!source.host||source.host.length>253||(typeof source.credentialKeyId==='string'&&source.credentialKeyId.length>256))throw new Error('query_external_reference_invalid');
  if(context.networkCapability==='None')throw new Error('query_external_netgate_required');
  if(!context.keyVaultUnlocked)throw new Error('query_external_keyvault_locked');
  if(!source.credentialKeyId?.trim())throw new Error('query_external_keyvault_credential_required');
  const unsafe=source as GridQuerySourceDefinition & {password?:unknown;token?:unknown;secret?:unknown;apiKey?:unknown};
  if(unsafe.password!==undefined||unsafe.token!==undefined||unsafe.secret!==undefined||unsafe.apiKey!==undefined)throw new Error('query_inline_credentials_forbidden');
  if(!/^[A-Za-z0-9.-]{1,253}$/.test(source.host)||source.host.includes('..'))throw new Error('query_external_host_invalid');
}

function tableToCacheDocument(queryId:string,table:QueryTable):WorkspaceDocument {
  const tableId=`query-cache-table-${queryId}`;const cells:Record<string,{value:string|number|boolean}>={};
  const toCol=(index:number)=>{let n=index+1,out='';while(n>0){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;};
  table.columns.forEach((column,index)=>{cells[`${toCol(index)}1`]={value:column.name};});
  table.rows.forEach((row,rowIndex)=>row.forEach((value,colIndex)=>{if(value!==null)cells[`${toCol(colIndex)}${rowIndex+2}`]={value};}));
  const now=Date.now();return {schema_version:1,id:`query-cache-${createGridSecureId('doc')}`,title:`Encrypted query cache ${queryId}`,kind:'Grid',created_at:now,modified_at:now,version:1,theme_id:'default',root_object_ids:[tableId],objects:{[tableId]:{type:'Table',data:{id:tableId,rows:Math.max(2,table.rows.length+1),cols:Math.max(1,table.columns.length),cells}}},gridData:{sheets:[{id:'cache-sheet',name:'Cache',tableObjectId:tableId}],activeSheetId:'cache-sheet',properties:{queryCache:'encrypted-device'}}};
}

function cacheDocumentToTable(document:WorkspaceDocument,schema:QueryColumn[]):QueryTable {
  const sheet=document.gridData?.sheets[0];const object=sheet?document.objects[sheet.tableObjectId]:undefined;if(!object||object.type!=='Table')throw new Error('query_cache_invalid');
  if(!Number.isSafeInteger(object.data.rows)||object.data.rows<1||object.data.rows>GRID_QUERY_MAX_ROWS
    ||!Number.isSafeInteger(object.data.cols)||object.data.cols<1||object.data.cols>schema.length
    ||object.data.rows*object.data.cols>GRID_QUERY_MAX_LOADED_CELLS)throw new Error('query_cache_dimension_limit');
  const cells=object.data.cells;const rows=[] as QueryTable['rows'];
  for(let r=2;r<=object.data.rows;r++){const row=schema.map((_,index)=>{let n=index+1,col='';while(n>0){n--;col=String.fromCharCode(65+n%26)+col;n=Math.floor(n/26);}const value=cells[`${col}${r}`]?.value;return value===undefined?null:value;});if(row.some((value)=>value!==null&&value!==''))rows.push(row);}
  return {columns:schema.map((column)=>({...column})),rows};
}

export async function createEncryptedQueryCache(query:GridQueryDefinition,table:QueryTable):Promise<Uint8Array> {
  if(query.offlineCache.mode!=='encrypted-device')throw new Error('query_cache_policy_disabled');
  const textChars = assertQueryTableLimits(table.columns, table.rows);
  if ((table.rows.length + 1) * table.columns.length > GRID_QUERY_MAX_LOADED_CELLS) throw new Error('query_cache_cell_limit');
  const estimatedContainerBytes = textChars * 6 + (table.rows.length + 1) * table.columns.length * 96 + 8_192;
  if (estimatedContainerBytes > 8 * 1024 * 1024) throw new Error('query_cache_size_limit');
  return packContainer(tableToCacheDocument(query.id,table));
}

export async function openEncryptedQueryCache(query:GridQueryDefinition,bytes:Uint8Array):Promise<QueryTable> {
  if(query.offlineCache.mode!=='encrypted-device')throw new Error('query_cache_policy_disabled');
  if(bytes.byteLength>8*1024*1024)throw new Error('query_cache_size_limit');
  const document=await unpackContainer(bytes);return cacheDocumentToTable(document,query.schema);
}
