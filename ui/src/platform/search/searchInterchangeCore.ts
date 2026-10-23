// STATUS: DIAMANT VGT SUPREME — bounded portable Search profile and results interchange.
import type {SearchAdminPolicy,SearchHubHit,SearchSavedSearch} from './searchTypes';
import {normalizeSearchPolicy} from './searchIndexPolicyCore';
import {parseSearchQuery} from './searchQueryCore';
const MAX_PACKAGE=4*1024*1024,MAX_SAVED=128,MAX_RESULTS=10_000,MAX_CELL=64*1024,MAX_CSV_BYTES=16*1024*1024;
export interface SearchPortablePackage{format:'vgt-search-portable/1';policy:SearchAdminPolicy;savedSearches:SearchSavedSearch[];unsupported:unknown[];}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));}return value;}
export function exportSearchPortablePackage(policy:SearchAdminPolicy,savedSearches:readonly SearchSavedSearch[],unsupported:readonly unknown[]=[]):Uint8Array{const searches=savedSearches.slice(0,MAX_SAVED).map(item=>{parseSearchQuery(item.query);return{...item,name:item.name.slice(0,120),query:item.query.slice(0,4096)};});const bytes=new TextEncoder().encode(JSON.stringify(canonical({format:'vgt-search-portable/1',policy:normalizeSearchPolicy(policy),savedSearches:searches,unsupported:[...unsupported].slice(0,64)})));if(bytes.byteLength>MAX_PACKAGE)throw new Error('Search portable package exceeds byte boundary');return bytes;}
export function importSearchPortablePackage(bytes:Uint8Array):SearchPortablePackage{if(bytes.byteLength<2||bytes.byteLength>MAX_PACKAGE)throw new Error('Search portable package byte boundary');let raw:unknown;try{raw=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('Search portable package JSON invalid');}if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Search portable package shape invalid');const obj=raw as Record<string,unknown>;if(obj.format!=='vgt-search-portable/1'||!obj.policy||!Array.isArray(obj.savedSearches)||obj.savedSearches.length>MAX_SAVED)throw new Error('Search portable package contract invalid');const saved=obj.savedSearches.map(value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Saved Search shape invalid');const item=value as Record<string,unknown>;if(typeof item.id!=='string'||typeof item.name!=='string'||typeof item.query!=='string'||typeof item.group!=='string'||typeof item.createdAt!=='number'||typeof item.updatedAt!=='number')throw new Error('Saved Search fields invalid');parseSearchQuery(item.query);return{id:item.id.slice(0,128),name:item.name.slice(0,120),query:item.query.slice(0,4096),group:(['all','documents','people','work','messages','data','spaces'].includes(item.group)?item.group:'all') as SearchSavedSearch['group'],createdAt:item.createdAt,updatedAt:item.updatedAt};});return{format:'vgt-search-portable/1',policy:normalizeSearchPolicy(obj.policy as Partial<SearchAdminPolicy>),savedSearches:saved,unsupported:Array.isArray(obj.unsupported)?obj.unsupported.slice(0,64):[]};}
function csvCell(value:string):string{const bounded=value.slice(0,MAX_CELL);return/[",\r\n]/.test(bounded)?`"${bounded.replace(/"/g,'""')}"`:bounded;}
export function exportSearchResultsCsv(hits:readonly SearchHubHit[]):string{const lines=['document_id,document_title,module,object_id,object_type,field,snippet,deep_link,score'];for(const hit of hits.slice(0,MAX_RESULTS))lines.push([hit.documentId,hit.documentTitle,hit.documentKind,hit.objectId,hit.objectType,hit.field,hit.snippet,hit.deepLink,String(hit.finalScore)].map(csvCell).join(','));return lines.join('\r\n')+'\r\n';}
const SEARCH_CSV_HEADER=['document_id','document_title','module','object_id','object_type','field','snippet','deep_link','score'] as const;
const SEARCH_CSV_SCORE=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function assertSearchCsvByteBoundary(csv:string):void{
  if(csv.length>MAX_CSV_BYTES)throw new Error('Search CSV byte boundary');
  let bytes=0;
  for(let i=0;i<csv.length;i++){
    const code=csv.charCodeAt(i);
    if(code<0x80)bytes+=1;
    else if(code<0x800)bytes+=2;
    else if(code>=0xd800&&code<=0xdbff&&i+1<csv.length){
      const next=csv.charCodeAt(i+1);
      if(next>=0xdc00&&next<=0xdfff){bytes+=4;i++;}else bytes+=3;
    }else bytes+=3;
    if(bytes>MAX_CSV_BYTES)throw new Error('Search CSV byte boundary');
  }
}

function parseSearchCsvRecords(csv:string):string[][]{
  const records:string[][]=[];
  let row:string[]=[];
  let fieldStart=0;
  let fieldChunks:string[]|null=null;
  let fieldLength=0;
  let quoted=false;
  let afterQuote=false;
  let recordActive=false;

  const addFieldChunk=(chunk:string):void=>{
    fieldLength+=chunk.length;
    if(fieldLength>MAX_CELL)throw new Error('Search CSV cell boundary');
    fieldChunks?.push(chunk);
  };
  const finishField=(end:number):void=>{
    let value:string;
    if(fieldChunks){
      addFieldChunk(csv.slice(fieldStart,end));
      value=fieldChunks.join('');
    }else{
      const length=end-fieldStart;
      if(length>MAX_CELL)throw new Error('Search CSV cell boundary');
      value=csv.slice(fieldStart,end);
    }
    if(row.length>=SEARCH_CSV_HEADER.length)throw new Error('Search CSV column count invalid');
    row.push(value);
    fieldChunks=null;
    fieldLength=0;
    afterQuote=false;
  };
  const finishRecord=(end:number):void=>{
    finishField(end);
    if(recordActive){
      records.push(row);
      if(records.length>MAX_RESULTS+1)throw new Error('Search CSV row boundary');
    }else if(row.length!==1||row[0]!==''){
      throw new Error('Search CSV row state invalid');
    }
    row=[];
    recordActive=false;
    fieldStart=end+1;
  };

  for(let i=0;i<csv.length;i++){
    const ch=csv[i];
    if(quoted){
      if(ch==='"'){
        if(csv[i+1]==='"'){
          addFieldChunk(csv.slice(fieldStart,i));
          addFieldChunk('"');
          i++;
          fieldStart=i+1;
          continue;
        }
        addFieldChunk(csv.slice(fieldStart,i));
        fieldStart=i+1;
        quoted=false;
        afterQuote=true;
        continue;
      }
      if(i-fieldStart>MAX_CELL*2)throw new Error('Search CSV cell boundary');
      continue;
    }

    if(afterQuote){
      if(ch===','){
        finishField(i);
        fieldStart=i+1;
        recordActive=true;
        continue;
      }
      if(ch==='\n'||ch==='\r'){
        if(ch==='\r'&&csv[i+1]!=='\n')throw new Error('Search CSV line ending invalid');
        finishRecord(i);
        if(ch==='\r')i++;
        fieldStart=i+1;
        continue;
      }
      throw new Error('Search CSV quote invalid');
    }

    if(ch===','){
      finishField(i);
      fieldStart=i+1;
      recordActive=true;
      continue;
    }
    if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&csv[i+1]!=='\n')throw new Error('Search CSV line ending invalid');
      finishRecord(i);
      if(ch==='\r')i++;
      fieldStart=i+1;
      continue;
    }
    if(ch==='"'){
      if(i!==fieldStart)throw new Error('Search CSV quote invalid');
      fieldChunks=[];
      fieldStart=i+1;
      quoted=true;
      recordActive=true;
      continue;
    }
    if(i-fieldStart>=MAX_CELL)throw new Error('Search CSV cell boundary');
    recordActive=true;
  }

  if(quoted)throw new Error('Search CSV quote invalid');
  if(recordActive||row.length>0||fieldChunks!==null||afterQuote)finishRecord(csv.length);
  return records;
}

export function importSearchResultsCsv(csv:string):Array<{documentId:string;documentTitle:string;module:string;objectId:string;objectType:string;field:string;snippet:string;deepLink:string;score:number}>{
  if(typeof csv!=='string')throw new Error('Search CSV input invalid');
  assertSearchCsvByteBoundary(csv);
  const records=parseSearchCsvRecords(csv);
  if(records.length<1)throw new Error('Search CSV header invalid');
  if(records.length>MAX_RESULTS+1)throw new Error('Search CSV row boundary');
  const header=records[0];
  if(header.length!==SEARCH_CSV_HEADER.length||header.some((value,index)=>value!==SEARCH_CSV_HEADER[index]))throw new Error('Search CSV header invalid');
  return records.slice(1).map(c=>{
    if(c.length!==SEARCH_CSV_HEADER.length)throw new Error('Search CSV column count invalid');
    if(!SEARCH_CSV_SCORE.test(c[8]))throw new Error('Search CSV score invalid');
    const score=Number(c[8]);
    if(!Number.isFinite(score))throw new Error('Search CSV score invalid');
    return{documentId:c[0],documentTitle:c[1],module:c[2],objectId:c[3],objectType:c[4],field:c[5],snippet:c[6],deepLink:c[7],score};
  });
}
