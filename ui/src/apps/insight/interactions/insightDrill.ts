// STATUS: PLATIN — BATCH-INSIGHT-6: drilldown through the documented dimensions (or a declared hierarchy).
//
// MEASURED FACTS before this batch: `visuals/insightVisualEngine.drillVisual` and
// `visuals/insightVisualEngine.crossFilterFromPoint` were imported by no component, and no control could
// change what a visual aggregates. This module makes the drill a real, bounded scope change: the visual's
// category column follows the drill level, and the chart then aggregates by that column.
import type { InsightDocumentModel, InsightVisual } from '../domain/types';
import { InsightError } from '../core/insightCore';
import { drillVisual } from '../visuals/insightVisualEngine';

/** The documented dimension order of the canonical dataset, used when a visual declares no hierarchy. */
export const INSIGHT_DRILL_DIMENSIONS = ['region', 'product', 'quarter'] as const;

/**
 * The ordered columns a drill walks. A visual that declares a hierarchyId whose hierarchy exists in the
 * semantic model uses that hierarchy; otherwise the canonical dimension order applies. The list is never
 * empty, so a drill always has a bounded range.
 */
export function insightDrillLevels(model:InsightDocumentModel,visual:InsightVisual):string[]{
  const hierarchy=visual.hierarchyId?model.semanticModel.hierarchies.find((entry)=>entry.id===visual.hierarchyId):undefined;
  if(hierarchy){
    const columns=new Map(model.semanticModel.tables.flatMap((table)=>table.columns).map((column)=>[column.id,column.name]));
    const levels=hierarchy.levels.map((level)=>columns.get(level.columnId)).filter((name):name is string=>Boolean(name));
    if(levels.length>=2)return levels;
  }
  return [...INSIGHT_DRILL_DIMENSIONS];
}

export function drillInsightVisual(model:InsightDocumentModel,pageId:string,visualId:string,direction:'down'|'up'):InsightDocumentModel{
  const page=model.report.pages.find((entry)=>entry.id===pageId);
  if(!page)throw new InsightError('report-page-missing');
  const visual=page.visuals.find((entry)=>entry.id===visualId);
  if(!visual)throw new InsightError('report-visual-missing');
  const levels=insightDrillLevels(model,visual);
  const current=Math.max(0,Math.min(levels.length-1,visual.drillLevel??0));
  const next=direction==='down'?current+1:current-1;
  if(next<0||next>levels.length-1)throw new InsightError('insight-drill-limit');
  const drilled=drillVisual(visual,direction,levels.length);
  const category=levels[next];
  return{
    ...model,
    revision:model.revision+1,
    report:{...model.report,pages:model.report.pages.map((entry)=>entry.id===pageId?{
      ...entry,
      visuals:entry.visuals.map((candidate)=>candidate.id===visualId?{...drilled,encoding:{...candidate.encoding,category}}:candidate),
    }:entry)},
  };
}
