// STATUS: PLATIN — BATCH-INSIGHT-2: the visible provenance panel of an Insight report.
//
// MEASURED FACT before this batch: `analysis/insightAnalysisEngine.ts` (buildLineage,
// performanceSummary, diagnoseModel) and `refresh/insightRefreshEngine.ts` (offlineSnapshotState)
// were imported by NO component. Every number below is now computed from the open document, and the
// panel is the only place that carries them.
import React from 'react';
import type { InsightDocumentModel } from '../domain/types';
import { useInsightCopy } from '../locale/insightLocale';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { buildLineage, diagnoseModel, performanceSummary } from '../analysis/insightAnalysisEngine';
import { offlineSnapshotState } from '../refresh/insightRefreshEngine';
import { governanceOwnerView } from '../governance/insightGovernanceEngine';

interface Props { model:InsightDocumentModel; online:boolean; }

export const InsightReportFooter:React.FC<Props>=(props)=>{
  const copy=useInsightCopy();
  const { locale }=useWorkspaceLocale();
  const { model, online }=props;
  const snapshot=offlineSnapshotState(model,online);
  const samples=performanceSummary(model.performance);
  const measured=samples.reduce((total,sample)=>({count:total.count+sample.count,totalMs:total.totalMs+sample.totalMs,maxMs:Math.max(total.maxMs,sample.maxMs)}),{count:0,totalMs:0,maxMs:0});
  const lineage=buildLineage({
    sources:model.sources.map(source=>({id:source.id,name:source.name})),
    queries:[...model.queries],
    model:model.semanticModel,
    visuals:model.report.pages.flatMap(page=>page.visuals),
    // Cross-app references are document references, not visual embeds: they are listed below
    // instead of being forced into the lineage graph, so the "unresolved" count stays a real
    // data-quality signal about the document itself.
    embeds:[],
  });
  const nodeIds=new Set(lineage.nodes.map(node=>node.id));
  const unresolved=lineage.edges.filter(edge=>!nodeIds.has(edge.from)||!nodeIds.has(edge.to)).length;
  const diagnostics=diagnoseModel(model.semanticModel,model.queries);
  const governance=governanceOwnerView(model.governance);
  const columnCount=model.sources.flatMap(source=>source.schema?.tables.flatMap(table=>table.columns)??[]).length;
  return <footer className="insight-provenance px-4 py-3 border-t border-purple-500/20 text-[0.625rem] text-slate-400" data-insight-provenance="true" aria-label={copy.provenanceTitle}
    data-insight-lineage-nodes={lineage.nodes.length} data-insight-lineage-edges={lineage.edges.length} data-insight-lineage-unresolved={unresolved}
    data-insight-perf-samples={measured.count} data-insight-offline-state={online?'online':snapshot.usable?'snapshot':'none'}>
    <h3 className="text-[0.625rem] font-semibold uppercase tracking-wider text-purple-300">{copy.provenanceTitle}</h3>
    <ul className="insight-provenance-sources mt-1 space-y-0.5">
      {model.sources.map(source=><li key={source.id} data-insight-source-id={source.id}>
        <span className="font-mono text-slate-300">{source.name}</span>
        <span> · {source.canonicalUri} · {source.trust} · {source.privacy}{source.enabled?'':' · disabled'}</span>
        {source.lastTest?<span> · {source.lastTest.state} · {Math.round(source.lastTest.latencyMs)} ms</span>:null}
      </li>)}
    </ul>
    {model.workspaceReferences.length>0&&<ul className="insight-provenance-references mt-1 space-y-0.5">
      {model.workspaceReferences.map(reference=><li key={reference.id} data-insight-reference-id={reference.id}>
        <span className="font-mono text-slate-300">{reference.canonicalUri}</span><span> · {reference.mode}</span>
      </li>)}
    </ul>}
    <p className="mt-1">{copy.lineageSummary(lineage.nodes.length,lineage.edges.length,unresolved)}</p>
    <p>{diagnostics.length?copy.diagnosticsSummary(diagnostics.length,[...new Set(diagnostics.map(entry=>entry.code))].join(', ')):copy.diagnosticsNone}</p>
    <p data-insight-provenance-columns={columnCount}>{governance.owner} · {governance.certification} · {governance.sensitivity}</p>
    <p data-insight-source-state={model.cache.sourceState}>{online
      ? copy.sourceStateLabel(model.cache.sourceState)
      : snapshot.usable&&snapshot.timestamp
        ? copy.offlineSnapshot(new Date(snapshot.timestamp).toLocaleString(locale),model.cache.sourceState)
        : copy.offlineNoSnapshot}</p>
    <p data-insight-performance-line={measured.count}>{measured.count
      ? copy.performanceLine(measured.count,measured.totalMs.toFixed(1),measured.maxMs.toFixed(1))
      : copy.performanceNone}</p>
  </footer>;
};
