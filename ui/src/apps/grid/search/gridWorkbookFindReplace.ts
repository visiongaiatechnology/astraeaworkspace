// STATUS: DIAMANT VGT SUPREME
// Bounded, literal-only workbook search/replace across values, formulas and comments.
//
// Two defects are fixed here and each has a counter-check test:
//   1. The scan had no *cell* budget, only a match budget. A workbook with millions of cells made
//      every keystroke walk every cell. Scanning is now bounded by an explicit budget and reports
//      the truncation.
//   2. Replace coerced any result that happened to parse as a number back into a number, which
//      destroyed leading zeros and text formatting ("00123" -> 123). A value that was stored as
//      text stays text.
import type { GridCell, GridSheetModel } from '../../../shared/contracts/workspace';

export type GridFindField = 'value'|'formula'|'comment';
export interface GridWorkbookMatch { sheetId:string; coord:string; field:GridFindField; commentId?:string; preview:string }
export interface GridFindOptions {
  scope:'sheet'|'workbook';
  activeSheetId:string;
  fields:GridFindField[];
  matchCase?:boolean;
  entireCell?:boolean;
  maxMatches?:number;
  /** Maximum number of cells inspected before the scan stops and reports truncation. */
  maxScannedCells?:number;
}
const HARD_MAX_MATCHES=10_000;
const HARD_MAX_SCANNED_CELLS=250_000;
export const GRID_FIND_MAX_QUERY_CHARS=4_096;

export interface GridWorkbookFindResult {
  matches: GridWorkbookMatch[];
  /** Cells actually inspected. */
  scannedCells: number;
  /** The scan stopped at the cell budget: more matches may exist. */
  truncated: boolean;
}

/**
 * Locale-independent, deterministic case folding. `toLocaleLowerCase()` produced different results
 * for the same workbook depending on the host locale (e.g. Turkish dotted/dotless I).
 */
function fold(value:string):string{return value.toLowerCase()}

function matchesLiteral(target:string,query:string,matchCase:boolean,entire:boolean):boolean {
  const hay=matchCase?target:fold(target); const needle=matchCase?query:fold(query);
  return entire?hay===needle:hay.includes(needle);
}
function replaceLiteral(target:string,query:string,replacement:string,matchCase:boolean,entire:boolean):string {
  if(entire)return matchesLiteral(target,query,matchCase,true)?replacement:target;
  if(!query)return target;
  const hay=matchCase?target:fold(target); const needle=matchCase?query:fold(query);
  let cursor=0,out='';
  while(cursor<target.length){const at=hay.indexOf(needle,cursor);if(at<0){out+=target.slice(cursor);break;}out+=target.slice(cursor,at)+replacement;cursor=at+query.length;}
  return out;
}

export function findGridWorkbookMatchesDetailed(
  sheets:readonly GridSheetModel[], cellsBySheet:Readonly<Record<string,Record<string,GridCell>>>, query:string, options:GridFindOptions,
):GridWorkbookFindResult{
  const trimmed=query.slice(0,GRID_FIND_MAX_QUERY_CHARS);
  if(!trimmed)return { matches:[], scannedCells:0, truncated:false };
  const fields=new Set(options.fields);
  const max=Math.max(1,Math.min(HARD_MAX_MATCHES,options.maxMatches??HARD_MAX_MATCHES));
  const scanBudget=Math.max(1,Math.min(HARD_MAX_SCANNED_CELLS,options.maxScannedCells??HARD_MAX_SCANNED_CELLS));
  const result:GridWorkbookMatch[]=[];
  const targetSheets=options.scope==='sheet'?sheets.filter(sheet=>sheet.id===options.activeSheetId):sheets;
  let scannedCells=0;
  let truncated=false;

  for(const sheet of targetSheets){
    const cells=cellsBySheet[sheet.id]??{};
    for(const [coord,cell] of Object.entries(cells)){
      if(scannedCells>=scanBudget){truncated=true;break;}
      scannedCells+=1;
      if(fields.has('value')&&matchesLiteral(String(cell.value??''),trimmed,!!options.matchCase,!!options.entireCell)){
        result.push({sheetId:sheet.id,coord,field:'value',preview:String(cell.value??'').slice(0,160)});
        if(result.length>=max)return { matches:result, scannedCells, truncated };
      }
      if(fields.has('formula')&&cell.formula&&matchesLiteral(cell.formula,trimmed,!!options.matchCase,!!options.entireCell)){
        result.push({sheetId:sheet.id,coord,field:'formula',preview:cell.formula.slice(0,160)});
        if(result.length>=max)return { matches:result, scannedCells, truncated };
      }
    }
    if(truncated)break;
    if(fields.has('comment'))for(const comment of sheet.comments??[]){
      if(matchesLiteral(comment.text,trimmed,!!options.matchCase,!!options.entireCell)){
        result.push({sheetId:sheet.id,coord:comment.coord,field:'comment',commentId:comment.id,preview:comment.text.slice(0,160)});
        if(result.length>=max)return { matches:result, scannedCells, truncated };
      }
    }
  }
  return { matches:result, scannedCells, truncated };
}

export function findGridWorkbookMatches(
  sheets:readonly GridSheetModel[], cellsBySheet:Readonly<Record<string,Record<string,GridCell>>>, query:string, options:GridFindOptions,
):GridWorkbookMatch[]{
  return findGridWorkbookMatchesDetailed(sheets,cellsBySheet,query,options).matches;
}

/** Builds an accessible summary for a bounded hit list without exposing workbook contents twice. */
export function describeGridWorkbookFindResult(result:GridWorkbookFindResult, query:string):string{
  if(!query)return 'Suchbegriff eingeben.';
  if(!result.matches.length&&!result.truncated)return `Keine Treffer für "${query}".`;
  const shown=result.matches.length;
  const suffix=result.truncated?` (Suche nach ${result.scannedCells.toLocaleString('de-DE')} Zellen abgebrochen – weitere Treffer möglich)`:'';
  return `${shown} Treffer${suffix}.`;
}

export function replaceGridWorkbookMatches(
  sheets:readonly GridSheetModel[], cellsBySheet:Readonly<Record<string,Record<string,GridCell>>>, matches:readonly GridWorkbookMatch[], query:string, replacement:string, options:Pick<GridFindOptions,'matchCase'|'entireCell'>,
):{sheets:GridSheetModel[];cellsBySheet:Record<string,Record<string,GridCell>>;replaced:number}{
  if(matches.length>HARD_MAX_MATCHES)throw new Error('Workbook replacement exceeds bounded match limit.');
  const nextCells:Record<string,Record<string,GridCell>>=Object.fromEntries(Object.entries(cellsBySheet).map(([id,cells])=>[id,{...cells}]));
  const nextSheets=sheets.map(sheet=>({...sheet,comments:sheet.comments?.map(comment=>({...comment}))})); let replaced=0;
  for(const match of matches){
    if(match.field==='comment'){
      const sheet=nextSheets.find(item=>item.id===match.sheetId),comment=sheet?.comments?.find(item=>item.id===match.commentId); if(!comment)continue;
      const next=replaceLiteral(comment.text,query,replacement,!!options.matchCase,!!options.entireCell); if(next!==comment.text){comment.text=next;replaced++;} continue;
    }
    const cell=nextCells[match.sheetId]?.[match.coord]; if(!cell)continue;
    if(match.field==='formula'&&cell.formula){const next=replaceLiteral(cell.formula,query,replacement,!!options.matchCase,!!options.entireCell);if(next!==cell.formula){nextCells[match.sheetId][match.coord]={...cell,formula:next};replaced++;}}
    else if(match.field==='value'){
      const original=String(cell.value??'');
      const next=replaceLiteral(original,query,replacement,!!options.matchCase,!!options.entireCell);
      if(next===original)continue;
      // Type preservation: a text cell stays text. Only a cell that already held a finite *number*
      // may stay numeric, so "00123" is never silently turned into 123.
      const keepNumeric=typeof cell.value==='number'&&next.trim()!==''&&Number.isFinite(Number(next));
      nextCells[match.sheetId][match.coord]={...cell,value:keepNumeric?Number(next):next};
      replaced++;
    }
  }
  return {sheets:nextSheets,cellsBySheet:nextCells,replaced};
}
