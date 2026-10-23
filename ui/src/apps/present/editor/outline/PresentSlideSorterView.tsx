import React, { useState } from 'react';
import { PresentSlide, PresentDocumentModel, PresentSection } from '../../../../shared/contracts/workspace';
import { Plus, Copy, Trash2, Eye, EyeOff, FolderPlus, GripVertical } from 'lucide-react';

interface PresentSlideSorterViewProps {
  slides: PresentSlide[];
  presentData: PresentDocumentModel;
  activeSlideIdx: number;
  onSelectSlide: (idx: number) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (idx: number) => void;
  onDeleteSlide: (idx: number) => void;
  onReorderSlides: (fromIdx: number, toIdx: number) => void;
  onToggleHideSlide: (idx: number) => void;
  onUpdatePresentData: (next: PresentDocumentModel) => void;
  onCloseSorter: () => void;
}

export const PresentSlideSorterView: React.FC<PresentSlideSorterViewProps> = ({
  slides,
  presentData,
  activeSlideIdx,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onReorderSlides,
  onToggleHideSlide,
  onUpdatePresentData,
  onCloseSorter,
}) => {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [newSectionName, setNewSectionName] = useState('');

  const sections = presentData.sections || [];

  const handleAddSection = () => {
    if (!newSectionName.trim()) return;
    const newSec: PresentSection = {
      id: `sec-${Date.now()}`,
      name: newSectionName.trim(),
      color: '#3b82f6',
    };
    onUpdatePresentData({
      ...presentData,
      sections: [...sections, newSec],
    });
    setNewSectionName('');
  };

  return (
    <div className="flex-1 bg-[var(--vgt-module-shell-surface)] p-6 overflow-y-auto select-none text-xs">
      {/* Sorter Header */}
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>Slide Sorter View</span>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
              {slides.length} slides
            </span>
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Drag to reorder slides, organize into deck sections, hide or duplicate. Click a slide to edit.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Add Section input */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-white/10 rounded-xl px-2 py-1">
            <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
            <input
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="New Section Name..."
              className="bg-transparent text-slate-200 outline-none w-36 text-xs"
            />
            <button
              type="button"
              onClick={handleAddSection}
              disabled={!newSectionName.trim()}
              className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white font-semibold"
            >
              Add
            </button>
          </div>

          <button
            type="button"
            onClick={onAddSlide}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors shadow-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Slide</span>
          </button>

          <button
            type="button"
            onClick={onCloseSorter}
            className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 font-semibold"
          >
            Return to Editor
          </button>
        </div>
      </div>

      {/* Slide Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {slides.map((s, idx) => {
          const isActive = idx === activeSlideIdx;
          const isDragging = draggedIdx === idx;
          const isDragOver = dragOverIdx === idx;

          return (
            <div
              key={s.id}
              draggable
              onDragStart={() => setDraggedIdx(idx)}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedIdx !== null && draggedIdx !== idx) setDragOverIdx(idx);
              }}
              onDrop={() => {
                if (draggedIdx === null || draggedIdx === idx) {
                  setDraggedIdx(null);
                  setDragOverIdx(null);
                  return;
                }
                onReorderSlides(draggedIdx, idx);
                setDraggedIdx(null);
                setDragOverIdx(null);
              }}
              data-vgt-theme-selected-surface={isActive ? 'true' : undefined}
              // GAP-0052, Runde 285: die Folienkarte war nur mit der Maus
              // waehlbar — `cursor-pointer` und `onClick`, aber kein
              // Tastaturweg. Die Karte ist `draggable`; das Verschieben bleibt
              // der Maus vorbehalten, das AUSWAEHLEN nicht.
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onClick={() => {
                onSelectSlide(idx);
                onCloseSorter();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectSlide(idx);
                  onCloseSorter();
                }
              }}
              className={`group relative rounded-2xl border p-3 cursor-pointer transition-all duration-150 flex flex-col justify-between ${
                isActive
                  ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-600/10'
                  : 'border-white/10 bg-slate-900/70 hover:border-white/25 hover:bg-slate-900'
              } ${s.hidden ? 'opacity-50' : ''} ${
                isDragging ? 'opacity-30 border-dashed border-cyan-400' : ''
              } ${isDragOver ? 'ring-2 ring-cyan-400 scale-[1.02]' : ''}`}
            >
              {/* Aspect-video slide card preview */}
              <div className="aspect-video w-full rounded-xl bg-slate-950 border border-white/10 p-2.5 flex flex-col justify-between relative overflow-hidden shadow-inner">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.625rem] font-mono font-bold text-slate-400">
                      #{idx + 1}
                    </span>
                    {s.hidden && (
                      <span className="text-[0.5625rem] font-mono uppercase bg-purple-500/20 text-purple-300 px-1.5 rounded">
                        Hidden
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-bold text-slate-100 truncate mt-1">
                    {s.title || 'Untitled Slide'}
                  </h3>
                  <p className="text-[0.625rem] text-slate-400 truncate mt-0.5">
                    {s.subtitle || 'No subtitle'}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[0.5625rem] text-slate-500 font-mono">
                  <span className="uppercase">{s.layout}</span>
                  <span>{s.cards ? `${s.cards.length} cards` : s.bulletPoints ? `${s.bulletPoints.length} bullets` : 'canvas'}</span>
                </div>
              </div>

              {/* Bottom control bar */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-slate-400">
                <div className="flex items-center space-x-1">
                  <GripVertical className="w-3 h-3 text-slate-600 group-hover:text-slate-300" />
                  <span className="text-[0.625rem] font-mono">Slide {idx + 1}</span>
                </div>

                <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                  <button aria-label={s.hidden ? 'Show slide in presentation' : 'Hide slide from presentation'}
                    type="button"
                    onClick={() => onToggleHideSlide(idx)}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                    title={s.hidden ? 'Show slide in presentation' : 'Hide slide from presentation'}
                  >
                    {s.hidden ? <EyeOff className="w-3 h-3 text-purple-400" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicateSlide(idx)}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                    aria-label="Duplicate Slide" title="Duplicate Slide"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {slides.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteSlide(idx)}
                      className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"
                      aria-label="Delete Slide" title="Delete Slide"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
