// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded advanced editing primitives.

import type { GridCell, GridNamedRange, GridSheetModel } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseCoord } from '../compat/gridUtils';
import { parseGridRange } from '../compat/gridProfessional';
import { gridRangeCoordinates, shiftFormulaReferences } from './gridSelection';

const MAX_SELECTION_RANGES=256;
const MAX_EDIT_CELLS=100_000;
const MAX_GO_TO_RESULTS=10_000;

export type GridGoToSpecialKind='blanks'|'constants'|'formulas'|'errors'|'comments'|'validation'|'visible';
export type GridTransferMode='move'|'copy'|'insert-down'|'insert-right';

export function addDisjointGridRange(ranges:readonly string[],range:string):string[]{
  const normalized=range.toUpperCase().trim(); if(!parseGridRange(normalized)) return [...ranges];
  const dedup=[...ranges.filter(r=>r.toUpperCase()!==normalized),normalized];
  return dedup.slice(-MAX_SELECTION_RANGES);
}

export function uniqueGridRangeCoordinates(ranges:readonly string[]):string[]{
  const result=new Set<string>();
  for(const range of ranges){for(const coord of gridRangeCoordinates(range)){result.add(coord); if(result.size>MAX_EDIT_CELLS) throw new Error('Multi-range selection exceeds bounded edit limit.');}}
  return [...result];
}

export function resolveGridGoToTarget(input:string,namedRanges:readonly GridNamedRange[],sheetId:string):string|null{
  const target=input.trim(); if(!target)return null;
  const named=namedRanges.find(n=>n.sheetId===sheetId&&n.name.toLocaleLowerCase()===target.toLocaleLowerCase());
  if(named)return named.range;
  return parseGridRange(target.toUpperCase())?target.toUpperCase():null;
}

function isErrorValue(value:unknown):boolean{return typeof value==='string'&&/^#(?:DIV\/0!|N\/A!?|NAME\?|NULL!|NUM!|REF!|VALUE!|CIRCULAR!)$/i.test(value);}

export function goToSpecialCoordinates(kind:GridGoToSpecialKind,cells:Record<string,GridCell>,sheet:GridSheetModel,rowCount:number,colCount:number):string[]{
  const result:string[]=[]; const push=(coord:string)=>{if(result.length<MAX_GO_TO_RESULTS)result.push(coord)};
  if(kind==='blanks'||kind==='visible'){
    let maxRow=0,maxCol=0; for(const coord of Object.keys(cells)){const p=parseCoord(coord);maxRow=Math.max(maxRow,p.rowIdx);maxCol=Math.max(maxCol,p.colIdx);}
    maxRow=Math.min(rowCount-1,Math.max(maxRow,Math.min(rowCount-1,200))); maxCol=Math.min(colCount-1,Math.max(maxCol,Math.min(colCount-1,50)));
    const hiddenRows=new Set(sheet.hiddenRows??[]),hiddenCols=new Set(sheet.hiddenCols??[]);
    for(let r=0;r<=maxRow&&result.length<MAX_GO_TO_RESULTS;r++) for(let c=0;c<=maxCol&&result.length<MAX_GO_TO_RESULTS;c++){
      const coord=toA1(c,r); if(kind==='visible'){if(!hiddenRows.has(r)&&!hiddenCols.has(c))push(coord);} else if(!cells[coord]||cells[coord].value==='')push(coord);
    }
    return result;
  }
  const comments=new Set((sheet.comments??[]).filter(c=>!c.resolved).map(c=>c.coord.toUpperCase()));
  for(const [coord,cell] of Object.entries(cells)){
    if(kind==='constants'&&!cell.formula&&cell.value!=='')push(coord);
    else if(kind==='formulas'&&!!cell.formula)push(coord);
    else if(kind==='errors'&&isErrorValue(cell.value))push(coord);
    else if(kind==='comments'&&comments.has(coord.toUpperCase()))push(coord);
    else if(kind==='validation'&&(sheet.validations??[]).some(v=>gridRangeCoordinates(v.range).includes(coord)))push(coord);
    if(result.length>=MAX_GO_TO_RESULTS)break;
  }
  return result;
}

function cloneForTransfer(cell:GridCell,copy:boolean,deltaCol:number,deltaRow:number):GridCell{
  return {...cell,stableId:copy?undefined:cell.stableId,formula:cell.formula?shiftFormulaReferences(cell.formula,deltaCol,deltaRow):undefined};
}

export function transferGridRange(cells:Record<string,GridCell>,sourceRange:string,targetAnchor:string,mode:GridTransferMode):Record<string,GridCell>{
  const sourceCoords=gridRangeCoordinates(sourceRange); if(!sourceCoords.length)return {...cells}; if(sourceCoords.length>MAX_EDIT_CELLS)throw new Error('Transfer exceeds bounded edit limit.');
  const sourceBounds=parseGridRange(sourceRange); if(!sourceBounds) return {...cells}; const target=parseCoord(targetAnchor);
  const out={...cells}; const copy=mode!=='move';
  if(mode==='insert-down'){
    const height=sourceBounds.endRow-sourceBounds.startRow+1; const width=sourceBounds.endCol-sourceBounds.startCol+1;
    const affected=Object.keys(out).map(k=>({k,p:parseCoord(k)})).filter(x=>x.p.colIdx>=target.colIdx&&x.p.colIdx<target.colIdx+width&&x.p.rowIdx>=target.rowIdx).sort((a,b)=>b.p.rowIdx-a.p.rowIdx);
    for(const x of affected){out[toA1(x.p.colIdx,x.p.rowIdx+height)]=out[x.k];delete out[x.k];}
  } else if(mode==='insert-right'){
    const width=sourceBounds.endCol-sourceBounds.startCol+1; const height=sourceBounds.endRow-sourceBounds.startRow+1;
    const affected=Object.keys(out).map(k=>({k,p:parseCoord(k)})).filter(x=>x.p.rowIdx>=target.rowIdx&&x.p.rowIdx<target.rowIdx+height&&x.p.colIdx>=target.colIdx).sort((a,b)=>b.p.colIdx-a.p.colIdx);
    for(const x of affected){out[toA1(x.p.colIdx+width,x.p.rowIdx)]=out[x.k];delete out[x.k];}
  }
  const staged=sourceCoords.map(coord=>({coord,cell:cells[coord],p:parseCoord(coord)})).filter(x=>!!x.cell);
  if(mode==='move') for(const item of staged) delete out[item.coord];
  for(const item of staged){const dc=item.p.colIdx-sourceBounds.startCol,dr=item.p.rowIdx-sourceBounds.startRow; const dest=toA1(target.colIdx+dc,target.rowIdx+dr); out[dest]=cloneForTransfer(item.cell,copy,target.colIdx+dc-item.p.colIdx,target.rowIdx+dr-item.p.rowIdx);}
  return out;
}

export function moveGridCellSet(cells:Record<string,GridCell>,sourceCoords:readonly string[],targetAnchor:string):Record<string,GridCell>{
  if(!sourceCoords.length||sourceCoords.length>MAX_EDIT_CELLS)return {...cells};
  const positions=sourceCoords.map(c=>parseCoord(c)); const minCol=Math.min(...positions.map(p=>p.colIdx)),minRow=Math.min(...positions.map(p=>p.rowIdx)); const target=parseCoord(targetAnchor);
  const staged=sourceCoords.map(coord=>({coord,cell:cells[coord],p:parseCoord(coord)})).filter(x=>!!x.cell); const out={...cells}; for(const item of staged)delete out[item.coord];
  for(const item of staged){const dc=target.colIdx+(item.p.colIdx-minCol),dr=target.rowIdx+(item.p.rowIdx-minRow);out[toA1(dc,dr)]=cloneForTransfer(item.cell,false,dc-item.p.colIdx,dr-item.p.rowIdx);} return out;
}

export type FlashFillTransform='trim'|'upper'|'lower'|'first-word'|'last-word'|'initials'|'before-at'|'after-at';
const transforms:Record<FlashFillTransform,(v:string)=>string>={
  trim:v=>v.trim().replace(/\s+/g,' '),upper:v=>v.toLocaleUpperCase(),lower:v=>v.toLocaleLowerCase(),
  'first-word':v=>v.trim().split(/\s+/)[0]??'','last-word':v=>v.trim().split(/\s+/).at(-1)??'',
  initials:v=>v.trim().split(/\s+/).filter(Boolean).map(x=>x[0]?.toLocaleUpperCase()??'').join(''),
  'before-at':v=>v.includes('@')?v.split('@')[0]:v,'after-at':v=>v.includes('@')?v.slice(v.indexOf('@')+1):'',
};
export function inferFlashFillTransform(source:string,expected:string):FlashFillTransform|null{for(const [name,fn] of Object.entries(transforms) as Array<[FlashFillTransform,(v:string)=>string]>)if(fn(source)===expected)return name;return null;}
export function applyFlashFill(values:readonly string[],transform:FlashFillTransform):string[]{if(values.length>MAX_EDIT_CELLS)throw new Error('Flash Fill exceeds bounded edit limit.');return values.map(v=>transforms[transform](v));}
