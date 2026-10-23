// STATUS: DIAMANT VGT SUPREME
// Astraea Grid complete formatting surface: cell styles, theme colours, borders, AutoFit,
// Format Painter, standard + custom number formats, structured-table styles, and the
// conditional-format rule manager with a live preview.
//
// Every decision about *what* a formatting operation means lives in the pure leaves:
//   gridNumberFormat.ts    — standard presets and number-format-code validity
//   gridFormatValidation.ts — ranges, colours, borders, conditional rules
//   gridConditionalPreview.ts — the preview samples the same evaluator as the table
//   gridFormattingEngine.ts — cell styles, AutoFit, painter, table palette

import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Paintbrush, Trash2 } from 'lucide-react';
import {
  GridCell,
  GridConditionalFormattingRule,
  GridSheetModel,
  GridStructuredTable,
} from '../../../shared/contracts/workspace';
import {
  GRID_CELL_STYLES,
  GRID_THEME_COLORS,
  GRID_STRUCTURED_TABLE_HEADER_TEXT,
  gridStructuredTablePalette,
  moveConditionalRule,
  normalizeConditionalPriorities,
  type GridStructuredTableTheme,
} from './gridFormattingEngine';
import {
  GRID_NUMBER_FORMAT_PRESETS,
  type GridNumberFormatId,
} from './gridNumberFormat';
import {
  GRID_FORMAT_MAX_RULE_FORMULA_LENGTH,
  GRID_FORMAT_MAX_RULE_VALUE_LENGTH,
  checkGridConditionalCapacity,
  checkGridConditionalDraft,
  checkGridNumberFormatInput,
  normalizeGridColour,
  type GridConditionalDraft,
  type GridFormatIssue,
} from './gridFormatValidation';
import { buildGridConditionalPreview } from './gridConditionalPreview';

interface Props {
  sheet: GridSheetModel;
  selectedRange: string;
  selectedCell?: string;
  activeCell?: GridCell;
  cells: Record<string, GridCell>;
  formatPainterActive: boolean;
  onUpdateSheet: (patch: Partial<GridSheetModel>) => void;
  /** Reviewed entry: returns the blocking issue, or `null` when the patch was stored. */
  onApplyFormat: (patch: Partial<GridCell>) => GridFormatIssue | null;
  onApplyNumberFormat: (id: GridNumberFormatId) => void;
  onApplyCellStyle: (styleName: string) => void;
  onToggleFormatPainter: () => void;
  onApplyFormatPainter: () => void;
  onAutoFitSelection: () => void;
  onApplyTableStyle: (tableId: string, theme: GridStructuredTableTheme) => void;
}

const BORDER_LABELS: readonly { readonly value: NonNullable<GridCell['border']>; readonly label: string }[] = [
  { value: 'none', label: 'No border' },
  { value: 'all', label: 'All edges' },
  { value: 'outline', label: 'Outline' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'double-bottom', label: 'Double bottom' },
];

const FONT_FAMILIES = ['Inter', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Courier New', 'monospace'] as const;
const TABLE_THEMES: readonly GridStructuredTableTheme[] = ['blue', 'dark', 'emerald', 'purple', 'amber'];

export const GridFormattingPanel: React.FC<Props> = ({
  sheet, selectedRange, selectedCell, activeCell, cells, formatPainterActive, onUpdateSheet,
  onApplyFormat, onApplyNumberFormat, onApplyCellStyle, onToggleFormatPainter,
  onApplyFormatPainter, onAutoFitSelection, onApplyTableStyle,
}) => {
  const rules = useMemo(() => normalizeConditionalPriorities(sheet.conditionalFormatting ?? []), [sheet.conditionalFormatting]);
  const [kind, setKind] = useState<NonNullable<GridConditionalFormattingRule['kind']>>('cell');
  const [operator, setOperator] = useState<NonNullable<GridConditionalFormattingRule['operator']>>('greater-than');
  const [value, setValue] = useState('0');
  const [value2, setValue2] = useState('100');
  const [formula, setFormula] = useState('=VALUE>0');
  const [range, setRange] = useState(selectedRange);
  const [iconSet, setIconSet] = useState<NonNullable<GridConditionalFormattingRule['iconSet']>>('arrows');
  const [rankCount, setRankCount] = useState(10);
  // The draft follows the selected cell so a user never applies a stale code by accident.
  const activeCode = activeCell?.numberFormatCode ?? '';
  const [customCode, setCustomCode] = useState(activeCode);
  const [customCodeSeed, setCustomCodeSeed] = useState(activeCode);
  const [status, setStatus] = useState<{ readonly kind: 'ok' | 'error'; readonly message: string } | null>(null);
  const previewKey = `${selectedRange}|${activeCode}`;
  const [lastPreviewKey, setLastPreviewKey] = useState(previewKey);
  if (lastPreviewKey !== previewKey) {
    setLastPreviewKey(previewKey);
    setCustomCodeSeed(activeCode);
    setCustomCode(activeCode);
  }

  const updateRules = (next: GridConditionalFormattingRule[]) => onUpdateSheet({ conditionalFormatting: normalizeConditionalPriorities(next) });

  const report = (issue: GridFormatIssue | null, okMessage: string) => {
    setStatus(issue ? { kind: 'error', message: issue.message } : { kind: 'ok', message: okMessage });
  };

  const applyPreset = (id: GridNumberFormatId) => {
    onApplyNumberFormat(id);
    const preset = GRID_NUMBER_FORMAT_PRESETS.find((entry) => entry.id === id);
    setStatus({ kind: 'ok', message: `${preset?.label ?? id} applied to ${selectedRange}.` });
  };

  const applyCustomCode = () => {
    const check = checkGridNumberFormatInput(customCode);
    if (!check.ok) {
      setStatus({ kind: 'error', message: check.message });
      return;
    }
    const issue = onApplyFormat({ numberFormatCode: check.code, format: undefined });
    report(issue, `Custom format ${check.code} applied to ${selectedRange}.`);
  };

  const applyColour = (patch: Partial<GridCell>, message: string) => report(onApplyFormat(patch), message);

  const draftRule = useMemo((): GridConditionalDraft => ({
    id: `preview-${kind}`,
    range: range.toUpperCase(),
    kind,
    operator,
    value,
    value2,
    formula,
    priority: rules.length + 1,
    stopIfTrue: false,
    iconSet,
    rankCount,
  }), [formula, iconSet, kind, operator, range, rankCount, rules.length, value, value2]);

  const draftCheck = useMemo(() => checkGridConditionalDraft(draftRule), [draftRule]);
  const capacityIssue = useMemo(() => checkGridConditionalCapacity(rules), [rules]);
  const preview = useMemo(
    () => buildGridConditionalPreview({
      rule: draftCheck.ok ? draftRule : null,
      cells,
      fallbackValue: activeCell?.value,
    }),
    [activeCell?.value, cells, draftCheck.ok, draftRule],
  );

  const addRule = () => {
    if (capacityIssue) {
      setStatus({ kind: 'error', message: capacityIssue.message });
      return;
    }
    const result = checkGridConditionalDraft({ ...draftRule, id: createRuleId() }, rules);
    if (!result.ok || !result.rule) {
      setStatus({ kind: 'error', message: result.issues.map((issue) => issue.message).join(' ') });
      return;
    }
    updateRules([...rules, result.rule]);
    setStatus({ kind: 'ok', message: `Rule on ${result.rule.range} added as priority ${rules.length + 1}.` });
  };

  const cellStylePreview = activeCell?.background ?? undefined;
  const tableStyles = sheet.tables ?? [];
  const customCodeCheck = checkGridNumberFormatInput(customCode);
  const customCodeOk = customCodeCheck.ok;
  const rangeInvalid = !checkGridConditionalDraft({ ...draftRule, id: 'range-probe' }).ok;

  return <div className="space-y-4">
    <section className="space-y-2">
      <h3 className="font-semibold text-slate-200">Cell formatting · {selectedRange}</h3>
      {status && (
        <div
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-1.5 rounded px-2 py-1 text-[0.625rem] ${status.kind === 'error' ? 'bg-rose-500/10 text-rose-200' : 'bg-emerald-500/10 text-emerald-200'}`}
        >
          {status.kind === 'error' && <AlertTriangle aria-hidden="true" className="mt-[1px] h-3 w-3 shrink-0" />}
          <span className="break-words">{status.message}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <select value={activeCell?.fontFamily ?? 'Inter'} onChange={e => applyColour({ fontFamily: e.target.value }, `Font ${e.target.value} applied.`)} className="vgt-input">
          {FONT_FAMILIES.map(f => <option key={f}>{f}</option>)}
        </select>
        <input
          type="number" min={8} max={72} value={activeCell?.fontSize ?? 12}
          onChange={e => applyColour({ fontSize: Math.max(8, Math.min(72, Number(e.target.value) || 12)) }, 'Font size applied.')}
          className="vgt-input" aria-label="Font size"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => applyColour({ bold: !activeCell?.bold }, 'Bold toggled.')} aria-pressed={Boolean(activeCell?.bold)} className="vgt-button-secondary font-bold">B</button>
        <button onClick={() => applyColour({ italic: !activeCell?.italic }, 'Italic toggled.')} aria-pressed={Boolean(activeCell?.italic)} className="vgt-button-secondary italic">I</button>
        <button onClick={() => applyColour({ underline: !activeCell?.underline }, 'Underline toggled.')} aria-pressed={Boolean(activeCell?.underline)} className="vgt-button-secondary underline">U</button>
        <button onClick={() => applyColour({ strikethrough: !activeCell?.strikethrough }, 'Strikethrough toggled.')} aria-pressed={Boolean(activeCell?.strikethrough)} className="vgt-button-secondary line-through">S</button>
        {(['left', 'center', 'right'] as const).map(a => <button key={a} onClick={() => applyColour({ alignment: a }, `Aligned ${a}.`)} aria-pressed={activeCell?.alignment === a} className="vgt-button-secondary">{a}</button>)}
        {(['top', 'middle', 'bottom'] as const).map(a => <button key={a} onClick={() => applyColour({ verticalAlignment: a }, `Aligned ${a}.`)} aria-pressed={activeCell?.verticalAlignment === a} className="vgt-button-secondary">{a}</button>)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input type="number" min={0} max={15} value={activeCell?.indent ?? 0} onChange={e => applyColour({ indent: Math.max(0, Math.min(15, Number(e.target.value) || 0)) }, 'Indent applied.')} className="vgt-input" aria-label="Indent" title="Indent" />
        <input type="number" min={-90} max={90} value={activeCell?.orientation ?? 0} onChange={e => applyColour({ orientation: Math.max(-90, Math.min(90, Number(e.target.value) || 0)) }, 'Rotation applied.')} className="vgt-input" aria-label="Text rotation" title="Text rotation" />
        <select
          value={activeCell?.border ?? 'none'}
          onChange={e => applyColour({ border: e.target.value as GridCell['border'] }, `Border ${e.target.value} applied.`)}
          className="vgt-input" aria-label="Border style"
        >
          {BORDER_LABELS.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => applyColour({ wrap: !activeCell?.wrap }, 'Wrap toggled.')} aria-pressed={Boolean(activeCell?.wrap)} className="vgt-button-secondary">Wrap</button>
        <button onClick={() => applyColour({ shrinkToFit: !activeCell?.shrinkToFit }, 'Shrink to fit toggled.')} aria-pressed={Boolean(activeCell?.shrinkToFit)} className="vgt-button-secondary">Shrink to fit</button>
        <button onClick={onAutoFitSelection} className="vgt-button-secondary">AutoFit</button>
      </div>

      <div className="space-y-1">
        <label className="block text-[0.625rem] text-slate-400" htmlFor="grid-number-format-preset">Number format</label>
        <select
          id="grid-number-format-preset"
          className="vgt-input w-full"
          value={activeCell?.numberFormatCode ?? ''}
          onChange={e => {
            const preset = GRID_NUMBER_FORMAT_PRESETS.find(entry => (entry.code ?? '') === e.target.value);
            if (preset) applyPreset(preset.id);
          }}
        >
          {activeCell?.numberFormatCode && !GRID_NUMBER_FORMAT_PRESETS.some(entry => entry.code === activeCell?.numberFormatCode) && (
            <option value={activeCell.numberFormatCode}>{activeCell.numberFormatCode} (custom)</option>
          )}
          {GRID_NUMBER_FORMAT_PRESETS.map(preset => <option value={preset.code ?? ''} key={preset.id}>{preset.label}</option>)}
        </select>
        <div className="flex gap-1">
          <input
            value={customCode}
            onChange={e => setCustomCode(e.target.value.slice(0, 255))}
            aria-label="Custom number format code"
            aria-invalid={!customCodeOk}
            className="vgt-input min-w-0 flex-1"
          />
          <button onClick={applyCustomCode} disabled={!customCodeOk} className="vgt-button-secondary disabled:opacity-40">Custom</button>
        </div>
        {customCode !== customCodeSeed && !customCodeOk && (
          <p role="alert" className="text-[0.625rem] text-rose-300">{customCodeCheck.message}</p>
        )}
      </div>

      <div className="flex gap-2 items-center">
        <span className="text-slate-400">Text</span>
        <input
          type="color" aria-label="Font colour" value={normalizeGridColour(activeCell?.text_color ?? '') ?? '#e2e8f0'}
          onChange={e => applyColour({ text_color: e.target.value }, 'Font colour applied.')}
        />
        <span className="text-slate-400">Fill</span>
        <input
          type="color" aria-label="Fill colour" value={normalizeGridColour(activeCell?.background ?? '') ?? '#0f172a'}
          onChange={e => applyColour({ background: e.target.value }, 'Fill colour applied.')}
        />
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Theme fills">
        {GRID_THEME_COLORS.map(color => <button aria-label={`Set cell fill color to ${color}`} key={color} onClick={() => applyColour({ background: color }, `Fill ${color} applied.`)} className="w-5 h-5 rounded border border-white/20" style={{ backgroundColor: color }} title={color} />)}
      </div>
    </section>

    <section className="border-t border-white/10 pt-3 space-y-2">
      <h3 className="font-semibold text-slate-200">Cell styles &amp; painter</h3>
      <div className="flex flex-wrap gap-1">{GRID_CELL_STYLES.map(style => <button key={style.name} onClick={() => { onApplyCellStyle(style.name); setStatus({ kind: 'ok', message: `Style ${style.name} applied to ${selectedRange}.` }); }} className="vgt-button-secondary">{style.name}</button>)}</div>
      <div className="flex gap-2">
        <button onClick={onToggleFormatPainter} aria-pressed={formatPainterActive} className={`vgt-button-secondary flex gap-1 ${formatPainterActive ? 'ring-1 ring-blue-400' : ''}`}><Paintbrush aria-hidden="true" className="w-3 h-3" />Capture</button>
        <button onClick={onApplyFormatPainter} disabled={!formatPainterActive} className="vgt-button-secondary">Apply painter</button>
      </div>
      {cellStylePreview && <p className="text-[0.625rem] text-slate-500">Active cell fill: <span className="font-mono">{cellStylePreview}</span></p>}
    </section>

    <section className="border-t border-white/10 pt-3 space-y-2">
      <h3 className="font-semibold text-slate-200">Table styles</h3>
      {tableStyles.length === 0
        ? <p className="text-[0.625rem] text-slate-500">No structured table on this sheet yet.</p>
        : tableStyles.map((table: GridStructuredTable) => (
          <div key={table.id} className="space-y-1 rounded bg-white/5 p-2">
            <div className="flex items-center justify-between text-[0.625rem] text-slate-300">
              <span className="truncate">{table.name} · {table.range}</span>
              <span className="font-mono text-slate-500">{table.styleTheme ?? 'blue'}</span>
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label={`Style theme for ${table.name}`}>
              {TABLE_THEMES.map(theme => {
                const palette = gridStructuredTablePalette(theme);
                const active = (table.styleTheme ?? 'blue') === theme;
                return <button
                  key={theme}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Apply ${theme} table style to ${table.name}`}
                  onClick={() => { onApplyTableStyle(table.id, theme); setStatus({ kind: 'ok', message: `${theme} style applied to ${table.name}.` }); }}
                  className={`h-6 rounded border px-2 text-[0.625rem] ${active ? 'border-blue-400 text-blue-100' : 'border-white/20 text-slate-300'}`}
                  style={{ backgroundColor: palette[0], color: active ? GRID_STRUCTURED_TABLE_HEADER_TEXT : undefined }}
                >{theme}</button>;
              })}
            </div>
          </div>
        ))}
    </section>

    <section className="border-t border-white/10 pt-3 space-y-2">
      <h3 className="font-semibold text-slate-200">Conditional Formatting Rules Manager</h3>
      <label className="block text-[0.625rem] text-slate-400" htmlFor="grid-cf-range">Applies to</label>
      <input
        id="grid-cf-range"
        value={range}
        onChange={e => setRange(e.target.value.slice(0, 128))}
        className="vgt-input w-full"
        placeholder="A1:A100"
        aria-invalid={rangeInvalid}
      />
      <select value={kind} onChange={e => setKind(e.target.value as NonNullable<GridConditionalFormattingRule['kind']>)} className="vgt-input w-full" aria-label="Rule type">
        <option value="cell">Cell value</option><option value="formula">Formula</option><option value="color-scale">Color scale</option><option value="data-bar">Data bar</option><option value="icon-set">Icon set</option><option value="duplicate">Duplicate</option><option value="unique">Unique</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="date">Date rule</option>
      </select>
      {kind === 'formula'
        ? <input value={formula} maxLength={GRID_FORMAT_MAX_RULE_FORMULA_LENGTH} onChange={e => setFormula(e.target.value)} className="vgt-input w-full" aria-label="Rule formula" placeholder="=VALUE>0" />
        : kind === 'cell'
          ? <div className="grid grid-cols-3 gap-2">
            <select value={operator} onChange={e => setOperator(e.target.value as NonNullable<GridConditionalFormattingRule['operator']>)} className="vgt-input" aria-label="Rule operator"><option value="greater-than">&gt;</option><option value="less-than">&lt;</option><option value="equals">=</option><option value="not-equals">≠</option><option value="contains">contains</option><option value="between">between</option></select>
            <input value={value} maxLength={GRID_FORMAT_MAX_RULE_VALUE_LENGTH} onChange={e => setValue(e.target.value)} className="vgt-input" aria-label="Rule value" />
            <input value={value2} maxLength={GRID_FORMAT_MAX_RULE_VALUE_LENGTH} onChange={e => setValue2(e.target.value)} className="vgt-input" aria-label="Rule second value" disabled={operator !== 'between'} />
          </div>
          : kind === 'top' || kind === 'bottom'
            ? <input type="number" min={1} max={1000} value={rankCount} onChange={e => setRankCount(Number(e.target.value) || 1)} className="vgt-input w-full" aria-label="Rank" />
            : kind === 'icon-set'
              ? <select value={iconSet} onChange={e => setIconSet(e.target.value as NonNullable<GridConditionalFormattingRule['iconSet']>)} className="vgt-input w-full" aria-label="Icon set"><option value="arrows">Arrows</option><option value="traffic-lights">Traffic lights</option><option value="ratings">Ratings</option></select>
              : null}

      {!draftCheck.ok && (
        <ul role="alert" className="space-y-0.5 rounded bg-rose-500/10 px-2 py-1 text-[0.625rem] text-rose-200">
          {draftCheck.issues.map((issue) => <li key={`${issue.code}-${issue.detail ?? ''}`}>{issue.message}</li>)}
        </ul>
      )}

      <div className="rounded bg-black/30 p-2" data-grid-cf-preview={preview.available ? 'available' : 'blocked'}>
        <div className="mb-1 text-[0.625rem] uppercase tracking-wide text-slate-500">Preview {preview.anyMatch ? '· rule matches' : '· no sample cell matches yet'}</div>
        {preview.cells.length === 0
          ? <p className="text-[0.625rem] text-slate-500">Enter a valid range to preview the rule.</p>
          : <div className="flex flex-wrap gap-1">{preview.cells.map(cell => (
            <span
              key={cell.coord}
              data-grid-cf-sample={cell.coord}
              className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[0.625rem]"
              style={{ backgroundColor: cell.visual.background, color: cell.visual.textColor }}
              title={`${cell.coord} = ${String(cell.value ?? '')}`}
            >{cell.visual.icon ? `${cell.visual.icon} ` : ''}{cell.coord}</span>
          ))}</div>}
      </div>

      <button onClick={addRule} disabled={!draftCheck.ok || capacityIssue !== null} className="vgt-button-primary disabled:opacity-40">Add rule</button>
      {capacityIssue && <p className="text-[0.625rem] text-amber-300">{capacityIssue.message}</p>}

      <div className="space-y-1 max-h-64 overflow-auto">
        {rules.length === 0 && <p className="text-[0.625rem] text-slate-500">No conditional-format rules on this sheet.</p>}
        {rules.map((rule, index) => <div key={rule.id} className="bg-white/5 rounded p-2 space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-blue-300 w-5">{index + 1}</span>
            <span className="flex-1 truncate">{rule.range} · {rule.kind ?? 'cell'}</span>
            <button aria-label={`Move conditional formatting rule ${rule.range} up`} onClick={() => updateRules(moveConditionalRule(rules, rule.id, 'up'))}><ArrowUp className="w-3 h-3" /></button>
            <button aria-label={`Move conditional formatting rule ${rule.range} down`} onClick={() => updateRules(moveConditionalRule(rules, rule.id, 'down'))}><ArrowDown className="w-3 h-3" /></button>
            <button aria-label={`Delete conditional formatting rule ${rule.range}`} onClick={() => { updateRules(rules.filter(r => r.id !== rule.id)); setStatus({ kind: 'ok', message: `Rule on ${rule.range} deleted.` }); }}><Trash2 className="w-3 h-3 text-rose-400" /></button>
          </div>
          <label className="flex items-center gap-2 text-[0.625rem] text-slate-400">
            <input type="checkbox" checked={!!rule.stopIfTrue} onChange={e => updateRules(rules.map(r => r.id === rule.id ? { ...r, stopIfTrue: e.target.checked } : r))} />Stop if true
          </label>
        </div>)}
      </div>
      {selectedCell && <p className="text-[0.625rem] text-slate-500">Active cell {selectedCell}</p>}
    </section>
  </div>;
};

/** Rule identity. `crypto.randomUUID` is unavailable in non-secure contexts, so it is optional. */
function createRuleId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `cf-${random}`;
}
