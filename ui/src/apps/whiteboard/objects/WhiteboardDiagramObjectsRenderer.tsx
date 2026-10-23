// STATUS: DIAMANT VGT SUPREME
import React from 'react';
import { Cloud, Database, Globe2, Network, Server, Shield, UserRound } from 'lucide-react';
import type { WhiteboardItem } from '../types';

interface Props {
  items: WhiteboardItem[];
  selectedItemId: string | null;
  selectedItemIds?: readonly string[];
  handleItemMouseDown: (event: React.MouseEvent, item: WhiteboardItem) => void;
}

const iconMap = { server: Server, database: Database, cloud: Cloud, shield: Shield, user: UserRound, globe: Globe2 } as const;

function boxClass(item: WhiteboardItem, selected: boolean) {
  const family = item.diagram?.family;
  const accent = family === 'journey-map' ? 'border-amber-400/60' : family === 'uml' || family === 'erd' ? 'border-violet-400/60' : 'border-cyan-400/50';
  return `absolute pointer-events-auto cursor-move overflow-hidden border bg-slate-950/94 shadow-xl backdrop-blur-md ${accent} ${selected ? 'ring-2 ring-cyan-300/60' : ''}`;
}

const styleFor = (item: WhiteboardItem): React.CSSProperties => ({
  left:item.x, top:item.y, width:item.width, height:item.height,
  zIndex:item.zIndex ?? 0, transform:`rotate(${item.rotation ?? 0}deg)`, transformOrigin:'center',
});

export const WhiteboardDiagramObjectsRenderer: React.FC<Props> = ({items,selectedItemId,selectedItemIds=[],handleItemMouseDown}) => <>
  {items.filter(item=>item.diagram && item.type!=='connector').map(item=>{
    const diagram=item.diagram!;
    const selected=selectedItemId===item.id || selectedItemIds.includes(item.id);
    const common={key:item.id,onMouseDown:(event:React.MouseEvent)=>handleItemMouseDown(event,item),style:styleFor(item)};
    if(diagram.kind==='swimlane') return <div {...common} className={`${boxClass(item,selected)} rounded-xl border-dashed bg-slate-900/35`}><div className="h-full border-l-4 border-cyan-400/40 p-3"><div className="text-[0.625rem] font-bold uppercase tracking-[.18em] text-cyan-200">Swimlane</div><div className="mt-1 text-sm font-semibold text-slate-200">{diagram.title}</div></div></div>;
    if(diagram.family==='network' && item.icon){const Icon=iconMap[item.icon.name]??Network;return <div {...common} className={`${boxClass(item,selected)} rounded-2xl p-3`}><div className="flex h-full flex-col items-center justify-center gap-2"><Icon className="h-9 w-9 text-cyan-300"/><div className="text-center text-xs font-bold text-slate-100">{diagram.title}</div>{diagram.subtitle&&<div className="text-[0.5625rem] text-slate-500">{diagram.subtitle}</div>}</div></div>;}
    if(diagram.family==='erd') return <div {...common} className={`${boxClass(item,selected)} rounded-xl`}><div className="border-b border-violet-400/20 bg-violet-400/[.07] px-3 py-2 text-xs font-bold text-violet-100">{diagram.title}</div><div className="divide-y divide-white/[.06]">{(diagram.fields??[]).slice(0,10).map((field,index)=><div key={index} className="px-3 py-1 text-[0.5625rem] font-mono text-slate-300">{field}</div>)}</div></div>;
    if(diagram.family==='uml') return <div {...common} className={`${boxClass(item,selected)} rounded-lg`}><div className="border-b border-violet-400/20 px-3 py-2 text-center"><div className="text-[0.5625rem] text-violet-300">{diagram.subtitle ?? diagram.kind}</div><div className="text-xs font-bold text-slate-100">{diagram.title}</div></div>{diagram.fields&&<div className="divide-y divide-white/[.05]">{diagram.fields.slice(0,12).map((field,index)=><div key={index} className="px-3 py-1 text-[0.5625rem] font-mono text-slate-300">{field}</div>)}</div>}</div>;
    if(diagram.kind==='decision') return <div {...common} className="absolute pointer-events-auto cursor-move" style={{...styleFor(item),overflow:'visible'}}><div className={`absolute inset-[12%] flex rotate-45 items-center justify-center border-2 border-cyan-400/60 bg-slate-950 ${selected?'ring-2 ring-cyan-300/60':''}`}><span className="-rotate-45 px-3 text-center text-[0.625rem] font-bold text-slate-100">{diagram.title}</span></div></div>;
    return <div {...common} className={`${boxClass(item,selected)} ${diagram.kind==='terminal'?'rounded-full':'rounded-2xl'} p-3`}><div className="flex h-full flex-col items-center justify-center text-center"><div className="text-[0.5625rem] uppercase tracking-[.16em] text-cyan-400">{diagram.family.replace('-', ' ')}</div><div className="mt-1 text-xs font-bold text-slate-100">{diagram.title}</div>{diagram.subtitle&&<div className="mt-1 text-[0.5625rem] text-slate-400">{diagram.subtitle}</div>}{diagram.stage&&<div className="mt-2 rounded bg-amber-400/10 px-2 py-1 text-[0.5rem] text-amber-200">{diagram.stage}</div>}</div></div>;
  })}
</>;
