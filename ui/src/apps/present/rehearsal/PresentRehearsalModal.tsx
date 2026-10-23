// STATUS: DIAMANT VGT SUPREME
// Astraea Present authoritative Slide Rehearsal & Timings Studio

import React, { useState, useEffect } from 'react';
import { Timer, X, Play, Pause, RotateCcw, Check } from 'lucide-react';
import { PresentSlide } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_DIALOGS_COPY } from '../locale/presentDialogsLocale';

interface PresentRehearsalModalProps {
  isOpen: boolean;
  slides: PresentSlide[];
  onClose: () => void;
  onApplyTimings: (timings: Record<string, number>) => void;
}

export const PresentRehearsalModal: React.FC<PresentRehearsalModalProps> = ({
  isOpen,
  slides,
  onClose,
  onApplyTimings,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_DIALOGS_COPY[locale].rehearsal;
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [slideTimings, setSlideTimings] = useState<Record<string, number>>({});
  const [currentSlideSeconds, setCurrentSlideSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setCurrentSlideSeconds((s) => s + 1);
      setTotalSeconds((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!isOpen) return null;

  const activeSlide = slides[currentSlideIdx] || slides[0];

  const handleNextSlide = () => {
    if (activeSlide) {
      setSlideTimings((prev) => ({ ...prev, [activeSlide.id]: currentSlideSeconds }));
    }
    setCurrentSlideSeconds(0);
    if (currentSlideIdx < slides.length - 1) {
      setCurrentSlideIdx((prev) => prev + 1);
    } else {
      setIsRunning(false);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setCurrentSlideIdx(0);
    setCurrentSlideSeconds(0);
    setTotalSeconds(0);
    setSlideTimings({});
  };

  const handleApply = () => {
    onApplyTimings(slideTimings);
    onClose();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div role="dialog" aria-modal="true" aria-labelledby="present-rehearsal-title" className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto text-xs flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Timer className="w-4 h-4 text-amber-400" />
            <span id="present-rehearsal-title" className="min-w-0 break-words font-bold text-slate-100 text-sm">{copy.title}</span>
          </div>
          <button aria-label={copy.close} type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Counters */}
        <div className="p-4 grid grid-cols-2 gap-3 border-b border-white/10 bg-slate-950/40">
          <div className="p-3 bg-black/40 border border-white/5 rounded-lg text-center">
            <div className="break-words text-[0.625rem] text-slate-400 uppercase font-semibold mb-1">{copy.slideTime(currentSlideIdx + 1)}</div>
            <div className="text-2xl font-mono font-bold text-amber-300">{formatTime(currentSlideSeconds)}</div>
          </div>
          <div className="p-3 bg-black/40 border border-white/5 rounded-lg text-center">
            <div className="break-words text-[0.625rem] text-slate-400 uppercase font-semibold mb-1">{copy.totalTime}</div>
            <div className="text-2xl font-mono font-bold text-purple-300">{formatTime(totalSeconds)}</div>
          </div>
        </div>

        {/* Active Slide Preview Info */}
        <div className="p-4 space-y-3">
          <div className="p-2.5 rounded bg-white/[0.03] border border-white/5">
            <div className="font-bold text-slate-200 truncate">{activeSlide?.title || copy.untitledSlide}</div>
            <div className="text-[0.6875rem] text-slate-400 truncate">{activeSlide?.subtitle || copy.noSubtitle}</div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsRunning((r) => !r)}
              className="flex-1 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center justify-center gap-1.5"
            >
              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isRunning ? copy.pause : copy.start}</span>
            </button>
            <button
              type="button"
              onClick={handleNextSlide}
              disabled={!isRunning && currentSlideSeconds === 0}
              className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium flex items-center gap-1"
            >
              <span>{copy.next}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
              aria-label={copy.reset} title={copy.reset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Recorded Timings List */}
          <div className="space-y-1.5 max-h-36 overflow-y-auto pt-2 border-t border-white/10">
            <div className="text-[0.625rem] text-slate-400 font-semibold uppercase">{copy.recorded}:</div>
            {slides.map((s, idx) => (
              <div key={s.id} className="flex justify-between items-center text-[0.6875rem] px-2 py-1 bg-white/[0.02] rounded">
                <span className="text-slate-300">{copy.slide(idx + 1, s.title)}</span>
                <span className="font-mono text-amber-300">{formatTime(slideTimings[s.id] ?? s.timingSeconds ?? 0)}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleApply}
            className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center justify-center gap-1"
          >
            <Check className="w-3 h-3" />
            <span>{copy.save}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
