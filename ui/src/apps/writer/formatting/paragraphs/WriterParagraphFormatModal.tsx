// STATUS: DIAMANT VGT SUPREME
import React, { useEffect, useState } from 'react';
import {
  Paragraph,
  ParagraphStyle,
  type WriterParagraphBorderStyle,
  type WriterTabStop,
} from '../../../../shared/contracts/workspace';
import { X, Sliders } from 'lucide-react';
import { resolveWriterLineSpacing, type WriterLineSpacingMode } from '../../layout/typography/line-spacing/writerLineSpacing';
import { resolveWriterParagraphSpacing } from './writerParagraphSpacing';
import { resolveWriterParagraphIndent } from './writerParagraphIndent';
import {
  normalizeWriterParagraphBorder,
  resolveWriterParagraphDecoration,
} from './writerParagraphDecoration';
import { WriterTabStopsEditor } from '../tabs/WriterTabStopsEditor';
import { normalizeWriterTabStops } from '../tabs/writerTabStops';
import { WriterTextFlowEditor } from './WriterTextFlowEditor';
import { normalizeWriterTextFlow } from '../../layout/text-flow/writerTextFlow';
import type { WriterRangeFormatState } from '../range/writerRangeFormatState';

export interface WriterParagraphFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  paragraph?: Paragraph;
  onUpdateParagraphStyle: (patch: Partial<ParagraphStyle>) => void;
  /**
   * What the marked range carries. The dialog edits every covered paragraph (its
   * patch goes through the range-aware command), so it has to say when those
   * paragraphs disagree instead of showing one of them as if it were all of them
   * (W-119).
   */
  rangeFormat?: WriterRangeFormatState;
}

type LineSpacingType = 'single' | '1.15' | '1.5' | 'double' | 'exact' | 'minimum' | 'multiple';

function isLineSpacingType(value: string): value is LineSpacingType {
  return ['single', '1.15', '1.5', 'double', 'exact', 'minimum', 'multiple'].includes(value);
}

function selectionFromStyle(style: ParagraphStyle): { type: LineSpacingType; value: number } {
  const spacing = resolveWriterLineSpacing(style, 1.5);
  if (spacing.mode !== 'preset') return { type: spacing.mode, value: spacing.value };
  if (spacing.value === 1) return { type: 'single', value: 1 };
  if (spacing.value === 1.15) return { type: '1.15', value: 1.15 };
  if (spacing.value === 1.5) return { type: '1.5', value: 1.5 };
  if (spacing.value === 2) return { type: 'double', value: 2 };
  return { type: 'multiple', value: spacing.value };
}

function spacingMode(type: LineSpacingType): WriterLineSpacingMode {
  return type === 'exact' || type === 'minimum' || type === 'multiple' ? type : 'preset';
}

export const WriterParagraphFormatModal: React.FC<WriterParagraphFormatModalProps> = ({
  isOpen,
  onClose,
  paragraph,
  onUpdateParagraphStyle,
  rangeFormat,
}) => {
  const style = paragraph?.style;
  const initialIndent = resolveWriterParagraphIndent(style ?? {});
  const [leftIndent, setLeftIndent] = useState<number>(initialIndent.leftMm);
  const [rightIndent, setRightIndent] = useState<number>(initialIndent.rightMm);
  const [firstLineIndent, setFirstLineIndent] = useState<number>(style?.first_line_indent_mm ?? 0);
  const [hangingIndent, setHangingIndent] = useState<number>(style?.hanging_indent_mm ?? 0);
  const [spaceBefore, setSpaceBefore] = useState<number>(style?.space_before ?? 0);
  const [spaceAfter, setSpaceAfter] = useState<number>(style?.space_after ?? 8);
  const initialSpacing = selectionFromStyle(style ?? {
    alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8,
  });
  const [lineSpacingValue, setLineSpacingValue] = useState<number>(initialSpacing.value);
  const [lineSpacingType, setLineSpacingType] = useState<LineSpacingType>(initialSpacing.type);
  const [keepWithNext, setKeepWithNext] = useState<boolean>(style?.keep_with_next ?? false);
  const [keepLinesTogether, setKeepLinesTogether] = useState<boolean>(style?.keep_lines_together ?? false);
  const [widowOrphanControl, setWidowOrphanControl] = useState<boolean>(style?.widow_orphan_control ?? true);
  const [pageBreakBefore, setPageBreakBefore] = useState<boolean>(style?.page_break_before ?? false);
  const initialDecoration = resolveWriterParagraphDecoration(style ?? {
    alignment: 'left', line_height: 1.5, space_before: 0, space_after: 8,
  });
  const initialBorder = initialDecoration.borders.top ?? initialDecoration.borders.right ??
    initialDecoration.borders.bottom ?? initialDecoration.borders.left;
  const [borderSides, setBorderSides] = useState({
    top: Boolean(initialDecoration.borders.top),
    right: Boolean(initialDecoration.borders.right),
    bottom: Boolean(initialDecoration.borders.bottom),
    left: Boolean(initialDecoration.borders.left),
  });
  const [borderStyle, setBorderStyle] = useState<WriterParagraphBorderStyle>(initialBorder?.style ?? 'solid');
  const [borderWidthPt, setBorderWidthPt] = useState(initialBorder?.widthPt ?? 1);
  const [borderColor, setBorderColor] = useState(initialBorder?.color ?? '#64748b');
  const [borderSpacingPt, setBorderSpacingPt] = useState(initialBorder?.spacingPt ?? 3);
  const [shadingEnabled, setShadingEnabled] = useState(Boolean(initialDecoration.shading));
  const [shadingColor, setShadingColor] = useState(initialDecoration.shading?.fillColor ?? '#f1f5f9');
  const [shadingOpacity, setShadingOpacity] = useState(initialDecoration.shading?.opacityPercent ?? 100);
  const [tabStops, setTabStops] = useState<WriterTabStop[]>(() => normalizeWriterTabStops(style?.tab_stops));
  const [textFlow, setTextFlow] = useState(() => normalizeWriterTextFlow(style ?? {}));

  useEffect(() => {
    if (!isOpen || !paragraph) return;
    const nextStyle = paragraph.style;
    const nextIndent = resolveWriterParagraphIndent(nextStyle);
    setLeftIndent(nextIndent.leftMm);
    setRightIndent(nextIndent.rightMm);
    setFirstLineIndent(nextStyle.first_line_indent_mm ?? 0);
    setHangingIndent(nextStyle.hanging_indent_mm ?? 0);
    setSpaceBefore(nextStyle.space_before ?? 0);
    setSpaceAfter(nextStyle.space_after ?? 8);
    const nextSpacing = selectionFromStyle(nextStyle);
    setLineSpacingType(nextSpacing.type);
    setLineSpacingValue(nextSpacing.value);
    setKeepWithNext(nextStyle.keep_with_next ?? false);
    setKeepLinesTogether(nextStyle.keep_lines_together ?? false);
    setWidowOrphanControl(nextStyle.widow_orphan_control ?? true);
    setPageBreakBefore(nextStyle.page_break_before ?? false);
    const decoration = resolveWriterParagraphDecoration(nextStyle);
    const representativeBorder = decoration.borders.top ?? decoration.borders.right ??
      decoration.borders.bottom ?? decoration.borders.left;
    setBorderSides({
      top: Boolean(decoration.borders.top),
      right: Boolean(decoration.borders.right),
      bottom: Boolean(decoration.borders.bottom),
      left: Boolean(decoration.borders.left),
    });
    setBorderStyle(representativeBorder?.style ?? 'solid');
    setBorderWidthPt(representativeBorder?.widthPt ?? 1);
    setBorderColor(representativeBorder?.color ?? '#64748b');
    setBorderSpacingPt(representativeBorder?.spacingPt ?? 3);
    setShadingEnabled(Boolean(decoration.shading));
    setShadingColor(decoration.shading?.fillColor ?? '#f1f5f9');
    setShadingOpacity(decoration.shading?.opacityPercent ?? 100);
    setTabStops(normalizeWriterTabStops(nextStyle.tab_stops));
    setTextFlow(normalizeWriterTextFlow(nextStyle));
  }, [isOpen, paragraph]);

  if (!isOpen || !paragraph) return null;

  /**
   * The fields the marked paragraphs do not agree on. Applying the dialog to a
   * range makes every covered paragraph carry the values shown here, so a user
   * has to learn which of them were not uniform before confirming.
   */
  const mixedFields: { key: string; label: string }[] = [];
  if (rangeFormat?.alignment.mixed) mixedFields.push({ key: 'alignment', label: 'Ausrichtung' });
  if (rangeFormat?.lineHeight.mixed) mixedFields.push({ key: 'line_height', label: 'Zeilenabstand' });
  if (rangeFormat?.leftIndentMm.mixed) mixedFields.push({ key: 'left_indent_mm', label: 'Linker Einzug' });
  if (rangeFormat?.rightIndentMm.mixed) mixedFields.push({ key: 'right_indent_mm', label: 'Rechter Einzug' });
  if (rangeFormat?.firstLineIndentMm.mixed) mixedFields.push({ key: 'first_line_indent_mm', label: 'Erstzeileneinzug' });
  if (rangeFormat?.tabStops.mixed) mixedFields.push({ key: 'tab_stops', label: 'Tabstopps' });
  const mixedKeys = mixedFields.map((field) => field.key).join(',');

  const handleApply = () => {
    const mode = spacingMode(lineSpacingType);
    const fallbackValue = mode === 'exact' || mode === 'minimum' ? 12 : 1.5;
    const minimumValue = mode === 'exact' || mode === 'minimum' ? 1 : 0.5;
    const maximumValue = mode === 'exact' || mode === 'minimum' ? 500 : 10;
    const safeSpacingValue = Number.isFinite(lineSpacingValue)
      ? Math.min(maximumValue, Math.max(minimumValue, lineSpacingValue))
      : fallbackValue;
    const paragraphSpacing = resolveWriterParagraphSpacing({ space_before: spaceBefore, space_after: spaceAfter });
    const paragraphIndent = resolveWriterParagraphIndent({
      left_indent_mm: leftIndent,
      right_indent_mm: rightIndent,
      first_line_indent_mm: firstLineIndent,
      hanging_indent_mm: hangingIndent,
    });
    const border = normalizeWriterParagraphBorder({
      style: borderStyle,
      widthPt: borderWidthPt,
      color: borderColor,
      spacingPt: borderSpacingPt,
    });
    const borders = border && Object.values(borderSides).some(Boolean)
      ? {
          top: borderSides.top ? border : undefined,
          right: borderSides.right ? border : undefined,
          bottom: borderSides.bottom ? border : undefined,
          left: borderSides.left ? border : undefined,
        }
      : undefined;
    const previousDirection = normalizeWriterTextFlow(paragraph.style).textDirection;
    const alignment = textFlow.textDirection === 'rtl' && previousDirection !== 'rtl' && paragraph.style.alignment === 'left'
      ? 'right'
      : textFlow.textDirection === 'ltr' && previousDirection === 'rtl' && paragraph.style.alignment === 'right'
        ? 'left'
        : paragraph.style.alignment;
    onUpdateParagraphStyle({
      alignment,
      left_indent_mm: paragraphIndent.leftMm || undefined,
      right_indent_mm: paragraphIndent.rightMm || undefined,
      first_line_indent_mm: paragraphIndent.firstLineMm || undefined,
      hanging_indent_mm: paragraphIndent.hangingMm || undefined,
      space_before: paragraphSpacing.beforePt,
      space_after: paragraphSpacing.afterPt,
      line_height: mode === 'preset' || lineSpacingType === 'multiple'
        ? safeSpacingValue
        : paragraph.style.line_height,
      line_spacing_mode: mode,
      line_spacing_value: safeSpacingValue,
      keep_with_next: keepWithNext,
      keep_lines_together: keepLinesTogether,
      widow_orphan_control: widowOrphanControl,
      page_break_before: pageBreakBefore,
      borders,
      shading: shadingEnabled ? {
        fillColor: shadingColor,
        opacityPercent: Math.min(100, Math.max(0, Math.round(shadingOpacity))),
      } : undefined,
      tab_stops: normalizeWriterTabStops(tabStops),
      text_direction: textFlow.textDirection,
      line_break_mode: textFlow.lineBreakMode,
      hyphenation_mode: textFlow.hyphenationMode,
      border_top: undefined,
      border_bottom: undefined,
      background_color: undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150 select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <Sliders className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">Absatzformatierung & Typografie</h3>
          </div>
          <button aria-label="Close Absatzformatierung & Typografie dialog" type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-4 text-xs text-slate-300 max-h-[420px] overflow-y-auto pr-1">
          {mixedFields.length > 0 && (
            <p
              data-writer-range-mixed="true"
              data-writer-mixed-fields={mixedKeys}
              className="rounded-xl border border-dashed border-amber-400/60 bg-amber-500/10 px-3 py-2 text-[0.6875rem] leading-relaxed text-amber-200"
            >
              Mehrere Werte: {mixedFields.map((field) => field.label).join(', ')} unterscheiden sich in der markierten Auswahl.
              Das Anwenden setzt alle markierten Absätze auf die hier gezeigten Werte.
            </p>
          )}
          {/* Section: Indentation */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-3">
            <span className="text-[0.625rem] font-bold uppercase tracking-wider text-blue-400 block">
              Einzüge (mm)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Links</label>
                <input type="number" min={0} max={500} step={1} value={leftIndent}
                  onChange={(event) => setLeftIndent(Number(event.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Rechts</label>
                <input type="number" min={0} max={500} step={1} value={rightIndent}
                  onChange={(event) => setRightIndent(Number(event.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Erstzeileneinzug</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={firstLineIndent}
                    onChange={(e) => {
                      setFirstLineIndent(Number(e.target.value));
                      if (Number(e.target.value) > 0) setHangingIndent(0);
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                  />
                  <span className="text-slate-400 text-[0.6875rem]">mm</span>
                </div>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Hängender Einzug</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={hangingIndent}
                    onChange={(e) => {
                      setHangingIndent(Number(e.target.value));
                      if (Number(e.target.value) > 0) setFirstLineIndent(0);
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                  />
                  <span className="text-slate-400 text-[0.6875rem]">mm</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Spacing & Line Height */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-3">
            <span className="text-[0.625rem] font-bold uppercase tracking-wider text-emerald-400 block">
              Abstände & Zeilenabstand
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-slate-400 block mb-1">Abstand vor (pt)</label>
                <input
                  type="number"
                  min={0}
                  max={1584}
                  step={2}
                  value={spaceBefore}
                  onChange={(e) => setSpaceBefore(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-100 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Abstand nach (pt)</label>
                <input
                  type="number"
                  min={0}
                  max={1584}
                  step={2}
                  value={spaceAfter}
                  onChange={(e) => setSpaceAfter(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-100 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Zeilenabstand</label>
                <select
                  value={lineSpacingType}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!isLineSpacingType(val)) return;
                    setLineSpacingType(val);
                    if (val === 'single') setLineSpacingValue(1);
                    else if (val === '1.15') setLineSpacingValue(1.15);
                    else if (val === '1.5') setLineSpacingValue(1.5);
                    else if (val === 'double') setLineSpacingValue(2);
                    else if (val === 'exact' || val === 'minimum') setLineSpacingValue(12);
                    else setLineSpacingValue(Math.max(0.5, Math.min(10, lineSpacingValue)));
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-100 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                >
                  <option value="single">Einfach (1.0)</option>
                  <option value="1.15">1.15 Zeilen</option>
                  <option value="1.5">1.5 Zeilen</option>
                  <option value="double">Doppelt (2.0)</option>
                  <option value="exact">Exakt</option>
                  <option value="minimum">Mindestens</option>
                  <option value="multiple">Mehrfach</option>
                </select>
              </div>
            </div>
            {(lineSpacingType === 'exact' || lineSpacingType === 'minimum' || lineSpacingType === 'multiple') && (
              <div className="grid grid-cols-[1fr_auto] items-end gap-2.5">
                <label className="text-slate-400">
                  {lineSpacingType === 'multiple' ? 'Multiplikator' : 'Zeilenhöhe'}
                  <input
                    type="number"
                    min={lineSpacingType === 'multiple' ? 0.5 : 1}
                    max={lineSpacingType === 'multiple' ? 10 : 500}
                    step={lineSpacingType === 'multiple' ? 0.05 : 0.5}
                    value={lineSpacingValue}
                    onChange={(event) => setLineSpacingValue(Number(event.target.value))}
                    className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-100 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                  />
                </label>
                <span className="pb-1.5 text-[0.6875rem] text-slate-400">
                  {lineSpacingType === 'multiple' ? '×' : 'pt'}
                </span>
              </div>
            )}
          </div>

          {/* Section: Pagination & Flow Control */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-2.5">
            <span className="text-[0.625rem] font-bold uppercase tracking-wider text-purple-400 block">
              Seitenumbruch- & Textflussregeln
            </span>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center space-x-2 cursor-pointer p-1.5 rounded hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={widowOrphanControl}
                  onChange={(e) => setWidowOrphanControl(e.target.checked)}
                  className="rounded text-blue-600 bg-slate-900 border-white/20"
                />
                <span className="text-[0.6875rem] text-slate-300">Absatzkontrolle (Widow/Orphan)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer p-1.5 rounded hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={keepWithNext}
                  onChange={(e) => setKeepWithNext(e.target.checked)}
                  className="rounded text-blue-600 bg-slate-900 border-white/20"
                />
                <span className="text-[0.6875rem] text-slate-300">Keep with next (Nicht trennen)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer p-1.5 rounded hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={keepLinesTogether}
                  onChange={(e) => setKeepLinesTogether(e.target.checked)}
                  className="rounded text-blue-600 bg-slate-900 border-white/20"
                />
                <span className="text-[0.6875rem] text-slate-300">Zeilen zusammenhalten</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer p-1.5 rounded hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={pageBreakBefore}
                  onChange={(e) => setPageBreakBefore(e.target.checked)}
                  className="rounded text-blue-600 bg-slate-900 border-white/20"
                />
                <span className="text-[0.6875rem] text-slate-300">Seitenumbruch oberhalb</span>
              </label>
            </div>
          </div>

          <WriterTextFlowEditor value={textFlow} onChange={setTextFlow} />

          <WriterTabStopsEditor value={tabStops} onChange={setTabStops} />

          {/* Section: Borders & Background */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-2.5">
            <span className="text-[0.625rem] font-bold uppercase tracking-wider text-amber-400 block">
              Rahmen & Schattierung
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <label key={side} className="flex items-center gap-1.5 rounded-lg border border-white/5 p-1.5 cursor-pointer hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={borderSides[side]}
                    onChange={(event) => setBorderSides((current) => ({ ...current, [side]: event.target.checked }))}
                    className="rounded text-blue-600 bg-slate-900 border-white/20"
                  />
                  <span className="text-[0.625rem]">{{ top: 'Oben', right: 'Rechts', bottom: 'Unten', left: 'Links' }[side]}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <label className="text-[0.625rem] text-slate-400">Stil
                <select value={borderStyle} onChange={(event) => setBorderStyle(event.target.value as WriterParagraphBorderStyle)}
                  className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-100">
                  <option value="solid">Durchgezogen</option><option value="dashed">Gestrichelt</option>
                  <option value="dotted">Gepunktet</option><option value="double">Doppelt</option>
                </select>
              </label>
              <label className="text-[0.625rem] text-slate-400">Breite (pt)
                <input type="number" min={0.25} max={6} step={0.25} value={borderWidthPt}
                  onChange={(event) => setBorderWidthPt(Number(event.target.value))}
                  className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-100" />
              </label>
              <label className="text-[0.625rem] text-slate-400">Abstand (pt)
                <input type="number" min={0} max={24} step={1} value={borderSpacingPt}
                  onChange={(event) => setBorderSpacingPt(Number(event.target.value))}
                  className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-100" />
              </label>
              <label className="text-[0.625rem] text-slate-400">Farbe
                <input type="color" value={borderColor} onChange={(event) => setBorderColor(event.target.value)}
                  className="mt-1 h-7 w-full bg-slate-900 border border-white/10 rounded-lg p-0.5" />
              </label>
            </div>
            <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
              <label className="flex items-center gap-1.5 pb-1.5 cursor-pointer">
                <input type="checkbox" checked={shadingEnabled} onChange={(event) => setShadingEnabled(event.target.checked)}
                  className="rounded text-blue-600 bg-slate-900 border-white/20" />
                <span className="text-[0.625rem]">Hintergrund</span>
              </label>
              <label className="text-[0.625rem] text-slate-400">Füllfarbe
                <input type="color" value={shadingColor} disabled={!shadingEnabled}
                  onChange={(event) => setShadingColor(event.target.value)}
                  className="mt-1 h-7 w-full bg-slate-900 border border-white/10 rounded-lg p-0.5 disabled:opacity-40" />
              </label>
              <label className="text-[0.625rem] text-slate-400">Deckkraft: {Math.round(shadingOpacity)}%
                <input type="range" min={0} max={100} step={5} value={shadingOpacity} disabled={!shadingEnabled}
                  onChange={(event) => setShadingOpacity(Number(event.target.value))}
                  className="mt-1 w-full accent-blue-500 disabled:opacity-40" />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 transition-all"
          >
            Formatierung anwenden
          </button>
        </div>
      </div>
    </div>
  );
};
