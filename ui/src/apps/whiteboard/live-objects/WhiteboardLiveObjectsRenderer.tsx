// STATUS: DIAMANT VGT SUPREME
import React from 'react';
import { ExternalLink, Link2, Snowflake, Zap } from 'lucide-react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { resolveWhiteboardLiveObject } from './whiteboardLiveObjectEngine';

interface Props { items: WhiteboardItem[]; documents: Record<string, WorkspaceDocument>; selectedItemId: string | null; selectedItemIds?: readonly string[]; handleItemMouseDown: (event: React.MouseEvent,item:WhiteboardItem)=>void; onOpenWorkspaceDocument?: (documentId:string)=>void; }
const labelForKind = (kind:string) => kind.replaceAll('-', ' ');
export const WhiteboardLiveObjectsRenderer: React.FC<Props> = ({ items, documents, selectedItemId, selectedItemIds=[], handleItemMouseDown, onOpenWorkspaceDocument }) => <>
  {items.filter((item)=>item.type==='live'&&item.liveObject).map((item)=>{
    const live=item.liveObject!; const resolved=resolveWhiteboardLiveObject(item,documents); if(!resolved)return null; const snap=resolved.snapshot;
    const selected=selectedItemId===item.id||selectedItemIds.includes(item.id); const Icon=live.mode==='Live'?Zap:live.mode==='Frozen'?Snowflake:Link2; const max=Math.max(1,...(snap.values??[]).map((value)=>Math.abs(value)));
    return <article key={item.id} onMouseDown={(event)=>handleItemMouseDown(event,item)} style={{position:'absolute',left:item.x,top:item.y,width:item.width,height:item.height,transform:`rotate(${item.rotation??0}deg)`,transformOrigin:'center',zIndex:item.zIndex??0}} className={`pointer-events-auto cursor-move overflow-hidden rounded-2xl border bg-slate-950/95 shadow-2xl backdrop-blur-md ${selected?'border-cyan-300 ring-2 ring-cyan-300/25':'border-cyan-400/15'}`}>
      <header className="flex items-center justify-between border-b border-white/10 bg-cyan-400/[.045] px-3 py-2"><div className="min-w-0"><div className="truncate text-[0.5rem] font-bold uppercase tracking-[.16em] text-cyan-300">{labelForKind(live.kind)}</div><div className="mt-0.5 flex items-center gap-1 text-[0.5rem] text-slate-500"><Icon className="h-2.5 w-2.5"/>{live.mode} · v{snap.sourceVersion}{live.mode==='Live'&&!resolved.available?' · source unavailable':''}</div></div>{onOpenWorkspaceDocument&&<button type="button" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();onOpenWorkspaceDocument(live.sourceDocumentId)}} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-cyan-200" aria-label="Open source document" title="Open source document"><ExternalLink className="h-3.5 w-3.5"/></button>}</header>
      <div className="h-[calc(100%-45px)] overflow-hidden p-3"><div className="truncate text-sm font-bold text-slate-100">{snap.title}</div>{snap.subtitle&&<div className="mt-0.5 truncate text-[0.5625rem] text-slate-500">{snap.subtitle}</div>}{(snap.values?.length??0)>0?<div className="mt-3 flex h-[86px] items-end gap-1.5">{snap.values!.slice(0,12).map((value,index)=><div key={index} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="w-full rounded-t bg-cyan-500/65" style={{height:`${Math.max(3,Math.abs(value)/max*100)}%`}} title={`${snap.labels?.[index]??index}: ${value}`}/><span className="max-w-full truncate text-[0.4375rem] text-slate-600">{snap.labels?.[index]??''}</span></div>)}</div>:<div className="mt-2 space-y-1">{snap.lines.slice(0,7).map((line,index)=><div key={index} className="truncate text-[0.5625rem] leading-4 text-slate-400">{line}</div>)}</div>}</div>
    </article>;
  })}
</>;
