import React, { useState } from 'react';
import { PresentSlide } from '../../../../shared/contracts/workspace';
import { PRESENT_DEFAULT_SLIDE_LAYOUT_KIND, PRESENT_SLIDE_LAYOUT_PRESETS, type PresentSlideLayoutKind } from '../../contracts/presentDeckFactory';
import { PRESENT_TEMPLATES } from '../../contracts/presentTemplates';
import {
  Plus,
  Play,
  Trash2,
  Copy,
  GripVertical,
  FileDown,
  ImageDown,
  Eye,
  EyeOff,
  LayoutGrid,
  ListOrdered,
  MonitorPlay,
  UsersRound,
  BookOpen,
  NotebookPen,
  Layers3,
  PanelsTopLeft,
  Search,
  PackageOpen,
  FilePlus2,
} from 'lucide-react';

export type PresentViewMode = 'normal' | 'sorter' | 'outline' | 'notes' | 'reading' | 'slide-master' | 'notes-master' | 'handout-master';

/**
 * Round 16 (malformed document): a slide title is rendered as a React child in the thumbnail list.
 * A non-string title (number/object/null from a hostile payload) must fall back to the documented
 * "Untitled Slide" label instead of throwing "Objects are not valid as a React child".
 */
function presentSlideTitleLabel(slide: { title?: unknown }): string {
  return typeof slide.title === 'string' ? slide.title : '';
}

interface PresentSidebarProps {
  slides: PresentSlide[];
  activeSlideIdx: number;
  currentView: PresentViewMode;
  onChangeView: (view: PresentViewMode) => void;
  onSelectSlide: (idx: number) => void;
  /** Layout of the slide the "New" button creates; the user picks it, it is not hard-coded. */
  onAddSlide: (kind: PresentSlideLayoutKind) => void;
  onStartBlankDeck: () => void;
  /** Paket 27: instantiate a template with the placeholder values the picker collected. */
  onApplyTemplate: (templateId: string, values: Record<string, string>) => void;
  slideLimitReached?: boolean;
  onDuplicateSlide: (idx: number) => void;
  onDeleteSlide: (idx: number) => void;
  onReorderSlides: (fromIdx: number, toIdx: number) => void;
  onToggleHideSlide: (idx: number) => void;
  onStartPresenterMode: () => void;
  onExportPdf: () => void;
  onExportPng: () => void;
  onOpenReview: () => void;
  onOpenProductivity: () => void;
  onOpenExportCenter: () => void;
  reviewStatus: 'editing' | 'in-review' | 'changes-requested' | 'approved';
}

export const PresentSidebar: React.FC<PresentSidebarProps> = ({
  slides,
  activeSlideIdx,
  currentView,
  onChangeView,
  onSelectSlide,
  onAddSlide,
  onStartBlankDeck,
  onApplyTemplate,
  slideLimitReached = false,
  onDuplicateSlide,
  onDeleteSlide,
  onReorderSlides,
  onToggleHideSlide,
  onStartPresenterMode,
  onExportPdf,
  onExportPng,
  onOpenReview,
  onOpenProductivity,
  onOpenExportCenter,
  reviewStatus,
}) => {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Round 35 (M1 user finding): "+ New Slide" defaults to the freeform blank sheet, not to the
  // fixed "Title and content" placeholder arrangement. The preset chooser stays right below it.
  const [newSlideKind, setNewSlideKind] = useState<PresentSlideLayoutKind>(PRESENT_DEFAULT_SLIDE_LAYOUT_KIND);
  const [templateId, setTemplateId] = useState<string>(PRESENT_TEMPLATES[0]?.id ?? '');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateSubtitle, setTemplateSubtitle] = useState('');

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    setDragOverIdx(idx);
  };

  const handleDrop = (targetIdx: number) => {
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    onReorderSlides(draggedIdx, targetIdx);
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div className="w-60 bg-slate-950 border-r border-white/[0.08] flex flex-col p-3 space-y-3 shrink-0 select-none text-xs">
      {/* 1. View Switcher Mode Bar */}
      <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-white/10">
        <button
          type="button"
          onClick={() => onChangeView('normal')}
          data-vgt-theme-active-control={currentView === 'normal' ? 'soft' : undefined}
          className={`py-1 rounded-lg text-[0.625rem] font-semibold flex items-center justify-center space-x-1 transition-colors ${
            currentView === 'normal' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
          title="Normal Editor View"
        >
          <MonitorPlay className="w-3 h-3" />
          <span>Editor</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeView('sorter')}
          data-vgt-theme-active-control={currentView === 'sorter' ? 'soft' : undefined}
          className={`py-1 rounded-lg text-[0.625rem] font-semibold flex items-center justify-center space-x-1 transition-colors ${
            currentView === 'sorter' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
          title="Slide Sorter View"
        >
          <LayoutGrid className="w-3 h-3" />
          <span>Sorter</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeView('outline')}
          data-vgt-theme-active-control={currentView === 'outline' ? 'soft' : undefined}
          className={`py-1 rounded-lg text-[0.625rem] font-semibold flex items-center justify-center space-x-1 transition-colors ${
            currentView === 'outline' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
          title="Text Outline View"
        >
          <ListOrdered className="w-3 h-3" />
          <span>Outline</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1">
        {[
          ['notes', 'Notes', NotebookPen],
          ['reading', 'Reading', BookOpen],
          ['slide-master', 'Slide Master', Layers3],
          ['notes-master', 'Notes Master', NotebookPen],
          ['handout-master', 'Handout', PanelsTopLeft],
        ].map(([view, label, Icon]) => (
          <button key={String(view)} type="button" onClick={() => onChangeView(view as PresentViewMode)} data-vgt-theme-active-control={currentView === view ? 'soft' : undefined} className={`rounded-lg border px-2 py-1.5 text-[0.5625rem] font-semibold flex items-center justify-center gap-1 ${currentView === view ? 'border-blue-500/40 bg-blue-500/15 text-blue-200' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'}`}><Icon className="w-3 h-3" />{String(label)}</button>
        ))}
        <button type="button" onClick={onOpenProductivity} className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2 py-1.5 text-[0.5625rem] font-semibold text-purple-200 flex items-center justify-center gap-1"><Search className="w-3 h-3" />Find / Reuse</button>
      </div>

      {/* 2. Header & Add Slide */}
      <div className="space-y-2 pb-2 border-b border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Slides ({slides.length})
          </span>
          <button
            type="button"
            onClick={() => onAddSlide(newSlideKind)}
            disabled={slideLimitReached}
            className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-40 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-all active:scale-95"
            title={slideLimitReached ? 'Slide limit reached' : 'Add a new slide with the selected layout'}
            data-vgt-app-guide-anchor="Present:first"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>
        <label className="block text-[0.5625rem] uppercase tracking-wider text-slate-500">
          New slide layout
          <select
            aria-label="Layout for the next new slide"
            data-present-new-slide-layout="true"
            value={newSlideKind}
            onChange={(event) => setNewSlideKind(event.target.value as PresentSlideLayoutKind)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.625rem] text-slate-200"
          >
            {PRESENT_SLIDE_LAYOUT_PRESETS.map((preset) => (
              <option key={preset.kind} value={preset.kind}>{preset.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onStartBlankDeck}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-500/30 bg-slate-500/10 px-2 py-1.5 text-[0.625rem] font-semibold text-slate-300 hover:bg-slate-500/20"
          title="Replace this deck with one empty slide and no demo content (no seed coercion)"
          data-present-blank-deck="true"
        >
          <FilePlus2 className="w-3 h-3" />
          <span>Start blank deck</span>
        </button>

        {/* Paket 27: load a structured template. The picker asks for the placeholder values the
            template actually contains; anything left unfilled stays visible as {{token}}. */}
        <div className="space-y-1 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-2">
          <label className="block text-[0.5625rem] uppercase tracking-wider text-indigo-200">
            Template
            <select
              aria-label="Presentation template"
              data-present-template-select="true"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.625rem] text-slate-200"
            >
              {PRESENT_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
          <div className="break-words text-[0.5625rem] leading-4 text-indigo-200/80">
            {PRESENT_TEMPLATES.find((template) => template.id === templateId)?.description}
          </div>
          <input
            aria-label="Template title placeholder"
            data-present-template-title="true"
            value={templateTitle}
            onChange={(event) => setTemplateTitle(event.target.value)}
            placeholder="Deck title"
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.625rem] text-slate-200"
          />
          <input
            aria-label="Template subtitle placeholder"
            data-present-template-subtitle="true"
            value={templateSubtitle}
            onChange={(event) => setTemplateSubtitle(event.target.value)}
            placeholder="Subtitle"
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.625rem] text-slate-200"
          />
          <button
            type="button"
            onClick={() => onApplyTemplate(templateId, { title: templateTitle, subtitle: templateSubtitle, agendaTitle: 'Agenda', findingsTitle: 'Findings', closingTitle: 'Thank you' })}            className="w-full rounded-lg bg-indigo-600 px-2 py-1.5 text-[0.625rem] font-semibold text-white hover:bg-indigo-500"
            data-present-template-apply="true"
          >
            Use template
          </button>
        </div>
      </div>

      {/* 3. Thumbnails Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {slides.map((s, idx) => {
          const isActive = idx === activeSlideIdx;
          const isDragging = draggedIdx === idx;
          const isDragOver = dragOverIdx === idx;

          return (
            <div
              key={s.id}
              data-vgt-theme-selected-surface={isActive ? 'true' : undefined}
              data-present-slide-thumbnail={idx + 1}
              draggable
              tabIndex={0}
              role="button"
              aria-label={`Slide ${idx + 1}: ${presentSlideTitleLabel(s) || 'untitled'}${s.hidden ? ' (hidden)' : ''}`}
              aria-current={isActive ? 'true' : undefined}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectSlide(idx);
                  if (currentView !== 'normal') onChangeView('normal');
                }
              }}
              onClick={() => {
                onSelectSlide(idx);
                if (currentView !== 'normal') onChangeView('normal');
              }}
              className={`group relative p-2.5 rounded-xl cursor-pointer transition-all duration-150 border ${
                isActive
                  ? 'bg-blue-600/15 border-blue-500/50 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/30'
                  : 'bg-slate-900/60 border-white/[0.06] hover:border-white/20'
              } ${s.hidden ? 'opacity-40' : ''} ${
                isDragging ? 'opacity-40 border-2 border-dashed border-blue-500' : ''
              } ${isDragOver ? 'border-t-2 border-blue-400' : ''}`}
            >
              {/* Aspect-video Thumbnail box */}
              <div className="aspect-video w-full rounded-lg bg-black/60 border border-white/10 p-2 flex flex-col justify-between mb-2 relative overflow-hidden">
                <span className="text-[0.5625rem] font-bold text-slate-200 truncate">
                  {presentSlideTitleLabel(s) || 'Untitled Slide'}
                </span>

                <div className="space-y-1">
                  <div className="w-16 h-1 bg-blue-500/60 rounded-full" />
                  <div className="w-10 h-0.5 bg-slate-600/40 rounded-full" />
                </div>

                <div className="flex items-center justify-between text-[0.5rem] font-mono text-slate-500">
                  <span className="uppercase">{s.layout}</span>
                  {s.hidden && <span className="text-purple-400 font-bold">HIDDEN</span>}
                </div>
              </div>

              {/* Slide Meta & Quick Actions */}
              <div className="flex items-center justify-between text-[0.6875rem] text-slate-400">
                <div className="flex items-center space-x-1">
                  <GripVertical className="w-3 h-3 text-slate-600 group-hover:text-slate-400 cursor-grab" />
                  <span className="font-mono font-medium">Slide {idx + 1}</span>
                </div>

                <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button aria-label={s.hidden ? 'Show Slide' : 'Hide Slide'}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleHideSlide(idx);
                    }}
                    className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded"
                    title={s.hidden ? 'Show Slide' : 'Hide Slide'}
                  >
                    {s.hidden ? <EyeOff className="w-3 h-3 text-purple-400" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateSlide(idx);
                    }}
                    className="p-1 hover:bg-white/10 text-slate-400 hover:text-slate-200 rounded"
                    aria-label="Duplicate Slide" title="Duplicate Slide"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {slides.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSlide(idx);
                      }}
                      className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded"
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

      {/* 4. Export Buttons */}
      <button
        type="button"
        onClick={onOpenExportCenter}
        className="w-full py-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 hover:bg-cyan-500/15 text-[0.625rem] text-cyan-200 flex items-center justify-center gap-1.5 font-semibold"
        title="Open Export & Interoperability Center"
      >
        <PackageOpen className="w-3.5 h-3.5" />
        <span>Export Center</span>
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onExportPdf}
          className="py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-[0.625rem] text-slate-300 flex items-center justify-center gap-1 font-semibold"
          title="Export entire deck as PDF"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span>PDF Deck</span>
        </button>
        <button
          type="button"
          onClick={onExportPng}
          className="py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-[0.625rem] text-slate-300 flex items-center justify-center gap-1 font-semibold"
          title="Export current slide as PNG"
        >
          <ImageDown className="w-3.5 h-3.5" />
          <span>PNG Slide</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenReview}
        className="w-full py-2 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-300 text-[0.625rem] font-semibold flex items-center justify-center gap-1.5"
        title="Review, versions and approvals"
      >
        <UsersRound className="w-3.5 h-3.5" />
        <span>Review · {reviewStatus}</span>
      </button>

      {/* 5. Presenter Mode Button */}
      <button
        type="button"
        onClick={onStartPresenterMode}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 flex items-center justify-center space-x-1.5 transition-all active:scale-95"
      >
        <Play className="w-3.5 h-3.5 fill-current" />
        <span>Present Slides</span>
      </button>
    </div>
  );
};
