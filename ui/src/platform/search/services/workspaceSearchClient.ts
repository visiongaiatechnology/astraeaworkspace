// STATUS: DIAMANT VGT SUPREME — thin client for the canonical native vgt-search core.
import type { DocumentKind, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { securityPolicyForDocument } from '../../security/securityProfiles';
import { DEFAULT_SEARCH_POLICY, documentAllowedBySearchPolicy, normalizeSearchPolicy } from '../searchIndexPolicyCore';
import { collectDocumentDerivedSearchFields } from '../searchDerivedContentCore';
import type { SearchAdminPolicy, SearchSavedSearch } from '../searchTypes';
import { authenticatedIpcFetch } from '../../native/ipcAuth';

const SEARCH_DB = 'AstraeaWorkspaceSearchDB';
const SEARCH_DB_VERSION = 1;
const SEARCH_STORE = 'encrypted_search_index';
const SEARCH_SCOPE = 'astraea-workspace-default';
const MAX_RESULTS = 100;
const MAX_ENCRYPTED_INDEX_BYTES = 96 * 1024 * 1024;
const SEARCH_TRANSFER_CHUNK_BYTES = 128 * 1024 - 2;
const SEARCH_TRANSFER_CHUNK_BASE64_CHARS = Math.floor(SEARCH_TRANSFER_CHUNK_BYTES / 3) * 4;
const SHA256_HEX = /^[0-9a-f]{64}$/i;

export type WorkspaceSearchField = 'title'|'full_text'|'table_cell'|'shape_text'|'chart_title'|'metadata'|'tag'|'object_type'|'ocr'|'transcript';
export interface WorkspaceSearchHit {
  document_id: string;
  document_title: string;
  document_kind: DocumentKind;
  object_id: string;
  object_type: string;
  field: WorkspaceSearchField;
  snippet: string;
  relevance_score: number;
  metadata_protected: boolean;
}
export interface WorkspaceSearchStatus { connected:boolean; generation:number; documentCount:number; locked:boolean; detail:string; }

let databasePromise: Promise<IDBDatabase>|null=null;
let initialized=false;
let indexedVersions=new Map<string,number>();
let syncTail:Promise<void>=Promise.resolve();
let activeSearchPolicy:SearchAdminPolicy=DEFAULT_SEARCH_POLICY;

function openSearchDatabase():Promise<IDBDatabase>{
  if(databasePromise)return databasePromise;
  databasePromise=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB unavailable'));return;}
    const request=indexedDB.open(SEARCH_DB,SEARCH_DB_VERSION);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(SEARCH_STORE))db.createObjectStore(SEARCH_STORE,{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error('Search index database failed'));
  });
  return databasePromise;
}
interface PersistedEncryptedSearchIndex { blob:string; sha256?:string; }
async function loadEncryptedIndex():Promise<PersistedEncryptedSearchIndex|null>{try{const db=await openSearchDatabase();return await new Promise((resolve,reject)=>{const tx=db.transaction(SEARCH_STORE,'readonly');const req=tx.objectStore(SEARCH_STORE).get('workspace');req.onsuccess=()=>resolve(typeof req.result?.blob==='string'?{blob:req.result.blob,sha256:typeof req.result?.sha256==='string'?req.result.sha256:undefined}:null);req.onerror=()=>reject(req.error);});}catch{return null;}}
async function saveEncryptedIndex(blob:string,sha256:string):Promise<void>{const db=await openSearchDatabase();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(SEARCH_STORE,'readwrite');tx.objectStore(SEARCH_STORE).put({id:'workspace',format:'vgt-search-index-v3',blob,sha256,updatedAt:Date.now()});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}

function decodedBase64Length(value:string):number{
  if(value.length===0||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Encrypted search index encoding is invalid');
  const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;
  const length=(value.length/4)*3-padding;
  if(!Number.isSafeInteger(length)||length<=0||length>MAX_ENCRYPTED_INDEX_BYTES)throw new Error('Encrypted search index exceeds transfer limits');
  return length;
}

function newSearchTransferId():string{
  const cryptoApi=globalThis.crypto;
  if(!cryptoApi?.getRandomValues)throw new Error('Search transfer randomness is unavailable');
  const bytes=new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  const id=Array.from(bytes,(byte)=>byte.toString(16).padStart(2,'0')).join('');
  bytes.fill(0);
  return id;
}

async function sha256Base64(value:string):Promise<string>{
  const binary=globalThis.atob(value);
  const bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
  try{
    const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,'0')).join('');
  }finally{bytes.fill(0);}
}

async function abortSearchTransfer(transferId:string):Promise<void>{
  try{await requestJson('/api/v1/search/transfer/abort','POST',{transfer_id:transferId});}catch{/* Server expires abandoned encrypted transfer staging after two minutes. */}
}

async function importEncryptedIndex(index:PersistedEncryptedSearchIndex,signal?:AbortSignal):Promise<void>{
  const totalBytes=decodedBase64Length(index.blob);
  const digest=index.sha256&&SHA256_HEX.test(index.sha256)?index.sha256.toLowerCase():await sha256Base64(index.blob);
  const current=await requestJson<{generation:number}>('/api/v1/search/status','GET',undefined,signal);
  if(!Number.isSafeInteger(current.generation)||current.generation<0)throw new Error('Native search generation is invalid');
  const transferId=newSearchTransferId();
  await requestJson('/api/v1/search/import/begin','POST',{transfer_id:transferId,workspace_scope:SEARCH_SCOPE,total_bytes:totalBytes,sha256:digest,expected_generation:current.generation},signal);
  let receivedBytes=0;
  try{
    const encodedChunkChars=SEARCH_TRANSFER_CHUNK_BASE64_CHARS;
    const totalChunks=Math.ceil(index.blob.length/encodedChunkChars);
    for(let chunkIndex=0;chunkIndex<totalChunks;chunkIndex++){
      if(signal?.aborted)throw signal.reason??new DOMException('Search sync aborted','AbortError');
      const start=chunkIndex*encodedChunkChars;
      const dataBase64=index.blob.slice(start,Math.min(start+encodedChunkChars,index.blob.length));
      const chunkBytes=decodedBase64Length(dataBase64);
      const response=await requestJson<{received_bytes:number}>('/api/v1/search/import/chunk','POST',{transfer_id:transferId,chunk_index:chunkIndex,data_base64:dataBase64},signal);
      receivedBytes+=chunkBytes;
      if(response.received_bytes!==receivedBytes)throw new Error('Native search import transfer length mismatch');
    }
    const response=await requestJson<{success:boolean}>('/api/v1/search/import/finalize','POST',{transfer_id:transferId},signal);
    if(response.success!==true)throw new Error('Native search import did not complete');
  }catch(error){
    await abortSearchTransfer(transferId);
    throw error;
  }
}

async function requestJson<T>(path:string,method:'GET'|'POST'='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
  const response=await authenticatedIpcFetch(path,{method,headers:method==='POST'?{'Content-Type':'application/json'}:undefined,body:body===undefined?undefined:JSON.stringify(body),signal});
  if(!response.ok)throw new Error(`Native search core rejected request (${response.status})`);
  return await response.json() as T;
}

function stringArray(value:unknown,max=128):string[]{return Array.isArray(value)?value.filter((item):item is string=>typeof item==='string').map((item)=>item.trim()).filter(Boolean).slice(0,max):[];}
function indexOptions(document:WorkspaceDocument){
  const extensions=document as WorkspaceDocument & {tags?:unknown;privacyExcludedFromSearch?:unknown;aclPartitionRefs?:unknown;spaceIds?:unknown;spaces?:unknown};
  const security=securityPolicyForDocument(document);
  const allowed=documentAllowedBySearchPolicy(document,activeSearchPolicy);
  return {
    acl_partition_refs:stringArray(extensions.aclPartitionRefs).length?stringArray(extensions.aclPartitionRefs):['local:owner'],
    tags:stringArray(extensions.tags),
    metadata:{kind:document.kind,theme:document.theme_id??'vgt-default-dark',security:security.profile,extension:document.kind.toLowerCase()},
    derived_fields:collectDocumentDerivedSearchFields(document,activeSearchPolicy).map(field=>({kind:field.kind,source_id:field.sourceId,text:field.text,provenance:`${field.provenance};confidence=${field.confidence??'n/a'};generated=${field.generatedAt}`})),
    privacy_excluded:!allowed||extensions.privacyExcludedFromSearch===true||security.profile==='VGT_TOP_SECRET',
    language:'und',
  };
}

async function exportEncryptedIndex(signal?:AbortSignal):Promise<void>{
  if(signal?.aborted)throw signal.reason??new DOMException('Search sync aborted','AbortError');
  const transferId=newSearchTransferId();
  const response=await requestJson<{success:boolean;total_bytes:number;sha256:string;chunk_size:number}>('/api/v1/search/export/begin','POST',{workspace_scope:SEARCH_SCOPE,transfer_id:transferId},signal);
  try{
    if(response.success!==true||!Number.isSafeInteger(response.total_bytes)||response.total_bytes<=0||response.total_bytes>MAX_ENCRYPTED_INDEX_BYTES||!SHA256_HEX.test(response.sha256)||response.chunk_size!==SEARCH_TRANSFER_CHUNK_BYTES)throw new Error('Native search export transfer metadata is invalid');
    const totalChunks=Math.ceil(response.total_bytes/SEARCH_TRANSFER_CHUNK_BYTES);
    const encodedChunks:string[]=[];
    let receivedBytes=0;
    for(let chunkIndex=0;chunkIndex<totalChunks;chunkIndex++){
      if(signal?.aborted)throw signal.reason??new DOMException('Search sync aborted','AbortError');
      const chunk=await requestJson<{success:boolean;chunk_index:number;total_chunks:number;data_base64:string}>('/api/v1/search/export/chunk','POST',{transfer_id:transferId,chunk_index:chunkIndex},signal);
      if(chunk.success!==true||chunk.chunk_index!==chunkIndex||chunk.total_chunks!==totalChunks||typeof chunk.data_base64!=='string')throw new Error('Native search export chunk sequence is invalid');
      const chunkBytes=decodedBase64Length(chunk.data_base64);
      const expectedChunkBytes=Math.min(SEARCH_TRANSFER_CHUNK_BYTES,response.total_bytes-receivedBytes);
      if(chunkBytes!==expectedChunkBytes)throw new Error('Native search export chunk length is invalid');
      encodedChunks.push(chunk.data_base64);
      receivedBytes+=chunkBytes;
    }
    if(receivedBytes!==response.total_bytes)throw new Error('Native search export total length mismatch');
    const blob=encodedChunks.join('');
    if(decodedBase64Length(blob)!==response.total_bytes)throw new Error('Native search export encoding length mismatch');
    if(await sha256Base64(blob)!==response.sha256.toLowerCase())throw new Error('Native search export integrity check failed');
    await saveEncryptedIndex(blob,response.sha256.toLowerCase());
  }catch(error){
    await abortSearchTransfer(transferId);
    throw error;
  }
}

async function rebuild(documents:Record<string,WorkspaceDocument>,signal?:AbortSignal):Promise<void>{
  if(signal?.aborted)throw signal.reason??new DOMException('Search sync aborted','AbortError');
  const values=Object.values(documents).slice(0,100_000);
  await requestJson('/api/v1/search/rebuild','POST',{documents:values.map((document)=>({document,options:indexOptions(document)}))},signal);
  if(signal?.aborted)throw signal.reason??new DOMException('Search sync aborted','AbortError');
  indexedVersions=new Map(values.filter((document)=>securityPolicyForDocument(document).profile!=='VGT_TOP_SECRET').map((document)=>[document.id,document.version]));
  await exportEncryptedIndex(signal);
}

export async function syncWorkspaceSearchIndex(documents:Record<string,WorkspaceDocument>,signal?:AbortSignal):Promise<void>{
  const run=async()=>{
    if(signal?.aborted)throw signal.reason??new DOMException('Search sync aborted','AbortError');
    if(!initialized){
      const blob=await loadEncryptedIndex();
      if(signal?.aborted)throw signal.reason??new DOMException('Search sync aborted','AbortError');
      if(blob){try{await importEncryptedIndex(blob,signal);}catch(error){if(signal?.aborted)throw error;/* derived state: rebuild below */}}
      await rebuild(documents,signal);
      initialized=true;
      return;
    }
    let changed=false;
    const liveIds=new Set(Object.keys(documents));
    for(const document of Object.values(documents)){
      if(signal?.aborted)throw signal.reason??new DOMException('Search sync aborted','AbortError');
      if(securityPolicyForDocument(document).profile==='VGT_TOP_SECRET'){
        if(indexedVersions.has(document.id)){await requestJson('/api/v1/search/delete','POST',{document_id:document.id},signal);indexedVersions.delete(document.id);changed=true;}
        continue;
      }
      if(indexedVersions.get(document.id)!==document.version){await requestJson('/api/v1/search/upsert','POST',{document,options:indexOptions(document)},signal);indexedVersions.set(document.id,document.version);changed=true;}
    }
    for(const id of [...indexedVersions.keys()]){
      if(signal?.aborted)throw signal.reason??new DOMException('Search sync aborted','AbortError');
      if(!liveIds.has(id)){await requestJson('/api/v1/search/delete','POST',{document_id:id},signal);indexedVersions.delete(id);changed=true;}
    }
    if(changed)await exportEncryptedIndex(signal);
  };
  const job=syncTail.catch(()=>undefined).then(run);
  syncTail=job.catch(()=>undefined);
  return job;
}

export async function queryWorkspaceSearch(query:string,documents:Record<string,WorkspaceDocument>,metadataLocked:boolean):Promise<WorkspaceSearchHit[]>{
  const trimmed=query.trim();if(!trimmed)return[];
  await syncWorkspaceSearchIndex(documents);
  const unlocked_document_ids=metadataLocked?[]:Object.values(documents).filter((document)=>securityPolicyForDocument(document).profile!=='VGT_TOP_SECRET').map((document)=>document.id);
  const response=await requestJson<{success:boolean;hits:WorkspaceSearchHit[]}>('/api/v1/search/query','POST',{query:trimmed,permission:{allowed_partitions:['local:owner'],unlocked_document_ids},limit:MAX_RESULTS});
  return response.hits??[];
}


export interface WorkspaceSearchFacetCounts { document_kinds:Record<string,number>; fields:Record<string,number>; tags:Record<string,number>; }
export async function queryWorkspaceSearchFacets(documents:Record<string,WorkspaceDocument>,metadataLocked:boolean):Promise<WorkspaceSearchFacetCounts>{
  await syncWorkspaceSearchIndex(documents);
  const unlocked_document_ids=metadataLocked?[]:Object.values(documents).filter((document)=>securityPolicyForDocument(document).profile!=='VGT_TOP_SECRET').map((document)=>document.id);
  const response=await requestJson<{success:boolean;facets:WorkspaceSearchFacetCounts}>('/api/v1/search/facets','POST',{permission:{allowed_partitions:['local:owner'],unlocked_document_ids}});
  return response.facets??{document_kinds:{},fields:{},tags:{}};
}

export interface NativeSearchPreferences {
  enabled_modules: DocumentKind[]; excluded_document_ids:string[]; excluded_spaces:string[]; max_encrypted_index_bytes:number; max_history_entries:number; history_enabled:boolean; semantic_ranking_enabled:boolean; local_ocr_enabled:boolean; transcription_enabled:boolean; transcription_provider:'local'|'configured-provider'; transcription_connector_id?:string|null; external_connector_indexing_enabled:boolean; allowed_connector_ids:string[]; saved_searches:Array<{id:string;name:string;query:string;group:string;created_at:number;updated_at:number}>; recent_queries:Array<{query:string;executed_at:number}>;
}
function policyFromNative(value:NativeSearchPreferences):SearchAdminPolicy{return normalizeSearchPolicy({enabledModules:value.enabled_modules,excludedDocumentIds:value.excluded_document_ids,excludedSpaces:value.excluded_spaces,maxEncryptedIndexBytes:value.max_encrypted_index_bytes,maxHistoryEntries:value.max_history_entries,historyEnabled:value.history_enabled,semanticRankingEnabled:value.semantic_ranking_enabled,localOcrEnabled:value.local_ocr_enabled,transcription:{enabled:value.transcription_enabled,provider:value.transcription_provider,connectorId:value.transcription_connector_id??undefined},externalConnectorIndexing:{enabled:value.external_connector_indexing_enabled,allowedConnectorIds:value.allowed_connector_ids}});}
function nativeFromPolicy(policy:SearchAdminPolicy,current?:NativeSearchPreferences):NativeSearchPreferences{return{enabled_modules:policy.enabledModules,excluded_document_ids:policy.excludedDocumentIds,excluded_spaces:policy.excludedSpaces,max_encrypted_index_bytes:policy.maxEncryptedIndexBytes,max_history_entries:policy.maxHistoryEntries,history_enabled:policy.historyEnabled,semantic_ranking_enabled:policy.semanticRankingEnabled,local_ocr_enabled:policy.localOcrEnabled,transcription_enabled:policy.transcription.enabled,transcription_provider:policy.transcription.provider,transcription_connector_id:policy.transcription.connectorId??null,external_connector_indexing_enabled:policy.externalConnectorIndexing.enabled,allowed_connector_ids:policy.externalConnectorIndexing.allowedConnectorIds,saved_searches:current?.saved_searches??[],recent_queries:current?.recent_queries??[]};}
export async function fetchSearchPreferences():Promise<{policy:SearchAdminPolicy;savedSearches:SearchSavedSearch[];recentQueries:Array<{query:string;executedAt:number}>}>{const response=await requestJson<{success:boolean;preferences:NativeSearchPreferences}>('/api/v1/search/preferences');activeSearchPolicy=policyFromNative(response.preferences);return{policy:activeSearchPolicy,savedSearches:(response.preferences.saved_searches??[]).map(item=>({id:item.id,name:item.name,query:item.query,group:(['all','documents','people','work','messages','data','spaces'].includes(item.group)?item.group:'all') as SearchSavedSearch['group'],createdAt:item.created_at,updatedAt:item.updated_at})),recentQueries:(response.preferences.recent_queries??[]).map(item=>({query:item.query,executedAt:item.executed_at}))};}
export async function saveSearchPolicy(policy:SearchAdminPolicy):Promise<SearchAdminPolicy>{const current=await requestJson<{success:boolean;preferences:NativeSearchPreferences}>('/api/v1/search/preferences');const normalized=normalizeSearchPolicy(policy);await requestJson('/api/v1/search/preferences','POST',nativeFromPolicy(normalized,current.preferences));activeSearchPolicy=normalized;await exportEncryptedIndex();return normalized;}
export async function recordSearchQuery(query:string,executedAt=Date.now()):Promise<void>{if(!activeSearchPolicy.historyEnabled)return;await requestJson('/api/v1/search/history/record','POST',{query:query.slice(0,4096),executed_at:executedAt});await exportEncryptedIndex();}
export async function clearNativeSearchHistory():Promise<void>{await requestJson('/api/v1/search/history/clear','POST',{});await exportEncryptedIndex();}
export async function saveNativeSearch(saved:SearchSavedSearch):Promise<void>{await requestJson('/api/v1/search/saved/upsert','POST',{id:saved.id,name:saved.name,query:saved.query,group:saved.group,created_at:saved.createdAt,updated_at:saved.updatedAt});await exportEncryptedIndex();}

export async function fetchWorkspaceSearchStatus():Promise<WorkspaceSearchStatus>{
  try{const response=await requestJson<{generation:number;document_count:number;locked:boolean}>('/api/v1/search/status');return{connected:true,generation:response.generation,documentCount:response.document_count,locked:response.locked,detail:'Native encrypted Search Core v3 ready'};}
  catch{return{connected:false,generation:0,documentCount:0,locked:true,detail:'Native Search Core unavailable; full-text search is fail-closed'};}
}
