// Astraea Grid formula bar with a responsive, accessible action disclosure.

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../../design-system/styles/AppToolbarBand.css';
import './GridFormulaBar.css';
import {
  Activity,
  AlignCenter,
  AlignLeft,
  AlignRight,
  BarChart3,
  Bold,
  Calendar,
  Calculator,
  ChevronDown,
  DollarSign,
  Database,
  Download,
  Filter,
  Hash,
  Italic,
  MessageSquare,
  MoreHorizontal,
  Percent,
  Search,
  SearchCode,
  Settings2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Strikethrough,
  Table,
  Underline,
  WrapText,
} from 'lucide-react';
import type { GridCell, GridNamedRange } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_TOOLBAR_COPY, type GridToolbarCopy } from '../locale/gridToolbarLocale';
import { GRID_FORMULA_ASSISTANT_COPY } from '../locale/gridFormulaAssistantLocale';
import { GridFormulaAssistant } from '../formulas/GridFormulaAssistant';
import { toggleGridFormulaReferenceAbsolute } from '../formulas/gridFormulaAssist';
import type { GridFormulaSpillPlan } from '../formulas/gridFormulaSpill';
import type { GridFormulaCycleReport } from '../formulas/gridFormulaCycle';
import type { GridWorkbookExportFormat } from '../interchange/gridWorkbookExport';
import {
  GRID_TOOLBAR_NUMBER_FORMAT_IDS,
  findGridNumberFormatPreset,
  type GridNumberFormatId,
} from '../formatting/gridNumberFormat';

/**
 * Presentation of the standard number-format buttons. The list of *operations* comes from
 * `gridNumberFormat.ts`; only the icon and the copy keys live here.
 */
const NUMBER_FORMAT_BUTTONS: Record<
  GridNumberFormatId,
  { readonly icon: React.ComponentType<{ 'aria-hidden'?: boolean | 'true' | 'false' }>; readonly action: string; readonly label: keyof GridToolbarCopy; readonly title: keyof GridToolbarCopy } | undefined
> = {
  currency: { icon: DollarSign, action: 'currency', label: 'currencyFormat', title: 'currencyTitle' },
  percent: { icon: Percent, action: 'percent', label: 'percentageFormat', title: 'percentageTitle' },
  number: { icon: Hash, action: 'number', label: 'numberFormat', title: 'numberTitle' },
  date: { icon: Calendar, action: 'date', label: 'dateFormat', title: 'dateTitle' },
  general: undefined,
  accounting: undefined,
  time: undefined,
  fraction: undefined,
  scientific: undefined,
  text: undefined,
};

interface GridFormulaBarProps {
  selectedRange: string;
  selectedCell: string;
  formulaInput: string;
  namedRanges: GridNamedRange[];
  activeCell?: GridCell;
  professionalPanelOpen: boolean;
  onChangeFormula: (val: string) => void;
  onCommitFormula: () => void;
  onApplyFormat: (patch: Partial<GridCell>) => void;
  /**
   * Applies a complete standard number-format operation (semantic type *and* format code).
   * When provided, the standard-format buttons use it instead of the partial
   * `onApplyFormat` path, so that toolbar and panel store the identical cell.
   */
  onApplyNumberFormat?: (id: GridNumberFormatId) => void;
  onSelectNamedRange: (named: GridNamedRange) => void;
  /** Navigates to an A1 range, a named range, a whole column (D) or a whole row (5). */
  onGoToSelection: (input: string) => void;
  onOpenChartModal: () => void;
  onOpenWhatIfModal: () => void;
  onOpenFindReplaceModal: () => void;
  onOpenCommentsModal: () => void;
  onOpenSlicerModal: () => void;
  onOpenAuditModal: () => void;
  onOpenDataTableModal: () => void;
  onOpenPowerQuery?: () => void;
  onOpenSolver?: () => void;
  onOpenMonteCarlo?: () => void;
  onOpenRoundtrip?: () => void;
  onToggleProfessionalPanel: () => void;
  onExportCsv: () => void;
  /** Echter XLSX/ODS-Export. Fehlt er, wird kein Bedienelement angeboten (keine tote Schaltfläche). */
  onExportWorkbook?: (format: GridWorkbookExportFormat) => Promise<boolean>;
  /**
   * Full cell map of the active sheet. Only used by the formula assistant (diagnosis, spill and
   * cycle planning); when it is absent the assistant is not offered at all.
   */
  cells?: Record<string, GridCell>;
  /** IANA time zone used by the date functions; empty means the host zone. */
  timeZone?: string;
  /** Replaces the formula-bar text and caret after a completion or `$` toggle. */
  onReplaceFormula?: (formula: string, caret: number) => void;
  /** Leaves the shared edit state (Escape in the formula bar must also close an F2 edit). */
  onCancelEdit?: () => void;
  /** Bounded on-demand evaluation used by the assistant's output check. */
  onCheckFormulaOutput?: (formula: string) => Promise<{ spill: GridFormulaSpillPlan | null; cycles: GridFormulaCycleReport | null } | null>;
}

type MenuPosition = { top: number; right: number };

export const GridFormulaBar: React.FC<GridFormulaBarProps> = ({
  selectedRange,
  selectedCell,
  formulaInput,
  namedRanges,
  activeCell,
  professionalPanelOpen,
  onChangeFormula,
  onCommitFormula,
  onApplyFormat,
  onApplyNumberFormat,
  onSelectNamedRange,
  onGoToSelection,
  onOpenChartModal,
  onOpenWhatIfModal,
  onOpenFindReplaceModal,
  onOpenCommentsModal,
  onOpenSlicerModal,
  onOpenAuditModal,
  onOpenDataTableModal,
  onOpenPowerQuery,
  onOpenSolver,
  onOpenMonteCarlo,
  onOpenRoundtrip,
  onToggleProfessionalPanel,
  onExportCsv,
  onExportWorkbook,
  cells,
  timeZone = '',
  onReplaceFormula,
  onCancelEdit,
  onCheckFormulaOutput,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_TOOLBAR_COPY[locale];
  const assistantCopy = GRID_FORMULA_ASSISTANT_COPY[locale];
  const [showNamedRanges, setShowNamedRanges] = useState(false);
  const [nameBoxDraft, setNameBoxDraft] = useState<string | null>(null);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ top: 0, right: 8 });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [formulaCaret, setFormulaCaret] = useState(0);
  const moreToolsId = useId();
  const formulaInputId = useId();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const moreToolsButtonRef = useRef<HTMLButtonElement>(null);
  const moreToolsPanelRef = useRef<HTMLDivElement>(null);

  // The assistant is only offered when the caller can supply the cell map it diagnoses against.
  const assistantAvailable = Boolean(cells) && cells !== undefined;

  useEffect(() => {
    const updateLayout = () => setCompactLayout((toolbarRef.current?.clientWidth ?? window.innerWidth) <= 960);
    updateLayout();
    /**
     * GR-001 (M1 native crash candidate) — the observer is an **enhancement**, not a precondition.
     *
     * This effect runs on *every* Grid mount. A host whose `ResizeObserver` exists but throws on
     * construction (or on `observe`) used to take the whole sheet down before the grid rendered —
     * exactly the failure shape of a "module safely stopped" screen. The compact layout is still
     * recomputed from the window `resize` event, so a broken observer only loses live resizing.
     */
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      try {
        observer = new ResizeObserver(updateLayout);
        if (toolbarRef.current) observer.observe(toolbarRef.current);
      } catch {
        try { observer?.disconnect(); } catch { /* the observer is already unusable */ }
        observer = null;
      }
    }
    window.addEventListener('resize', updateLayout);
    return () => {
      try { observer?.disconnect(); } catch { /* ignore a hostile observer on teardown too */ }
      window.removeEventListener('resize', updateLayout);
    };
  }, []);

  useEffect(() => {
    if (!moreToolsOpen) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!moreToolsPanelRef.current?.contains(event.target) && !moreToolsButtonRef.current?.contains(event.target)) {
        setMoreToolsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setMoreToolsOpen(false);
      moreToolsButtonRef.current?.focus();
    };
    const closeOnViewportChange = () => setMoreToolsOpen(false);
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape, true);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape, true);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [moreToolsOpen]);

  const toggleMoreTools = () => {
    if (!moreToolsOpen && moreToolsButtonRef.current) {
      const rect = moreToolsButtonRef.current.getBoundingClientRect();
      setMenuPosition({ top: Math.round(rect.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - rect.right)) });
    }
    setMoreToolsOpen((open) => !open);
  };

  const runMenuAction = (action: () => void) => () => {
    setMoreToolsOpen(false);
    action();
  };

  // Ein Arbeitsmappen-Export dauert messbar (Paket bauen, Struktur prüfen, herunterladen). Währenddessen sind
  // beide Knöpfe gesperrt und melden das auch — ein zweiter Klick darf kein zweites Paket bauen.
  const [exportingWorkbook, setExportingWorkbook] = useState(false);
  const runWorkbookExport = (format: GridWorkbookExportFormat) => {
    if (!onExportWorkbook || exportingWorkbook) return;
    setExportingWorkbook(true);
    void Promise.resolve(onExportWorkbook(format)).finally(() => setExportingWorkbook(false));
  };

  const renderQuickFormatting = (responsive = false) => (
    <div
      className={responsive ? 'vgt-grid-format-responsive' : 'vgt-grid-format-inline'}
      role="group"
      aria-label={copy.cellFormatting}
      data-grid-format-group={responsive ? 'responsive' : 'primary'}
    >
      <button type="button" data-grid-format-action="bold" onClick={() => onApplyFormat({ bold: !activeCell?.bold })} aria-pressed={Boolean(activeCell?.bold)} className="vgt-grid-format-button" aria-label={copy.bold} title={copy.boldTitle}><Bold aria-hidden="true" /></button>
      <button type="button" data-grid-format-action="italic" onClick={() => onApplyFormat({ italic: !activeCell?.italic })} aria-pressed={Boolean(activeCell?.italic)} className="vgt-grid-format-button" aria-label={copy.italic} title={copy.italicTitle}><Italic aria-hidden="true" /></button>
      <button type="button" data-grid-format-action="underline" onClick={() => onApplyFormat({ underline: !activeCell?.underline })} aria-pressed={Boolean(activeCell?.underline)} className="vgt-grid-format-button" aria-label={copy.underline} title={copy.underline}><Underline aria-hidden="true" /></button>
      <button type="button" data-grid-format-action="strikethrough" onClick={() => onApplyFormat({ strikethrough: !activeCell?.strikethrough })} aria-pressed={Boolean(activeCell?.strikethrough)} className="vgt-grid-format-button" aria-label={copy.strikethrough} title={copy.strikethrough}><Strikethrough aria-hidden="true" /></button>
      <button type="button" data-grid-format-action="align-left" onClick={() => onApplyFormat({ alignment: 'left' })} aria-pressed={activeCell?.alignment === 'left'} className="vgt-grid-format-button" aria-label={copy.alignLeft} title={copy.alignLeft}><AlignLeft aria-hidden="true" /></button>
      <button type="button" data-grid-format-action="align-center" onClick={() => onApplyFormat({ alignment: 'center' })} aria-pressed={activeCell?.alignment === 'center'} className="vgt-grid-format-button" aria-label={copy.alignCenter} title={copy.alignCenter}><AlignCenter aria-hidden="true" /></button>
      <button type="button" data-grid-format-action="align-right" onClick={() => onApplyFormat({ alignment: 'right' })} aria-pressed={activeCell?.alignment === 'right'} className="vgt-grid-format-button" aria-label={copy.alignRight} title={copy.alignRight}><AlignRight aria-hidden="true" /></button>
      <button type="button" data-grid-format-action="wrap" onClick={() => onApplyFormat({ wrap: !activeCell?.wrap })} aria-pressed={Boolean(activeCell?.wrap)} className="vgt-grid-format-button" aria-label={copy.wrapText} title={copy.wrapText}><WrapText aria-hidden="true" /></button>
      {GRID_TOOLBAR_NUMBER_FORMAT_IDS.map((id) => {
        const preset = findGridNumberFormatPreset(id);
        if (!preset) return null;
        const meta = NUMBER_FORMAT_BUTTONS[id];
        if (!meta) return null;
        const Icon = meta.icon;
        const apply = () => {
          if (onApplyNumberFormat) { onApplyNumberFormat(id); return; }
          onApplyFormat({ format: preset.format });
        };
        return <button
          key={id}
          type="button"
          data-grid-format-action={meta.action}
          onClick={apply}
          aria-pressed={preset.format !== undefined && activeCell?.format === preset.format}
          className="vgt-grid-format-button"
          aria-label={copy[meta.label] as string}
          title={`${copy[meta.title] as string} · ${preset.code ?? ''}`.trim()}
        ><Icon aria-hidden="true" /></button>;
      })}
    </div>
  );

  const renderResponsiveShortcuts = () => (
    <div className="vgt-grid-toolbar-responsive-shortcuts" role="group" aria-label={copy.frequentActions}>
      <button type="button" onClick={runMenuAction(onOpenChartModal)} className="vgt-grid-toolbar-menu-action" aria-label={copy.chart} title={copy.chartTitle}><BarChart3 aria-hidden="true" />{copy.chart}</button>
      <button type="button" onClick={runMenuAction(onOpenFindReplaceModal)} className="vgt-grid-toolbar-menu-action" aria-label={copy.findReplace}><Search aria-hidden="true" />{copy.find}</button>
      <button type="button" onClick={runMenuAction(onToggleProfessionalPanel)} className="vgt-grid-toolbar-menu-action" aria-pressed={professionalPanelOpen} aria-label={copy.layout}><Settings2 aria-hidden="true" />{copy.layout}</button>
    </div>
  );

  return (
    <div ref={toolbarRef} className="vgt-grid-formula-toolbar vgt-app-toolbar-band h-10 bg-slate-900 border-b border-white/[0.08] px-3 flex items-center gap-1.5 text-xs shrink-0 select-none" data-vgt-app-toolbar-band="grid" data-grid-formula-toolbar="true" data-compact-layout={compactLayout ? 'true' : 'false'}>
      <div className="relative shrink-0 flex items-stretch">
        <input
          type="text"
          data-grid-name-box="true"
          value={nameBoxDraft ?? selectedRange}
          onChange={(event) => setNameBoxDraft(event.target.value)}
          onFocus={() => setNameBoxDraft(selectedRange)}
          onBlur={() => setNameBoxDraft(null)}
          onKeyDown={(event) => {
            // IME composition belongs to the input method; never commit/jump mid-composition.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === 'Enter') {
              // GR-002/GR-010 (M1): der Sprung gehört dem Namensfeld, nicht dem Grid-Root.
              event.preventDefault();
              event.stopPropagation();
              onGoToSelection(nameBoxDraft ?? selectedRange);
              setNameBoxDraft(null);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setNameBoxDraft(null);
            }
          }}
          aria-label={copy.nameBoxAria(selectedRange)}
          title={copy.nameBoxTitle}
          className="w-[74px] bg-black/40 rounded-l border border-white/10 font-mono text-blue-400 font-bold text-[0.6875rem] px-1.5 py-1 text-center outline-none focus:border-blue-500/60 transition-colors select-text"
        />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setShowNamedRanges((prev) => !prev)}
          className="px-1 py-1 bg-black/40 rounded-r border border-l-0 border-white/10 text-slate-400 hover:text-white hover:bg-black/60 transition-colors"
          aria-label={copy.nameBoxTitle}
          aria-expanded={showNamedRanges}
          title={copy.nameBoxTitle}
        >
          <ChevronDown aria-hidden="true" className="w-3 h-3" />
        </button>
        {showNamedRanges && (
          <div className="absolute top-8 left-0 z-50 w-48 bg-slate-900 border border-white/15 rounded shadow-xl py-1 text-xs">
            <div className="px-2 py-1 text-[0.625rem] uppercase font-bold text-slate-400 tracking-wider border-b border-white/10">{copy.namedRanges}</div>
            {namedRanges.length === 0 ? (
              <div className="px-3 py-2 text-slate-500 italic text-[0.6875rem]">{copy.noNamedRanges}</div>
            ) : namedRanges.map((named) => (
              <button key={named.id} type="button" onClick={() => { onSelectNamedRange(named); setShowNamedRanges(false); }} className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center justify-between text-slate-200">
                <span className="font-semibold text-blue-300">{named.name}</span>
                <span className="font-mono text-slate-500 text-[0.625rem]">{named.range}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="vgt-grid-formula-icon flex shrink-0 items-center text-slate-400 font-bold px-0.5" title={copy.formulaTitle} aria-hidden="true"><Calculator className="w-3.5 h-3.5" /></div>
      <span
        data-grid-formula-target="true"
        className="shrink-0 rounded-md border border-white/10 bg-white/[0.045] px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold text-blue-200"
        title={`${copy.formulaInput}: ${selectedCell}`}
        aria-hidden="true"
      >
        {selectedCell}
      </span>
      <input
        id={formulaInputId}
        ref={formulaInputRef}
        aria-label={`${copy.formulaInput}: ${selectedCell}`}
        title={`${copy.formulaInput}: ${selectedCell}`}
        type="text"
        value={formulaInput}
        onChange={(event) => { onChangeFormula(event.target.value); setFormulaCaret(event.target.selectionStart ?? event.target.value.length); }}
        onSelect={(event) => setFormulaCaret(event.currentTarget.selectionStart ?? formulaInput.length)}
        onKeyDown={(event) => {
          // IME composition belongs to the input method; never commit a half-composed formula.
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Enter') {
            /**
             * GR-010 (M1) — Enter commits **and** the selection continues one row down, like Excel.
             * The measurement (`gridFormulaBarEditing`) showed the cell commit was always correct;
             * the move is the expected spreadsheet behaviour, so the resolver keeps it.
             */
            onCommitFormula();
            return;
          }
          if (event.key === 'Escape') {
            /**
             * GR-010 (M1) — Escape discards a draft typed directly into the formula bar.
             *
             * Measured: a direct edit (without F2) kept the discarded text in the field and never
             * called preventDefault, because only the root handled Escape and only in edit mode.
             * The field now restores the active cell's value and returns the key to nobody else.
             */
            event.preventDefault();
            event.stopPropagation();
            const restored = activeCell?.formula ?? String(activeCell?.value ?? '');
            if (onReplaceFormula) onReplaceFormula(restored, restored.length);
            else onChangeFormula(restored);
            onCancelEdit?.();
            event.currentTarget.blur();
            return;
          }
          // F4 toggles the absolute/relative state of the reference under the caret, like Excel.
          if (event.key === 'F4' && onReplaceFormula) {
            event.preventDefault();
            const element = event.currentTarget;
            const caret = element.selectionStart ?? formulaInput.length;
            const toggled = toggleGridFormulaReferenceAbsolute(formulaInput, caret);
            if (toggled) onReplaceFormula(toggled.formula, toggled.caret);
            return;
          }
          if (event.key === 'F2' || (event.key === 'F1' && assistantAvailable)) {
            event.preventDefault();
            setAssistantOpen(true);
          }
        }}
        placeholder={copy.formulaPlaceholder}
        className="vgt-grid-formula-input min-w-[140px] flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-slate-100 font-mono outline-none focus:border-blue-500/60 transition-colors text-xs select-text"
      />
      {assistantAvailable && (
        <button
          type="button"
          data-grid-primary-action="formula-assistant"
          onClick={() => setAssistantOpen((open) => !open)}
          aria-expanded={assistantOpen}
          aria-haspopup="dialog"
          aria-label={assistantCopy.openTitle}
          title={assistantCopy.openTitle}
          className="vgt-grid-primary-action shrink-0 rounded border border-white/10 bg-slate-800 p-1.5 font-serif text-[0.6875rem] font-bold italic text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          fx
        </button>
      )}
      <button type="button" onClick={onCommitFormula} className="vgt-grid-apply-button px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[0.6875rem] transition-colors shrink-0">{copy.apply}</button>
      <div className="vgt-grid-toolbar-primary-divider h-4 w-px bg-white/10 mx-0.5" />
      {renderQuickFormatting()}
      <div className="vgt-grid-toolbar-primary-divider h-4 w-px bg-white/10 mx-0.5" />

      <button type="button" onClick={onOpenChartModal} data-grid-primary-action="chart" className="vgt-grid-primary-action flex items-center space-x-1 px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-medium text-[0.6875rem] transition-colors shrink-0" title={copy.chartTitle}><BarChart3 className="w-3 h-3 text-emerald-400" /><span>{copy.chart}</span></button>
      <button type="button" data-grid-primary-action="find-replace" onClick={onOpenFindReplaceModal} className="vgt-grid-primary-action p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition-colors shrink-0" aria-label={copy.findReplaceTitle} title={copy.findReplaceTitle}><Search className="w-3 h-3" /></button>
      <button type="button" data-grid-primary-action="layout" onClick={onToggleProfessionalPanel} className={`vgt-grid-primary-action flex items-center space-x-1 px-2 py-1 rounded border font-medium text-[0.6875rem] transition-colors shrink-0 ${professionalPanelOpen ? 'bg-blue-600/25 text-blue-200 border-blue-500/40' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10'}`} aria-pressed={professionalPanelOpen} title={copy.layoutTitle}><Settings2 className="w-3 h-3" /><span>{copy.layout}</span></button>

      <button
        ref={moreToolsButtonRef}
        type="button"
        onClick={toggleMoreTools}
        aria-expanded={moreToolsOpen}
        aria-controls={moreToolsOpen ? moreToolsId : undefined}
        aria-haspopup="dialog"
        aria-label={copy.moreActions}
        title={copy.moreActions}
        className="vgt-grid-toolbar-more-trigger inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-white/10 bg-slate-800 px-2.5 text-[0.6875rem] font-medium text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
        <span className="vgt-grid-toolbar-more-label">{copy.moreActions}</span>
        <ChevronDown aria-hidden="true" className={`vgt-grid-toolbar-more-caret h-3 w-3 transition-transform ${moreToolsOpen ? 'rotate-180' : ''}`} />
      </button>

      {moreToolsOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={moreToolsPanelRef}
          id={moreToolsId}
          role="dialog"
          aria-labelledby={`${moreToolsId}-title`}
          className="vgt-grid-toolbar-more-panel"
          data-compact-layout={compactLayout ? 'true' : 'false'}
          style={{ top: `${menuPosition.top}px`, right: `${menuPosition.right}px` }}
        >
          <div className="vgt-grid-toolbar-more-heading">
            <p id={`${moreToolsId}-title`} className="text-xs font-semibold">{copy.gridTools}</p>
            <p className="mt-0.5 text-[0.625rem] leading-4">{copy.gridToolsSummary}</p>
          </div>

          <div className="vgt-grid-toolbar-responsive-format-group" role="group" aria-label={copy.cellFormatting}>
            <p className="vgt-grid-toolbar-menu-group-title">{copy.cellFormatting}</p>
            {renderQuickFormatting(true)}
          </div>
          {renderResponsiveShortcuts()}

          <div className="vgt-grid-toolbar-menu-group" role="group" aria-label={copy.analysisTools}>
            <p className="vgt-grid-toolbar-menu-group-title">{copy.analysis}</p>
            <div className="vgt-grid-toolbar-menu-actions">
              <button type="button" onClick={runMenuAction(onOpenWhatIfModal)} className="vgt-grid-toolbar-menu-action" title={copy.whatIfTitle}><Sparkles aria-hidden="true" />{copy.whatIf}</button>
              <button type="button" onClick={runMenuAction(onOpenDataTableModal)} className="vgt-grid-toolbar-menu-action" title={copy.dataTableTitle}><Table aria-hidden="true" />{copy.dataTable}</button>
              <button type="button" onClick={runMenuAction(onOpenSlicerModal)} className="vgt-grid-toolbar-menu-action" title={copy.slicerTitle}><Filter aria-hidden="true" />{copy.slicer}</button>
              <button type="button" onClick={runMenuAction(onOpenAuditModal)} className="vgt-grid-toolbar-menu-action" title={copy.auditTitle}><SearchCode aria-hidden="true" />{copy.audit}</button>
              {onOpenPowerQuery && <button type="button" onClick={runMenuAction(onOpenPowerQuery)} className="vgt-grid-toolbar-menu-action" title={copy.powerQueryTitle}><Database aria-hidden="true" />{copy.powerQuery}</button>}
              {onOpenSolver && <button type="button" onClick={runMenuAction(onOpenSolver)} className="vgt-grid-toolbar-menu-action" title={copy.solverTitle}><Sliders aria-hidden="true" />{copy.solver}</button>}
              {onOpenMonteCarlo && <button type="button" onClick={runMenuAction(onOpenMonteCarlo)} className="vgt-grid-toolbar-menu-action" title={copy.monteCarloTitle}><Activity aria-hidden="true" />{copy.monteCarlo}</button>}
              {onOpenRoundtrip && <button type="button" onClick={runMenuAction(onOpenRoundtrip)} className="vgt-grid-toolbar-menu-action" title={copy.roundtripTitle}><ShieldCheck aria-hidden="true" />{copy.roundtrip}</button>}
            </div>
          </div>

          <div className="vgt-grid-toolbar-menu-group" role="group" aria-label={copy.workbookAndExport}>
            <p className="vgt-grid-toolbar-menu-group-title">{copy.workbookAndExport}</p>
            <div className="vgt-grid-toolbar-menu-actions">
              <button type="button" onClick={runMenuAction(onOpenCommentsModal)} className="vgt-grid-toolbar-menu-action" aria-label={copy.commentsTitle} title={copy.commentsTitle}><MessageSquare aria-hidden="true" />{copy.comments}</button>
              <button type="button" onClick={runMenuAction(onOpenFindReplaceModal)} className="vgt-grid-toolbar-menu-action vgt-grid-toolbar-menu-common-action" aria-label={copy.findReplaceTitle} title={copy.findReplaceTitle}><Search aria-hidden="true" />{copy.findReplace}</button>
              <button type="button" onClick={runMenuAction(onToggleProfessionalPanel)} className={`vgt-grid-toolbar-menu-action vgt-grid-toolbar-menu-common-action ${professionalPanelOpen ? 'is-active' : ''}`} aria-pressed={professionalPanelOpen} title={copy.layoutTitle}><Settings2 aria-hidden="true" />{copy.layout}</button>
              <button type="button" onClick={runMenuAction(onExportCsv)} className="vgt-grid-toolbar-menu-action" title={copy.downloadCsv}><Download aria-hidden="true" />{copy.csv}</button>
              {onExportWorkbook && (<button type="button" onClick={runMenuAction(() => runWorkbookExport('xlsx'))} disabled={exportingWorkbook} aria-busy={exportingWorkbook || undefined} className="vgt-grid-toolbar-menu-action" title={copy.downloadXlsx} aria-label={copy.downloadXlsx}><Download aria-hidden="true" size={14} /> {copy.downloadXlsx}</button>)}
              {onExportWorkbook && (<button type="button" onClick={runMenuAction(() => runWorkbookExport('ods'))} disabled={exportingWorkbook} aria-busy={exportingWorkbook || undefined} className="vgt-grid-toolbar-menu-action" title={copy.downloadOds} aria-label={copy.downloadOds}><Download aria-hidden="true" size={14} /> {copy.downloadOds}</button>)}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {assistantAvailable && (
        <GridFormulaAssistant
          isOpen={assistantOpen}
          onClose={() => { setAssistantOpen(false); formulaInputRef.current?.focus(); }}
          formula={formulaInput}
          caret={formulaCaret}
          coord={selectedCell}
          cells={cells ?? {}}
          namedRanges={namedRanges}
          timeZone={timeZone}
          onCheckOutput={onCheckFormulaOutput}
          onReplaceFormula={(next, caret) => {
            onChangeFormula(next);
            setFormulaCaret(caret);
            const element = formulaInputRef.current;
            if (element) {
              element.focus();
              element.setSelectionRange(caret, caret);
            }
          }}
          onCommitFormula={(next) => { onChangeFormula(next); onCommitFormula(); }}
        />
      )}
    </div>
  );
};
