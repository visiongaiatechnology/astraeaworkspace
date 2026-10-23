// STATUS: PLATIN — BATCH-INSIGHT-6: interactive slicers over the visible records.
//
// MEASURED FACTS before this batch: `reports/insightReportEngine.createSlicer` existed and was imported
// by no component, `InsightSlicer` was a persisted schema object that nothing ever wrote, and the only
// interactive filter in the whole app was the region segment bar. This module is the pure half: the
// option list of a slicer, the record scope a selection produces, and the selection toggle.
import type { InsightRecord, InsightScalar, InsightSlicer } from '../domain/types';
import { InsightError } from '../core/insightCore';

export const INSIGHT_SLICER_LIMITS = { maxOptions:512, maxSlicers:16 } as const;

/** The distinct values of a slicer field, bounded, with the number of values that did not fit. */
export function slicerOptions(records:readonly InsightRecord[],field:string,limit:number=INSIGHT_SLICER_LIMITS.maxOptions):{options:InsightScalar[];omitted:number}{
  const seen=new Map<string,InsightScalar>();
  for(const row of records){
    const value=row[field];
    if(value===undefined)continue;
    const key=JSON.stringify(value);
    if(!seen.has(key))seen.set(key,value as InsightScalar);
  }
  const sorted=[...seen.values()].sort((left,right)=>String(left).localeCompare(String(right),'en',{numeric:true,sensitivity:'base'}));
  return{options:sorted.slice(0,limit),omitted:Math.max(0,sorted.length-limit)};
}

function fieldValue(row:InsightRecord,field:string):InsightScalar{const value=row[field];return value===undefined?null:(value as InsightScalar);}

/**
 * Apply every enabled slicer to the records. An empty selection means "no restriction" (the slicer is
 * visible but does not filter), which is what a user expects from an untouched slicer. The result is a
 * copy, so the document records are never mutated.
 */
export function applyInsightSlicers(records:readonly InsightRecord[],slicers:readonly InsightSlicer[]):InsightRecord[]{
  const active=slicers.filter((slicer)=>slicer.selection.length>0);
  if(!active.length)return records.map((row)=>({...row}));
  return records.filter((row)=>active.every((slicer)=>{
    const value=fieldValue(row,slicer.field);
    if(slicer.kind==='date-range'){
      const [from,to]=slicer.selection;
      if(from===null||from===undefined||to===null||to===undefined)return true;
      const time=Date.parse(String(value));
      const start=Date.parse(String(from));
      const end=Date.parse(String(to));
      if(!Number.isFinite(time)||!Number.isFinite(start)||!Number.isFinite(end))return false;
      return time>=start&&time<=end;
    }
    return slicer.selection.some((entry)=>entry===value);
  })).map((row)=>({...row}));
}

/** Toggle one value of a list slicer, keeping the document order of the selection bounded. */
export function toggleSlicerValue(slicer:InsightSlicer,value:InsightScalar):InsightScalar[]{
  const present=slicer.selection.some((entry)=>entry===value);
  const next=present?slicer.selection.filter((entry)=>entry!==value):[...slicer.selection,value];
  if(next.length>INSIGHT_SLICER_LIMITS.maxOptions)throw new InsightError('insight-slicer-selection-limit');
  return next;
}

/** Which fields a slicer may target: the dimension columns of the documented canonical dataset. */
export function slicerFieldAllowed(field:string):boolean{
  return field==='region'||field==='product'||field==='quarter';
}
