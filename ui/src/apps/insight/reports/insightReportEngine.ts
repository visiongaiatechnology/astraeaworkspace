// STATUS: DIAMANT VGT SUPREME — multi-page report/dashboard authoring state engine
import type { InsightBookmark, InsightFilter, InsightReportModel, InsightReportObject, InsightReportPage, InsightScalar, InsightSlicer, InsightVisual } from '../domain/types';
import { InsightError, cleanText, stableInsightId } from '../core/insightCore';

export const REPORT_LIMITS={maxPages:512,maxObjectsPerPage:10_000,maxBookmarks:4096,maxFilters:4096,minZoom:100,maxZoom:300} as const;
/** One bound for how many values a slicer selection may hold. */
export const REPORT_SLICER_LIMIT=512;
export function addReportPage(report:InsightReportModel,name:string,width=1280,height=720):InsightReportModel{if(report.pages.length>=REPORT_LIMITS.maxPages)throw new InsightError('report-page-limit');if(width<320||height<240||width>10000||height>10000)throw new InsightError('report-page-size-invalid');const page:InsightReportPage={id:stableInsightId('page',`${name}:${report.pages.length}`),name:cleanText(name,256),width,height,visuals:[],objects:[],filters:[],slicers:[],layers:['Background','Visuals','Annotations']};return{...report,pages:[...report.pages,page],activePageId:page.id};}
function page(report:InsightReportModel,id:string):InsightReportPage{const p=report.pages.find(v=>v.id===id);if(!p)throw new InsightError('report-page-missing');return p;}
export function placeVisual(report:InsightReportModel,pageId:string,visual:InsightVisual):InsightReportModel{const p=page(report,pageId);if(p.visuals.length+p.objects.length>=REPORT_LIMITS.maxObjectsPerPage)throw new InsightError('report-object-limit');const snap=report.snap?report.gridSize:1;const normalized={...visual,x:Math.round(visual.x/snap)*snap,y:Math.round(visual.y/snap)*snap,width:Math.max(40,Math.round(visual.width/snap)*snap),height:Math.max(30,Math.round(visual.height/snap)*snap)};return{...report,pages:report.pages.map(x=>x.id===pageId?{...x,visuals:[...x.visuals,normalized]}:x)};}
export function placeReportObject(report:InsightReportModel,pageId:string,object:InsightReportObject):InsightReportModel{const p=page(report,pageId);if(p.visuals.length+p.objects.length>=REPORT_LIMITS.maxObjectsPerPage)throw new InsightError('report-object-limit');if(object.kind==='text'&&!object.text.trim())throw new InsightError('report-text-empty');if(object.kind==='image'&&!object.altText.trim())throw new InsightError('report-image-alt-required');if(object.kind==='button'&&!object.label.trim())throw new InsightError('report-button-name-required');return{...report,pages:report.pages.map(x=>x.id===pageId?{...x,objects:[...x.objects,structuredClone(object)]}:x)};}
export function updatePageFilters(report:InsightReportModel,pageId:string,filters:InsightFilter[]):InsightReportModel{if(filters.length>REPORT_LIMITS.maxFilters)throw new InsightError('report-filter-limit');return{...report,pages:report.pages.map(p=>p.id===pageId?{...p,filters:structuredClone(filters)}:p)};}
export function createSlicer(field:string,kind:InsightSlicer['kind'],selection:InsightScalar[]=[]):InsightSlicer{return{id:stableInsightId('slicer',`${field}:${kind}`),field:cleanText(field,512),kind,selection:[...selection]};}
/** BATCH-INSIGHT-6: slicers could be created but never added to, updated on or removed from a page. */
export function addSlicer(report:InsightReportModel,pageId:string,slicer:InsightSlicer):InsightReportModel{
  const p=page(report,pageId);
  if(p.slicers.length>=REPORT_SLICER_LIMIT)throw new InsightError('report-slicer-limit');
  if(p.slicers.some(entry=>entry.id===slicer.id))throw new InsightError('report-slicer-exists');
  return{...report,pages:report.pages.map(x=>x.id===pageId?{...x,slicers:[...x.slicers,structuredClone(slicer)]}:x)};
}
export function updateSlicerSelection(report:InsightReportModel,pageId:string,slicerId:string,selection:InsightScalar[]):InsightReportModel{
  const p=page(report,pageId);
  if(!p.slicers.some(entry=>entry.id===slicerId))throw new InsightError('report-slicer-missing');
  if(selection.length>REPORT_SLICER_LIMIT)throw new InsightError('insight-slicer-selection-limit');
  return{...report,pages:report.pages.map(x=>x.id===pageId?{...x,slicers:x.slicers.map(entry=>entry.id===slicerId?{...entry,selection:[...selection]}:entry)}:x)};
}
export function removeSlicer(report:InsightReportModel,pageId:string,slicerId:string):InsightReportModel{
  const p=page(report,pageId);
  if(!p.slicers.some(entry=>entry.id===slicerId))throw new InsightError('report-slicer-missing');
  return{...report,pages:report.pages.map(x=>x.id===pageId?{...x,slicers:x.slicers.filter(entry=>entry.id!==slicerId)}:x)};
}
export function captureBookmark(report:InsightReportModel,name:string):InsightReportModel{if(report.bookmarks.length>=REPORT_LIMITS.maxBookmarks)throw new InsightError('report-bookmark-limit');const p=page(report,report.activePageId);const bookmark:InsightBookmark={id:stableInsightId('bookmark',`${name}:${Date.now()}`),name:cleanText(name,256),pageId:p.id,filters:structuredClone([...report.reportFilters,...p.filters]),slicers:structuredClone(p.slicers),visualVisibility:Object.fromEntries(p.visuals.map(v=>[v.id,v.visible]))};return{...report,bookmarks:[...report.bookmarks,bookmark]};}
export function applyBookmark(report:InsightReportModel,bookmarkId:string):InsightReportModel{const b=report.bookmarks.find(x=>x.id===bookmarkId);if(!b)throw new InsightError('report-bookmark-missing');return{...report,activePageId:b.pageId,pages:report.pages.map(p=>p.id===b.pageId?{...p,slicers:structuredClone(b.slicers),visuals:p.visuals.map(v=>({...v,visible:b.visualVisibility[v.id]??v.visible}))}:p)};}
export function navigateReport(report:InsightReportModel,action:{type:'page'|'bookmark'|'back';target?:string},history:string[]):{report:InsightReportModel;history:string[]}{if(action.type==='bookmark'){if(!action.target)throw new InsightError('report-navigation-target');return{report:applyBookmark(report,action.target),history:[...history,report.activePageId]};}if(action.type==='page'){if(!action.target||!report.pages.some(p=>p.id===action.target))throw new InsightError('report-navigation-target');return{report:{...report,activePageId:action.target},history:[...history,report.activePageId]};}const target=history.at(-1);if(!target)return{report,history};return{report:{...report,activePageId:target},history:history.slice(0,-1)};}
export function drillThrough(report:InsightReportModel,targetPageId:string,field:string,value:InsightScalar,history:string[]):{report:InsightReportModel;history:string[]}{const p=page(report,targetPageId);if(!(p.drillthroughFields??[]).includes(field))throw new InsightError('drillthrough-field-denied');const filter:InsightFilter={id:stableInsightId('drill',`${targetPageId}:${field}:${String(value)}`),scope:'page',scopeId:targetPageId,field,operator:'=',values:[value],enabled:true};return{report:{...report,activePageId:targetPageId,pages:report.pages.map(x=>x.id===targetPageId?{...x,filters:[...x.filters.filter(f=>!f.id.startsWith('drill-')),filter]}:x)},history:[...history,report.activePageId]};}
export function visiblePageObjects(report:InsightReportModel,pageId:string,context:Readonly<Record<string,boolean>>={}):{visuals:InsightVisual[];objects:InsightReportObject[]}{const p=page(report,pageId);const visible=(id:string,current:boolean)=>current&&(context[id]??true);return{visuals:p.visuals.filter(v=>visible(v.id,v.visible)).sort((a,b)=>a.layer-b.layer),objects:p.objects.filter(o=>visible(o.id,o.visible)).sort((a,b)=>a.layer-b.layer)};}
/** BATCH-INSIGHT-5: the report engine could place visuals but never remove, move or resize one. */
export function removeVisual(report:InsightReportModel,pageId:string,visualId:string):InsightReportModel{const p=page(report,pageId);if(!p.visuals.some(v=>v.id===visualId))throw new InsightError('report-visual-missing');return{...report,pages:report.pages.map(x=>x.id===pageId?{...x,visuals:x.visuals.filter(v=>v.id!==visualId)}:x)};}
export function removeReportObject(report:InsightReportModel,pageId:string,objectId:string):InsightReportModel{const p=page(report,pageId);if(!p.objects.some(o=>o.id===objectId))throw new InsightError('report-object-missing');return{...report,pages:report.pages.map(x=>x.id===pageId?{...x,objects:x.objects.filter(o=>o.id!==objectId)}:x)};}
/**
 * Move or resize a visual by a bounded step, snapped to the page grid and clamped to the page. The
 * keyboard path (step buttons in the view) uses this, so layout is never mouse-only.
 */
export function moveVisual(report:InsightReportModel,pageId:string,visualId:string,delta:{dx?:number;dy?:number;dwidth?:number;dheight?:number}):InsightReportModel{
  const p=page(report,pageId);const visual=p.visuals.find(v=>v.id===visualId);if(!visual)throw new InsightError('report-visual-missing');
  const snap=report.snap?report.gridSize:1;
  const quantize=(value:number)=>Math.round(value/snap)*snap;
  const width=Math.max(40,Math.min(p.width,quantize(visual.width+(delta.dwidth??0))));
  const height=Math.max(30,Math.min(p.height,quantize(visual.height+(delta.dheight??0))));
  const x=Math.max(0,Math.min(p.width-width,quantize(visual.x+(delta.dx??0))));
  const y=Math.max(0,Math.min(p.height-height,quantize(visual.y+(delta.dy??0))));
  return{...report,pages:report.pages.map(pageEntry=>pageEntry.id===pageId?{...pageEntry,visuals:pageEntry.visuals.map(v=>v.id===visualId?{...v,x,y,width,height}:v)}:pageEntry)};
}
export function renameReportPage(report:InsightReportModel,pageId:string,name:string):InsightReportModel{page(report,pageId);const clean=cleanText(name,256);if(report.pages.some(entry=>entry.id!==pageId&&entry.name===clean))throw new InsightError('report-page-name-taken');return{...report,pages:report.pages.map(entry=>entry.id===pageId?{...entry,name:clean}:entry)};}
export function compactLayoutForPage(report:InsightReportModel,pageId:string):Array<{visualId:string;x:number;y:number;width:number;height:number}>{const p=page(report,pageId);if(p.compactLayout?.length)return structuredClone(p.compactLayout);let y=0;return p.visuals.filter(v=>v.visible).map(v=>{const h=Math.max(160,Math.min(360,v.height));const item={visualId:v.id,x:0,y,width:360,height:h};y+=h+12;return item;});}
