// STATUS: DIAMANT VGT SUPREME — bounded advanced query, filter, ranking and saved-search core.
import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';
import type { SearchAdvancedFilters, SearchBooleanOperator, SearchDocumentMetadata, SearchHistoryEntry, SearchHubHit, SearchQueryPlan, SearchSavedSearch, SearchTermClause } from './searchTypes';

const MAX_QUERY_CHARS=4096, MAX_CLAUSES=128, MAX_SAVED=128, MAX_HISTORY=256;
const KINDS: Record<string,DocumentKind>={writer:'Writer',grid:'Grid',present:'Present',notes:'Notes',pdf:'PdfStudio',pdfstudio:'PdfStudio',draw:'Draw',whiteboard:'Whiteboard',forms:'Forms',database:'Database',tasks:'Tasks',planner:'Planner',projects:'Projects',vault:'Vault',spaces:'Spaces',connect:'Connect',insight:'Insight',publish:'Publish',automate:'Automate'};
function blankFilters():SearchAdvancedFilters{return{modules:[],objectTypes:[],tags:[],owners:[],members:[],spaces:[],statuses:[],projects:[],sensitivity:[],extensions:[],exactIds:[],createdAt:{},modifiedAt:{},sizeBytes:{}};}
function uniq<T>(values:T[]):T[]{return [...new Set(values)];}
function bounded(value:string,max=256):string{return value.trim().slice(0,max);}
function parseDate(value:string):number{const direct=Number(value);if(Number.isFinite(direct)&&direct>0)return direct;const ts=Date.parse(value);if(!Number.isFinite(ts))throw new Error('Invalid date search filter');return ts;}
function parseSize(value:string):number{const m=/^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i.exec(value.trim());if(!m)throw new Error('Invalid size filter');const mult=({b:1,kb:1024,mb:1048576,gb:1073741824} as Record<string,number>)[(m[2]??'b').toLowerCase()]??1;return Math.floor(Number(m[1])*mult);}
function setRange(target:{min?:number;max?:number},op:string,value:number){if(op==='>'||op==='>=')target.min=value;if(op==='<'||op==='<=')target.max=value;if(op==='='||op===':'){target.min=value;target.max=value;}}

function lex(raw:string):string[]{const out:string[]=[];let current='',quoted=false;for(let i=0;i<raw.length;i++){const ch=raw[i];if(ch==='"'){quoted=!quoted;current+=ch;continue;}if(/\s/.test(ch)&&!quoted){if(current){out.push(current);current='';}}else current+=ch;}if(quoted)throw new Error('Unterminated quote');if(current)out.push(current);return out;}

export function parseSearchQuery(raw:string):SearchQueryPlan{
 const input=raw.trim();if(!input)throw new Error('Search query is empty');if(input.length>MAX_QUERY_CHARS)throw new Error('Search query exceeds 4096 characters');
 const filters=blankFilters(),clauses:SearchTermClause[]=[];let pending:'AND'|'OR'='AND',negate=false;const native:string[]=[];let advanced=false;
 for(const token of lex(input).slice(0,MAX_CLAUSES*2)){
  const upper=token.toUpperCase();if(upper==='AND'||upper==='OR'){pending=upper as SearchBooleanOperator;advanced=true;continue;}if(upper==='NOT'){negate=true;advanced=true;continue;}
  const filter=/^([a-zA-Z][\w-]*)(:|>=|<=|>|<|=)(.+)$/.exec(token);
  if(filter){const key=filter[1].toLowerCase(),op=filter[2],value=bounded(filter[3],1024);if(!value)throw new Error('Empty search filter');
   switch(key){
    case'type':case'app':case'module':{const kind=KINDS[value.toLowerCase()];if(!kind)throw new Error(`Unknown search module: ${value}`);filters.modules.push(kind);native.push(`type:${value.toLowerCase()}`);break;}
    case'object':filters.objectTypes.push(value.toLowerCase());native.push(`object:${value}`);break;
    case'tag':filters.tags.push(value.toLowerCase());native.push(`tag:${value}`);break;
    case'owner':case'author':filters.owners.push(value.toLowerCase());advanced=true;break;
    case'member':filters.members.push(value.toLowerCase());advanced=true;break;
    case'space':filters.spaces.push(value.toLowerCase());advanced=true;break;
    case'status':filters.statuses.push(value.toLowerCase());advanced=true;break;
    case'project':filters.projects.push(value.toLowerCase());advanced=true;break;
    case'sensitivity':{const s=value.toUpperCase().replace(/-/g,'_');if(!['STANDARD','PQC','VGT_TOP_SECRET'].includes(s))throw new Error('Unknown sensitivity');filters.sensitivity.push(s as SearchAdvancedFilters['sensitivity'][number]);advanced=true;break;}
    case'ext':case'extension':filters.extensions.push(value.toLowerCase().replace(/^\./,''));advanced=true;break;
    case'id':filters.exactIds.push(value);advanced=true;break;
    case'after':case'modified':setRange(filters.modifiedAt,op,parseDate(value));if(op===':'||op==='=')native.push(`after:${filters.modifiedAt.min}`);advanced=true;break;
    case'before':setRange(filters.modifiedAt,op===':'?'<' : op,parseDate(value));native.push(`before:${filters.modifiedAt.max}`);advanced=true;break;
    case'created':setRange(filters.createdAt,op,parseDate(value));advanced=true;break;
    case'size':setRange(filters.sizeBytes,op,parseSize(value));advanced=true;break;
    default: { const clause=parseClause(token,pending,negate);clauses.push(clause);native.push(token);advanced=true;pending='AND';negate=false;continue; }
   }
   pending='AND';negate=false;continue;
  }
  const clause=parseClause(token,pending,negate);clauses.push(clause);if(!clause.negated&&!clause.prefix&&!clause.fuzzyDistance)native.push(clause.phrase?`"${clause.value}"`:clause.value);else advanced=true;pending='AND';negate=false;
 }
 if(clauses.length>MAX_CLAUSES)throw new Error('Too many search clauses');
 filters.modules=uniq(filters.modules);filters.objectTypes=uniq(filters.objectTypes);filters.tags=uniq(filters.tags);filters.owners=uniq(filters.owners);filters.members=uniq(filters.members);filters.spaces=uniq(filters.spaces);filters.statuses=uniq(filters.statuses);filters.projects=uniq(filters.projects);filters.sensitivity=uniq(filters.sensitivity);filters.extensions=uniq(filters.extensions);filters.exactIds=uniq(filters.exactIds);
 if(!clauses.length&&!native.length){native.push('field:metadata');advanced=true;}
 return{raw:input,clauses,filters,nativeQuery:native.join(' ').trim()||'field:metadata',usesAdvancedPostFilter:advanced};
}

function parseClause(token:string,operator:SearchBooleanOperator,negated:boolean):SearchTermClause{
 let value=token,phrase=false,prefix=false,fuzzyDistance:0|1|2=0;if(value.startsWith('"')&&value.endsWith('"')&&value.length>=2){phrase=true;value=value.slice(1,-1);}if(!phrase&&value.endsWith('*')){prefix=true;value=value.slice(0,-1);}const fuzzy=!phrase?/^(.*)~([12]?)$/.exec(value):null;if(fuzzy){value=fuzzy[1];fuzzyDistance=(fuzzy[2]?Number(fuzzy[2]):1) as 1|2;}value=bounded(value.toLowerCase(),512);if(!value)throw new Error('Empty search term');return{value,phrase,prefix,fuzzyDistance,negated,operator};
}

function includesAny(values:readonly string[],wanted:readonly string[]):boolean{if(!wanted.length)return true;const hay=values.map(v=>v.toLowerCase());return wanted.some(w=>hay.includes(w.toLowerCase()));}
function inRange(value:number,range:{min?:number;max?:number}):boolean{return(range.min===undefined||value>=range.min)&&(range.max===undefined||value<=range.max);}
export function metadataMatchesFilters(meta:SearchDocumentMetadata,filters:SearchAdvancedFilters):boolean{
 if(filters.modules.length&&!filters.modules.includes(meta.kind))return false;if(filters.tags.length&&!includesAny(meta.tags,filters.tags))return false;if(filters.owners.length&&(!meta.owner||!filters.owners.includes(meta.owner.toLowerCase())))return false;if(filters.members.length&&!includesAny(meta.members,filters.members))return false;if(filters.spaces.length&&!includesAny(meta.spaces,filters.spaces))return false;if(filters.statuses.length&&!includesAny(meta.statuses,filters.statuses))return false;if(filters.projects.length&&!includesAny(meta.projects,filters.projects))return false;if(filters.sensitivity.length&&!filters.sensitivity.includes(meta.sensitivity))return false;if(filters.extensions.length&&!filters.extensions.includes(meta.extension.toLowerCase()))return false;if(filters.exactIds.length&&!filters.exactIds.includes(meta.documentId))return false;if(!inRange(meta.createdAt,filters.createdAt)||!inRange(meta.modifiedAt,filters.modifiedAt)||!inRange(meta.sizeBytes,filters.sizeBytes))return false;return true;
}

function levenshteinAtMost(a:string,b:string,max:number):boolean{if(Math.abs(a.length-b.length)>max)return false;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const cur=[i];let rowMin=cur[0];for(let j=1;j<=b.length;j++){const v=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));cur[j]=v;rowMin=Math.min(rowMin,v);}if(rowMin>max)return false;prev=cur;}return prev[b.length]<=max;}
function clauseMatch(clause:SearchTermClause,text:string):boolean{const lower=text.toLowerCase();let matched=false;if(clause.phrase)matched=lower.includes(clause.value);else{const tokens=lower.split(/[^\p{L}\p{N}_-]+/u).filter(Boolean);matched=clause.prefix?tokens.some(t=>t.startsWith(clause.value)):clause.fuzzyDistance?tokens.some(t=>levenshteinAtMost(t,clause.value,clause.fuzzyDistance)):tokens.includes(clause.value);}return clause.negated?!matched:matched;}
export function clausesMatchHit(plan:SearchQueryPlan,hit:SearchHubHit):boolean{if(!plan.clauses.length)return true;const text=`${hit.documentTitle} ${hit.snippet} ${hit.objectType} ${hit.field}`;let state=true,seen=false;for(const clause of plan.clauses){const m=clauseMatch(clause,text);if(!seen){state=m;seen=true;}else state=clause.operator==='OR'?state||m:state&&m;}return state;}

export function rankSearchHits(hits:readonly SearchHubHit[],plan:SearchQueryPlan,metadata:ReadonlyMap<string,SearchDocumentMetadata>,now=Date.now()):SearchHubHit[]{
 const out:SearchHubHit[]=[];for(const hit of hits){const meta=metadata.get(hit.documentId);if(!meta||!metadataMatchesFilters(meta,plan.filters)||!clausesMatchHit(plan,hit))continue;let score=Math.max(0,hit.lexicalScore),why:string[]=[];const title=hit.documentTitle.toLowerCase();for(const clause of plan.clauses.filter(c=>!c.negated)){if(title===clause.value){score+=18;why.push('Exact title match');}else if(title.includes(clause.value)){score+=8;why.push('Title match');}if(hit.field==='title'){score+=5;why.push('Matched title field');}}
 const ageDays=Math.max(0,(now-meta.modifiedAt)/86_400_000);const recency=Math.max(0,4-Math.log2(1+ageDays));score+=recency;if(recency>2)why.push('Recently modified');if(meta.pinned){score+=4;why.push('Pinned');}if(meta.favorite){score+=2;why.push('Favorite');}if(plan.filters.tags.length)why.push(`Tag filter: ${plan.filters.tags.join(', ')}`);if(plan.filters.modules.length)why.push(`Module filter: ${plan.filters.modules.join(', ')}`);out.push({...hit,finalScore:score,why:[...new Set(why)].slice(0,8)});}
 return out.sort((a,b)=>b.finalScore-a.finalScore||b.modifiedAt-a.modifiedAt||a.deepLink.localeCompare(b.deepLink));
}

export function addSavedSearch(existing:readonly SearchSavedSearch[],input:{name:string;query:string;group?:SearchSavedSearch['group']},now=Date.now()):SearchSavedSearch[]{const name=bounded(input.name,120),query=bounded(input.query,MAX_QUERY_CHARS);if(!name||!query)throw new Error('Saved search needs name and query');parseSearchQuery(query);const id=`search-${hashStable(`${name}\u0000${query}`)}`;const prior=existing.find(item=>item.id===id);const next:SearchSavedSearch={id,name,query,group:input.group??'all',createdAt:prior?.createdAt??now,updatedAt:now};return[...existing.filter(item=>item.id!==id),next].slice(-MAX_SAVED);}
export function pushQueryHistory(existing:readonly SearchHistoryEntry[],query:string,enabled:boolean,now=Date.now()):SearchHistoryEntry[]{if(!enabled)return[...existing];const value=bounded(query,MAX_QUERY_CHARS);if(!value)return[...existing];return[{query:value,executedAt:now},...existing.filter(item=>item.query!==value)].slice(0,MAX_HISTORY);}
export function clearQueryHistory():SearchHistoryEntry[]{return[];}
function hashStable(value:string):string{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}

export function createMetadataMap(documents:Record<string,WorkspaceDocument>,mapper:(document:WorkspaceDocument)=>SearchDocumentMetadata):Map<string,SearchDocumentMetadata>{const map=new Map<string,SearchDocumentMetadata>();for(const doc of Object.values(documents).slice(0,100_000))map.set(doc.id,mapper(doc));return map;}
