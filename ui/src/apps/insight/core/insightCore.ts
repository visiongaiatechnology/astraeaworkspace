// STATUS: DIAMANT VGT SUPREME — common bounded primitives for Astraea Insight
import { DEFAULT_INSIGHT_MODEL, type AggregationFunction, type InsightDocumentModel, type InsightRow, type InsightScalar } from '../domain/types';

export class InsightError extends Error { constructor(readonly code:string){super(code);this.name='InsightError';} }
export const INSIGHT_LIMITS={maxString:8192,maxRows:1_000_000,maxColumns:4096,maxSources:4096,maxQueries:4096,maxVisuals:10_000,maxAudit:20_000,maxJsonBytes:128*1024*1024} as const;
export function stableInsightId(prefix:string,input:string):string{let h=2166136261;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}return`${prefix}-${(h>>>0).toString(16).padStart(8,'0')}`;}
export function cleanText(value:unknown,max:number=INSIGHT_LIMITS.maxString):string{const out=String(value??'').replace(/[\u0000-\u001f\u007f]/g,'').trim();if(!out||out.length>max)throw new InsightError('insight-text-boundary');return out;}
export function clone<T>(value:T):T{return structuredClone(value);}
export function assertRow(row:InsightRow):void{const keys=Object.keys(row);if(keys.length>INSIGHT_LIMITS.maxColumns)throw new InsightError('insight-column-limit');for(const [key,value] of Object.entries(row)){cleanText(key,512);if(value!==null&&!['string','number','boolean'].includes(typeof value))throw new InsightError('insight-scalar-invalid');if(typeof value==='string'&&value.length>INSIGHT_LIMITS.maxString)throw new InsightError('insight-cell-limit');if(typeof value==='number'&&!Number.isFinite(value))throw new InsightError('insight-number-invalid');}}
export function scalarCompare(a:InsightScalar,b:InsightScalar):number{if(a===b)return 0;if(a===null)return -1;if(b===null)return 1;if(typeof a==='number'&&typeof b==='number')return a-b;return String(a).localeCompare(String(b),'en',{numeric:true,sensitivity:'base'});}
export function estimateRowsBytes(rows:readonly InsightRow[]):number{let total=2;for(const row of rows){total+=2;for(const [k,v] of Object.entries(row))total+=k.length*2+(typeof v==='string'?v.length*2:16);}return total;}
/**
 * The ONE aggregation definition of Astraea Insight. The bounded query executor and the visible
 * pivot matrix both call this, so a matrix cell and a query row can never disagree.
 *
 * Null policy, documented in one place: COUNT and COUNT_DISTINCT count every value of the group
 * including `null`; SUM/AVG/MIN/MAX ignore values that are not finite numbers. An unknown
 * aggregation is rejected with a named code instead of silently returning 0.
 */
export function aggregateInsightScalars(values:readonly InsightScalar[],fn:AggregationFunction):number{
  const nums=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
  switch(fn){
    case'COUNT':return values.length;
    case'COUNT_DISTINCT':return new Set(values.map(v=>JSON.stringify(v))).size;
    case'SUM':return nums.reduce((a,b)=>a+b,0);
    case'AVG':return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;
    case'MIN':return nums.length?Math.min(...nums):0;
    case'MAX':return nums.length?Math.max(...nums):0;
  }
  throw new InsightError('insight-aggregate-invalid');
}
export function normalizeInsightModel(input:InsightDocumentModel):InsightDocumentModel{const model=clone(input);if(model.schemaVersion!==2)throw new InsightError('insight-schema-version');if(!Number.isInteger(model.revision)||model.revision<1)throw new InsightError('insight-revision-invalid');if(model.sources.length>INSIGHT_LIMITS.maxSources||model.queries.length>INSIGHT_LIMITS.maxQueries)throw new InsightError('insight-object-limit');const visualCount=model.report.pages.reduce((n,p)=>n+p.visuals.length,0);if(visualCount>INSIGHT_LIMITS.maxVisuals)throw new InsightError('insight-visual-limit');model.audit=model.audit.slice(-INSIGHT_LIMITS.maxAudit);return model;}
export function bumpInsight(model:InsightDocumentModel):InsightDocumentModel{return{...normalizeInsightModel(model),revision:model.revision+1};}


export function migrateInsightModel(input:unknown):InsightDocumentModel{
  if(input&&typeof input==='object'&&(input as {schemaVersion?:unknown}).schemaVersion===2)return normalizeInsightModel(input as InsightDocumentModel);
  const legacy=input&&typeof input==='object'?input as Partial<InsightDocumentModel>:{};
  const base=structuredClone(DEFAULT_INSIGHT_MODEL);
  if(typeof legacy.datasetName==='string'&&legacy.datasetName.trim())base.datasetName=legacy.datasetName.slice(0,256);
  if(Array.isArray(legacy.records))base.records=structuredClone(legacy.records);
  if(Array.isArray(legacy.kpis))base.kpis=structuredClone(legacy.kpis);
  if(Array.isArray(legacy.querySteps)){base.querySteps=structuredClone(legacy.querySteps);base.queries[0].steps=structuredClone(legacy.querySteps);}
  if(legacy.pivotConfig)base.pivotConfig=structuredClone(legacy.pivotConfig);
  return normalizeInsightModel(base);
}
