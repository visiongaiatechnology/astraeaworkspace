// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded Data-Validation input trust boundary.
//
// Validation rules and their dropdown sources are user input. Everything that
// reaches the evaluation engine is length-bounded, count-bounded and
// structurally checked here first, so a malformed rule fails closed with a
// concrete reason instead of reaching the cell pipeline.

import type {
  GridCell,
  GridDataValidationRule,
  GridValidationKind,
} from '../../../shared/contracts/grid/workspaceGrid';
import { resolveValidationListOptions as resolveCanonicalListOptions } from '../validation/gridValidation';
import type { GridValidationContext } from '../validation/gridValidation';

/** Hard bound on list options accepted from one rule. */
export const MAX_VALIDATION_LIST_OPTIONS = 512;
/** Hard bound on a single accepted option. */
export const MAX_VALIDATION_OPTION_LENGTH = 256;
/** Hard bound on a validation message shown to the user. */
export const MAX_VALIDATION_MESSAGE_LENGTH = 512;
/** Hard bound on a custom validation formula. */
export const MAX_VALIDATION_FORMULA_LENGTH = 1_024;
/** Hard bound on the addressed validation range in cells. */
export const MAX_VALIDATION_RANGE_CELLS = 100_000;
/** Hard bound on a list source token (range, table[column] or name). */
export const MAX_VALIDATION_SOURCE_LENGTH = 256;
/** Bound on rendered dropdown rows; the rest is reachable by typing. */
export const MAX_DROPDOWN_VISIBLE_OPTIONS = 40;

export const GRID_VALIDATION_KINDS: readonly GridValidationKind[] = [
  'number',
  'whole-number',
  'decimal',
  'list',
  'text-length',
  'date',
  'time',
  'custom',
];

export type ValidationRuleErrorCode =
  | 'validation_unknown_kind'
  | 'validation_range_missing'
  | 'validation_range_too_large'
  | 'validation_range_invalid'
  | 'validation_bounds_not_finite'
  | 'validation_bounds_inverted'
  | 'validation_list_too_large'
  | 'validation_option_too_long'
  | 'validation_option_empty'
  | 'validation_list_source_empty'
  | 'validation_list_source_too_long'
  | 'validation_formula_too_long'
  | 'validation_formula_missing'
  | 'validation_message_too_long';

export interface ValidationRuleIssue {
  readonly code: ValidationRuleErrorCode;
  readonly detail: string;
}

export interface SanitizedValidationRule {
  readonly rule: GridDataValidationRule;
  readonly options: readonly string[];
  readonly issues: readonly ValidationRuleIssue[];
  /** True when the accepted rule differs from the input (bounded, not rejected). */
  readonly bounded: boolean;
}

export type ValidationRuleDecision =
  | { readonly ok: true; readonly accepted: SanitizedValidationRule }
  | { readonly ok: false; readonly issues: readonly ValidationRuleIssue[] };

/** Column letters only; `A1:D50` style ranges only. */
const RANGE_RE = /^\$?[A-Z]{1,4}\$?[1-9]\d*(?::\$?[A-Z]{1,4}\$?[1-9]\d*)?$/;
const TABLE_COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}\[[^\]\r\n]{1,128}\]$/;
const NAME_RE = /^[A-Za-z_\\][A-Za-z0-9_.\\]{0,63}$/;

function rangeCellCount(range: string): number | null {
  const match = range.toUpperCase().match(/^\$?([A-Z]{1,4})\$?(\d+)(?::\$?([A-Z]{1,4})\$?(\d+))?$/);
  if (!match) return null;
  const columnOf = (letters: string): number => {
    let value = 0;
    for (const char of letters) value = value * 26 + char.charCodeAt(0) - 64;
    return value;
  };
  const startCol = columnOf(match[1]);
  const startRow = Number(match[2]);
  const endCol = match[3] ? columnOf(match[3]) : startCol;
  const endRow = match[4] ? Number(match[4]) : startRow;
  if (!Number.isFinite(startRow) || !Number.isFinite(endRow)) return null;
  if (endCol < startCol || endRow < startRow) return null;
  return (endRow - startRow + 1) * (endCol - startCol + 1);
}

/**
 * Decides whether a user-authored rule may enter the engine. Fail-closed: any
 * structural problem returns `ok: false` and the caller must not apply it.
 */
export function decideValidationRule(rule: GridDataValidationRule): ValidationRuleDecision {
  const issues: ValidationRuleIssue[] = [];
  const bounded: boolean[] = [];

  if (!GRID_VALIDATION_KINDS.includes(rule.kind)) {
    issues.push({ code: 'validation_unknown_kind', detail: String(rule.kind) });
  }

  const range = (rule.range ?? '').trim().toUpperCase();
  if (!range) {
    issues.push({ code: 'validation_range_missing', detail: rule.id });
  } else if (!RANGE_RE.test(range)) {
    issues.push({ code: 'validation_range_invalid', detail: range.slice(0, 64) });
  } else {
    const cells = rangeCellCount(range);
    if (cells === null || cells <= 0) {
      issues.push({ code: 'validation_range_invalid', detail: range });
    } else if (cells > MAX_VALIDATION_RANGE_CELLS) {
      issues.push({ code: 'validation_range_too_large', detail: `${cells} > ${MAX_VALIDATION_RANGE_CELLS}` });
    }
  }

  for (const bound of [rule.min, rule.max]) {
    if (bound === undefined) continue;
    if (!Number.isFinite(bound)) {
      issues.push({ code: 'validation_bounds_not_finite', detail: String(bound) });
    }
  }
  if (rule.min !== undefined && rule.max !== undefined && Number.isFinite(rule.min) && Number.isFinite(rule.max) && rule.min > rule.max) {
    issues.push({ code: 'validation_bounds_inverted', detail: `${rule.min} > ${rule.max}` });
  }

  const rawOptions = rule.options ?? [];
  if (rawOptions.length > MAX_VALIDATION_LIST_OPTIONS) {
    issues.push({ code: 'validation_list_too_large', detail: `${rawOptions.length} > ${MAX_VALIDATION_LIST_OPTIONS}` });
  }
  const options: string[] = [];
  for (const raw of rawOptions.slice(0, MAX_VALIDATION_LIST_OPTIONS)) {
    if (typeof raw !== 'string') {
      issues.push({ code: 'validation_option_empty', detail: typeof raw });
      continue;
    }
    if (raw.length > MAX_VALIDATION_OPTION_LENGTH) {
      issues.push({ code: 'validation_option_too_long', detail: `length ${raw.length}` });
      bounded.push(true);
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!options.includes(trimmed)) options.push(trimmed);
  }

  const listSource = rule.listSource?.trim() ?? '';
  if (rule.kind === 'list' && listSource) {
    if (listSource.length > MAX_VALIDATION_SOURCE_LENGTH) {
      issues.push({ code: 'validation_list_source_too_long', detail: `length ${listSource.length}` });
    } else {
      const normalized = listSource.replace(/^=/, '');
      const indirect = /^INDIRECT\(\s*\$?[A-Za-z]+\$?[1-9]\d*\s*\)$/i.test(normalized);
      if (!indirect && !RANGE_RE.test(normalized) && !TABLE_COLUMN_RE.test(normalized) && !NAME_RE.test(normalized)) {
        issues.push({ code: 'validation_list_source_empty', detail: normalized.slice(0, 64) });
      }
    }
  }

  const formula = rule.formula?.trim() ?? '';
  if (rule.kind === 'custom') {
    if (!formula) issues.push({ code: 'validation_formula_missing', detail: rule.id });
    else if (formula.length > MAX_VALIDATION_FORMULA_LENGTH) issues.push({ code: 'validation_formula_too_long', detail: `length ${formula.length}` });
    else if (!/^=/.test(formula) || !/^=\s*[A-Za-z_(]/.test(formula)) {
      issues.push({ code: 'validation_formula_missing', detail: 'formula must start with "=" and a function or reference' });
    }
  } else if (formula.length > MAX_VALIDATION_FORMULA_LENGTH) {
    issues.push({ code: 'validation_formula_too_long', detail: `length ${formula.length}` });
  }

  for (const message of [rule.errorMessage, rule.inputMessage]) {
    if (message !== undefined && message.length > MAX_VALIDATION_MESSAGE_LENGTH) {
      issues.push({ code: 'validation_message_too_long', detail: `length ${message.length}` });
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  const accepted: GridDataValidationRule = {
    ...rule,
    range,
    options: options.length > 0 ? options : undefined,
    listSource: listSource || undefined,
    formula: formula || undefined,
    errorMessage: rule.errorMessage?.slice(0, MAX_VALIDATION_MESSAGE_LENGTH),
    inputMessage: rule.inputMessage?.slice(0, MAX_VALIDATION_MESSAGE_LENGTH),
  };

  return {
    ok: true,
    accepted: {
      rule: accepted,
      options,
      issues: [],
      bounded: bounded.length > 0 || rawOptions.length > options.length,
    },
  };
}

export interface DropdownState {
  readonly open: boolean;
  /** Index into the filtered option list, or -1 when nothing is highlighted. */
  readonly activeIndex: number;
  readonly query: string;
}

export type DropdownKey =
  | 'ArrowDown'
  | 'ArrowUp'
  | 'Home'
  | 'End'
  | 'Enter'
  | 'Escape'
  | 'Tab'
  | 'Alt+ArrowDown';

export interface DropdownKeyResult {
  readonly state: DropdownState;
  /** Option committed by Enter; the caller writes exactly this value. */
  readonly commit?: string;
  readonly handled: boolean;
}

export interface DropdownModel {
  readonly options: readonly string[];
  readonly state: DropdownState;
  readonly visibleOptions: readonly string[];
  /** Bounded, ready-to-render rows. */
  readonly rows: readonly { readonly index: number; readonly value: string; readonly label: string; readonly selected: boolean }[];
  /** Index in `visibleOptions` of the option that is both visible and highlighted. */
  readonly activeVisibleIndex: number;
}

function filterOptions(options: readonly string[], query: string): string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...options];
  return options.filter((option) => option.toLocaleLowerCase().includes(needle));
}

export function buildDropdownModel(options: readonly string[], state: DropdownState, currentValue: string): DropdownModel {
  const visible = filterOptions(options, state.query);
  const activeVisibleIndex = visible.length === 0
    ? -1
    : Math.min(Math.max(state.activeIndex, 0), visible.length - 1);
  const rows = visible.slice(0, MAX_DROPDOWN_VISIBLE_OPTIONS).map((value, index) => ({
    index,
    value,
    label: value.length > MAX_VALIDATION_OPTION_LENGTH ? `${value.slice(0, MAX_VALIDATION_OPTION_LENGTH - 1)}\u2026` : value,
    selected: value === currentValue,
  }));
  return { options, state, visibleOptions: visible, rows, activeVisibleIndex };
}

/**
 * Keyboard contract of the validation dropdown. Every state transition is a
 * pure function of the previous state, so the control is fully operable without
 * a pointer. `Escape` closes and never commits; `Enter` commits the highlighted
 * option (or the typed text when nothing is highlighted).
 */
export function applyDropdownKey(
  options: readonly string[],
  state: DropdownState,
  key: DropdownKey,
  typedValue: string,
): DropdownKeyResult {
  const visible = filterOptions(options, state.query);
  const lastIndex = visible.length - 1;

  switch (key) {
    case 'Alt+ArrowDown':
      return { state: { ...state, open: true, activeIndex: visible.length > 0 ? 0 : -1 }, handled: true };
    case 'ArrowDown': {
      if (!state.open) return { state: { ...state, open: true, activeIndex: lastIndex >= 0 ? 0 : -1 }, handled: true };
      if (lastIndex < 0) return { state: { ...state, activeIndex: -1 }, handled: true };
      return { state: { ...state, activeIndex: state.activeIndex >= lastIndex ? 0 : state.activeIndex + 1 }, handled: true };
    }
    case 'ArrowUp': {
      if (!state.open) return { state: { ...state, open: true, activeIndex: lastIndex }, handled: true };
      if (lastIndex < 0) return { state: { ...state, activeIndex: -1 }, handled: true };
      return { state: { ...state, activeIndex: state.activeIndex <= 0 ? lastIndex : state.activeIndex - 1 }, handled: true };
    }
    case 'Home':
      return { state: { ...state, open: true, activeIndex: lastIndex >= 0 ? 0 : -1 }, handled: true };
    case 'End':
      return { state: { ...state, open: true, activeIndex: lastIndex }, handled: true };
    case 'Enter': {
      const highlighted = state.activeIndex >= 0 && state.activeIndex <= lastIndex ? visible[state.activeIndex] : undefined;
      if (!highlighted) {
        return { state: { ...state, open: false }, handled: true, commit: typedValue.trim() || undefined };
      }
      return { state: { open: false, activeIndex: state.activeIndex, query: '' }, handled: true, commit: highlighted };
    }
    case 'Tab':
      return { state: { ...state, open: false }, handled: false };
    case 'Escape':
      return { state: { ...state, open: false, activeIndex: -1 }, handled: true };
    default:
      return { state, handled: false };
  }
}

export interface ValidationListDecision {
  readonly options: readonly string[];
  readonly hitLimit: boolean;
}

/**
 * Bounded list resolution: the canonical engine result is capped and
 * de-duplicated here, and `hitLimit` tells the UI that the source was cut so it
 * can say so instead of pretending the list is complete.
 */
export function decideValidationListOptions(
  rule: GridDataValidationRule,
  cells: Readonly<Record<string, GridCell>>,
  context: GridValidationContext = {},
  coord?: string,
): ValidationListDecision {
  if (rule.kind !== 'list') return { options: [], hitLimit: false };
  const resolved = resolveCanonicalListOptions(rule, cells, context, coord);
  const bounded: string[] = [];
  for (const option of resolved) {
    const trimmed = option.trim();
    if (!trimmed || trimmed.length > MAX_VALIDATION_OPTION_LENGTH) continue;
    if (bounded.includes(trimmed)) continue;
    if (bounded.length >= MAX_VALIDATION_LIST_OPTIONS) break;
    bounded.push(trimmed);
  }
  return { options: bounded, hitLimit: resolved.length > bounded.length };
}
