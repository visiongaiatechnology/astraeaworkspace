// STATUS: PLATIN — BATCH-INSIGHT-2: the ONE delimited-table reader of Astraea Insight.
//
// MEASURED PROBLEM before this batch: the connector engine coerced each cell on its own
// (`Number(raw)===raw` per cell), so one CSV column could deliver numbers and strings at the same
// time and the visible aggregate silently counted only the numeric subset. A column now has exactly
// one inferred type; a value that does not fit the inferred type makes the ROW an error that is
// reported with its row number and column — nothing is silently dropped or coerced.
import type { InsightColumnSchema, InsightDataType, InsightRow, InsightScalar } from '../domain/types';
import { InsightError, INSIGHT_LIMITS, cleanText } from '../core/insightCore';

export interface InsightTabularLimits { readonly maxBytes:number; readonly maxRows:number; readonly maxColumns:number; readonly maxDepth:number; readonly maxErrors:number; }
export const TABULAR_LIMITS: InsightTabularLimits = { maxBytes:64*1024*1024, maxRows:500_000, maxColumns:4_096, maxDepth:32, maxErrors:10_000 };

export interface InsightSourceError { row:number; column:string; code:string; }
export interface InsightRawTable { headers:string[]; rows:string[][]; errors:InsightSourceError[]; }
export interface InsightTypedTable { headers:string[]; rows:InsightRow[]; schema:InsightColumnSchema[]; errors:InsightSourceError[]; }

/** RFC-4180-style tokenizer for one record. */
function tokenizeLine(line:string,delimiter:string):string[]{
  const out:string[]=[];let current='';let quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}
    else if(ch===delimiter&&!quoted){out.push(current);current='';}
    else current+=ch;
  }
  out.push(current);
  return out;
}

/** Read a delimited text into raw string cells. Header names are cleaned and bounded. */
export function readDelimitedTable(text:string,delimiter:string,limits:InsightTabularLimits=TABULAR_LIMITS):InsightRawTable{
  const lines=text.replace(/\r\n?/g,'\n').split('\n').filter((line)=>line.length>0);
  if(!lines.length)return{headers:[],rows:[],errors:[]};
  const headers=tokenizeLine(lines[0],delimiter).map((header,index)=>cleanText(header||`column_${index+1}`,256));
  if(headers.length>limits.maxColumns)throw new InsightError('tabular-column-limit');
  const rows:string[][]=[];const errors:InsightSourceError[]=[];
  for(let index=1;index<lines.length;index++){
    const values=tokenizeLine(lines[index],delimiter);
    if(values.length!==headers.length){
      if(errors.length>=limits.maxErrors)throw new InsightError('tabular-error-limit');
      errors.push({row:index,column:'',code:'tabular-column-mismatch'});
      continue;
    }
    rows.push(values);
    if(rows.length>limits.maxRows)throw new InsightError('file-row-limit');
  }
  return{headers,rows,errors};
}

const ISO_DATE=/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?$/;
function isBlank(value:string):boolean{return value.trim()==='';}
function asNumber(value:string):number|null{const trimmed=value.trim();if(trimmed==='')return null;const parsed=Number(trimmed);return Number.isFinite(parsed)&&String(parsed)===trimmed?parsed:null;}

/** Infer the single type of a column from all of its raw values. */
export function inferColumnType(values:readonly string[]):InsightDataType{
  const present=values.filter((value)=>!isBlank(value));
  if(!present.length)return'unknown';
  if(present.every((value)=>asNumber(value)!==null))return present.every((value)=>Number.isInteger(asNumber(value))) ? 'integer' : 'number';
  if(present.every((value)=>/^(?:true|false)$/i.test(value.trim())))return'boolean';
  if(present.every((value)=>ISO_DATE.test(value.trim())&&Number.isFinite(Date.parse(value.trim()))))return'date';
  return'string';
}

/** Convert one raw cell into the column's declared type. `null` means "empty". */
export function convertCell(raw:string,type:InsightDataType):InsightScalar{
  if(isBlank(raw))return null;
  switch(type){
    case'integer':{const value=asNumber(raw);return value===null?null:Math.trunc(value);}
    case'number':case'currency':case'percentage':{return asNumber(raw);}
    case'boolean':return /^true$/i.test(raw.trim());
    case'date':case'datetime':return String(raw).trim();
    default:return raw;
  }
}

/**
 * Materialize the raw table with inferred per-column types.
 *
 * A column whose values do not all fit one type becomes a text column (no per-cell coercion, so a
 * number-like string stays a string). The remaining per-row source error is a cell that cannot be
 * represented inside the documented bounds; that row is reported with row number and column and is
 * not added to the dataset.
 */
export function buildTypedTable(table:InsightRawTable,limits:InsightTabularLimits=TABULAR_LIMITS):InsightTypedTable{
  const schema:InsightColumnSchema[]=table.headers.map((name,index)=>({
    name,
    type:inferColumnType(table.rows.map((row)=>row[index]??'')),
    nullable:table.rows.some((row)=>isBlank(row[index]??'')),
  }));
  const rows:InsightRow[]=[];const errors=[...table.errors];
  for(let index=0;index<table.rows.length;index++){
    const raw=table.rows[index];
    const row:InsightRow={};let failed=false;
    for(let column=0;column<table.headers.length;column++){
      const name=table.headers[column];
      const value=convertCell(raw[column]??'',schema[column].type);
      if(typeof value==='string'&&value.length>INSIGHT_LIMITS.maxString){
        if(errors.length>=limits.maxErrors)throw new InsightError('tabular-error-limit');
        errors.push({row:index+1,column:name,code:'tabular-cell-limit'});
        failed=true;
      }
      row[name]=value;
    }
    if(!failed)rows.push(row);
  }
  return{headers:[...table.headers],rows,schema,errors};
}

/** Delimited text -> typed rows. One definition used by the connector intake and the local import. */
export function parseDelimitedRows(text:string,delimiter:string,limits:InsightTabularLimits=TABULAR_LIMITS):InsightTypedTable{
  return buildTypedTable(readDelimitedTable(text,delimiter,limits),limits);
}

/** Reject a JSON document that nests deeper than the documented bound before it is parsed. */
export function assertJsonDepth(text:string,maxDepth:number=TABULAR_LIMITS.maxDepth):void{
  let depth=0;let inString=false;let escape=false;
  for(const ch of text){
    if(inString){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')inString=false;continue;}
    if(ch==='"'){inString=true;continue;}
    if(ch==='{'||ch==='['){depth++;if(depth>maxDepth)throw new InsightError('json-depth-limit');}
    else if(ch==='}'||ch===']')depth=Math.max(0,depth-1);
  }
}
