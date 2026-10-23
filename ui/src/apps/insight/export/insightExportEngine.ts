// STATUS: DIAMANT VGT SUPREME — deterministic report/data export and interoperable XLSX/PDF generation
import type { InsightDocumentModel, InsightRecord, InsightReportPage, InsightRow, InsightVisual } from '../domain/types';
import { InsightError, cleanText } from '../core/insightCore';
import { neutralizeSpreadsheetFormulaInjection } from '../../../shared/security/spreadsheetSafety';
import { assertChartSourceRenderable } from '../../../shared/charts/chartEngine';
import { buildGridChartSvg } from '../../../shared/charts/chartSvgRenderer';
import { buildVectorChartPdf } from '../../../shared/charts/export/chartVectorPdf';
import { buildInsightChartObject } from '../integrations/insightChartBridge';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';

const enc=new TextEncoder();
/**
 * One bound definition for every Insight export. `maxRows` is the XLSX sheet limit, so the CSV path
 * can no longer be unbounded while the XLSX path is limited.
 */
export const INSIGHT_EXPORT_LIMITS={maxRows:1_048_576,maxBytes:128*1024*1024,maxPdfLines:40,maxXlsxColumns:16_384} as const;
export interface InsightExportLimits{readonly maxRows:number;readonly maxBytes:number;readonly maxPdfLines:number;readonly maxXlsxColumns:number;}
const csvCell=(value:unknown)=>{const s=neutralizeSpreadsheetFormulaInjection(value);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
export function exportRowsCsv(rows:readonly InsightRow[],limits:InsightExportLimits=INSIGHT_EXPORT_LIMITS):Uint8Array{const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];if(rows.length>limits.maxRows)throw new InsightError('export-row-limit');if(cols.length>limits.maxXlsxColumns)throw new InsightError('export-column-limit');const lines=[cols.map(csvCell).join(','),...rows.map(r=>cols.map(c=>csvCell(r[c])).join(','))];const bytes=enc.encode(lines.join('\r\n')+'\r\n');if(bytes.byteLength>limits.maxBytes)throw new InsightError('export-byte-limit');return bytes;}
function xml(v:unknown):string{return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function crc32(data:Uint8Array):number{let c=0xffffffff;for(const b of data){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return(c^0xffffffff)>>>0;}
function u16(v:number){return[v&255,(v>>>8)&255];}function u32(v:number){return[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];}
function zipStore(files:Array<{name:string;data:Uint8Array}>):Uint8Array{const chunks:number[]=[];const central:number[]=[];let offset=0;for(const f of files){const name=enc.encode(f.name),crc=crc32(f.data),local=[...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(f.data.length),...u32(f.data.length),...u16(name.length),...u16(0),...name,...f.data];chunks.push(...local);central.push(...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(f.data.length),...u32(f.data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name);offset+=local.length;}const centralOffset=chunks.length;chunks.push(...central,...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(central.length),...u32(centralOffset),...u16(0));return new Uint8Array(chunks);}
function columnName(n:number):string{let s='';n++;while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
export function exportRowsXlsx(rows:readonly InsightRow[],sheetName='Data',limits:InsightExportLimits=INSIGHT_EXPORT_LIMITS):Uint8Array{if(rows.length>limits.maxRows)throw new InsightError('export-row-limit');const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];if(cols.length>limits.maxXlsxColumns)throw new InsightError('export-column-limit');const all=[Object.fromEntries(cols.map(c=>[c,c])),...rows];const sheetRows=all.map((row,ri)=>`<row r="${ri+1}">${cols.map((c,ci)=>{const v=row[c];const ref=`${columnName(ci)}${ri+1}`;return typeof v==='number'?`<c r="${ref}"><v>${v}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t>${xml(neutralizeSpreadsheetFormulaInjection(v))}</t></is></c>`;}).join('')}</row>`).join('');const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName.slice(0,31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;return zipStore([
{name:'[Content_Types].xml',data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')},
{name:'_rels/.rels',data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')},
{name:'xl/workbook.xml',data:enc.encode(workbook)},{name:'xl/_rels/workbook.xml.rels',data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')},{name:'xl/worksheets/sheet1.xml',data:enc.encode(sheet)}]);}
function pdfEscape(s:string):string{return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7e]/g,'?');}
/**
 * Render the active report page as a one-page PDF.
 * @param summaryLines the numbers the view already projected (KPI values, totals). They are the same
 *        values the surface displays, so the exported artifact cannot show a different report.
 *        More lines than fit the page are rejected by name instead of being written off-page.
 */
export function exportReportPdf(model:InsightDocumentModel,summaryLines:readonly string[]=[],limits:InsightExportLimits=INSIGHT_EXPORT_LIMITS):Uint8Array{const page=model.report.pages.find(p=>p.id===model.report.activePageId)??model.report.pages[0];if(!page)throw new InsightError('pdf-page-missing');const all=[model.datasetName,page.name,...summaryLines,...page.visuals.filter(v=>v.visible).map(v=>v.title)];if(all.length>limits.maxPdfLines)throw new InsightError('export-pdf-line-limit');const lines=all;const content=['BT','/F1 14 Tf','50 780 Td',...lines.flatMap((line,i)=>[i?'0 -20 Td':'',`(${pdfEscape(line)}) Tj`]).filter(Boolean),'ET'].join('\n');const objects=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`];let out='%PDF-1.7\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(out.length);out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return enc.encode(out);}
export interface InsightPresentProjection { kind:'AstraeaPresentProjection'; title:string; slides:Array<{id:string;title:string;visualIds:string[]}>; sourceUri:string; }
export function exportReportPresent(model:InsightDocumentModel,documentId:string):InsightPresentProjection{return{kind:'AstraeaPresentProjection',title:model.datasetName,slides:model.report.pages.map(p=>({id:`slide-${p.id}`,title:p.name,visualIds:p.visuals.filter(v=>v.visible).map(v=>v.id)})),sourceUri:`vgt://workspace/${cleanText(documentId,256)}/insight/report`};}
export interface InsightPngAdapter { rasterize(page:InsightReportPage,scale:number):Promise<Uint8Array>; }
export async function exportReportPng(model:InsightDocumentModel,adapter:InsightPngAdapter,scale=1):Promise<Uint8Array>{if(scale<0.5||scale>4)throw new InsightError('png-scale-invalid');const p=model.report.pages.find(x=>x.id===model.report.activePageId);if(!p)throw new InsightError('png-page-missing');const bytes=await adapter.rasterize(p,scale);if(bytes.length<8||bytes[0]!==0x89||bytes[1]!==0x50||bytes[2]!==0x4e||bytes[3]!==0x47)throw new InsightError('png-adapter-invalid');return bytes;}
export function gridProjection(rows:readonly InsightRow[]):{columns:string[];rows:InsightRow[]}{return{columns:[...new Set(rows.flatMap(r=>Object.keys(r)))],rows:rows.map(r=>({...r}))};}

/**
 * BATCH-INSIGHT-7 (package 19, "Bild"): the image export of a single visual. Both formats come from the
 * workspace chart stack (`shared/charts/chartSvgRenderer.buildGridChartSvg` and
 * `shared/charts/export/chartVectorPdf.buildVectorChartPdf`) — Insight adds no second renderer. A chart
 * the shared stack cannot convert is refused by name instead of producing an empty file.
 */
export function exportInsightChartSvg(
  visual:InsightVisual,
  records:readonly InsightRecord[],
  context:InsightChartContext,
  model:InsightDocumentModel,
  size:{width:number;height:number}={width:900,height:520},
):Uint8Array{
  const chart=buildInsightChartObject(visual,records,context,model);
  // **`W-450`, Weg 1** ✗✓✓: vor dem Zeichnen wird **derselbe** Wächter befragt, den die Leinwand
  // (`ChartRenderer.tsx:46`) benutzt — kein zweiter Prüfweg, keine zweite Zustandsliste. Sein Wurf
  // trägt den vorhandenen, **benannten** Code (`chart_source_broken` / `chart_source_permission_lost`)
  // und wird hier nur auf den Fehlertyp dieses Moduls umgeschrieben, damit der **Grund** den Aufrufer
  // erreicht: `InsightReportCanvas.tsx:90` zeigt `caught.code`, und `insight-chart-svg-unavailable`
  // wäre an dieser Stelle schlicht die falsche Aussage.
  try{ assertChartSourceRenderable(chart); }
  catch(reason){ throw new InsightError(reason instanceof Error?reason.message:String(reason)); }
  const svg=buildGridChartSvg(chart,size.width,size.height);
  if(!svg.includes('<svg'))throw new InsightError('insight-chart-svg-unavailable');
  const bytes=enc.encode(svg);
  if(bytes.byteLength>INSIGHT_EXPORT_LIMITS.maxBytes)throw new InsightError('export-byte-limit');
  return bytes;
}

export function exportInsightChartVectorPdf(
  visual:InsightVisual,
  records:readonly InsightRecord[],
  context:InsightChartContext,
  model:InsightDocumentModel,
):Uint8Array{
  const chart=buildInsightChartObject(visual,records,context,model);
  const bytes=buildVectorChartPdf(chart);
  if(!bytes||bytes.byteLength<8)throw new InsightError('insight-chart-pdf-unavailable');
  const head=new TextDecoder('latin1').decode(bytes.subarray(0,5));
  if(head!=='%PDF-')throw new InsightError('insight-chart-pdf-unavailable');
  if(bytes.byteLength>INSIGHT_EXPORT_LIMITS.maxBytes)throw new InsightError('export-byte-limit');
  return bytes;
}

/** One delivery path for every Insight export (toolbar and per-visual), so the mechanics exist once.
 *  Release Beta 0.1: native save on the desktop; the browser fallback is a download. */
export function downloadInsightBytes(bytes:Uint8Array,mime:string,fileName:string):Promise<ExportDeliveryResult>{
  const extension=/\.[A-Za-z0-9]{1,12}$/u.test(fileName)?fileName.split('.').pop()!.toLowerCase():'bin';
  return deliverExportBytes(bytes,{
    suggestedName:fileName,
    extensions:[extension],
    mimeType:mime,
    assertArtifact:mime==='application/pdf'?assertPdfExportArtifact:undefined,
  });
}
export type InsightChartContext={documentId:string;cacheState:InsightDocumentModel['cache']['sourceState'];revision:number};
