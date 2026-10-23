// STATUS: PLATIN — Astraea Insight accessible BI workspace with real bounded core paths.
// BATCH-INSIGHT-1: every visible number and status is produced by an operation that really ran.
//  - the document load state is named instead of silently showing the sample dataset
//  - a query reports how many rows were applied and how many were rejected
//  - a refresh only claims a snapshot when a source was really read
//  - the KPI/matrix numbers come from the shared projection and pivot cores
import { isImeCompositionEvent } from '../../../shared/accessibility/accessibilityPlatform';
import React, { useEffect, useRef, useState } from 'react';
import '../theme/insightTheme.css';
import type { NetworkCapability, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { BarChart3, BookmarkPlus, Download, FileSpreadsheet, FileText, HardDriveDownload, HardDriveUpload, Lock, Redo2, RefreshCw, ShieldCheck, Undo2, Upload, WifiOff, ZoomIn, ZoomOut } from 'lucide-react';
import { InsightKpiCards } from '../components/InsightKpiCards';
import { InsightPivotTable } from '../components/InsightPivotTable';
import { InsightQueryBuilder } from '../components/InsightQueryBuilder';
import { InsightReportFooter } from '../components/InsightReportFooter';
import { InsightReportCanvas } from '../components/InsightReportCanvas';
import { DEFAULT_INSIGHT_MODEL, type InsightAuditEvent, type InsightDocumentModel, type InsightKpiMeasure, type InsightRecord, type InsightScalar } from '../domain/types';
import { InsightError, migrateInsightModel, normalizeInsightModel } from '../core/insightCore';
import { createInsightHistory, pushInsightHistory, redoInsightHistory, undoInsightHistory } from '../history/insightHistoryEngine';
import { executeInsightQuery } from '../queries/insightQueryEngine';
import { recordPerformance } from '../analysis/insightAnalysisEngine';
import { addAuditEvent } from '../governance/insightGovernanceEngine';
import { captureBookmark } from '../reports/insightReportEngine';
import { INSIGHT_EXPORT_LIMITS, downloadInsightBytes, exportReportPdf, exportRowsCsv, exportRowsXlsx } from '../export/insightExportEngine';
import { insightDeliveryText } from '../export/insightExportStatus';
import { importInsightDataset, type InsightImportKind, type InsightImportReport } from '../connectors/insightImportCore';
import { compareInsightModels, packInsightDocument, reopenInsightDocument } from '../interchange/insightNativeInterchange';
import { auditInsightAccessibility, summarizeInsightAccessibility } from '../accessibility/insightAccessibilityEngine';
import { createLocalInsightReader, nextInsightCache, resolveInsightRefreshOutcome, type InsightRefreshKind } from '../refresh/insightRefreshOutcome';
import { openInsightSnapshot, sealInsightSnapshot } from '../refresh/insightOfflineCache';
import { filterInsightRecords, formatInsightKpiChange, formatInsightUsd, insightRegionSegments, projectInsightKpis, type InsightCrossFilter } from '../interactions/insightCrossFilter';
import { addInsightKpi, createEmptyInsightModel, moveInsightKpi, removeInsightKpi, updateInsightKpi } from '../interactions/insightDatasetAuthoring';
import { applyInsightSlicers } from '../interactions/insightSlicers';
import { connectInsightWorkspaceSource, listInsightWorkspaceCandidates } from '../connectors/insightWorkspaceSource';
import { buildInsightPivot, formatPivotValue, pivotUnit } from '../pivot/insightPivotCore';
import { useInsightCopy } from '../locale/insightLocale';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { shellChromeCopy } from '../../../shell/i18n/shellChromeLocale';

interface InsightViewProps { document:WorkspaceDocument; /** **Vom Shell verdrahtet (Runde 104):** Ohne die Dokumentliste kann Insight keine Arbeitsmappe auswaehlen, also bleibt Paket 02 unerreichbar — genau die Klasse ssertPdfStudioSchema (Faehigkeit ohne Aufrufer). Additiv und optional, damit kein Aufrufer bricht. */ workspaceDocuments?:readonly WorkspaceDocument[]; onUpdateDocument:(doc:WorkspaceDocument)=>void; networkCapability?:NetworkCapability; }
export interface InsightModelLoad {
  model:InsightDocumentModel;
  /** `document` = read from the payload, `migrated` = legacy payload, `empty` = new document, `unreadable` = payload rejected. */
  state:'document'|'migrated'|'empty'|'unreadable';
  reason:string;
}
/**
 * Read the Insight payload and NAME the outcome. The previous version swallowed every failure and
 * showed the seeded sample dataset without saying so — the most expensive kind of plausible number.
 */
export function loadInsightModel(document:WorkspaceDocument):InsightModelLoad{
  const payload=document.insightData as unknown;
  if(payload===undefined||payload===null)return{model:structuredClone(DEFAULT_INSIGHT_MODEL),state:'empty',reason:'no-payload'};
  if(typeof payload!=='object'||Array.isArray(payload))return{model:structuredClone(DEFAULT_INSIGHT_MODEL),state:'unreadable',reason:'insight-payload-not-object'};
  const legacy=(payload as {schemaVersion?:unknown}).schemaVersion!==2;
  try{
    const model=migrateInsightModel(payload);
    return legacy?{model,state:'migrated',reason:'legacy-schema'}:{model,state:'document',reason:'schema-2'};
  }catch(error){
    return{model:structuredClone(DEFAULT_INSIGHT_MODEL),state:'unreadable',reason:error instanceof InsightError?error.code:'insight-document-unreadable'};
  }
}
/** A named code for the status line — never a raw message that could carry content. */
function failureCode(error:unknown):string{return error instanceof InsightError?error.code:error instanceof Error&&/^[A-Za-z0-9._-]{1,64}$/.test(error.message)?error.message:'insight-operation-failed';}
function isInsightRecord(row:Record<string,unknown>):row is InsightRecord{return typeof row.id==='string'&&typeof row.region==='string'&&typeof row.product==='string'&&typeof row.quarter==='string'&&typeof row.revenue==='number'&&typeof row.cost==='number'&&typeof row.activeUsers==='number'&&typeof row.anomalyScore==='number';}
export const InsightView:React.FC<InsightViewProps>=({document,onUpdateDocument,networkCapability='None',workspaceDocuments})=>{
  const copy=useInsightCopy();
  const { locale } = useWorkspaceLocale();
  const localizedCapability = shellChromeCopy(locale).status.capability[networkCapability];
  const [load]=useState<InsightModelLoad>(()=>loadInsightModel(document));
  const [history,setHistory]=useState(()=>createInsightHistory(load.model));
  const [zoom,setZoom]=useState(1);
  const [status,setStatus]=useState(copy.initialStatus);
  const [refreshOutcome,setRefreshOutcome]=useState<InsightRefreshKind|'none'>('none');
  const [crossFilter,setCrossFilter]=useState<InsightCrossFilter | null>(null);
  const [importReport,setImportReport]=useState<InsightImportReport | null>(null);
  const [datasetDraft,setDatasetDraft]=useState('');
  const [kpiTitleDraft,setKpiTitleDraft]=useState('');
  const [kpiMeasureDraft,setKpiMeasureDraft]=useState<InsightKpiMeasure>('revenue');
  const [kpiEditId,setKpiEditId]=useState('');
  const [authoringError,setAuthoringError]=useState<string|null>(null);
  const [passphrase,setPassphrase]=useState('');
  const [workspaceSourceDraft,setWorkspaceSourceDraft]=useState('');
  const model=history.present;
  const workspaceCandidates=listInsightWorkspaceCandidates(workspaceDocuments??[]);
  /**
   * Bind a real workspace workbook: read it through the shared grid contract, map it with the one
   * mapping and register the source plus the cross-app reference. Computed before the state update so
   * a refusal becomes a visible code.
   */
  const connectWorkspaceSource=()=>{
    try{
      const chosen=(workspaceDocuments??[]).find((candidate)=>candidate.id===workspaceSourceDraft)
        ?? (workspaceDocuments??[]).find((candidate)=>workspaceCandidates.find((entry)=>entry.id===candidate.id)?.readable);
      if(!chosen)throw new InsightError('workspace-source-not-selected');
      const outcome=connectInsightWorkspaceSource(model,chosen);
      setImportReport(outcome.report);
      if(!outcome.report.ok){setStatus(copy.importRefused(outcome.report.reason));return;}
      updateModel(()=>normalizeInsightModel({
        ...outcome.model,
        audit:addAuditEvent(outcome.model.audit,{action:'dataset',objectId:outcome.source?.id??'none',actor:outcome.model.governance.owner,outcome:'allowed',detailCode:'workspace-source-connected'}),
      }));
      setStatus(copy.sourceConnected(String(chosen.title??chosen.id),outcome.report.rows));
    }catch(error){setStatus(copy.importFailed(failureCode(error)));}
  };
  /**
   * Both authoring actions are pure and bounded. They are computed BEFORE the state update, so a
   * refusal is caught here and shown as a named code instead of throwing inside React's updater.
   */
  const createDataset=()=>{
    try{
      const next=createEmptyInsightModel(datasetDraft);
      updateModel(()=>next);
      setAuthoringError(null);
      setDatasetDraft('');
      setStatus(copy.datasetCreated(next.datasetName));
    }catch(error){setAuthoringError(failureCode(error));}
  };
  const createKpi=()=>{
    try{
      const next=addInsightKpi(model,{title:kpiTitleDraft,measure:kpiMeasureDraft});
      updateModel(()=>next);
      setAuthoringError(null);
      setKpiTitleDraft('');
      setStatus(copy.kpiCreated(next.kpis[next.kpis.length-1].title));
    }catch(error){setAuthoringError(failureCode(error));}
  };
  /** W-392: the three card operations the schema and the projection already supported. */
  const applyKpiEdit=()=>{
    try{
      const next=updateInsightKpi(model,kpiEditId,{title:kpiTitleDraft,measure:kpiMeasureDraft});
      updateModel(()=>next);
      setAuthoringError(null);
      setStatus(copy.kpiUpdated(next.kpis.find((card)=>card.id===kpiEditId)?.title??''));
    }catch(error){setAuthoringError(failureCode(error));}
  };
  const moveKpi=(delta:-1|1)=>{
    try{
      const next=moveInsightKpi(model,kpiEditId,delta);
      updateModel(()=>next);
      setAuthoringError(null);
      setStatus(copy.kpiUpdated(next.kpis.find((card)=>card.id===kpiEditId)?.title??''));
    }catch(error){setAuthoringError(failureCode(error));}
  };
  const removeKpi=()=>{
    try{
      const title=model.kpis.find((card)=>card.id===kpiEditId)?.title??'';
      const next=removeInsightKpi(model,kpiEditId);
      updateModel(()=>next);
      setAuthoringError(null);
      setKpiEditId('');
      setStatus(copy.kpiUpdated(title));
    }catch(error){setAuthoringError(failureCode(error));}
  };
  /**
   * Encrypted native interchange: the Save/Reopen path every WOM point was missing. The payload
   * identity is really compared after reopening, and a difference names the field instead of
   * reporting a silent success.
   */
  const saveEncrypted=async()=>{
    if(!passphrase.trim()){setStatus(copy.exportFailed('password-required'));return;}
    try{
      const bytes=await packInsightDocument(document,model,{password:passphrase});
      const delivery=await download(bytes,'application/octet-stream','vinsight');
      setStatus(`${copy.exportedEncrypted(bytes.byteLength)} ${insightDeliveryText(delivery)}`);
    }catch(error:unknown){setStatus(copy.exportFailed(failureCode(error)));}
  };
  /** One download path for every export: the mechanics live in the export engine, the name is built here. */
  const download=(bytes:Uint8Array,mime:string,extension:string)=>{
    return downloadInsightBytes(bytes,mime,`${model.datasetName.replace(/[^a-z0-9._-]+/gi,'-')||'insight'}.${extension}`);
  };
  const persist=(next:InsightDocumentModel)=>onUpdateDocument({...document,modified_at:Date.now(),version:document.version+1,insightData:next});
  const updateModel=(updater:(prev:InsightDocumentModel)=>InsightDocumentModel)=>setHistory(prev=>{const next=pushInsightHistory(prev,updater(prev.present));persist(next.present);return next;});
  const undo=()=>setHistory(prev=>{const next=undoInsightHistory(prev);if(next!==prev)persist(next.present);return next;});
  const redo=()=>setHistory(prev=>{const next=redoInsightHistory(prev);if(next!==prev)persist(next.present);return next;});
  // Keyboard state machine reads the latest handlers, so Ctrl+Z after a document round-trip writes
  // the current document instead of the one from the first render.
  const handlers=useRef({undo,redo});
  handlers.current={undo,redo};
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(isImeCompositionEvent(event))return;
      const cmd=event.ctrlKey||event.metaKey;
      if(cmd&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?handlers.current.redo():handlers.current.undo();return;}
      if(cmd&&event.key.toLowerCase()==='y'){event.preventDefault();handlers.current.redo();return;}
      if(event.key==='Escape'&&crossFilter){event.preventDefault();setCrossFilter(null);setStatus(copy.filterCleared);}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[crossFilter,copy.filterCleared]);
  const audit=(entries:readonly InsightAuditEvent[],input:{action:InsightAuditEvent['action'];objectId:string;outcome:InsightAuditEvent['outcome'];detailCode:string})=>addAuditEvent(entries,{...input,actor:model.governance.owner});
  const execute=()=>{
    const id=model.queries[0]?.id;
    try{
      if(!id)throw new InsightError('query-missing');
      const sources=new Map(model.sources.map(s=>[s.id,s]));
      const embedded=model.sources[0]?.id;
      const sourceRows=new Map<string,Record<string,InsightScalar>[]>();
      if(embedded)sourceRows.set(embedded,model.records.map(r=>({...r})));
      const result=executeInsightQuery(id,model.queries,sourceRows,sources);
      const typed=result.rows.filter(isInsightRecord);
      const dropped=result.rows.length-typed.length;
      // Nothing applicable is a failure, not a success status without an operation.
      if(!typed.length)throw new InsightError('query-result-not-applicable');
      const candidate=normalizeInsightModel({
        ...model,
        records:typed,
        performance:recordPerformance(model.performance,{kind:'query',objectId:id,durationMs:result.elapsedMs,rows:typed.length}),
        audit:audit(model.audit,{action:'dataset',objectId:id,outcome:'allowed',detailCode:dropped>0?'query-applied-partial':'query-applied'}),
      });
      updateModel(()=>candidate);
      setStatus(dropped>0?copy.queryApplied(typed.length,dropped):copy.querySuccess(typed.length,result.elapsedMs.toFixed(1)));
    }catch(error){
      const code=failureCode(error);
      updateModel(prev=>({...prev,audit:addAuditEvent(prev.audit,{action:'dataset',objectId:id??'none',actor:prev.governance.owner,outcome:'failed',detailCode:code})}));
      setStatus(copy.queryFailure(code));
    }
  };
  const saveCsv=async()=>{
    try{
      const bytes=exportRowsCsv(filteredRecords);
      const delivery=await download(bytes,'text/csv;charset=utf-8','csv');
      setStatus(`${copy.exported} ${insightDeliveryText(delivery)}`);
    }catch(error){setStatus(copy.exportFailed(failureCode(error)));}
  };
  const saveXlsx=async()=>{
    try{
      const bytes=exportRowsXlsx(filteredRecords,model.datasetName.slice(0,31)||'Data');
      const delivery=await download(bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx');
      setStatus(`${copy.exportedXlsx(filteredRecords.length)} ${insightDeliveryText(delivery)}`);
    }catch(error){setStatus(copy.exportFailed(failureCode(error)));}
  };
  /**
   * The printed report carries the numbers the surface computed: the projected KPI values with their
   * derived period comparison, and the matrix grand total from the one pivot definition. A line that
   * does not fit the page is rejected by name (`export-pdf-line-limit`), never clipped.
   */
  const savePdf=async()=>{
    try{
      const pivot=buildInsightPivot(filteredRecords,model.pivotConfig);
      const lines=[
        `${filteredRecords.length} / ${model.records.length} ${copy.rows.toLowerCase()}`,
        ...projectedKpis.filter(kpi=>kpi.value!==null).map(kpi=>`${kpi.title}: ${kpi.value}${kpi.comparison?` (${copy.comparisonLabel(kpi.comparison.currentLabel,kpi.comparison.previousLabel)} ${formatInsightKpiChange(kpi.comparison,copy.pointsUnit)})`:''}`),
        `${copy.grandTotal} ${copy.aggregation(model.pivotConfig.aggFunc)}: ${formatPivotValue(pivot.grandTotal,pivotUnit(model.pivotConfig.measure,model.pivotConfig.aggFunc),locale,copy.noDataValue)}`,
      ];
      const bytes=exportReportPdf(filteredModel,lines,INSIGHT_EXPORT_LIMITS);
      const delivery=await download(bytes,'application/pdf','pdf');
      setStatus(`${copy.exportedPdf(lines.length)} ${insightDeliveryText(delivery)}`);
    }catch(error){setStatus(copy.exportFailed(failureCode(error)));}
  };
  /**
   * BATCH-INSIGHT-8: the offline snapshot. Sealing really encrypts the visible records with AES-GCM and
   * stores the ciphertext in the document's own cache metadata; verifying really decrypts it again, so
   * the offline branch of the provenance panel is a fact and not a promise.
   */
  const sealSnapshot=()=>{
    if(!passphrase.trim()){setStatus(copy.snapshotFailed('password-required'));return;}
    void sealInsightSnapshot(model,{documentId:document.id,passphrase})
      .then(sealed=>{
        updateModel(()=>normalizeInsightModel({
          ...sealed,
          audit:addAuditEvent(sealed.audit,{action:'refresh',objectId:sealed.sources.find((source)=>source.enabled)?.id??'none',actor:sealed.governance.owner,outcome:'allowed',detailCode:'snapshot-sealed'}),
        }));
        setStatus(copy.snapshotSealed(sealed.records.length,sealed.cache.usedBytes));
      })
      .catch((error:unknown)=>{setStatus(copy.snapshotFailed(failureCode(error)));});
  };
  const verifySnapshot=()=>{
    if(!passphrase.trim()){setStatus(copy.snapshotFailed('password-required'));return;}
    void openInsightSnapshot(model,{documentId:document.id,passphrase})
      .then(opened=>{setStatus(copy.snapshotVerified(opened.rowCount));})
      .catch((error:unknown)=>{setStatus(copy.snapshotFailed(failureCode(error)));});
  };
  /** Local file import: the pure pipeline decides, this only delivers the file to it. */
  const importFile=(event:React.ChangeEvent<HTMLInputElement>)=>{
    const input=event.target;
    const file=input.files?.[0];
    input.value='';
    if(!file)return;
    const lower=file.name.toLowerCase();
    if(lower.endsWith('.vinsight')){
      if(!passphrase.trim()){setStatus(copy.importFailed('password-required'));return;}
      void file.arrayBuffer()
        .then(buffer=>reopenInsightDocument(new Uint8Array(buffer),{password:passphrase}))
        .then(reopened=>{
          const identity=compareInsightModels(model,reopened.model);
          setImportReport(null);
          updateModel(()=>reopened.model);
          setStatus(identity.identical?copy.reopenedIdentical:copy.reopenedDiffers(identity.difference??'unknown'));
        })
        .catch((error:unknown)=>{setStatus(copy.importFailed(failureCode(error)));});
      return;
    }
    const kind:InsightImportKind=lower.endsWith('.json')?'json':lower.endsWith('.tsv')?'tsv':'csv';
    const apply=(text:string)=>{
      try{
        const outcome=importInsightDataset(model,{name:file.name,kind,text});
        setImportReport(outcome.report);
        if(!outcome.report.ok){setStatus(copy.importRefused(outcome.report.reason));return;}
        const candidate=normalizeInsightModel({
          ...outcome.model,
          // The cache claim (read + fresh + snapshot) is written by the import core through the one
          // cache definition; the view only records the audit event.
          audit:addAuditEvent(outcome.model.audit,{action:'dataset',objectId:outcome.source?.id??'none',actor:outcome.model.governance.owner,outcome:'allowed',detailCode:'import-applied'}),
        });
        updateModel(()=>candidate);
        setStatus(copy.imported(outcome.report.rows,outcome.report.skippedRows));
      }catch(error){setImportReport(null);setStatus(copy.importFailed(failureCode(error)));}
    };
    void file.text().then(apply).catch((error:unknown)=>{setStatus(copy.importFailed(failureCode(error)));});
  };
  /**
   * Refresh reads through the existing bounded executor first. `sourceState: 'fresh'` and a new
   * `snapshotAt` are set only when that read really succeeded; otherwise the previous cache state
   * survives and the status line says the source was not read. `lastRefreshAt` is the timestamp the
   * "timestamp updated — source not read" text is about, so it is written on every attempt.
   */
  const refresh=()=>{
    const now=Date.now();
    const source=model.sources.find(s=>s.enabled);
    const sourceIsLocal=Boolean(source)&&!['external-db','odbc','http'].includes(source!.kind);
    const query=model.queries[0];
    const outcome=(source&&query)
      ? resolveInsightRefreshOutcome(createLocalInsightReader(model.queries,query.id,model.records,sourceIsLocal))
      : resolveInsightRefreshOutcome(()=>{throw new Error('source-unavailable');});
    const auditEvent:InsightAuditEvent={id:`audit-refresh-${now}`,at:now,action:'refresh',objectId:source?.id??'none',actor:model.governance.owner,outcome:outcome.kind==='read'?'allowed':'failed',detailCode:outcome.kind==='read'?'refresh-read-ok':outcome.errorCode??'refresh-read-failed'};
    updateModel(prev=>({...prev,cache:nextInsightCache(prev.cache,outcome,now),audit:addAuditEvent(prev.audit,auditEvent)}));
    setRefreshOutcome(outcome.kind);
    setStatus(outcome.kind==='read'?copy.refreshed(outcome.rows):outcome.kind==='unavailable'?copy.refreshUnread:copy.refreshFailed(outcome.errorCode??'refresh-read-failed'));
  };
  const a11y=auditInsightAccessibility(model);
  // One scope chain for every projection below: document rows -> page slicers -> view cross-filter.
  const activeSlicers=(model.report.pages.find((entry)=>entry.id===model.report.activePageId)??model.report.pages[0])?.slicers??[];
  const scopedRecords=applyInsightSlicers(model.records,activeSlicers);
  const filteredRecords=filterInsightRecords(scopedRecords,crossFilter);
  const filteredModel:InsightDocumentModel={...model,records:filteredRecords};
  const a11ySummary=summarizeInsightAccessibility(model,crossFilter?1:0);
  const accessibilitySummary=a11ySummary.pageName===null
    ? copy.noActivePage
    : copy.screenReaderSummary(a11ySummary.datasetName,a11ySummary.pageName,a11ySummary.visibleVisualCount,a11ySummary.activeFilterCount);
  const projectedKpis=projectInsightKpis(filteredRecords,model.kpis,locale);
  const regionSegments=insightRegionSegments(model.records);
  const regionTotal=regionSegments.reduce((total,segment)=>total+segment.revenue,0);
  return <div className="flex-1 flex flex-col h-full bg-[#07050d] text-slate-100 overflow-hidden" data-vgt-insight-root="true" data-insight-load-state={load.state} role="region" aria-label={copy.workspaceLabel}>
    <div className="min-h-12 border-b border-purple-500/20 bg-[#0c0817] px-4 flex flex-wrap items-center justify-between gap-2" role="toolbar" aria-label={copy.toolbarLabel}>
      <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-400"/><strong className="text-xs uppercase tracking-wider text-purple-300">{copy.productTitle}</strong><span className="text-slate-500">/</span><span className="text-xs font-mono text-purple-200">{model.datasetName}</span></div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={undo} disabled={!history.past.length} aria-label={copy.undo} className="insight-tool"><Undo2 className="w-3.5 h-3.5"/></button>
        <button type="button" onClick={redo} disabled={!history.future.length} aria-label={copy.redo} className="insight-tool"><Redo2 className="w-3.5 h-3.5"/></button>
        <button type="button" onClick={()=>setZoom(z=>Math.max(1,Math.min(3,z-.25)))} disabled={zoom<=1} aria-label={copy.zoomOut} className="insight-tool"><ZoomOut className="w-3.5 h-3.5"/></button><span className="text-[0.625rem] min-w-10 text-center" aria-live="polite">{Math.round(zoom*100)}%</span><button type="button" onClick={()=>setZoom(z=>Math.max(1,Math.min(3,z+.25)))} disabled={zoom>=3} aria-label={copy.zoomIn} className="insight-tool"><ZoomIn className="w-3.5 h-3.5"/></button>
        <button type="button" onClick={()=>updateModel(prev=>({...prev,report:captureBookmark(prev.report,`Bookmark ${prev.report.bookmarks.length+1}`)}))} className="insight-tool-text"><BookmarkPlus className="w-3.5 h-3.5"/>{copy.bookmark}</button>
        <button type="button" onClick={refresh} data-insight-refresh-state={refreshOutcome} data-insight-source-state={model.cache.sourceState} className="insight-tool-text"><RefreshCw className="w-3.5 h-3.5"/>{copy.refresh}</button>
        <label className="insight-tool-text" data-insight-import="true">
          <Upload className="w-3.5 h-3.5"/>
          <span>{copy.importLabel}</span>
          <input type="file" className="sr-only" accept=".csv,.tsv,.json,.vinsight,text/csv,text/tab-separated-values,application/json" aria-label={copy.importLabel} onChange={importFile} data-insight-import-input="true"/>
        </label>
        <label className="insight-tool-text flex items-center gap-1" data-insight-passphrase-label="true">{copy.passphraseLabel}
          <input type="password" value={passphrase} onChange={(event)=>setPassphrase(event.target.value)} aria-label={copy.passphraseLabel} data-insight-passphrase="true" className="insight-input"/>
        </label>
        <button type="button" onClick={saveEncrypted} data-insight-export="vinsight" className="insight-tool-text"><Lock className="w-3.5 h-3.5"/>{copy.exportEncrypted}</button>
        <button type="button" onClick={sealSnapshot} data-insight-seal-snapshot="true" className="insight-tool-text"><HardDriveDownload className="w-3.5 h-3.5"/>{copy.sealSnapshot}</button>
        <button type="button" onClick={verifySnapshot} data-insight-verify-snapshot="true" className="insight-tool-text"><HardDriveUpload className="w-3.5 h-3.5"/>{copy.verifySnapshot}</button>
        <button type="button" onClick={saveCsv} data-vgt-app-guide-anchor="Insight:second" className="insight-tool-text"><Download className="w-3.5 h-3.5"/>{copy.csv}</button>
        <button type="button" onClick={saveXlsx} data-insight-export="xlsx" className="insight-tool-text"><FileSpreadsheet className="w-3.5 h-3.5"/>{copy.exportXlsx}</button>
        <button type="button" onClick={savePdf} data-insight-export="pdf" className="insight-tool-text"><FileText className="w-3.5 h-3.5"/>{copy.exportPdf}</button>
      </div>
    </div>
    <div className="px-4 py-1.5 border-b border-purple-500/10 flex items-center justify-between text-[0.625rem] text-slate-400" aria-live="polite"><span>{status}</span><span className="flex items-center gap-1">{networkCapability==='None'?<WifiOff className="w-3 h-3"/>:<ShieldCheck className="w-3 h-3"/>} {copy.network}: {localizedCapability} · {copy.accessibilityFindings}: {a11y.filter(f=>f.severity==='error').length}</span></div>
    {load.state==='unreadable'&&<p role="alert" className="px-4 py-2 text-[0.6875rem] text-amber-200 bg-amber-950/40 border-b border-amber-500/30">{copy.sampleDatasetNotice(load.reason)}</p>}
    {load.state==='migrated'&&<p role="status" className="px-4 py-2 text-[0.6875rem] text-purple-200 bg-purple-950/40 border-b border-purple-500/30">{copy.legacyDatasetNotice(load.reason)}</p>}
    {importReport&&<section className="px-4 py-2 border-b border-purple-500/20 bg-[#0c0817] text-[0.625rem] text-slate-300" data-insight-import-report={importReport.ok?'ok':'refused'} aria-label={copy.importLabel}>
      <p role={importReport.ok?'status':'alert'}>{importReport.ok?copy.imported(importReport.rows,importReport.skippedRows):copy.importRefused(importReport.reason)}</p>
      {importReport.missingColumns.length>0&&<p data-insight-import-missing={importReport.missingColumns.join(',')}>{copy.columns} {importReport.missingColumns.join(', ')}</p>}
      {importReport.columns.length>0&&<p className="font-mono" data-insight-import-types={importReport.columns.length}>{importReport.columns.map(column=>`${column.name}:${column.type}`).join(' · ')}</p>}
      {importReport.mismatches.length>0&&<p data-insight-import-mismatches={importReport.mismatches.length} className="font-mono">{importReport.mismatches.map(entry=>`${entry.column}:${entry.declared}≠${entry.observed}`).join(' · ')}</p>}
      {importReport.errors.length>0&&<ul className="mt-1 font-mono" data-insight-import-errors={importReport.errors.length}>
        {importReport.errors.slice(0,20).map(error=><li key={`${error.row}-${error.column}-${error.code}`}>{error.row} · {error.column||'-'} · {error.code}</li>)}
      </ul>}
    </section>}
    <p className="sr-only" aria-live="polite">{accessibilitySummary}</p>
    <div className="flex-1 overflow-auto" onClick={(event)=>{if(event.target===event.currentTarget)setCrossFilter(null);}}><div style={{transform:`scale(${zoom})`,transformOrigin:'top left',width:`${100/zoom}%`,height:`${100/zoom}%`}} className="min-h-full">
      <section className="px-4 pt-4" aria-label={copy.revenueByRegion} data-insight-cross-filter="region">
        <div className="mb-2 flex items-center justify-between text-[0.625rem] text-slate-400"><span>{copy.revenueByRegion}</span>{crossFilter&&<button type="button" className="rounded px-2 py-1 text-purple-300 hover:bg-white/5" onClick={()=>setCrossFilter(null)}>{copy.clearFilter}</button>}</div>
        <div className="flex h-9 overflow-hidden rounded-lg border border-purple-500/20 bg-[#0e0a1b]" onClick={(event)=>{if(event.target===event.currentTarget)setCrossFilter(null);}}>{regionSegments.map((segment,index)=><button key={segment.region} type="button" data-vgt-app-guide-anchor={index===0?'Insight:first':undefined} aria-pressed={crossFilter?.value===segment.region} aria-label={`${copy.filterToRegion(segment.region,Math.round(segment.share*100))} · ${formatInsightUsd(segment.revenue,locale)}`} title={`${segment.region} · ${formatInsightUsd(segment.revenue,locale)}`} onClick={(event)=>{event.stopPropagation();setCrossFilter(current=>current?.value===segment.region?null:{field:'region',value:segment.region});setStatus(copy.crossFilterApplied(segment.region));}} className={`insight-region-segment min-w-[72px] px-2 text-[0.625rem] font-semibold transition-[filter,opacity] ${crossFilter&&crossFilter.value!==segment.region?'opacity-35':'opacity-100'} hover:brightness-125`} style={{width:`${Math.max(12,segment.share*100)}%`}}>{segment.region}</button>)}</div>
        <p className="insight-region-caption mt-1 text-[0.625rem] text-slate-400" data-insight-region-total={regionSegments.length?regionTotal:'none'}>{regionSegments.length?copy.regionTotal(formatInsightUsd(regionTotal,locale),regionSegments.length):copy.noRowsInScope}</p>
      </section>
      <section className="px-4 py-2 border-b border-purple-500/20 bg-[#0c0817] flex flex-wrap items-end gap-3 text-[0.625rem] text-slate-400" data-insight-authoring="true" aria-label={copy.authoringTitle}>
        <strong className="text-purple-300 uppercase tracking-wider">{copy.authoringTitle}</strong>
        <label className="flex flex-col gap-0.5">{copy.datasetNameLabel}
          <input value={datasetDraft} onChange={(event)=>setDatasetDraft(event.target.value)} aria-label={copy.datasetNameLabel} data-insight-dataset-name="true" className="insight-input"/>
        </label>
        <button type="button" onClick={createDataset} className="insight-tool-text" data-insight-create-dataset="true">{copy.createDataset}</button>
        <label className="flex flex-col gap-0.5">{copy.kpiTitleLabel}
          <input value={kpiTitleDraft} onChange={(event)=>setKpiTitleDraft(event.target.value)} aria-label={copy.kpiTitleLabel} data-insight-kpi-title="true" className="insight-input"/>
        </label>
        <label className="flex flex-col gap-0.5">{copy.kpiMeasureLabel}
          <select value={kpiMeasureDraft} onChange={(event)=>setKpiMeasureDraft(event.target.value as InsightKpiMeasure)} aria-label={copy.kpiMeasureLabel} data-insight-kpi-measure="true" className="insight-input">
            {(['revenue','margin','activeUsers','anomaly'] as const).map((measure)=><option key={measure} value={measure}>{copy.measureLabel(measure)}</option>)}
          </select>
        </label>
        <button type="button" onClick={createKpi} className="insight-tool-text" data-insight-create-kpi="true">{copy.createKpi}</button>
        {/* W-392: edit, reorder and remove an existing card; the select loads it into the drafts above. */}
        <label className="flex flex-col gap-0.5">{copy.kpiCardLabel}
          <select value={kpiEditId} onChange={(event)=>{
            const id=event.target.value;
            setKpiEditId(id);
            const card=model.kpis.find((entry)=>entry.id===id);
            if(card){setKpiTitleDraft(card.title);setKpiMeasureDraft(card.measure??'revenue');}
          }} aria-label={copy.kpiCardLabel} data-insight-kpi-select="true" className="insight-input">
            <option value="">{copy.createKpi}</option>
            {model.kpis.map((card)=><option key={card.id} value={card.id}>{card.title}</option>)}
          </select>
        </label>
        <button type="button" onClick={applyKpiEdit} disabled={!kpiEditId} className="insight-tool-text" data-insight-update-kpi="true">{copy.updateKpi}</button>
        <button type="button" onClick={()=>moveKpi(-1)} disabled={!kpiEditId} className="insight-tool-text" data-insight-kpi-up="true">{copy.moveKpiUp}</button>
        <button type="button" onClick={()=>moveKpi(1)} disabled={!kpiEditId} className="insight-tool-text" data-insight-kpi-down="true">{copy.moveKpiDown}</button>
        <button type="button" onClick={removeKpi} disabled={!kpiEditId} className="insight-tool-text" data-insight-remove-kpi="true">{copy.removeKpi}</button>
        <label className="flex flex-col gap-0.5">{copy.workspaceSourceLabel}
          <select value={workspaceSourceDraft} onChange={(event)=>setWorkspaceSourceDraft(event.target.value)} aria-label={copy.workspaceSourceLabel} data-insight-workspace-source="true" className="insight-input">
            <option value="">{workspaceCandidates.some((candidate)=>candidate.readable)?copy.workspaceSourceLabel:copy.noWorkspaceSources}</option>
            {workspaceCandidates.map((candidate)=><option key={candidate.id} value={candidate.id} disabled={!candidate.readable} title={candidate.sourceKind}>{candidate.title} · v{candidate.version}</option>)}
          </select>
        </label>
        <button type="button" onClick={connectWorkspaceSource} className="insight-tool-text" data-insight-connect-source="true">{copy.connectSource}</button>
        {authoringError&&<p role="alert" className="text-amber-300" data-insight-authoring-error={authoringError}>{copy.authoringFailed(authoringError)}</p>}
      </section>
      <InsightKpiCards kpis={projectedKpis}/><InsightReportCanvas model={model} documentId={document.id} crossFilter={crossFilter} onCrossFilter={setCrossFilter} onUpdateModel={updateModel}/><div className="insight-data-layout"><InsightPivotTable model={filteredModel} onUpdateModel={updateModel}/><InsightQueryBuilder model={model} onUpdateModel={updateModel} onExecute={execute}/></div>
    </div></div>
    <InsightReportFooter model={model} online={networkCapability!=='None'}/>
  </div>;
};
