// STATUS: PLATIN — Present extended views: Notes page, Reading and the three master editors.
//
// Round 40 (user findings): (4) the Notes view overlapped/cut its own text; (5) Slide Master,
// Notes Master and Handout were plain forms with no preview ("early alpha"). The views are rebuilt
// with the GLASS material language of the app (translucent panels, quiet typography, no decorative
// background grids):
//   - Notes: a wide, readable page (slide thumbnail + speaker notes + header/footer/page number),
//     with print settings in a right-hand inspector;
//   - Slide Master: left master list, live slide preview (rendered with the selected master),
//     right properties inspector;
//   - Notes Master: left page list, live notes-page preview, right properties inspector;
//   - Handout Master: left layout list, live handout-grid preview (2/4/6/9 per page), right
//     properties inspector.
// Every control writes through `onUpdateModel` (masters) or `onUpdateSlide` (speaker notes) and the
// preview reads the same model, so nothing is a mock-up.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PresentDocumentModel,
  PresentHandoutMasterDefinition,
  PresentMasterSlideDefinition,
  PresentNotesMasterDefinition,
  PresentSlide,
  WorkspaceObject,
} from '../../../../shared/contracts/workspace';
import { resolvePresentSlideDesign } from '../../design/presentDesign';
import { PresenterSlideView } from '../../presenter/rendering/PresenterSlideView';
import { Layers3, NotebookPen, PanelsTopLeft, Printer, StickyNote } from 'lucide-react';

export type PresentExtendedView = 'notes' | 'reading' | 'slide-master' | 'notes-master' | 'handout-master';

interface Props {
  view: PresentExtendedView;
  /**
   * `notes` and `reading` render the slide itself and therefore need one; the three master views are
   * model-only. A deck may legitimately have nought slides — an authored empty deck stays empty
   * (`DEF-RE-004`, see `design/presentDesign.ts`) and `PresentCanvas` renders its empty-deck surface
   * instead of routing the two slide views here.
   */
  slide?: PresentSlide;
  slideIndex: number;
  model: PresentDocumentModel;
  embeddedObjects: WorkspaceObject[];
  onUpdateSlide: (slide: PresentSlide) => void;
  onUpdateModel: (model: PresentDocumentModel) => void;
}

const noop = () => undefined;

/** Shared glass surface: the app's material language, no decorative background patterns. */
const glassPanel = 'rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.85)] backdrop-blur-xl';

const shellClass = 'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#07090e] text-slate-200';
const inspectorLabelClass = 'flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300';
const inspectorInputClass = 'w-full rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-400/60';

function ReadonlySlideInner({ slide, slideIndex, model, embeddedObjects }: { slide: PresentSlide; slideIndex: number; model: PresentDocumentModel; embeddedObjects: WorkspaceObject[] }) {
  const design = resolvePresentSlideDesign(slide, model);
  return <PresenterSlideView slide={slide} design={design} currentIdx={slideIndex} totalSlides={model.slides.length} embeddedObjects={embeddedObjects} animations={[]} animationProgressById={{}} triggerObjectIds={new Set()} onTriggerObject={noop} advancePresentation={noop} laserActive={false} penActive={false} laserPos={null} inkStrokes={[]} onPointerDown={noop} onPointerMove={noop} onPointerUp={noop} />;
}

/** Round 42: memoized slide renderer — typing in the notes must not re-render the slide preview. */
const ReadonlySlide = React.memo(ReadonlySlideInner);

/** 16:9 glass frame around a rendered slide. */
const SlideFrame: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <div className="relative w-full overflow-hidden rounded-xl border border-white/15 bg-black shadow-2xl" data-present-slide-preview={label}>
    <div className="aspect-video w-full [&>div]:h-full">{children}</div>
  </div>
);

const ColorField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className={inspectorLabelClass}>
    <span>{label}</span>
    <input aria-label={label} type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-6 w-10 cursor-pointer rounded border border-white/10 bg-transparent" />
  </label>
);

const TextField: React.FC<{ label: string; value: string; onChange: (value: string) => void; maxLength?: number; placeholder?: string }> = ({ label, value, onChange, maxLength = 2048, placeholder }) => (
  <label className="block space-y-1 text-xs text-slate-300">
    <span className="text-slate-400">{label}</span>
    <input aria-label={label} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={inspectorInputClass} />
  </label>
);

const CheckboxField: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
    <input aria-label={label} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}
  </label>
);

const ViewHeader: React.FC<{ icon: React.ReactNode; title: string; description: string; trailing?: React.ReactNode }> = ({ icon, title, description, trailing }) => (
  <header className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-6 py-4">
    <div className="flex items-start gap-3">
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-300">{icon}</div>
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-100">{title}</h2>
        <p className="max-w-2xl text-xs leading-relaxed text-slate-400">{description}</p>
      </div>
    </div>
    {trailing}
  </header>
);

// ---------------------------------------------------------------------------------------------
// Notes page (Round 42): large rendered slide on the left, glass speaker-notes area on the right.
// Typing keeps a local draft and commits through a debounce (plus blur/unmount) so the document,
// the history and the memoized slide preview are not touched on every keystroke.
const NOTES_TYPING_DEBOUNCE_MS = 300;

const NotesPageView: React.FC<{ slide: PresentSlide; slideIndex: number; model: PresentDocumentModel; embeddedObjects: WorkspaceObject[]; onUpdateSlide: (slide: PresentSlide) => void; onUpdateModel: (model: PresentDocumentModel) => void }> = ({ slide, slideIndex, model, embeddedObjects, onUpdateSlide, onUpdateModel }) => {
  const master = model.notesMaster!;
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [notes, setNotes] = useState(slide.speakerNotes ?? '');
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const slideRef = useRef(slide);
  slideRef.current = slide;
  const onUpdateSlideRef = useRef(onUpdateSlide);
  onUpdateSlideRef.current = onUpdateSlide;

  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    onUpdateSlideRef.current({ ...slideRef.current, speakerNotes: notesRef.current.slice(0, 131_072) });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // External change (undo/redo, slide switch through a new key) wins when nothing is pending.
  useEffect(() => {
    if (dirtyRef.current) return;
    const external = slide.speakerNotes ?? '';
    if (external !== notesRef.current) {
      notesRef.current = external;
      setNotes(external);
    }
  }, [slide.speakerNotes]);

  // A pending draft is committed when the view unmounts/navigates away.
  useEffect(() => () => { flushRef.current(); }, []);

  const scheduleCommit = (value: string) => {
    notesRef.current = value;
    dirtyRef.current = true;
    setNotes(value);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => flushRef.current(), NOTES_TYPING_DEBOUNCE_MS);
  };

  const patchNotesMaster = (patch: Partial<PresentNotesMasterDefinition>) => onUpdateModel({ ...model, notesMaster: { ...master, ...patch } });

  return (
    <div className={shellClass} data-present-extended-view="notes">
      <ViewHeader
        icon={<StickyNote className="h-4 w-4" />}
        title="Notes Page"
        description="Large slide preview and the speaker notes side by side — printed with the notes-master typography."
        trailing={(
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.625rem] font-mono text-slate-400" data-present-notes-position="true">
              Slide {slideIndex + 1} of {model.slides.length}
            </span>
            <button type="button" onClick={() => setShowPrintSettings((value) => !value)} aria-pressed={showPrintSettings} className={`flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs ${showPrintSettings ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
              <Printer className="h-3.5 w-3.5" /> Print settings
            </button>
          </div>
        )}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4" data-present-notes-layout="split">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
          {/* Left: the current slide, large and fully rendered (60–65 % width on wide screens). */}
          <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:w-[63%] lg:shrink-0" data-present-notes-slide="true">
            <SlideFrame label="notes-thumbnail"><ReadonlySlide slide={slide} slideIndex={slideIndex} model={model} embeddedObjects={embeddedObjects} /></SlideFrame>
            {master.showHeader && (
              <p className="truncate text-[0.625rem] font-medium uppercase tracking-[0.16em] text-slate-500" data-present-notes-header="true">{master.headerText}</p>
            )}
          </div>
          {/* Right: glass notes area, readable line length, scrollable. */}
          <section
            className={`flex min-h-[16rem] min-w-0 flex-1 flex-col self-stretch overflow-hidden ${glassPanel}`}
            aria-label="Speaker notes area"
            data-present-notes-page="true"
            style={{ backgroundColor: master.backgroundColor, color: master.bodyColor, fontFamily: master.fontFamily }}
          >
            <header className="flex items-center justify-between border-b border-black/10 px-4 py-2">
              <div className="min-w-0">
                <p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] opacity-60">Speaker notes</p>
                <h3 className="truncate text-sm font-semibold" style={{ color: master.titleColor }}>{slide.title?.trim() || `Slide ${slideIndex + 1}`}</h3>
              </div>
              <span className="shrink-0 font-mono text-[0.5625rem] opacity-50" data-present-notes-chars="true">{notes.length} chars</span>
            </header>
            <textarea
              aria-label="Speaker notes"
              value={notes}
              onChange={(event) => scheduleCommit(event.target.value)}
              onBlur={() => flushRef.current()}
              placeholder="Write the spoken notes for this slide…"
              className="mx-auto min-h-0 w-full max-w-[70ch] flex-1 resize-none overflow-auto bg-transparent p-4 leading-7 outline-none"
              style={{ fontSize: `${master.notesFontSizePt}pt`, color: master.bodyColor, fontFamily: master.fontFamily }}
            />
            {(master.showFooter || master.showPageNumber) && (
              <footer className="flex items-center justify-between border-t border-black/10 px-4 py-1.5 text-[0.625rem] opacity-60">
                <span>{master.showFooter ? master.footerText : ''}</span>
                {master.showPageNumber && <span>{slideIndex + 1}</span>}
              </footer>
            )}
          </section>
          {showPrintSettings && (
            <aside className={`w-72 shrink-0 space-y-2 self-start ${glassPanel} p-4`} aria-label="Notes print settings">
              <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Print settings</h3>
              <TextField label="Header" value={master.headerText} onChange={(headerText) => patchNotesMaster({ headerText })} />
              <TextField label="Footer" value={master.footerText} onChange={(footerText) => patchNotesMaster({ footerText })} />
              <label className="block space-y-1 text-xs text-slate-300">
                <span className="text-slate-400">Notes font size (pt)</span>
                <input aria-label="Notes font size" type="number" min={8} max={48} value={master.notesFontSizePt} onChange={(event) => patchNotesMaster({ notesFontSizePt: Math.max(8, Math.min(48, Number(event.target.value) || 12)) })} className={inspectorInputClass} />
              </label>
              <CheckboxField label="Show header" checked={master.showHeader} onChange={(showHeader) => patchNotesMaster({ showHeader })} />
              <CheckboxField label="Show footer" checked={master.showFooter} onChange={(showFooter) => patchNotesMaster({ showFooter })} />
              <CheckboxField label="Show page number" checked={master.showPageNumber} onChange={(showPageNumber) => patchNotesMaster({ showPageNumber })} />
              <CheckboxField label="Show slide thumbnail" checked={master.showSlideThumbnail} onChange={(showSlideThumbnail) => patchNotesMaster({ showSlideThumbnail })} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Slide Master: left list, live preview, right inspector.
// ---------------------------------------------------------------------------------------------
const SlideMasterView: React.FC<{ model: PresentDocumentModel; slide?: PresentSlide; slideIndex: number; embeddedObjects: WorkspaceObject[]; onUpdateModel: (model: PresentDocumentModel) => void }> = ({ model, slide, slideIndex, embeddedObjects, onUpdateModel }) => {
  const masters = model.masters ?? [];
  const [activeMasterId, setActiveMasterId] = useState(masters[0]?.id ?? '');
  const activeMaster: PresentMasterSlideDefinition | undefined = masters.find((master) => master.id === activeMasterId) ?? masters[0];
  const previewSlide = useMemo<PresentSlide | null>(() => {
    const base = slide ?? model.slides[0];
    if (!base || !activeMaster) return null;
    return { ...base, masterId: activeMaster.id };
  }, [slide, model.slides, activeMaster]);
  const patchMaster = (patch: Partial<PresentMasterSlideDefinition>) => {
    if (!activeMaster) return;
    onUpdateModel({ ...model, masters: masters.map((master) => (master.id === activeMaster.id ? { ...master, ...patch } : master)) });
  };
  return (
    <div className={shellClass} data-present-extended-view="slide-master">
      <ViewHeader icon={<Layers3 className="h-4 w-4" />} title="Slide Master" description="Each master is a live preview of the slide styling; slides keep their master relationship and per-slide overrides." />
      <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-6">
        <aside className={`w-56 shrink-0 space-y-2 self-start ${glassPanel} p-3`} aria-label="Master list">
          <h3 className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Masters</h3>
          {masters.map((master) => (
            <button
              key={master.id}
              type="button"
              data-present-master-id={master.id}
              aria-pressed={activeMaster?.id === master.id}
              onClick={() => setActiveMasterId(master.id)}
              className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${activeMaster?.id === master.id ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
            >
              <span className="block font-semibold">{master.name}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[0.625rem] text-slate-400">
                <i aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: master.backgroundColor ?? '#0c1222' }} />
                {master.accentColor ?? 'accent'} · {master.showFooter === false ? 'no footer' : master.footerText ?? 'footer'}
              </span>
            </button>
          ))}
          {masters.length === 0 && <p className="px-1 text-xs text-slate-500">This deck carries no master definitions.</p>}
        </aside>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-slate-500" data-present-master-preview-title={activeMaster?.name ?? ''}>Live preview · {activeMaster?.name ?? 'no master'}</p>
          {previewSlide ? <SlideFrame label="slide-master"><ReadonlySlide slide={previewSlide} slideIndex={slideIndex} model={model} embeddedObjects={embeddedObjects} /></SlideFrame> : <div className={`${glassPanel} p-8 text-sm text-slate-400`}>No slide to preview.</div>}
        </div>
        <aside className={`w-72 shrink-0 space-y-2 self-start ${glassPanel} p-4`} aria-label="Master properties">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Properties</h3>
          {activeMaster && (
            <>
              <TextField label="Master name" value={activeMaster.name} onChange={(name) => patchMaster({ name })} />
              <ColorField label="Background" value={activeMaster.backgroundColor ?? '#0c1222'} onChange={(backgroundColor) => patchMaster({ backgroundColor })} />
              <ColorField label="Title colour" value={activeMaster.titleColor ?? '#f8fafc'} onChange={(titleColor) => patchMaster({ titleColor })} />
              <ColorField label="Body colour" value={activeMaster.bodyColor ?? '#cbd5e1'} onChange={(bodyColor) => patchMaster({ bodyColor })} />
              <ColorField label="Accent colour" value={activeMaster.accentColor ?? '#38bdf8'} onChange={(accentColor) => patchMaster({ accentColor })} />
              <CheckboxField label="Show footer" checked={activeMaster.showFooter !== false} onChange={(showFooter) => patchMaster({ showFooter })} />
              <label className="block space-y-1 text-xs text-slate-300">
                <span className="text-slate-400">Footer position</span>
                <select
                  aria-label="Footer position"
                  value={String((activeMaster as { footerPosition?: string }).footerPosition ?? 'left')}
                  onChange={(event) => patchMaster({ footerPosition: event.target.value } as never)}
                  className={inspectorInputClass}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <TextField label="Footer text" value={activeMaster.footerText ?? ''} onChange={(footerText) => patchMaster({ footerText })} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Notes Master: left page list, live notes-page preview, right inspector.
// ---------------------------------------------------------------------------------------------
const NotesMasterView: React.FC<{ model: PresentDocumentModel; slide?: PresentSlide; slideIndex: number; embeddedObjects: WorkspaceObject[]; onUpdateModel: (model: PresentDocumentModel) => void }> = ({ model, slide, slideIndex, embeddedObjects, onUpdateModel }) => {
  const master = model.notesMaster!;
  const patch = (patchValue: Partial<PresentNotesMasterDefinition>) => onUpdateModel({ ...model, notesMaster: { ...master, ...patchValue } });
  const previewSlide = slide ?? model.slides[0];
  return (
    <div className={shellClass} data-present-extended-view="notes-master">
      <ViewHeader icon={<NotebookPen className="h-4 w-4" />} title="Notes Master" description="The Notes Master controls the Notes Page view, print and export. The preview is the real notes page." />
      <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-6">
        <aside className={`w-56 shrink-0 space-y-2 self-start ${glassPanel} p-3`} aria-label="Notes page parts">
          <h3 className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Notes page</h3>
          <button type="button" aria-pressed="true" data-present-notes-part="page" className="w-full rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-left text-xs text-cyan-100">
            <span className="block font-semibold">Notes Page</span>
            <span className="mt-0.5 block text-[0.625rem] text-slate-400">Slide thumbnail + notes + header/footer</span>
          </button>
          {[{ key: 'header', label: 'Header', active: master.showHeader }, { key: 'footer', label: 'Footer', active: master.showFooter }, { key: 'page-number', label: 'Page number', active: master.showPageNumber }, { key: 'thumbnail', label: 'Slide thumbnail', active: master.showSlideThumbnail }].map((part) => (
            <p key={part.key} data-present-notes-part={part.key} className={`rounded-lg px-3 py-1.5 text-[0.6875rem] ${part.active ? 'text-slate-200' : 'text-slate-500'}`}>{part.active ? '●' : '○'} {part.label}</p>
          ))}
        </aside>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-slate-500">Live preview</p>
          {previewSlide ? (
            <div
              className={`mx-auto w-full max-w-3xl ${glassPanel} p-6`}
              data-present-notes-master-preview="true"
              style={{ backgroundColor: master.backgroundColor, color: master.bodyColor, fontFamily: master.fontFamily }}
            >
              {master.showHeader && <div className="mb-3 border-b border-black/15 pb-2 text-[0.6875rem] uppercase tracking-[0.18em] opacity-70">{master.headerText}</div>}
              <div className="grid gap-4 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                {master.showSlideThumbnail && <SlideFrame label="notes-master-thumbnail"><ReadonlySlide slide={previewSlide} slideIndex={slideIndex} model={model} embeddedObjects={embeddedObjects} /></SlideFrame>}
                <div>
                  <h3 className="mb-2 text-lg font-semibold" style={{ color: master.titleColor }}>{previewSlide.title?.trim() || `Slide ${slideIndex + 1}`}</h3>
                  <p className="leading-relaxed" style={{ fontSize: `${master.notesFontSizePt}pt`, color: master.bodyColor }}>The speaker notes of this slide are printed here at {master.notesFontSizePt} pt.</p>
                </div>
              </div>
              <div className="mt-4 flex justify-between border-t border-black/15 pt-2 text-[0.6875rem] opacity-70">
                <span>{master.showFooter ? master.footerText : ''}</span>
                {master.showPageNumber && <span>{slideIndex + 1}</span>}
              </div>
            </div>
          ) : <div className={`${glassPanel} p-8 text-sm text-slate-400`}>No slide to preview.</div>}
        </div>
        <aside className={`w-72 shrink-0 space-y-2 self-start ${glassPanel} p-4`} aria-label="Notes master properties">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Properties</h3>
          <ColorField label="Background" value={master.backgroundColor} onChange={(backgroundColor) => patch({ backgroundColor })} />
          <ColorField label="Title colour" value={master.titleColor} onChange={(titleColor) => patch({ titleColor })} />
          <ColorField label="Body colour" value={master.bodyColor} onChange={(bodyColor) => patch({ bodyColor })} />
          <label className="block space-y-1 text-xs text-slate-300">
            <span className="text-slate-400">Notes font size (pt)</span>
            <input aria-label="Notes font size" type="number" min={8} max={48} value={master.notesFontSizePt} onChange={(event) => patch({ notesFontSizePt: Math.max(8, Math.min(48, Number(event.target.value) || 12)) })} className={inspectorInputClass} />
          </label>
          <TextField label="Header" value={master.headerText} onChange={(headerText) => patch({ headerText })} />
          <TextField label="Footer" value={master.footerText} onChange={(footerText) => patch({ footerText })} />
          <CheckboxField label="Show header" checked={master.showHeader} onChange={(showHeader) => patch({ showHeader })} />
          <CheckboxField label="Show footer" checked={master.showFooter} onChange={(showFooter) => patch({ showFooter })} />
          <CheckboxField label="Show page number" checked={master.showPageNumber} onChange={(showPageNumber) => patch({ showPageNumber })} />
          <CheckboxField label="Show slide thumbnail" checked={master.showSlideThumbnail} onChange={(showSlideThumbnail) => patch({ showSlideThumbnail })} />
        </aside>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Handout Master: left layout list, live grid preview (2/4/6/9), right inspector.
// ---------------------------------------------------------------------------------------------
const HANDOUT_LAYOUTS: Array<{ slidesPerPage: PresentHandoutMasterDefinition['slidesPerPage']; label: string }> = [
  { slidesPerPage: 2, label: '2 slides per page' },
  { slidesPerPage: 4, label: '4 slides per page' },
  { slidesPerPage: 6, label: '6 slides per page' },
  { slidesPerPage: 9, label: '9 slides per page' },
];

const HandoutMasterView: React.FC<{ model: PresentDocumentModel; slideIndex: number; embeddedObjects: WorkspaceObject[]; onUpdateModel: (model: PresentDocumentModel) => void }> = ({ model, slideIndex, embeddedObjects, onUpdateModel }) => {
  const master = model.handoutMaster!;
  const patch = (patchValue: Partial<PresentHandoutMasterDefinition>) => onUpdateModel({ ...model, handoutMaster: { ...master, ...patchValue } });
  const pageSlides = model.slides.slice(0, master.slidesPerPage);
  const columns = master.slidesPerPage <= 2 ? 2 : master.slidesPerPage === 4 ? 2 : 3;
  return (
    <div className={shellClass} data-present-extended-view="handout-master">
      <ViewHeader icon={<PanelsTopLeft className="h-4 w-4" />} title="Handout Master" description="Handout page composition and print defaults. The preview is the real slide grid with the current master settings." />
      <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-6">
        <aside className={`w-56 shrink-0 space-y-2 self-start ${glassPanel} p-3`} aria-label="Handout layouts">
          <h3 className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Layouts</h3>
          {HANDOUT_LAYOUTS.map((layout) => (
            <button
              key={layout.slidesPerPage}
              type="button"
              data-present-handout-layout={layout.slidesPerPage}
              aria-pressed={master.slidesPerPage === layout.slidesPerPage}
              onClick={() => patch({ slidesPerPage: layout.slidesPerPage })}
              className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${master.slidesPerPage === layout.slidesPerPage ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
            >
              {layout.label}
            </button>
          ))}
        </aside>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-slate-500">Live preview · {master.orientation}</p>
          <div
            className={`mx-auto w-full max-w-3xl ${glassPanel} p-6`}
            data-present-handout-preview="true"
            data-present-handout-per-page={master.slidesPerPage}
            style={{ backgroundColor: master.backgroundColor, color: master.textColor, fontFamily: master.fontFamily, aspectRatio: master.orientation === 'landscape' ? '1.414 / 1' : '1 / 1.414' }}
          >
            {master.showHeader && <div className="mb-2 border-b border-black/15 pb-1 text-[0.625rem] uppercase tracking-[0.18em] opacity-70">{master.headerText}</div>}
            <div className="grid h-[calc(100%-3rem)] gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${Math.ceil(master.slidesPerPage / columns)}, minmax(0, 1fr))` }}>
              {pageSlides.map((pageSlide, index) => (
                <div key={pageSlide.id} data-present-handout-cell={index} className="min-h-0 overflow-hidden rounded border border-black/20">
                  <div data-present-slide-preview={`handout-${index}`} className="aspect-video w-full [&>div]:h-full"><ReadonlySlide slide={pageSlide} slideIndex={slideIndex + index} model={model} embeddedObjects={embeddedObjects} /></div>
                </div>
              ))}
              {Array.from({ length: Math.max(0, master.slidesPerPage - pageSlides.length) }).map((_, index) => (
                <div key={`empty-${index}`} data-present-handout-empty="true" className="flex min-h-0 items-center justify-center rounded border border-dashed border-black/20 text-[0.625rem] opacity-40">empty</div>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-black/15 pt-1 text-[0.625rem] opacity-70">
              <span>{master.showFooter ? master.footerText : ''}</span>
              {master.showPageNumber && <span>1</span>}
            </div>
          </div>
        </div>
        <aside className={`w-72 shrink-0 space-y-2 self-start ${glassPanel} p-4`} aria-label="Handout master properties">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Properties</h3>
          <ColorField label="Background" value={master.backgroundColor} onChange={(backgroundColor) => patch({ backgroundColor })} />
          <ColorField label="Text colour" value={master.textColor} onChange={(textColor) => patch({ textColor })} />
          <label className="block space-y-1 text-xs text-slate-300">
            <span className="text-slate-400">Slides per page</span>
            <select aria-label="Slides per page" value={master.slidesPerPage} onChange={(event) => patch({ slidesPerPage: Number(event.target.value) as PresentHandoutMasterDefinition['slidesPerPage'] })} className={inspectorInputClass}>
              {HANDOUT_LAYOUTS.map((layout) => <option key={layout.slidesPerPage} value={layout.slidesPerPage}>{layout.slidesPerPage}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-xs text-slate-300">
            <span className="text-slate-400">Orientation</span>
            <select aria-label="Orientation" value={master.orientation} onChange={(event) => patch({ orientation: event.target.value as PresentHandoutMasterDefinition['orientation'] })} className={inspectorInputClass}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <TextField label="Header" value={master.headerText} onChange={(headerText) => patch({ headerText })} />
          <TextField label="Footer" value={master.footerText} onChange={(footerText) => patch({ footerText })} />
          <CheckboxField label="Show header" checked={master.showHeader} onChange={(showHeader) => patch({ showHeader })} />
          <CheckboxField label="Show footer" checked={master.showFooter} onChange={(showFooter) => patch({ showFooter })} />
          <CheckboxField label="Show page number" checked={master.showPageNumber} onChange={(showPageNumber) => patch({ showPageNumber })} />
          <CheckboxField label="Include notes lines" checked={master.includeNotesLines} onChange={(includeNotesLines) => patch({ includeNotesLines })} />
        </aside>
      </div>
    </div>
  );
};

export const PresentViewWorkspace: React.FC<Props> = ({ view, slide, slideIndex, model, embeddedObjects, onUpdateSlide, onUpdateModel }) => {
  if (view === 'reading') {
    // Fail closed instead of crashing on `slide.title` if this view is ever routed without a slide.
    if (!slide) return null;
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto bg-[#06080d] p-8" aria-label="Reading view">
        <div className="w-full max-w-5xl"><SlideFrame label="reading"><ReadonlySlide slide={slide} slideIndex={slideIndex} model={model} embeddedObjects={embeddedObjects} /></SlideFrame></div>
      </div>
    );
  }

  if (view === 'notes') {
    if (!slide) return null;
    return <NotesPageView key={slide.id} slide={slide} slideIndex={slideIndex} model={model} embeddedObjects={embeddedObjects} onUpdateSlide={onUpdateSlide} onUpdateModel={onUpdateModel} />;
  }

  if (view === 'slide-master') {
    return <SlideMasterView model={model} slide={slide} slideIndex={slideIndex} embeddedObjects={embeddedObjects} onUpdateModel={onUpdateModel} />;
  }

  if (view === 'notes-master') {
    return <NotesMasterView model={model} slide={slide} slideIndex={slideIndex} embeddedObjects={embeddedObjects} onUpdateModel={onUpdateModel} />;
  }

  return <HandoutMasterView model={model} slideIndex={slideIndex} embeddedObjects={embeddedObjects} onUpdateModel={onUpdateModel} />;
};
