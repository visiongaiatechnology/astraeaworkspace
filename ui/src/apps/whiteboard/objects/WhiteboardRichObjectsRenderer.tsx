// STATUS: DIAMANT VGT SUPREME
import React from 'react';
import { Cloud, Database, FileText, Globe2, Server, Shield, UserRound } from 'lucide-react';
import type { WhiteboardItem } from '../types';

interface Props {
  items: WhiteboardItem[];
  selectedItemId: string | null;
  selectedItemIds?: readonly string[];
  handleItemMouseDown: (event: React.MouseEvent, item: WhiteboardItem) => void;
  updateItems: (fn: (items: WhiteboardItem[]) => WhiteboardItem[]) => void;
}

const iconByName = { server: Server, database: Database, cloud: Cloud, shield: Shield, user: UserRound, globe: Globe2 } as const;
const shell = (selected: boolean) => `absolute overflow-hidden border bg-slate-950/92 shadow-xl backdrop-blur-md ${selected ? 'border-cyan-400 ring-2 ring-cyan-400/25' : 'border-white/10 hover:border-white/20'}`;
const placement = (item: WhiteboardItem): React.CSSProperties => ({ left:item.x, top:item.y, width:item.width, height:item.height, transform:`rotate(${item.rotation ?? 0}deg)`, transformOrigin:'center', zIndex:item.zIndex ?? 0 });

function shapeStyle(item: WhiteboardItem): React.CSSProperties {
  const shape = item.shape!;
  const rotation = item.rotation ?? 0;
  const common: React.CSSProperties = { position:'absolute', left:item.x, top:item.y, width:item.width, height:item.height, background:shape.fill, border:`${shape.strokeWidth}px solid ${shape.stroke}`, transform:`rotate(${rotation}deg)`, transformOrigin:'center', zIndex:item.zIndex ?? 0 };
  if (shape.kind === 'ellipse') return { ...common, borderRadius:'50%' };
  if (shape.kind === 'rounded-rectangle') return { ...common, borderRadius:22 };
  if (shape.kind === 'diamond') return { ...common, transform:`rotate(${45 + rotation}deg) scale(.72)` };
  if (shape.kind === 'triangle') return { ...common, clipPath:'polygon(50% 0, 100% 100%, 0 100%)' };
  return common;
}

export const WhiteboardRichObjectsRenderer: React.FC<Props> = ({ items, selectedItemId, selectedItemIds = [], handleItemMouseDown, updateItems }) => <>
  {items.map((item) => {
    if (item.diagram) return null;
    const selected = selectedItemId === item.id || selectedItemIds.includes(item.id);
    if (item.type === 'shape' && item.shape) return <div key={item.id} className={`pointer-events-auto cursor-move ${selected?'ring-2 ring-cyan-400/40':''}`} style={shapeStyle(item)} onMouseDown={(event)=>handleItemMouseDown(event,item)}><div className={`flex h-full w-full items-center justify-center text-xs font-semibold text-slate-100 ${item.shape.kind === 'diamond' ? '-rotate-45 scale-[1.38]' : ''}`}>{item.text}</div></div>;
    if (item.type === 'icon' && item.icon) { const Icon = iconByName[item.icon.name] ?? Server; return <div key={item.id} className={`${shell(selected)} pointer-events-auto cursor-move rounded-2xl p-4`} style={placement(item)} onMouseDown={(event)=>handleItemMouseDown(event,item)}><div className="flex h-full flex-col items-center justify-center gap-2"><Icon className="h-10 w-10 text-cyan-300"/><span className="text-xs font-semibold text-slate-200">{item.icon.label}</span></div></div>; }
    if (item.type === 'table' && item.table) return <div key={item.id} className={`${shell(selected)} pointer-events-auto cursor-move rounded-xl p-3`} style={placement(item)} onMouseDown={(event)=>handleItemMouseDown(event,item)}><div className="mb-2 text-[0.5625rem] uppercase tracking-[.18em] text-cyan-400">Table</div><div className="overflow-hidden rounded border border-white/10 text-[0.625rem]"><div className="grid bg-white/[.06] font-semibold text-slate-200" style={{gridTemplateColumns:`repeat(${Math.max(1,item.table.columns.length)},minmax(0,1fr))`}}>{item.table.columns.map((cell,index)=><div key={index} className="truncate border-r border-white/5 px-2 py-1">{cell}</div>)}</div>{item.table.rows.slice(0,8).map((row,r)=><div key={r} className="grid text-slate-400" style={{gridTemplateColumns:`repeat(${Math.max(1,item.table!.columns.length)},minmax(0,1fr))`}}>{item.table!.columns.map((_,c)=><div key={c} className="truncate border-r border-t border-white/5 px-2 py-1">{row[c] ?? ''}</div>)}</div>)}</div></div>;
    if (item.type === 'card' && item.card) return <div key={item.id} className={`${shell(selected)} pointer-events-auto cursor-move rounded-2xl p-4`} style={placement(item)} onMouseDown={(event)=>handleItemMouseDown(event,item)}><div className="text-[0.5625rem] uppercase tracking-[.16em] text-blue-400">{item.card.cardKind === 'task' ? 'Task card' : 'Card'}</div><div className="mt-2 text-sm font-bold text-slate-100">{item.card.title}</div>{item.card.subtitle && <div className="mt-1 text-[0.6875rem] text-slate-400">{item.card.subtitle}</div>}<div className="mt-3 flex flex-wrap gap-1">{item.card.status && <span className="rounded bg-blue-500/15 px-2 py-1 text-[0.5625rem] text-blue-200">{item.card.status}</span>}{item.card.tags?.map(tag=><span key={tag} className="rounded bg-white/[.06] px-2 py-1 text-[0.5625rem] text-slate-400">#{tag}</span>)}</div></div>;
    if (item.type === 'document' && item.document) return <div key={item.id} className={`${shell(selected)} pointer-events-auto cursor-move rounded-2xl p-4`} style={placement(item)} onMouseDown={(event)=>handleItemMouseDown(event,item)}><div className="flex items-center gap-2 text-cyan-300"><FileText className="h-4 w-4"/><span className="text-[0.5625rem] uppercase tracking-[.16em]">{item.document.documentKind}</span></div><div className="mt-2 text-sm font-bold text-slate-100">{item.document.title}</div><p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[0.625rem] leading-relaxed text-slate-400">{item.document.excerpt}</p></div>;
    if (item.type === 'chart' && item.chart) { const max=Math.max(1,...item.chart.values.map(value=>Math.abs(value))); return <div key={item.id} className={`${shell(selected)} pointer-events-auto cursor-move rounded-2xl p-4`} style={placement(item)} onMouseDown={(event)=>handleItemMouseDown(event,item)}><div className="text-[0.625rem] font-semibold text-slate-200">{item.chart.title}</div><div className="mt-3 flex h-[calc(100%-36px)] items-end gap-2">{item.chart.values.slice(0,12).map((value,index)=><div key={index} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="w-full rounded-t bg-cyan-500/70" style={{height:`${Math.max(3,Math.abs(value)/max*100)}%`}} title={`${item.chart!.labels[index]}: ${value}`}/><span className="max-w-full truncate text-[0.5rem] text-slate-500">{item.chart!.labels[index]}</span></div>)}</div></div>; }
    if (item.type === 'code' && item.code) return <div key={item.id} className={`${shell(selected)} pointer-events-auto cursor-move rounded-xl`} style={placement(item)} onMouseDown={(event)=>handleItemMouseDown(event,item)}><div className="border-b border-white/10 px-3 py-2 font-mono text-[0.5625rem] uppercase text-emerald-400">{item.code.language}</div><pre className="h-[calc(100%-34px)] overflow-auto p-3 text-[0.625rem] leading-relaxed text-slate-300 select-text"><code>{item.code.code}</code></pre></div>;
    if (item.type === 'media' && item.media) return <div key={item.id} className={`${shell(selected)} pointer-events-auto cursor-move rounded-2xl p-3`} style={placement(item)} onMouseDown={(event)=>handleItemMouseDown(event,item)}><div className="mb-2 text-[0.5625rem] uppercase tracking-[.16em] text-fuchsia-300">Local {item.media.mediaKind}</div>{item.media.dataUrl ? item.media.mediaKind === 'video' ? <video src={item.media.dataUrl} controls preload="metadata" className="h-[calc(100%-28px)] w-full rounded object-contain" onMouseDown={(event)=>event.stopPropagation()}/> : <audio src={item.media.dataUrl} controls preload="metadata" className="mt-5 w-full" onMouseDown={(event)=>event.stopPropagation()}/> : <div className="flex h-[calc(100%-28px)] items-center justify-center rounded border border-dashed border-white/10 text-[0.625rem] text-slate-500">Insert a validated local media file</div>}</div>;
    if (item.type === 'reaction' && item.reaction) return <button key={item.id} type="button" className={`${shell(selected)} pointer-events-auto cursor-pointer rounded-full px-4`} style={placement(item)} onMouseDown={(event)=>handleItemMouseDown(event,item)} onClick={(event)=>{event.stopPropagation();updateItems(previous=>previous.map(candidate=>candidate.id===item.id&&candidate.reaction?{...candidate,reaction:{...candidate.reaction,count:Math.min(1_000_000,candidate.reaction.count+1)}}:candidate));}} aria-label={`${item.reaction.label}, ${item.reaction.count} votes`}><span className="text-2xl">{item.reaction.emoji}</span><span className="ml-2 text-sm font-bold text-slate-100">{item.reaction.count}</span><span className="ml-2 text-[0.625rem] text-slate-400">{item.reaction.label}</span></button>;
    return null;
  })}
</>;
