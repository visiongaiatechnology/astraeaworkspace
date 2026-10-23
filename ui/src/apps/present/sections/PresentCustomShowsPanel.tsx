// STATUS: DIAMANT VGT SUPREME — bounded custom slide-show editor
import React, { useState } from 'react';
import type { PresentCustomShow, PresentSlide } from '../../../shared/contracts/workspace';
import { PlaySquare, Plus, Trash2 } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_DIALOGS_COPY } from '../locale/presentDialogsLocale';

interface Props {
  slides: PresentSlide[];
  customShows: PresentCustomShow[];
  onUpdate: (shows: PresentCustomShow[]) => void;
}

export const PresentCustomShowsPanel: React.FC<Props> = ({ slides, customShows, onUpdate }) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_DIALOGS_COPY[locale].sections;
  const [name, setName] = useState('');
  const add = () => {
    const clean = name.trim().slice(0, 80);
    if (!clean || customShows.length >= 64) return;
    onUpdate([...customShows, { id: `custom-show-${Date.now()}`, name: clean, slideIds: slides.slice(0, 1).map((slide) => slide.id) }]);
    setName('');
  };
  const patch = (id: string, patchValue: Partial<PresentCustomShow>) => onUpdate(customShows.map((show) => show.id === id ? { ...show, ...patchValue } : show));
  return (
    <section className="border-t border-white/10 p-4 space-y-3">
      <div className="flex items-start gap-2"><PlaySquare className="w-4 h-4 shrink-0 text-cyan-400" /><div className="min-w-0"><div className="break-words text-xs font-bold text-slate-200">{copy.customShows}</div><div className="break-words text-[0.5625rem] text-slate-500">{copy.customShowsDescription}</div></div></div>
      <div className="flex flex-wrap gap-2"><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={copy.customShowPlaceholder} aria-label={copy.customShowPlaceholder} className="min-w-0 flex-1 rounded bg-black/30 border border-white/10 px-2 py-1 text-[0.625rem] text-slate-200"/><button type="button" onClick={add} disabled={!name.trim() || customShows.length >= 64} className="flex items-center gap-1 rounded bg-cyan-600 px-2 py-1 text-[0.625rem] font-semibold text-white disabled:opacity-40"><Plus className="w-3 h-3"/>{copy.addCustomShow}</button></div>
      <div className="space-y-2 max-h-52 overflow-y-auto">
        {customShows.map((show) => (
            <div key={show.id} className="rounded-lg border border-white/10 bg-slate-950/70 p-2 space-y-2">
            <div className="flex items-center gap-2"><input value={show.name} maxLength={80} onChange={(e) => patch(show.id, { name: e.target.value.slice(0, 80) })} className="min-w-0 flex-1 rounded bg-black/30 border border-white/10 px-2 py-1 text-[0.625rem] text-slate-200"/><button aria-label={copy.deleteCustomShow(show.name)} type="button" onClick={() => onUpdate(customShows.filter((item) => item.id !== show.id))} className="p-1 text-red-300"><Trash2 className="w-3 h-3"/></button></div>
            <div className="grid grid-cols-2 gap-1">
              {slides.map((slide, idx) => {
                const selected = show.slideIds.includes(slide.id);
                return <button key={slide.id} type="button" onClick={() => patch(show.id, { slideIds: selected ? show.slideIds.filter((id) => id !== slide.id) : [...show.slideIds, slide.id].slice(0, slides.length) })} className={`rounded border px-1.5 py-1 text-left text-[0.5625rem] ${selected ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/5 text-slate-500'}`}>{selected ? '✓ ' : ''}{idx + 1}. {slide.title || 'Untitled'}</button>;
              })}
            </div>
          </div>
        ))}
        {!customShows.length && <div className="py-3 text-center text-[0.5625rem] text-slate-600">{copy.emptyCustomShows}</div>}
      </div>
    </section>
  );
};
