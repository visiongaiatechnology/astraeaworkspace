// STATUS: DIAMANT VGT SUPREME
// Visible Grid formula assistant: completion, function wizard and live diagnosis.
//
// The component is a thin renderer. Every decision comes from `gridFormulaAssistant.ts`, which in
// turn only composes the already-tested engines. Keyboard operation is mandatory: the completion
// list is a real listbox with ArrowUp/ArrowDown/Enter/Escape/Tab, the wizard is a labelled form,
// and every failure is announced through `role="alert"`.

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, CircleAlert, ListFilter, Sigma, Sparkles, X } from 'lucide-react';
import type { GridCell, GridNamedRange } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_FORMULA_ASSISTANT_COPY } from '../locale/gridFormulaAssistantLocale';
import {
  applyGridFormulaCompletion,
  buildGridFormulaFromWizard,
  completeGridFormula,
  describeGridFormulaDateContext,
  describeGridFormulaReferenceAt,
  describeGridFormulaScope,
  describeGridFormulaWizardEntry,
  diagnoseGridFormula,
  listGridFormulaLibrary,
  toggleGridFormulaReferenceAbsolute,
  type GridFormulaCompletion,
} from '../formulas/gridFormulaAssist';
import type { GridFormulaSpillPlan } from '../formulas/gridFormulaSpill';
import type { GridFormulaCycleReport } from '../formulas/gridFormulaCycle';

interface GridFormulaAssistantProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly formula: string;
  readonly caret: number;
  readonly coord: string;
  readonly cells: Record<string, GridCell>;
  readonly namedRanges: readonly GridNamedRange[];
  readonly timeZone: string;
  /** Evaluated result of the pending formula, when the caller already has one (spill planning). */
  readonly pendingResult?: { readonly spill: GridFormulaSpillPlan | null; readonly cycles: GridFormulaCycleReport | null };
  /**
   * Bounded on-demand check: evaluates the pending formula and plans its dynamic-array output and
   * cycles. Only called when the user presses the check button, never per keystroke.
   */
  readonly onCheckOutput?: (formula: string) => Promise<{ readonly spill: GridFormulaSpillPlan | null; readonly cycles: GridFormulaCycleReport | null } | null>;
  /** Replaces the formula-bar text; the assistant never writes into the grid itself. */
  readonly onReplaceFormula: (formula: string, caret: number) => void;
  /** Writes the composed formula and moves focus to the grid. */
  readonly onCommitFormula: (formula: string) => void;
}

type AssistTab = 'completions' | 'wizard' | 'diagnosis';

export const GridFormulaAssistant: React.FC<GridFormulaAssistantProps> = ({
  isOpen,
  onClose,
  formula,
  caret,
  coord,
  cells,
  namedRanges,
  timeZone,
  pendingResult,
  onCheckOutput,
  onReplaceFormula,
  onCommitFormula,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_FORMULA_ASSISTANT_COPY[locale];
  const [tab, setTab] = useState<AssistTab>('completions');
  const [selected, setSelected] = useState(0);
  const [libraryFilter, setLibraryFilter] = useState('');
  const [wizardName, setWizardName] = useState('SUM');
  const [arguments_, setArguments] = useState<string[]>(['']);
  const [checked, setChecked] = useState<{ readonly spill: GridFormulaSpillPlan | null; readonly cycles: GridFormulaCycleReport | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const panelId = useId();

  const completions = useMemo(
    () => (isOpen ? completeGridFormula({ formula, caret, namedRanges: namedRanges.map((entry) => entry.name) }) : { token: '', tokenStart: 0, tokenEnd: 0, items: [], truncated: false }),
    [isOpen, formula, caret, namedRanges],
  );
  const diagnosis = useMemo(
    () => (isOpen ? diagnoseGridFormula({ formula, coord, cells, namedIdentifiers: namedRanges.map((entry) => entry.name) }) : null),
    [isOpen, formula, coord, cells, namedRanges],
  );
  const library = useMemo(() => (isOpen ? listGridFormulaLibrary(libraryFilter) : { groups: [], total: 0, truncated: false }), [isOpen, libraryFilter]);
  const wizardEntry = useMemo(() => describeGridFormulaWizardEntry(wizardName), [wizardName]);
  const wizardBuild = useMemo(() => buildGridFormulaFromWizard(wizardName, arguments_), [wizardName, arguments_]);
  const referenceMode = useMemo(() => (isOpen ? describeGridFormulaReferenceAt(formula, caret) : null), [isOpen, formula, caret]);
  const scope = useMemo(() => (isOpen ? describeGridFormulaScope(formula) : { lambda: false, boundNames: [], locallyResolvable: true }), [isOpen, formula]);
  const dateContext = useMemo(() => (isOpen ? describeGridFormulaDateContext(timeZone, locale) : { context: null, offsetLabel: null }), [isOpen, timeZone, locale]);

  useEffect(() => { setSelected(0); }, [completions.token, tab]);
  useEffect(() => { if (!isOpen) { setTab('completions'); setLibraryFilter(''); setChecked(null); setCheckError(null); } }, [isOpen]);
  useEffect(() => { setChecked(null); setCheckError(null); }, [formula]);
  useEffect(() => {
    if (!wizardEntry) return;
    setArguments((current) => {
      const target = Math.max(wizardEntry.minArgs, Math.min(current.length, wizardEntry.maxArgs ?? Math.max(current.length, wizardEntry.minArgs)));
      const next = current.slice(0, target);
      while (next.length < target) next.push('');
      return next;
    });
  }, [wizardEntry]);

  if (!isOpen) return null;

  const acceptCompletion = (completion: GridFormulaCompletion) => {
    const applied = applyGridFormulaCompletion(completions, completion, formula);
    onReplaceFormula(applied.formula, applied.caret);
    setTab('wizard');
    const entry = describeGridFormulaWizardEntry(completion.name);
    if (entry) {
      setWizardName(entry.name);
      setArguments(Array.from({ length: Math.max(entry.minArgs, 1) }, () => ''));
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (completions.items.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = (selected + delta + completions.items.length) % completions.items.length;
      setSelected(next);
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[next]?.focus();
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const item = completions.items[selected];
      if (item) acceptCompletion(item);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const applyWizard = () => {
    if (wizardBuild.error) return;
    onReplaceFormula(wizardBuild.formula, wizardBuild.formula.length);
  };

  const insertWizard = () => {
    if (wizardBuild.error) return;
    onCommitFormula(wizardBuild.formula);
  };

  const toggleAbsolute = () => {
    const toggled = toggleGridFormulaReferenceAbsolute(formula, caret);
    if (toggled) onReplaceFormula(toggled.formula, toggled.caret);
  };

  const spill = checked?.spill ?? pendingResult?.spill ?? null;
  const cycles = checked?.cycles ?? pendingResult?.cycles ?? null;

  const runOutputCheck = async () => {
    if (!onCheckOutput || checking) return;
    setChecking(true);
    setCheckError(null);
    try {
      setChecked(await onCheckOutput(formula));
    } catch (reason) {
      setCheckError(reason instanceof Error ? reason.message : copy.notApplicable);
    } finally {
      setChecking(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-16 backdrop-blur-sm"
      role="presentation"
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${panelId}-title`}
        data-grid-formula-assistant="true"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-slate-900 text-xs text-slate-200 shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sigma className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <h2 id={`${panelId}-title`} className="truncate text-sm font-bold text-slate-100">{copy.title}</h2>
            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[0.625rem] text-slate-400">{coord}</span>
          </div>
          <button type="button" onClick={onClose} aria-label={copy.close} className="shrink-0 rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div role="tablist" aria-label={copy.openTitle} className="flex gap-1 border-b border-white/10 px-3 pt-2">
          {([['completions', copy.completionsTab, ListFilter], ['wizard', copy.wizardTab, Sparkles], ['diagnosis', copy.diagnosisTab, CircleAlert]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1 rounded-t-md px-3 py-1.5 text-[0.6875rem] font-semibold ${tab === key ? 'border-b-2 border-blue-500 bg-blue-600/20 text-blue-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
          <div className="rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[0.6875rem] text-slate-100 break-all" data-grid-formula-assistant-preview="true">
            {formula.trim() === '' ? '=' : formula}
          </div>

          {tab === 'completions' && (
            <div className="space-y-2">
              <p className="text-[0.625rem] text-slate-500">{copy.suggestionHint}</p>
              {completions.items.length === 0
                ? <p role="status" className="rounded border border-white/10 bg-white/5 p-2 text-[0.6875rem] text-slate-400">{copy.suggestionsEmpty}</p>
                : (
                  <ul
                    ref={listRef}
                    role="listbox"
                    aria-label={copy.suggestionList}
                    tabIndex={0}
                    onKeyDown={onListKeyDown}
                    className="max-h-56 divide-y divide-white/5 overflow-y-auto rounded border border-white/10"
                  >
                    {completions.items.map((item, index) => (
                      <li
                        key={`${item.name}-${index}`}
                        role="option"
                        aria-selected={index === selected}
                        tabIndex={-1}
                        onClick={() => setSelected(index)}
                        onDoubleClick={() => acceptCompletion(item)}
                        className={`flex cursor-pointer items-baseline gap-2 px-2 py-1.5 ${index === selected ? 'bg-blue-500/20' : 'hover:bg-white/5'}`}
                      >
                        <span className="font-mono text-[0.6875rem] font-bold text-blue-300">{item.name}</span>
                        {item.isFunction && <span className="font-mono text-[0.625rem] text-slate-500">{item.signature}</span>}
                        <span className="truncate text-[0.625rem] text-slate-400">{item.summary}</span>
                      </li>
                    ))}
                  </ul>
                )}
              {completions.items.length > 0 && (
                <button type="button" onClick={() => { const item = completions.items[selected]; if (item) acceptCompletion(item); }} className="rounded bg-blue-600 px-3 py-1.5 text-[0.6875rem] font-semibold text-white hover:bg-blue-500">
                  {copy.apply}
                </button>
              )}
            </div>
          )}

          {tab === 'wizard' && (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[0.6875rem] font-medium text-slate-300">{copy.suggestionList}</span>
                <input
                  type="search"
                  value={libraryFilter}
                  onChange={(event) => setLibraryFilter(event.target.value)}
                  aria-label={copy.suggestionList}
                  className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[0.6875rem] text-slate-100 outline-none focus:border-blue-500"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="max-h-56 overflow-y-auto rounded border border-white/10">
                  {library.groups.map((group) => (
                    <div key={group.category}>
                      <p className="sticky top-0 bg-slate-950/95 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide text-slate-500">{copy.category}: {group.category}</p>
                      <ul>
                        {group.entries.map((entry) => (
                          <li key={entry.name}>
                            <button
                              type="button"
                              aria-pressed={wizardName === entry.name}
                              onClick={() => setWizardName(entry.name)}
                              className={`w-full px-2 py-1 text-left font-mono text-[0.6875rem] ${wizardName === entry.name ? 'bg-blue-500/20 text-blue-200' : 'text-slate-300 hover:bg-white/5'}`}
                            >
                              {entry.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {wizardEntry ? (
                    <>
                      <p className="font-mono text-[0.6875rem] text-emerald-300">{wizardEntry.signature}</p>
                      <p className="text-[0.625rem] text-slate-400">{wizardEntry.summary}</p>
                      <p className="text-[0.625rem] text-slate-500">{copy.syntax}: {wizardEntry.minArgs}{wizardEntry.maxArgs === null ? '+' : `–${wizardEntry.maxArgs}`} · {copy.category}: {wizardEntry.category}</p>
                      <fieldset className="space-y-1">
                        <legend className="text-[0.6875rem] font-medium text-slate-300">{copy.parameters}</legend>
                        {wizardEntry.parameters.map((parameter, index) => (
                          <label key={`${parameter.name}-${index}`} className="block space-y-0.5">
                            <span className="text-[0.625rem] text-slate-400">
                              {parameter.name} · {parameter.kind} · {parameter.required ? copy.parameterRequired : copy.parameterOptional}
                            </span>
                            <input
                              type="text"
                              value={arguments_[index] ?? ''}
                              placeholder={copy.argumentPlaceholder(parameter.name)}
                              aria-label={copy.argumentPlaceholder(parameter.name)}
                              onChange={(event) => setArguments((current) => {
                                const next = [...current];
                                while (next.length <= index) next.push('');
                                next[index] = event.target.value;
                                return next;
                              })}
                              className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[0.6875rem] text-slate-100 outline-none focus:border-blue-500"
                            />
                          </label>
                        ))}
                      </fieldset>
                      {wizardBuild.error && (
                        <p role="alert" className="flex items-start gap-1 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-[0.6875rem] text-rose-300">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>
                            {copy.arityCode}: {wizardBuild.violation?.expected ?? copy.notApplicable} · {wizardBuild.violation?.message ?? wizardBuild.error}
                            {wizardBuild.missingRequired.length > 0 ? ` · ${wizardBuild.missingRequired.join(', ')}` : ''}
                          </span>
                        </p>
                      )}
                      <p className="rounded bg-black/40 p-2 font-mono text-[0.6875rem] text-slate-100 break-all">{wizardBuild.formula}</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={Boolean(wizardBuild.error)} onClick={applyWizard} className="rounded bg-slate-700 px-3 py-1.5 text-[0.6875rem] font-semibold text-white hover:bg-slate-600 disabled:opacity-40">{copy.apply}</button>
                        <button type="button" disabled={Boolean(wizardBuild.error)} onClick={insertWizard} className="rounded bg-emerald-600 px-3 py-1.5 text-[0.6875rem] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{copy.insert}</button>
                        <button type="button" onClick={() => setArguments(Array.from({ length: Math.max(wizardEntry.minArgs, 1) }, () => ''))} className="rounded border border-white/10 px-3 py-1.5 text-[0.6875rem] text-slate-300 hover:bg-white/5">{copy.clear}</button>
                      </div>
                    </>
                  ) : <p className="text-[0.6875rem] text-slate-400">{copy.notApplicable}</p>}
                </div>
              </div>
            </div>
          )}

          {tab === 'diagnosis' && diagnosis && (
            <div className="space-y-2">
              <p role="status" aria-live="polite" className="text-[0.6875rem] text-slate-300">
                {diagnosis.diagnostics.length === 0 ? copy.diagnosisEmpty : `${copy.diagnosisCount(diagnosis.diagnostics.length)}: ${diagnosis.summary}`}
              </p>
              {onCheckOutput && (
                <button
                  type="button"
                  onClick={() => { void runOutputCheck(); }}
                  disabled={checking || formula.trim() === ''}
                  aria-busy={checking || undefined}
                  className="rounded bg-slate-700 px-3 py-1.5 text-[0.6875rem] font-semibold text-white hover:bg-slate-600 disabled:opacity-40"
                >
                  {copy.spillTitle} / {copy.cycleTitle} · {copy.apply}
                </button>
              )}
              {checkError && <p role="alert" className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-[0.6875rem] text-rose-200">{checkError}</p>}
              {diagnosis.diagnostics.length > 0 && (
                <ul className="space-y-1">
                  {diagnosis.diagnostics.map((finding, index) => (
                    <li
                      key={`${finding.kind}-${index}`}
                      className={`flex items-start gap-2 rounded border p-2 text-[0.6875rem] ${finding.severity === 'error' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : finding.severity === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-white/10 bg-white/5 text-slate-300'}`}
                    >
                      {finding.severity === 'error' ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />}
                      <span className="min-w-0">
                        <b>{finding.title}</b>{finding.code ? ` (${finding.code})` : ''} — {finding.message}
                        {finding.hint ? <span className="block text-[0.625rem] opacity-80">{finding.hint}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1 rounded border border-white/10 bg-white/5 p-2 text-[0.6875rem]">
                <p className="font-semibold text-slate-300">{copy.spillTitle}</p>
                {spill === null
                  ? <p className="text-slate-400">{copy.notApplicable}</p>
                  : spill.kind === 'blocked'
                    ? <p className="text-amber-200">{copy.spillBlocked(spill.blockedBy.join(', '))}</p>
                    : spill.kind === 'out-of-bounds'
                      ? <p className="text-amber-200">{copy.spillOutOfBounds}</p>
                      : spill.kind === 'too-large'
                        ? <p className="text-amber-200">{copy.spillTooLarge}</p>
                        : <p className="text-emerald-200">{copy.spillOk(spill.footprint.length)}</p>}
              </div>

              <div className="space-y-1 rounded border border-white/10 bg-white/5 p-2 text-[0.6875rem]">
                <p className="font-semibold text-slate-300">{copy.cycleTitle}</p>
                {cycles === null
                  ? <p className="text-slate-400">{copy.notApplicable}</p>
                  : cycles.cycles.length === 0
                    ? <p className="text-emerald-200">{copy.cycleNone}</p>
                    : cycles.cycles.slice(0, 4).map((cycle, index) => (
                      <p key={index} className="text-rose-200">{copy.cycleFound(cycle.path.join(' → '))}</p>
                    ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded border border-white/10 bg-white/5 p-2 text-[0.6875rem]">
                <span className="text-slate-400">{copy.referenceMode}:</span>
                <span className="font-mono text-slate-200">{referenceMode ? `${referenceMode.token} · ${referenceMode.mode === 'relative' ? copy.referenceRelative : referenceMode.mode === 'absolute' ? copy.referenceAbsolute : copy.referenceMixed}` : copy.notApplicable}</span>
                <button type="button" onClick={toggleAbsolute} disabled={!referenceMode} className="rounded border border-white/10 px-2 py-1 text-[0.625rem] text-slate-200 hover:bg-white/10 disabled:opacity-40">$</button>
              </div>

              <div className="space-y-1 rounded border border-white/10 bg-white/5 p-2 text-[0.6875rem]">
                <p className="font-semibold text-slate-300">{copy.dateContext}</p>
                <p className="text-slate-300">{dateContext.context ? copy.dateContextLabel(`${dateContext.context.timeZone ?? 'host'} (${dateContext.offsetLabel})`, locale) : copy.notApplicable}</p>
              </div>

              <div className="space-y-1 rounded border border-white/10 bg-white/5 p-2 text-[0.6875rem]">
                <p className="font-semibold text-slate-300">{copy.scopeTitle}</p>
                <p className="text-slate-300">
                  {!scope.locallyResolvable
                    ? copy.notApplicable
                    : scope.boundNames.length > 0
                      ? copy.scopeBindings(scope.boundNames.join(', '))
                      : copy.scopeNone}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
};
