// STATUS: DIAMANT VGT SUPREME
import React, { useState } from 'react';
import { LayoutTemplate, Save, Trash2, X } from 'lucide-react';
import type { WhiteboardCustomTemplate, WhiteboardTemplateScope } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardDeepText } from '../whiteboardDeepLocale';
import { creativePersonalText } from '../../creativePersonalLocale';
import {
  WHITEBOARD_BUILTIN_TEMPLATES,
  createBuiltinWhiteboardTemplate,
  createCustomWhiteboardTemplate,
  instantiateCustomWhiteboardTemplate,
  upsertCustomWhiteboardTemplate,
} from '../model/whiteboardTemplateEngine';

interface Props {
  items: WhiteboardItem[];
  selectedIds: readonly string[];
  customTemplates: WhiteboardCustomTemplate[];
  origin: { x:number; y:number };
  updateItems: (fn:(items:WhiteboardItem[])=>WhiteboardItem[])=>void;
  updateCustomTemplates: (fn:(templates:WhiteboardCustomTemplate[])=>WhiteboardCustomTemplate[])=>void;
  showToast: (message:string)=>void;
  onClose:()=>void;
}

export const WhiteboardTemplatePanel:React.FC<Props>=({items,selectedIds,customTemplates,origin,updateItems,updateCustomTemplates,showToast,onClose})=>{
  const { locale } = useWorkspaceLocale();
  const t = (message:string) => creativePersonalText(whiteboardDeepText(message, locale), locale);
  const [name,setName]=useState(t('My board template'));
  const [scope,setScope]=useState<WhiteboardTemplateScope>('user');
  const applyBuiltIn=(templateId:(typeof WHITEBOARD_BUILTIN_TEMPLATES)[number]['id'])=>{
    const created=createBuiltinWhiteboardTemplate(templateId,origin.x,origin.y);
    updateItems(previous=>[...previous,...created]);
    const descriptor = WHITEBOARD_BUILTIN_TEMPLATES.find((candidate) => candidate.id === templateId);
    showToast(`${t('Applied template:')} ${descriptor ? t(descriptor.name) : ''}`);
  };
  const saveCustom=()=>{
    const template=createCustomWhiteboardTemplate(name,scope,items,selectedIds);
    if(!template){showToast(t('Nothing eligible to save as a template'));return;}
    updateCustomTemplates(previous=>upsertCustomWhiteboardTemplate(previous,template));showToast(t('Saved template.'));
  };
  const applyCustom=(template:WhiteboardCustomTemplate)=>{
    const created=instantiateCustomWhiteboardTemplate(template,origin.x,origin.y);
    updateItems(previous=>[...previous,...created]);showToast(t('Applied saved template.'));
  };
  return <div className="whiteboard-dock whiteboard-dock--left-top absolute left-5 top-20 z-28 max-h-[calc(100vh-150px)] w-[calc(100vw-2.5rem)] max-w-[390px] overflow-auto rounded-2xl border border-violet-400/20 bg-slate-950/96 p-4 shadow-2xl backdrop-blur-xl" data-whiteboard-dock="templates" role="dialog" aria-label={t('Whiteboard templates')}>
    <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-bold text-slate-100"><LayoutTemplate className="h-4 w-4 text-violet-300"/>{t('Templates')}</div><button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10" aria-label={t('Close templates')}><X className="h-4 w-4"/></button></div>
    <div className="grid grid-cols-2 gap-1.5">{WHITEBOARD_BUILTIN_TEMPLATES.map(template=><button type="button" key={template.id} onClick={()=>applyBuiltIn(template.id)} className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-left hover:border-violet-400/30"><div className="text-[0.625rem] font-semibold text-slate-200">{t(template.name)}</div><div className="mt-0.5 text-[0.5rem] uppercase tracking-[.12em] text-slate-600">{t(template.category)}</div></button>)}</div>
    <div className="my-4 h-px bg-white/10"/>
    <div className="text-[0.5625rem] font-bold uppercase tracking-[.18em] text-slate-500">{t('Custom user / org template')}</div>
    <div className="mt-2 flex gap-2"><input value={name} onChange={event=>setName(event.target.value.slice(0,120))} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.625rem] text-slate-200 outline-none" aria-label={t('Template name')}/><select value={scope} onChange={event=>setScope(event.target.value as WhiteboardTemplateScope)} className="rounded-lg border border-white/10 bg-slate-900 px-2 text-[0.625rem] text-slate-200"><option value="user">{t('User')}</option><option value="org">{t('Org')}</option></select><button type="button" onClick={saveCustom} className="rounded-lg border border-violet-400/20 px-2 text-violet-200" aria-label={t('Save selected objects, or the visible board when nothing is selected')} title={t('Save selected objects, or the visible board when nothing is selected')}><Save className="h-3.5 w-3.5"/></button></div>
    <div className="mt-1 text-[0.5625rem] text-slate-600">{selectedIds.length>0?t('Selected objects will be captured: {count}').replace('{count}', String(selectedIds.length)):t('No selection: visible board objects will be captured.')}</div>
    {customTemplates.length>0&&<div className="mt-3 space-y-1.5">{customTemplates.map(template=><div key={template.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.02] p-2"><button type="button" onClick={()=>applyCustom(template)} className="min-w-0 flex-1 text-left"><div className="truncate text-[0.625rem] font-semibold text-slate-200">{template.name}</div><div className="text-[0.5rem] uppercase tracking-[.12em] text-slate-600">{t(template.scope === 'org' ? 'Org' : 'User')} · {template.items.length} {t('objects')}</div></button><button type="button" onClick={()=>updateCustomTemplates(previous=>previous.filter(existing=>existing.id!==template.id))} className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300" aria-label={`${t('Delete')} ${template.name}`}><Trash2 className="h-3.5 w-3.5"/></button></div>)}</div>}
  </div>;
};
