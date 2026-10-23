import React, { useState } from 'react';
import type { NotePropertyValue } from '../../../../shared/contracts/workspace';
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { notesAuxText } from '../../notesAuxLocale';

interface NotesPropertiesPopoverProps {
  properties: Record<string, NotePropertyValue>;
  onSetProperty: (key: string, value: NotePropertyValue) => void;
  onRemoveProperty: (key: string) => void;
}

export const NotesPropertiesPopover: React.FC<NotesPropertiesPopoverProps> = ({ properties, onSetProperty, onRemoveProperty }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof notesAuxText>[0]) => notesAuxText(message, locale);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  return <div className="relative"><button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-cyan-300"><SlidersHorizontal className="w-3 h-3" />{t('properties')}</button>{open && <><div className="fixed inset-0 z-30" onClick={() => setOpen(false)} /><div className="absolute right-0 top-8 z-50 w-72 rounded-xl border border-white/15 bg-slate-950 shadow-2xl p-3 space-y-2"><div className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500">{t('customProperties')}</div>{Object.entries(properties).map(([propertyKey, propertyValue]) => <div key={propertyKey} className="grid grid-cols-[88px_1fr_auto] gap-1 items-center"><span className="text-[0.625rem] text-slate-400 truncate" title={propertyKey}>{propertyKey}</span><input value={String(propertyValue ?? '')} onChange={(event) => onSetProperty(propertyKey, event.target.value)} className="min-w-0 bg-slate-900 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" /><button aria-label={t('removeProperty')} type="button" onClick={() => onRemoveProperty(propertyKey)} className="p-1 text-slate-500 hover:text-red-300"><Trash2 className="w-3 h-3" /></button></div>)}<div className="grid grid-cols-[88px_1fr_auto] gap-1 pt-2 border-t border-white/10"><input value={key} onChange={(event) => setKey(event.target.value)} maxLength={80} placeholder={t('key')} aria-label={t('key')} className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" /><input value={value} onChange={(event) => setValue(event.target.value)} maxLength={2048} placeholder={t('value')} aria-label={t('value')} className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-[0.625rem] text-slate-200" /><button aria-label={t('addCustomProperty')} type="button" disabled={!key.trim()} onClick={() => { onSetProperty(key.trim(), value); setKey(''); setValue(''); }} className="p-1 text-cyan-400 disabled:opacity-30"><Plus className="w-3.5 h-3.5" /></button></div></div></>}</div>;
};
