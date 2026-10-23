// STATUS: DIAMANT VGT SUPREME — Structured editor for Present widgets
import React, { useState } from 'react';
import type { PresentSceneObject, PresentWidgetItem, PresentWidgetSceneObject, PresentWidgetStatus } from '../../../../shared/contracts/workspace';
import {
  fileToPresentWidgetGalleryItem,
  PRESENT_WIDGET_MAX_GALLERY_ITEMS,
  PRESENT_WIDGET_MAX_GALLERY_TOTAL_BYTES,
} from '../../canvas/widgets/presentWidgets';

interface Props {
  widget: PresentWidgetSceneObject;
  onPatch: (id: string, patch: Partial<PresentSceneObject>) => void;
}

const inputClass = 'w-full rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200 outline-none focus:border-cyan-500/50';

const approxDataUrlBytes = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(',');
  return comma < 0 ? 0 : Math.floor((dataUrl.length - comma - 1) * 0.75);
};

export const PresentWidgetInspector: React.FC<Props> = ({ widget, onPatch }) => {
  const [galleryError, setGalleryError] = useState('');
  const patch = (value: Partial<PresentWidgetSceneObject>) => onPatch(widget.id, value as Partial<PresentSceneObject>);
  const items = widget.items || [];
  const structured = ['milestone', 'roadmap', 'comparison', 'status'].includes(widget.widgetType);

  const updateItem = (index: number, next: Partial<PresentWidgetItem>) => {
    patch({ items: items.map((item, i) => i === index ? { ...item, ...next } : item) });
  };

  const addItem = () => {
    if (items.length >= 12) return;
    patch({ items: [...items, { id: `widget-item-${Date.now()}-${items.length}`, label: `Item ${items.length + 1}`, value: '', subtitle: '', status: 'neutral' }] });
  };

  const removeItem = (index: number) => patch({ items: items.filter((_, i) => i !== index) });

  const importGallery = async (files: FileList | null) => {
    setGalleryError('');
    if (!files?.length) return;
    try {
      const existing = widget.galleryItems || [];
      const selected = Array.from(files).slice(0, Math.max(0, PRESENT_WIDGET_MAX_GALLERY_ITEMS - existing.length));
      const currentBytes = existing.reduce((sum, item) => sum + approxDataUrlBytes(item.dataUrl), 0);
      const nextBytes = selected.reduce((sum, file) => sum + file.size, currentBytes);
      if (nextBytes > PRESENT_WIDGET_MAX_GALLERY_TOTAL_BYTES) throw new Error('Gallery total exceeds the 24 MiB document limit.');
      const imported = [];
      for (let i = 0; i < selected.length; i += 1) {
        imported.push(await fileToPresentWidgetGalleryItem(selected[i], `gallery-${Date.now()}-${i}`));
      }
      patch({ galleryItems: [...existing, ...imported] });
    } catch (error) {
      setGalleryError(error instanceof Error ? error.message : 'Gallery import failed.');
    }
  };

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Widget Content</span>
      <label className="block space-y-1"><span className="text-[0.5625rem] text-slate-500">Label</span><input value={widget.label} maxLength={120} onChange={(e)=>patch({ label:e.target.value })} className={inputClass}/></label>
      {!['calendar','gallery'].includes(widget.widgetType) && <label className="block space-y-1"><span className="text-[0.5625rem] text-slate-500">Value / Copy</span><textarea value={widget.value} maxLength={180} rows={widget.widgetType === 'quote' ? 3 : 1} onChange={(e)=>patch({ value:e.target.value })} className={`${inputClass} resize-none`}/></label>}
      {['kpi','icon-stat'].includes(widget.widgetType) && <label className="block space-y-1"><span className="text-[0.5625rem] text-slate-500">Secondary value</span><input value={widget.secondaryValue || ''} maxLength={120} onChange={(e)=>patch({ secondaryValue:e.target.value })} className={inputClass}/></label>}

      <label className="flex items-center justify-between rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300"><span>Accent</span><input type="color" value={widget.accentColor} onChange={(e)=>patch({ accentColor:e.target.value })} className="w-5 h-5 bg-transparent border-0 cursor-pointer"/></label>

      {['progress','progress-ring','gauge'].includes(widget.widgetType) && <label className="block space-y-1"><span className="text-[0.5625rem] text-slate-500">Percentage</span><input type="number" min="0" max="100" value={widget.progress ?? 0} onChange={(e)=>patch({ progress:Math.max(0,Math.min(100,Number(e.target.value)||0)) })} className={inputClass}/></label>}

      {widget.widgetType === 'quote' && <div className="grid grid-cols-1 gap-1.5"><input value={widget.profileName || ''} maxLength={80} placeholder="Profile name" onChange={(e)=>patch({ profileName:e.target.value })} className={inputClass}/><input value={widget.profileRole || ''} maxLength={100} placeholder="Role / company" onChange={(e)=>patch({ profileRole:e.target.value })} className={inputClass}/></div>}

      {['kpi','icon-stat','gauge'].includes(widget.widgetType) && <label className="block space-y-1"><span className="text-[0.5625rem] text-slate-500">Icon</span><select value={widget.iconKey || 'activity'} onChange={(e)=>patch({ iconKey:e.target.value as PresentWidgetSceneObject['iconKey'] })} className={inputClass}>{['activity','shield','users','trend','clock','target'].map((key)=><option key={key} value={key}>{key}</option>)}</select></label>}

      {widget.widgetType === 'calendar' && <div className="space-y-1.5"><div className="grid grid-cols-2 gap-1.5"><input type="number" min="1970" max="9999" value={widget.calendarYear || new Date().getFullYear()} onChange={(e)=>patch({ calendarYear:Number(e.target.value)||2026 })} className={inputClass}/><select value={widget.calendarMonth ?? 0} onChange={(e)=>patch({ calendarMonth:Number(e.target.value) })} className={inputClass}>{Array.from({length:12},(_,i)=><option key={i} value={i}>{new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1)))}</option>)}</select></div><input value={(widget.highlightedDays || []).join(', ')} placeholder="Highlighted days: 4, 12, 18" onChange={(e)=>patch({ highlightedDays:Array.from(new Set<number>(e.target.value.split(',').map((v: string)=>Number.parseInt(v.trim(),10)).filter((v: number)=>Number.isInteger(v)&&v>=1&&v<=31))) })} className={inputClass}/></div>}

      {widget.widgetType === 'device' && <div className="space-y-1.5"><select value={widget.deviceKind || 'browser'} onChange={(e)=>patch({ deviceKind:e.target.value as PresentWidgetSceneObject['deviceKind'] })} className={inputClass}><option value="browser">Browser</option><option value="phone">Phone</option><option value="tablet">Tablet</option></select><input value={widget.deviceUrlLabel || ''} maxLength={120} placeholder="Display URL / label" onChange={(e)=>patch({ deviceUrlLabel:e.target.value })} className={inputClass}/></div>}

      {widget.widgetType === 'rating' && <div className="grid grid-cols-2 gap-1.5"><label className="space-y-1"><span className="text-[0.5625rem] text-slate-500">Rating</span><input type="number" min="0" max={widget.ratingMax || 5} step="0.1" value={widget.ratingValue ?? 0} onChange={(e)=>patch({ ratingValue:Number(e.target.value)||0 })} className={inputClass}/></label><label className="space-y-1"><span className="text-[0.5625rem] text-slate-500">Max</span><input type="number" min="1" max="10" value={widget.ratingMax || 5} onChange={(e)=>patch({ ratingMax:Math.max(1,Math.min(10,Number(e.target.value)||5)) })} className={inputClass}/></label></div>}

      {structured && <div className="space-y-1.5"><div className="flex items-center justify-between"><span className="text-[0.5625rem] text-slate-500 uppercase">Items</span><button type="button" onClick={addItem} disabled={items.length>=12} className="px-2 py-0.5 rounded border border-white/10 text-[0.5625rem] text-cyan-300 disabled:opacity-40">+ Add</button></div>{items.map((item,index)=><div key={item.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-1.5 space-y-1"><div className="flex gap-1"><input value={item.label} maxLength={80} onChange={(e)=>updateItem(index,{label:e.target.value})} className={inputClass}/><button type="button" onClick={()=>removeItem(index)} className="px-1.5 rounded border border-red-500/20 text-red-300">×</button></div><input value={item.value || ''} maxLength={80} placeholder="Value" onChange={(e)=>updateItem(index,{value:e.target.value})} className={inputClass}/><input value={item.subtitle || ''} maxLength={120} placeholder="Subtitle" onChange={(e)=>updateItem(index,{subtitle:e.target.value})} className={inputClass}/>{widget.widgetType === 'status' && <select value={item.status || 'neutral'} onChange={(e)=>updateItem(index,{status:e.target.value as PresentWidgetStatus})} className={inputClass}><option value="neutral">Neutral</option><option value="good">Good</option><option value="warning">Warning</option><option value="critical">Critical</option></select>}</div>)}</div>}

      {widget.widgetType === 'gallery' && <div className="space-y-1.5"><label className="block rounded-lg border border-dashed border-white/15 p-2 text-center text-[0.625rem] text-slate-400 cursor-pointer hover:border-cyan-500/40">Add PNG/JPEG/WebP<input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e)=>{ void importGallery(e.target.files); e.currentTarget.value=''; }}/></label>{galleryError && <div className="text-[0.5625rem] text-red-300">{galleryError}</div>}{(widget.galleryItems || []).map((img,index)=><div key={img.id} className="flex items-center gap-1"><span className="w-10 truncate text-[0.5rem] text-slate-500">{img.name}</span><input value={img.caption || ''} maxLength={120} placeholder="Caption" onChange={(e)=>patch({ galleryItems:(widget.galleryItems || []).map((it,i)=>i===index?{...it,caption:e.target.value}:it) })} className={inputClass}/><button type="button" onClick={()=>patch({ galleryItems:(widget.galleryItems || []).filter((_,i)=>i!==index) })} className="px-1.5 py-1 rounded border border-red-500/20 text-red-300">×</button></div>)}</div>}
    </div>
  );
};
