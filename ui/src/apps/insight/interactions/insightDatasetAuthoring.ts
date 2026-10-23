// STATUS: PLATIN — BATCH-INSIGHT-3: starting an empty dashboard and authoring the first KPI card.
//
// MEASURED FACTS before this batch:
//  - There was no way to start an empty dataset: the only entry state was the seeded template
//    (`domain/types.ts` DEFAULT_INSIGHT_MODEL), and no component could create or edit a KPI card
//    (`components/InsightKpiCards.tsx` only rendered what the document already contained).
//  - `projectInsightKpis` could only model the four seeded ids, so a card created by a user could not
//    have been computed at all.
// This module keeps the two authoring actions pure and bounded, and the card it creates carries the
// measure it projects, so the projection can really compute it.
import { DEFAULT_INSIGHT_MODEL, type InsightDocumentModel, type InsightKpiMeasure } from '../domain/types';
import { InsightError, cleanText, normalizeInsightModel, stableInsightId } from '../core/insightCore';

export const INSIGHT_DATASET_LIMITS = { maxNameLength:256, maxKpis:64 } as const;

/** Category token drives the card icon; it is derived from the measure, never typed by the user. */
export const INSIGHT_KPI_CATEGORY: Readonly<Record<InsightKpiMeasure, string>> = {
  revenue:'Finance', margin:'Finance', activeUsers:'Topology', anomaly:'Security',
};

/**
 * A new, really empty dataset: no records, no KPI cards, one enabled local source, one query that reads
 * that source with an empty pipeline, one empty report page and the cache state `empty`. Every number the
 * user later sees must come from a real read of that source (an import, or a query over its rows).
 */
export function createEmptyInsightModel(name:string):InsightDocumentModel{
  const datasetName=cleanText(name,INSIGHT_DATASET_LIMITS.maxNameLength);
  const seed=structuredClone(DEFAULT_INSIGHT_MODEL);
  const sourceId=stableInsightId('src',`empty:${datasetName}`);
  const pageId=stableInsightId('page',`empty:${datasetName}:1`);
  const source={id:sourceId,name:datasetName,kind:'json' as const,canonicalUri:`vgt://insight/local/${sourceId}`,privacy:'private' as const,trust:'local-trusted' as const,enabled:true};
  return normalizeInsightModel({
    ...seed,
    revision:1,
    datasetName,
    records:[],
    kpis:[],
    querySteps:[],
    sources:[source],
    queries:[{id:stableInsightId('query',`empty:${datasetName}`),name:datasetName,sourceId,steps:[],parameters:{},reusable:true,folding:'disabled',version:1}],
    semanticModel:{tables:[],relationships:[],measures:[],kpis:[],hierarchies:[],rls:[],ols:[]},
    report:{pages:[{id:pageId,name:'Page 1',width:1280,height:720,visuals:[],objects:[],filters:[],slicers:[],layers:['Background','Visuals','Annotations']}],activePageId:pageId,reportFilters:[],bookmarks:[],theme:seed.report.theme,gridSize:seed.report.gridSize,snap:seed.report.snap},
    refresh:{mode:'manual'},
    cache:{enabled:true,quotaBytes:seed.cache.quotaBytes,usedBytes:0,sourceState:'empty',partitionKeys:[]},
    workspaceReferences:[],
    performance:[],
    audit:[],
  });
}

/**
 * Add a KPI card bound to a measure. The value is NOT stored: the card carries `measure` and the
 * projection computes value and comparison from the visible records on every render.
 */
export function addInsightKpi(model:InsightDocumentModel,input:{title:string;measure:InsightKpiMeasure}):InsightDocumentModel{
  const title=cleanText(input.title,INSIGHT_DATASET_LIMITS.maxNameLength);
  if(model.kpis.length>=INSIGHT_DATASET_LIMITS.maxKpis)throw new InsightError('insight-kpi-limit');
  const id=stableInsightId('kpi',`${input.measure}:${title}:${model.kpis.length}`);
  const card={id,title,value:'',changePct:0,trend:'neutral' as const,category:INSIGHT_KPI_CATEGORY[input.measure],measure:input.measure};
  return normalizeInsightModel({...model,revision:model.revision+1,kpis:[...model.kpis,card]});
}

/**
 * BATCH-INSIGHT-7 (W-392): edit, remove and reorder a card. The projection and the schema already
 * carried all three; only the wire was missing. `INSIGHT_KPI_CATEGORY` stays the one list of the
 * measures a card may declare, so an unknown measure is refused instead of producing a card that can
 * never be computed.
 */
export function updateInsightKpi(model:InsightDocumentModel,kpiId:string,patch:{title?:string;measure?:InsightKpiMeasure}):InsightDocumentModel{
  const existing=model.kpis.find((kpi)=>kpi.id===kpiId);
  if(!existing)throw new InsightError('insight-kpi-missing');
  const title=patch.title===undefined?existing.title:cleanText(patch.title,INSIGHT_DATASET_LIMITS.maxNameLength);
  if(patch.measure!==undefined&&!Object.hasOwn(INSIGHT_KPI_CATEGORY,patch.measure))throw new InsightError('insight-kpi-measure-invalid');
  const measure=patch.measure??existing.measure;
  return normalizeInsightModel({
    ...model,
    revision:model.revision+1,
    kpis:model.kpis.map((kpi)=>kpi.id===kpiId
      ? { ...kpi, title, ...(measure===undefined?{}:{ measure, category:INSIGHT_KPI_CATEGORY[measure] }) }
      : kpi),
  });
}

export function removeInsightKpi(model:InsightDocumentModel,kpiId:string):InsightDocumentModel{
  if(!model.kpis.some((kpi)=>kpi.id===kpiId))throw new InsightError('insight-kpi-missing');
  return normalizeInsightModel({...model,revision:model.revision+1,kpis:model.kpis.filter((kpi)=>kpi.id!==kpiId)});
}

export function moveInsightKpi(model:InsightDocumentModel,kpiId:string,delta:-1|1):InsightDocumentModel{
  const index=model.kpis.findIndex((kpi)=>kpi.id===kpiId);
  if(index<0)throw new InsightError('insight-kpi-missing');
  const target=index+delta;
  if(target<0||target>=model.kpis.length)throw new InsightError('insight-kpi-order-limit');
  const kpis=[...model.kpis];
  const [moved]=kpis.splice(index,1);
  kpis.splice(target,0,moved);
  return normalizeInsightModel({...model,revision:model.revision+1,kpis});
}
