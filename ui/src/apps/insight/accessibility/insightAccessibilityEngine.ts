// STATUS: DIAMANT VGT SUPREME — Insight accessibility semantics audit
import type { InsightDocumentModel } from '../domain/types';
export interface InsightAccessibilityFinding{id:string;severity:'error'|'warning';code:string;objectId:string;message:string;}
export function auditInsightAccessibility(model:InsightDocumentModel):InsightAccessibilityFinding[]{const out:InsightAccessibilityFinding[]=[];for(const page of model.report.pages){if(!page.name.trim())out.push({id:`page-${page.id}`,severity:'error',code:'page-name-missing',objectId:page.id,message:'Report page requires an accessible name.'});for(const v of page.visuals){if(!v.title.trim())out.push({id:`visual-${v.id}`,severity:'error',code:'visual-title-missing',objectId:v.id,message:'Visual requires an accessible title.'});if(v.kind==='map'&&!v.tooltipFields?.length)out.push({id:`map-${v.id}`,severity:'warning',code:'map-text-alternative-missing',objectId:v.id,message:'Map should expose textual tooltip fields.'});}for(const o of page.objects){if(o.kind==='image'&&!o.altText.trim())out.push({id:`img-${o.id}`,severity:'error',code:'image-alt-missing',objectId:o.id,message:'Image requires alternative text.'});if(o.kind==='button'&&!o.label.trim())out.push({id:`btn-${o.id}`,severity:'error',code:'button-name-missing',objectId:o.id,message:'Button requires accessible name.'});}}return out;}
export interface InsightAccessibilitySummary { datasetName:string; pageName:string|null; visibleVisualCount:number; activeFilterCount:number; }
/**
 * The ONE definition of the screen-reader counts. The view and `insightScreenReaderSummary` both
 * call this, so the announced filter count cannot drift from the rendered one.
 * @param extraActiveFilters counts UI-scope filters that are not part of the document (e.g. cross-filter).
 */
export function summarizeInsightAccessibility(model:InsightDocumentModel,extraActiveFilters=0):InsightAccessibilitySummary{
  const page=model.report.pages.find(p=>p.id===model.report.activePageId);
  if(!page)return{datasetName:model.datasetName,pageName:null,visibleVisualCount:0,activeFilterCount:extraActiveFilters};
  return{datasetName:model.datasetName,pageName:page.name,visibleVisualCount:page.visuals.filter(v=>v.visible).length,activeFilterCount:page.filters.filter(f=>f.enabled).length+model.report.reportFilters.filter(f=>f.enabled).length+extraActiveFilters};
}
export function insightScreenReaderSummary(model:InsightDocumentModel):string{const summary=summarizeInsightAccessibility(model);if(summary.pageName===null)return'Insight report has no active page.';return`${summary.datasetName}. Page ${summary.pageName}. ${summary.visibleVisualCount} visible visuals, ${summary.activeFilterCount} active filters.`;}
