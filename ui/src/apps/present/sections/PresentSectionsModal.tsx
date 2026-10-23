// STATUS: DIAMANT VGT SUPREME
// Astraea Present authoritative Sections manager for large deck structuring

import React, { useState } from 'react';
import { Layers, X, Trash2, FolderPlus } from 'lucide-react';
import { PresentCustomShow, PresentSection, PresentSlide } from '../../../shared/contracts/workspace';
import { PresentCustomShowsPanel } from './PresentCustomShowsPanel';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_DIALOGS_COPY } from '../locale/presentDialogsLocale';

interface PresentSectionsModalProps {
  isOpen: boolean;
  sections: PresentSection[];
  slides: PresentSlide[];
  onClose: () => void;
  onUpdateSections: (sections: PresentSection[]) => void;
  onAssignSlideSection: (slideId: string, sectionId?: string) => void;
  customShows: PresentCustomShow[];
  onUpdateCustomShows: (shows: PresentCustomShow[]) => void;
}

export const PresentSectionsModal: React.FC<PresentSectionsModalProps> = ({
  isOpen,
  sections,
  slides,
  onClose,
  onUpdateSections,
  onAssignSlideSection,
  customShows,
  onUpdateCustomShows,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_DIALOGS_COPY[locale].sections;
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionColor, setNewSectionColor] = useState('#8b5cf6');

  if (!isOpen) return null;

  const handleAddSection = () => {
    if (!newSectionName.trim()) return;
    const sec: PresentSection = {
      id: `section-${Date.now()}`,
      name: newSectionName.trim(),
      color: newSectionColor,
    };
    onUpdateSections([...sections, sec]);
    setNewSectionName('');
  };

  const handleDeleteSection = (id: string) => {
    const updated = sections.filter((s) => s.id !== id);
    onUpdateSections(updated);
    // Unassign slides
    slides.forEach((s) => {
      if (s.sectionId === id) onAssignSlideSection(s.id, undefined);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div role="dialog" aria-modal="true" aria-labelledby="present-sections-title" className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto text-xs flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <span id="present-sections-title" className="min-w-0 break-words font-bold text-slate-100 text-sm">{copy.title}</span>
          </div>
          <button aria-label={copy.close} type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add Section */}
        <div className="p-3 bg-slate-950/50 border-b border-white/10 flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={newSectionColor}
            onChange={(e) => setNewSectionColor(e.target.value)}
            className="w-7 h-7 rounded border border-white/10 bg-black cursor-pointer"
          />
          <input
            type="text"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            placeholder={copy.sectionPlaceholder}
            aria-label={copy.sectionPlaceholder}
            className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded px-2.5 py-1 text-slate-100 outline-none focus:border-purple-500"
          />
          <button
            type="button"
            onClick={handleAddSection}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium flex items-center gap-1 shrink-0"
          >
            <FolderPlus className="w-3 h-3" />
            <span>{copy.addSection}</span>
          </button>
        </div>

        {/* Sections & Slide Assignments */}
        <div className="p-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {sections.length === 0 ? (
            <div className="text-center py-8 text-slate-500 italic text-[0.6875rem]">
              {copy.emptySections}
            </div>
          ) : (
            sections.map((sec) => {
              const secSlides = slides.filter((s) => s.sectionId === sec.id);
              return (
                <div key={sec.id} className="bg-slate-950/80 border border-white/10 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: sec.color || '#8b5cf6' }} />
                      <span className="font-bold text-slate-200">{sec.name}</span>
                      <span className="break-words text-[0.625rem] text-slate-500">({copy.slideCount(secSlides.length)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSection(sec.id)}
                      className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded"
                      aria-label={copy.deleteSection} title={copy.deleteSection}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Slide Selector Checklist */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {slides.map((s, idx) => {
                      const assigned = s.sectionId === sec.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onAssignSlideSection(s.id, assigned ? undefined : sec.id)}
                          className={`p-1.5 rounded text-left flex items-center justify-between transition-colors ${
                            assigned
                              ? 'bg-purple-600/20 border border-purple-500/30 text-purple-200'
                              : 'bg-white/[0.02] border border-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span className="min-w-0 break-words">{copy.slide(idx + 1, s.title || copy.untitledSlide)}</span>
                          {assigned && <span className="text-[0.625rem] font-bold text-purple-400">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <PresentCustomShowsPanel slides={slides} customShows={customShows} onUpdate={onUpdateCustomShows} />
      </div>
    </div>
  );
};
