// STATUS: PLATIN — Sovereign Professional Writer Formatting Ribbon
import React from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowRight,
  Bookmark,
  Printer,
  BookOpen,
  Circle,
  ImagePlus,
  Layout,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  Mail,
  MessageSquare,
  Minus,
  RectangleHorizontal,
  Sigma,
  Sliders, SlidersHorizontal,
  Link2,
  Square,
  Type,
  Cpu,
  FileSpreadsheet,
  BarChart3,
  SpellCheck,
  Mic,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react';
import type {
  Paragraph,
  WriterParagraphStyleName,
  WriterSectionBreakType,
  WriterShapeKind,
  WriterStyleDefinition,
  WriterTextAlignment,
} from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { ViewMode } from '../../types';
import { inferWriterStyleName } from '../styles/writerStyles';
import type { WriterCaseTransformMode } from '../transforms/writerCaseTransform';
import { writerToolbarText, type WriterToolbarMessage } from './writerToolbarLocale';
import { WriterViewModeControls } from './WriterViewModeControls';
import { WriterBreakMenu } from './WriterBreakMenu';
import { WriterToolbarMenu, WriterToolbarMenuGroup, WriterToolbarMenuItem } from './WriterToolbarMenu';
import { writerToolbarMenuLabels } from './writerToolbarMenuLabels';
import { WriterTableSizePicker } from '../../tables/picker/WriterTableSizePicker';
import type { WriterTableSize } from '../../tables/picker/writerTableSize';
import { WriterFormattingToolbarCharacterRow } from './WriterFormattingToolbarCharacterRow';
import { resolveWriterLineHeightOptions } from '../../editing/paragraphs/writerParagraphFormatApply';
import {
  resolveWriterAriaPressed,
  resolveWriterCoveredParagraphRanges,
  resolveWriterRangeFormatState,
  WRITER_MIXED_SELECT_VALUE,
  type WriterRangeFormatState,
  type WriterRangeToggleState,
} from '../range/writerRangeFormatState';

interface WriterFormattingToolbarProps {
  paragraph?: Paragraph;
  styles: WriterStyleDefinition[];
  currentTheme: string;
  viewMode: ViewMode;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onApplyStyle: (name: WriterParagraphStyleName) => void;
  onToggleSpan: (property: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'subscript' | 'superscript') => void;
  onSetAlignment: (alignment: WriterTextAlignment) => void;
  onToggleList: (list: 'bullet' | 'number' | 'checklist') => void;
  onUpdateStyle: (name: WriterParagraphStyleName, patch: Partial<Omit<WriterStyleDefinition, 'name' | 'label'>>) => void;
  onSetTextColor: (color: string, options?: { isIntermediate?: boolean }) => void;
  onSetHighlightColor: (color: string, options?: { isIntermediate?: boolean }) => void;
  onSetFontFamily?: (fontFamily: string) => void;
  onSetFontSizePt?: (fontSizePt: number) => void;
  selection?: { readonly start: number; readonly end: number } | null;
  /**
   * What the marked range carries. Every control derives its shown value and its
   * "these differ" state from here instead of from the active paragraph (W-111,
   * W-116, W-119).
   */
  rangeFormat?: WriterRangeFormatState;
  onClearFormatting: () => void;
  onSetLineSpacing: (spacing: number) => void;
  onSelectTheme: (themeId: string) => void;
  /**
   * AST-0106: the size the user picked in the grid, not a size this toolbar decided. The old signature
   * `() => void` is what let the fixed 3 × 1 literal live inside the caller.
   */
  onInsertTable: (size: WriterTableSize) => void;
  onOpenTableProperties?: () => void;
  onInsertImage: () => void;
  onInsertMedia?: () => void;
  onInsertShape?: (kind: import('../../../../shared/contracts/workspace').WriterShapeKind) => void;
  onOpenTableOfFigures?: () => void;
  onInsertEquation: () => void;
  /** WR-035: opens the link dialog for the marked text. */
  onInsertLink?: () => void;
  onOpenPageSetup: () => void;
  onOpenCitationModal: () => void;
  onOpenSymbolsModal: () => void;
  onOpenFootnoteModal: () => void;
  onOpenBookmarkModal: () => void;
  onOpenMailMergeModal: () => void;
  onOpenParagraphFormat?: () => void;
  onOpenSort?: () => void;
  onOpenListFormat?: () => void;
  onOpenStyleInspector?: () => void;
  onOpenCrossReference?: () => void;
  onOpenFields?: () => void;
  onOpenGridEmbed?: () => void;
  onOpenStats?: () => void;
  onOpenLinguistics?: () => void;
  onOpenDictation?: () => void;
  onOpenRoundtrip?: () => void;
  onOpenAutoCorrect?: () => void;
  onInsertLineBreak: () => void;
  onInsertPageBreak: () => void;
  onInsertColumnBreak: () => void;
  onInsertSectionBreak: (breakType: WriterSectionBreakType) => void;
  showRuler?: boolean;
  onToggleRuler?: () => void;
  isTwoPageSpread?: boolean;
  onToggleTwoPageSpread?: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onSetZoom: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenExport?: () => void;
  hasCopiedFormat?: boolean;
  onCopyFormat?: () => void;
  onApplyCopiedFormat?: () => void;
  onTransformCase?: (mode: WriterCaseTransformMode) => void;
  onPrint?: () => void;
}

const LINE_SPACINGS = [1.0, 1.15, 1.5, 2.0];

/**
 * WR-034 (native M7 re-probe) — the toolbar offered **one** vector shape.
 *
 * `onInsertShape?.('rectangle')` was hard-coded, so rounded rectangle, ellipse, arrow,
 * line, text box and callout existed in the model, in the canvas and in the renderer but
 * could not be inserted at all. Every kind gets a labelled entry; the label is localised
 * in all seven locales, like every other command in this menu.
 */
const WRITER_SHAPE_MENU_ENTRIES: readonly {
  readonly kind: WriterShapeKind;
  readonly labelKey: WriterToolbarMessage;
  readonly icon: React.ReactNode;
}[] = [
  { kind: 'rectangle', labelKey: 'shapeRectangle', icon: <Square className="h-3.5 w-3.5 text-sky-400" /> },
  { kind: 'rounded-rectangle', labelKey: 'shapeRoundedRectangle', icon: <RectangleHorizontal className="h-3.5 w-3.5 text-sky-400" /> },
  { kind: 'ellipse', labelKey: 'shapeEllipse', icon: <Circle className="h-3.5 w-3.5 text-sky-400" /> },
  { kind: 'arrow', labelKey: 'shapeArrow', icon: <ArrowRight className="h-3.5 w-3.5 text-sky-400" /> },
  { kind: 'line', labelKey: 'shapeLine', icon: <Minus className="h-3.5 w-3.5 text-sky-400" /> },
  { kind: 'textbox', labelKey: 'shapeTextbox', icon: <Type className="h-3.5 w-3.5 text-sky-400" /> },
  { kind: 'callout', labelKey: 'shapeCallout', icon: <MessageSquare className="h-3.5 w-3.5 text-sky-400" /> },
];

export const WriterFormattingToolbar: React.FC<WriterFormattingToolbarProps> = ({
  paragraph,
  styles,
  currentTheme,
  viewMode,
  zoom,
  canUndo,
  canRedo,
  onApplyStyle,
  onToggleSpan,
  onSetAlignment,
  onToggleList,
  onUpdateStyle,
  onSetTextColor,
  onSetHighlightColor,
  onSetFontFamily,
  onSetFontSizePt,
  selection,
  rangeFormat,
  onClearFormatting,
  onSetLineSpacing,
  onSelectTheme,
  onInsertTable,
  onOpenTableProperties,
  onInsertImage,
  onInsertMedia,
  onInsertShape,
  onOpenTableOfFigures,
  onInsertEquation,
  onInsertLink,
  onOpenPageSetup,
  onOpenCitationModal,
  onOpenSymbolsModal,
  onOpenFootnoteModal,
  onOpenBookmarkModal,
  onOpenMailMergeModal,
  onOpenParagraphFormat,
  onOpenSort,
  onOpenListFormat,
  onOpenStyleInspector,
  onOpenCrossReference,
  onOpenFields,
  onOpenGridEmbed,
  onOpenStats,
  onOpenLinguistics,
  onOpenDictation,
  onOpenRoundtrip,
  onOpenAutoCorrect,
  onInsertLineBreak,
  onInsertPageBreak,
  onInsertColumnBreak,
  onInsertSectionBreak,
  showRuler,
  onToggleRuler,
  isTwoPageSpread,
  onToggleTwoPageSpread,
  onSetViewMode,
  onSetZoom,
  onUndo,
  onRedo,
  onOpenExport,
  hasCopiedFormat,
  onCopyFormat,
  onApplyCopiedFormat,
  onTransformCase,
  onPrint,
}) => {
  const [moreToolsOpen, setMoreToolsOpen] = React.useState(false);
  // WR-023: one open menu at a time, so a second click never stacks panels.
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const toggleMenu = (id: string) => setOpenMenu((current) => (current === id ? null : id));
  const closeMenu = React.useCallback(() => setOpenMenu(null), []);
  const { locale } = useWorkspaceLocale();
  const menuLabels = writerToolbarMenuLabels(locale);
  const t = (message: Parameters<typeof writerToolbarText>[0]): string => writerToolbarText(message, locale);
  const moreToolsClass = moreToolsOpen ? 'flex' : 'hidden min-[1700px]:flex';
  const toolbarLayoutClass = moreToolsOpen ? 'flex-col' : 'flex-row flex-wrap min-[1700px]:flex-col';
  const toolbarRowClass = moreToolsOpen ? '' : 'max-[1699px]:contents';
  const styleName = paragraph ? inferWriterStyleName(paragraph) : 'normal';
  const style = styles.find((candidate) => candidate.name === styleName) ?? styles[0];

  /**
   * The state every control reads.
   *
   * The application hands the real state down. A caller that renders the toolbar
   * without it — a focused component test — gets the same answer from the same
   * reader for the active paragraph, so there is no second definition of "what is
   * marked" that a control could silently fall back to (W-111, W-116, W-119).
   */
  const effectiveRangeFormat = rangeFormat ?? resolveWriterRangeFormatState(
    paragraph ? [paragraph] : [],
    resolveWriterCoveredParagraphRanges(
      paragraph ? [paragraph] : [],
      0,
      paragraph && selection ? { paragraphId: paragraph.id, start: selection.start, end: selection.end } : null,
      null,
    ),
    style,
  );

  const currentAlign = effectiveRangeFormat.alignment.value ?? paragraph?.style.alignment ?? style?.alignment ?? 'left';
  const alignMixed = effectiveRangeFormat.alignment.mixed;
  const currentLineHeight = effectiveRangeFormat.lineHeight.value ?? paragraph?.style.line_height ?? style?.lineHeight ?? 1.5;
  const lineHeightMixed = effectiveRangeFormat.lineHeight.mixed;
  // A paragraph may carry a spacing that is not one of the presets (themes and
  // generated blocks use 1.3, 1.6, 1.8 …). Without a matching option the select
  // has nothing to show and the control would misreport the document.
  const lineHeightOptions = resolveWriterLineHeightOptions(LINE_SPACINGS, currentLineHeight);

  const btn = (active: boolean) =>
    `p-1.5 rounded border text-xs transition-colors ${
      active
        ? 'bg-blue-600/30 border-blue-500/50 text-blue-200'
        : 'bg-slate-900/90 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800'
    }`;

  const iconBtn = (active: boolean, title: string, onClick: () => void, children: React.ReactNode, disabled = false, anchor?: string) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      data-vgt-app-guide-anchor={anchor}
      onClick={onClick}
      className={`${btn(active)} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );

  /**
   * A button that reports a state rather than performing an action.
   *
   * The state was expressed through `className` alone, so a screen reader could
   * not tell a pressed bold button from an unpressed one, and a range that
   * disagreed looked exactly like one that agreed (W-111). `aria-pressed`
   * carries all three states; the range's own state is mirrored in a data
   * attribute so the surface stays checkable without a DOM runner.
   */
  const toggleBtn = (state: WriterRangeToggleState, title: string, onClick: () => void, children: React.ReactNode, anchor?: string) => (
    <button
      type="button"
      title={state === 'mixed' ? `${title} — ${t('mixedValueHint')}` : title}
      aria-label={title}
      aria-pressed={resolveWriterAriaPressed(state)}
      data-writer-toggle-state={state}
      data-vgt-app-guide-anchor={anchor}
      onClick={onClick}
      className={`${btn(state === 'on')} ${state === 'mixed' ? 'border-dashed border-amber-400/60 text-amber-200' : ''}`}
    >
      {children}
    </button>
  );

  const alignmentState = (alignment: WriterTextAlignment): WriterRangeToggleState => {
    if (alignMixed) return 'mixed';
    return currentAlign === alignment ? 'on' : 'off';
  };

  return (
    <div className={`w-full flex gap-2 p-2 select-none ${toolbarLayoutClass}`} data-vgt-workspace-chrome="toolbar" data-additional-tools-expanded={moreToolsOpen ? 'true' : 'false'}>
      <WriterFormattingToolbarCharacterRow
        paragraph={paragraph}
        styles={styles}
        styleName={styleName}
        style={style}
        currentTheme={currentTheme}
        moreToolsClass={moreToolsClass}
        toolbarRowClass={toolbarRowClass}
        canUndo={canUndo}
        canRedo={canRedo}
        moreToolsOpen={moreToolsOpen}
        onUndo={onUndo}
        onRedo={onRedo}
        onToggleMoreTools={() => setMoreToolsOpen((open) => !open)}
        onApplyStyle={onApplyStyle}
        onToggleSpan={onToggleSpan}
        onUpdateStyle={onUpdateStyle}
        onSetTextColor={onSetTextColor}
        onSetHighlightColor={onSetHighlightColor}
        onSetFontFamily={onSetFontFamily}
        onSetFontSizePt={onSetFontSizePt}
        rangeFormat={effectiveRangeFormat}
        onClearFormatting={onClearFormatting}
        onSelectTheme={onSelectTheme}
        onOpenStyleInspector={onOpenStyleInspector}
        hasCopiedFormat={hasCopiedFormat}
        onCopyFormat={onCopyFormat}
        onApplyCopiedFormat={onApplyCopiedFormat}
        onTransformCase={onTransformCase}
        btn={btn}
        iconBtn={iconBtn}
        toggleBtn={toggleBtn}
      />
      {/* Row 2: Paragraph Alignment, Lists, Inserts & View Modes */}
      <div className={`flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-white/5 ${toolbarRowClass}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Alignment */}
          <div className="flex items-center gap-0.5">
            {toggleBtn(alignmentState('left'), t('alignLeft'), () => onSetAlignment('left'), <AlignLeft className="w-3.5 h-3.5" />)}
            {toggleBtn(alignmentState('center'), t('alignCenter'), () => onSetAlignment('center'), <AlignCenter className="w-3.5 h-3.5" />)}
            {toggleBtn(alignmentState('right'), t('alignRight'), () => onSetAlignment('right'), <AlignRight className="w-3.5 h-3.5" />)}
            {toggleBtn(alignmentState('justify'), t('justify'), () => onSetAlignment('justify'), <AlignJustify className="w-3.5 h-3.5" />)}
            {toggleBtn(alignmentState('distributed'), t('distributed'), () => onSetAlignment('distributed'), <AlignJustify className="w-3.5 h-3.5 rotate-90" />)}
          </div>

          {/* Line Spacing & Paragraph Formatting */}
          <div className="flex items-center gap-1">
            <select
              value={lineHeightMixed ? WRITER_MIXED_SELECT_VALUE : currentLineHeight}
              onChange={(e) => {
                // The mixed placeholder is a statement, not a value: acting on it
                // would write a line height out of an empty string.
                if (e.target.value === WRITER_MIXED_SELECT_VALUE) return;
                onSetLineSpacing(Number(e.target.value));
              }}
              className="bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 hover:border-blue-500/40"
              title={lineHeightMixed ? `${t('lineSpacing')} — ${t('mixedValueHint')}` : t('lineSpacing')}
              data-writer-line-spacing-mixed={lineHeightMixed ? 'true' : 'false'}
            >
              {lineHeightMixed && (
                <option value={WRITER_MIXED_SELECT_VALUE}>{t('mixedValue')}</option>
              )}
              {lineHeightOptions.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}x
                </option>
              ))}
            </select>
            {onOpenParagraphFormat && <div className={moreToolsClass}>{iconBtn(false, t('paragraphFormat'), onOpenParagraphFormat, <Sliders className="w-3.5 h-3.5 text-blue-400" />)}</div>}
          </div>

          <span className="h-5 w-px bg-white/10" />

          {/* Lists */}
          <div className="flex items-center gap-0.5">
            {iconBtn(paragraph?.style.list_style === 'bullet', t('bulletList'), () => onToggleList('bullet'), <List className="w-3.5 h-3.5" />)}
            {iconBtn(paragraph?.style.list_style === 'number', t('numberedList'), () => onToggleList('number'), <ListOrdered className="w-3.5 h-3.5" />)}
            {iconBtn(paragraph?.style.list_style === 'checklist', t('checklist'), () => onToggleList('checklist'), <ListChecks className="w-3.5 h-3.5" />)}
          </div>

          <span className="h-5 w-px bg-white/10" />

          {/*
            WR-023 — three **labelled** menus instead of an icon wall.
            Every rare command keeps its icon, gains a German name, a tooltip and a
            shortcut; all callbacks and `data-vgt-app-guide-anchor` markers survive, so
            nothing becomes unreachable while the primary row stays readable at
            1366 × 768.
          */}
          <div className="flex flex-wrap items-center gap-1">
            <WriterToolbarMenu
              id="writer-toolbar-menu-insert"
              label={menuLabels.insert}
              open={openMenu === 'insert'}
              onToggle={() => toggleMenu('insert')}
              onClose={closeMenu}
              panelClassName="w-72"
            >
              <WriterToolbarMenuGroup label={menuLabels.tables}>
                <div className="px-1 py-1">
                  <WriterTableSizePicker
                    label={t('insertTable')}
                    gridLabel={t('tableSizeGrid')}
                    hint={t('tableSizeGridHint')}
                    onPick={onInsertTable}
                    buttonClass={btn(false)}
                  />
                </div>
                {onOpenTableProperties && (
                  <WriterToolbarMenuItem
                    label={t('tableProperties')}
                    icon={<SlidersHorizontal className="w-3.5 h-3.5 text-emerald-300" />}
                    onClick={onOpenTableProperties}
                    onExecuted={closeMenu}
                  />
                )}
                {onOpenGridEmbed && (
                  <WriterToolbarMenuItem
                    label={t('embedWorkspaceObject')}
                    icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />}
                    anchor="Writer:embed"
                    onClick={onOpenGridEmbed}
                    onExecuted={closeMenu}
                  />
                )}
              </WriterToolbarMenuGroup>
              <WriterToolbarMenuGroup label={menuLabels.media}>
                <WriterToolbarMenuItem
                  label={t('insertImage')}
                  icon={<ImagePlus className="w-3.5 h-3.5 text-blue-400" />}
                  onClick={onInsertImage}
                  onExecuted={closeMenu}
                />
                {onInsertMedia && (
                  <WriterToolbarMenuItem
                    label={t('insertMedia')}
                    icon={<span className="text-[0.6875rem] font-bold text-fuchsia-300">▶</span>}
                    onClick={onInsertMedia}
                    onExecuted={closeMenu}
                  />
                )}
                <WriterToolbarMenuItem
                  label={t('insertEquation')}
                  icon={<Sigma className="w-3.5 h-3.5 text-amber-400" />}
                  onClick={onInsertEquation}
                  onExecuted={closeMenu}
                />
                {onInsertLink && (
                  <WriterToolbarMenuItem
                    label="Link …"
                    icon={<Link2 className="w-3.5 h-3.5 text-sky-400" />}
                    shortcut="Strg+K"
                    dataAction="insert-link"
                    onClick={onInsertLink}
                    onExecuted={closeMenu}
                  />
                )}
                <WriterToolbarMenuItem
                  label={t('specialSymbols')}
                  icon={<span className="text-xs font-serif font-bold text-teal-400">Ω</span>}
                  onClick={onOpenSymbolsModal}
                  onExecuted={closeMenu}
                />
              </WriterToolbarMenuGroup>
              {onInsertShape && (
                <WriterToolbarMenuGroup label={t('shapeMenu')}>
                  {WRITER_SHAPE_MENU_ENTRIES.map((entry) => (
                    <WriterToolbarMenuItem
                      key={entry.kind}
                      label={t(entry.labelKey)}
                      icon={entry.icon}
                      dataAction={`insert-shape:${entry.kind}`}
                      onClick={() => onInsertShape(entry.kind)}
                      onExecuted={closeMenu}
                    />
                  ))}
                </WriterToolbarMenuGroup>
              )}
              <WriterToolbarMenuGroup label={menuLabels.references}>
                {onOpenTableOfFigures && (
                  <WriterToolbarMenuItem
                    label={t('insertTableOfFigures')}
                    icon={<BookOpen className="w-3.5 h-3.5 text-amber-300" />}
                    onClick={onOpenTableOfFigures}
                    onExecuted={closeMenu}
                  />
                )}
                {onOpenCrossReference && (
                  <WriterToolbarMenuItem
                    label={t('crossReference')}
                    icon={<Link2 className="w-3.5 h-3.5 text-sky-400" />}
                    onClick={onOpenCrossReference}
                    onExecuted={closeMenu}
                  />
                )}
                {onOpenFields && (
                  <WriterToolbarMenuItem
                    label={t('dynamicField')}
                    icon={<Cpu className="w-3.5 h-3.5 text-teal-400" />}
                    onClick={onOpenFields}
                    onExecuted={closeMenu}
                  />
                )}
                <WriterToolbarMenuItem
                  label={t('citationsBibliography')}
                  icon={<BookOpen className="w-3.5 h-3.5 text-indigo-400" />}
                  onClick={onOpenCitationModal}
                  onExecuted={closeMenu}
                />
                <WriterToolbarMenuItem
                  label={t('insertFootnote')}
                  icon={<span className="text-[0.625rem] font-bold text-violet-400">fn¹</span>}
                  onClick={onOpenFootnoteModal}
                  onExecuted={closeMenu}
                />
                <WriterToolbarMenuItem
                  label={t('bookmark')}
                  icon={<Bookmark className="w-3.5 h-3.5 text-rose-400" />}
                  onClick={onOpenBookmarkModal}
                  onExecuted={closeMenu}
                />
              </WriterToolbarMenuGroup>
              <WriterToolbarMenuGroup label={menuLabels.breaks}>
                <div className="px-1 py-1">
                  <WriterBreakMenu
                    onInsertLineBreak={onInsertLineBreak}
                    onInsertPageBreak={onInsertPageBreak}
                    onInsertColumnBreak={onInsertColumnBreak}
                    onInsertSectionBreak={onInsertSectionBreak}
                  />
                </div>
              </WriterToolbarMenuGroup>
            </WriterToolbarMenu>

            <WriterToolbarMenu
              id="writer-toolbar-menu-format"
              label={menuLabels.format}
              open={openMenu === 'format'}
              onToggle={() => toggleMenu('format')}
              onClose={closeMenu}
              panelClassName="w-64"
            >
              <WriterToolbarMenuGroup label={menuLabels.paragraph}>
                {onOpenParagraphFormat && (
                  <WriterToolbarMenuItem
                    label={t('paragraphFormat')}
                    icon={<Sliders className="w-3.5 h-3.5 text-blue-400" />}
                    onClick={onOpenParagraphFormat}
                    onExecuted={closeMenu}
                  />
                )}
                {onOpenListFormat && (
                  <WriterToolbarMenuItem
                    label={t('listFormat')}
                    icon={<ListTree className="w-3.5 h-3.5 text-amber-400" />}
                    onClick={onOpenListFormat}
                    onExecuted={closeMenu}
                  />
                )}
                {onOpenSort && (
                  <WriterToolbarMenuItem
                    label={t('sortParagraphs')}
                    icon={<ArrowDownAZ className="w-3.5 h-3.5 text-cyan-400" />}
                    onClick={onOpenSort}
                    onExecuted={closeMenu}
                  />
                )}
                {onOpenStyleInspector && (
                  <WriterToolbarMenuItem
                    label={t('styleInspector')}
                    icon={<SlidersHorizontal className="w-3.5 h-3.5 text-indigo-300" />}
                    onClick={onOpenStyleInspector}
                    onExecuted={closeMenu}
                  />
                )}
              </WriterToolbarMenuGroup>
            </WriterToolbarMenu>

            <WriterToolbarMenu
              id="writer-toolbar-menu-tools"
              label={menuLabels.tools}
              open={openMenu === 'tools'}
              onToggle={() => toggleMenu('tools')}
              onClose={closeMenu}
              panelClassName="w-72"
            >
              <WriterToolbarMenuGroup label={menuLabels.writingAssist}>
                {onOpenLinguistics && (
                  <WriterToolbarMenuItem
                    label={t('linguistics')}
                    icon={<SpellCheck className="w-3.5 h-3.5 text-blue-400" />}
                    onClick={onOpenLinguistics}
                    onExecuted={closeMenu}
                  />
                )}
                {onOpenAutoCorrect && (
                  <WriterToolbarMenuItem
                    label={t('autocorrect')}
                    icon={<WandSparkles className="w-3.5 h-3.5 text-violet-400" />}
                    onClick={onOpenAutoCorrect}
                    onExecuted={closeMenu}
                  />
                )}
                {onOpenDictation && (
                  <WriterToolbarMenuItem
                    label={t('dictation')}
                    icon={<Mic className="w-3.5 h-3.5 text-rose-400" />}
                    onClick={onOpenDictation}
                    onExecuted={closeMenu}
                  />
                )}
                <WriterToolbarMenuItem
                  label={t('mailMerge')}
                  icon={<Mail className="w-3.5 h-3.5 text-cyan-400" />}
                  onClick={onOpenMailMergeModal}
                  onExecuted={closeMenu}
                />
              </WriterToolbarMenuGroup>
              <WriterToolbarMenuGroup label={menuLabels.document}>
                {onOpenStats && (
                  <WriterToolbarMenuItem
                    label={t('documentStats')}
                    icon={<BarChart3 className="w-3.5 h-3.5 text-pink-400" />}
                    onClick={onOpenStats}
                    onExecuted={closeMenu}
                  />
                )}
                {onOpenRoundtrip && (
                  <WriterToolbarMenuItem
                    label={t('roundtrip')}
                    icon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                    onClick={onOpenRoundtrip}
                    onExecuted={closeMenu}
                  />
                )}
                <WriterToolbarMenuItem
                  label={t('pageSetup')}
                  icon={<Layout className="w-3.5 h-3.5 text-yellow-400" />}
                  onClick={onOpenPageSetup}
                  onExecuted={closeMenu}
                />
                {(onOpenExport || onPrint) && (
                  <WriterToolbarMenuItem
                    label={t('printExport')}
                    icon={<Printer className="w-3.5 h-3.5 text-blue-300" />}
                    shortcut="Strg+P"
                    onClick={() => { if (onOpenExport) onOpenExport(); else onPrint?.(); }}
                    onExecuted={closeMenu}
                  />
                )}
              </WriterToolbarMenuGroup>
              <WriterToolbarMenuGroup label={menuLabels.view}>
                <div className="px-1 py-1">
                  <WriterViewModeControls
                    viewMode={viewMode}
                    onSetViewMode={onSetViewMode}
                    zoom={zoom}
                    onSetZoom={onSetZoom}
                    showRuler={showRuler}
                    onToggleRuler={onToggleRuler}
                    isTwoPageSpread={isTwoPageSpread}
                    onToggleTwoPageSpread={onToggleTwoPageSpread}
                  />
                </div>
              </WriterToolbarMenuGroup>
            </WriterToolbarMenu>
          </div>
        </div>
      </div>
    </div>
  );
};
