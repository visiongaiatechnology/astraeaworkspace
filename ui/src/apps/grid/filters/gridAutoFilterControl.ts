// STATUS: DIAMANT VGT SUPREME
// Astraea Grid AutoFilter control logic of the **visible** column-header entry — pure: no React, no DOM.
//
// Why this is a separate module from `data/gridAutoFilter.ts`:
// that module is the *value model* (bounded distinct enumeration, checkbox state, rule construction). It has
// no notion of a header, a menu, or the direction back from stored rules to checked boxes. This module is the
// control logic of the entry point that was missing (AST-0391): the inverse direction
// (`rules -> checked boxes`), the search over the option list, and the three actions the menu can perform.
//
// Keeping it free of React is what makes it **drivable in this checkout**: `ui/` has no jsdom, no happy-dom
// and no `@testing-library`, so nothing can dispatch a click. A pure function can be called, and the rendered
// markup can be asserted separately — together those two statements are the strongest evidence available here.

import type { GridCell, GridFilterRule } from '../../../shared/contracts/grid/workspaceGrid';
import {
  buildAutoFilterValues,
  setAutoFilterSelection,
  toAutoFilterRule,
  validateAutoFilterSelection,
  type AutoFilterErrorCode,
  type AutoFilterValue,
  type AutoFilterValueSet,
} from '../data/gridAutoFilter';

/** Stable rule-id stem per column, so a repeated write replaces this column's rules instead of stacking. */
export function autoFilterRuleId(column: string): string {
  return `autofilter-${column.trim().toUpperCase()}`;
}

/** Data rows of a sheet: header row 0 is excluded. Ascending and duplicate free by construction. */
export function autoFilterDataRows(rowCount: number): number[] {
  const rows: number[] = [];
  for (let row = 1; row < rowCount; row += 1) rows.push(row);
  return rows;
}

function sameColumn(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

/**
 * Cheap trigger state: does this column own any rule at all? O(number of rules), no cell scan.
 *
 * This is deliberately separate from `buildAutoFilterMenu`: the value enumeration is O(data rows) and must
 * **not** run on every render of every column header. The header calls this; the menu is built only while it
 * is open.
 */
export function hasAutoFilterRule(rules: readonly GridFilterRule[], column: string): boolean {
  return rules.some((rule) => sameColumn(rule.column, column));
}

/** The state of one column's AutoFilter menu. Mirrors the sheet's rules — it is not a second source of truth. */
export interface AutoFilterMenu {
  readonly column: string;
  readonly valueSet: AutoFilterValueSet;
  /** Values drawn as checked. Derived from the sheet's rules on every rebuild. */
  readonly checked: readonly string[];
  /** Every rule of this column, whatever its operator. */
  readonly ownRuleCount: number;
  /**
   * Rules of this column the checkbox list cannot represent (`contains`, `between`, dates …). While this is
   * greater than zero the checklist shows every box checked although rows are being hidden — the menu must say
   * so instead of pretending, and offer exactly one way out: remove the column's filter.
   */
  readonly foreignRuleCount: number;
  /** True when this column actually reduces the row set, i.e. it owns at least one rule. */
  readonly hasFilter: boolean;
}

export type AutoFilterMenuResult =
  | { readonly ok: true; readonly menu: AutoFilterMenu }
  | { readonly ok: false; readonly code: AutoFilterErrorCode };

export type AutoFilterAction =
  | { readonly ok: true; readonly menu: AutoFilterMenu; readonly rules: readonly GridFilterRule[] }
  | { readonly ok: false; readonly reason: 'selection-would-be-empty' | 'selection-too-large' };

/**
 * Text of a rule's operand.
 *
 * `GridFilterRule.value` is `string | number | undefined` because rules are shared with the Advanced-filter
 * path, which can carry numbers and can carry no operand at all (`empty` / `not-empty`). The AutoFilter
 * checklist compares against the model's **canonical text**, so the operand is normalised exactly the way
 * `autoFilterValueOf` normalises a cell: `String(...)` then `trim()`. A rule without an operand yields the
 * empty string, which no distinct value can equal (blank cells are grouped under the blank label), so such a
 * rule can never be mistaken for a checked box.
 */
function ruleText(rule: GridFilterRule): string {
  return rule.value === undefined ? '' : String(rule.value).trim();
}

/** Operators the checkbox list can express as a selection. Anything else makes the column "foreign filtered". */
function isRepresentableOperator(operator: GridFilterRule['operator']): boolean {
  return operator === 'equals' || operator === 'not-equals';
}

/**
 * Counts this column's rules and, among them, the ones the checklist cannot represent.
 *
 * Every menu state is derived through here — **from the rules**, never from the length of a selection. That
 * distinction is not cosmetic: "every value checked" is stored by the model as *no rule at all*, so a state
 * derived from `selected.length > 0` would claim an active filter for a column that has none.
 */
function ownRuleCounts(
  rules: readonly GridFilterRule[],
  column: string,
): { own: number; foreign: number } {
  const own = rules.filter((rule) => sameColumn(rule.column, column));
  return { own: own.length, foreign: own.filter((rule) => !isRepresentableOperator(rule.operator)).length };
}

/**
 * Inverse of `data/gridAutoFilter.toAutoFilterRule`, and deliberately the exact inverse:
 * no rule for the column means **every** value is checked (Excel semantics), one `equals` means exactly that
 * value, and `not-equals` rules are the unchecked values. Any other operator is counted as foreign.
 */
function checkedValuesFromRules(
  valueSet: AutoFilterValueSet,
  rules: readonly GridFilterRule[],
): { checked: string[]; ownRuleCount: number; foreignRuleCount: number } {
  const all = valueSet.values.map((entry) => entry.value);
  const allowed = new Set(all);
  const own = rules.filter((rule) => sameColumn(rule.column, valueSet.column));
  const counts = ownRuleCounts(rules, valueSet.column);
  const equals = own
    .filter((rule) => rule.operator === 'equals')
    .map(ruleText)
    .filter((value) => allowed.has(value));
  const negatives = own.filter((rule) => rule.operator === 'not-equals');

  if (equals.length > 0) {
    return { checked: [...new Set(equals)], ownRuleCount: counts.own, foreignRuleCount: counts.foreign };
  }
  const excluded = new Set(negatives.map(ruleText));
  return { checked: all.filter((value) => !excluded.has(value)), ownRuleCount: counts.own, foreignRuleCount: counts.foreign };
}

/**
 * Builds the menu state for one column from the sheet's cells and its current filter rules. The value
 * enumeration is entirely the model's job; this function adds only the direction the model does not have.
 */
export function buildAutoFilterMenu(input: {
  readonly cells: Readonly<Record<string, GridCell>>;
  readonly rowCount: number;
  readonly column: string;
  readonly rules: readonly GridFilterRule[];
  readonly blankLabel: string;
}): AutoFilterMenuResult {
  const built = buildAutoFilterValues({
    cells: input.cells,
    dataRowIndices: autoFilterDataRows(input.rowCount),
    column: input.column,
    blankLabel: input.blankLabel,
  });
  if (!built.ok) return built;
  const resolved = checkedValuesFromRules(built.value, input.rules);
  return {
    ok: true,
    menu: {
      column: built.value.column,
      valueSet: { ...built.value, selected: resolved.checked },
      checked: resolved.checked,
      ownRuleCount: resolved.ownRuleCount,
      foreignRuleCount: resolved.foreignRuleCount,
      hasFilter: resolved.ownRuleCount > 0,
    },
  };
}

/** Writes a selection through the model and returns the new rules for the whole sheet. */
function commitSelection(menu: AutoFilterMenu, checked: readonly string[], rules: readonly GridFilterRule[]): AutoFilterAction {
  const validated = validateAutoFilterSelection(checked);
  if (!validated.ok) return { ok: false, reason: 'selection-too-large' };
  const valueSet = setAutoFilterSelection(menu.valueSet, validated.value);
  const nextRules = toAutoFilterRule(autoFilterRuleId(menu.column), valueSet, rules);
  // The counts come from the rules that will actually be stored, not from the selection length: checking
  // every value stores **no rule**, and deriving from the selection would then report a filter that is not there.
  const counts = ownRuleCounts(nextRules, menu.column);
  return {
    ok: true,
    menu: {
      ...menu,
      valueSet,
      checked: valueSet.selected,
      ownRuleCount: counts.own,
      foreignRuleCount: counts.foreign,
      hasFilter: counts.own > 0,
    },
    rules: nextRules,
  };
}

/**
 * One checkbox click.
 *
 * Refused when it would empty the selection, and the refusal is reported rather than hidden: the model
 * encodes "nothing checked" as "no filter", so silently emptying the list would *remove* the column's filter
 * while the user believes they just hid every row. Hiding every row is not representable — this says so.
 */
export function toggleAutoFilterOptionAction(
  menu: AutoFilterMenu,
  value: string,
  rules: readonly GridFilterRule[],
): AutoFilterAction {
  const checked = menu.checked.includes(value)
    ? menu.checked.filter((entry) => entry !== value)
    : [...menu.checked, value];
  if (checked.length === 0) return { ok: false, reason: 'selection-would-be-empty' };
  return commitSelection(menu, checked, rules);
}

/** "Select all": checks every distinct value, which the model stores as "no rule for this column". */
export function selectAllAutoFilterOptionsAction(menu: AutoFilterMenu, rules: readonly GridFilterRule[]): AutoFilterAction {
  return commitSelection(menu, menu.valueSet.values.map((entry) => entry.value), rules);
}

/**
 * Removes every rule of this column, whatever its operator.
 *
 * This is *not* a duplicate of "select all": the Data panel can write operators the checklist cannot express
 * (`contains`, `between`, dates). For those there is no selection that encodes them, so the only honest
 * action is to drop the column's rules outright. It also restores the exact original row set and order.
 */
export function resetAutoFilterColumnAction(menu: AutoFilterMenu, rules: readonly GridFilterRule[]): AutoFilterAction {
  const empty: AutoFilterValueSet = { ...menu.valueSet, selected: [] };
  return {
    ok: true,
    menu: {
      ...menu,
      valueSet: empty,
      checked: menu.valueSet.values.map((entry) => entry.value),
      ownRuleCount: 0,
      foreignRuleCount: 0,
      hasFilter: false,
    },
    rules: toAutoFilterRule(autoFilterRuleId(menu.column), empty, rules),
  };
}

/** Bounded search over the (already bounded) option list. `hidden` is reported so nothing disappears silently. */
export function searchAutoFilterOptions(
  menu: AutoFilterMenu,
  query: string,
): { readonly shown: readonly AutoFilterValue[]; readonly hidden: number } {
  const needle = query.trim().toLowerCase();
  if (needle === '') return { shown: menu.valueSet.values, hidden: 0 };
  const shown = menu.valueSet.values.filter((entry) => entry.value.toLowerCase().includes(needle));
  return { shown, hidden: menu.valueSet.values.length - shown.length };
}

/** The option row's accessible name: label plus its row count, so duplicates are distinguishable. */
export function autoFilterOptionLabel(entry: AutoFilterValue): string {
  return `${entry.label} (${entry.count})`;
}
