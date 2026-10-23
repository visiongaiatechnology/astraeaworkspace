// STATUS: PLATIN — BATCH-INSIGHT-4: bind an existing workspace workbook as a real Insight source.
//
// MEASURED FACTS before this batch:
//  - `connectors/insightConnectorEngine.createWorkspaceSource` and the whole
//    `integrations/insightWorkspaceIntegration` reference path were imported by NO component, and the
//    shell did not pass the workspace document list to Insight at all, so "connect a Grid source" was
//    unreachable twice over.
//  - The shell now passes `workspaceDocuments` (AppWorkspaceView → InsightView), so the missing piece
//    is this app's half: read a workbook's table object through the SHARED contract
//    (`shared/contracts/grid/workspaceGrid.ts`: TableObject { rows, cols, cells } and GridCell { value }),
//    map it with the same mapping a file import uses, and register the source and the cross-app
//    reference. Nothing here guesses a Grid-internal shape: only the shared contract is read.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { GridCell, TableObject } from '../../../shared/contracts/grid/workspaceGrid';
import type { InsightDataSource, InsightDocumentModel } from '../domain/types';
import { InsightError, cleanText, normalizeInsightModel } from '../core/insightCore';
import { assertSourceSafe, createWorkspaceSource } from './insightConnectorEngine';
import { mapInsightTableToRecords, type InsightImportReport } from './insightImportCore';
import type { InsightRawTable, InsightSourceError } from './insightTabularCore';
import { attachInsightReference, createInsightReference } from '../integrations/insightWorkspaceIntegration';
import { nextInsightCache } from '../refresh/insightRefreshOutcome';

export const INSIGHT_WORKSPACE_LIMITS = { maxCells:200_000, maxRows:100_000, maxColumns:1_024 } as const;
/** Source kinds this app can really read rows from. Tasks and Vault are mapped but not readable yet. */
export const INSIGHT_READABLE_SOURCE_KINDS: ReadonlySet<InsightWorkspaceSourceKind> = new Set(['grid']);
export type InsightWorkspaceSourceKind = 'grid' | 'tasks' | 'vault-file';

export function insightWorkspaceSourceKind(kind:WorkspaceDocument['kind']):InsightWorkspaceSourceKind|undefined{
  if(kind==='Grid')return'grid';
  if(kind==='Tasks')return'tasks';
  if(kind==='Vault')return'vault-file';
  return undefined;
}

export interface InsightWorkspaceCandidate { id:string; title:string; kind:WorkspaceDocument['kind']; sourceKind:InsightWorkspaceSourceKind; version:number; readable:boolean; }
/** Every workspace document the user could bind, with an honest `readable` flag. Bounded and sorted. */
export function listInsightWorkspaceCandidates(documents:readonly WorkspaceDocument[],limit=256):InsightWorkspaceCandidate[]{
  const candidates:InsightWorkspaceCandidate[]=[];
  for(const document of documents){
    const sourceKind=insightWorkspaceSourceKind(document.kind);
    if(!sourceKind)continue;
    candidates.push({ id:document.id, title:String(document.title??document.id), kind:document.kind, sourceKind, version:Number(document.version??0), readable:INSIGHT_READABLE_SOURCE_KINDS.has(sourceKind) });
    if(candidates.length>=limit)break;
  }
  return candidates.sort((a,b)=>a.title<b.title?-1:a.title>b.title?1:0);
}

const A1=/^([A-Z]+)(\d+)$/;
const RC=/^(\d+):(\d+)$/;
function parseCellKey(key:string):[number,number]|null{
  const rc=RC.exec(key);
  if(rc)return[Number(rc[1]),Number(rc[2])];
  const a1=A1.exec(key.toUpperCase());
  if(!a1)return null;
  let column=0;
  for(const char of a1[1])column=column*26+(char.charCodeAt(0)-64);
  return[Number(a1[2])-1,column-1];
}
function columnName(index:number):string{let name='';let n=index+1;while(n>0){n-=1;name=String.fromCharCode(65+(n%26))+name;n=Math.floor(n/26);}return name;}

/** The table object of the first visible sheet, or the first table object in the document. */
export function findGridTableObjectId(document:WorkspaceDocument):string|undefined{
  const sheets=(document as {gridData?:{sheets?:Array<{name?:string;hidden?:boolean;veryHidden?:boolean;tableObjectId?:string}>}}).gridData?.sheets??[];
  for(const sheet of sheets){
    if(sheet.hidden||sheet.veryHidden)continue;
    if(sheet.tableObjectId&&document.objects[sheet.tableObjectId])return sheet.tableObjectId;
  }
  for(const [objectId,object] of Object.entries(document.objects)){
    const candidate=(object as {data?:unknown}|undefined)?.data??object;
    if(candidate&&typeof candidate==='object'&&'cells' in (candidate as Record<string,unknown>))return objectId;
  }
  return undefined;
}

/**
 * Read one grid table object into the same raw-table shape the delimited reader produces.
 * Bounds are taken from the cells that really exist (a sparse sheet can declare 1 048 576 rows), and
 * an unreadable cell key is reported instead of being dropped silently.
 */
export function readGridTableObject(document:WorkspaceDocument,objectId:string,limits=INSIGHT_WORKSPACE_LIMITS):InsightRawTable{
  const envelope=document.objects[objectId] as {data?:unknown}|undefined;
  const raw=(envelope&&typeof envelope==='object'&&'data' in envelope?envelope.data:envelope) as Partial<TableObject>|undefined;
  if(!raw||typeof raw!=='object'||!raw.cells||typeof raw.cells!=='object')throw new InsightError('workspace-grid-table-invalid');
  const cells=raw.cells as Record<string,GridCell>;
  const keys=Object.keys(cells);
  if(keys.length>limits.maxCells)throw new InsightError('workspace-read-cell-limit');
  const errors:InsightSourceError[]=[];
  let maxRow=-1;let maxColumn=-1;
  for(const key of keys){
    const parsed=parseCellKey(key);
    if(!parsed){errors.push({row:0,column:key,code:'workspace-cell-key-invalid'});continue;}
    maxRow=Math.max(maxRow,parsed[0]);
    maxColumn=Math.max(maxColumn,parsed[1]);
  }
  if(maxRow<0)return{headers:[],rows:[],errors};
  if(maxRow+1>limits.maxRows)throw new InsightError('workspace-read-row-limit');
  if(maxColumn+1>limits.maxColumns)throw new InsightError('workspace-read-column-limit');

  const valueAt=(row:number,column:number):string=>{
    const cell=cells[`${row}:${column}`]??cells[`${columnName(column)}${row+1}`];
    const value=cell?.value;
    return value===undefined||value===null?'':String(value);
  };
  const headers=Array.from({length:maxColumn+1},(_,column)=>{const text=cleanText(valueAt(0,column)||`column_${column+1}`,256);return text;});
  const rows:string[][]=[];
  for(let row=1;row<=maxRow;row++)rows.push(Array.from({length:maxColumn+1},(_,column)=>valueAt(row,column)));
  return{headers,rows,errors};
}

export interface InsightWorkspaceConnectResult { model:InsightDocumentModel; report:InsightImportReport; source:InsightDataSource|null; referenceUri:string|null; }
/**
 * Bind the chosen workbook: read its table object, map it onto the canonical dataset through the one
 * mapping, register a workspace source with a stable id and the observed types, and register the
 * cross-app reference with the source version. A refusal leaves the model untouched.
 */
export function connectInsightWorkspaceSource(model:InsightDocumentModel,document:WorkspaceDocument,now:number=Date.now()):InsightWorkspaceConnectResult{
  const sourceKind=insightWorkspaceSourceKind(document.kind);
  if(!sourceKind)throw new InsightError('workspace-source-kind-invalid');
  if(!INSIGHT_READABLE_SOURCE_KINDS.has(sourceKind))throw new InsightError('workspace-source-reader-missing');
  const tableObjectId=findGridTableObjectId(document);
  if(!tableObjectId)throw new InsightError('workspace-grid-table-missing');
  const raw=readGridTableObject(document,tableObjectId);
  const name=cleanText(String(document.title??document.id),256);
  const mapping=mapInsightTableToRecords(model,{name,raw});
  const report:InsightImportReport={ ok:mapping.ok, reason:mapping.reason, rows:mapping.rows, skippedRows:mapping.skippedRows, columns:mapping.columns, types:mapping.types, mismatches:mapping.mismatches, errors:mapping.errors, missingColumns:mapping.missingColumns };
  if(!mapping.ok)return{model,report,source:null,referenceUri:null};

  const source=createWorkspaceSource({name,kind:'grid',documentId:document.id,selector:tableObjectId,privacy:'organizational'});
  const withSchema:InsightDataSource={...source,schema:{tables:[{name,columns:mapping.columns}],discoveredAt:now}};
  assertSourceSafe(withSchema);
  const reference=createInsightReference(document,tableObjectId,'live');
  const bound:InsightDocumentModel={
    ...model,
    revision:model.revision+1,
    datasetName:name,
    records:mapping.records,
    querySteps:[],
    cache:nextInsightCache(model.cache,{kind:'read',rows:mapping.records.length,nextSourceState:'fresh'},now),
    queries:model.queries.map((query,position)=>position===0?{...query,sourceId:withSchema.id,steps:[],version:query.version+1}:query),
    sources:[...model.sources,withSchema],
  };
  return{ model:normalizeInsightModel(attachInsightReference(bound,reference)), report:{...report,rows:mapping.records.length}, source:withSchema, referenceUri:reference.canonicalUri };
}
