// STATUS: DIAMANT VGT SUPREME
// Canonical chart authoring, source state, interaction and rendering contract.

import type {
  ChartAggregation,
  ChartAnnotation,
  ChartAxisConfig,
  ChartErrorBars,
  ChartObject,
  ChartPointStyleOverride,
  ChartReferenceLine,
  ChartSeries,
  ChartSourceState,
  ChartTrendline,
  ChartType,
} from '../contracts/workspace';
import { buildChartAccessibleTable, chartSourceWithholdsData, normalizeCanonicalChart } from './chartModel';
import type { CanonicalRenderTree, RenderOutputBackend } from '../../platform/rendering/renderPipeline';
import { compareRenderTargets } from '../../platform/rendering/renderPipeline';

export const CHART_GEOMETRY_VERSION = 1 as const;
export const CHART_AUTHORING_LIMITS = Object.freeze({ annotations:256, referenceLines:64, selectedPoints:4096, width:4096, height:2160 });

export function calculateChartTrendline(series:ChartSeries,trendline:ChartTrendline):number[]{
  const values=series.values;
  if(values.length===0)return[];
  if(trendline.type==='moving-average'){
    const period=Math.max(2,Math.min(128,Math.floor(trendline.period??3)));
    return values.map((_,index)=>{const start=Math.max(0,index-period+1),slice=values.slice(start,index+1);return slice.reduce((sum,value)=>sum+value,0)/slice.length;});
  }
  if(trendline.type==='exponential'){
    const usable=values.map((y,x)=>({x,y})).filter(({y})=>y>0);
    if(usable.length<2)return[...values];
    const n=usable.length,sumX=usable.reduce((sum,point)=>sum+point.x,0),sumY=usable.reduce((sum,point)=>sum+Math.log(point.y),0),sumXY=usable.reduce((sum,point)=>sum+point.x*Math.log(point.y),0),sumXX=usable.reduce((sum,point)=>sum+point.x*point.x,0);
    const slope=(n*sumXY-sumX*sumY)/(n*sumXX-sumX*sumX||1),intercept=Math.exp((sumY-slope*sumX)/n);
    return values.map((_,index)=>intercept*Math.exp(slope*index));
  }
  const n=values.length,sumX=n*(n-1)/2,sumY=values.reduce((sum,value)=>sum+value,0),sumXY=values.reduce((sum,value,index)=>sum+index*value,0),sumXX=values.reduce((sum,_,index)=>sum+index*index,0);
  const slope=(n*sumXY-sumX*sumY)/(n*sumXX-sumX*sumX||1),intercept=(sumY-slope*sumX)/n;
  return values.map((_,index)=>intercept+slope*index);
}

export function calculateChartErrorBars(series:ChartSeries,config:ChartErrorBars):number[]{
  if(!series.values.length)return[];
  if(config.type==='fixed')return series.values.map(()=>Math.abs(config.value??1));
  if(config.type==='percentage')return series.values.map((value)=>Math.abs(value)*Math.abs(config.value??5)/100);
  const mean=series.values.reduce((sum,value)=>sum+value,0)/series.values.length;
  const variance=series.values.reduce((sum,value)=>(sum+(value-mean)**2),0)/series.values.length;
  const deviation=Math.sqrt(variance);
  return series.values.map(()=>deviation);
}

export interface ChartSourceResolution {
  state: ChartSourceState;
  sourceVersion?: number;
  resolvedVersion?: number;
  permission: 'allowed' | 'denied' | 'unknown';
  reason?: 'missing' | 'stale' | 'permission' | 'ok';
}

export interface ChartInteractionState {
  selectedSeries: number[];
  selectedPoints: Array<{ seriesIndex:number; pointIndex:number }>;
  highlightedCategories: number[];
  filter?: { seriesIndex:number; pointIndex?:number; categoryIndex?:number };
}

export interface ChartRenderPlan {
  chart: ChartObject;
  width: number;
  height: number;
  stableFinalState: boolean;
  animationDurationMs: number;
  accessibilityRows: ReturnType<typeof buildChartAccessibleTable>;
  geometrySignature: string;
}

export interface ChartExportDecision {
  backend: RenderOutputBackend;
  vectorPreferred: boolean;
  rasterFallbackRequired: boolean;
  reasons: string[];
}

function finite(value:number, fallback=0):number { return Number.isFinite(value) ? value : fallback; }
function clamp(value:number,min:number,max:number):number { return Math.max(min,Math.min(max,value)); }
function safeText(value:string,max=256):string { return String(value).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max); }


export function bindChartWorkspaceSource(
  chart:ChartObject,
  source:{kind:'range'|'table'|'pivot'|'database'|'insight';documentId:string;objectId:string;version?:number;sheetId?:string;range?:string;tableId?:string;pivotId?:string},
  live=true,
):ChartObject {
  const normalized=normalizeCanonicalChart(chart);
  const documentId=safeText(source.documentId,256), objectId=safeText(source.objectId,256);
  if(!documentId||!objectId)throw new Error('chart_source_identity_required');
  const uri=`vgt://workspace/document/${encodeURIComponent(documentId)}/object/${encodeURIComponent(objectId)}`;
  return normalizeCanonicalChart({...normalized,data_source_link:live?uri:undefined,source:{kind:source.kind,documentId,objectId,uri,sourceVersion:source.version,sheetId:source.sheetId,range:source.range,tableId:source.tableId,pivotId:source.pivotId,live,state:live?'current':'frozen',lastResolvedAt:Date.now()},source_state:live?'current':'frozen'});
}

export function freezeChartSource(chart:ChartObject):ChartObject {
  const normalized=normalizeCanonicalChart(chart);
  return normalizeCanonicalChart({...normalized,data_source_link:undefined,source:normalized.source?{...normalized.source,live:false,state:'frozen'}:{kind:'inline',live:false,state:'frozen'},source_state:'frozen'});
}

export function replaceChartInlineSnapshot(chart:ChartObject,categories:readonly string[],series:readonly ChartSeries[]):ChartObject {
  if(categories.length>2048||series.length>64)throw new Error('chart_snapshot_limit');
  return normalizeCanonicalChart({...chart,categories:[...categories],series:[...series],data_source_link:undefined,source:{kind:'inline',live:false,state:'frozen'},source_state:'frozen'});
}

export function resolveChartSourceState(chart:ChartObject, resolution:ChartSourceResolution):ChartObject {
  const normalized=normalizeCanonicalChart(chart);
  const state:ChartSourceState = resolution.permission === 'denied' ? 'permission-lost' : resolution.state;
  return normalizeCanonicalChart({
    ...normalized,
    source_state:state,
    source:normalized.source ? {
      ...normalized.source,
      state,
      sourceVersion:resolution.sourceVersion ?? normalized.source.sourceVersion,
      resolvedVersion:resolution.resolvedVersion ?? normalized.source.resolvedVersion,
      lastResolvedAt:state === 'current' ? Date.now() : normalized.source.lastResolvedAt,
    } : undefined,
  });
}

export function validateLiveChartSource(chart:ChartObject):void {
  const normalized=normalizeCanonicalChart(chart);
  if (!normalized.source || !normalized.source.live) return;
  if (normalized.source_state === 'broken') throw new Error('chart_source_broken');
  if (normalized.source_state === 'permission-lost') throw new Error('chart_source_permission_lost');
  if (normalized.source_state === 'stale') throw new Error('chart_source_stale');
  if (normalized.source_state === 'frozen') throw new Error('chart_source_frozen');
  if (normalized.source.kind !== 'inline' && !normalized.source.uri && !normalized.data_source_link && !normalized.source.sheetId) throw new Error('chart_live_source_reference_missing');
}

export interface ChartSourceLock {
  /** true ⇒ es darf **nichts** vom Diagramm und **nichts** von den Daten ausgegeben werden. */
  withheld: boolean;
  /** Der Zustand aus der **einen** Vokabel (`chartModel.ts:30`, `:37`). */
  state: ChartSourceState;
  /** Der **benannte** Code des Wächters — `null`, wenn er laut eigenem Vertrag nicht greift. */
  code: string | null;
}

/**
 * Der Sperrzustand eines Diagramms. Er ruft **genau den vorhandenen Wächter** auf
 * (`validateLiveChartSource`, oben) — *der Wurf ist die Durchsetzung*. Hier wird er eingefangen,
 * damit der Renderer einen **benannten** Sperrzustand zeichnen kann, statt abzustürzen; der Name
 * geht dabei nicht verloren, sondern wird zum `code`.
 *
 * Der Wächter wird **unbedingt** befragt, sobald ein Diagramm gezeichnet oder ausgeführt wird:
 * damit sind alle vier benannten Codes (`chart_source_permission_lost` · `chart_source_broken` ·
 * `chart_source_stale` · `chart_source_frozen`) im Renderpfad wirklich erreicht. Ob der Rückhalt
 * greift, entscheidet **allein** die Vokabel (`chartSourceWithholdsData`) — nicht eine zweite Liste.
 */
export function chartSourceLock(chart:ChartObject):ChartSourceLock {
  const normalized=normalizeCanonicalChart(chart);
  const state:ChartSourceState=normalized.source_state ?? normalized.source?.state ?? 'frozen';
  let code:string|null=null;
  try { validateLiveChartSource(normalized); } catch (error) { code=error instanceof Error ? error.message : String(error); }
  return { withheld:chartSourceWithholdsData(state), state, code };
}

/**
 * Die Durchsetzung für **Rendern und Ausführen**: eine Quelle, die ihre Nutzdaten zurückhält, wird
 * **benannt** zurückgewiesen — mit dem Wurf des Wächters, nicht mit einem erfundenen Code.
 *
 * Bewusst **eng** gefasst: `stale` und `frozen` bleiben ausführbar. Der UI-Standard (§24) führt sie als
 * **gestaltete** Zustände, nicht als Datenverlust, und `apps/insight/testing/insightExportBounds.test.ts:44`
 * bindet `stale` als ausdrücklich exportierbar. Ein Rückhalt entsteht nur, wo die Daten wirklich
 * unzeigbar sind.
 *
 * Greift der Wächter nicht, weil die Quelle nicht lebendig ist (`chartEngine.ts:130`), wird mit dem
 * **Zustand der einen Vokabel** zurückgewiesen — `permission-lost` bzw. `broken`; auch das ist benannt.
 */
export function assertChartSourceRenderable(chart:ChartObject):void {
  const lock=chartSourceLock(chart);
  if (lock.withheld) throw new Error(lock.code ?? lock.state);
}

export function reorderChartSeries(chart:ChartObject, from:number, to:number):ChartObject {
  const normalized=normalizeCanonicalChart(chart);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from<0 || to<0 || from>=normalized.series.length || to>=normalized.series.length) throw new Error('chart_series_order_invalid');
  const series=[...normalized.series]; const [moved]=series.splice(from,1); if (!moved) throw new Error('chart_series_order_invalid'); series.splice(to,0,moved);
  return normalizeCanonicalChart({ ...normalized, series });
}

export function configureChartAxis(chart:ChartObject, axis:'x'|'y'|'secondary-y', config:ChartAxisConfig):ChartObject {
  const normalized=normalizeCanonicalChart(chart);
  return normalizeCanonicalChart({
    ...normalized,
    x_axis:axis==='x'?config:normalized.x_axis,
    y_axis:axis==='y'?config:normalized.y_axis,
    secondary_y_axis:axis==='secondary-y'?config:normalized.secondary_y_axis,
  });
}

export function setChartSeriesAggregation(chart:ChartObject,index:number,aggregation:ChartAggregation):ChartObject {
  const normalized=normalizeCanonicalChart(chart);
  if (!Number.isInteger(index)||index<0||index>=normalized.series.length) throw new Error('chart_series_index_invalid');
  const series=normalized.series.map((item,i)=>i===index?{...item,aggregation}:item);
  return normalizeCanonicalChart({...normalized,series});
}

export function setChartAnnotations(chart:ChartObject, annotations:readonly ChartAnnotation[]):ChartObject {
  if (annotations.length>CHART_AUTHORING_LIMITS.annotations) throw new Error('chart_annotation_limit');
  return normalizeCanonicalChart({...normalizeCanonicalChart(chart),annotations:[...annotations]});
}

export function setChartReferenceLines(chart:ChartObject, lines:readonly ChartReferenceLine[]):ChartObject {
  if (lines.length>CHART_AUTHORING_LIMITS.referenceLines) throw new Error('chart_reference_line_limit');
  return normalizeCanonicalChart({...normalizeCanonicalChart(chart),reference_lines:[...lines]});
}

export function setChartStyleOverrides(chart:ChartObject, overrides:readonly ChartPointStyleOverride[]):ChartObject {
  const normalized=normalizeCanonicalChart(chart);
  const bySeries=new Map<number,ChartPointStyleOverride[]>();
  for (const override of overrides.slice(0,4096)) {
    if (!Number.isInteger(override.series_index) || override.series_index<0 || override.series_index>=normalized.series.length) continue;
    bySeries.set(override.series_index,[...(bySeries.get(override.series_index)??[]),override]);
  }
  return normalizeCanonicalChart({...normalized,series:normalized.series.map((series,index)=>({...series,style_overrides:bySeries.get(index)??series.style_overrides}))});
}

export function aggregateSeriesValues(series:ChartSeries):number[] {
  const values=series.values.filter(Number.isFinite);
  const mode=series.aggregation??'none';
  if (mode==='none') return [...values];
  if (mode==='count') return [values.length];
  if (!values.length) return [0];
  if (mode==='sum') return [values.reduce((a,b)=>a+b,0)];
  if (mode==='average') return [values.reduce((a,b)=>a+b,0)/values.length];
  if (mode==='min') return [Math.min(...values)];
  if (mode==='max') return [Math.max(...values)];
  return [...values];
}

export function reduceChartForAggregation(chart:ChartObject):ChartObject {
  const normalized=normalizeCanonicalChart(chart);
  if (!normalized.series.some(series=>(series.aggregation??'none')!=='none')) return normalized;
  return normalizeCanonicalChart({...normalized,categories:['Aggregated'],series:normalized.series.map(series=>({...series,values:aggregateSeriesValues(series),x_values:undefined,bubble_sizes:undefined}))});
}

export function updateChartInteraction(chart:ChartObject, next:Partial<ChartInteractionState>):ChartObject {
  const normalized=normalizeCanonicalChart(chart);
  const selectedSeries=(next.selectedSeries??normalized.selected_series??[]).filter(index=>Number.isInteger(index)&&index>=0&&index<normalized.series.length).slice(0,64);
  const selectedPoints=(next.selectedPoints??normalized.selected_points??[]).filter(point=>Number.isInteger(point.seriesIndex)&&Number.isInteger(point.pointIndex)&&point.seriesIndex>=0&&point.seriesIndex<normalized.series.length&&point.pointIndex>=0&&point.pointIndex<(normalized.series[point.seriesIndex]?.values.length??0)).slice(0,4096);
  return normalizeCanonicalChart({...normalized,selected_series:selectedSeries,selected_points:selectedPoints});
}

export function executeChartDrill(chart:ChartObject, selection:{seriesIndex:number;pointIndex?:number;categoryIndex?:number}):{kind:'none'|'insight-filter'|'insight-drill'|'workspace-open';target?:string;payload?:Record<string,unknown>} {
  const normalized=normalizeCanonicalChart(chart);
  if (!normalized.drill_action) return {kind:'none'};
  if (!Number.isInteger(selection.seriesIndex)||selection.seriesIndex<0||selection.seriesIndex>=normalized.series.length) throw new Error('chart_drill_series_invalid');
  const categoryIndex=selection.categoryIndex??selection.pointIndex;
  return {
    kind:normalized.drill_action.kind,
    target:normalized.drill_action.target,
    payload:{series:normalized.series[selection.seriesIndex]?.name,category:categoryIndex===undefined?undefined:normalized.categories[categoryIndex],pointIndex:selection.pointIndex},
  };
}

export function buildChartTooltip(chart:ChartObject, seriesIndex:number, pointIndex:number):string {
  const normalized=normalizeCanonicalChart(chart);
  const series=normalized.series[seriesIndex];
  if (!series || !Number.isInteger(pointIndex) || pointIndex<0 || pointIndex>=series.values.length) throw new Error('chart_tooltip_index_invalid');
  const category=normalized.categories[pointIndex]??String(pointIndex+1);
  return `${safeText(category,128)} · ${safeText(series.name,128)}: ${series.values[pointIndex]}`;
}

function geometrySignature(chart:ChartObject,width:number,height:number):string {
  const normalized=normalizeCanonicalChart(chart);
  const payload=JSON.stringify({v:CHART_GEOMETRY_VERSION,width,height,type:normalized.chart_type,categories:normalized.categories,series:normalized.series.map(series=>({name:series.name,values:series.values,x:series.x_values,bubbles:series.bubble_sizes,secondary:series.secondary_axis,type:series.chart_type})),axes:[normalized.x_axis,normalized.y_axis,normalized.secondary_y_axis],labels:[normalized.x_axis_title,normalized.y_axis_title,normalized.secondary_y_axis_title],refs:normalized.reference_lines,annotations:normalized.annotations});
  let hash=2166136261;
  for(let i=0;i<payload.length;i++){ hash^=payload.charCodeAt(i); hash=Math.imul(hash,16777619); }
  return `chart-geom-v${CHART_GEOMETRY_VERSION}-${(hash>>>0).toString(16).padStart(8,'0')}`;
}

export function buildChartRenderPlan(chart:ChartObject,width:number,height:number,stableFinalState=false):ChartRenderPlan {
  const safeW=clamp(Math.floor(finite(width,900)),320,CHART_AUTHORING_LIMITS.width);
  const safeH=clamp(Math.floor(finite(height,520)),220,CHART_AUTHORING_LIMITS.height);
  const normalized=reduceChartForAggregation(chart);
  return {
    chart:normalized,
    width:safeW,
    height:safeH,
    stableFinalState,
    animationDurationMs:stableFinalState?0:(normalized.animation?.enabled?normalized.animation.duration_ms:0),
    accessibilityRows:buildChartAccessibleTable(normalized),
    geometrySignature:geometrySignature(normalized,safeW,safeH),
  };
}

export function chartToCanonicalRenderTree(chart:ChartObject,width=900,height=520):CanonicalRenderTree {
  const plan=buildChartRenderPlan(chart,width,height,true);
  const primitives=[] as CanonicalRenderTree['pages'][number]['primitives'];
  primitives.push({kind:'text',x:24,y:24,text:plan.chart.title,color:'#ffffff',sourceId:`${plan.chart.id}:title`});
  const rows=plan.accessibilityRows;
  const plotX=72, plotY=64, plotW=Math.max(1,plan.width-144), plotH=Math.max(1,plan.height-128);
  let min=0,max=1;
  for(const series of plan.chart.series){
    for(const value of series.values){
      if(!Number.isFinite(value))continue;
      min=Math.min(min,value);
      max=Math.max(max,value);
    }
  }
  const span=max-min||1;
  const count=Math.max(1,rows.length);
  plan.chart.series.forEach((series,seriesIndex)=>{
    series.values.forEach((value,pointIndex)=>{
      const x=plotX+(pointIndex+.5)*plotW/count;
      const y=plotY+plotH-(value-min)/span*plotH;
      primitives.push({kind:plan.chart.chart_type==='line'||plan.chart.chart_type==='scatter'||plan.chart.chart_type==='bubble'?'line':'rect',x,y,width:Math.max(1,plotW/count/Math.max(1,plan.chart.series.length)*.75),height:Math.max(1,plotY+plotH-y),color:series.color,sourceId:`${plan.chart.id}:s${seriesIndex}:p${pointIndex}`});
    });
  });
  return {
    version:1,
    documentId:`chart:${plan.chart.id}`,
    pages:[{
      id:'chart-page-1',
      geometry:{width:plan.width,height:plan.height,margins:{top:0,right:0,bottom:0,left:0},bodyWidth:plan.width,bodyHeight:plan.height,columns:{count:1,gap:0,widths:[plan.width],offsets:[0]}},
      primitives,
      accessibility:{id:`chart:${plan.chart.id}`,role:'img',name:plan.chart.title,description:plan.chart.alt_summary,readingOrder:0,keyboardFocusable:true},
      effects:['vector-path'],
    }],
  };
}

export function compareChartRenderTargets(chart:ChartObject,width=900,height=520):{signature:string;backends:RenderOutputBackend[]} {
  const tree=chartToCanonicalRenderTree(chart,width,height);
  const backends:RenderOutputBackend[]=['screen','print','pdf','svg','png'];
  const result=compareRenderTargets(tree,backends.map(backend=>({backend,surface:backend==='screen'?'view':'export',dpi:backend==='png'?192:96,colorSpace:'srgb',alphaMode:backend==='pdf'?'flatten':'preserve'})));
  return {signature:result.commonSignature,backends};
}

export function chooseChartExport(chart:ChartObject,backend:'svg'|'pdf'|'png'):ChartExportDecision {
  const normalized=normalizeCanonicalChart(chart);
  // Eine zurückgehaltene Quelle wird **vor** jeder Entscheidung benannt zurückgewiesen: sonst träfe
  // dieser Aufruf eine Auswahl über Daten, die gar nicht ausgegeben werden dürfen.
  // Erreichbar: `apps/grid/charts/GridChartModal.tsx:135` → `gridChartExport.ts:88` (Fehler wird dort
  // in `:141–142` benannt angezeigt, nicht verschluckt).
  assertChartSourceRenderable(normalized);
  const reasons:string[]=[];
  if (backend==='svg') return {backend:'svg',vectorPreferred:true,rasterFallbackRequired:false,reasons};
  if (backend==='png') return {backend:'png',vectorPreferred:false,rasterFallbackRequired:true,reasons:['raster-output-requested']};
  const allText=[normalized.title,...normalized.categories,...normalized.series.map(series=>series.name),...(normalized.annotations??[]).map(item=>item.text),...(normalized.reference_lines??[]).map(item=>item.label??'')].join('');
  const unsupportedPath=normalized.chart_type==='pie'||normalized.chart_type==='donut'||normalized.chart_type==='sunburst';
  const unsupportedTextTransform=Boolean(normalized.y_axis_title||normalized.secondary_y_axis_title);
  const nonAscii=/[^\x09\x0A\x0D\x20-\x7E]/.test(allText);
  const transparency=normalized.series.some(series=>series.style_overrides?.some(item=>item.opacity!==undefined&&item.opacity<1));
  if(unsupportedPath)reasons.push('pdf-vector-arc-subset-unsupported');
  if(unsupportedTextTransform)reasons.push('pdf-vector-transformed-text-unsupported');
  if(nonAscii)reasons.push('pdf-vector-font-subset-unsupported');
  if(transparency)reasons.push('pdf-vector-transparency-flatten-required');
  const rasterFallbackRequired=unsupportedPath||unsupportedTextTransform||nonAscii||transparency;
  return {backend:'pdf',vectorPreferred:true,rasterFallbackRequired,reasons};
}

export function supportedChartTypes():readonly ChartType[] {
  return ['column','bar','line','area','pie','donut','scatter','bubble','combo','histogram','waterfall','funnel','radar','stock','box-whisker','treemap','sunburst','sparkline','pareto','surface'];
}

export type ChartPlatform='windows'|'linux'|'macos'|'astraeaos';
export interface ChartPlatformContract { platform:ChartPlatform; semanticModelVersion:number; vectorSvg:boolean; vectorPdfSubset:boolean; rasterFallback:boolean; localFontsOnly:boolean; }
export function chartPlatformContract(platform:ChartPlatform):ChartPlatformContract{
  return {platform,semanticModelVersion:2,vectorSvg:true,vectorPdfSubset:true,rasterFallback:true,localFontsOnly:true};
}

export interface ChartDiagnosticSummary { id:string; type:ChartType; seriesCount:number; pointCount:number; sourceState:ChartSourceState; live:boolean; geometryVersion:number; }
export function buildChartDiagnosticSummary(chart:ChartObject):ChartDiagnosticSummary{
  const normalized=normalizeCanonicalChart(chart);
  return {id:normalized.id,type:normalized.chart_type,seriesCount:normalized.series.length,pointCount:normalized.series.reduce((sum,series)=>sum+series.values.length,0),sourceState:normalized.source_state??'frozen',live:Boolean(normalized.source?.live),geometryVersion:CHART_GEOMETRY_VERSION};
}
