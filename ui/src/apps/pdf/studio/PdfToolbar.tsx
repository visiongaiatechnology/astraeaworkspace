import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Award,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Cpu,
  FileDiff,
  FileDown,
  FileInput,
  FileText,
  Gauge,
  Highlighter,
  KeyRound,
  Layers,
  Maximize,
  MessageSquare,
  MoreHorizontal,
  Network,
  PenTool,
  Redo2,
  RefreshCw,
  Scan,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ActiveTool, HIGHLIGHT_COLORS } from './types';
import { PDF_STUDIO_ZOOM_STEPS } from './interactions/pdfStudioKeyboard';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfToolbarCopy, type PdfSecondaryActionId } from './pdfToolbarLocale';
import { pdfWorkflowText } from '../locale/pdfWorkflowDialogsLocale';

interface PdfToolbarProps {
  currentPage: number;
  totalPages: number;
  onScrollToPage: (page: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  onApplyHighlight: () => void;
  selectedHighlightColor: string;
  setSelectedHighlightColor: (hex: string) => void;
  onApplyUnderline: () => void;
  onApplyStrike: () => void;
  onInitiateComment: () => void;
  onRedactSelection: () => void;
  onOpenTrueRedaction?: () => void;
  onVerifiedRedactionExport?: () => void;
  onOpenSignatureModal?: () => void;
  onOpenSanitizeModal?: () => void;
  onOpenFormFiller?: () => void;
  onOpenAssembler?: () => void;
  onOpenOcrModal?: () => void;
  onOpenDigitalSignatureModal?: () => void;
  onOpenPasswordProtection?: () => void;
  onOpenRoundtripModal?: () => void;
  onOpenWorkspaceIntegration?: () => void;
  onOpenCompare?: () => void;
  onOpenConversion?: () => void;
  onOpenOptimization?: () => void;
  onOpenContentEditor?: () => void;
  totalRedactionsCount: number;
  zoomLevel: number;
  onZoomChange: (level: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenAuditModal: () => void;
  isAnnotationsDrawerOpen: boolean;
  onToggleAnnotationsDrawer: () => void;
  onExportPdf?: () => void;
  /** AST-0761: the directly reachable entry that opens an arbitrary foreign PDF inside the studio. */
  onOpenNativePdf?: () => void;
  isNativeOpenPanelOpen?: boolean;
  /** AST-0776: copying the selection is an essential function, so it has a visible control, not only Ctrl+C. */
  onCopySelection?: () => void;
  hasTextSelection?: boolean;
}

type SecondaryActionGroup = 'edit' | 'protect' | 'review';

interface SecondaryAction {
  id: PdfSecondaryActionId;
  group: SecondaryActionGroup;
  label: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  onAction: () => void;
}

const coreToolClass = 'flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[0.6875rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-purple-300';

export const PdfToolbar: React.FC<PdfToolbarProps> = ({
  currentPage,
  totalPages,
  onScrollToPage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  activeTool,
  setActiveTool,
  onApplyHighlight,
  selectedHighlightColor,
  setSelectedHighlightColor,
  onApplyUnderline,
  onApplyStrike,
  onInitiateComment,
  onRedactSelection,
  onOpenTrueRedaction,
  onVerifiedRedactionExport,
  onOpenSignatureModal,
  onOpenSanitizeModal,
  onOpenFormFiller,
  onOpenAssembler,
  onOpenOcrModal,
  onOpenDigitalSignatureModal,
  onOpenPasswordProtection,
  onOpenRoundtripModal,
  onOpenWorkspaceIntegration,
  onOpenCompare,
  onOpenConversion,
  onOpenOptimization,
  onOpenContentEditor,
  totalRedactionsCount,
  zoomLevel,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onOpenAuditModal,
  isAnnotationsDrawerOpen,
  onToggleAnnotationsDrawer,
  onExportPdf,
  onOpenNativePdf,
  isNativeOpenPanelOpen,
  onCopySelection,
  hasTextSelection,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = pdfToolbarCopy(locale);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMoreOpen) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!morePanelRef.current?.contains(event.target) && !moreButtonRef.current?.contains(event.target)) setIsMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setIsMoreOpen(false);
      moreButtonRef.current?.focus();
    };
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [isMoreOpen]);

  const secondaryActions: SecondaryAction[] = [];
  const addSecondaryAction = (
    id: PdfSecondaryActionId,
    group: SecondaryActionGroup,
    icon: LucideIcon,
    iconClassName: string,
    onAction: () => void,
  ) => secondaryActions.push({ id, group, ...copy.actions[id], icon, iconClassName, onAction });
  if (onOpenContentEditor) addSecondaryAction('contentEditor', 'edit', PenTool, 'text-sky-300', onOpenContentEditor);
  if (onOpenFormFiller) addSecondaryAction('formFiller', 'edit', CheckSquare, 'text-cyan-300', onOpenFormFiller);
  if (onOpenAssembler) addSecondaryAction('assembler', 'edit', Layers, 'text-purple-300', onOpenAssembler);
  if (onOpenOcrModal) addSecondaryAction('ocr', 'edit', Scan, 'text-cyan-300', onOpenOcrModal);
  if (onOpenWorkspaceIntegration) addSecondaryAction('workspaceLinks', 'edit', Network, 'text-cyan-300', onOpenWorkspaceIntegration);
  if (onOpenCompare) addSecondaryAction('compare', 'edit', FileDiff, 'text-cyan-300', onOpenCompare);
  if (onOpenConversion) addSecondaryAction('convert', 'edit', RefreshCw, 'text-violet-300', onOpenConversion);
  if (onOpenTrueRedaction) addSecondaryAction('redactAll', 'protect', ShieldAlert, 'text-red-300', onOpenTrueRedaction);
  if (onVerifiedRedactionExport && totalRedactionsCount > 0) addSecondaryAction('redactionExport', 'protect', ShieldCheck, 'text-emerald-300', onVerifiedRedactionExport);
  if (onOpenSignatureModal) addSecondaryAction('signatureStamp', 'protect', Award, 'text-emerald-300', onOpenSignatureModal);
  if (onOpenDigitalSignatureModal) addSecondaryAction('digitalSignature', 'protect', KeyRound, 'text-emerald-300', onOpenDigitalSignatureModal);
  if (onOpenPasswordProtection) addSecondaryAction('passwordProtection', 'protect', ShieldCheck, 'text-amber-300', onOpenPasswordProtection);
  if (onOpenSanitizeModal) addSecondaryAction('removeMetadata', 'protect', Sparkles, 'text-amber-300', onOpenSanitizeModal);
  addSecondaryAction('redactionAudit', 'protect', ShieldCheck, 'text-emerald-300', onOpenAuditModal);
  if (onOpenOptimization) addSecondaryAction('optimize', 'review', Gauge, 'text-sky-300', onOpenOptimization);
  if (onOpenRoundtripModal) addSecondaryAction('diagnostics', 'review', Cpu, 'text-purple-300', onOpenRoundtripModal);

  const groupLabels: Readonly<Record<SecondaryActionGroup, string>> = { edit: copy.groupEdit, protect: copy.groupProtect, review: copy.groupReview };
  const actionGroups = (['edit', 'protect', 'review'] as const)
    .map((id) => ({ id, label: groupLabels[id], actions: secondaryActions.filter((action) => action.group === id) }))
    .filter((group) => group.actions.length > 0);

  const renderSecondaryAction = (action: SecondaryAction) => {
    const Icon = action.icon;
    return (
      <button
        key={action.id}
        type="button"
        onClick={() => { setIsMoreOpen(false); action.onAction(); }}
        title={action.description}
        className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300"
      >
        <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${action.iconClassName}`} />
        <span className="min-w-0">
          <span className="block text-[0.6875rem] font-medium text-slate-100">{action.label}</span>
          <span className="mt-0.5 block text-[0.625rem] leading-4 text-slate-400">{action.description}</span>
        </span>
      </button>
    );
  };

  const selectActive = activeTool === 'select';
  const highlightActive = activeTool === 'highlight';
  const underlineActive = activeTool === 'underline';
  const strikeActive = activeTool === 'strike';
  const commentActive = activeTool === 'comment';
  const redactActive = activeTool === 'redact';

  return (
    <header data-pdf-studio-toolbar="true" className="relative z-30 flex h-12 w-full min-w-0 shrink-0 items-center gap-2 border-b border-white/[0.08] bg-slate-950/95 px-2 text-xs text-slate-200 backdrop-blur-md sm:px-3">
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden shrink-0 items-center gap-1.5 md:flex" aria-label={copy.document}>
          <FileText aria-hidden="true" className="h-4 w-4 text-red-400" />
          <span data-pdf-brand-label="true" className="hidden text-xs font-semibold text-slate-200 2xl:inline">Astraea PDF Studio</span>
        </div>
        <div aria-hidden="true" className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-0.5 font-mono text-[0.6875rem] text-slate-400" aria-label={copy.pageNavigation}>
          <button type="button" onClick={() => onScrollToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className="flex h-8 w-6 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-40 sm:w-7" aria-label={copy.previousPage} title={copy.previousPage}>
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[2rem] text-center sm:min-w-[2.5rem]" aria-label={copy.pagePosition(currentPage, totalPages)}>
            <strong className="text-slate-100">{currentPage}</strong><span className="px-0.5">/</span>{totalPages}
          </span>
          <button type="button" onClick={() => onScrollToPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className="flex h-8 w-6 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-40 sm:w-7" aria-label={copy.nextPage} title={copy.nextPage}>
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
        <div aria-hidden="true" className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-0.5" role="group" aria-label={copy.editHistory}>
          <button type="button" onClick={onUndo} disabled={!canUndo} className="flex h-8 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-35" title={copy.undoTitle} aria-label={copy.undoAria}>
            <Undo2 aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onRedo} disabled={!canRedo} className="flex h-8 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-35" title={copy.redoTitle} aria-label={copy.redoAria}>
            <Redo2 aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          {onCopySelection ? (
            <button
              type="button"
              onClick={onCopySelection}
              disabled={hasTextSelection !== true}
              data-pdf-action="copy-selection"
              aria-keyshortcuts="Control+C"
              title={hasTextSelection === true ? pdfWorkflowText(locale, 'copy.title') : pdfWorkflowText(locale, 'copy.none')}
              aria-label={hasTextSelection === true ? pdfWorkflowText(locale, 'copy.title') : pdfWorkflowText(locale, 'copy.none')}
              className="flex h-8 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-35"
            >
              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {/* A foreign PDF is a different document: the entry sits in the main bar, not behind the overflow menu,
            so it is reachable in one step and focusable like every other control. */}
        {onOpenNativePdf ? (
          <>
            <div aria-hidden="true" className="h-5 w-px bg-white/10" />
            <button
              type="button"
              onClick={onOpenNativePdf}
              aria-pressed={isNativeOpenPanelOpen === true}
              data-pdf-action="open-native-pdf"
              title={pdfWorkflowText(locale, 'nativeOpen.title')}
              className={`flex h-8 items-center gap-1.5 rounded-md border px-2 text-[0.6875rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 ${isNativeOpenPanelOpen ? 'border-red-400/50 bg-red-500/20 text-red-100' : 'border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/20'}`}
            >
              <FileInput aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{pdfWorkflowText(locale, 'nativeOpen.title')}</span>
            </button>
          </>
        ) : null}
      </div>

      <div data-pdf-tool-band="true" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/75 px-1" role="group" aria-label={copy.annotationTools}>
        <button data-pdf-tool="select" type="button" onClick={() => setActiveTool('select')} aria-pressed={selectActive} aria-label={copy.select} title={copy.select} className={`${coreToolClass} ${selectActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
          <Maximize aria-hidden="true" className="h-3.5 w-3.5" /><span className="text-[0.6875rem]">{copy.select}</span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => { setActiveTool('highlight'); onApplyHighlight(); }} aria-pressed={highlightActive} aria-label={copy.highlightSelection} title={copy.highlightSelection} className={`${coreToolClass} ${highlightActive ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
            <Highlighter aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">{copy.highlight}</span>
          </button>
          {highlightActive && HIGHLIGHT_COLORS.map((color) => {
            const translatedName = copy.highlightColors[color.hex as keyof typeof copy.highlightColors];
            return <button key={color.hex} type="button" onClick={() => setSelectedHighlightColor(color.hex)} aria-label={copy.highlightColor(translatedName)} aria-pressed={selectedHighlightColor === color.hex} title={translatedName} className={`h-3 w-3 shrink-0 rounded-full border ${selectedHighlightColor === color.hex ? 'scale-110 border-white' : 'border-white/20'}`} style={{ backgroundColor: color.hex }} />;
          })}
        </div>
        <button type="button" onClick={() => { setActiveTool('underline'); onApplyUnderline(); }} aria-pressed={underlineActive} aria-label={copy.underlineSelection} title={copy.underlineSelection} className={`${coreToolClass} ${underlineActive ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
          <UnderlineIcon aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">{copy.underline}</span>
        </button>
        <button type="button" onClick={() => { setActiveTool('strike'); onApplyStrike(); }} aria-pressed={strikeActive} aria-label={copy.strikeSelection} title={copy.strikeSelection} className={`${coreToolClass} ${strikeActive ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
          <Strikethrough aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">{copy.strike}</span>
        </button>
        <button type="button" onClick={() => { setActiveTool('comment'); onInitiateComment(); }} aria-pressed={commentActive} aria-label={copy.addComment} title={copy.addComment} className={`${coreToolClass} ${commentActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
          <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">{copy.comment}</span>
        </button>
        <div aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        <button type="button" onClick={() => { setActiveTool('redact'); onRedactSelection(); }} aria-pressed={redactActive} aria-label={copy.redactSelected(totalRedactionsCount)} title={copy.redactTitle} className={`${coreToolClass} ${redactActive ? 'bg-red-600 text-white' : 'border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20'}`}>
          <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">{copy.redact}</span>
          {totalRedactionsCount > 0 && <span className="rounded-full border border-red-400/40 bg-red-950/70 px-1.5 py-0.5 text-[0.625rem] text-red-100">{totalRedactionsCount}</span>}
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="relative shrink-0">
          <button ref={moreButtonRef} type="button" onClick={() => setIsMoreOpen((open) => !open)} aria-expanded={isMoreOpen} aria-controls="pdf-toolbar-more" aria-label={copy.moreTools} title={copy.moreTools} className="flex h-8 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[0.6875rem] text-slate-300 transition-colors hover:border-purple-400/30 hover:bg-purple-500/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300">
            <MoreHorizontal aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">{copy.more}</span><ChevronDown aria-hidden="true" className={`h-3 w-3 text-slate-500 transition-transform ${isMoreOpen ? 'rotate-180' : ''}`} />
          </button>
          <div ref={morePanelRef} id="pdf-toolbar-more" hidden={!isMoreOpen} className="absolute right-0 top-full z-50 mt-2 max-h-[min(70dvh,34rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-white/10 bg-[#0b0913] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            <div className="mb-2 border-b border-white/[0.07] px-2 pb-2">
              <p className="text-xs font-semibold text-slate-100">{copy.pdfTools}</p>
              <p className="mt-0.5 text-[0.625rem] leading-4 text-slate-400">{copy.moreDescription}</p>
            </div>
            <div className="space-y-2">
              {actionGroups.map((group) => (
                <div key={group.id} role="group" aria-label={group.label}>
                  <p className="px-2.5 pb-1 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{group.label}</p>
                  <div className="space-y-0.5">{group.actions.map(renderSecondaryAction)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button type="button" onClick={onToggleAnnotationsDrawer} aria-pressed={isAnnotationsDrawerOpen} aria-label={copy.annotations} title={copy.annotations} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${isAnnotationsDrawerOpen ? 'border-blue-400/40 bg-blue-500/15 text-blue-200' : 'border-white/10 text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
          <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
        </button>

        {onExportPdf && (
          <button type="button" onClick={onExportPdf} data-vgt-app-guide-anchor="PdfStudio:second" aria-label={copy.exportPdfAria} title={copy.exportPdfAria} className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-600/15 px-2 text-[0.6875rem] font-medium text-blue-200 transition-colors hover:bg-blue-600/25">
            <FileDown aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">{copy.exportPdf}</span>
          </button>
        )}

        <div className="flex h-8 shrink-0 items-center rounded-lg border border-white/10 bg-slate-900 p-0.5 font-mono text-[0.625rem]" role="group" aria-label={copy.zoomPresets}>
          <button type="button" onClick={onZoomOut} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white" aria-label={copy.zoomOut} title={copy.zoomOut}><ZoomOut aria-hidden="true" className="h-3.5 w-3.5" /></button>
          <span className="min-w-9 px-1 text-center text-slate-200 2xl:hidden" aria-label={copy.currentZoom(zoomLevel)}>{zoomLevel}%</span>
          <div className="hidden items-center gap-0.5 px-1 2xl:flex">
            {PDF_STUDIO_ZOOM_STEPS.map((level) => (
              <button key={level} type="button" onClick={() => onZoomChange(level)} aria-pressed={zoomLevel === level} aria-label={copy.setZoom(level)} className={`h-6 rounded px-1.5 transition-colors ${zoomLevel === level ? 'bg-blue-600 font-bold text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
                {level}%
              </button>
            ))}
          </div>
          <button type="button" onClick={onZoomIn} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white" aria-label={copy.zoomIn} title={copy.zoomIn}><ZoomIn aria-hidden="true" className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </header>
  );
};
