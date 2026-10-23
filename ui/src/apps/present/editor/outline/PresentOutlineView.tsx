import React from 'react';
import { PresentSlide } from '../../../../shared/contracts/workspace';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

interface PresentOutlineViewProps {
  slides: PresentSlide[];
  activeSlideIdx: number;
  onSelectSlide: (idx: number) => void;
  onUpdateSlide: (idx: number, updated: PresentSlide) => void;
  onAddSlide: () => void;
  onDeleteSlide: (idx: number) => void;
  onReorderSlides: (from: number, to: number) => void;
  onCloseOutline: () => void;
}

export const PresentOutlineView: React.FC<PresentOutlineViewProps> = ({
  slides,
  activeSlideIdx,
  onSelectSlide,
  onUpdateSlide,
  onAddSlide,
  onDeleteSlide,
  onReorderSlides,
  onCloseOutline,
}) => {
  return (
    <div className="flex-1 bg-[var(--vgt-module-shell-surface)] p-6 overflow-y-auto select-none text-xs">
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>Outline View</span>
            <span className="text-xs font-mono text-[var(--vgt-accent-strong)] bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
              Text Outliner
            </span>
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Rapid text-based hierarchical editor for structuring deck titles and bullet points.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onAddSlide}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors shadow-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Slide</span>
          </button>
          <button
            type="button"
            onClick={onCloseOutline}
            className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 font-semibold"
          >
            Return to Editor
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-4">
        {slides.map((slide, sIdx) => {
          const isActive = sIdx === activeSlideIdx;

          return (
            <div
              key={slide.id}
              onClick={() => onSelectSlide(sIdx)}
              // GAP-0055, Runde 294: die Folienzeile in der Gliederung war nur
              // mit der Maus waehlbar — `onClick`, aber kein Tastaturweg.
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectSlide(sIdx);
                }
              }}
              data-vgt-theme-selected-surface={isActive ? 'true' : undefined}
              className={`rounded-2xl border p-4 transition-all ${
                isActive
                  ? 'border-blue-500/80 bg-slate-900/90 shadow-xl ring-1 ring-blue-500/30'
                  : 'border-white/10 bg-slate-900/40 hover:border-white/20'
              }`}
            >
              {/* Slide Heading Line */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center space-x-2 flex-1">
                  <span className="font-mono text-xs font-bold text-[var(--vgt-accent-strong)]">
                    {String(sIdx + 1).padStart(2, '0')}.
                  </span>
                  <input
                    type="text"
                    value={slide.title}
                    onChange={(e) => onUpdateSlide(sIdx, { ...slide, title: e.target.value })}
                    placeholder="Slide Title..."
                    className="flex-1 bg-transparent text-sm font-bold text-slate-100 outline-none select-text border-b border-transparent focus:border-[var(--vgt-focus)]"
                  />
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => onReorderSlides(sIdx, Math.max(0, sIdx - 1))}
                    disabled={sIdx === 0}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white disabled:opacity-20"
                    aria-label="Move Up" title="Move Up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReorderSlides(sIdx, Math.min(slides.length - 1, sIdx + 1))}
                    disabled={sIdx === slides.length - 1}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white disabled:opacity-20"
                    aria-label="Move Down" title="Move Down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  {slides.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteSlide(sIdx)}
                      className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"
                      aria-label="Delete Slide" title="Delete Slide"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Subtitle */}
              <div className="pl-7 mb-3">
                <input
                  type="text"
                  value={slide.subtitle || ''}
                  onChange={(e) => onUpdateSlide(sIdx, { ...slide, subtitle: e.target.value })}
                  placeholder="Subtitle or section details..."
                  className="w-full bg-transparent text-xs text-slate-400 outline-none select-text border-b border-transparent focus:border-white/20"
                />
              </div>

              {/* Bullet Points / Card Text */}
              <div className="pl-7 space-y-1.5">
                {(slide.bulletPoints || []).map((bullet, bIdx) => (
                  <div key={bIdx} className="flex items-center space-x-2 text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                    <input
                      type="text"
                      value={bullet}
                      onChange={(e) => {
                        const next = [...(slide.bulletPoints || [])];
                        next[bIdx] = e.target.value;
                        onUpdateSlide(sIdx, { ...slide, bulletPoints: next });
                      }}
                      className="flex-1 bg-transparent text-xs outline-none select-text"
                    />
                  </div>
                ))}

                {(slide.cards || []).map((card, cIdx) => (
                  <div key={card.id} className="flex items-start space-x-2 text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                    <div className="flex-1">
                      <input
                        type="text"
                        value={card.title}
                        onChange={(e) => {
                          const nextCards = [...(slide.cards || [])];
                          nextCards[cIdx] = { ...nextCards[cIdx], title: e.target.value };
                          onUpdateSlide(sIdx, { ...slide, cards: nextCards });
                        }}
                        className="w-full font-semibold bg-transparent text-xs outline-none select-text"
                      />
                      <textarea
                        rows={1}
                        value={card.description}
                        onChange={(e) => {
                          const nextCards = [...(slide.cards || [])];
                          nextCards[cIdx] = { ...nextCards[cIdx], description: e.target.value };
                          onUpdateSlide(sIdx, { ...slide, cards: nextCards });
                        }}
                        className="w-full text-[0.6875rem] text-slate-400 bg-transparent outline-none resize-none select-text mt-0.5"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
