// STATUS: DIAMANT VGT SUPREME
// Canonical bridge from shared Chart Engine selections/drill semantics into Insight filters,
// and from an Insight visual + rows into the SHARED canonical chart object (one chart series for the
// whole workspace: Insight renders through shared/charts/ChartRenderer, never through its own SVG).

import type { ChartObject, ChartSourceState, ChartType } from '../../../shared/contracts/workspace';
import { normalizeCanonicalChart } from '../../../shared/charts/chartModel';
import { crossFilterFromPoint, drillVisual } from '../visuals/insightVisualEngine';
import type { AggregationFunction, InsightDocumentModel, InsightFilter, InsightRecord, InsightVisual } from '../domain/types';
import { InsightError, aggregateInsightScalars } from '../core/insightCore';
import { INSIGHT_NUMERIC_DATA_TYPES, canonicalColumnTypes } from '../connectors/insightImportCore';

export function chartSelectionToInsightFilters(
  chart:ChartObject,
  sourceVisual:InsightVisual,
  categoryField:string,
  targetVisualIds:readonly string[],
):InsightFilter[]{
  const normalized=normalizeCanonicalChart(chart);
  const filters:InsightFilter[]=[];
  for(const point of normalized.selected_points??[]){
    const value=normalized.categories[point.pointIndex];
    if(value===undefined)continue;
    filters.push(...crossFilterFromPoint(sourceVisual,categoryField,value,targetVisualIds));
    if(filters.length>=512)break;
  }
  return filters.slice(0,512);
}

export function chartDrillToInsightVisual(chart:ChartObject,visual:InsightVisual,hierarchyDepth:number):InsightVisual{
  const normalized=normalizeCanonicalChart(chart);
  if(normalized.drill_action?.kind!=='insight-drill')return visual;
  return drillVisual(visual,'down',Math.max(1,Math.min(128,Math.floor(hierarchyDepth))));
}

export function chartHighlightCategories(chart:ChartObject):ReadonlySet<string>{
  const normalized=normalizeCanonicalChart(chart);
  return new Set((normalized.selected_points??[]).map(point=>normalized.categories[point.pointIndex]).filter((value):value is string=>typeof value==='string').slice(0,4096));
}

/** One mapping from an Insight visual kind to the shared chart type. Kinds without a shared renderer are refused by name. */
const CHART_TYPE_BY_VISUAL_KIND:Readonly<Partial<Record<InsightVisual['kind'],ChartType>>> = {
  bar:'bar', column:'column', line:'line', area:'area', pie:'pie', donut:'donut', scatter:'scatter', bubble:'bubble',
  combo:'combo', waterfall:'waterfall', funnel:'funnel', treemap:'treemap', histogram:'histogram', sparkline:'sparkline', 'box-plot':'box-whisker',
};
export function insightChartTypeFor(kind:InsightVisual['kind']):ChartType{
  const chartType=CHART_TYPE_BY_VISUAL_KIND[kind];
  if(!chartType)throw new InsightError('insight-visual-kind-unsupported');
  return chartType;
}
/** The visual kinds the gallery may offer, in one list derived from the mapping above. */
export function supportedInsightVisualKinds():InsightVisual['kind'][]{
  return (Object.keys(CHART_TYPE_BY_VISUAL_KIND) as InsightVisual['kind'][]).sort();
}
/** The cache state the surface shows, mapped onto the shared chart source state (one table, no guessing). */
export function chartSourceStateFor(state:InsightDocumentModel['cache']['sourceState']):ChartSourceState{
  if(state==='fresh')return'current';
  if(state==='stale'||state==='partial')return'stale';
  if(state==='offline')return'frozen';
  return'broken';
}

/**
 * Build the shared canonical chart object from an Insight visual and the rows in scope. The categories
 * are the distinct values of the visual's category column and every series is aggregated with
 * `aggregateInsightScalars` — the same aggregation definition the query executor and the matrix use.
 * Only columns the document declares as numeric become a series, so a text column can never be summed.
 */
export function buildInsightChartObject(
  visual:InsightVisual,
  records:readonly InsightRecord[],
  context:{ documentId:string; cacheState:InsightDocumentModel['cache']['sourceState']; revision:number },
  model:InsightDocumentModel,
):ChartObject{
  const chartType=insightChartTypeFor(visual.kind);
  const categoryField=visual.encoding.category;
  if(!categoryField)throw new InsightError('insight-visual-category-missing');
  const declared=canonicalColumnTypes(model);
  const measureColumns=(visual.encoding.values??[]).filter((column)=>INSIGHT_NUMERIC_DATA_TYPES.has(declared[column]??'unknown'));
  if(!measureColumns.length)throw new InsightError('insight-visual-values-missing');
  const aggregation:AggregationFunction=visual.encoding.aggregation??'SUM';
  const categoryOf=(row:InsightRecord)=>String(row[categoryField as keyof InsightRecord]??'');
  const categories=[...new Set(records.map(categoryOf))].sort();
  const series=measureColumns.map(column=>({
    name:column,
    values:categories.map(category=>aggregateInsightScalars(
      records.filter(row=>categoryOf(row)===category).map(row=>row[column as keyof InsightRecord]),
      aggregation,
    )),
  }));
  const sourceState=chartSourceStateFor(context.cacheState);
  return normalizeCanonicalChart({
    id:visual.id,
    chart_type:chartType,
    title:visual.title,
    categories,
    series,
    x_axis_title:categoryField,
    y_axis_title:measureColumns.join(', '),
    legend_position:visual.format.legendPosition??(visual.format.showLegend===false?'none':'bottom'),
    show_data_labels:visual.format.showLabels??false,
    source:{ kind:'insight', documentId:context.documentId, live:true, state:sourceState, sourceVersion:context.revision },
    source_state:sourceState,
    selected_points:[],
    drill_action:{ kind:'insight-filter', target:categoryField },
  });
}

