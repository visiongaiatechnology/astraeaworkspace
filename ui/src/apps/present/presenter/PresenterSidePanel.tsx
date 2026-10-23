// STATUS: DIAMANT VGT SUPREME — notes, next slide and bounded sequence navigator
import React from 'react';
import type { PresentSlide } from '../../../shared/contracts/workspace';
import type { PresenterSequence } from './runtime/presenterRuntime';
import { MessageSquare } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_STUDIO_COPY } from '../locale/presentStudioLocale';

interface Props {
  currentSlide: PresentSlide;
  nextSlide: PresentSlide | null;
  slides: PresentSlide[];
  currentIdx: number;
  notesFontSize: number;
  activeSequenceId: string;
  sequences: PresenterSequence[];
  onSetNotesFontSize: (size: number) => void;
  onJumpIndex: (idx: number) => void;
  onSelectSequence: (id: string) => void;
}

export const PresenterSidePanel: React.FC<Props> = ({
  currentSlide, nextSlide, slides, currentIdx, notesFontSize, activeSequenceId, sequences,
  onSetNotesFontSize, onJumpIndex, onSelectSequence,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_STUDIO_COPY[locale].sidePanel;
  return <aside className="flex w-80 min-w-0 shrink-0 flex-col gap-3 overflow-hidden border-l border-white/10 bg-slate-950/95 p-4">
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
      <div className="break-words text-[0.5625rem] font-bold uppercase tracking-widest text-cyan-300">{copy.nextSlide}</div>
      <div className="mt-1 line-clamp-2 break-words text-sm font-bold text-slate-100">{nextSlide?.title || copy.endOfSequence}</div>
      <div className="mt-1 line-clamp-2 break-words text-[0.625rem] text-slate-400">{nextSlide?.subtitle || copy.noFurtherSlide}</div>
    </div>

    <label className="min-w-0 space-y-1"><span className="break-words text-[0.5625rem] uppercase tracking-wider text-slate-500">{copy.sequence}</span>
      <select aria-label={copy.sequence} value={activeSequenceId} onChange={(e) => onSelectSequence(e.target.value)} className="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.6875rem] text-slate-200">
        {sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.label}</option>)}
      </select>
    </label>

    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label={copy.slideNavigator}>
      {slides.map((slide, index) => (
        <button key={slide.id} type="button" aria-label={copy.selectSlide(index + 1, slide.title || copy.untitledSlide)} aria-current={index === currentIdx ? 'step' : undefined} onClick={() => onJumpIndex(index)} className={`w-full min-w-0 rounded-lg border p-2 text-left ${index === currentIdx ? 'border-amber-400/50 bg-amber-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}>
          <div className="flex min-w-0 items-start gap-2"><span className="shrink-0 font-mono text-[0.5625rem] text-slate-500">{index + 1}</span><div className="min-w-0"><div className="break-words text-[0.625rem] font-semibold text-slate-200">{slide.title || copy.untitledSlide}</div><div className="break-words text-[0.5rem] text-slate-500">{slide.subtitle || slide.categoryTag || copy.slideFallback}</div></div></div>
        </button>
      ))}
    </div>

    <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <div className="flex min-w-0 items-center justify-between gap-2"><h3 className="flex min-w-0 items-center gap-1 break-words text-[0.5625rem] font-bold uppercase tracking-wider text-amber-300"><MessageSquare aria-hidden="true" className="h-3 w-3 shrink-0" />{copy.speakerNotes}</h3><div className="flex shrink-0 gap-1"><button aria-label={copy.decreaseNotesFont} title={copy.decreaseNotesFont} type="button" onClick={() => onSetNotesFontSize(Math.max(10, notesFontSize - 1))} className="rounded bg-white/5 px-1 text-[0.5625rem] text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">A−</button><button aria-label={copy.increaseNotesFont} title={copy.increaseNotesFont} type="button" onClick={() => onSetNotesFontSize(Math.min(28, notesFontSize + 1))} className="rounded bg-white/5 px-1 text-[0.5625rem] text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">A+</button></div></div>
      <div className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed text-slate-200" style={{ fontSize: `${notesFontSize}px` }}>{currentSlide.speakerNotes || copy.noPrivateNotes}</div>
    </div>
  </aside>;
};
