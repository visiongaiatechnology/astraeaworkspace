// STATUS: PLATIN — BATCH-INSIGHT-5/6: the visible report surface (pages, gallery, layout, charts) plus
// the interactive scope controls (slicers, drilldown, per-visual category filter).
//
// MEASURED FACTS before these batches: `visuals/insightVisualEngine` and `reports/insightReportEngine`
// were imported by no component — no visual was ever rendered, no page could be added, and a placed
// visual could not be moved or removed. Charts are rendered through the SHARED
// `shared/charts/ChartRenderer` (one chart implementation for the whole workspace), which already
// carries an accessible summary and a keyboard-reachable data table, so no number lives only in
// pixels.
import React, { useState } from 'react';
import type { AggregationFunction, InsightDocumentModel, InsightScalar, InsightVisual } from '../domain/types';
import { InsightError } from '../core/insightCore';
import { useInsightCopy } from '../locale/insightLocale';
import { createInsightVisual } from '../visuals/insightVisualEngine';
import { addReportPage, moveVisual, navigateReport, placeVisual, removeVisual, renameReportPage, visiblePageObjects } from '../reports/insightReportEngine';
import { buildInsightChartObject, supportedInsightVisualKinds } from '../integrations/insightChartBridge';
import { INSIGHT_CANONICAL_COLUMNS, INSIGHT_NUMERIC_DATA_TYPES, canonicalColumnTypes } from '../connectors/insightImportCore';
import { addSlicer, createSlicer, removeSlicer, updateSlicerSelection } from '../reports/insightReportEngine';
import { slicerFieldAllowed, slicerOptions, toggleSlicerValue } from '../interactions/insightSlicers';
import { drillInsightVisual, insightDrillLevels } from '../interactions/insightDrill';
import type { InsightCrossFilter, InsightCrossFilterField } from '../interactions/insightCrossFilter';
import { PIVOT_AGGREGATIONS } from '../pivot/insightPivotCore';
import { downloadInsightBytes, exportInsightChartSvg } from '../export/insightExportEngine';
import { ChartRenderer } from '../../../shared/charts/ChartRenderer';

interface Props {
  model:InsightDocumentModel;
  documentId:string;
  crossFilter?:InsightCrossFilter|null;
  onCrossFilter?:(filter:InsightCrossFilter|null)=>void;
  onUpdateModel:(updater:(prev:InsightDocumentModel)=>InsightDocumentModel)=>void;
}

export const InsightReportCanvas:React.FC<Props>=(props)=>{
  const copy=useInsightCopy();
  const { model, documentId, crossFilter=null, onCrossFilter, onUpdateModel }=props;
  const [error,setError]=useState<string|null>(null);
  const [pageNameDraft,setPageNameDraft]=useState('');
  const [navigation,setNavigation]=useState<string[]>([]);
  const [kind,setKind]=useState<InsightVisual['kind']>('column');
  const [titleDraft,setTitleDraft]=useState('');
  const [categoryDraft,setCategoryDraft]=useState<'region'|'product'|'quarter'>('region');
  const [valuesDraft,setValuesDraft]=useState<string[]>(['revenue']);
  const [aggregationDraft,setAggregationDraft]=useState<AggregationFunction>('SUM');
  const [slicerFieldDraft,setSlicerFieldDraft]=useState<InsightCrossFilterField>('region');

  /** Every report action is computed BEFORE the state update, so a refusal is a named alert. */
  const apply=(action:(prev:InsightDocumentModel)=>InsightDocumentModel)=>{
    try{ const next=action(model); onUpdateModel(()=>next); setError(null); }
    catch(caught){ setError(caught instanceof InsightError?caught.code:'insight-report-action-failed'); }
  };
  const report=model.report;
  const activePage=report.pages.find((page)=>page.id===report.activePageId)??report.pages[0];
  const measuredColumns=(()=>{
    const declared=canonicalColumnTypes(model);
    return INSIGHT_CANONICAL_COLUMNS.filter((column)=>INSIGHT_NUMERIC_DATA_TYPES.has(declared[column]));
  })();
  const columnLabel=(column:string)=>column==='region'?copy.region:column==='product'?copy.product:column==='quarter'?copy.quarter:column==='revenue'?copy.revenue:column==='cost'?copy.operatingCost:column==='activeUsers'?copy.activeUsers:column;

  const addVisual=()=>apply((prev)=>{
    const page=prev.report.pages.find((entry)=>entry.id===prev.report.activePageId)??prev.report.pages[0];
    const title=titleDraft.trim()||`${columnLabel(categoryDraft)} · ${valuesDraft.join(', ')}`;
    const x=prev.report.gridSize;
    const y=prev.report.gridSize+page.visuals.length*16;
    const visual=createInsightVisual(kind,prev.queries[0]?.id??'q-main',title,{x,y,width:560,height:320},`${title}:${prev.report.pages.length}:${page.visuals.length}`);
    return{...prev,revision:prev.revision+1,report:placeVisual(prev.report,page.id,{...visual,encoding:{category:categoryDraft,values:[...valuesDraft],aggregation:aggregationDraft}})};
  });
  const addPage=()=>apply((prev)=>{
    const name=pageNameDraft.trim()||`Page ${prev.report.pages.length+1}`;
    return{...prev,revision:prev.revision+1,report:addReportPage(prev.report,name)};
  });
  const renamePage=()=>apply((prev)=>({...prev,revision:prev.revision+1,report:renameReportPage(prev.report,prev.report.activePageId,pageNameDraft)}));
  const step=(visualId:string,delta:{dx?:number;dy?:number;dwidth?:number;dheight?:number})=>apply((prev)=>({...prev,revision:prev.revision+1,report:moveVisual(prev.report,prev.report.activePageId,visualId,delta)}));
  const removePlaced=(visualId:string)=>apply((prev)=>({...prev,revision:prev.revision+1,report:removeVisual(prev.report,prev.report.activePageId,visualId)}));
  const addSlicerEntry=()=>apply((prev)=>({...prev,revision:prev.revision+1,report:addSlicer(prev.report,prev.report.activePageId,createSlicer(slicerFieldDraft,'list',[]))}));
  const toggleSlicer=(slicerId:string,value:InsightScalar)=>apply((prev)=>{
    const page=prev.report.pages.find((entry)=>entry.id===prev.report.activePageId)??prev.report.pages[0];
    const entry=page.slicers.find((candidate)=>candidate.id===slicerId);
    if(!entry)throw new InsightError('report-slicer-missing');
    return{...prev,revision:prev.revision+1,report:updateSlicerSelection(prev.report,page.id,slicerId,toggleSlicerValue(entry,value))};
  });
  const removeSlicerEntry=(slicerId:string)=>apply((prev)=>({...prev,revision:prev.revision+1,report:removeSlicer(prev.report,prev.report.activePageId,slicerId)}));
  const drill=(visualId:string,direction:'down'|'up')=>apply((prev)=>drillInsightVisual(prev,prev.report.activePageId,visualId,direction));
  /** The vector image of one visual, produced by the SHARED chart renderer (no second renderer here). */
  const exportVisualSvg=(visual:InsightVisual)=>{
    try{
      const bytes=exportInsightChartSvg(visual,model.records,{documentId,cacheState:model.cache.sourceState,revision:model.revision},model);
      void downloadInsightBytes(bytes,'image/svg+xml',`${model.datasetName.replace(/[^a-z0-9._-]+/gi,'-')||'insight'}-${visual.id}.svg`)
        .then(()=>setError(null))
        .catch((caught:unknown)=>{setError(caught instanceof InsightError?caught.code:'insight-chart-svg-unavailable');});
    }catch(caught){setError(caught instanceof InsightError?caught.code:'insight-chart-svg-unavailable');}
  };
  const gotoPage=(pageId:string)=>{
    try{ const next=navigateReport(model.report,{type:'page',target:pageId},navigation); onUpdateModel(()=>({...model,report:next.report})); setNavigation(next.history); setError(null); }
    catch(caught){ setError(caught instanceof InsightError?caught.code:'insight-report-action-failed'); }
  };
  const goBack=()=>{
    try{ const next=navigateReport(model.report,{type:'back'},navigation); onUpdateModel(()=>({...model,report:next.report})); setNavigation(next.history); setError(null); }
    catch(caught){ setError(caught instanceof InsightError?caught.code:'insight-report-action-failed'); }
  };

  if(!activePage)return <p className="p-4 text-xs text-slate-400" data-insight-visual-count="0">{copy.noVisuals}</p>;
  const shown=visiblePageObjects(report,activePage.id);

  return <section className="insight-report px-4 pt-4" data-insight-report="true" aria-label={copy.reportPages}
    data-insight-page-id={activePage.id} data-insight-page-count={report.pages.length} data-insight-visual-count={shown.visuals.length}>
    {/* Page strip: add, rename, navigate. All keyboard reachable. */}
    <div className="insight-page-strip flex flex-wrap items-end gap-2 text-[0.625rem] text-slate-400">
      <strong className="text-purple-300 uppercase tracking-wider">{copy.reportPages}</strong>
      <ul className="flex flex-wrap gap-1" role="list">
        {report.pages.map((page)=><li key={page.id}>
          <button type="button" onClick={()=>gotoPage(page.id)} aria-current={page.id===activePage.id?'page':undefined} data-insight-page-tab={page.id} className={`insight-tool-text ${page.id===activePage.id?'text-purple-200':'text-slate-400'}`}>{page.name}</button>
        </li>)}
      </ul>
      <button type="button" onClick={goBack} disabled={!navigation.length} className="insight-tool-text" data-insight-page-back="true">{copy.pageBack}</button>
      <label className="flex flex-col gap-0.5">{copy.pageNameLabel}
        <input value={pageNameDraft} onChange={(event)=>setPageNameDraft(event.target.value)} aria-label={copy.pageNameLabel} data-insight-page-name="true" className="insight-input"/>
      </label>
      <button type="button" onClick={addPage} className="insight-tool-text" data-insight-add-page="true">{copy.addPage}</button>
      <button type="button" onClick={renamePage} className="insight-tool-text" data-insight-rename-page="true">{copy.renamePage}</button>
    </div>

    {/* Gallery and field wells: kind, title, category, values, aggregation. */}
    <div className="insight-visual-gallery mt-2 flex flex-wrap items-end gap-2 text-[0.625rem] text-slate-400" data-insight-gallery="true" aria-label={copy.visualGallery}>
      <strong className="text-purple-300 uppercase tracking-wider">{copy.visualGallery}</strong>
      <label className="flex flex-col gap-0.5">{copy.visualKindLabel}
        <select value={kind} onChange={(event)=>setKind(event.target.value as InsightVisual['kind'])} aria-label={copy.visualKindLabel} data-insight-visual-kind-select="true" className="insight-input">
          {supportedInsightVisualKinds().map((entry)=><option key={entry} value={entry}>{entry}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-0.5">{copy.visualTitleLabel}
        <input value={titleDraft} onChange={(event)=>setTitleDraft(event.target.value)} aria-label={copy.visualTitleLabel} data-insight-visual-title="true" className="insight-input"/>
      </label>
      <label className="flex flex-col gap-0.5">{copy.visualCategoryLabel}
        <select value={categoryDraft} onChange={(event)=>setCategoryDraft(event.target.value as 'region'|'product'|'quarter')} aria-label={copy.visualCategoryLabel} data-insight-visual-category="true" className="insight-input">
          {(['region','product','quarter'] as const).map((column)=><option key={column} value={column}>{columnLabel(column)}</option>)}
        </select>
      </label>
      <fieldset className="flex items-end gap-1" data-insight-visual-values="true">
        <legend className="text-[0.625rem]">{copy.visualValuesLabel}</legend>
        {measuredColumns.map((column)=><label key={column} className="flex items-center gap-0.5">
          <input type="checkbox" checked={valuesDraft.includes(column)} onChange={(event)=>setValuesDraft((current)=>event.target.checked?[...current,column]:current.filter((entry)=>entry!==column))} aria-label={columnLabel(column)} data-insight-visual-value={column}/>
          <span>{columnLabel(column)}</span>
        </label>)}
      </fieldset>
      <label className="flex flex-col gap-0.5">{copy.visualAggregationLabel}
        <select value={aggregationDraft} onChange={(event)=>setAggregationDraft(event.target.value as AggregationFunction)} aria-label={copy.visualAggregationLabel} data-insight-visual-aggregation="true" className="insight-input">
          {PIVOT_AGGREGATIONS.map((fn)=><option key={fn} value={fn}>{copy.aggregation(fn)}</option>)}
        </select>
      </label>
      <button type="button" onClick={addVisual} disabled={!valuesDraft.length} className="insight-tool-text" data-insight-add-visual="true">{copy.addVisual}</button>
    </div>
    {error&&<p role="alert" className="mt-1 text-[0.625rem] text-amber-300" data-insight-report-error={error}>{copy.reportActionFailed(error)}</p>}

    {/* Slicers: add, select values, remove. Every control is a labelled checkbox or button. */}
    <div className="insight-slicers mt-2 flex flex-wrap items-end gap-2 text-[0.625rem] text-slate-400" data-insight-slicers="true" aria-label={copy.slicers}>
      <strong className="text-purple-300 uppercase tracking-wider">{copy.slicers}</strong>
      <label className="flex flex-col gap-0.5">{copy.slicerFieldLabel}
        <select value={slicerFieldDraft} onChange={(event)=>setSlicerFieldDraft(event.target.value as InsightCrossFilterField)} aria-label={copy.slicerFieldLabel} data-insight-slicer-field="true" className="insight-input">
          {(['region','product','quarter'] as const).filter(slicerFieldAllowed).map((field)=><option key={field} value={field}>{columnLabel(field)}</option>)}
        </select>
      </label>
      <button type="button" onClick={addSlicerEntry} className="insight-tool-text" data-insight-add-slicer="true">{copy.addSlicer}</button>
      {activePage.slicers.map((entry)=>{
        const options=slicerOptions(model.records,entry.field);
        return <fieldset key={entry.id} className="flex flex-col gap-0.5" data-insight-slicer={entry.id} data-insight-slicer-field-name={entry.field}>
          <legend>{columnLabel(entry.field)}</legend>
          <span className="flex flex-wrap gap-1">
            {options.options.map((value)=><label key={String(value)} className="flex items-center gap-0.5">
              <input type="checkbox" checked={entry.selection.some((selected)=>selected===value)} onChange={()=>toggleSlicer(entry.id,value)} aria-label={`${columnLabel(entry.field)}: ${String(value)}`} data-insight-slicer-value={String(value)}/>
              <span>{String(value)}</span>
            </label>)}
          </span>
          {options.omitted>0&&<span data-insight-slicer-omitted={options.omitted}>{copy.slicerOmitted(options.omitted)}</span>}
          <button type="button" onClick={()=>removeSlicerEntry(entry.id)} className="insight-tool" aria-label={`${copy.removeSlicer}: ${columnLabel(entry.field)}`} data-insight-remove-slicer={entry.id}>×</button>
        </fieldset>;
      })}
      {crossFilter&&<p className="text-purple-200" data-insight-cross-filter={`${crossFilter.field}=${crossFilter.value}`}>{copy.crossFilterAppliedOn(crossFilter.field,crossFilter.value)}</p>}
    </div>

    {/* The page canvas: each visual is placed at its own position and rendered by the shared renderer. */}
    {shown.visuals.length===0
      ? <p className="mt-2 text-xs text-slate-400" data-insight-visual-count="0">{copy.noVisuals}</p>
      : <div className="insight-canvas relative mt-2" style={{minHeight:activePage.height,maxWidth:activePage.width}} data-insight-canvas={activePage.id}>
        {shown.visuals.map((visual)=>{
          const drillLevels=insightDrillLevels(model,visual);
          const drillLevel=Math.max(0,Math.min(drillLevels.length-1,visual.drillLevel??0));
          const visualCategory=(visual.encoding.category??'region') as InsightCrossFilterField;
          let chart=null; let chartError:string|null=null;
          try{ chart=buildInsightChartObject(visual,model.records,{documentId,cacheState:model.cache.sourceState,revision:model.revision},model); }
          catch(caught){ chartError=caught instanceof InsightError?caught.code:'insight-visual-unavailable'; }
          return <article key={visual.id} className="insight-visual absolute rounded-xl border border-purple-500/20 bg-[#0e0a1b]"
            style={{left:visual.x,top:visual.y,width:visual.width,height:visual.height}} data-insight-visual-id={visual.id} data-insight-visual-kind={visual.kind}>
            <header className="flex items-center justify-between gap-1 px-2 py-1 text-[0.625rem] text-slate-300">
              <span className="font-semibold text-purple-200">{visual.title}</span>
              <span className="flex items-center gap-0.5">
                <button type="button" onClick={()=>drill(visual.id,'up')} disabled={drillLevel<=0} aria-label={`${copy.drillUp}: ${visual.title}`} data-insight-drill-up={visual.id} className="insight-tool">⤒</button>
                <button type="button" onClick={()=>drill(visual.id,'down')} disabled={drillLevel>=drillLevels.length-1} aria-label={`${copy.drillDown}: ${visual.title}`} data-insight-drill-down={visual.id} className="insight-tool">⤓</button>
                {onCrossFilter&&<select value={crossFilter?.field===visualCategory?crossFilter.value:''} onChange={(event)=>onCrossFilter(event.target.value?{field:visualCategory,value:event.target.value}:null)} aria-label={`${copy.filterByCategory}: ${visual.title}`} data-insight-visual-filter={visual.id} className="insight-input max-w-28">
                  <option value="">{copy.filterByCategory}</option>
                  {slicerOptions(model.records,visualCategory).options.map((value)=><option key={String(value)} value={String(value)}>{String(value)}</option>)}
                </select>}
                <button type="button" onClick={()=>step(visual.id,{dx:-(report.gridSize||8)})} aria-label={`${copy.moveLeft}: ${visual.title}`} className="insight-tool">←</button>
                <button type="button" onClick={()=>step(visual.id,{dx:report.gridSize||8})} aria-label={`${copy.moveRight}: ${visual.title}`} className="insight-tool">→</button>
                <button type="button" onClick={()=>step(visual.id,{dy:-(report.gridSize||8)})} aria-label={`${copy.moveUp}: ${visual.title}`} className="insight-tool">↑</button>
                <button type="button" onClick={()=>step(visual.id,{dy:report.gridSize||8})} aria-label={`${copy.moveDown}: ${visual.title}`} className="insight-tool">↓</button>
                <button type="button" onClick={()=>step(visual.id,{dwidth:(report.gridSize||8)*4})} aria-label={`${copy.resizeWider}: ${visual.title}`} className="insight-tool">+↔</button>
                <button type="button" onClick={()=>step(visual.id,{dheight:(report.gridSize||8)*3})} aria-label={`${copy.resizeTaller}: ${visual.title}`} className="insight-tool">+↕</button>
                <button type="button" onClick={()=>exportVisualSvg(visual)} aria-label={`${copy.exportSvg}: ${visual.title}`} data-insight-visual-export="svg" data-insight-visual-export-id={visual.id} className="insight-tool">{copy.exportSvg}</button>
                <button type="button" onClick={()=>removePlaced(visual.id)} aria-label={`${copy.deleteVisual}: ${visual.title}`} data-insight-remove-visual={visual.id} className="insight-tool">×</button>
              </span>
            </header>
            {chart
              ? <ChartRenderer chart={chart} height={Math.max(120,visual.height-32)} interactive className="insight-visual-chart"/>
              : <p role="alert" className="p-2 text-[0.625rem] text-amber-300" data-insight-visual-error={chartError}>{copy.reportActionFailed(chartError??'insight-visual-unavailable')}</p>}
          </article>;
        })}
      </div>}
    {shown.objects.length>0&&<ul className="insight-objects mt-2 text-[0.625rem] text-slate-400">{shown.objects.map((object)=><li key={object.id}>{object.kind==='text'?object.text:object.kind}</li>)}</ul>}
  </section>;
};
