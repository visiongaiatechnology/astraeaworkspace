// STATUS: DIAMANT VGT SUPREME
// Bounded local Grid query sources. No network access occurs in this module.
import { inspectForeignFile } from '../../../../platform/import-sandbox/importExportSandbox';
import { inspectBoundedForeignXml } from '../../../../shared/interoperability/xml';

import type { GridCell, GridQuerySourceDefinition, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { importXlsx } from '../../../../platform/interop/xlsx';
import { importOds } from '../../../../platform/interop/ods';
import { assertQueryTableLimits, type QueryColumn, type QueryColumnType, type QueryTable, type QueryValue } from '../gridPowerQuery';
import {
  assertQueryMatrixBounds,
  assertQueryTextBytes,
  GRID_QUERY_MAX_CELL_CHARS,
  GRID_QUERY_MAX_CELLS,
  GRID_QUERY_MAX_COLUMNS,
  GRID_QUERY_MAX_ROWS,
  GRID_QUERY_MAX_SOURCE_BYTES,
} from '../gridQueryLimits';

const MAX_SOURCE_BYTES = GRID_QUERY_MAX_SOURCE_BYTES;
const MAX_ROWS = GRID_QUERY_MAX_ROWS;
const MAX_COLS = GRID_QUERY_MAX_COLUMNS;
const MAX_CELLS = GRID_QUERY_MAX_CELLS;
const MAX_CELL_CHARS = GRID_QUERY_MAX_CELL_CHARS;

function inferType(values: QueryValue[]): QueryColumnType {
  const nonEmpty=values.filter((v)=>v!==null&&v!=='');
  if(!nonEmpty.length)return 'text';
  if(nonEmpty.every((v)=>typeof v==='number'||(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)))))return 'number';
  if(nonEmpty.every((v)=>typeof v==='boolean'||String(v).toLowerCase()==='true'||String(v).toLowerCase()==='false'))return 'boolean';
  if(nonEmpty.every((v)=>typeof v==='string'&&!Number.isNaN(Date.parse(v))))return 'date';
  return 'text';
}

function normalizeMatrix(matrix: QueryValue[][], headers?: string[]): QueryTable {
  if (matrix.length > MAX_ROWS) throw new Error('query_source_row_limit');
  let width = headers?.length ?? 0;
  if (width > MAX_COLS) throw new Error('query_source_column_limit');
  for (const row of matrix) {
    if (row.length > MAX_COLS) throw new Error('query_source_column_limit');
    width = Math.max(width, row.length);
  }
  assertQueryMatrixBounds(matrix.length, width);
  const names=(headers??Array.from({length:width},(_,i)=>`Column${i+1}`)).slice(0,width).map((name,i)=>String(name||`Column${i+1}`).slice(0,256));
  let totalTextChars = 0;
  const rows=matrix.slice(0,MAX_ROWS).map((row)=>Array.from({length:width},(_,i)=>{
    const value=row[i]??null;
    if (typeof value === 'string') {
      if (value.length > MAX_CELL_CHARS) throw new Error('query_source_cell_limit');
      totalTextChars += value.length;
      if (totalTextChars > MAX_SOURCE_BYTES) throw new Error('query_source_table_text_limit');
    }
    return value;
  }));
  const columns:QueryColumn[]=names.map((name,index)=>({name,type:inferType(rows.map((row)=>row[index]??null))}));
  const table = {columns,rows};
  assertQueryTableLimits(table.columns, table.rows);
  return table;
}

function parseDelimited(text:string,delimiter:string):QueryTable {
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
  let maxWidth = 0;
  const commitField = (): void => {
    row.push(field);
    field = '';
    if (row.length > MAX_COLS) throw new Error('query_source_column_limit');
  };
  const commitRow = (): void => {
    commitField();
    if (row.some((value)=>value!=='')) {
      maxWidth = Math.max(maxWidth, row.length);
      assertQueryMatrixBounds(rows.length + 1, maxWidth);
      rows.push(row);
      if (rows.length > MAX_ROWS) throw new Error('query_source_row_limit');
    }
    row = [];
  };
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;if(field.length>MAX_CELL_CHARS)throw new Error('query_source_cell_limit');continue;}
    if(ch==='"'&&field.length===0){quoted=true;continue;}
    if(ch===delimiter){commitField();continue;}
    if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;commitRow();continue;}
    field+=ch;if(field.length>MAX_CELL_CHARS)throw new Error('query_source_cell_limit');
  }
  if (quoted) throw new Error('query_source_unclosed_quote');
  if (field.length || row.length) commitRow();
  const header=rows.shift()??[];return normalizeMatrix(rows,header);
}

function parseJson(text:string):QueryTable {
  const value=JSON.parse(text) as unknown;
  if(!Array.isArray(value))throw new Error('query_json_requires_array');
  if(!value.length)return {columns:[],rows:[]};
  if (value.length > MAX_ROWS) throw new Error('query_source_row_limit');
  if(value.every(Array.isArray)) {
    let width = 0;
    for (const rawRow of value as unknown[][]) {
      if (rawRow.length > MAX_COLS) throw new Error('query_source_column_limit');
      width = Math.max(width, rawRow.length);
    }
    assertQueryMatrixBounds(value.length, width);
    return normalizeMatrix((value as unknown[][]).map((row)=>row.map(toQueryValue)));
  }
  if(value.every((item)=>item&&typeof item==='object'&&!Array.isArray(item))){
    const records=value as Record<string,unknown>[];
    const keySet = new Set<string>();
    for (const record of records) {
      let recordKeys = 0;
      for (const key in record) if (Object.prototype.hasOwnProperty.call(record, key)) {
        recordKeys++;
        keySet.add(key);
        if (recordKeys > MAX_COLS || keySet.size > MAX_COLS) throw new Error('query_source_column_limit');
      }
      assertQueryMatrixBounds(records.length, keySet.size);
    }
    const keys=Array.from(keySet);
    return normalizeMatrix(records.map((record)=>keys.map((key)=>toQueryValue(record[key]))),keys);
  }
  throw new Error('query_json_shape_unsupported');
}

function decodeXmlEntities(value:string):string{return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
function parseXml(text:string):QueryTable {
  inspectBoundedForeignXml(text, { maxBytes: MAX_SOURCE_BYTES });
  const records:Record<string,string>[]=[];
  const keySet = new Set<string>();
  const recordPattern=/<(row|record|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let recordMatch:RegExpExecArray|null;
  while ((recordMatch = recordPattern.exec(text)) !== null) {
    if (records.length >= MAX_ROWS) throw new Error('query_source_row_limit');
    const record:Record<string,string>={};
    const fieldPattern=/<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
    let fieldCount=0;
    let fieldMatch:RegExpExecArray|null;
    while ((fieldMatch = fieldPattern.exec(recordMatch[2])) !== null) {
      if (++fieldCount > MAX_COLS) throw new Error('query_source_column_limit');
      const value=decodeXmlEntities(fieldMatch[2].replace(/<[^>]*>/g,'').trim());
      if (value.length > MAX_CELL_CHARS) throw new Error('query_source_cell_limit');
      record[fieldMatch[1]]=value;
      keySet.add(fieldMatch[1]);
      if (keySet.size > MAX_COLS) throw new Error('query_source_column_limit');
    }
    assertQueryMatrixBounds(records.length + 1, keySet.size);
    records.push(record);
  }
  if(!records.length)throw new Error('query_xml_records_missing');
  const keys=Array.from(keySet);
  return normalizeMatrix(records.map((record)=>keys.map((key)=>record[key]??'')),keys);
}

function toQueryValue(value:unknown):QueryValue {
  if (typeof value === 'string') { if (value.length > MAX_CELL_CHARS) throw new Error('query_source_cell_limit'); return value; }
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('query_source_number_invalid'); return value; }
  if (typeof value === 'boolean' || value === null || value === undefined) return value ?? null;
  const serialized=JSON.stringify(value);
  if (typeof serialized !== 'string' || serialized.length > MAX_CELL_CHARS) throw new Error('query_source_cell_limit');
  return serialized;
}
function cellMatrix(cells:Record<string,GridCell>):QueryTable {
  const entries:Array<{row:number;col:number;value:QueryValue}>=[];
  let totalTextChars = 0;
  for (const coord in cells) if (Object.prototype.hasOwnProperty.call(cells, coord)) {
    const cell = cells[coord];
    const match=coord.toUpperCase().match(/^([A-Z]{1,3})([1-9]\d{0,5})$/);
    if(!match)continue;
    let col=0;for(const ch of match[1])col=col*26+ch.charCodeAt(0)-64;
    const row=Number(match[2])-1;
    if(row>=MAX_ROWS||col>MAX_COLS)throw new Error('query_source_coordinate_limit');
    if(entries.length>=MAX_CELLS)throw new Error('query_source_cell_limit');
    const value = toQueryValue(cell.value);
    if (typeof value === 'string') {
      totalTextChars += value.length;
      if (totalTextChars > MAX_SOURCE_BYTES) throw new Error('query_source_table_text_limit');
    }
    entries.push({row,col:col-1,value});
  }
  if(!entries.length)return {columns:[],rows:[]};
  let maxRow=0,maxCol=0;for(const entry of entries){maxRow=Math.max(maxRow,entry.row);maxCol=Math.max(maxCol,entry.col);}
  assertQueryMatrixBounds(maxRow + 1, maxCol + 1);
  const matrix=Array.from({length:maxRow+1},()=>Array<QueryValue>(maxCol+1).fill(null));for(const entry of entries)if(entry.row<=maxRow&&entry.col<=maxCol)matrix[entry.row][entry.col]=entry.value;
  const header=matrix.shift()?.map((value,i)=>String(value??`Column${i+1}`))??[];return normalizeMatrix(matrix,header);
}

function tableFromGridDocument(document:WorkspaceDocument):QueryTable {
  const sheet=document.gridData?.sheets.find((item)=>item.id===document.gridData?.activeSheetId)??document.gridData?.sheets[0];
  const object=sheet?document.objects[sheet.tableObjectId]:undefined;if(!object||object.type!=='Table')throw new Error('query_grid_source_table_missing');
  return cellMatrix(object.data.cells);
}


export async function queryTableFromFile(file:File):Promise<{table:QueryTable;source:GridQuerySourceDefinition}>{
  if(file.size>MAX_SOURCE_BYTES)throw new Error('query_source_size_limit');const lower=file.name.toLowerCase();
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.byteLength>MAX_SOURCE_BYTES)throw new Error('query_source_size_limit');
  if(lower.endsWith('.xlsx')||lower.endsWith('.ods')){const sandbox=await inspectForeignFile(file,bytes);const expected=lower.endsWith('.xlsx')?'xlsx':'ods';if(sandbox.report.format!==expected)throw new Error('query_source_format_mismatch');const doc=expected==='xlsx'?await importXlsx(bytes,file.name):await importOds(bytes,file.name);return {table:tableFromGridDocument(doc),source:{kind:expected,label:file.name}};}
  if(lower.endsWith('.json')||lower.endsWith('.csv')||lower.endsWith('.tsv')){const sandbox=await inspectForeignFile(file,bytes);if(lower.endsWith('.json')&&sandbox.report.format!=='json')throw new Error('query_source_format_mismatch');if(!lower.endsWith('.json')&&sandbox.report.format!=='csv')throw new Error('query_source_format_mismatch');}
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return queryTableFromText(text,file.name);
}

export function queryTableFromText(text:string,label='data.csv'): {table:QueryTable;source:GridQuerySourceDefinition} {
  assertQueryTextBytes(text);const lower=label.toLowerCase();
  if(lower.endsWith('.json'))return {table:parseJson(text),source:{kind:'json',label}};
  if(lower.endsWith('.xml'))return {table:parseXml(text),source:{kind:'xml',label}};
  if(lower.endsWith('.tsv'))return {table:parseDelimited(text,'\t'),source:{kind:'tsv',label}};
  const first=text.split(/\r?\n/,1)[0]??'';const delimiter=first.includes('\t')?'\t':first.includes(';')&&!first.includes(',')?';':',';
  return {table:parseDelimited(text,delimiter),source:{kind:'csv',label}};
}
