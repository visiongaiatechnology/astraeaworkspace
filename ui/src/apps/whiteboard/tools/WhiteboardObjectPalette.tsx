// STATUS: DIAMANT VGT SUPREME
import React from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardObjectsText } from '../whiteboardObjectsLocale';
import { BarChart3, Braces, FileText, ImagePlus, LayoutGrid, MonitorPlay, Server, Shapes, SquareCheckBig, Table2, ThumbsUp, X } from 'lucide-react';
import type { WhiteboardRichObjectType } from '../model/whiteboardObjectEngine';

interface Props { onClose:()=>void; onInsert:(type:WhiteboardRichObjectType)=>void; onRequestImage:()=>void; onRequestMedia:()=>void; }
const entries: Array<[WhiteboardRichObjectType,Parameters<typeof whiteboardObjectsText>[0],React.ReactNode]> = [
  ['shape','shape',<Shapes className="h-4 w-4"/>],['icon','icon',<Server className="h-4 w-4"/>],['table','table',<Table2 className="h-4 w-4"/>],['card','taskCard',<SquareCheckBig className="h-4 w-4"/>],['document','document',<FileText className="h-4 w-4"/>],['chart','chartData',<BarChart3 className="h-4 w-4"/>],['code','code',<Braces className="h-4 w-4"/>],['reaction','reactionVote',<ThumbsUp className="h-4 w-4"/>],
];
export const WhiteboardObjectPalette: React.FC<Props> = ({onClose,onInsert,onRequestImage,onRequestMedia}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof whiteboardObjectsText>[0]) => whiteboardObjectsText(message, locale);
  return <div className="whiteboard-dock whiteboard-dock--left-top absolute left-5 top-20 z-30 w-72 rounded-2xl border border-white/10 bg-slate-950/96 p-3 shadow-2xl backdrop-blur-xl" data-whiteboard-dock="object-palette" role="dialog" aria-label={t('palette')}><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold text-slate-100"><LayoutGrid className="h-4 w-4 text-cyan-300"/>{t('objects')}</div><button type="button" onClick={onClose} aria-label={t('closePalette')} className="rounded p-1 text-slate-400 hover:bg-white/10"><X className="h-4 w-4"/></button></div><div className="grid grid-cols-2 gap-2">{entries.map(([type,label,icon])=><button key={type} type="button" onClick={()=>onInsert(type)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-left text-[0.6875rem] text-slate-300 hover:border-cyan-400/30 hover:bg-cyan-500/[.06]">{icon}{t(label)}</button>)}<button type="button" onClick={onRequestImage} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-left text-[0.6875rem] text-slate-300 hover:border-fuchsia-400/30"><ImagePlus className="h-4 w-4"/>{t('imageSvg')}</button><button type="button" onClick={onRequestMedia} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-left text-[0.6875rem] text-slate-300 hover:border-fuchsia-400/30"><MonitorPlay className="h-4 w-4"/>{t('localMedia')}</button></div></div>;
};
