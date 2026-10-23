// STATUS: PLATIN — Present M1 primary toolbar with a non-scrolling primary zone + "More" popover.
//
// Round 40 (user finding): the single-row toolbar put so many controls before the insert commands
// that the basics (Text/Shapes/Image/Widgets/Diagrams) were only reachable after a horizontal
// scroll. The toolbar is now split by frequency:
//   - primary zone (always visible, never scrolls): undo/redo, Text, Shapes, Image, Widgets,
//     Diagrams, the five slide-layout switches, the panel toggles and the "More" trigger;
//   - "More" popover (portal to document.body, position: fixed, high z-index): slide setup,
//     transitions, arrange commands, extra inserts (code/chart/table/media/workspace/video/speaker),
//     deck tools (sections/rehearsal/comments) and the theme manager.
// All previous handlers stay wired; keyboard (Escape) and outside-click close the popover.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PresentDocumentModel,
  PresentShapeSceneObject,
  PresentSlide,
  PresentSlideTransition,
  PresentWidgetSceneObject,
  PresentDiagramSceneObject,
} from '../../../../shared/contracts/workspace';
import {
  DEFAULT_PRESENT_THEMES,
  resolvePresentMasterId,
  updateMasterDefinition,
  updatePresentTheme,
  type ResolvedPresentDesign,
} from '../../design/presentDesign';
import {
  PRESENT_STYLE_IMAGE_MAX_BYTES,
  presentBackgroundImageFitsLimit,
  readPresentSlideBackgroundStyle,
  withPresentSlideBackgroundStyle,
} from '../../contracts/presentStyle';
import {
  TRANSITION_EFFECTS,
  SLIDE_SIZES,
} from '../../contracts/types';
import {
  normalizePresentTransition,
} from '../../presenter/transitions/presentTransitionEngine';
import { PresentInsertDropdowns } from './PresentInsertDropdowns';
import {
  LayoutGrid,
  List,
  BarChart3,
  Square,
  Columns2,
  ImagePlus,
  Type,
  Table2,
  Layers3,
  WandSparkles,
  MessageSquare,
  Code,
  Sliders,
  Palette,
  FolderTree,
  Timer,
  MessageCircle,
  Film,
  Video,
  Mic,
  Play,
  CopyCheck,
  Link2,
  Undo2,
  Redo2,
  Group,
  Ungroup,
  FlipHorizontal2,
  FlipVertical2,
  ArrowUpToLine,
  ArrowDownToLine,
  MoreHorizontal,
  X,
} from 'lucide-react';
import type { PresentEditorCommand } from '../presentEditorCommands';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PRESENT_TOOLBAR_COPY } from '../../locale/presentToolbarLocale';

interface PresentTopToolbarProps {
  slide: PresentSlide;
  design: ResolvedPresentDesign;
  presentData: PresentDocumentModel;
  onUpdateSlide: (updated: PresentSlide) => void;
  onUpdatePresentData: (next: PresentDocumentModel) => void;
  onInsertImageFile: (file: File) => void;
  onAddText: () => void;
  onAddShape: (shape: PresentShapeSceneObject['shape']) => void;
  onAddWidget: (widgetType: PresentWidgetSceneObject['widgetType']) => void;
  onAddDiagram: (diagramType: PresentDiagramSceneObject['diagramType']) => void;
  onAddCode: (lang: string) => void;
  onAddChart: () => void;
  onAddTable: () => void;
  showLayers: boolean;
  onToggleLayers: () => void;
  showAnimations: boolean;
  onToggleAnimations: () => void;
  showNotes: boolean;
  onToggleNotes: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
  onOpenThemeManager: () => void;
  onOpenSections: () => void;
  onOpenRehearsal: () => void;
  onOpenComments: () => void;
  onOpenMediaEmbed: () => void;
  onOpenVideoExport?: () => void;
  onOpenSpeakerCoach?: () => void;
  onOpenWorkspaceIntegration?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onPreviewTransition: () => void;
  onApplyTransitionToAll: () => void;
  /** Number of selected scene objects; 0 disables the selection-only toolbar actions. */
  selectionSize?: number;
  /** Commands the toolbar shares with the canvas keyboard: one executor, two entry points. */
  onCommand?: (command: PresentEditorCommand) => void;
  /** Armed insert tool: the next canvas click places this object at the click point. */
  armedTool?: 'text' | null;
  onToggleArmedTool?: (tool: 'text') => void;
  /** Applies a theme through `applyPresentTheme` so the preserved-formatting report is real. */
  onApplyThemeToDeck?: (themeId: string) => void;
}

type PresentMoreSection = { title: string; children: React.ReactNode };

export const PresentTopToolbar: React.FC<PresentTopToolbarProps> = ({
  slide,
  design,
  presentData,
  onUpdateSlide,
  onUpdatePresentData,
  onInsertImageFile,
  onAddText,
  onAddShape,
  onAddWidget,
  onAddDiagram,
  onAddCode,
  onAddChart,
  onAddTable,
  showLayers,
  onToggleLayers,
  showAnimations,
  onToggleAnimations,
  showNotes,
  onToggleNotes,
  showInspector,
  onToggleInspector,
  onOpenThemeManager,
  onOpenSections,
  onOpenRehearsal,
  onOpenComments,
  onOpenMediaEmbed,
  onOpenVideoExport,
  onOpenSpeakerCoach,
  onOpenWorkspaceIntegration,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onPreviewTransition,
  onApplyTransitionToAll,
  selectionSize = 0,
  onCommand,
  armedTool = null,
  onToggleArmedTool,
  onApplyThemeToDeck,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_TOOLBAR_COPY[locale];
  const normalizedTransition = normalizePresentTransition(slide.transition);
  const imagePickerRef = useRef<HTMLInputElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePosition, setMorePosition] = useState<{ top: number; right: number } | null>(null);
  const [backgroundImageError, setBackgroundImageError] = useState<string | null>(null);
  const activeMasterId = resolvePresentMasterId(presentData, slide);
  const activeMaster = (presentData.masters ?? []).find((master) => master.id === activeMasterId);
  const patchActiveMaster = (patch: Record<string, unknown>) => {
    onUpdatePresentData(updateMasterDefinition(presentData, activeMasterId, patch as never));
  };
  const slideBackgroundStyle = readPresentSlideBackgroundStyle(slide);
  const slideGradient = (slide as { backgroundGradient?: { type: 'linear' | 'radial'; from: string; to: string; angle?: number } }).backgroundGradient;
  const setSlideGradient = (gradient: { type: 'linear' | 'radial'; from: string; to: string; angle?: number } | undefined) => {
    onUpdateSlide({ ...slide, backgroundGradient: gradient } as PresentSlide);
  };
  const setBackgroundImage = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      if (!presentBackgroundImageFitsLimit(dataUrl)) {
        setBackgroundImageError(`Background image rejected: maximum ${Math.round(PRESENT_STYLE_IMAGE_MAX_BYTES / 1_000_000)} MB.`);
        return;
      }
      setBackgroundImageError(null);
      onUpdateSlide(withPresentSlideBackgroundStyle({ ...slide } as unknown as object, { imageDataUrl: dataUrl }) as PresentSlide);
    };
    reader.readAsDataURL(file);
  };

  const openMore = () => {
    const trigger = moreButtonRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      setMorePosition({ top: Math.round(rect.bottom + 4), right: Math.max(8, Math.round(window.innerWidth - rect.right)) });
    }
    setMoreOpen(true);
  };

  const closeMore = () => {
    setMoreOpen(false);
    setMorePosition(null);
  };

  // Outside click and Escape close the popover; the trigger and the popover stay interactive.
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (moreMenuRef.current?.contains(target)) return;
      if (moreButtonRef.current?.contains(target)) return;
      closeMore();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [moreOpen]);

  const layoutButtons: Array<{ layout: PresentSlide['layout']; label: string; title: string; icon: React.ReactNode }> = [
    { layout: 'cards', label: copy.text.cards, title: copy.text.cardsTitle, icon: <LayoutGrid className="w-3 h-3" /> },
    { layout: 'bullet-list', label: copy.text.bullets, title: copy.text.bulletsTitle, icon: <List className="w-3 h-3" /> },
    { layout: 'split', label: 'Two column', title: 'Two content (two side-by-side columns)', icon: <Columns2 className="w-3 h-3" /> },
    { layout: 'chart', label: copy.text.chart, title: copy.text.chartTitle, icon: <BarChart3 className="w-3 h-3" /> },
    { layout: 'blank', label: copy.text.blank, title: copy.text.blankTitle, icon: <Square className="w-3 h-3" /> },
  ];

  const moreSections: PresentMoreSection[] = [
    {
      title: 'Slide setup',
      children: (
        <>
          <select
            aria-label={copy.text.slideAspectRatio}
            value={presentData.aspectRatio || '16:9'}
            onChange={(event) => onUpdatePresentData({ ...presentData, aspectRatio: event.target.value })}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-200"
            title={copy.text.aspectRatio}
          >
            {SLIDE_SIZES.map((size) => <option key={size.key} value={size.key}>{copy.slideSizes[size.key] ?? size.label}</option>)}
          </select>
          <select
            aria-label={copy.text.presentationTheme}
            value={presentData.themeId || DEFAULT_PRESENT_THEMES[0].id}
            onChange={(event) => (onApplyThemeToDeck ?? ((themeId: string) => onUpdatePresentData(updatePresentTheme(presentData, themeId))))(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-200"
            title={copy.text.theme}
          >
            {(presentData.themes || DEFAULT_PRESENT_THEMES).map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center justify-between rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-[0.6875rem] text-slate-300" title={copy.text.slideBackground}>
              <span>{copy.text.slideBackground}</span>
              <input
                type="color"
                aria-label={copy.text.slideBackground}
                value={slide.backgroundColor || design.backgroundColor}
                onChange={(event) => onUpdateSlide({ ...slide, backgroundColor: event.target.value })}
                className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent"
              />
            </label>
            <button type="button" onClick={() => { closeMore(); onOpenThemeManager(); }} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5" aria-label={copy.text.brandKitMasters} title={copy.text.brandKitMasters}>
              <Palette className="w-3.5 h-3.5 text-amber-400" /> {copy.text.brandKitMasters}
            </button>
          </div>
          {/* Round 41: slide background gradient (two stops + angle). */}
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-[0.6875rem] text-slate-300">
            <input
              aria-label="Use slide gradient"
              type="checkbox"
              checked={Boolean(slideGradient)}
              onChange={(event) => setSlideGradient(event.target.checked
                ? { type: 'linear', from: slideGradient?.from ?? '#ffffff', to: slideGradient?.to ?? '#bfdbfe', angle: slideGradient?.angle ?? 135 }
                : undefined)}
            />
            Slide gradient
          </label>
          {slideGradient && (
            <div className="grid grid-cols-3 gap-1">
              <label className="space-y-0.5 text-[0.625rem] text-slate-400">
                <span>From</span>
                <input aria-label="Slide gradient from" type="color" value={slideGradient.from} onChange={(event) => setSlideGradient({ ...slideGradient, from: event.target.value })} className="h-5 w-full cursor-pointer rounded border border-white/10 bg-transparent" />
              </label>
              <label className="space-y-0.5 text-[0.625rem] text-slate-400">
                <span>To</span>
                <input aria-label="Slide gradient to" type="color" value={slideGradient.to} onChange={(event) => setSlideGradient({ ...slideGradient, to: event.target.value })} className="h-5 w-full cursor-pointer rounded border border-white/10 bg-transparent" />
              </label>
              <label className="space-y-0.5 text-[0.625rem] text-slate-400">
                <span>Angle</span>
                <input aria-label="Slide gradient angle" type="number" min={0} max={360} value={slideGradient.angle ?? 135} onChange={(event) => setSlideGradient({ ...slideGradient, angle: Math.max(0, Math.min(360, Number(event.target.value) || 0)) })} className="w-full rounded-md border border-white/10 bg-slate-950/80 px-1.5 py-1 text-[0.625rem] text-slate-100" />
              </label>
            </div>
          )}
          {/* Round 41: authored background image through the existing image/data-URL path (size limited). */}
          <div className="flex items-center gap-2">
            <label className="flex-1 rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1 text-[0.6875rem] text-slate-300">
              <span className="block pb-0.5">Background image</span>
              <input
                aria-label="Slide background image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => { setBackgroundImage(event.target.files?.[0] ?? null); event.currentTarget.value = ''; }}
                className="w-full text-[0.625rem] text-slate-400"
              />
            </label>
            <button
              type="button"
              aria-label="Reset slide background image"
              onClick={() => { setBackgroundImageError(null); onUpdateSlide(withPresentSlideBackgroundStyle({ ...slide } as unknown as object, { imageDataUrl: undefined }) as PresentSlide); }}
              className="rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5"
            >
              Reset image
            </button>
          </div>
          {slideBackgroundStyle.imageDataUrl && <p data-present-slide-background-image="true" className="text-[0.625rem] text-emerald-300">Background image active (under all objects).</p>}
          {backgroundImageError && <p role="alert" className="text-[0.625rem] text-red-300">{backgroundImageError}</p>}
          {/* Round 41 (no unchangeable branding): the footer text/visibility/alignment are authored here. */}
          <div className="space-y-1 rounded-lg border border-white/10 bg-slate-900/70 p-2">
            <label className="block space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Footer text</span>
              <input aria-label="Footer text" value={activeMaster?.footerText ?? ''} maxLength={2048} onChange={(event) => patchActiveMaster({ footerText: event.target.value })} className="w-full rounded-md border border-white/10 bg-slate-950/80 px-1.5 py-1 text-[0.625rem] text-slate-100" placeholder="(empty footer)" />
            </label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[0.625rem] text-slate-300">
                <input aria-label="Show footer" type="checkbox" checked={activeMaster?.showFooter !== false} onChange={(event) => patchActiveMaster({ showFooter: event.target.checked })} /> Show footer
              </label>
              <select
                aria-label="Footer position"
                value={String((activeMaster as { footerPosition?: string } | undefined)?.footerPosition ?? 'left')}
                onChange={(event) => patchActiveMaster({ footerPosition: event.target.value })}
                className="ml-auto rounded-md border border-white/10 bg-slate-950/80 px-1.5 py-1 text-[0.625rem] text-slate-100"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </>
      ),
    },
    {
      title: 'Selection arrange',
      children: (
        <div className="grid grid-cols-3 gap-1">
          <button type="button" disabled={selectionSize < 2} onClick={() => onCommand?.({ type: 'group' })} className="rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5 disabled:opacity-30" aria-label="Group selection" title="Group selection (Ctrl+G)"><Group className="mr-1 inline h-3 w-3" />Group</button>
          <button type="button" disabled={selectionSize < 1} onClick={() => onCommand?.({ type: 'ungroup' })} className="rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5 disabled:opacity-30" aria-label="Ungroup selection" title="Ungroup selection (Ctrl+Shift+G)"><Ungroup className="mr-1 inline h-3 w-3" />Ungroup</button>
          <button type="button" disabled={selectionSize < 1} onClick={() => onCommand?.({ type: 'flip', axis: 'x' })} className="rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5 disabled:opacity-30" aria-label="Flip selection horizontally"><FlipHorizontal2 className="mr-1 inline h-3 w-3" />Flip H</button>
          <button type="button" disabled={selectionSize < 1} onClick={() => onCommand?.({ type: 'flip', axis: 'y' })} className="rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5 disabled:opacity-30" aria-label="Flip selection vertically"><FlipVertical2 className="mr-1 inline h-3 w-3" />Flip V</button>
          <button type="button" disabled={selectionSize < 1} onClick={() => onCommand?.({ type: 'layer', action: 'front' })} className="rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5 disabled:opacity-30" aria-label="Bring selection to front"><ArrowUpToLine className="mr-1 inline h-3 w-3" />Front</button>
          <button type="button" disabled={selectionSize < 1} onClick={() => onCommand?.({ type: 'layer', action: 'back' })} className="rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5 disabled:opacity-30" aria-label="Send selection to back"><ArrowDownToLine className="mr-1 inline h-3 w-3" />Back</button>
        </div>
      ),
    },
    {
      title: 'Transition',
      children: (
        <>
          <div className="grid grid-cols-2 gap-1">
            <select
              aria-label={copy.text.slideTransition}
              value={normalizedTransition.effect}
              onChange={(event) => onUpdateSlide({ ...slide, transition: normalizePresentTransition({ ...normalizedTransition, effect: event.target.value as PresentSlideTransition['effect'] }) })}
              className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-200"
              title={copy.text.transition}
            >
              {TRANSITION_EFFECTS.map((transition) => <option key={transition.key} value={transition.key}>{copy.transitions[transition.key] ?? transition.label}</option>)}
            </select>
            <select
              aria-label={copy.text.transitionDirection}
              value={normalizedTransition.direction || 'left'}
              disabled={!['push', 'wipe', 'split', 'reveal', 'cover', 'uncover'].includes(normalizedTransition.effect)}
              onChange={(event) => onUpdateSlide({ ...slide, transition: normalizePresentTransition({ ...normalizedTransition, direction: event.target.value as PresentSlideTransition['direction'] }) })}
              className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-200 disabled:opacity-35"
              title={copy.text.transitionDirection}
            >
              {normalizedTransition.effect === 'split' ? (
                <>
                  <option value="vertical">{copy.directions.vertical}</option>
                  <option value="horizontal">{copy.directions.horizontal}</option>
                </>
              ) : (
                <>
                  <option value="left">{copy.directions.left}</option>
                  <option value="right">{copy.directions.right}</option>
                  <option value="up">{copy.directions.up}</option>
                  <option value="down">{copy.directions.down}</option>
                </>
              )}
            </select>
          </div>
          <label className="flex items-center gap-1 text-[0.625rem] text-slate-400" title={copy.text.transitionDurationMs}>
            <span>{copy.text.transitionDuration}</span>
            <input
              aria-label={copy.text.transitionDurationMs}
              type="number" min={50} max={20000} step={50}
              value={normalizedTransition.durationMs}
              onChange={(event) => onUpdateSlide({ ...slide, transition: normalizePresentTransition({ ...normalizedTransition, durationMs: Number(event.target.value) }) })}
              className="w-16 rounded-lg border border-white/10 bg-slate-900 px-1.5 py-1 text-[0.6875rem] text-slate-200"
            /> ms
          </label>
          <select
            aria-label={copy.text.transitionSound}
            value={normalizedTransition.sound || 'none'}
            onChange={(event) => onUpdateSlide({ ...slide, transition: normalizePresentTransition({ ...normalizedTransition, sound: event.target.value as PresentSlideTransition['sound'] }) })}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-200"
            title={copy.text.optionalLocalSound}
          >
            {(['none', 'click', 'chime', 'whoosh'] as const).map((sound) => <option key={sound} value={sound}>{copy.sounds[sound]}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[0.625rem] text-slate-400 whitespace-nowrap" title={copy.text.advanceOnClick}>
            <input type="checkbox" checked={normalizedTransition.advanceOnClick !== false} onChange={(event) => onUpdateSlide({ ...slide, transition: { ...normalizedTransition, advanceOnClick: event.target.checked } })} /> {copy.text.click}
          </label>
          <label className="flex items-center gap-1 text-[0.625rem] text-slate-400 whitespace-nowrap" title={copy.text.autoAdvance}>
            {copy.text.autoAdvanceSeconds}
            <input
              aria-label={copy.text.autoAdvanceSeconds}
              type="number" min={0} max={3600} step={0.5}
              value={normalizedTransition.advanceAfterMs == null ? '' : normalizedTransition.advanceAfterMs / 1000}
              placeholder="—"
              onChange={(event) => onUpdateSlide({ ...slide, transition: normalizePresentTransition({ ...normalizedTransition, advanceAfterMs: event.target.value === '' ? null : Number(event.target.value) * 1000 }) })}
              className="w-12 rounded-lg border border-white/10 bg-slate-900 px-1.5 py-1 text-[0.6875rem] text-slate-200"
            />
          </label>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { closeMore(); onPreviewTransition(); }} className="flex-1 rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/5" aria-label={copy.text.previewTransition} title={copy.text.previewTransition}><Play className="mx-auto h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => { closeMore(); onApplyTransitionToAll(); }} className="flex-1 rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/5" aria-label={copy.text.applyTransitionAll} title={copy.text.applyTransitionAll}><CopyCheck className="mx-auto h-3.5 w-3.5" /></button>
          </div>
        </>
      ),
    },
    {
      title: 'Insert more',
      children: (
        <div className="grid grid-cols-2 gap-1">
          <button type="button" onClick={() => { closeMore(); onAddCode('rust'); }} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5" aria-label={copy.text.insertCode}><Code className="h-3 w-3 text-emerald-400" />{copy.text.insertCode}</button>
          <button type="button" onClick={() => { closeMore(); onAddChart(); }} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5" aria-label={copy.text.insertChart}><BarChart3 className="h-3 w-3 text-purple-300" />{copy.text.insertChart}</button>
          <button type="button" onClick={() => { closeMore(); onAddTable(); }} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5" aria-label={copy.text.insertTable}><Table2 className="h-3 w-3 text-cyan-300" />{copy.text.insertTable}</button>
          <button type="button" onClick={() => { closeMore(); onOpenMediaEmbed(); }} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5" aria-label={copy.text.insertMedia}><Film className="h-3 w-3 text-pink-400" />{copy.text.insertMedia}</button>
          {onOpenWorkspaceIntegration && (
            <button type="button" onClick={() => { closeMore(); onOpenWorkspaceIntegration(); }} className="flex items-center gap-1 rounded-lg border border-cyan-500/20 px-2 py-1 text-[0.6875rem] text-cyan-300 hover:bg-cyan-500/10" aria-label={copy.text.insertWorkspace}><Link2 className="h-3 w-3" />{copy.text.insertWorkspace}</button>
          )}
          {onOpenVideoExport && (
            <button type="button" onClick={() => { closeMore(); onOpenVideoExport(); }} className="flex items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1 text-[0.6875rem] text-rose-300 hover:bg-rose-500/10" aria-label={copy.text.exportVideo}><Video className="h-3 w-3" />{copy.text.exportVideo}</button>
          )}
          {onOpenSpeakerCoach && (
            <button type="button" onClick={() => { closeMore(); onOpenSpeakerCoach(); }} className="flex items-center gap-1 rounded-lg border border-cyan-500/30 px-2 py-1 text-[0.6875rem] text-cyan-300 hover:bg-cyan-500/10" aria-label={copy.text.speakerCoach}><Mic className="h-3 w-3" />{copy.text.speakerCoach}</button>
          )}
        </div>
      ),
    },
    {
      title: 'Animation',
      children: (
        <button
          type="button"
          onClick={() => { closeMore(); onToggleAnimations(); }}
          aria-label="Open animation panel"
          data-present-open-animations="true"
          className="flex w-full items-center gap-1 rounded-lg border border-purple-500/25 bg-purple-500/5 px-2 py-1.5 text-[0.6875rem] text-purple-200 hover:bg-purple-500/10"
        >
          <WandSparkles className="h-3 w-3" /> Open animations panel (presets, duration, trigger, preview)
        </button>
      ),
    },
    {
      title: 'Deck tools',
      children: (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { closeMore(); onOpenSections(); }} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5" aria-label={copy.text.sections}><FolderTree className="h-3 w-3 text-indigo-400" />{copy.text.sections}</button>
          <button type="button" onClick={() => { closeMore(); onOpenRehearsal(); }} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5" aria-label={copy.text.rehearsal}><Timer className="h-3 w-3 text-emerald-400" />{copy.text.rehearsal}</button>
          <button type="button" onClick={() => { closeMore(); onOpenComments(); }} className="relative flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300 hover:bg-white/5" aria-label={copy.openSlideComments(slide.comments?.length ?? 0)}><MessageCircle className="h-3 w-3 text-amber-400" />{copy.text.slideComments}</button>
        </div>
      ),
    },
  ];

  const panelToggles: Array<{ key: string; active: boolean; label: string; onClick: () => void; icon: React.ReactNode }> = [
    { key: 'inspector', active: showInspector, label: copy.text.objectInspector, onClick: onToggleInspector, icon: <Sliders className="w-3.5 h-3.5" /> },
    { key: 'layers', active: showLayers, label: copy.text.layers, onClick: onToggleLayers, icon: <Layers3 className="w-3.5 h-3.5" /> },
    { key: 'animations', active: showAnimations, label: copy.text.animations, onClick: onToggleAnimations, icon: <WandSparkles className="w-3.5 h-3.5" /> },
    { key: 'notes', active: showNotes, label: copy.text.speakerNotes, onClick: onToggleNotes, icon: <MessageSquare className="w-3.5 h-3.5 text-amber-400" /> },
  ];

  const moreMenu = moreOpen && morePosition
    ? createPortal(
      <div
        ref={moreMenuRef}
        role="dialog"
        aria-label="More Present commands"
        data-present-more-menu="true"
        data-present-more-menu-portal="true"
        style={{ position: 'fixed', top: morePosition.top, right: morePosition.right, zIndex: 2147483000 }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeMore();
            moreButtonRef.current?.focus();
          }
        }}
        className="max-h-[75vh] w-[28rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/95 p-3 text-xs shadow-2xl backdrop-blur-xl space-y-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">More Present commands</span>
          <button type="button" onClick={closeMore} aria-label="Close more commands" className="rounded p-1 text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
        {moreSections.map((section) => (
          <section key={section.title} className="space-y-1.5" aria-label={section.title}>
            <h3 className="text-[0.625rem] font-semibold text-slate-500">{section.title}</h3>
            {section.children}
          </section>
        ))}
      </div>,
      document.body,
    )
    : null;

  return (
    <div
      className="vgt-app-toolbar-band h-11 shrink-0 select-none gap-2 overflow-visible border-b border-white/[0.08] bg-slate-950/95 px-3 text-xs flex items-center justify-between"
      data-vgt-app-toolbar-band="present"
      data-present-toolbar-scroll="none"
    >
      {/* 1. Primary zone: basics never require a horizontal scroll. */}
      <div className="flex min-w-0 items-center gap-1.5" data-present-primary-actions="true">
        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-slate-900 p-0.5" aria-label={copy.text.historyControls}>
          <button type="button" onClick={onUndo} disabled={!canUndo} className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30" title={copy.text.undoTitle} aria-label={copy.text.undo}><Undo2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onRedo} disabled={!canRedo} className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30" title={copy.text.redoTitle} aria-label={copy.text.redo}><Redo2 className="h-3.5 w-3.5" /></button>
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-slate-900 p-0.5" data-present-insert-primary="true">
          <input
            ref={imagePickerRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onInsertImageFile(file);
              event.currentTarget.value = '';
            }}
          />
          <button type="button" onClick={() => imagePickerRef.current?.click()} className="flex items-center space-x-1 rounded-lg px-2 py-1 text-slate-300 hover:bg-white/5" title={copy.text.insertImage} aria-label={copy.text.insertImage}>
            <ImagePlus className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">{copy.text.image}</span>
          </button>
          <button
            type="button"
            onClick={() => (onToggleArmedTool ? onToggleArmedTool('text') : onAddText())}
            aria-pressed={armedTool === 'text'}
            data-present-armed-tool={armedTool === 'text' ? 'text' : undefined}
            className={`flex items-center space-x-1 rounded-lg px-2 py-1 ${armedTool === 'text' ? 'bg-blue-500/20 text-blue-200' : 'text-slate-300 hover:bg-white/5'}`}
            title={armedTool === 'text' ? 'Text tool armed: click the canvas to place a text box (Escape cancels)' : copy.text.insertTextBox}
            aria-label={armedTool === 'text' ? 'Text tool armed: click the canvas to place a text box' : copy.text.insertTextBox}
          >
            <Type className="w-3.5 h-3.5 text-blue-300" />
            <span className="hidden md:inline">{armedTool === 'text' ? 'Click canvas…' : copy.text.text}</span>
          </button>
          <PresentInsertDropdowns onAddShape={onAddShape} onAddWidget={onAddWidget} onAddDiagram={onAddDiagram} />
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-slate-900 p-0.5" data-present-layout-group="true" aria-label="Slide layout">
          {layoutButtons.map((button) => (
            <button
              key={button.layout}
              type="button"
              onClick={() => onUpdateSlide({ ...slide, layout: button.layout })}
              data-present-layout-button={button.layout}
              className={`rounded px-1.5 py-1 flex items-center space-x-1 transition-colors ${slide.layout === button.layout ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              title={button.title}
              aria-label={button.title}
              aria-pressed={slide.layout === button.layout}
            >
              {button.icon}
              <span className="hidden xl:inline text-[0.625rem]">{button.label}</span>
            </button>
          ))}
        </div>

        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => (moreOpen ? closeMore() : openMore())}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label="More Present commands"
          title="More Present commands (themes, transitions, arrange, extra inserts)"
          data-present-more-button="true"
          // App-Guide step "Present:second" (slide order / arrangement review): the compact
          // toolbar keeps every rarely used arrangement command inside this anchored popover.
          data-vgt-app-guide-anchor="Present:second"
          className={`flex items-center space-x-1 rounded-lg border px-2 py-1 ${moreOpen ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-[0.625rem]">More</span>
        </button>
      </div>

      {/* 2. Secondary zone: panel toggles stay reachable without scrolling. */}
      <div className="flex items-center gap-1" data-present-panel-toggles="true">
        {panelToggles.map((toggle) => (
          <button
            key={toggle.key}
            type="button"
            onClick={toggle.onClick}
            aria-pressed={toggle.active}
            className={`rounded-lg border p-1.5 ${toggle.active ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
            aria-label={toggle.label}
            title={toggle.label}
          >
            {toggle.icon}
            {toggle.key === 'animations' && <span className="hidden xl:inline ml-1 text-[0.625rem]">{toggle.label}</span>}
          </button>
        ))}
      </div>

      {moreMenu}
    </div>
  );
};
