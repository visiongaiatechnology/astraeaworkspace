// STATUS: DIAMANT VGT SUPREME
import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Link2, Snowflake, X, Zap } from 'lucide-react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WhiteboardLiveObjectKind, WhiteboardLiveObjectMode } from '../../../shared/contracts/whiteboard/workspaceWhiteboard';
import type { WhiteboardItem } from '../types';
import { changeWhiteboardLiveObjectMode, createWhiteboardLiveObject, isWhiteboardLiveSource, liveObjectKindsForDocument } from './whiteboardLiveObjectEngine';

interface Props {
  currentDocumentId: string;
  documents: Record<string, WorkspaceDocument>;
  items: WhiteboardItem[];
  selectedItemId: string | null;
  origin: { x: number; y: number };
  updateItems: (fn: (items: WhiteboardItem[]) => WhiteboardItem[]) => void;
  onOpenWorkspaceDocument?: (documentId: string) => void;
  showToast: (message: string) => void;
  onClose: () => void;
}
const labels: Record<WhiteboardLiveObjectKind,string> = {
  'grid-range':'Grid range','grid-chart':'Grid chart','writer-excerpt':'Writer excerpt','present-slide':'Present slide','project-milestone-timeline':'Project milestone / timeline',
  'planner-board':'Planner board view','task-card':'Task card','form-result-chart':'Form result chart','database-view':'Database view','pdf-page':'PDF page','note-block':'Note page / block','vault-asset':'Vault asset',
};
const modeIcon = (mode: WhiteboardLiveObjectMode) => mode === 'Live' ? Zap : mode === 'Frozen' ? Snowflake : Link2;

export const WhiteboardLiveObjectsPanel: React.FC<Props> = ({ currentDocumentId, documents, items, selectedItemId, origin, updateItems, onOpenWorkspaceDocument, showToast, onClose }) => {
  const sources = useMemo(() => Object.values(documents).filter((doc) => doc.id !== currentDocumentId && isWhiteboardLiveSource(doc)).sort((a,b)=>a.title.localeCompare(b.title)), [currentDocumentId, documents]);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const source = documents[sourceId];
  const kinds = liveObjectKindsForDocument(source);
  const [kind, setKind] = useState<WhiteboardLiveObjectKind>(kinds[0] ?? 'writer-excerpt');
  const [mode, setMode] = useState<WhiteboardLiveObjectMode>('Live');
  const [selector, setSelector] = useState('');
  const selected = items.find((item) => item.id === selectedItemId && item.type === 'live' && item.liveObject);
  useEffect(() => { if (!sourceId && sources[0]) setSourceId(sources[0].id); }, [sourceId, sources]);
  useEffect(() => { if (source && !kinds.includes(kind)) setKind(kinds[0] ?? 'writer-excerpt'); }, [source, kinds, kind]);

  const insert = () => {
    if (!source || !kinds.includes(kind)) return;
    try {
      const item = createWhiteboardLiveObject({ source, kind, mode, selector, x:origin.x, y:origin.y });
      updateItems((previous) => [...previous, item]); showToast(`${labels[kind]} inserted in ${mode} mode.`);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Live object insertion failed.'); }
  };
  const changeMode = (next: WhiteboardLiveObjectMode) => {
    if (!selected) return;
    try { updateItems((previous) => previous.map((item) => item.id === selected.id ? changeWhiteboardLiveObjectMode(item, next, documents) : item)); showToast(`Live object switched to ${next}.`); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Mode change failed.'); }
  };

  return <aside className="whiteboard-dock whiteboard-dock--right-top absolute right-4 top-20 z-45 w-[360px] max-h-[72vh] overflow-auto rounded-2xl border border-cyan-400/20 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl pointer-events-auto" data-whiteboard-dock="live-objects" onMouseDown={(e)=>e.stopPropagation()}>
    <div className="flex items-center justify-between"><div><div className="text-[0.625rem] font-bold uppercase tracking-[.18em] text-cyan-300">Workspace live objects</div><div className="text-[0.5625rem] text-slate-500">Canonical source · no shadow document</div></div><button aria-label="Close Whiteboard Live Objects panel" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-white/10"><X className="h-4 w-4"/></button></div>
    <div className="mt-3 space-y-2">
      <label className="block text-[0.5625rem] text-slate-400">Source document<select value={sourceId} onChange={(e)=>setSourceId(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.625rem] text-slate-200"><option value="">No compatible source</option>{sources.map((doc)=><option key={doc.id} value={doc.id}>{doc.title} · {doc.kind}</option>)}</select></label>
      <label className="block text-[0.5625rem] text-slate-400">Object type<select value={kind} onChange={(e)=>setKind(e.target.value as WhiteboardLiveObjectKind)} disabled={!source} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.625rem] text-slate-200 disabled:opacity-40">{kinds.map((entry)=><option key={entry} value={entry}>{labels[entry]}</option>)}</select></label>
      {source?.kind === 'Vault' && kind === 'vault-asset' ? <label className="block text-[0.5625rem] text-slate-400">Vault asset<select value={selector} onChange={(e)=>setSelector(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.625rem] text-slate-200"><option value="">First safe asset</option>{(source.vaultData?.files ?? []).filter((file)=>!['quarantined','corrupt','missing'].includes(file.status ?? 'available')).slice(0,10000).map((file)=><option key={file.id} value={file.id}>{file.name} · {file.mimeType || file.kind}</option>)}</select></label> : <label className="block text-[0.5625rem] text-slate-400">Selector <span className="text-slate-600">(optional stable object/page/task id)</span><input value={selector} maxLength={512} onChange={(e)=>setSelector(e.target.value)} placeholder="Leave empty for first/default view" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.625rem] text-slate-200 outline-none"/></label>}
      <div className="grid grid-cols-3 gap-1">{(['Live','Frozen','Link'] as WhiteboardLiveObjectMode[]).map((entry)=>{const Icon=modeIcon(entry);return <button key={entry} type="button" onClick={()=>setMode(entry)} className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[0.5625rem] ${mode===entry?'border-cyan-400/30 bg-cyan-400/10 text-cyan-200':'border-white/10 text-slate-400'}`}><Icon className="h-3 w-3"/>{entry}</button>})}</div>
      <button disabled={!source} onClick={insert} className="w-full rounded-lg border border-cyan-400/20 bg-cyan-400/10 py-2 text-[0.625rem] font-semibold text-cyan-100 disabled:opacity-40">Insert live object</button>
    </div>
    <div className="mt-4 border-t border-white/10 pt-3"><div className="text-[0.5625rem] font-semibold uppercase tracking-[.14em] text-slate-400">Selected live object</div>{selected?.liveObject ? <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[.025] p-2"><div className="text-[0.625rem] text-slate-200">{labels[selected.liveObject.kind]}</div><code className="block break-all text-[0.5rem] text-slate-600">{selected.liveObject.sourceUri}</code><div className="grid grid-cols-3 gap-1">{(['Live','Frozen','Link'] as WhiteboardLiveObjectMode[]).map((entry)=><button key={entry} onClick={()=>changeMode(entry)} className={`rounded border px-1 py-1 text-[0.5rem] ${selected.liveObject!.mode===entry?'border-violet-400/30 bg-violet-400/10 text-violet-200':'border-white/10 text-slate-500'}`}>{entry}</button>)}</div>{onOpenWorkspaceDocument&&<button onClick={()=>onOpenWorkspaceDocument(selected.liveObject!.sourceDocumentId)} className="flex w-full items-center justify-center gap-1 rounded border border-white/10 py-1 text-[0.5625rem] text-slate-400"><ExternalLink className="h-3 w-3"/>Open source</button>}</div>:<div className="mt-2 text-[0.5625rem] text-slate-600">Select a live object on the canvas to change mode.</div>}</div>
  </aside>;
};
