// STATUS: DIAMANT VGT SUPREME
// Astraea Grid structural edit engine: sparse cells + metadata move as one transaction.

import type {
  GridCell, GridSheetModel, GridStableRangeIdentity, TableObject, WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseCoord } from '../compat/gridUtils';
import { parseGridRange } from '../compat/gridProfessional';
import { validateWorkbookStructureMutation } from '../collaboration/gridReviewCollaboration';

const MAX_EDIT_COUNT=10_000;
const MAX_ROWS=1_048_576;
const MAX_COLS=16_384;
export type GridStructureEdit =
  | {kind:'insert-row'|'delete-row';index:number;count?:number}
  | {kind:'insert-col'|'delete-col';index:number;count?:number}
  | {kind:'move-row';from:number;to:number;count?:number}
  | {kind:'move-col';from:number;to:number;count?:number};

function normalizeCount(count=1){if(!Number.isInteger(count)||count<1||count>MAX_EDIT_COUNT)throw new Error('Structure edit count exceeds bounded limit.');return count;}
function axisKind(edit:GridStructureEdit):'row'|'col'{return edit.kind.includes('row')?'row':'col'}

function mapIndex(index:number,edit:GridStructureEdit):number|null{
  const count=normalizeCount(edit.count);
  switch(edit.kind){
    case 'insert-row': case 'insert-col': return index>=edit.index?index+count:index;
    case 'delete-row': case 'delete-col':
      if(index>=edit.index&&index<edit.index+count)return null;
      return index>=edit.index+count?index-count:index;
    case 'move-row': case 'move-col': {
      const from=edit.from,to=edit.to;
      if(index>=from&&index<from+count)return to+(index-from);
      if(to<from&&index>=to&&index<from)return index+count;
      if(to>from&&index>=from+count&&index<to+count)return index-count;
      return index;
    }
  }
}

function mapCoord(coord:string,edit:GridStructureEdit):string|null{
  const p=parseCoord(coord); if(p.colIdx<0||p.rowIdx<0)return coord;
  if(axisKind(edit)==='row'){const r=mapIndex(p.rowIdx,edit);return r===null?null:toA1(p.colIdx,r);}
  const c=mapIndex(p.colIdx,edit);return c===null?null:toA1(c,p.rowIdx);
}

function mapRange(range:string,edit:GridStructureEdit):string|null{
  const b=parseGridRange(range);if(!b)return range;
  const a=mapCoord(toA1(b.startCol,b.startRow),edit),z=mapCoord(toA1(b.endCol,b.endRow),edit);
  if(!a&&!z)return null;
  // If an endpoint was deleted, clamp to the surviving edge after deletion.
  const start=a??mapCoord(toA1(axisKind(edit)==='col'?b.startCol:b.endCol,axisKind(edit)==='row'?b.startRow:b.endRow),edit);
  const end=z??start; if(!start||!end)return null; return start===end?start:`${start}:${end}`;
}

function rewriteFormula(formula:string,edit:GridStructureEdit,targetSheetName:string,currentSheetName:string):string{
  let inString=false,out='',i=0;
  while(i<formula.length){const ch=formula[i];if(ch==='"'){if(inString&&formula[i+1]==='"'){out+='""';i+=2;continue;}inString=!inString;out+=ch;i++;continue;}
    if(!inString){const rest=formula.slice(i);const m=rest.match(/^(?:(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_ .-]*))!)?(\$?[A-Z]{1,3}\$?[1-9]\d*)/);if(m){const sheet=(m[1]??m[2])?.trim();const applies=sheet?sheet.toLocaleLowerCase()===targetSheetName.toLocaleLowerCase():currentSheetName.toLocaleLowerCase()===targetSheetName.toLocaleLowerCase();if(applies){const raw=m[3];const stripped=raw.replace(/\$/g,'');const mapped=mapCoord(stripped,edit);const prefix=m[0].slice(0,m[0].length-raw.length);if(!mapped)out+=`${prefix}#REF!`;else{const mm=mapped.match(/^([A-Z]+)(\d+)$/)!;const absCol=raw.startsWith('$')?'$':'';const rowDollar=/\$\d+$/.test(raw)?'$':'';out+=`${prefix}${absCol}${mm[1]}${rowDollar}${mm[2]}`;}i+=m[0].length;continue;}}}
    out+=ch;i++;}
  return out;
}

function remapRecord<T>(record:Record<number,T>|undefined,edit:GridStructureEdit,axis:'row'|'col'):Record<number,T>|undefined{
  if(!record||axisKind(edit)!==axis)return record;const out:Record<number,T>={};for(const [k,v] of Object.entries(record)){const n=mapIndex(Number(k),edit);if(n!==null)out[n]=v;}return out;
}
function remapIndexList(list:number[]|undefined,edit:GridStructureEdit,axis:'row'|'col'):number[]|undefined{if(!list||axisKind(edit)!==axis)return list;return [...new Set(list.map(i=>mapIndex(i,edit)).filter((v):v is number=>v!==null))].sort((a,b)=>a-b)}
function remapGroups(groups:GridSheetModel['rowGroups'],edit:GridStructureEdit,axis:'row'|'col'){if(!groups||axisKind(edit)!==axis)return groups;return groups.map(g=>{const a=mapIndex(g.start,edit),b=mapIndex(g.end,edit);if(a===null&&b===null)return null;return {...g,start:a??b!,end:b??a!};}).filter(Boolean) as NonNullable<typeof groups>}

function remapSheetMetadata(sheet:GridSheetModel,edit:GridStructureEdit):GridSheetModel{
  const ranges=(items:string[]|undefined)=>items?.map(r=>mapRange(r,edit)).filter((v):v is string=>!!v);
  return {...sheet,
    mergedCells:ranges(sheet.mergedCells),
    validations:sheet.validations?.map(v=>({...v,range:mapRange(v.range,edit)??'#REF!'})).filter(v=>v.range!=='#REF!'),
    conditionalFormatting:sheet.conditionalFormatting?.map(v=>({...v,range:mapRange(v.range,edit)??'#REF!'})).filter(v=>v.range!=='#REF!'),
    comments:sheet.comments?.map(c=>{const coord=mapCoord(c.coord,edit);return coord?{...c,coord}:null}).filter((v):v is NonNullable<typeof v>=>!!v),
    history:sheet.history?.map(h=>{const coord=mapCoord(h.coord,edit);return coord?{...h,coord}:null}).filter((v):v is NonNullable<typeof v>=>!!v),
    printSettings:sheet.printSettings?{...sheet.printSettings,printArea:sheet.printSettings.printArea?(mapRange(sheet.printSettings.printArea,edit)??undefined):undefined}:undefined,
    rowHeights:remapRecord(sheet.rowHeights,edit,'row'),colWidths:remapRecord(sheet.colWidths,edit,'col'),
    hiddenRows:remapIndexList(sheet.hiddenRows,edit,'row'),hiddenCols:remapIndexList(sheet.hiddenCols,edit,'col'),
    rowGroups:remapGroups(sheet.rowGroups,edit,'row'),colGroups:remapGroups(sheet.colGroups,edit,'col'),
    tables:sheet.tables?.map(t=>({...t,range:mapRange(t.range,edit)??'#REF!'})).filter(t=>t.range!=='#REF!'),
    stableRanges:sheet.stableRanges?.map(r=>({...r,fallbackRange:mapRange(r.fallbackRange,edit)??r.fallbackRange})),
  };
}

function remapCells(cells:Record<string,GridCell>,edit:GridStructureEdit):Record<string,GridCell>{const out:Record<string,GridCell>={};for(const [coord,cell]of Object.entries(cells)){const next=mapCoord(coord,edit);if(next)out[next]={...cell};}return out;}

export function applyGridStructureEdit(document:WorkspaceDocument,sheetId:string,edit:GridStructureEdit):WorkspaceDocument{
  if(!document.gridData)return document;const sheet=document.gridData.sheets.find(s=>s.id===sheetId);if(!sheet)return document;const targetObject=document.objects[sheet.tableObjectId];if(!targetObject||targetObject.type!=='Table')return document;
  validateWorkbookStructureMutation(document.gridData.workbookProtection);
  const table=targetObject.data as TableObject;const count=normalizeCount(edit.count);
  const nextRows=Math.max(1,Math.min(MAX_ROWS,table.rows+(edit.kind==='insert-row'?count:edit.kind==='delete-row'?-count:0)));
  const nextCols=Math.max(1,Math.min(MAX_COLS,table.cols+(edit.kind==='insert-col'?count:edit.kind==='delete-col'?-count:0)));
  const objects={...document.objects};
  // First move target cells, then rewrite formulas in every Grid table against the changed sheet.
  const moved=remapCells(table.cells,edit);objects[sheet.tableObjectId]={type:'Table',data:{...table,rows:nextRows,cols:nextCols,cells:moved}};
  for(const candidate of document.gridData.sheets){const obj=objects[candidate.tableObjectId];if(!obj||obj.type!=='Table')continue;const data=obj.data as TableObject;const cells:Record<string,GridCell>={};for(const [coord,cell]of Object.entries(data.cells)){cells[coord]=cell.formula?{...cell,formula:rewriteFormula(cell.formula,edit,sheet.name,candidate.name)}:cell;}objects[candidate.tableObjectId]={type:'Table',data:{...data,cells}};}
  const sheets=document.gridData.sheets.map(s=>s.id===sheetId?remapSheetMetadata(s,edit):s);
  const namedRanges=(document.gridData.namedRanges??[]).map(n=>n.sheetId===sheetId?{...n,range:mapRange(n.range,edit)??'#REF!'}:n).filter(n=>n.range!=='#REF!');
  return {...document,version:document.version+1,modified_at:Date.now(),objects,gridData:{...document.gridData,sheets,namedRanges}};
}

export interface GridStructureEditRisk {
  readonly affectedCells: number;
  readonly dangerous: boolean;
  readonly message: string | null;
}

/**
 * Pre-flight for a structural edit. Row/column deletion silently removes the
 * cells that live inside the deleted band, so the caller can warn before the
 * data is gone instead of reporting success.
 */
export function describeGridStructureEditRisk(document:WorkspaceDocument,sheetId:string,edit:GridStructureEdit):GridStructureEditRisk{
  const sheet=document.gridData?.sheets.find(s=>s.id===sheetId);
  if(!sheet)return {affectedCells:0,dangerous:false,message:null};
  const target=document.objects[sheet.tableObjectId];
  if(!target||target.type!=='Table')return {affectedCells:0,dangerous:false,message:null};
  const cells=(target.data as TableObject).cells??{};
  let affected=0;
  for(const [coord,cell] of Object.entries(cells)){
    if(mapCoord(coord,edit)!==null)continue;
    const hasContent=!!cell.formula||(cell.value!==''&&cell.value!==null&&cell.value!==undefined);
    if(hasContent)affected+=1;
  }
  if(affected===0)return {affectedCells:0,dangerous:false,message:null};
  return {
    affectedCells:affected,
    dangerous:true,
    message:`Achtung: ${affected} belegte Zelle(n) liegen in dem zu löschenden Bereich. Erneut ausführen bestätigt das Löschen; danach stellt „Rückgängig“ die Daten wieder her.`,
  };
}

function ensureCellId(cell:GridCell):GridCell{return cell.stableId?cell:{...cell,stableId:crypto.randomUUID()}}export function ensureGridCellIdentity(cells:Record<string,GridCell>,coord:string):{cells:Record<string,GridCell>;id:string}{const existing=ensureCellId(cells[coord]??{value:''});return {cells:{...cells,[coord]:existing},id:existing.stableId!};}
export function createStableGridRangeIdentity(cells:Record<string,GridCell>,range:string,name?:string):{cells:Record<string,GridCell>;identity:GridStableRangeIdentity}{const b=parseGridRange(range);if(!b)throw new Error('Invalid stable range.');const start=toA1(b.startCol,b.startRow),end=toA1(b.endCol,b.endRow);const a=ensureGridCellIdentity(cells,start);const z=ensureGridCellIdentity(a.cells,end);return {cells:z.cells,identity:{id:crypto.randomUUID(),name,startCellId:a.id,endCellId:z.id,fallbackRange:range.toUpperCase()}};}
export function resolveStableGridRange(cells:Record<string,GridCell>,identity:GridStableRangeIdentity):string|null{let a:string|undefined,z:string|undefined;for(const [coord,cell]of Object.entries(cells)){if(cell.stableId===identity.startCellId)a=coord;if(cell.stableId===identity.endCellId)z=coord;}return a&&z?(a===z?a:`${a}:${z}`):null;}
export function ensureStableGridRangeForObject(document:WorkspaceDocument,objectId:string,range:string,name?:string):{document:WorkspaceDocument;stableRangeId:string}{const obj=document.objects[objectId];if(!obj||obj.type!=='Table')throw new Error('Grid source object unavailable.');const sheet=document.gridData?.sheets.find(s=>s.tableObjectId===objectId);if(!sheet)throw new Error('Grid source sheet unavailable.');const created=createStableGridRangeIdentity((obj.data as TableObject).cells,range,name);const objects={...document.objects,[objectId]:{type:'Table' as const,data:{...(obj.data as TableObject),cells:created.cells}}};const sheets=document.gridData!.sheets.map(s=>s.id===sheet.id?{...s,stableRanges:[...(s.stableRanges??[]),created.identity]}:s);return {document:{...document,objects,gridData:{...document.gridData!,sheets}},stableRangeId:created.identity.id};}
export function resolveStableGridRangeForObject(document:WorkspaceDocument,objectId:string,stableRangeId:string):string|null{const obj=document.objects[objectId];if(!obj||obj.type!=='Table')return null;const sheet=document.gridData?.sheets.find(s=>s.tableObjectId===objectId);const identity=sheet?.stableRanges?.find(r=>r.id===stableRangeId);return identity?resolveStableGridRange((obj.data as TableObject).cells,identity):null;}
