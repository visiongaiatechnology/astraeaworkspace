// STATUS: DIAMANT VGT SUPREME — Astraea Automate workspace view backed by canonical flow/history cores.
import React, { useEffect, useMemo, useState } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { AutomatePalette } from '../toolbar/AutomatePalette'; import { AutomateCanvas } from '../canvas/AutomateCanvas'; import { AutomateRunDrawer } from '../execution/AutomateRunDrawer'; import { AutomateNodeInspector } from '../panels/AutomateNodeInspector';
import { DEFAULT_AUTOMATE_MODEL, type AutomateDocumentModel, type FlowExecutionRun } from '../model/types';
import { buildRunPreview, normalizeAutomateModel, validateFlowModel } from '../model/automateFlowCore';
import { auditAutomateAccessibility } from '../nodes/automateAccessibilityEngine';
import { isImeCompositionEvent } from '../../../shared/accessibility/accessibilityPlatform';
import { canRedoAutomate, canUndoAutomate, createAutomateHistory, pushAutomateHistory, redoAutomateHistory, undoAutomateHistory } from '../state/automateHistoryEngine';
import { resolveAutomateRunOutcome, buildTrialStep, buildTrialRun } from '../execution/automateTrialRunCore';
import { addAutomateConnection, flowRefusalIssues, undeclaredFlowCapabilities, validateFlowConfigValues, validateFlowTriggerConfigs, type CreateConnectionInput } from '../model/automateEditingCore';
import { Bug, Play, Redo2, Undo2, Workflow, ZoomIn, ZoomOut } from 'lucide-react';
import '../canvas/AutomateCanvasTheme.css';
import { useAutomateCopy } from '../locale/automateLocale';
interface Props{document:WorkspaceDocument;onUpdateDocument:(doc:WorkspaceDocument)=>void;}
export const AutomateView:React.FC<Props>=({document,onUpdateDocument})=>{
 const copy=useAutomateCopy();
 const initial=normalizeAutomateModel((document as WorkspaceDocument&{automateData?:unknown}).automateData,DEFAULT_AUTOMATE_MODEL);
 const [history,setHistory]=useState(()=>createAutomateHistory(initial)); const [uiScale,setUiScale]=useState(1); const [executionNotice,setExecutionNotice]=useState(''); const [trialState,setTrialState]=useState<'idle'|'blocked'|'trial'>('idle'); const [connectingFrom,setConnectingFrom]=useState<string|null>(null); const [edgeSeed,setEdgeSeed]=useState(0); const model=history.present;
 const issues=useMemo(()=>validateFlowModel(model),[model]); const a11yIssues=useMemo(()=>auditAutomateAccessibility(model),[model]); const capabilityGaps=useMemo(()=>undeclaredFlowCapabilities(model),[model]); const triggerConfigIssues=useMemo(()=>validateFlowTriggerConfigs(model),[model]); const configValueIssues=useMemo(()=>validateFlowConfigValues(model),[model]);
 // A flow whose actions need capabilities the document never declared, whose trigger config cannot
 // satisfy the trigger contract, or whose stored parameter *values* are wrong, is not admissible: the
 // trial gate closes before anything is reported as checked. A merely absent field is NOT a refusal —
 // it has a declared fallback and the inspector offers it.
 const graphIssues=issues.length+capabilityGaps.length+triggerConfigIssues.length+configValueIssues.length;
 /** The exact, named refusals a load would produce. One definition lives in the editing core. */
 const loadIssues=useMemo(()=>flowRefusalIssues(model),[model]);
 const persist=(next:AutomateDocumentModel)=>onUpdateDocument({...document,modified_at:Date.now(),automateData:next} as WorkspaceDocument);
 useEffect(()=>{const incoming=normalizeAutomateModel((document as WorkspaceDocument&{automateData?:unknown}).automateData,DEFAULT_AUTOMATE_MODEL);if(incoming.flowId!==model.flowId)setHistory(createAutomateHistory(incoming));},[document.id]);
 const update=(fn:(p:AutomateDocumentModel)=>AutomateDocumentModel)=>setHistory(prev=>{const next=pushAutomateHistory(prev,fn(prev.present));persist(next.present);return next;});
 const undo=()=>setHistory(prev=>{const next=undoAutomateHistory(prev);persist(next.present);return next;}); const redo=()=>setHistory(prev=>{const next=redoAutomateHistory(prev);persist(next.present);return next;});
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(isImeCompositionEvent(event)||(!event.ctrlKey&&!event.metaKey))return;if(event.key.toLowerCase()==='z'){event.preventDefault();if(event.shiftKey)redo();else undo();}else if(event.key.toLowerCase()==='y'){event.preventDefault();redo();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[document.id,history]);
 const simulate=async()=>{
  const order=buildRunPreview(model);
  const outcome=resolveAutomateRunOutcome({issueCount:graphIssues,order,nodes:model.nodes,flowVersion:model.version,now:Date.now()});
  setTrialState(outcome.trialState);
  if(outcome.notice==='invalidFlow'){setExecutionNotice(copy.invalidFlow);return;}
  const now=Date.now();
  const previewOrder=[...outcome.order];
  const titles=new Map(model.nodes.map(node=>[node.id,node.title]));
  const steps:FlowExecutionRun['steps']=[];
  update(p=>({...p,designer:{...p.designer,testMode:true,previewNodeIds:previewOrder},nodes:p.nodes.map(n=>({...n,lastExecutionStatus:undefined}))}));
  for(const id of previewOrder){
   const startedAt=Date.now();
   update(p=>({...p,nodes:p.nodes.map(n=>n.id===id?{...n,lastExecutionStatus:'running'}:n)}));
   await new Promise<void>(resolve=>setTimeout(resolve,80));
   const endedAt=Date.now();
   steps.push(buildTrialStep(id,titles.get(id)??id,startedAt,endedAt));
   update(p=>({...p,nodes:p.nodes.map(n=>n.id===id?{...n,lastExecutionStatus:outcome.nodeStatus}:n)}));
  }
  const run=buildTrialRun(model,outcome,now,Date.now(),steps);
  update(p=>({...p,runs:[run,...p.runs].slice(0,200)}));
  setExecutionNotice(copy.trialNotice);
 };
 const startConnect=(nodeId:string)=>setConnectingFrom(nodeId);
 const cancelConnect=()=>setConnectingFrom(null);
 const completeConnect=(toNodeId:string)=>{
  const from=connectingFrom;
  setConnectingFrom(null);
  if(from===null||from===toNodeId)return;
  const seed=`${Date.now().toString(36)}-${edgeSeed}`;
  try{
   // No port ids are supplied: the palette's triggers expose `event`, conditions expose `true`/`false`
   // and `finally` exposes none, so naming `output`/`input` here would refuse a legal edge. The core
   // validates the ids when the caller does supply them.
   const next=addAutomateConnection(model,{fromNodeId:from,toNodeId,seed} as CreateConnectionInput);
   setEdgeSeed(n=>n+1);
   update(()=>next);
  }catch(error){
   // Refusal is visible and named — a rejected edge never changes the document.
   setExecutionNotice(error instanceof Error?error.message:'edge-rejected');
  }
 };
 return <div data-vgt-automate-root="true" className="automate-root flex-1 flex flex-col h-full overflow-hidden" style={{fontSize:`${uiScale}rem`}}>
  <header className="automate-header h-12 px-4 flex items-center justify-between">
   <div className="flex min-w-0 items-center gap-2">
    <Workflow className="automate-brand-icon w-4 h-4 shrink-0"/>
    <span className="automate-brand text-xs font-bold uppercase tracking-wider">{copy.productTitle}</span>
    <span className="automate-separator text-xs">/</span>
    <span className="automate-flow-name truncate text-xs font-mono">{model.flowName} v{model.version}</span>
    <span aria-live="polite" className="automate-meta text-[0.625rem]">{copy.graphIssues(issues.length)} · {copy.accessibilityIssues(a11yIssues.length)}{capabilityGaps.length>0?` · ${copy.capabilityFindings(capabilityGaps.length)}`:''}{executionNotice ? ` · ${executionNotice}` : ''}</span>
   </div>
   <div className="automate-toolbar flex shrink-0 items-center gap-1" role="toolbar" aria-label={copy.toolbar}>
    <button aria-label={copy.undo} disabled={!canUndoAutomate(history)} onClick={undo} className="automate-control-button p-1.5"><Undo2 className="w-3.5 h-3.5"/></button>
    <button aria-label={copy.redo} disabled={!canRedoAutomate(history)} onClick={redo} className="automate-control-button p-1.5"><Redo2 className="w-3.5 h-3.5"/></button>
    <button aria-label={copy.decreaseScale} onClick={()=>setUiScale(v=>Math.max(1,Math.round((v-.1)*10)/10))} className="automate-control-button p-1.5"><ZoomOut className="w-3.5 h-3.5"/></button>
    <span className="automate-zoom-label text-[0.625rem] w-10 text-center">{Math.round(uiScale*100)}%</span>
    <button aria-label={copy.increaseScale} onClick={()=>setUiScale(v=>Math.min(3,Math.round((v+.1)*10)/10))} className="automate-control-button p-1.5"><ZoomIn className="w-3.5 h-3.5"/></button>
    <button aria-pressed={model.designer.testMode} onClick={()=>update(p=>({...p,designer:{...p.designer,testMode:!p.designer.testMode}}))} className="automate-control-button px-2 py-1.5 text-xs"><Bug className="inline w-3.5 h-3.5 mr-1"/>{copy.testMode}</button>
    <button disabled={graphIssues>0} onClick={()=>void simulate()} data-vgt-app-guide-anchor="Automate:second" data-automate-trial-state={trialState} className="automate-primary-button px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"><Play className="w-3.5 h-3.5"/><span>{copy.runTrial}</span></button>
   </div>
  </header>
  <div className="automate-workspace-layout flex-1 flex overflow-hidden"><AutomatePalette onUpdateModel={update}/><AutomateCanvas model={model} onUpdateModel={update} connectingFromNodeId={connectingFrom} onStartConnect={startConnect} onCompleteConnect={completeConnect} onCancelConnect={cancelConnect}/><AutomateNodeInspector model={model} onUpdateModel={update}/><AutomateRunDrawer model={model} onUpdateModel={update} onTriggerSimulation={simulate} loadIssues={loadIssues}/></div>
 </div>;
};
