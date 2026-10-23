// STATUS: DIAMANT VGT SUPREME
// Astraea Grid formatting validation leaf.
//
// Every value that reaches the Grid from a dialog is user input: number-format codes,
// colours, borders, and conditional-format rules. This module holds the single bounded,
// fail-closed decision for each of them so no surface has to re-implement a guard.

import type { GridCell, GridConditionalFormattingRule } from '../../../shared/contracts/workspace';
import { parseGridRange } from '../ranges/gridRange';
import { checkGridNumberFormatCode, type GridNumberFormatCodeError } from './gridNumberFormat';

/** Bounds for user input coming out of the formatting dialogs. */
export const GRID_FORMAT_MAX_RANGE_LENGTH = 128;
export const GRID_FORMAT_MAX_RULE_VALUE_LENGTH = 64;
export const GRID_FORMAT_MAX_RULE_FORMULA_LENGTH = 256;
export const GRID_FORMAT_MAX_CONDITIONAL_RULES = 64;
export const GRID_FORMAT_MAX_PREVIEW_CELLS = 8;

export type GridFormatIssueCode =
  | 'invalid-range'
  | 'range-too-long'
  | 'invalid-value'
  | 'value-too-long'
  | 'invalid-formula'
  | 'formula-too-long'
  | 'invalid-operator'
  | 'invalid-rank'
  | 'invalid-colour'
  | 'invalid-border'
  | 'rule-limit-reached'
  | 'invalid-number-format'
  | 'duplicate-rule';

export interface GridFormatIssue {
  readonly code: GridFormatIssueCode;
  /** Short machine token, e.g. `code-too-long`. */
  readonly detail?: string;
  /** Human-readable, shown in the dialog. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Colour and border: the only two free-text style values that reach the renderer.
// ---------------------------------------------------------------------------

const COLOUR_NAMES = new Set([
  'transparent', 'currentcolor', 'inherit', 'black', 'silver', 'gray', 'grey', 'white', 'maroon', 'red',
  'purple', 'fuchsia', 'green', 'lime', 'olive', 'yellow', 'navy', 'blue', 'teal', 'aqua', 'orange',
]);

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL_COLOUR = /^(rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/deg-]*\)$/i;

/**
 * Normalizes a colour to a value that is safe to write into an inline style or a Canvas2D
 * `fillStyle`. Returns `null` for anything else, so callers stay fail-closed instead of
 * injecting arbitrary CSS text.
 */
export function normalizeGridColour(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 64) return null;
  if (COLOUR_NAMES.has(value)) return value;
  if (HEX_COLOUR.test(value)) return value;
  if (FUNCTIONAL_COLOUR.test(value) && !value.includes('url') && !value.includes(';')) return value;
  return null;
}

export function checkGridColour(raw: string, field: string): GridFormatIssue | null {
  return normalizeGridColour(raw) === null
    ? { code: 'invalid-colour', detail: field, message: `${field} must be a hex, rgb(...) or hsl(...) colour.` }
    : null;
}

const GRID_BORDERS: readonly NonNullable<GridCell['border']>[] = [
  'none', 'all', 'outline', 'top', 'bottom', 'left', 'right', 'double-bottom',
];

export function isGridBorder(value: string): value is NonNullable<GridCell['border']> {
  return (GRID_BORDERS as readonly string[]).includes(value);
}

export function checkGridBorder(value: string): GridFormatIssue | null {
  return isGridBorder(value)
    ? null
    : { code: 'invalid-border', detail: value, message: `Unknown border style: ${value}.` };
}

export interface GridBorderSides {
  readonly top: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

const NO_BORDER_SIDES: GridBorderSides = { top: false, bottom: false, left: false, right: false };

/**
 * Pure decision which sides of one cell carry a drawn border.
 *
 * `outline` only draws on the edge of the given range, which is what makes "select A1:B8 and
 * change the border" produce one frame instead of a grid of frames.
 */
export function resolveGridBorderSides(border: GridCell['border'], coord: string, range?: string): GridBorderSides {
  if (!border || border === 'none') return NO_BORDER_SIDES;
  if (border === 'all') return { top: true, bottom: true, left: true, right: true };
  if (border === 'top') return { ...NO_BORDER_SIDES, top: true };
  if (border === 'bottom' || border === 'double-bottom') return { ...NO_BORDER_SIDES, bottom: true };
  if (border === 'left') return { ...NO_BORDER_SIDES, left: true };
  if (border === 'right') return { ...NO_BORDER_SIDES, right: true };
  // `outline`
  const bounds = range ? parseGridRange(range) : null;
  if (!bounds) return { top: true, bottom: true, left: true, right: true };
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(coord.trim());
  if (!match) return { top: true, bottom: true, left: true, right: true };
  const column = match[1].toUpperCase().split('').reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
  const row = Number.parseInt(match[2], 10) - 1;
  return {
    top: row === bounds.startRow,
    bottom: row === bounds.endRow,
    left: column === bounds.startCol,
    right: column === bounds.endCol,
  };
}

/** The subset of a CSS style declaration React needs to draw a cell border. */
export interface GridBorderStyleProperties {
  readonly border?: string;
  readonly borderTop?: string;
  readonly borderBottom?: string;
  readonly borderLeft?: string;
  readonly borderRight?: string;
}

/**
 * React style fragment for one cell border. `all` collapses into the shorthand so the
 * inline style stays compact; the other styles set only the sides that are drawn.
 */
export function gridBorderStyleProperties(
  border: GridCell['border'],
  coord: string,
  range: string | undefined,
  colour: string,
): GridBorderStyleProperties {
  if (!border || border === 'none') return {};
  const side = border === 'double-bottom' ? '3px double' : '1px solid';
  const value = `${side} ${colour}`;
  if (border === 'all') return { border: value };
  const sides = resolveGridBorderSides(border, coord, range);
  return {
    ...(sides.top ? { borderTop: value } : {}),
    ...(sides.bottom ? { borderBottom: value } : {}),
    ...(sides.left ? { borderLeft: value } : {}),
    ...(sides.right ? { borderRight: value } : {}),
  };
}

// ---------------------------------------------------------------------------
// Conditional-format rules.
// ---------------------------------------------------------------------------

/**
 * Formula grammar actually supported by `gridFormattingEngine#simpleFormulaMatches`, which
 * evaluates `VALUE` or a cell reference on the left and a cell reference, `VALUE`, a
 * quoted string or a number on the right. Exported so the validator and the evaluator can
 * never drift apart: an accepted formula is by construction one the engine can evaluate.
 */
export const GRID_CONDITIONAL_FORMULA_PATTERN = /^=?(?:[A-Z]+[1-9]\d*|VALUE)\s*(?:=|<>|>=|<=|>|<)\s*(?:(?:[A-Z]+[1-9]\d*|VALUE)|"(?:[^"]|"")*"|-?\d+(?:\.\d+)?)$/i;

/**
 * The evaluator's own subject. A non-global pattern keeps `lastIndex` out of the picture,
 * so validating and evaluating the same formula cannot interfere.
 */
const CONDITIONAL_FORMULA_SUBJECT_PATTERN = /^([A-Z]+[1-9]\d*|VALUE)\s*(=|<>|>=|<=|>|<)\s*((?:[A-Z]+[1-9]\d*|VALUE)|"(?:[^"]|"")*"|-?\d+(?:\.\d+)?)$/i;

export interface GridConditionalFormulaSubject {
  readonly left: string;
  readonly operator: '=' | '<>' | '>=' | '<=' | '>' | '<';
  readonly right: string;
}

/**
 * Parses a conditional-format formula into its subject. This is the *only* place the
 * supported grammar is defined: `gridFormattingEngine#simpleFormulaMatches` evaluates the
 * result of this function, so an accepted rule is always an evaluable rule.
 */
export function parseGridConditionalFormula(formula: string | undefined): GridConditionalFormulaSubject | null {
  if (!formula) return null;
  const match = CONDITIONAL_FORMULA_SUBJECT_PATTERN.exec(formula.trim().replace(/^=/, ''));
  if (!match) return null;
  return { left: match[1].toUpperCase(), operator: match[2] as GridConditionalFormulaSubject['operator'], right: match[3] };
}

/** True when `parseGridConditionalFormula` can read the formula. */
export function matchesGridConditionalFormula(formula: string): boolean {
  return parseGridConditionalFormula(formula) !== null;
}

export function checkGridConditionalRange(range: string): GridFormatIssue | null {
  const trimmed = range.trim();
  if (trimmed.length === 0) return { code: 'invalid-range', message: 'A conditional-format rule needs a range.' };
  if (trimmed.length > GRID_FORMAT_MAX_RANGE_LENGTH) {
    return { code: 'range-too-long', detail: String(trimmed.length), message: `The range may hold at most ${GRID_FORMAT_MAX_RANGE_LENGTH} characters.` };
  }
  if (!parseGridRange(trimmed)) return { code: 'invalid-range', message: `"${trimmed}" is not a valid A1 range such as A1:B8.` };
  return null;
}

export interface GridConditionalDraftCheck {
  readonly ok: boolean;
  readonly issues: readonly GridFormatIssue[];
  /** The rule as it would be stored. Present only when `ok` is true. */
  readonly rule?: GridConditionalFormattingRule;
}

export interface GridConditionalDraft {
  readonly id: string;
  readonly range: string;
  readonly kind: NonNullable<GridConditionalFormattingRule['kind']>;
  readonly operator: NonNullable<GridConditionalFormattingRule['operator']>;
  readonly value: string;
  readonly value2: string;
  readonly formula: string;
  readonly priority: number;
  readonly iconSet?: NonNullable<GridConditionalFormattingRule['iconSet']>;
  readonly rankCount?: number;
  readonly rankPercent?: boolean;
  readonly datePeriod?: GridConditionalFormattingRule['datePeriod'];
  readonly background?: string;
  readonly textColor?: string;
  readonly minColor?: string;
  readonly midColor?: string;
  readonly maxColor?: string;
  readonly dataBarColor?: string;
  readonly stopIfTrue?: boolean;
}

const CONDITIONAL_KINDS: readonly NonNullable<GridConditionalFormattingRule['kind']>[] = [
  'cell', 'formula', 'color-scale', 'data-bar', 'icon-set', 'duplicate', 'unique', 'top', 'bottom', 'date',
];
const CONDITIONAL_OPERATORS: readonly NonNullable<GridConditionalFormattingRule['operator']>[] = [
  'greater-than', 'less-than', 'equals', 'not-equals', 'contains', 'between',
];
const ICON_SETS: readonly NonNullable<GridConditionalFormattingRule['iconSet']>[] = ['arrows', 'traffic-lights', 'ratings'];

function toRuleValue(raw: string): string | number {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

/**
 * Validates a conditional-format draft before it is stored. Rejecting an unreadable rule
 * visibly is the difference between "the rule does nothing" and "the rule cannot be saved".
 */
export function checkGridConditionalDraft(draft: GridConditionalDraft, existingRules: readonly GridConditionalFormattingRule[] = []): GridConditionalDraftCheck {
  const issues: GridFormatIssue[] = [];
  const rangeIssue = checkGridConditionalRange(draft.range);
  if (rangeIssue) issues.push(rangeIssue);

  if (!CONDITIONAL_KINDS.includes(draft.kind)) {
    issues.push({ code: 'invalid-operator', detail: 'kind', message: `Unknown rule type: ${String(draft.kind)}.` });
  }
  if (draft.kind === 'cell' && !CONDITIONAL_OPERATORS.includes(draft.operator)) {
    issues.push({ code: 'invalid-operator', detail: 'operator', message: `Unknown operator: ${String(draft.operator)}.` });
  }

  if (draft.value.length > GRID_FORMAT_MAX_RULE_VALUE_LENGTH) {
    issues.push({ code: 'value-too-long', message: `A rule value may hold at most ${GRID_FORMAT_MAX_RULE_VALUE_LENGTH} characters.` });
  }
  if (draft.value2.length > GRID_FORMAT_MAX_RULE_VALUE_LENGTH) {
    issues.push({ code: 'value-too-long', detail: 'value2', message: `A rule value may hold at most ${GRID_FORMAT_MAX_RULE_VALUE_LENGTH} characters.` });
  }
  if (draft.formula.length > GRID_FORMAT_MAX_RULE_FORMULA_LENGTH) {
    issues.push({ code: 'formula-too-long', message: `A rule formula may hold at most ${GRID_FORMAT_MAX_RULE_FORMULA_LENGTH} characters.` });
  }

  if (draft.kind === 'cell' && draft.value.trim() === '') {
    issues.push({ code: 'invalid-value', message: 'This rule needs a comparison value.' });
  }
  if (draft.kind === 'cell') {
    const numericOperators: readonly string[] = ['greater-than', 'less-than', 'between'];
    if (numericOperators.includes(draft.operator)) {
      if (!Number.isFinite(Number(draft.value))) issues.push({ code: 'invalid-value', message: 'This operator needs a number.' });
      if (draft.operator === 'between' && !Number.isFinite(Number(draft.value2))) {
        issues.push({ code: 'invalid-value', detail: 'between-high', message: 'This operator needs a second number.' });
      }
    }
  }

  if (draft.kind === 'formula') {
    const trimmed = draft.formula.trim();
    if (trimmed === '') issues.push({ code: 'invalid-formula', message: 'A formula rule needs a formula.' });
    else if (!matchesGridConditionalFormula(trimmed)) {
      issues.push({
        code: 'invalid-formula',
        message: 'Supported formula form: =VALUE>10, =A1<>"x" or =B2<=VALUE.',
      });
    }
  }

  if (draft.kind === 'top' || draft.kind === 'bottom') {
    const rank = draft.rankCount ?? 10;
    const maximum = draft.rankPercent ? 100 : 1_000;
    if (!Number.isInteger(rank) || rank < 1 || rank > maximum) {
      issues.push({ code: 'invalid-rank', message: `Rank must be a whole number between 1 and ${maximum}.` });
    }
  }

  if (draft.kind === 'icon-set' && draft.iconSet !== undefined && !ICON_SETS.includes(draft.iconSet)) {
    issues.push({ code: 'invalid-operator', detail: 'iconSet', message: `Unknown icon set: ${draft.iconSet}.` });
  }

  for (const [field, value] of Object.entries({
    background: draft.background, textColor: draft.textColor, minColor: draft.minColor,
    midColor: draft.midColor, maxColor: draft.maxColor, dataBarColor: draft.dataBarColor,
  })) {
    if (value === undefined) continue;
    const colourIssue = checkGridColour(value, field);
    if (colourIssue) issues.push(colourIssue);
  }

  if ((existingRules ?? []).some((rule) => rule.id === draft.id)) {
    issues.push({ code: 'duplicate-rule', detail: draft.id, message: 'A rule with this id already exists.' });
  }

  if (issues.length > 0) return { ok: false, issues };

  const parsedValue = toRuleValue(draft.value);
  const parsedValue2 = toRuleValue(draft.value2);
  const rule: GridConditionalFormattingRule = {
    id: draft.id,
    range: draft.range.trim().toUpperCase(),
    kind: draft.kind,
    // The operator only carries meaning for a cell-value rule, so it is not persisted
    // for the other kinds instead of storing a value that is never read.
    operator: draft.kind === 'cell' ? draft.operator : undefined,
    value: parsedValue,
    value2: parsedValue2,
    formula: draft.kind === 'formula' ? draft.formula.trim() : undefined,
    priority: draft.priority,
    stopIfTrue: draft.stopIfTrue ?? false,
    background: draft.background,
    textColor: draft.textColor,
    minColor: draft.minColor,
    midColor: draft.midColor,
    maxColor: draft.maxColor,
    dataBarColor: draft.dataBarColor,
    iconSet: draft.iconSet,
    rankCount: draft.rankCount,
    rankPercent: draft.rankPercent,
    datePeriod: draft.datePeriod,
  };
  return { ok: true, issues: [], rule };
}

/** Counts how many further rules the sheet accepts. */
export function gridConditionalRuleCapacity(rules: readonly GridConditionalFormattingRule[]): number {
  return Math.max(0, GRID_FORMAT_MAX_CONDITIONAL_RULES - rules.length);
}

export function checkGridConditionalCapacity(rules: readonly GridConditionalFormattingRule[]): GridFormatIssue | null {
  return rules.length >= GRID_FORMAT_MAX_CONDITIONAL_RULES
    ? {
        code: 'rule-limit-reached',
        message: `This sheet already holds the maximum of ${GRID_FORMAT_MAX_CONDITIONAL_RULES} conditional-format rules.`,
      }
    : null;
}

/** Formats a number-format-code error for the dialog. */
export function describeGridNumberFormatCodeError(error: GridNumberFormatCodeError | undefined): string {
  switch (error) {
    case 'empty':
      return 'Enter a number format code, for example #,##0.00.';
    case 'code-too-long':
      return 'A number format code may hold at most 255 characters.';
    case 'too-many-sections':
      return 'A number format code may hold at most four sections (positive;negative;zero;text).';
    case 'unterminated-quote':
      return 'A quoted literal is missing its closing quote.';
    case undefined:
      return '';
    default: {
      const exhaustive: never = error;
      return String(exhaustive);
    }
  }
}

/** Fail-closed check used by the panel before it stores a user-entered code. */
export function checkGridNumberFormatInput(rawCode: string): { readonly ok: boolean; readonly code: string; readonly message: string } {
  const check = checkGridNumberFormatCode(rawCode);
  return { ok: check.valid, code: check.code, message: describeGridNumberFormatCodeError(check.error) };
}
