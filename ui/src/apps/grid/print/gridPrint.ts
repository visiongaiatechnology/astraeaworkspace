// STATUS: DIAMANT VGT SUPREME — bounded Grid print/page-layout model and browser print surface.
import type { GridCell, GridPrintSettings } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { formatGridLocaleValue } from '../locale/gridLocale';
import { parseGridRange } from '../compat/gridProfessional';

const MAX_PRINT_CELLS = 250_000;
const MAX_PAGE_BREAKS = 1024;
const PRINT_PAPER_SIZES = new Set<GridPrintSettings['paperSize']>(['A5', 'A4', 'A3', 'Letter', 'Legal']);
const PRINT_ORIENTATIONS = new Set<GridPrintSettings['orientation']>(['portrait', 'landscape']);
const PRINT_MARGINS = new Set<GridPrintSettings['margins']>(['normal', 'narrow', 'wide', 'custom']);
const SAFE_PRINT_COLOR_NAMES = new Set(['black', 'white', 'red', 'green', 'blue', 'gray', 'grey', 'yellow', 'orange', 'purple', 'transparent']);

const escapeHtml = (value: string): string => value
  .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#039;');

function safePrintColor(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 64) return undefined;
  const color = value.trim();
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu.test(color)) return color;
  if (SAFE_PRINT_COLOR_NAMES.has(color.toLowerCase())) return color;
  if (/^rgba?\(\s*(?:\d{1,3}%?\s*,\s*){2}\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d{1,3}))?\s*\)$/iu.test(color)) return color;
  return undefined;
}

const colLabel=(index:number)=>{let n=index+1,out='';while(n>0){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26);}return out;};

function parseTitleRows(value?:string):number[]{
  if(!value)return[]; const m=/^\$?(\d+):\$?(\d+)$/u.exec(value.trim()); if(!m)return[];
  const start=Number(m[1])-1,end=Number(m[2])-1;if(start<0||end<start||end-start>255)return[];
  return Array.from({length:end-start+1},(_,i)=>start+i);
}
function parseTitleColumns(value?:string):number[]{
  if(!value)return[]; const m=/^\$?([A-Z]{1,3}):\$?([A-Z]{1,3})$/u.exec(value.trim().toUpperCase());if(!m)return[];
  const toIndex=(text:string)=>{let n=0;for(const ch of text)n=n*26+ch.charCodeAt(0)-64;return n-1;}; const start=toIndex(m[1]),end=toIndex(m[2]);
  if(start<0||end<start||end-start>255)return[];return Array.from({length:end-start+1},(_,i)=>start+i);
}
function marginCss(settings:GridPrintSettings):string{
  if(settings.margins!=='custom')return settings.margins==='narrow'?'8mm':settings.margins==='wide'?'25mm':'15mm';
  const m=settings.customMarginsMm??{top:15,right:15,bottom:15,left:15};
  const clamp=(n:number)=>Math.max(0,Math.min(50,Number.isFinite(n)?n:15));
  return `${clamp(m.top)}mm ${clamp(m.right)}mm ${clamp(m.bottom)}mm ${clamp(m.left)}mm`;
}
function marginValuesMm(settings:GridPrintSettings):{top:number;right:number;bottom:number;left:number}{
  if(settings.margins==='custom'){const m=settings.customMarginsMm??{top:15,right:15,bottom:15,left:15};const c=(v:number)=>Math.max(0,Math.min(50,Number.isFinite(v)?v:15));return{top:c(m.top),right:c(m.right),bottom:c(m.bottom),left:c(m.left)};}
  const value=settings.margins==='narrow'?8:settings.margins==='wide'?25:15;return{top:value,right:value,bottom:value,left:value};
}
function printScale(settings:GridPrintSettings,rowCount:number,colCount:number):number{
  const paper:Record<GridPrintSettings['paperSize'],[number,number]>={A5:[148,210],A4:[210,297],A3:[297,420],Letter:[215.9,279.4],Legal:[215.9,355.6]};
  let [width,height]=paper[settings.paperSize];if(settings.orientation==='landscape')[width,height]=[height,width];const margins=marginValuesMm(settings);
  const usableWidth=Math.max(30,width-margins.left-margins.right),usableHeight=Math.max(30,height-margins.top-margins.bottom-14);
  const estimatedWidth=Math.max(1,colCount)*22,estimatedHeight=Math.max(1,rowCount)*7;const scales:number[]=[1];
  if(settings.fitToWidth||settings.fitToPagesWide)scales.push((usableWidth*Math.max(1,settings.fitToPagesWide??1))/estimatedWidth);
  if(settings.fitToPagesTall)scales.push((usableHeight*Math.max(1,settings.fitToPagesTall))/estimatedHeight);
  return Math.max(0.25,Math.min(1,...scales));
}
function segments<T extends number>(values:T[],breaks:number[]|undefined):T[][]{
  if(!values.length)return [[]];const markers=new Set(breaks??[]);const result:T[][]=[];let current:T[]=[];for(const value of values){if(current.length&&markers.has(value+1)){result.push(current);current=[];}current.push(value);}if(current.length)result.push(current);return result;
}

function pageCss(settings: GridPrintSettings): string {
  const size=settings.paperSize;
  return `@page { size: ${size} ${settings.orientation}; margin: ${marginCss(settings)}; counter-increment: page; }`;
}

export function normalizeGridPrintSettings(settings:GridPrintSettings):GridPrintSettings{
  if (!PRINT_PAPER_SIZES.has(settings.paperSize) || !PRINT_ORIENTATIONS.has(settings.orientation) || !PRINT_MARGINS.has(settings.margins)) {
    throw new Error('grid_print_settings_invalid');
  }
  const breaks=(values:number[]|undefined)=>[...new Set((values??[]).filter((v)=>Number.isInteger(v)&&v>0).slice(0,MAX_PAGE_BREAKS))].sort((a,b)=>a-b);
  const pages=(value:number|undefined)=>value===undefined?undefined:Math.max(1,Math.min(100,Math.trunc(value)));
  if(settings.printArea&&!parseGridRange(settings.printArea))throw new Error('grid_print_area_invalid');
  return {...settings,fitToPagesWide:pages(settings.fitToPagesWide),fitToPagesTall:pages(settings.fitToPagesTall),pageBreakRows:breaks(settings.pageBreakRows),pageBreakColumns:breaks(settings.pageBreakColumns),firstPageNumber:Math.max(1,Math.min(9999,Math.trunc(settings.firstPageNumber??1))),repeatRows:parseTitleRows(settings.repeatRows).length?settings.repeatRows:undefined,repeatColumns:parseTitleColumns(settings.repeatColumns).length?settings.repeatColumns:undefined};
}

function fieldHtml(template:string|undefined,title:string,sheetName:string):string{
  if(!template)return''; const now=new Date(); let output='';
  for(let i=0;i<template.length;i++){
    if(template[i]!=='&'||i+1>=template.length){output+=escapeHtml(template[i]);continue;}
    const code=template[++i].toUpperCase();
    if(code==='P')output+='<span class="vgt-page-number"></span>';
    else if(code==='N')output+='<span class="vgt-page-count"></span>';
    else if(code==='A')output+=escapeHtml(sheetName);
    else if(code==='F')output+=escapeHtml(title);
    else if(code==='D')output+=escapeHtml(now.toISOString().slice(0,10));
    else if(code==='T')output+=escapeHtml(now.toTimeString().slice(0,5));
    else if(code==='&')output+='&amp;';
    else output+=`&amp;${escapeHtml(code)}`;
  }
  return output;
}

export function buildGridPrintableHtml(
  title: string,
  sheetName: string,
  cells: Record<string, GridCell>,
  rowIndices: number[],
  colCount: number,
  rawSettings: GridPrintSettings,
  locale?: string,
): string {
  const settings=normalizeGridPrintSettings(rawSettings);
  const printBounds=settings.printArea?parseGridRange(settings.printArea):null;
  const baseRows=printBounds?rowIndices.filter((row)=>row>=printBounds.startRow&&row<=printBounds.endRow):rowIndices;
  const baseCols=printBounds?Array.from({length:printBounds.endCol-printBounds.startCol+1},(_,i)=>printBounds.startCol+i):Array.from({length:colCount},(_,i)=>i);
  const repeatRows=parseTitleRows(settings.repeatRows); if(settings.repeatHeaderRow&&!repeatRows.length&&baseRows.length)repeatRows.push(baseRows[0]);
  const repeatCols=parseTitleColumns(settings.repeatColumns);
  const columns=[...new Set([...repeatCols,...baseCols])].filter((col)=>col>=0&&col<colCount);
  const titleRows=[...new Set(repeatRows)].filter((row)=>rowIndices.includes(row));
  const bodyRows=baseRows.filter((row)=>!titleRows.includes(row));
  if((titleRows.length+bodyRows.length)*Math.max(1,columns.length)>MAX_PRINT_CELLS)throw new Error('grid_print_cell_limit');
  const header=`<div class="vgt-print-header"><span>${fieldHtml(settings.headerLeft,title,sheetName)}</span><span>${fieldHtml(settings.headerCenter,title,sheetName)}</span><span>${fieldHtml(settings.headerRight,title,sheetName)}</span></div>`;
  const footer=`<div class="vgt-print-footer"><span>${fieldHtml(settings.footerLeft,title,sheetName)}</span><span>${fieldHtml(settings.footerCenter,title,sheetName)}</span><span>${fieldHtml(settings.footerRight,title,sheetName)}</span></div>`;
  const rowSegments=segments(bodyRows,settings.pageBreakRows);
  const rawColSegments=segments(baseCols,settings.pageBreakColumns);
  const colSegments=rawColSegments.map((segment)=>[...new Set([...repeatCols,...segment])].filter((col)=>col>=0&&col<colCount));
  const pages:string[]=[];
  const allRowsForScale=titleRows.length+bodyRows.length;
  const scale=printScale(settings,allRowsForScale,Math.max(1,...colSegments.map((segment)=>segment.length)));
  for(const pageRows of rowSegments){for(const pageCols of colSegments){
    const pageColumnHeadings=settings.showHeadings?`<tr><th class="vgt-corner"></th>${pageCols.map((col)=>`<th class="vgt-column-heading">${colLabel(col)}</th>`).join('')}</tr>`:'';
    const localRowHtml=(row:number,isHeader:boolean)=>{
      const data=pageCols.map((col)=>{const cell=cells[toA1(col,row)];const background=safePrintColor(cell?.background);const textColor=safePrintColor(cell?.text_color);const style=[cell?.bold?'font-weight:700':'',background?`background:${background}`:'',textColor?`color:${textColor}`:'',typeof cell?.value==='number'?'text-align:right':''].filter(Boolean).join(';');const tag=isHeader?'th':'td';return `<${tag}${style?` style="${style}"`:''}>${escapeHtml(formatGridLocaleValue(cell,locale))}</${tag}>`;}).join('');
      return `<tr>${settings.showHeadings?`<th class="vgt-row-heading">${row+1}</th>`:''}${data}</tr>`;
    };
    const pageHeaderRows=`${pageColumnHeadings}${titleRows.map((row)=>localRowHtml(row,true)).join('')}`;
    pages.push(`<section class="vgt-print-page">${header}<div class="vgt-print-sheet"><table><thead>${pageHeaderRows}</thead><tbody>${pageRows.map((row)=>localRowHtml(row,false)).join('\n')}</tbody></table></div>${footer}</section>`);
  }}
  const fitWidth=settings.fitToWidth||settings.fitToPagesWide===1;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} — ${escapeHtml(sheetName)}</title><style>
${pageCss(settings)}
*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;background:#fff;margin:0;counter-reset:page ${Math.max(0,(settings.firstPageNumber??1)-1)}}
.vgt-print-page{break-after:page}.vgt-print-page:last-child{break-after:auto}.vgt-print-sheet{zoom:${scale.toFixed(4)}}
.vgt-print-header,.vgt-print-footer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:8pt;margin:0 0 4mm}.vgt-print-footer{margin:4mm 0 0}.vgt-print-header span:nth-child(2),.vgt-print-footer span:nth-child(2){text-align:center}.vgt-print-header span:nth-child(3),.vgt-print-footer span:nth-child(3){text-align:right}
.vgt-page-number::after{content:counter(page)}.vgt-page-count::after{content:counter(pages)}
table{border-collapse:collapse;width:${fitWidth?'100%':'auto'};font-size:9pt}th,td{padding:4px 6px;vertical-align:top;${settings.showGridlines?'border:1px solid #bbb;':''}}thead{display:table-header-group}.vgt-row-heading,.vgt-column-heading,.vgt-corner{background:#f1f5f9;font-weight:600;color:#475569}
</style></head><body>${pages.join('')}</body></html>`;

}

export function printGridSheet(html: string): void {
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);const popup=window.open(url,'_blank','noopener,noreferrer');
  if(!popup){URL.revokeObjectURL(url);throw new Error('Print preview was blocked by the browser.');}
  popup.addEventListener('load',()=>{popup.focus();popup.print();window.setTimeout(()=>URL.revokeObjectURL(url),60_000);},{once:true});
}
