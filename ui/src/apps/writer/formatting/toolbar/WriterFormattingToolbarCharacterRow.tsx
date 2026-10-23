// STATUS: PLATIN — controlled Writer typography and character-formatting row.
import React from 'react';
import {
  Bold,
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Highlighter,
  Italic,
  Palette,
  Paintbrush,
  Redo2,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo2,
} from 'lucide-react';
import type { Paragraph, WriterParagraphStyleName, WriterStyleDefinition } from '../../../../shared/contracts/workspace';
import { resolveWriterFontFamilyOptions } from '../../editing/text/writerFontRange';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { THEME_PALETTES, WRITER_FONT_FAMILIES, type DocumentTheme } from '../styles/writerStyles';
import type { WriterCaseTransformMode } from '../transforms/writerCaseTransform';
import { writerToolbarText } from './writerToolbarLocale';
import { WriterColorPicker } from './WriterColorPicker';
import {
  resolveWriterRangeOptions,
  resolveWriterRangeToggleState,
  WRITER_MIXED_SELECT_VALUE,
  type WriterRangeAttribute,
  type WriterRangeFormatState,
  type WriterRangeToggleState,
} from '../range/writerRangeFormatState';

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

type ToolbarIconButtonRenderer = (
  active: boolean,
  title: string,
  onClick: () => void,
  children: React.ReactNode,
  disabled?: boolean,
  anchor?: string,
) => React.ReactNode;

type ToolbarToggleButtonRenderer = (
  state: WriterRangeToggleState,
  title: string,
  onClick: () => void,
  children: React.ReactNode,
  anchor?: string,
) => React.ReactNode;

interface WriterFormattingToolbarCharacterRowProps {
  paragraph?: Paragraph;
  styles: WriterStyleDefinition[];
  styleName: WriterParagraphStyleName;
  style?: WriterStyleDefinition;
  currentTheme: string;
  moreToolsClass: string;
  toolbarRowClass: string;
  canUndo: boolean;
  canRedo: boolean;
  moreToolsOpen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleMoreTools: () => void;
  onApplyStyle: (name: WriterParagraphStyleName) => void;
  onToggleSpan: (property: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'subscript' | 'superscript') => void;
  onUpdateStyle: (name: WriterParagraphStyleName, patch: Partial<Omit<WriterStyleDefinition, 'name' | 'label'>>) => void;
  onSetTextColor: (color: string, options?: { isIntermediate?: boolean }) => void;
  onSetHighlightColor: (color: string, options?: { isIntermediate?: boolean }) => void;
  /** Applies a font to the marked text; falls back to the style patch when absent. */
  onSetFontFamily?: (fontFamily: string) => void;
  onSetFontSizePt?: (fontSizePt: number) => void;
  /** What the marked range carries; the row shows it instead of guessing. */
  rangeFormat: WriterRangeFormatState;
  onClearFormatting: () => void;
  onSelectTheme: (themeId: string) => void;
  onOpenStyleInspector?: () => void;
  hasCopiedFormat?: boolean;
  onCopyFormat?: () => void;
  onApplyCopiedFormat?: () => void;
  onTransformCase?: (mode: WriterCaseTransformMode) => void;
  btn: (active: boolean) => string;
  iconBtn: ToolbarIconButtonRenderer;
  /** Renders a button that reports `on` / `off` / `mixed` instead of an action. */
  toggleBtn: ToolbarToggleButtonRenderer;
}

export const WriterFormattingToolbarCharacterRow: React.FC<WriterFormattingToolbarCharacterRowProps> = ({
  paragraph,
  styles,
  styleName,
  style,
  currentTheme,
  moreToolsClass,
  toolbarRowClass,
  canUndo,
  canRedo,
  moreToolsOpen,
  onUndo,
  onRedo,
  onToggleMoreTools,
  onApplyStyle,
  onToggleSpan,
  onUpdateStyle,
  onSetTextColor,
  onSetHighlightColor,
  onSetFontFamily,
  onSetFontSizePt,
  rangeFormat,
  onClearFormatting,
  onSelectTheme,
  onOpenStyleInspector,
  hasCopiedFormat,
  onCopyFormat,
  onApplyCopiedFormat,
  onTransformCase,
  btn,
  iconBtn,
  toggleBtn,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof writerToolbarText>[0]): string => writerToolbarText(message, locale);

  // The marked range decides which values the controls show. Reading the first
  // span of the paragraph reported an arbitrary font as soon as a paragraph
  // mixed fonts, and said nothing about the selection at all. The state comes
  // from the one range reader the paragraph row uses too, so the two cannot
  // disagree about the same selection (W-111, W-113).
  const fontFamily = rangeFormat.fontFamily;
  const fontSizePt = rangeFormat.fontSizePt;
  const currentFont = fontFamily.value ?? 'Inter, sans-serif';
  const currentSize = fontSizePt.value ?? 11;
  const currentTextColor = paragraph?.spans.find((span) => span.text_color)?.text_color || style?.textColor || '#0f172a';
  const currentHighlightColor = paragraph?.spans.find((span) => span.highlight_color)?.highlight_color || '#fef08a';
  // A document may carry a family from outside the known list (a DOCX import, a
  // theme) and a size outside the presets; both must be nameable in the control
  // instead of silently falling back to the first entry (W-113, W-114).
  const fontFamilyOptions = resolveWriterFontFamilyOptions(
    WRITER_FONT_FAMILIES.map((font) => font.value),
    fontFamily.value,
  );
  const fontSizeOptions = resolveWriterRangeOptions(FONT_SIZES, fontSizePt.value);
  const pressedOf = (attribute: WriterRangeAttribute<boolean>): WriterRangeToggleState =>
    resolveWriterRangeToggleState(attribute);

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${toolbarRowClass}`}>
      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 mr-1">
        {iconBtn(false, t('undo'), onUndo, <Undo2 className="w-3.5 h-3.5" />, !canUndo)}
        {iconBtn(false, t('redo'), onRedo, <Redo2 className="w-3.5 h-3.5" />, !canRedo)}
      </div>

      <span className="h-5 w-px bg-white/10" />

      {/* Style Preset Selector */}
      <div className="flex items-center gap-1">
        <select
          value={styleName}
          onChange={(event) => onApplyStyle(event.target.value as WriterParagraphStyleName)}
          data-vgt-app-guide-anchor="Writer:second"
          className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 hover:border-blue-500/40"
          title={t('paragraphStyle')}
        >
          {styles.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>{candidate.label}</option>
          ))}
        </select>
      </div>
      {onOpenStyleInspector && <div className={`${moreToolsClass} items-center`}>
        {iconBtn(false, t('styleInspector'), onOpenStyleInspector, <Sparkles className="w-3.5 h-3.5 text-purple-400" />)}
      </div>}

      {/* Font Family Selector */}
      <select
        value={fontFamily.mixed ? WRITER_MIXED_SELECT_VALUE : currentFont}
        onChange={(event) => {
          if (event.target.value === WRITER_MIXED_SELECT_VALUE) return;
          if (onSetFontFamily) onSetFontFamily(event.target.value);
          else onUpdateStyle(styleName, { fontFamily: event.target.value });
        }}
        className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 max-w-[130px] hover:border-blue-500/40"
        title={fontFamily.mixed ? `${t('fontFamily')} — ${t('mixedValueHint')}` : t('fontFamily')}
        data-writer-font-family-mixed={fontFamily.mixed ? 'true' : 'false'}
      >
        {fontFamily.mixed && <option value={WRITER_MIXED_SELECT_VALUE}>{t('mixedValue')}</option>}
        {fontFamilyOptions.map((font) => (
          <option key={font} value={font}>
            {WRITER_FONT_FAMILIES.find((candidate) => candidate.value === font)?.label ?? font}
          </option>
        ))}
      </select>

      {/* Font Size Selector */}
      <select
        value={fontSizePt.mixed ? WRITER_MIXED_SELECT_VALUE : currentSize}
        onChange={(event) => {
          if (event.target.value === WRITER_MIXED_SELECT_VALUE) return;
          const nextSize = Number(event.target.value);
          if (onSetFontSizePt) onSetFontSizePt(nextSize);
          else onUpdateStyle(styleName, { fontSizePt: nextSize });
        }}
        className="bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 w-14 hover:border-blue-500/40"
        title={fontSizePt.mixed ? `${t('fontSize')} — ${t('mixedValueHint')}` : t('fontSize')}
        data-writer-font-size-mixed={fontSizePt.mixed ? 'true' : 'false'}
      >
        {fontSizePt.mixed && <option value={WRITER_MIXED_SELECT_VALUE}>{t('mixedValue')}</option>}
        {fontSizeOptions.map((size) => <option key={size} value={size}>{size} pt</option>)}
      </select>

      <span className="h-5 w-px bg-white/10" />

      {/* Bold, Italic, Underline, Strike, Sub, Super */}
      <div className="flex items-center gap-0.5">
        {toggleBtn(pressedOf(rangeFormat.bold), t('bold'), () => onToggleSpan('bold'), <Bold className="w-3.5 h-3.5" />)}
        {toggleBtn(pressedOf(rangeFormat.italic), t('italic'), () => onToggleSpan('italic'), <Italic className="w-3.5 h-3.5" />)}
        {toggleBtn(pressedOf(rangeFormat.underline), t('underline'), () => onToggleSpan('underline'), <Underline className="w-3.5 h-3.5" />)}
      </div>
      <div className={`${moreToolsClass} items-center gap-0.5`}>
        {toggleBtn(pressedOf(rangeFormat.strikethrough), t('strikethrough'), () => onToggleSpan('strikethrough'), <Strikethrough className="w-3.5 h-3.5" />)}
        {toggleBtn(pressedOf(rangeFormat.subscript), t('subscript'), () => onToggleSpan('subscript'), <Subscript className="w-3.5 h-3.5" />)}
        {toggleBtn(pressedOf(rangeFormat.superscript), t('superscript'), () => onToggleSpan('superscript'), <Superscript className="w-3.5 h-3.5" />)}
      </div>

      <span className="h-5 w-px bg-white/10" />

      {/* Text Color & Highlight */}
      <div className="flex items-center gap-1">
        <WriterColorPicker
          value={currentTextColor}
          onChange={onSetTextColor}
          previewCssVar="--writer-live-text-color"
          title={t('textColor')}
          label={<span className="text-xs font-bold text-slate-300">A</span>}
        />
        <WriterColorPicker
          value={currentHighlightColor}
          onChange={onSetHighlightColor}
          previewCssVar="--writer-live-highlight-color"
          title={t('highlightColor')}
          icon={<Highlighter className="w-3.5 h-3.5 text-amber-400" />}
        />
        <div className={moreToolsClass}>
          <button type="button" onClick={onClearFormatting} className={btn(false)} title={t('clearFormatting')}>
            <span className="text-[0.625rem] font-mono font-bold text-slate-400">Tx</span>
          </button>
        </div>
        <div className={moreToolsClass}>
          <button
            type="button"
            onClick={hasCopiedFormat ? onApplyCopiedFormat : onCopyFormat}
            className={btn(Boolean(hasCopiedFormat))}
            aria-label={hasCopiedFormat ? t('applyCopiedFormattingHint') : t('copyFormatting')}
            title={hasCopiedFormat ? t('applyCopiedFormattingHint') : t('copyFormatting')}
          >
            <Paintbrush className={`w-3.5 h-3.5 ${hasCopiedFormat ? 'text-amber-300 animate-pulse' : 'text-slate-400'}`} />
          </button>
        </div>
        <div className={`${moreToolsClass} relative group`}>
          <button type="button" className={btn(false)} aria-label={t('transformCase')} title={t('transformCase')}>
            <CaseSensitive className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <div className="hidden group-hover:flex group-focus-within:flex flex-col absolute top-full left-0 mt-1 bg-slate-900 border border-white/10 rounded shadow-xl z-30 py-1 min-w-[120px]">
            <button type="button" onClick={() => onTransformCase?.('upper')} className="px-2.5 py-1 text-left text-[0.6875rem] text-slate-300 hover:bg-white/10 hover:text-white">{t('uppercase')}</button>
            <button type="button" onClick={() => onTransformCase?.('lower')} className="px-2.5 py-1 text-left text-[0.6875rem] text-slate-300 hover:bg-white/10 hover:text-white">{t('lowercase')}</button>
            <button type="button" onClick={() => onTransformCase?.('title')} className="px-2.5 py-1 text-left text-[0.6875rem] text-slate-300 hover:bg-white/10 hover:text-white">{t('titleCase')}</button>
            <button type="button" onClick={() => onTransformCase?.('sentence')} className="px-2.5 py-1 text-left text-[0.6875rem] text-slate-300 hover:bg-white/10 hover:text-white">{t('sentenceCase')}</button>
            <button type="button" onClick={() => onTransformCase?.('toggle')} className="px-2.5 py-1 text-left text-[0.6875rem] text-slate-300 hover:bg-white/10 hover:text-white">{t('toggleCase')}</button>
          </div>
        </div>
      </div>

      <span className={`${moreToolsClass} h-5 w-px bg-white/10`} />

      {/* Document Theme Palette */}
      <div className={`${moreToolsClass} items-center gap-1 rounded border border-white/10 bg-slate-900 px-2 py-1`}>
        <Palette className="w-3 h-3 text-violet-400" />
        <select
          value={currentTheme}
          onChange={(event) => onSelectTheme(event.target.value)}
          className="bg-transparent text-[0.6875rem] text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 cursor-pointer"
          title={t('themePalette')}
        >
          {THEME_PALETTES.map((theme: DocumentTheme) => <option key={theme.id} value={theme.id} className="bg-slate-900 text-white">{theme.name}</option>)}
        </select>
      </div>

      <button type="button" onClick={onToggleMoreTools} aria-expanded={moreToolsOpen} aria-label={moreToolsOpen ? t('lessTools') : t('moreTools')} title={moreToolsOpen ? t('lessTools') : t('moreTools')} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-purple-500/25 bg-purple-950/35 px-2.5 text-[0.6875rem] font-medium text-purple-200 transition-colors hover:border-purple-400/40 hover:bg-purple-900/40 min-[1700px]:hidden">
        <span>{moreToolsOpen ? t('lessTools') : t('moreTools')}</span>
        {moreToolsOpen ? <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
};
