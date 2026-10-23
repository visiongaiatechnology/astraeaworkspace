// STATUS: DIAMANT VGT SUPREME
// Persistent local-first Query/Transform editor. External transports require NetGate + KeyVault adapters.
import React, { useMemo, useState } from 'react';
import { Database, X, Plus, Check, Code, Trash2, RefreshCw, FileUp, ShieldCheck } from 'lucide-react';
import type { GridQueryDefinition, GridQuerySourceDefinition, NetworkCapability, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { executeQueryPipeline, queryResultToGridCells, type QueryStep, type QueryTable } from './gridPowerQuery';
import { queryTableFromFile, queryTableFromText } from './sources/gridQuerySources';
import { refreshGridQuery } from './gridQueryRefresh';
import { assertQuerySourceSecurity, createEncryptedQueryCache } from './security/gridQuerySecurity';
import { foldExternalQuerySteps, foldQuerySteps } from './gridQueryFolding';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';
import { GRID_QUERY_MAX_SOURCE_BYTES, GRID_QUERY_MAX_STEPS } from './gridQueryLimits';

interface GridPowerQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceDocuments: Record<string, WorkspaceDocument>;
  savedQueries: GridQueryDefinition[];
  networkCapability: NetworkCapability;
  keyVaultUnlocked: boolean;
  onLoadIntoGrid: (result: { cells: Record<string, string>; query: GridQueryDefinition }) => boolean | Promise<boolean>;
}

type SourceMode='text'|'file'|'external';
const EMPTY_TABLE:QueryTable={columns:[],rows:[]};
const stepId=()=>createGridSecureId('query-step');
const bytesToBase64=(bytes:Uint8Array):string=>{const parts:string[]=[];const chunkSize=0x8000;for(let offset=0;offset<bytes.length;offset+=chunkSize){parts.push(String.fromCharCode(...bytes.subarray(offset,Math.min(offset+chunkSize,bytes.length))));}return btoa(parts.join(''));};
const MAX_QUERY_TEXT_CHARS = Math.floor(GRID_QUERY_MAX_SOURCE_BYTES / 16);

function baseDefinition(source:GridQuerySourceDefinition,table:QueryTable,steps:QueryStep[],cacheMode:'none'|'encrypted-device',policy:GridQueryDefinition['schemaDriftPolicy']):GridQueryDefinition{
  return {id:createGridSecureId('query'),name:`Query ${source.label}`.slice(0,128),source,steps:steps.map((step)=>({...step,params:{...step.params}})),schema:table.columns.map((column)=>({...column})),schemaDriftPolicy:policy,lineage:[],errorRows:[],offlineCache:{mode:cacheMode,maxAgeMinutes:1440}};
}

export const GridPowerQueryModal:React.FC<GridPowerQueryModalProps>=({isOpen,onClose,savedQueries,networkCapability,keyVaultUnlocked,onLoadIntoGrid})=>{
  const [sourceMode,setSourceMode]=useState<SourceMode>('text');
  const [sourceText,setSourceText]=useState('Region,Revenue,Cost\nWest,120,70\nEast,95,55');
  const [sourceLabel,setSourceLabel]=useState('data.csv');
  const [sourceTable,setSourceTable]=useState<QueryTable>(()=>queryTableFromText(sourceText,sourceLabel).table);
  const [source,setSource]=useState<GridQuerySourceDefinition>(()=>queryTableFromText(sourceText,sourceLabel).source);
  const [steps,setSteps]=useState<QueryStep[]>([]);
  const [query,setQuery]=useState<GridQueryDefinition|null>(null);
  const [preview,setPreview]=useState<QueryTable>(sourceTable);
  const [status,setStatus]=useState('Local source ready');
  const [showSql,setShowSql]=useState(false);
  const [schemaPolicy,setSchemaPolicy]=useState<GridQueryDefinition['schemaDriftPolicy']>('additive');
  const [cacheMode,setCacheMode]=useState<'none'|'encrypted-device'>('encrypted-device');
  const [externalKind,setExternalKind]=useState<'sql'|'rest'|'file'>('sql');
  const [externalHost,setExternalHost]=useState('');
  const [externalResource,setExternalResource]=useState('');
  const [credentialKeyId,setCredentialKeyId]=useState('');
  const [busy,setBusy]=useState(false);
  const localPipeline=useMemo(()=>{try{return executeQueryPipeline(sourceTable.columns,sourceTable.rows,steps);}catch{return null;}},[sourceTable,steps]);
  const folding=useMemo(()=>{try{return foldQuerySteps('LocalPreview',sourceTable.columns,steps,'sqlite');}catch{return null;}},[sourceTable,steps]);
  if(!isOpen)return null;

  const addStep=(type:QueryStep['type'],description:string,params:Record<string,unknown>)=>{if(steps.length>=GRID_QUERY_MAX_STEPS){setStatus('The transformation step limit has been reached.');return;}setQuery(null);setSteps((old)=>[...old,{id:stepId(),type,description,params} as QueryStep]);};
  const addTransform=(kind:string)=>{
    const cols=preview.columns; if(!cols.length)return;
    if(kind==='type')addStep('changeType','Change first column to text',{colIndex:0,targetType:'text'});
    else if(kind==='filter')addStep('filter','Filter first column non-empty',{colIndex:0,operator:'notEquals',value:''});
    else if(kind==='sort')addStep('sort','Sort first column ascending',{colIndex:0,ascending:true});
    else if(kind==='split')addStep('split','Split first column by space',{colIndex:0,delimiter:' '});
    else if(kind==='merge'&&cols.length>1)addStep('merge','Merge first two columns',{leftColIndex:0,rightColIndex:1,newName:'Merged',delimiter:' '});
    else if(kind==='replace')addStep('replace','Replace value in first column',{colIndex:0,find:'old',replacement:'new'});
    else if(kind==='unpivot'&&cols.length>1)addStep('unpivot','Unpivot all but first column',{fixedColIndices:[0],unpivotColIndices:cols.slice(1).map((_,i)=>i+1),attributeColName:'Attribute',valueColName:'Value'});
    else if(kind==='pivot'&&cols.length>2)addStep('pivot','Pivot attribute/value columns',{keyColIndex:0,attributeColIndex:1,valueColIndex:2});
    else if(kind==='group'&&cols.length>1)addStep('groupBy','Group by first column',{groupColIndex:0,aggColIndex:1,aggFunction:'sum'});
    else if(kind==='append')addStep('append','Append current preview',{table:{columns:preview.columns,rows:preview.rows.slice(0,5000)}});
    else if(kind==='join')addStep('join','Left join current preview by first column',{joinType:'left',leftKeyIndex:0,rightTable:{columns:preview.columns,rows:preview.rows.slice(0,5000)},rightKeyIndex:0});
  };

  const loadText=()=>{try{const parsed=queryTableFromText(sourceText,sourceLabel);setSourceTable(parsed.table);setSource(parsed.source);setPreview(parsed.table);setQuery(null);setStatus(`${parsed.table.rows.length} local rows loaded`);}catch(error){setStatus(error instanceof Error?error.message:'Source parse failed');}};
  const loadFile=async(file:File|null)=>{if(!file)return;setBusy(true);try{const parsed=await queryTableFromFile(file);setSourceTable(parsed.table);setPreview(parsed.table);setSource(parsed.source);setSourceLabel(file.name);setQuery(null);setStatus(`${parsed.table.rows.length} rows loaded from ${file.name}`);}catch(error){setStatus(error instanceof Error?error.message:'File import failed');}finally{setBusy(false);}};
  const configureExternal=()=>{const resource=externalResource.trim();const next:GridQuerySourceDefinition={kind:externalKind,label:`${externalKind}:${externalHost}/${resource}`.slice(0,256),host:externalHost.trim(),resource,credentialKeyId:credentialKeyId.trim()||undefined,dialect:externalKind==='sql'?'sqlite':undefined};try{if(resource.length>1024||next.credentialKeyId&&next.credentialKeyId.length>256)throw new Error('query_external_reference_limit');assertQuerySourceSecurity(next,{networkCapability,keyVaultUnlocked});setSource(next);setSourceTable(EMPTY_TABLE);setPreview(EMPTY_TABLE);setQuery(null);setStatus('External connector policy accepted. Transport adapter must execute through NetGate.');}catch(error){setStatus(error instanceof Error?error.message:'External source blocked');}};

  const refresh=async()=>{setBusy(true);try{assertQuerySourceSecurity(source,{networkCapability,keyVaultUnlocked});if(['sql','rest','file'].includes(source.kind))throw new Error('query_external_transport_adapter_required');const definition=query??baseDefinition(source,sourceTable,steps,cacheMode,schemaPolicy);const candidate={...definition,source,steps:steps.map((step)=>({...step,params:{...step.params}})),schemaDriftPolicy:schemaPolicy,offlineCache:{...definition.offlineCache,mode:cacheMode}};const refreshed=await refreshGridQuery(candidate,sourceTable);setQuery(refreshed.definition);setPreview(refreshed.table);setStatus(`Refresh complete · ${refreshed.table.rows.length} rows · schema ${refreshed.drift} · ${refreshed.definition.errorRows.length} error rows`);}catch(error){setStatus(error instanceof Error?error.message:'Refresh failed');}finally{setBusy(false);}};
  const apply=async()=>{setBusy(true);try{assertQuerySourceSecurity(source,{networkCapability,keyVaultUnlocked});if(['sql','rest','file'].includes(source.kind))throw new Error('query_external_transport_adapter_required');let current=query;let resultTable=preview;if(!current){const refreshed=await refreshGridQuery(baseDefinition(source,sourceTable,steps,cacheMode,schemaPolicy),sourceTable);current=refreshed.definition;resultTable=refreshed.table;}current={...current,offlineCache:{...current.offlineCache,mode:cacheMode,...(cacheMode==='none'?{encryptedContainerBase64:undefined,cachedAt:undefined}:{})}};const cells=queryResultToGridCells(0,0,resultTable.columns,resultTable.rows);if(cacheMode==='encrypted-device'){const bytes=await createEncryptedQueryCache(current,resultTable);if(bytes.byteLength>8*1024*1024)throw new Error('query_cache_size_limit');current={...current,offlineCache:{...current.offlineCache,mode:'encrypted-device',encryptedContainerBase64:bytesToBase64(bytes),cachedAt:Date.now()}};}const committed=await onLoadIntoGrid({cells,query:current});if(!committed){setStatus('The query output was not committed. Check protected cells and try again.');return;}onClose();}catch(error){setStatus(error instanceof Error?error.message:'Load failed');}finally{setBusy(false);}};
  const externalFold=()=>{try{if(source.kind!=='sql')return null;return foldExternalQuerySteps(source.resource||'QuerySource',sourceTable.columns,steps,source.dialect??'sqlite',{connectorKind:'external-db',explicitNetGateCapability:networkCapability!=='None',credentialKeyId:source.credentialKeyId});}catch{return null;}};
  const sql=source.kind==='sql'?externalFold()?.sqlQuery:folding?.sqlQuery;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-6xl space-y-4 overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 p-5 text-slate-200 shadow-2xl">
    <header className="flex items-center justify-between border-b border-white/10 pb-3"><div className="flex items-center gap-2 text-emerald-300"><Database className="h-5 w-5"/><b>Local Query / Transform Studio</b><span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[0.625rem]">LOCAL-FIRST</span></div><button aria-label="Close Grid Power Query dialog" type="button" onClick={onClose}><X className="h-4 w-4"/></button></header>
    <div className="grid gap-3 lg:grid-cols-4">
      <section className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3"><b className="text-xs">Source</b><select className="vgt-input w-full" value={sourceMode} onChange={(e)=>setSourceMode(e.target.value as SourceMode)}><option value="text">CSV / TSV / JSON / XML</option><option value="file">Local file incl. XLSX/ODS</option><option value="external">Optional external adapter</option></select>
      {sourceMode==='text'&&<><input className="vgt-input w-full" maxLength={256} value={sourceLabel} onChange={(e)=>setSourceLabel(e.target.value)} placeholder="data.csv"/><textarea className="vgt-input h-32 w-full font-mono text-[0.625rem]" maxLength={MAX_QUERY_TEXT_CHARS} value={sourceText} onChange={(e)=>setSourceText(e.target.value)}/><button className="vgt-button-secondary w-full" onClick={loadText}>Parse local text</button></>}
      {sourceMode==='file'&&<label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/15 p-3 text-xs"><FileUp className="h-4 w-4"/><input type="file" className="hidden" accept=".csv,.tsv,.json,.xml,.xlsx,.ods" onChange={(e)=>void loadFile(e.target.files?.[0]??null)}/>Select bounded local file</label>}
      {sourceMode==='external'&&<><select className="vgt-input w-full" value={externalKind} onChange={(e)=>setExternalKind(e.target.value as typeof externalKind)}><option value="sql">SQL</option><option value="rest">REST</option><option value="file">Remote file</option></select><input className="vgt-input w-full" maxLength={253} value={externalHost} onChange={(e)=>setExternalHost(e.target.value)} placeholder="allowlisted host"/><input className="vgt-input w-full" maxLength={1024} value={externalResource} onChange={(e)=>setExternalResource(e.target.value)} placeholder="table / endpoint / resource"/><input className="vgt-input w-full" maxLength={256} value={credentialKeyId} onChange={(e)=>setCredentialKeyId(e.target.value)} placeholder="KeyVault credential ID only"/><button className="vgt-button-secondary w-full" onClick={configureExternal}><ShieldCheck className="mr-1 inline h-3 w-3"/>Validate NetGate + KeyVault policy</button></>}
      <div className="text-[0.625rem] text-slate-500">Saved queries: {savedQueries.length} · NetGate: {networkCapability} · KeyVault: {keyVaultUnlocked?'unlocked':'locked'}</div></section>

      <section className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3"><b className="text-xs">Transformations</b><div className="grid grid-cols-2 gap-1">{['type','filter','sort','split','merge','replace','unpivot','pivot','group','join','append'].map((kind)=><button key={kind} className="rounded bg-white/5 px-2 py-1 text-[0.625rem] hover:bg-white/10" onClick={()=>addTransform(kind)}><Plus className="mr-1 inline h-3 w-3"/>{kind}</button>)}</div><div className="max-h-48 space-y-1 overflow-y-auto">{steps.map((step,index)=><div key={step.id} className="flex items-center justify-between rounded bg-slate-800/70 p-2 text-[0.625rem]"><span>{index+1}. {step.description}</span><button aria-label={`Delete transformation step ${index + 1}`} onClick={()=>{setQuery(null);setSteps((old)=>old.filter((item)=>item.id!==step.id));}}><Trash2 className="h-3 w-3 text-rose-300"/></button></div>)}</div></section>

      <section className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3"><b className="text-xs">Refresh & Policy</b><label className="text-[0.625rem] text-slate-400">Schema drift<select className="vgt-input mt-1 w-full" value={schemaPolicy} onChange={(e)=>setSchemaPolicy(e.target.value as typeof schemaPolicy)}><option value="strict">Strict</option><option value="additive">Allow additive</option><option value="permissive">Permissive</option></select></label><label className="text-[0.625rem] text-slate-400">Offline cache<select className="vgt-input mt-1 w-full" value={cacheMode} onChange={(e)=>setCacheMode(e.target.value as typeof cacheMode)}><option value="none">Disabled</option><option value="encrypted-device">Encrypted VGT container</option></select></label><button disabled={busy} className="vgt-button-primary w-full" onClick={()=>void refresh()}><RefreshCw className="mr-1 inline h-3 w-3"/>Refresh preview</button><button className="vgt-button-secondary w-full" onClick={()=>setShowSql((v)=>!v)}><Code className="mr-1 inline h-3 w-3"/>Folding plan</button>{showSql&&<pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[0.5625rem] text-emerald-300">{sql??'No safe folding plan for this source/step sequence.'}</pre>}<div className="rounded bg-black/30 p-2 text-[0.625rem] text-slate-400">{status}</div>{query&&<div className="text-[0.625rem] text-slate-500">Lineage {query.lineage.length} · Errors {query.errorRows.length} · SHA-256 {query.lastSchemaDigest?.slice(0,16)}…</div>}</section>

      <section className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3"><b className="text-xs">Preview</b><div className="text-[0.625rem] text-slate-500">{localPipeline?`${localPipeline.rowCount} pipeline rows`: 'Pipeline exceeds safe limits'} · showing {Math.min(preview.rows.length,100)}</div><div className="max-h-64 overflow-auto rounded border border-white/10"><table className="min-w-full text-[0.625rem]"><thead className="sticky top-0 bg-slate-800"><tr>{preview.columns.map((column)=><th key={column.name} className="p-1 text-left">{column.name}<small className="ml-1 text-slate-500">{column.type}</small></th>)}</tr></thead><tbody>{preview.rows.slice(0,100).map((row,rowIndex)=><tr key={rowIndex} className="border-t border-white/5">{preview.columns.map((_,colIndex)=><td key={colIndex} className="max-w-44 truncate p-1 font-mono">{String(row[colIndex]??'')}</td>)}</tr>)}</tbody></table></div></section>
    </div>
    <footer className="flex items-center justify-between border-t border-white/10 pt-3"><div className="text-[0.625rem] text-slate-500">No raw credentials stored. External connector execution is blocked without explicit NetGate policy and KeyVault reference.</div><button disabled={busy||!preview.columns.length} className="vgt-button-primary" onClick={()=>void apply()}><Check className="mr-1 inline h-4 w-4"/>Load + persist query</button></footer>
  </div></div>;
};
