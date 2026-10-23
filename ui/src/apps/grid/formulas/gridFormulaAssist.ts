// STATUS: DIAMANT VGT SUPREME
// Pure decision layer behind the visible Grid formula assistant.
//
// This module owns **no** function list, **no** error table, **no** reference parser and **no**
// limit of its own. It only composes the engines that already exist and are already tested:
//
//   catalogue / completion / arity / call building  -> formulas/gridFormulaCatalog.ts
//   diagnosis, error docs, reference arrows         -> formulas/gridFormulaDiagnostics.ts
//   dynamic-array spill planning                    -> formulas/gridFormulaSpill.ts
//   cycle detection                                 -> formulas/gridFormulaCycle.ts
//   A1 reference parsing and translation            -> formulas/gridFormulaReferences.ts
//   LET/LAMBDA binding                              -> formulas/gridFormulaLambda.ts
//   date functions and time zone context            -> formulas/gridFormulaDate.ts / gridFormulaTimeContext.ts
//
// Everything is deterministic, side-effect free and bounded, so it can be verified headlessly while
// the React component stays a thin renderer.

import type { GridCell } from '../../../shared/contracts/workspace';
import {
  buildFormulaCall,
  formulaFunctionSignature,
  getFormulaFunctionEntry,
  listFormulaFunctionCategories,
  suggestFormulaFunctions,
  validateFormulaFunctionArity,
  type GridFormulaArityViolation,
  type GridFormulaFunctionCategory,
  type GridFormulaFunctionEntry,
} from './gridFormulaCatalog';
import {
  buildGridFormulaReferenceArrows,
  describeFormulaError,
  diagnoseFormula,
  summarizeFormulaDiagnostics,
  type DiagnoseFormulaOptions,
  type GridFormulaDiagnostic,
  type GridFormulaReferenceArrows,
} from './gridFormulaDiagnostics';
import { detectGridFormulaCycles, formatGridFormulaCycle, type GridFormulaCycleReport } from './gridFormulaCycle';
import { planGridFormulaSpill, type GridFormulaSpillPlan } from './gridFormulaSpill';
import { formatA1Reference, parseA1ReferenceToken, translateFormulaReferences } from './gridFormulaReferences';
import { parseLambda } from './gridFormulaLambda';
import { createGridFormulaTimeContext, createIntlZoneOffsetLookup, gridFormulaOffsetLabel, type GridFormulaTimeContext } from './gridFormulaTimeContext';
import type { FormulaError, FormulaValue } from './gridFormulaTypes';

export const GRID_ASSIST_MAX_SUGGESTIONS = 12;
export const GRID_ASSIST_MAX_LIBRARY_ENTRIES = 512;

/** One completion row. `insertText` is what the formula bar replaces the current token with. */
export interface GridFormulaCompletion {
  readonly name: string;
  readonly category: GridFormulaFunctionCategory;
  readonly summary: string;
  readonly signature: string;
  readonly insertText: string;
  readonly isFunction: boolean;
}

export interface GridFormulaCompletionRequest {
  /** Full formula-bar text. */
  readonly formula: string;
  /** Caret offset in `formula`; defaults to the end. */
  readonly caret?: number;
  readonly cells?: Readonly<Record<string, GridCell>>;
  readonly namedRanges?: readonly string[];
  readonly limit?: number;
}

export interface GridFormulaCompletionResult {
  /** The token the caret currently sits in (already upper-cased for function matching). */
  readonly token: string;
  readonly tokenStart: number;
  readonly tokenEnd: number;
  readonly items: readonly GridFormulaCompletion[];
  readonly truncated: boolean;
}

/** The character class that may form a function/name token. Mirrors the catalogue's own rules. */
const TOKEN_PATTERN = /[A-Za-z][A-Za-z0-9._]*$/;

function tokenAt(formula: string, caret: number): { token: string; start: number; end: number } {
  const bounded = Math.max(0, Math.min(formula.length, caret));
  const head = formula.slice(0, bounded);
  const match = TOKEN_PATTERN.exec(head);
  if (!match) return { token: '', start: bounded, end: bounded };
  const start = bounded - match[0].length;
  return { token: match[0], start, end: bounded };
}

/**
 * Completion for the formula bar. Functions come from the canonical catalogue; named ranges come
 * from the caller. No second list is maintained here.
 */
export function completeGridFormula(request: GridFormulaCompletionRequest): GridFormulaCompletionResult {
  const formula = request.formula ?? '';
  const caret = request.caret ?? formula.length;
  const limit = Math.max(1, Math.min(GRID_ASSIST_MAX_SUGGESTIONS, request.limit ?? GRID_ASSIST_MAX_SUGGESTIONS));
  const { token, start, end } = tokenAt(formula, caret);

  const items: GridFormulaCompletion[] = [];
  const seen = new Set<string>();
  if (token.length > 0) {
    for (const entry of suggestFormulaFunctions(token, limit)) {
      const name = entry.name.toUpperCase();
      seen.add(name);
      items.push({
        name,
        category: entry.category,
        summary: entry.summary,
        signature: formulaFunctionSignature(entry),
        insertText: `${name}(`,
        isFunction: true,
      });
      if (items.length >= limit) break;
    }
    const needle = token.toUpperCase();
    for (const named of request.namedRanges ?? []) {
      if (items.length >= limit) break;
      const name = named.trim();
      if (!name || seen.has(name.toUpperCase())) continue;
      if (!name.toUpperCase().startsWith(needle)) continue;
      seen.add(name.toUpperCase());
      items.push({ name, category: 'lookup', summary: '', signature: name, insertText: name, isFunction: false });
    }
  }

  return { token, tokenStart: start, tokenEnd: end, items, truncated: items.length >= limit };
}

/** Applies a completion to the formula text, replacing the token under the caret. */
export function applyGridFormulaCompletion(
  result: GridFormulaCompletionResult,
  completion: GridFormulaCompletion,
  formula: string,
): { formula: string; caret: number } {
  const next = `${formula.slice(0, result.tokenStart)}${completion.insertText}${formula.slice(result.tokenEnd)}`;
  return { formula: next, caret: result.tokenStart + completion.insertText.length };
}

export interface GridFormulaLibraryGroup {
  readonly category: GridFormulaFunctionCategory;
  readonly entries: readonly GridFormulaFunctionEntry[];
}

/** Function library for the wizard. Grouped by the catalogue's own categories. */
export function listGridFormulaLibrary(filter?: string): {
  readonly groups: readonly GridFormulaLibraryGroup[];
  readonly total: number;
  readonly truncated: boolean;
} {
  const needle = (filter ?? '').trim().toUpperCase();
  // One ranked pass over the canonical catalogue, then grouped for display. The category list is
  // the catalogue's own, so a new category appears here without touching this module.
  const ranked = suggestFormulaFunctions(needle, GRID_ASSIST_MAX_LIBRARY_ENTRIES);
  const truncated = ranked.length >= GRID_ASSIST_MAX_LIBRARY_ENTRIES;
  const groups: GridFormulaLibraryGroup[] = [];
  for (const category of listFormulaFunctionCategories()) {
    const entries = ranked
      .filter((entry) => entry.category === category)
      .slice()
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    if (entries.length === 0) continue;
    groups.push({ category, entries });
  }
  return { groups, total: ranked.length, truncated };
}

/** Full wizard description of one catalogue entry, including per-parameter requirements. */
export interface GridFormulaWizardEntry {
  readonly name: string;
  readonly category: GridFormulaFunctionCategory;
  readonly summary: string;
  readonly signature: string;
  readonly minArgs: number;
  readonly maxArgs: number | null;
  readonly dynamicArrayResult: boolean;
  readonly parameters: readonly {
    readonly name: string;
    readonly kind: string;
    readonly required: boolean;
    readonly description: string;
  }[];
}

export function describeGridFormulaWizardEntry(name: string): GridFormulaWizardEntry | null {
  const entry = getFormulaFunctionEntry(name);
  if (!entry) return null;
  return {
    name: entry.name.toUpperCase(),
    category: entry.category,
    summary: entry.summary,
    signature: formulaFunctionSignature(entry),
    minArgs: entry.minArgs,
    maxArgs: entry.maxArgs,
    dynamicArrayResult: entry.dynamicArrayResult,
    parameters: entry.parameters.map((parameter) => ({
      name: parameter.name,
      kind: parameter.kind,
      required: parameter.required,
      description: parameter.description,
    })),
  };
}

export interface GridFormulaWizardBuild {
  readonly formula: string;
  /** Spreadsheet error the cell would show, or `null` when the call is well formed. */
  readonly error: FormulaError | null;
  readonly violation: GridFormulaArityViolation | null;
  readonly missingRequired: readonly string[];
}

/** Composes the formula from wizard parameter values using the canonical call builder. */
export function buildGridFormulaFromWizard(name: string, argumentValues: readonly string[]): GridFormulaWizardBuild {
  const entry = getFormulaFunctionEntry(name);
  const built = buildFormulaCall(name, argumentValues);
  const violation = built.violation ?? validateFormulaFunctionArity(name, argumentValues.length);
  const missingRequired: string[] = [];
  if (entry) {
    for (let index = 0; index < entry.parameters.length; index += 1) {
      const parameter = entry.parameters[index]!;
      if (parameter.required && (argumentValues[index] ?? '').trim() === '') missingRequired.push(parameter.name);
    }
  }
  return {
    formula: built.formula,
    error: violation?.code ?? null,
    violation,
    missingRequired,
  };
}

/** Wraps a raw expression into a formula, letting the wizard builder own the `=` prefix. */
export function wrapGridFormulaExpression(expression: string): string {
  const trimmed = expression.trim();
  if (trimmed === '') return '';
  return trimmed.startsWith('=') ? trimmed : `=${trimmed}`;
}

export interface GridFormulaDiagnosisRequest extends DiagnoseFormulaOptions {
  readonly formula: string;
}

export interface GridFormulaDiagnosisResult {
  readonly diagnostics: readonly GridFormulaDiagnostic[];
  /** Highest severity present, or `null` when there is nothing to report. */
  readonly severity: 'error' | 'warning' | 'info' | null;
  /** Screen-reader sentence built by the diagnostics engine itself. */
  readonly summary: string;
  /** Error code the cell would display, when the diagnosis proves one. */
  readonly errorCode: FormulaError | null;
  readonly errorDocumentation: GridFormulaDiagnostic | null;
  readonly referenceArrows: GridFormulaReferenceArrows | null;
}

export function diagnoseGridFormula(request: GridFormulaDiagnosisRequest): GridFormulaDiagnosisResult {
  const diagnostics = diagnoseFormula(request.formula, {
    coord: request.coord,
    namedIdentifiers: request.namedIdentifiers,
    extraFunctions: request.extraFunctions,
    limits: request.limits,
    cells: request.cells,
  });
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const severity = errors.length > 0 ? 'error' : diagnostics.some((d) => d.severity === 'warning') ? 'warning' : diagnostics.length > 0 ? 'info' : null;
  const errorCode = errors.find((diagnostic) => diagnostic.code)?.code ?? null;
  return {
    diagnostics,
    severity,
    summary: summarizeFormulaDiagnostics(diagnostics),
    errorCode,
    errorDocumentation: errorCode ? describeFormulaError(errorCode) : null,
    referenceArrows: request.coord && request.cells
      ? buildGridFormulaReferenceArrows(request.coord, request.cells, request.limits)
      : null,
  };
}

export interface GridFormulaInsertionRequest {
  readonly coord: string;
  readonly formula: string;
  readonly cells: Readonly<Record<string, GridCell>>;
  /** Evaluated result of the formula, when the caller already has it. */
  readonly result?: FormulaValue;
}

export interface GridFormulaInsertionPlan {
  readonly spill: GridFormulaSpillPlan | null;
  readonly cycles: GridFormulaCycleReport | null;
  /** Named paths of every cycle the edited workbook would contain. */
  readonly cyclePaths: readonly string[];
  readonly blocked: boolean;
  readonly canCommit: boolean;
}

/**
 * Pre-flight for writing a formula into a cell: spill collisions and cycles are planned before the
 * cell store is touched, so a blocked result can never be committed silently.
 */
export function planGridFormulaInsertion(request: GridFormulaInsertionRequest): GridFormulaInsertionPlan {
  const candidate: Record<string, GridCell> = { ...request.cells };
  const origin = request.coord.trim().toUpperCase();
  // The candidate cell must carry the formula even when no evaluated result is available; otherwise
  // a self-referencing formula would look cycle-free and could be committed silently.
  if (origin) {
    candidate[origin] = { ...(candidate[origin] ?? { value: '' }), formula: request.formula };
  }

  const spill = request.result !== undefined && origin
    ? planGridFormulaSpill(origin, request.result, request.cells)
    : null;
  const cycles = origin && request.formula.trim() !== ''
    ? detectGridFormulaCycles(candidate)
    : null;
  const cyclePaths = (cycles?.cycles ?? []).map((cycle) => formatGridFormulaCycle(cycle));
  const blocked = spill !== null && (spill.kind === 'blocked' || spill.kind === 'out-of-bounds' || spill.kind === 'too-large');
  return { spill, cycles, cyclePaths, blocked, canCommit: !blocked && cyclePaths.length === 0 };
}

export interface GridFormulaReferenceMode {
  readonly token: string;
  readonly mode: 'relative' | 'absolute' | 'mixed';
  readonly display: string;
}

/** Absolute/relative state of the reference at the caret. */
export function describeGridFormulaReferenceAt(formula: string, caret: number): GridFormulaReferenceMode | null {
  const bounded = Math.max(0, Math.min(formula.length, caret));
  const referencePattern = /\$?[A-Za-z]{1,3}\$?\d{1,7}/g;
  let match: RegExpExecArray | null;
  while ((match = referencePattern.exec(formula)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (bounded < start || bounded > end) continue;
    const parsed = parseA1ReferenceToken(match[0]);
    if (!parsed) return null;
    const mode = parsed.colAbsolute && parsed.rowAbsolute
      ? 'absolute'
      : parsed.colAbsolute || parsed.rowAbsolute
        ? 'mixed'
        : 'relative';
    return {
      token: parsed.text,
      mode,
      display: formatA1Reference(parsed.colIdx, parsed.rowIdx, parsed.colAbsolute, parsed.rowAbsolute),
    };
  }
  return null;
}

/** Cycles the `$` flags of the reference under the caret using the engine's own reference parser. */
export function toggleGridFormulaReferenceAbsolute(formula: string, caret: number): { formula: string; caret: number } | null {
  const reference = describeGridFormulaReferenceAt(formula, caret);
  if (!reference) return null;
  const parsed = parseA1ReferenceToken(reference.token);
  if (!parsed) return null;
  const nextMode = reference.mode === 'relative' ? 'absolute' : reference.mode === 'absolute' ? 'relative' : 'absolute';
  const toggled = nextMode === 'absolute'
    ? formatA1Reference(parsed.colIdx, parsed.rowIdx, true, true)
    : formatA1Reference(parsed.colIdx, parsed.rowIdx, false, false);
  const at = formula.indexOf(reference.token);
  if (at < 0) return null;
  const next = `${formula.slice(0, at)}${toggled}${formula.slice(at + reference.token.length)}`;
  return { formula: next, caret: at + toggled.length };
}

export interface GridFormulaDateContextView {
  readonly context: GridFormulaTimeContext | null;
  readonly offsetLabel: string | null;
}

/**
 * Date/time context the date functions will use, so the assistant can state zone and locale.
 * `createGridFormulaTimeContext` is fail-closed and returns `null` for unusable input; that is
 * reported instead of silently falling back to the host zone.
 */
export function describeGridFormulaDateContext(
  timeZone: string,
  _locale: string,
  atMs = Date.now(),
): GridFormulaDateContextView {
  const zone = timeZone.trim() || null;
  const context = createGridFormulaTimeContext(atMs, zone, zone ? createIntlZoneOffsetLookup() : undefined);
  return {
    context,
    offsetLabel: context ? gridFormulaOffsetLabel(context.utcOffsetMinutes) : null,
  };
}

export interface GridFormulaScopeView {
  readonly lambda: boolean;
  readonly boundNames: readonly string[];
  /**
   * `false` when the formula binds names through a construct this module cannot parse locally.
   * `LET` is evaluated by the formula core and `formulas/**` contains no LET parser; writing one here
   * would be a second parser. The UI reports "not locally resolvable" instead of claiming that a
   * `LET` formula has no bindings.
   */
  readonly locallyResolvable: boolean;
}

/** LET/LAMBDA binding names present in the formula. Delegates parsing to the lambda engine. */
export function describeGridFormulaScope(formula: string): GridFormulaScopeView {
  const trimmed = formula.trim().replace(/^=/u, '');
  if (/^LET\s*\(/iu.test(trimmed)) {
    return { lambda: true, boundNames: [], locallyResolvable: false };
  }
  const parsed = parseLambda(trimmed);
  const boundNames: string[] = [];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { parameters?: unknown }).parameters)) {
    for (const name of (parsed as { parameters: readonly string[] }).parameters) {
      if (typeof name === 'string' && name.trim() !== '') boundNames.push(name.trim());
    }
  }
  return { lambda: boundNames.length > 0, boundNames, locallyResolvable: true };
}

/** Applies a relative/absolute translation to every reference of a formula (fill handle support). */
export function translateGridFormulaForFill(
  formula: string,
  rowDelta: number,
  columnDelta: number,
): { readonly formula: string; readonly changed: boolean } {
  const translated = translateFormulaReferences(formula, rowDelta, columnDelta);
  return { formula: translated, changed: translated !== formula };
}
