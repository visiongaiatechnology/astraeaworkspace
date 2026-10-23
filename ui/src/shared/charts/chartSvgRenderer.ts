// STATUS: DIAMANT VGT SUPREME
// Bounded dependency-free SVG renderer for Astraea Grid charts.

import type { ChartAxisConfig, ChartObject, ChartSeries, ChartType } from '../contracts/workspace';
import { assertChartSourceRenderable, calculateChartErrorBars, calculateChartTrendline } from './chartEngine';
import { normalizeCanonicalChart } from './chartModel';

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 520;
const PAD = { left: 70, right: 70, top: 68, bottom: 78 };

const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const safeColor = (value: string | undefined, fallback: string): string => /^#[0-9a-f]{6}$/i.test(value || '') ? String(value) : fallback;
const finite = (value: number | undefined, fallback = 0): number => Number.isFinite(value) ? Number(value) : fallback;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
function pointColor(series:ChartSeries,seriesIndex:number,pointIndex:number,fallback:string):string { const override=series.style_overrides?.find(item=>item.series_index===seriesIndex&&(item.point_index===undefined||item.point_index===pointIndex)); return safeColor(override?.fill,safeColor(series.color,fallback)); }
function pointOpacity(series:ChartSeries,seriesIndex:number,pointIndex:number):number { const override=series.style_overrides?.find(item=>item.series_index===seriesIndex&&(item.point_index===undefined||item.point_index===pointIndex)); return override?.opacity===undefined?1:clamp(override.opacity,0,1); }

interface ChartPalette { bg:string; text:string; grid:string; axis:string; surface:string; }
function palette(chart: ChartObject): ChartPalette {
  const presets: Record<string, ChartPalette> = {
    'astraea-dark': { bg:'#07111f', text:'#dbeafe', grid:'#24344b', axis:'#64748b', surface:'#0f1d31' },
    'astraea-light': { bg:'#f8fafc', text:'#0f172a', grid:'#cbd5e1', axis:'#64748b', surface:'#ffffff' },
    executive: { bg:'#111827', text:'#f8fafc', grid:'#374151', axis:'#9ca3af', surface:'#1f2937' },
    minimal: { bg:'#ffffff', text:'#111827', grid:'#e5e7eb', axis:'#9ca3af', surface:'#ffffff' },
    'high-contrast': { bg:'#000000', text:'#ffffff', grid:'#ffffff', axis:'#ffffff', surface:'#000000' },
  };
  const base = presets[chart.style_preset || 'astraea-dark'] || presets['astraea-dark'];
  return {
    bg:safeColor(chart.manual_overrides?.background, base.bg),
    text:safeColor(chart.manual_overrides?.textColor, base.text),
    grid:safeColor(chart.manual_overrides?.gridColor, base.grid),
    axis:safeColor(chart.manual_overrides?.axisColor, base.axis),
    surface:base.surface,
  };
}

function allValues(series: ChartSeries[], secondary = false): number[] {
  return series.filter((item) => Boolean(item.secondary_axis) === secondary).flatMap((item) => item.values).filter(Number.isFinite);
}
function domain(values: number[], config?:ChartAxisConfig): { min:number; max:number } {
  const log=config?.type==='log'; let sourceMin=Infinity,sourceMax=-Infinity;
  for(const value of values){if(!Number.isFinite(value)||(log&&value<=0))continue;sourceMin=Math.min(sourceMin,value);sourceMax=Math.max(sourceMax,value);}
  if(sourceMin===Infinity)return { min:log?1:0, max:log?10:1 };
  let min = config?.min ?? (log?sourceMin:Math.min(sourceMin,0));
  let max = config?.max ?? (log?sourceMax:Math.max(sourceMax,0));
  if(log){min=Math.max(Number.MIN_VALUE,min);max=Math.max(min*1.000001,max);return{min,max};}
  if (min === max) { min -= 1; max += 1; }
  if(config?.min===undefined||config?.max===undefined){const pad = (max - min) * 0.08;if(config?.min===undefined)min-=pad;if(config?.max===undefined)max+=pad;}
  return { min, max };
}
function scaleY(value:number, d:{min:number;max:number}, y:number, h:number,config?:ChartAxisConfig):number {
  if(config?.type==='log'){const safe=Math.max(d.min,value);const lo=Math.log(d.min),hi=Math.log(d.max);return y+h-((Math.log(safe)-lo)/(hi-lo||1))*h;}
  return y + h - ((value-d.min)/(d.max-d.min || 1))*h;
}
function formatAxisValue(value:number,config?:ChartAxisConfig):string{const fmt=config?.number_format;if(fmt==='0')return Math.round(value).toString();if(fmt==='0.00')return value.toFixed(2);if(fmt==='0.0%')return `${(value*100).toFixed(1)}%`;return Number(value.toPrecision(4)).toString();}
function text(x:number,y:number,value:string,fill:string,size=11,anchor:'start'|'middle'|'end'='middle',weight=400):string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value.slice(0,256))}</text>`;
}
function line(x1:number,y1:number,x2:number,y2:number,color:string,width=1,dash=''):string {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${width}"${dash?` stroke-dasharray="${dash}"`:''}/>`;
}
function rect(x:number,y:number,w:number,h:number,fill:string,stroke='none',rx=0,opacity=1):string {
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0,w).toFixed(1)}" height="${Math.max(0,h).toFixed(1)}" fill="${fill}" stroke="${stroke}" rx="${rx}" opacity="${opacity}"/>`;
}
function circle(cx:number,cy:number,r:number,fill:string,stroke='none'):string {
  return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(0,r).toFixed(1)}" fill="${fill}" stroke="${stroke}"/>`;
}
function path(d:string, stroke:string, width=2, fill='none', opacity=1, dashArray=''):string {
  return `<path d="${d}" stroke="${stroke}" stroke-width="${width}" fill="${fill}" opacity="${opacity}" stroke-linejoin="round" stroke-linecap="round"${dashArray?` stroke-dasharray="${dashArray}"`:''}/>`;
}

const CHART_PATTERN_DEFS = [
  '<pattern id="astraea-chart-pattern-0" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M-2 2L2-2M0 10L10 0M8 12L12 8" stroke="#111" stroke-width="1.5"/><path d="M2 12L12 2" stroke="#fff" stroke-width=".8"/></pattern>',
  '<pattern id="astraea-chart-pattern-1" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M8-2L12 2M0 0L10 10M-2 8L2 12" stroke="#111" stroke-width="1.5"/><path d="M-2 2L8 12" stroke="#fff" stroke-width=".8"/></pattern>',
  '<pattern id="astraea-chart-pattern-2" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 0L10 10M10 0L0 10" stroke="#111" stroke-width="1.25"/><path d="M0 5H10" stroke="#fff" stroke-width=".8"/></pattern>',
  '<pattern id="astraea-chart-pattern-3" width="10" height="8" patternUnits="userSpaceOnUse"><path d="M0 2H10M0 6H10" stroke="#111" stroke-width="1.3"/><path d="M0 4H10" stroke="#fff" stroke-width=".8"/></pattern>',
  '<pattern id="astraea-chart-pattern-4" width="8" height="10" patternUnits="userSpaceOnUse"><path d="M2 0V10M6 0V10" stroke="#111" stroke-width="1.3"/><path d="M4 0V10" stroke="#fff" stroke-width=".8"/></pattern>',
  '<pattern id="astraea-chart-pattern-5" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.3" fill="#111"/><circle cx="7.5" cy="7.5" r="1.3" fill="#fff"/></pattern>',
  '<pattern id="astraea-chart-pattern-6" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M6 0L12 6L6 12L0 6Z" fill="none" stroke="#111" stroke-width="1.2"/><path d="M6 3L9 6L6 9L3 6Z" fill="none" stroke="#fff" stroke-width=".8"/></pattern>',
  '<pattern id="astraea-chart-pattern-7" width="12" height="10" patternUnits="userSpaceOnUse"><path d="M0 7L3 3L6 7L9 3L12 7" fill="none" stroke="#111" stroke-width="1.4"/><path d="M0 9L3 5L6 9L9 5L12 9" fill="none" stroke="#fff" stroke-width=".8"/></pattern>',
].join('');

function patternFill(seriesIndex:number):string {
  const index=((Math.floor(seriesIndex)%CHART_PATTERN_DEFS.length)+CHART_PATTERN_DEFS.length)%CHART_PATTERN_DEFS.length;
  return `url(#astraea-chart-pattern-${index})`;
}

function patternedRect(x:number,y:number,w:number,h:number,color:string,seriesIndex:number,rx=0,opacity=1):string {
  return rect(x,y,w,h,color,'none',rx,opacity)+rect(x,y,w,h,patternFill(seriesIndex),'none',rx,opacity);
}

type LineMarker = 'circle' | 'square' | 'diamond' | 'triangle' | 'cross' | 'plus' | 'hexagon' | 'triangle-down';
interface LineSeriesEncoding { dashArray:string; marker:LineMarker; }
const LINE_DASH_PATTERNS = ['', '8 4', '2 4', '8 3 2 3', '14 4', '2 2', '7 2 1 2', '10 2 2 2 2 2'] as const;
const LINE_MARKERS:readonly LineMarker[] = ['circle','square','diamond','triangle','cross','plus','hexagon','triangle-down'];

function lineSeriesEncoding(seriesIndex:number):LineSeriesEncoding {
  const safeIndex=Math.max(0,Math.floor(seriesIndex));
  return {
    dashArray:LINE_DASH_PATTERNS[safeIndex%LINE_DASH_PATTERNS.length],
    marker:LINE_MARKERS[safeIndex%LINE_MARKERS.length],
  };
}

function lineSeriesMarker(x:number,y:number,fill:string,edge:string,marker:LineMarker,r=3.6):string {
  const left=(x-r).toFixed(1),right=(x+r).toFixed(1),top=(y-r).toFixed(1),bottom=(y+r).toFixed(1);
  const cx=x.toFixed(1),cy=y.toFixed(1),strokeWidth=1.25;
  switch(marker){
    case 'circle':return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${fill}" stroke="${edge}" stroke-width="${strokeWidth}"/>`;
    case 'square':return `<rect x="${left}" y="${top}" width="${(r*2).toFixed(1)}" height="${(r*2).toFixed(1)}" fill="${fill}" stroke="${edge}" stroke-width="${strokeWidth}"/>`;
    case 'diamond':return `<path d="M ${cx} ${top} L ${right} ${cy} L ${cx} ${bottom} L ${left} ${cy} Z" fill="${fill}" stroke="${edge}" stroke-width="${strokeWidth}"/>`;
    case 'triangle':return `<path d="M ${cx} ${top} L ${right} ${bottom} L ${left} ${bottom} Z" fill="${fill}" stroke="${edge}" stroke-width="${strokeWidth}"/>`;
    case 'triangle-down':return `<path d="M ${left} ${top} L ${right} ${top} L ${cx} ${bottom} Z" fill="${fill}" stroke="${edge}" stroke-width="${strokeWidth}"/>`;
    case 'cross':return `<path d="M ${left} ${top} L ${right} ${bottom} M ${right} ${top} L ${left} ${bottom}" fill="none" stroke="${fill}" stroke-width="2.1" stroke-linecap="round"/>`;
    case 'plus':return `<path d="M ${cx} ${top} L ${cx} ${bottom} M ${left} ${cy} L ${right} ${cy}" fill="none" stroke="${fill}" stroke-width="2.1" stroke-linecap="round"/>`;
    case 'hexagon':return `<path d="M ${(x-r*.5).toFixed(1)} ${top} L ${(x+r*.5).toFixed(1)} ${top} L ${right} ${cy} L ${(x+r*.5).toFixed(1)} ${bottom} L ${(x-r*.5).toFixed(1)} ${bottom} L ${left} ${cy} Z" fill="${fill}" stroke="${edge}" stroke-width="${strokeWidth}"/>`;
  }
}

function quantile(values:number[], q:number):number {
  const sorted=[...values].sort((a,b)=>a-b); if(!sorted.length) return 0;
  const pos=(sorted.length-1)*q, base=Math.floor(pos), rest=pos-base;
  return sorted[base]+(sorted[base+1]!==undefined?rest*(sorted[base+1]-sorted[base]):0);
}

function axes(chart:ChartObject, p:ChartPalette, width:number, height:number, yDomain:{min:number;max:number}, secondary:{min:number;max:number}):string {
  const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom;
  let svg='';
  if(chart.show_gridlines!==false){ for(let i=0;i<=5;i++){ const gy=y+h*i/5; svg+=line(x,gy,x+w,gy,p.grid,1,'4 5'); } }
  svg+=line(x,y+h,x+w,y+h,p.axis,1.2)+line(x,y,x,y+h,p.axis,1.2);
  for(let i=0;i<=5;i++){ const value=yDomain.max-(yDomain.max-yDomain.min)*i/5; svg+=text(x-10,y+h*i/5+4,formatAxisValue(value,chart.y_axis),p.text,10,'end'); }
  if(chart.series.some(s=>s.secondary_axis)){ svg+=line(x+w,y,x+w,y+h,p.axis,1.2); for(let i=0;i<=5;i++){ const value=secondary.max-(secondary.max-secondary.min)*i/5; svg+=text(x+w+10,y+h*i/5+4,formatAxisValue(value,chart.secondary_y_axis),p.text,10,'start'); } }
  const cats=chart.categories; const step=Math.max(1,Math.ceil(cats.length/12));
  cats.forEach((cat,index)=>{ if(index%step) return; const cx=x+(index+.5)*w/Math.max(1,cats.length); svg+=text(cx,y+h+20,cat,p.text,10); });
  if(chart.x_axis_title) svg+=text(x+w/2,height-18,chart.x_axis_title,p.text,12);
  if(chart.y_axis_title) svg+=`<text transform="translate(18 ${(y+h/2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="12" fill="${p.text}">${escapeXml(chart.y_axis_title)}</text>`;
  if(chart.secondary_y_axis_title) svg+=`<text transform="translate(${(width-16).toFixed(1)} ${(y+h/2).toFixed(1)}) rotate(90)" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="12" fill="${p.text}">${escapeXml(chart.secondary_y_axis_title)}</text>`;
  return svg;
}

function columnLike(chart:ChartObject,p:ChartPalette,width:number,height:number,horizontal=false):string {
  const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom;
  const primary=domain(allValues(chart.series,false),chart.y_axis); const secondary=domain(allValues(chart.series,true),chart.secondary_y_axis);
  let svg=axes(chart,p,width,height,primary,secondary);
  const categories=Math.max(1,chart.categories.length), seriesCount=Math.max(1,chart.series.length);
  if(horizontal){
    const vals=allValues(chart.series); const d=domain(vals,chart.y_axis); const zeroX=x+((0-d.min)/(d.max-d.min))*w;
    chart.series.forEach((s,si)=>s.values.forEach((v,i)=>{ const band=h/categories, bh=Math.max(2,band*.72/seriesCount); const yy=y+i*band+si*bh+band*.14; const vx=x+((v-d.min)/(d.max-d.min))*w; svg+=patternedRect(Math.min(zeroX,vx),yy,Math.abs(vx-zeroX),bh,pointColor(s,si,i,'#3b82f6'),si,2,pointOpacity(s,si,i)); if(chart.show_data_labels) svg+=text(v>=0?vx+5:vx-5,yy+bh*.8,String(v),p.text,9,v>=0?'start':'end'); }));
    return svg;
  }
  const group=w/categories; const bar=Math.max(2,Math.min(42,group*.72/seriesCount));
  chart.series.forEach((s,si)=>{ const d=s.secondary_axis?secondary:primary; const zero=scaleY(0,d,y,h,s.secondary_axis?chart.secondary_y_axis:chart.y_axis); s.values.forEach((v,i)=>{ const yy=scaleY(v,d,y,h,s.secondary_axis?chart.secondary_y_axis:chart.y_axis); const xx=x+i*group+(group-bar*seriesCount)/2+si*bar; svg+=patternedRect(xx,Math.min(zero,yy),bar*.88,Math.abs(zero-yy),pointColor(s,si,i,'#3b82f6'),si,2,pointOpacity(s,si,i)); if(chart.show_data_labels) svg+=text(xx+bar*.44,yy-4,String(v),p.text,9); }); });
  return svg;
}

function lineArea(chart:ChartObject,p:ChartPalette,width:number,height:number,area=false,seriesIndexes:readonly number[]=chart.series.map((_,index)=>index)):string {
  const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom;
  const primary=domain(allValues(chart.series,false),chart.y_axis); const secondary=domain(allValues(chart.series,true),chart.secondary_y_axis); let svg=axes(chart,p,width,height,primary,secondary);
  chart.series.forEach((s,si)=>{ const d=s.secondary_axis?secondary:primary; const n=Math.max(1,s.values.length-1); const pts=s.values.map((v,i)=>[x+i*w/n,scaleY(v,d,y,h,s.secondary_axis?chart.secondary_y_axis:chart.y_axis)] as const); const pd=pts.map((pt,i)=>`${i?'L':'M'} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' '); const color=safeColor(s.color,'#3b82f6'); const encoding=lineSeriesEncoding(seriesIndexes[si]??si); const markerEvery=Math.max(1,Math.ceil(pts.length/128)); if(area&&pts.length){ const base=scaleY(0,d,y,h,s.secondary_axis?chart.secondary_y_axis:chart.y_axis); svg+=path(`${pd} L ${pts[pts.length-1][0].toFixed(1)} ${base.toFixed(1)} L ${pts[0][0].toFixed(1)} ${base.toFixed(1)} Z`,color,1,color,.18); } svg+=path(pd,color,2.3,'none',1,encoding.dashArray); pts.forEach((pt,i)=>{ if(i%markerEvery===0||i===pts.length-1)svg+=lineSeriesMarker(pt[0],pt[1],pointColor(s,si,i,color),p.bg,encoding.marker); if(chart.show_data_labels) svg+=text(pt[0],pt[1]-7,String(s.values[i]),p.text,9); });
    const tr=chart.trendlines?.find(t=>t.seriesIndex===si); if(tr){ const tv=calculateChartTrendline(s,tr); const td=tv.map((v,i)=>`${i?'L':'M'} ${(x+i*w/Math.max(1,tv.length-1)).toFixed(1)} ${scaleY(v,d,y,h,s.secondary_axis?chart.secondary_y_axis:chart.y_axis).toFixed(1)}`).join(' '); svg+=path(td,safeColor(tr.color,'#f59e0b'),1.5,'none',.9); }
    const err=chart.error_bars?.find(e=>e.seriesIndex===si); if(err){ const ev=calculateChartErrorBars(s,err); pts.forEach((pt,i)=>{ const top=scaleY(s.values[i]+ev[i],d,y,h,s.secondary_axis?chart.secondary_y_axis:chart.y_axis), bottom=scaleY(s.values[i]-ev[i],d,y,h,s.secondary_axis?chart.secondary_y_axis:chart.y_axis); svg+=line(pt[0],top,pt[0],bottom,color,1)+line(pt[0]-4,top,pt[0]+4,top,color,1)+line(pt[0]-4,bottom,pt[0]+4,bottom,color,1); }); }
  }); return svg;
}

function pie(chart:ChartObject,p:ChartPalette,width:number,height:number,donut=false):string {
  const s=chart.series[0]; if(!s) return ''; const vals=s.values.map(v=>Math.max(0,v)); const total=vals.reduce((a,b)=>a+b,0)||1; const cx=width/2,cy=(PAD.top+height-PAD.bottom)/2,r=Math.min(width,height)*.29; let start=-Math.PI/2,svg='';
  vals.forEach((v,i)=>{ const angle=2*Math.PI*v/total,end=start+angle,x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start),x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end),large=angle>Math.PI?1:0,color=safeColor(chart.series[i]?.color,safeColor(s.color,['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899'][i%5])),d=`M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`; svg+=`<path d="${d}" fill="${color}"/><path d="${d}" fill="${patternFill(i)}"/>`; if(chart.show_data_labels&&v>0){ const mid=start+angle/2; svg+=text(cx+r*.68*Math.cos(mid),cy+r*.68*Math.sin(mid)+4,`${Math.round(v/total*100)}%`,p.text,10); } start=end; });
  if(donut) svg+=circle(cx,cy,r*.52,p.bg); return svg;
}

function scatterBubble(chart:ChartObject,p:ChartPalette,width:number,height:number,bubble=false):string {
  const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom; const xs=chart.series.flatMap(s=>s.x_values||s.values.map((_,i)=>i)); const ys=chart.series.flatMap(s=>s.values); const xd=domain(xs),yd=domain(ys); let svg=axes({...chart,categories:[]},p,width,height,yd,domain([]));
  chart.series.forEach((s,si)=>{ const sx=s.x_values||s.values.map((_,i)=>i); const maxBubble=Math.max(...(s.bubble_sizes||[1]),1); s.values.forEach((v,i)=>{ const px=x+(finite(sx[i])-xd.min)/(xd.max-xd.min||1)*w, py=scaleY(v,yd,y,h), rr=bubble?3+18*Math.sqrt(Math.max(0,s.bubble_sizes?.[i]||1)/maxBubble):4; svg+=circle(px,py,rr,pointColor(s,si,i,'#3b82f6'),p.bg); }); }); return svg;
}

function histogram(chart:ChartObject,p:ChartPalette,width:number,height:number,pareto=false):string {
  const vals=(chart.series[0]?.values||[]).filter(Number.isFinite); if(!vals.length) return ''; const min=Math.min(...vals),max=Math.max(...vals); const bins=Math.max(3,Math.min(20,Math.ceil(Math.sqrt(vals.length)))); const span=max-min||1,counts=Array(bins).fill(0) as number[]; vals.forEach(v=>counts[Math.min(bins-1,Math.floor((v-min)/span*bins))]++); const labels=counts.map((_,i)=>`${Number((min+i*span/bins).toPrecision(3))}`); const temp:ChartObject={...chart,categories:labels,series:[{name:'Frequency',values:counts,color:chart.series[0]?.color||'#3b82f6'}],chart_type:'column'}; let svg=columnLike(temp,p,width,height); if(pareto){ const total=counts.reduce((a,b)=>a+b,0)||1; let sum=0; const cumulative=counts.map(v=>(sum+=v)/total*Math.max(...counts,1)); svg+=lineArea({...temp,show_gridlines:false,series:[{name:'Cumulative',values:cumulative,color:'#f59e0b'}]},p,width,height,false); } return svg;
}

function boxWhisker(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom; const d=domain(allValues(chart.series),chart.y_axis); let svg=axes(chart,p,width,height,d,domain([])); const band=w/Math.max(1,chart.series.length);
  chart.series.forEach((s,i)=>{ const vals=s.values.filter(Number.isFinite); if(!vals.length)return; const q1=quantile(vals,.25),med=quantile(vals,.5),q3=quantile(vals,.75),min=Math.min(...vals),max=Math.max(...vals),cx=x+(i+.5)*band,bw=Math.min(60,band*.45),color=safeColor(s.color,'#3b82f6'); const yq1=scaleY(q1,d,y,h),yq3=scaleY(q3,d,y,h); svg+=line(cx,scaleY(min,d,y,h),cx,scaleY(max,d,y,h),color,1.5)+rect(cx-bw/2,Math.min(yq1,yq3),bw,Math.abs(yq1-yq3),p.surface,color,2)+line(cx-bw/2,scaleY(med,d,y,h),cx+bw/2,scaleY(med,d,y,h),color,2)+line(cx-bw/3,scaleY(min,d,y,h),cx+bw/3,scaleY(min,d,y,h),color,1.5)+line(cx-bw/3,scaleY(max,d,y,h),cx+bw/3,scaleY(max,d,y,h),color,1.5); }); return svg;
}

function waterfall(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  const vals=chart.series[0]?.values||[]; let running=0; const starts:number[]=[],ends:number[]=[]; vals.forEach(v=>{starts.push(running); running+=v; ends.push(running);}); const d=domain([...starts,...ends],chart.y_axis); const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom; let svg=axes(chart,p,width,height,d,domain([])); const band=w/Math.max(1,vals.length); vals.forEach((v,i)=>{ const a=scaleY(starts[i],d,y,h),b=scaleY(ends[i],d,y,h),color=v>=0?'#10b981':'#ef4444'; svg+=rect(x+i*band+band*.18,Math.min(a,b),band*.64,Math.max(1,Math.abs(a-b)),color,'none',2); if(i<vals.length-1) svg+=line(x+(i+1)*band-band*.18,b,x+(i+1)*band+band*.18,b,p.axis,1,'3 3'); }); return svg;
}

function funnel(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  const vals=chart.series[0]?.values||[]; const max=Math.max(...vals.map(Math.abs),1),cx=width/2,top=PAD.top,available=height-PAD.top-PAD.bottom,step=available/Math.max(1,vals.length); let svg=''; vals.forEach((v,i)=>{ const w1=(Math.abs(v)/max)*(width-PAD.left-PAD.right)*.8, next=Math.abs(vals[i+1]??v)/max*(width-PAD.left-PAD.right)*.8, y=top+i*step,color=safeColor(chart.series[i]?.color,['#3b82f6','#10b981','#f59e0b','#8b5cf6'][i%4]); svg+=`<path d="M ${(cx-w1/2).toFixed(1)} ${y.toFixed(1)} L ${(cx+w1/2).toFixed(1)} ${y.toFixed(1)} L ${(cx+next/2).toFixed(1)} ${(y+step*.9).toFixed(1)} L ${(cx-next/2).toFixed(1)} ${(y+step*.9).toFixed(1)} Z" fill="${color}"/>`; svg+=text(cx,y+step*.5+4,`${chart.categories[i]||i+1}: ${v}`,p.text,10); }); return svg;
}

function maxAbsoluteSeriesValue(series:readonly ChartSeries[]):number {
  let max=1;
  for(const item of series)for(const value of item.values)if(Number.isFinite(value))max=Math.max(max,Math.abs(value));
  return max;
}

function radar(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  const cx=width/2,cy=(PAD.top+height-PAD.bottom)/2,r=Math.min(width,height)*.3,n=Math.max(3,chart.categories.length),max=maxAbsoluteSeriesValue(chart.series); let svg=''; for(let ring=1;ring<=4;ring++){ const pts=Array.from({length:n},(_,i)=>{const a=-Math.PI/2+2*Math.PI*i/n;return `${(cx+r*ring/4*Math.cos(a)).toFixed(1)},${(cy+r*ring/4*Math.sin(a)).toFixed(1)}`}).join(' '); svg+=`<polygon points="${pts}" fill="none" stroke="${p.grid}"/>`; } chart.categories.forEach((c,i)=>{const a=-Math.PI/2+2*Math.PI*i/n; svg+=line(cx,cy,cx+r*Math.cos(a),cy+r*Math.sin(a),p.grid,1)+text(cx+(r+20)*Math.cos(a),cy+(r+20)*Math.sin(a)+4,c,p.text,9);}); chart.series.forEach(s=>{const pts=Array.from({length:n},(_,i)=>{const a=-Math.PI/2+2*Math.PI*i/n,rv=r*Math.abs(s.values[i]||0)/max;return `${(cx+rv*Math.cos(a)).toFixed(1)},${(cy+rv*Math.sin(a)).toFixed(1)}`}).join(' '); const color=safeColor(s.color,'#3b82f6'); svg+=`<polygon points="${pts}" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="2"/>`;}); return svg;
}

function stock(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  if(chart.series.length<4) return text(width/2,height/2,'Stock chart requires Open / High / Low / Close series',p.text,13); const [open,high,low,close]=chart.series; const vals=[...open.values,...high.values,...low.values,...close.values]; const d=domain(vals); const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom; let svg=axes(chart,p,width,height,d,domain([])); const n=Math.min(open.values.length,high.values.length,low.values.length,close.values.length),band=w/Math.max(1,n); for(let i=0;i<n;i++){const cx=x+(i+.5)*band,yo=scaleY(open.values[i],d,y,h),yh=scaleY(high.values[i],d,y,h),yl=scaleY(low.values[i],d,y,h),yc=scaleY(close.values[i],d,y,h),color=close.values[i]>=open.values[i]?'#10b981':'#ef4444'; svg+=line(cx,yh,cx,yl,color,1.3)+rect(cx-band*.18,Math.min(yo,yc),band*.36,Math.max(1,Math.abs(yo-yc)),color,color,1); } return svg;
}

function surface(chart:ChartObject,_p:ChartPalette,width:number,height:number):string {
  const rows=chart.series, cols=Math.max(...rows.map(s=>s.values.length),0); if(!rows.length||!cols)return ''; let min=Infinity,max=-Infinity; for(const series of rows){for(const value of series.values){if(!Number.isFinite(value))continue;min=Math.min(min,value);max=Math.max(max,value);}} if(min===Infinity)return ''; const span=max-min||1; const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom,cw=w/cols,rh=h/rows.length; let svg=''; rows.forEach((s,ri)=>s.values.forEach((v,ci)=>{const t=clamp((v-min)/span,0,1),red=Math.round(30+210*t),blue=Math.round(220-170*t),green=Math.round(90+100*(1-Math.abs(t-.5)*2)); svg+=rect(x+ci*cw,y+ri*rh,cw+.5,rh+.5,`rgb(${red},${green},${blue})`); })); return svg;
}


function sparkline(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  const series=chart.series[0]; if(!series||series.values.length<2)return text(width/2,height/2,'Sparkline requires at least two values',p.text,12);
  const vals=series.values.filter(Number.isFinite); const d=domain(vals); const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom;
  const pts=vals.map((v,i)=>[x+i*w/Math.max(1,vals.length-1),scaleY(v,d,y,h)] as const);
  return path(pts.map((pt,i)=>`${i?'L':'M'} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' '),safeColor(series.color,'#3b82f6'),2.4);
}

function treemap(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  const series=chart.series[0]; if(!series)return ''; const vals=series.values.map(v=>Math.max(0,v)); const total=vals.reduce((a,b)=>a+b,0)||1;
  const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom; let cursor=x,svg='';
  vals.forEach((value,index)=>{ const ww=w*value/total; const fill=pointColor(series,0,index,['#3b82f6','#10b981','#f59e0b','#8b5cf6'][index%4]); svg+=rect(cursor,y,ww,h,fill,p.bg,2,.92); if(ww>46)svg+=text(cursor+ww/2,y+h/2,`${chart.categories[index]??index+1}: ${value}`,p.text,10); cursor+=ww; });
  return svg;
}

function sunburst(chart:ChartObject,_p:ChartPalette,width:number,height:number):string {
  const series=chart.series[0]; if(!series)return ''; const vals=series.values.map(v=>Math.max(0,v)); const total=vals.reduce((a,b)=>a+b,0)||1; const cx=width/2,cy=(PAD.top+height-PAD.bottom)/2,r=Math.min(width,height)*.29; let start=-Math.PI/2,svg='';
  vals.forEach((value,index)=>{ const angle=2*Math.PI*value/total,end=start+angle,x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start),x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end),large=angle>Math.PI?1:0,inner=r*.42,ix2=cx+inner*Math.cos(start),iy2=cy+inner*Math.sin(start),ix1=cx+inner*Math.cos(end),iy1=cy+inner*Math.sin(end),fill=pointColor(series,0,index,['#3b82f6','#10b981','#f59e0b','#8b5cf6'][index%4]); svg+=`<path d="M ${ix2.toFixed(1)} ${iy2.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${ix1.toFixed(1)} ${iy1.toFixed(1)} A ${inner} ${inner} 0 ${large} 0 ${ix2.toFixed(1)} ${iy2.toFixed(1)} Z" fill="${fill}"/>`; start=end; });
  return svg;
}

function decorations(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  const x=PAD.left,y=PAD.top,w=width-PAD.left-PAD.right,h=height-PAD.top-PAD.bottom; const primary=domain(allValues(chart.series,false),chart.y_axis); const secondary=domain(allValues(chart.series,true),chart.secondary_y_axis); let svg='';
  for(const ref of chart.reference_lines??[]){ const d=ref.axis==='secondary-y'?secondary:primary; if(ref.axis==='x'){ const xx=x+clamp(ref.value,0,1)*w; svg+=line(xx,y,xx,y+h,safeColor(ref.color,'#f59e0b'),1.2,'5 4'); if(ref.label)svg+=text(xx+4,y+14,ref.label,p.text,9,'start'); } else { const yy=scaleY(ref.value,d,y,h,ref.axis==='secondary-y'?chart.secondary_y_axis:chart.y_axis); svg+=line(x,yy,x+w,yy,safeColor(ref.color,'#f59e0b'),1.2,'5 4'); if(ref.label)svg+=text(x+w-4,yy-4,ref.label,p.text,9,'end'); } }
  for(const ann of chart.annotations??[]){ const idx=ann.category_index??0; const xx=ann.x!==undefined?x+clamp(ann.x,0,1)*w:x+(idx+.5)*w/Math.max(1,chart.categories.length); const yy=ann.y!==undefined?y+clamp(ann.y,0,1)*h:y+16; svg+=text(xx,yy,ann.text,safeColor(ann.color,p.text),10); }
  return svg;
}

function combo(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  let svg=''; const grouped=new Map<ChartType,Array<{series:ChartSeries;index:number}>>(); chart.series.forEach((series,index)=>{const type=series.chart_type&&series.chart_type!=='combo'?series.chart_type:'column'; grouped.set(type,[...(grouped.get(type)||[]),{series,index}]);});
  for(const [type,entries] of grouped){ const series=entries.map(entry=>entry.series); const partial={...chart,chart_type:type,series,show_gridlines:svg?false:chart.show_gridlines} as ChartObject; if(type==='line'||type==='area') svg+=lineArea(partial,p,width,height,type==='area',entries.map(entry=>entry.index)); else if(type==='scatter'||type==='bubble') svg+=scatterBubble(partial,p,width,height,type==='bubble'); else svg+=columnLike(partial,p,width,height,type==='bar'); }
  return svg;
}

function legend(chart:ChartObject,p:ChartPalette,width:number,height:number):string {
  if(chart.legend_position==='none'||!chart.series.length)return ''; const items=chart.series.slice(0,12); const y=chart.legend_position==='top'?48:height-22; const step=Math.min(140,(width-80)/Math.max(1,items.length)); let svg=''; items.forEach((s,i)=>{const xx=40+i*step,seriesType=chart.chart_type==='combo'?(s.chart_type||'column'):chart.chart_type,color=safeColor(s.color,'#3b82f6'); if(seriesType==='line'||seriesType==='area'){const encoding=lineSeriesEncoding(i);svg+=line(xx,y-4,xx+16,y-4,color,2.2,encoding.dashArray)+lineSeriesMarker(xx+8,y-4,color,p.bg,encoding.marker,3.2);}else svg+=patternedRect(xx,y-9,10,10,color,i,2); svg+=text(xx+20,y,s.name,p.text,10,'start');}); return svg;
}

export function buildGridChartSvg(input:ChartObject,width=DEFAULT_WIDTH,height=DEFAULT_HEIGHT):string {
  const chart=normalizeCanonicalChart(input);
  // **`W-450`, die Wurzel** ✗✓✓: der rohe Zeichner befragt den **einen** Wächter — **vor** jedem
  // Datenpfad, an dem eine Zahl in eine Zeichenkette gerät. Bis hierher war er fail-open: jeder
  // **direkte** Aufruf schrieb die Daten auch dann, wenn die Leinwand (`ChartRenderer.tsx:54`) das
  // Diagramm gesperrt zeigte. Ein Rückhalt wird **benannt** abgewiesen — kein SVG, keine Zahlen, kein
  // stiller Rasterfall. Die Entscheidung steht in `chartEngine.ts` (`chartSourceWithholdsData`,
  // `chartModel.ts:51`); hier wird sie **nur befragt**, nicht nachgebaut.
  assertChartSourceRenderable(chart);
  const p=palette(chart); const safeW=clamp(Math.floor(width),320,4096),safeH=clamp(Math.floor(height),220,2160); let body='';
  switch(chart.chart_type){
    case 'column': body=columnLike(chart,p,safeW,safeH); break; case 'bar': body=columnLike(chart,p,safeW,safeH,true); break;
    case 'line': body=lineArea(chart,p,safeW,safeH); break; case 'area': body=lineArea(chart,p,safeW,safeH,true); break;
    case 'pie': body=pie(chart,p,safeW,safeH); break; case 'donut': body=pie(chart,p,safeW,safeH,true); break;
    case 'scatter': body=scatterBubble(chart,p,safeW,safeH); break; case 'bubble': body=scatterBubble(chart,p,safeW,safeH,true); break;
    case 'histogram': body=histogram(chart,p,safeW,safeH); break; case 'pareto': body=histogram(chart,p,safeW,safeH,true); break;
    case 'box-whisker': body=boxWhisker(chart,p,safeW,safeH); break; case 'waterfall': body=waterfall(chart,p,safeW,safeH); break;
    case 'funnel': body=funnel(chart,p,safeW,safeH); break; case 'radar': body=radar(chart,p,safeW,safeH); break;
    case 'stock': body=stock(chart,p,safeW,safeH); break; case 'surface': body=surface(chart,p,safeW,safeH); break;
    case 'treemap': body=treemap(chart,p,safeW,safeH); break; case 'sunburst': body=sunburst(chart,p,safeW,safeH); break; case 'sparkline': body=sparkline(chart,p,safeW,safeH); break;
    case 'combo': body=combo(chart,p,safeW,safeH); break;
  }
  const title=text(safeW/2,28,chart.title,p.text,16,'middle',700); const lg=legend(chart,p,safeW,safeH); const deco=decorations(chart,p,safeW,safeH);
  const description=escapeXml(chart.alt_summary||`${chart.title}. ${chart.chart_type} chart.`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeW}" height="${safeH}" viewBox="0 0 ${safeW} ${safeH}" role="img" aria-label="${escapeXml(chart.title)}"><title>${escapeXml(chart.title)}</title><desc>${description}</desc><defs>${CHART_PATTERN_DEFS}</defs>${rect(0,0,safeW,safeH,p.bg)}${title}${body}${deco}${lg}</svg>`;
}

export function gridChartSvgDataUrl(chart:ChartObject,width=DEFAULT_WIDTH,height=DEFAULT_HEIGHT):string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildGridChartSvg(chart,width,height))}`;
}
