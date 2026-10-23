// STATUS: DIAMANT VGT SUPREME
import React, { useMemo, useState } from 'react';
import { GitBranch, Network, Route, X } from 'lucide-react';
import type { WhiteboardConnectorRoute } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardObjectsText } from '../whiteboardObjectsLocale';
import type { WhiteboardItem } from '../types';
import {
  autoLayoutWhiteboardDiagram,
  createWhiteboardDiagramPreset,
  setWhiteboardConnectorLabel,
  setWhiteboardConnectorRoute,
  type WhiteboardDiagramLayoutMode,
  type WhiteboardDiagramPreset,
} from '../model/whiteboardDiagramEngine';

interface Props {
  items: WhiteboardItem[];
  selectedIds: readonly string[];
  origin: { x: number; y: number };
  updateItems: (fn: (items: WhiteboardItem[]) => WhiteboardItem[]) => void;
  /** Adds one mind-map child node to the selected node; provided by the canvas, never re-implemented here. */
  onAddChildNode?: () => void;
  onClose: () => void;
  showToast: (message: string) => void;
}

const presets: Array<[WhiteboardDiagramPreset,string]> = [
  ['flowchart','Flowchart'],['uml','UML basics'],['network','Architecture'],['org-chart','Org chart'],['mind-map','Mind map'],['erd','ER diagram'],['swimlane','Swimlanes'],['process-map','Process map'],['journey-map','Journey map'],
];

export const WhiteboardDiagramPanel: React.FC<Props> = ({items,selectedIds,origin,updateItems,onAddChildNode,onClose,showToast}) => {
  const { locale } = useWorkspaceLocale();
  const [route,setRoute]=useState<WhiteboardConnectorRoute>('orthogonal');
  const [label,setLabel]=useState('');
  const connectorIds=useMemo(()=>selectedIds.filter(id=>items.find(item=>item.id===id)?.type==='connector'),[items,selectedIds]);
  const diagramSelection=useMemo(()=>selectedIds.filter(id=>Boolean(items.find(item=>item.id===id)?.diagram)),[items,selectedIds]);
  const insert=(preset:WhiteboardDiagramPreset)=>{
    const created=createWhiteboardDiagramPreset(preset,origin.x,origin.y);
    updateItems(prev=>[...prev,...created]);
    showToast(`Inserted ${preset.replace('-', ' ')} diagram`);
  };
  const applyRoute=()=>{
    if(connectorIds.length===0){showToast('Select one or more connectors first');return;}
    updateItems(prev=>setWhiteboardConnectorRoute(prev,connectorIds,route,true));
    showToast(`${route} routing applied`);
  };
  const applyLabel=()=>{
    if(connectorIds.length===0){showToast('Select one or more connectors first');return;}
    updateItems(prev=>setWhiteboardConnectorLabel(prev,connectorIds,label));
    showToast(label.trim()?'Connector label updated':'Connector label cleared');
  };
  const layout=(mode:WhiteboardDiagramLayoutMode)=>{
    updateItems(prev=>autoLayoutWhiteboardDiagram(prev,diagramSelection,mode));
    showToast(`${mode.replace('-', ' ')} layout applied`);
  };
  return <div className="whiteboard-dock whiteboard-dock--right-top absolute right-5 top-20 z-31 w-[340px] rounded-2xl border border-cyan-400/20 bg-slate-950/96 p-4 shadow-2xl backdrop-blur-xl" data-whiteboard-dock="diagram" role="dialog" aria-label="Whiteboard diagramming tools">
    <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold text-slate-100"><GitBranch className="h-4 w-4 text-cyan-300"/>Diagramming</div><button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10" aria-label="Close diagramming tools"><X className="h-4 w-4"/></button></div>
    <div className="text-[0.5625rem] font-bold uppercase tracking-[.18em] text-slate-500">Diagram starters</div>
    <div className="mt-2 grid grid-cols-3 gap-1.5">{presets.map(([preset,title])=><button key={preset} type="button" onClick={()=>insert(preset)} className="rounded-lg border border-white/10 bg-white/[.03] px-2 py-2 text-[0.5625rem] text-slate-300 hover:border-cyan-400/30 hover:bg-cyan-400/[.05]">{title}</button>)}</div>
    {onAddChildNode && <>
      <button
        type="button"
        onClick={onAddChildNode}
        disabled={selectedIds.length === 0}
        data-vgt-whiteboard-add-child="true"
        title={whiteboardObjectsText('addChildNodeTitle', locale)}
        className="mt-2 w-full rounded-lg border border-cyan-400/20 bg-cyan-400/[.05] px-2 py-2 text-[0.5625rem] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
      >{whiteboardObjectsText('addChildNode', locale)}</button>
      <div className="mt-1 text-[0.5625rem] text-slate-600">{whiteboardObjectsText('addChildNodeTitle', locale)}</div>
    </>}
    <div className="my-3 h-px bg-white/10"/>
    <div className="flex items-center gap-2 text-[0.5625rem] font-bold uppercase tracking-[.18em] text-slate-500"><Route className="h-3 w-3"/>Connector routing</div>
    <div className="mt-2 flex gap-2"><select value={route} onChange={e=>setRoute(e.target.value as WhiteboardConnectorRoute)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.625rem] text-slate-200"><option value="orthogonal">Orthogonal + auto-route</option><option value="curved">Curved</option><option value="straight">Straight</option></select><button type="button" onClick={applyRoute} className="rounded-lg border border-cyan-400/20 px-2 text-[0.5625rem] text-cyan-200">Apply</button></div>
    <div className="mt-2 flex gap-2"><input value={label} onChange={e=>setLabel(e.target.value.slice(0,200))} placeholder="Connector label" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.625rem] text-slate-200 outline-none"/><button type="button" onClick={applyLabel} className="rounded-lg border border-white/10 px-2 text-[0.5625rem] text-slate-300">Label</button></div>
    <div className="mt-1 text-[0.5625rem] text-slate-600">Selected connectors: {connectorIds.length}</div>
    <div className="my-3 h-px bg-white/10"/>
    <div className="flex items-center gap-2 text-[0.5625rem] font-bold uppercase tracking-[.18em] text-slate-500"><Network className="h-3 w-3"/>Auto layout</div>
    <div className="mt-2 grid grid-cols-3 gap-1.5"><button type="button" onClick={()=>layout('tree-horizontal')} className="rounded-lg border border-white/10 px-2 py-2 text-[0.5625rem] text-slate-300">Tree →</button><button type="button" onClick={()=>layout('tree-vertical')} className="rounded-lg border border-white/10 px-2 py-2 text-[0.5625rem] text-slate-300">Tree ↓</button><button type="button" onClick={()=>layout('graph')} className="rounded-lg border border-white/10 px-2 py-2 text-[0.5625rem] text-slate-300">Graph</button></div>
    <div className="mt-1 text-[0.5625rem] text-slate-600">Layouts apply to selected diagram nodes, or all diagram nodes when none are selected.</div>
  </div>;
};
