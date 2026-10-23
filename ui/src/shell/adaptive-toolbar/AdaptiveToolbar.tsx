import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  List,
  BarChart3,
  Calendar,
  ChevronDown,
  DollarSign,
  Hash,
  Percent,
  Shapes,
  Palette,
  LayoutTemplate,
  Sliders,
  ToggleLeft,
  ToggleRight,
  MoreHorizontal,
} from 'lucide-react';
import { DocumentKind } from '../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { ADAPTIVE_TOOLBAR_COPY } from './adaptiveToolbarLocale';

/** The four always-visible Grid quick formats; `date` is the new fourth contract member. */
export type AdaptiveToolbarCellFormat = 'number' | 'currency' | 'percent' | 'date';

/** Minimal shape the shell needs from `GRID_NUMBER_FORMAT_PRESETS`; no Grid import here. */
export interface AdaptiveNumberFormatPreset {
  readonly id: string;
  readonly label: string;
  readonly code?: string;
}

interface AdaptiveToolbarProps {
  documentKind: DocumentKind;
  activeSelectionType: 'text' | 'cell' | 'shape' | 'chart';
  isClassicRibbon: boolean;
  onToggleRibbonMode: () => void;
  // Actions
  onFormatText?: (cmd: string, val?: string | number) => void;
  onFormatCell?: (format: AdaptiveToolbarCellFormat) => void;
  /** Full canonical preset catalogue for the "Format" menu (Grid only). */
  numberFormatPresets?: readonly AdaptiveNumberFormatPreset[];
  onApplyNumberFormat?: (id: string) => void;
  onInsertChart?: () => void;
  onInsertShape?: (shape: string) => void;
}

export const AdaptiveToolbar: React.FC<AdaptiveToolbarProps> = ({
  documentKind,
  activeSelectionType,
  isClassicRibbon,
  onToggleRibbonMode,
  onFormatText,
  onFormatCell,
  numberFormatPresets,
  onApplyNumberFormat,
  onInsertChart,
  onInsertShape,
}) => {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [formatMenuPosition, setFormatMenuPosition] = useState({ left: 8, top: 8 });
  const { locale } = useWorkspaceLocale();
  const copy = ADAPTIVE_TOOLBAR_COPY[locale];
  const formatMenuId = useId();
  const formatMenuButtonRef = useRef<HTMLButtonElement>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);
  const presetCatalogue = numberFormatPresets ?? [];
  const formatMenuAvailable = Boolean(onApplyNumberFormat) && presetCatalogue.length > 0;
  const quickCellFormats = [
    { id: 'number', label: copy.number, title: copy.numberTitle, Icon: Hash, tone: 'text-blue-300' },
    { id: 'currency', label: copy.currency, title: copy.currencyTitle, Icon: DollarSign, tone: 'text-emerald-300' },
    { id: 'percent', label: copy.percent, title: copy.percentTitle, Icon: Percent, tone: 'text-purple-300' },
    { id: 'date', label: copy.date, title: copy.dateTitle, Icon: Calendar, tone: 'text-amber-300' },
  ] as const satisfies ReadonlyArray<{
    readonly id: AdaptiveToolbarCellFormat;
    readonly label: string;
    readonly title: string;
    readonly Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
    readonly tone: string;
  }>;

  useLayoutEffect(() => {
    if (!formatMenuOpen) return undefined;
    const updatePosition = () => {
      const trigger = formatMenuButtonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = formatMenuRef.current?.offsetWidth || 264;
      const menuHeight = formatMenuRef.current?.offsetHeight
        || Math.min(420, presetCatalogue.length * 30 + 56);
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
      const margin = 8;
      const gap = 6;
      const left = Math.min(
        Math.max(rect.left, margin),
        Math.max(margin, viewportWidth - menuWidth - margin),
      );
      const spaceBelow = viewportHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const placeAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      const desiredTop = placeAbove ? rect.top - menuHeight - gap : rect.bottom + gap;
      const top = Math.min(
        Math.max(desiredTop, margin),
        Math.max(margin, viewportHeight - menuHeight - margin),
      );
      setFormatMenuPosition((previous) => (
        previous.left === left && previous.top === top ? previous : { left, top }
      ));
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [formatMenuOpen, presetCatalogue.length]);

  useEffect(() => {
    if (!formatMenuOpen) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (formatMenuRef.current?.contains(target) || formatMenuButtonRef.current?.contains(target)) return;
      setFormatMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setFormatMenuOpen(false);
      formatMenuButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    // Menu-button pattern: move focus into the menu so Tab/arrow users are not stranded.
    formatMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [formatMenuOpen]);

  const hasSecondaryTools = Boolean(onInsertChart || (onInsertShape && (documentKind === 'Present' || documentKind === 'Writer' || documentKind === 'Draw')));
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-white/10 bg-[linear-gradient(180deg,rgba(16,13,30,0.96),rgba(7,6,16,0.92))] px-4 py-2 text-xs backdrop-blur-xl select-none"
      data-adaptive-toolbar="true"
    >
      {/* Context-Driven Tools */}
      <div className="min-w-0 flex flex-1 items-center space-x-2 overflow-visible">
        {/* Ribbon Mode Indicator Badge */}
        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 mr-1 hidden sm:inline">
          {copy.selectionTools[activeSelectionType]}
        </span>

        {/* Text Formatting Group (Writer, or text selected in Present) */}
        {onFormatText && (activeSelectionType === 'text' || documentKind === 'Writer') && (
          <div className="flex items-center space-x-1 pl-1 border-r border-white/10 pr-2">
            <button
              onClick={() => onFormatText?.('bold')}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.bold} title={copy.bold}
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => onFormatText?.('italic')}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.italic} title={copy.italic}
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => onFormatText?.('underline')}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.underline} title={copy.underline}
            >
              <Underline className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-4 bg-white/10 mx-1" />

            <button
              onClick={() => onFormatText?.('heading', 1)}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.heading1} title={copy.heading1}
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onFormatText?.('heading', 2)}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.heading2} title={copy.heading2}
            >
              <Heading2 className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-4 bg-white/10 mx-1" />

            <button
              onClick={() => onFormatText?.('align', 'left')}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.alignLeft} title={copy.alignLeft}
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onFormatText?.('align', 'center')}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.alignCenter} title={copy.alignCenter}
            >
              <AlignCenter className="w-4 h-4" />
            </button>
            <button
              onClick={() => onFormatText?.('align', 'right')}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.alignRight} title={copy.alignRight}
            >
              <AlignRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onFormatText?.('list')}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.bulletedList} title={copy.bulletedList}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Grid Cell Tools: four one-click formats + the full canonical preset catalogue. */}
        {(onFormatCell || formatMenuAvailable) && (activeSelectionType === 'cell' || documentKind === 'Grid') && (
          <div
            className="relative flex items-center gap-0.5 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] px-1 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
            role="group"
            aria-label={copy.formatMenu}
          >
            {onFormatCell && quickCellFormats.map(({ id, label, title, Icon, tone }) => (
              <button
                key={id}
                type="button"
                data-adaptive-format-action={id}
                onClick={() => onFormatCell(id)}
                className="flex h-7 items-center gap-1 rounded-lg border border-transparent px-1.5 text-slate-300 transition-colors hover:border-white/10 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 motion-reduce:transition-none"
                aria-label={title}
                title={title}
              >
                <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden="true" />
                <span className="hidden text-[11px] font-medium xl:inline">{label}</span>
              </button>
            ))}

            {formatMenuAvailable && (
              <div className="relative">
                <button
                  ref={formatMenuButtonRef}
                  type="button"
                  data-adaptive-format-action="preset-menu"
                  onClick={() => setFormatMenuOpen((open) => !open)}
                  className="flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.045] px-1.5 text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 motion-reduce:transition-none"
                  aria-haspopup="menu"
                  aria-expanded={formatMenuOpen}
                  aria-controls={formatMenuId}
                  aria-label={copy.formatMenuTitle}
                  title={copy.formatMenuTitle}
                >
                  <Sliders className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />
                  <span className="hidden text-[11px] font-medium lg:inline">{copy.formatMenu}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform motion-reduce:transition-none ${formatMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>

                {formatMenuOpen && typeof document !== 'undefined' && createPortal(
                  <div
                    ref={formatMenuRef}
                    id={formatMenuId}
                    role="menu"
                    aria-label={copy.formatPresets}
                    data-adaptive-format-menu="true"
                    style={{
                      position: 'fixed',
                      left: `${formatMenuPosition.left}px`,
                      top: `${formatMenuPosition.top}px`,
                      zIndex: 2_147_483_000,
                    }}
                    onKeyDown={(event) => {
                      const items = Array.from(formatMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
                      if (items.length === 0) return;
                      const current = items.indexOf(document.activeElement as HTMLButtonElement);
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        const next = event.key === 'ArrowDown'
                          ? (current + 1) % items.length
                          : (current - 1 + items.length) % items.length;
                        items[next]?.focus();
                      } else if (event.key === 'Home' || event.key === 'End') {
                        event.preventDefault();
                        items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
                      }
                    }}
                    className="w-64 overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(155deg,rgba(23,27,44,0.98),rgba(8,10,20,0.97))] p-1.5 text-xs shadow-[0_28px_80px_-24px_rgba(0,0,0,0.95)] ring-1 ring-white/10 backdrop-blur-2xl"
                  >
                    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{copy.formatPresets}</p>
                    <div className="max-h-72 overflow-y-auto">
                      {presetCatalogue.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          role="menuitem"
                          data-adaptive-format-preset={preset.id}
                          onClick={() => {
                            onApplyNumberFormat?.(preset.id);
                            setFormatMenuOpen(false);
                            formatMenuButtonRef.current?.focus();
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 motion-reduce:transition-none"
                          aria-label={preset.code ? `${preset.label}: ${preset.code}` : preset.label}
                        >
                          <span className="truncate font-medium">{preset.label}</span>
                          {preset.code && <span className="shrink-0 font-mono text-[10px] text-slate-500">{preset.code}</span>}
                        </button>
                      ))}
                    </div>
                  </div>,
                  document.body,
                )}
              </div>
            )}
          </div>
        )}

        {/* Chart Insertion Group */}
        {onInsertChart && <div className="hidden lg:flex items-center space-x-1 pl-1">
          <button
            onClick={onInsertChart}
            className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 border border-purple-500/30 transition-all"
            aria-label={copy.insertDynamicChart}
            title={copy.insertDynamicChart}
          >
            <BarChart3 className="w-4 h-4 text-purple-300" />
            <span className="text-[11px] font-medium">{copy.insertChart}</span>
          </button>
        </div>}

        {/* Shape Insertion (Present & Writer) */}
        {onInsertShape && (documentKind === 'Present' || documentKind === 'Writer' || documentKind === 'Draw') && (
          <div className="hidden lg:flex items-center space-x-1 pl-1">
            <button
              onClick={() => onInsertShape?.('rectangle')}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.addRectangle} title={copy.addRectangle}
            >
              <Shapes className="w-4 h-4 text-amber-400" />
            </button>
            <button
              onClick={() => onInsertShape?.('circle')}
              className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label={copy.addCircle} title={copy.addCircle}
            >
              <Palette className="w-4 h-4 text-purple-400" />
            </button>
          </div>
        )}
      </div>

      {/* Narrow-window overflow: secondary tools move here instead of clipping. */}
      {hasSecondaryTools && (
        <div className="relative lg:hidden">
          <button
            type="button"
            onClick={() => setOverflowOpen((open) => !open)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-300 hover:bg-white/10"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            aria-label={copy.moreActions}
            title={copy.moreActionsTitle}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {overflowOpen && (
            <div role="menu" aria-label={copy.moreActions} className="absolute right-0 top-9 z-30 min-w-44 rounded-xl border border-white/10 bg-[#0a0714] p-1.5 shadow-2xl">
              {onInsertChart && (
                <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); onInsertChart(); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10">
                  <BarChart3 className="h-4 w-4 text-purple-300" /> {copy.insertChart}
                </button>
              )}
              {onInsertShape && (documentKind === 'Present' || documentKind === 'Writer' || documentKind === 'Draw') && (
                <>
                  <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); onInsertShape('rectangle'); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10">
                    <Shapes className="h-4 w-4 text-amber-400" /> {copy.addRectangle}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); onInsertShape('circle'); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10">
                    <Palette className="h-4 w-4 text-purple-400" /> {copy.addCircle}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Right: Toggle Adaptive vs Classic Ribbon */}
      <div className="flex shrink-0 items-center space-x-2">
        <button
          onClick={onToggleRibbonMode}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 transition-colors text-[11px]"
          aria-label={copy.switchRibbonTitle}
          aria-pressed={isClassicRibbon}
          title={copy.switchRibbonTitle}
        >
          <LayoutTemplate className="w-3.5 h-3.5" />
          <span className="hidden md:inline">
            {isClassicRibbon ? copy.classicRibbon : copy.adaptiveToolbar}
          </span>
          {isClassicRibbon ? (
            <ToggleRight className="w-4 h-4 text-blue-400" />
          ) : (
            <ToggleLeft className="w-4 h-4 text-slate-500" />
          )}
        </button>
      </div>
    </div>
  );
};
