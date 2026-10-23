// STATUS: DIAMANT VGT SUPREME
// Astraea Grid number-format leaf: the single canonical definition of the standard
// number-format presets and of what a *valid* user-supplied number-format code is.
//
// Rendering itself lives in exactly one place (`compat/gridUtils.ts#formatCellValue`),
// because the Writer app reads Grid cells through that same function
// (`apps/writer/integrations/grid/writerGridCellText.ts`). A second renderer would be a
// second definition of the same fact, so this module deliberately never formats values.

import type { GridCell } from '../../../shared/contracts/workspace';

/** Canonical identifier of a standard number format offered in the visible surface. */
export type GridNumberFormatId =
  | 'general'
  | 'number'
  | 'currency'
  | 'accounting'
  | 'date'
  | 'time'
  | 'percent'
  | 'fraction'
  | 'scientific'
  | 'text';

export interface GridNumberFormatPreset {
  readonly id: GridNumberFormatId;
  /** Visible label. Kept stable: the panel and the toolbar render the same list. */
  readonly label: string;
  /** Semantic cell type. `undefined` clears the semantic type (General). */
  readonly format: GridCell['format'] | undefined;
  /** Format code persisted in `GridCell.numberFormatCode`. `undefined` clears the code. */
  readonly code: string | undefined;
}

/**
 * The one canonical list. Order is the presentation order of the select control.
 * Every entry resolves to a *complete* type/format operation, i.e. the applied patch
 * always spells out both halves so that no surface can apply half of a format.
 */
export const GRID_NUMBER_FORMAT_PRESETS: readonly GridNumberFormatPreset[] = [
  { id: 'general', label: 'General', format: undefined, code: undefined },
  { id: 'number', label: 'Number', format: 'number', code: '#,##0.00' },
  { id: 'currency', label: 'Currency', format: 'currency', code: '$#,##0.00' },
  { id: 'accounting', label: 'Accounting', format: 'accounting', code: '$* #,##0.00' },
  { id: 'date', label: 'Date', format: 'date', code: 'yyyy-mm-dd' },
  { id: 'time', label: 'Time', format: 'time', code: 'hh:mm:ss' },
  { id: 'percent', label: 'Percentage', format: 'percent', code: '0.00%' },
  { id: 'fraction', label: 'Fraction', format: 'fraction', code: '# ?/?' },
  { id: 'scientific', label: 'Scientific', format: 'scientific', code: '0.00E+00' },
  { id: 'text', label: 'Text', format: 'text', code: '@' },
] as const;

/**
 * Formats that the always-visible toolbar band exposes as one-click operations.
 * The toolbar must produce the *same* patch as the panel select, so both read it here.
 */
export const GRID_TOOLBAR_NUMBER_FORMAT_IDS: readonly GridNumberFormatId[] = [
  'currency',
  'percent',
  'number',
  'date',
] as const;

export function findGridNumberFormatPreset(id: GridNumberFormatId): GridNumberFormatPreset | undefined {
  return GRID_NUMBER_FORMAT_PRESETS.find((preset) => preset.id === id);
}

/**
 * Total number-format patch for a preset. Both keys are always present, so applying a
 * preset can neither leave a stale semantic type nor a stale format code behind.
 */
export function gridNumberFormatPatch(id: GridNumberFormatId): Pick<GridCell, 'format' | 'numberFormatCode'> {
  const preset = findGridNumberFormatPreset(id);
  if (!preset) throw new Error(`Unknown Grid number format preset: ${String(id)}`);
  return { format: preset.format, numberFormatCode: preset.code };
}

/** Upper bound for a user-supplied format code. Excel's own limit is 255 characters. */
export const GRID_NUMBER_FORMAT_MAX_CODE_LENGTH = 255;
/** Upper bound for the number of `;`-separated sections that is actually interpreted. */
export const GRID_NUMBER_FORMAT_MAX_SECTIONS = 4;

export type GridNumberFormatCodeError =
  | 'code-too-long'
  | 'too-many-sections'
  | 'unterminated-quote'
  | 'empty';

export interface GridNumberFormatCodeCheck {
  readonly valid: boolean;
  readonly code: string;
  readonly error?: GridNumberFormatCodeError;
}

const FORMAT_CHARACTERS = new Set(['0', '#', '?']);

/**
 * Fail-closed validation of a user-entered number-format code.
 *
 * A code that cannot be interpreted is rejected instead of silently rendering garbage,
 * which is what the previous implementation did for e.g. `yyyy-mm-dd`.
 */
export function checkGridNumberFormatCode(rawCode: string): GridNumberFormatCodeCheck {
  const code = rawCode.trim();
  if (code.length === 0) return { valid: false, code, error: 'empty' };
  if (code.length > GRID_NUMBER_FORMAT_MAX_CODE_LENGTH) return { valid: false, code, error: 'code-too-long' };

  let sectionCount = 0;
  let inQuotes = false;
  let escaped = false;
  for (const character of code) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (character === ';' && !inQuotes) sectionCount += 1;
  }
  if (inQuotes) return { valid: false, code, error: 'unterminated-quote' };
  if (sectionCount + 1 > GRID_NUMBER_FORMAT_MAX_SECTIONS) return { valid: false, code, error: 'too-many-sections' };
  return { valid: true, code };
}

export function isValidGridNumberFormatCode(rawCode: string): boolean {
  return checkGridNumberFormatCode(rawCode).valid;
}

// ---------------------------------------------------------------------------
// Section anatomy. A number-format code is `;`-separated into at most four
// sections: positive, negative, zero, text.
// ---------------------------------------------------------------------------

export interface GridNumberFormatSection {
  readonly raw: string;
  /** Placeholder and literal runs in source order. */
  readonly runs: readonly GridNumberFormatRun[];
  /** Literal text joined in source order, used when the value is a string. */
  readonly literalText: string;
  readonly hasPercent: boolean;
  readonly hasTextPlaceholder: boolean;
  readonly isDatePattern: boolean;
  /** Colour name from a leading `[Red]`-style modifier. */
  readonly color?: string;
}

export interface GridNumberFormatRun {
  readonly kind: 'digits' | 'literal';
  /** `kind === 'digits'`: the raw placeholder run, e.g. `#,##0.00`. */
  readonly placeholder?: string;
  /** `kind === 'literal'`: decoded literal text (quotes and backslashes resolved). */
  readonly text?: string;
}

const COLOR_MODIFIER_PATTERN = /^\[(black|blue|cyan|green|magenta|red|white|yellow|color\s*\d+)\]/i;
/**
 * Date tokens plus quoted literals and escapes, so that a `y` inside `"Year y"` is never
 * treated as a token. Group 1 is the token; a quoted literal and an escape arrive as
 * group-less matches and are emitted unchanged.
 */
const DATE_TOKEN_PATTERN = /"[^"]*"|\\.|(y{2,4}|m{1,5}|d{1,4}|h{1,2}|s{1,2}|am\/pm|a\/p)/gi;

function unescapeLiteral(text: string): string {
  return text.replace(/\\(.)/g, '$1').replace(/""/g, '"');
}

/**
 * Describes one `;`-section: which placeholder runs exist, which literals are printed,
 * whether the section scales by 100, and whether it is a date/time pattern.
 */
export function describeGridNumberFormatSection(raw: string): GridNumberFormatSection {
  let body = raw;
  let color: string | undefined;
  const colorMatch = COLOR_MODIFIER_PATTERN.exec(body.trim());
  if (colorMatch) {
    color = colorMatch[1].toLowerCase();
    body = body.trim().slice(colorMatch[0].length);
  }

  const runs: GridNumberFormatRun[] = [];
  let plainLiteral = '';
  let digitPlaceholder = '';
  let index = 0;

  const flushPlainLiteral = (): void => {
    if (plainLiteral.length === 0) return;
    runs.push({ kind: 'literal', text: unescapeLiteral(plainLiteral) });
    plainLiteral = '';
  };
  const flushDigits = (): void => {
    if (digitPlaceholder.length === 0) return;
    runs.push({ kind: 'digits', placeholder: digitPlaceholder });
    digitPlaceholder = '';
  };

  while (index < body.length) {
    const character = body[index];
    if (character === '"') {
      flushDigits();
      const end = body.indexOf('"', index + 1);
      plainLiteral += end < 0 ? body.slice(index + 1) : body.slice(index + 1, end);
      index = end < 0 ? body.length : end + 1;
      continue;
    }
    if (character === '\\') {
      flushDigits();
      plainLiteral += body[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (character === '_') {
      // `_x` reserves the width of `x`; the padding character itself is never printed.
      flushDigits();
      index += 2;
      continue;
    }
    if (character === '*') {
      // `*x` repeats `x` to fill the cell; the repetition is not part of the text.
      flushDigits();
      index += 2;
      continue;
    }
    if (FORMAT_CHARACTERS.has(character)) {
      flushPlainLiteral();
      digitPlaceholder += character;
      index += 1;
      continue;
    }
    if (character === ',') {
      const next = body[index + 1];
      const previous = digitPlaceholder.at(-1);
      // A comma between two digit placeholders is the thousands separator, not a literal.
      if (previous !== undefined && FORMAT_CHARACTERS.has(previous) && next !== undefined && FORMAT_CHARACTERS.has(next)) {
        digitPlaceholder += character;
        index += 1;
        continue;
      }
    }
    if (character === '.') {
      const next = body[index + 1];
      // A dot between two digit placeholders is the decimal separator, not a literal.
      if (digitPlaceholder.length > 0 && next !== undefined && FORMAT_CHARACTERS.has(next)) {
        digitPlaceholder += character;
        index += 1;
        continue;
      }
    }
    flushDigits();
    plainLiteral += character;
    index += 1;
  }
  flushDigits();
  flushPlainLiteral();

  const literalText = runs
    .filter((run): run is GridNumberFormatRun & { text: string } => run.kind === 'literal')
    .map((run) => run.text)
    .join('')
    // `%` is part of the number pattern (it scales by 100 and is emitted once), so it is
    // never literal text. `renderGridNumberFormatSection` re-emits it after scaling.
    .replace(/%/g, '')
    // `_x` skips the width of `x`; the padding character itself is not printed.
    .replace(/_(.)/g, '');

  const hasTextPlaceholder = body.includes('@');
  return {
    raw,
    runs,
    literalText,
    hasPercent: /%/.test(body),
    hasTextPlaceholder,
    isDatePattern: hasDateToken(body),
    ...(color ? { color } : {}),
  };
}

/**
 * Splits a code into its interpreted sections (at most four, per the bound above).
 * A section that yields no run at all is still returned so index-based section
 * selection (positive/negative/zero/text) stays predictable.
 */
export function parseGridNumberFormatSections(rawCode: string): readonly GridNumberFormatSection[] {
  const sections = rawCode.split(';').slice(0, GRID_NUMBER_FORMAT_MAX_SECTIONS);
  return sections.map((section) => describeGridNumberFormatSection(section));
}

function hasDateToken(body: string): boolean {
  const withoutLiterals = body
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '');
  return /(y{2,4}|m{1,5}|d{1,4}|h{1,2}|s{1,2}|am\/pm|a\/p)/i.test(withoutLiterals);
}

export interface GridNumberFormatPlaceholder {
  readonly minIntegerDigits: number;
  readonly minFractionDigits: number;
  readonly maxFractionDigits: number;
  readonly useGrouping: boolean;
  /** `?` reserves space for insignificant zeros instead of printing them. */
  readonly spaceForInsignificantZeros: boolean;
}

/**
 * Digits-run anatomy: `#,##0.00` -> 1 integer digit minimum, exactly 2 fraction digits.
 * `#` never forces a digit, `0` always does, `?` forces a space.
 */
export function parseGridNumberFormatPlaceholder(placeholder: string): GridNumberFormatPlaceholder {
  // The scanner only records a `.` inside a placeholder when it sits between two digit
  // placeholders, so the last dot is unambiguously the decimal separator.
  const separator = placeholder.lastIndexOf('.');
  const integerPart = separator < 0 ? placeholder : placeholder.slice(0, separator);
  const fractionPart = separator < 0 ? '' : placeholder.slice(separator + 1);
  const integerDigits = integerPart.replace(/[^0#?]/g, '');
  const fractionDigits = fractionPart.replace(/[^0#?]/g, '');
  const requiredIntegers = [...integerDigits].filter((digit) => digit === '0').length;
  const requiredFractions = [...fractionDigits].filter((digit) => digit === '0').length;
  return {
    minIntegerDigits: requiredIntegers,
    minFractionDigits: requiredFractions,
    // `#`/`?` may add digits but must not pad: the maximum is the number of slots.
    maxFractionDigits: fractionDigits.length,
    useGrouping: placeholder.includes(','),
    spaceForInsignificantZeros: fractionDigits.includes('?'),
  };
}

/** `0.00%` multiplies by 100; a `%` that only appears in a literal does not. */
export function gridNumberFormatScalesByHundred(section: GridNumberFormatSection): boolean {
  const body = section.raw.replace(/"[^"]*"/g, '');
  return section.runs.some((run) => run.kind === 'digits') && body.includes('%');
}

export const GRID_NUMBER_FORMAT_DATE_SERIAL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function isTimeOnlyPattern(section: GridNumberFormatSection): boolean {
  const withoutLiterals = section.raw.replace(/"[^"]*"/g, '').replace(/\\./g, '');
  return section.isDatePattern && !/[yd]/i.test(withoutLiterals) && /[hs]|am\/pm|a\/p/i.test(withoutLiterals);
}

/**
 * Interprets a cell value as a date for a date-format code.
 *
 * Numbers are treated as Excel serial days; `Date.now()`-style epoch milliseconds are
 * recognised as well so that `{ value: 1735689600000, format: 'date' }` keeps working.
 * Returns `null` when no honest date can be derived — the caller then falls back to the
 * plain rendering instead of inventing a date.
 */
export function gridNumberFormatDateValue(value: GridCell['value'] | undefined, section: GridNumberFormatSection): Date | null {
  const timeOnly = isTimeOnlyPattern(section);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const looksLikeEpochMilliseconds = Math.abs(value) >= 1e11;
    const date = looksLikeEpochMilliseconds
      ? new Date(value)
      : new Date(GRID_NUMBER_FORMAT_DATE_SERIAL_EPOCH_UTC + value * 86_400_000);
    if (Number.isNaN(date.getTime())) return null;
    if (!timeOnly) return date;
    const fractionOfDay = looksLikeEpochMilliseconds
      ? (date.getUTCHours() * 3_600_000 + date.getUTCMinutes() * 60_000 + date.getUTCSeconds() * 1_000) / 86_400_000
      : ((value % 1) + 1) % 1;
    return new Date(Date.UTC(1970, 0, 1) + Math.round(fractionOfDay * 86_400_000));
  }
  if (typeof value === 'string') {
    const direct = Date.parse(value);
    if (Number.isNaN(direct)) return null;
    const date = new Date(direct);
    if (!timeOnly) return date;
    return new Date(Date.UTC(1970, 0, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
  }
  return null;
}

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Token-by-token date rendering. The `m` token is resolved by context — `m`/`mm` are
 * minutes when they directly follow an hour token or directly precede a second token,
 * and months otherwise. Unknown tokens are emitted verbatim instead of guessed.
 */
export function formatGridNumberFormatDate(date: Date, section: GridNumberFormatSection): string {
  const hours24 = date.getUTCHours();
  const use12Hour = /am\/pm|a\/p/i.test(section.raw);
  const source = section.raw;
  return source.replace(DATE_TOKEN_PATTERN, (match: string, token: string | undefined, offset: number) => {
    if (!token) {
      // Quoted literals lose their quotes; an escape keeps only the escaped character.
      if (match.startsWith('"')) return match.slice(1, -1);
      if (match.startsWith('\\')) return match.slice(1);
      return match;
    }
    return renderDateToken(token, date, source, offset, hours24, use12Hour);
  });
}

function renderDateToken(token: string, date: Date, source: string, offset: number, hours24: number, use12Hour: boolean): string {
  const lower = token.toLowerCase();
  if (lower.startsWith('y')) {
    return lower.length >= 4 ? String(date.getUTCFullYear()).padStart(4, '0') : pad(date.getUTCFullYear() % 100, 2);
  }
  if (lower.startsWith('m')) return isMinuteToken(source, offset, token.length) ? renderMinute(lower.length, date) : renderMonth(lower.length, date);
  if (lower.startsWith('d')) return renderDay(lower.length, date);
  if (lower.startsWith('h')) {
    const hour = use12Hour ? ((hours24 % 12) || 12) : hours24;
    return lower.length >= 2 ? pad(hour, 2) : String(hour);
  }
  if (lower.startsWith('s')) return lower.length >= 2 ? pad(date.getUTCSeconds(), 2) : String(date.getUTCSeconds());
  if (lower === 'am/pm') return hours24 < 12 ? 'AM' : 'PM';
  if (lower === 'a/p') return hours24 < 12 ? 'A' : 'P';
  return token;
}

function isMinuteToken(source: string, offset: number, length: number): boolean {
  const blankLiterals = (text: string): string => text.replace(/"[^"]*(?:""[^"]*)*"/g, (literal) => ' '.repeat(literal.length));
  const before = blankLiterals(source.slice(0, offset));
  const after = blankLiterals(source.slice(offset + length));
  return /h+\s*:?\s*$/i.test(before) || /^\s*:?\s*s+/i.test(after);
}

function renderMonth(length: number, date: Date): string {
  if (length >= 5) return MONTH_NAMES_LONG[date.getUTCMonth()].charAt(0);
  if (length === 4) return MONTH_NAMES_LONG[date.getUTCMonth()];
  if (length === 3) return MONTH_NAMES_SHORT[date.getUTCMonth()];
  if (length === 2) return pad(date.getUTCMonth() + 1, 2);
  return String(date.getUTCMonth() + 1);
}

function renderMinute(length: number, date: Date): string {
  return length >= 2 ? pad(date.getUTCMinutes(), 2) : String(date.getUTCMinutes());
}

function renderDay(length: number, date: Date): string {
  if (length >= 4) return DAY_NAMES_LONG[date.getUTCDay()];
  if (length === 3) return DAY_NAMES_SHORT[date.getUTCDay()];
  if (length === 2) return pad(date.getUTCDate(), 2);
  return String(date.getUTCDate());
}

/**
 * `# ?/?` and `# ??/??` are fraction patterns, not decimal patterns. The scanner emits the
 * fraction slash as a literal between two digit runs, so the slash is looked up in the
 * literal runs and the denominator width in the run that follows it.
 */
export function gridNumberFormatIsFraction(section: GridNumberFormatSection): boolean {
  return section.runs.some((run) => run.kind === 'literal' && (run.text ?? '').includes('/'));
}

function fractionSlotWidths(section: GridNumberFormatSection): { readonly numerator: number; readonly denominator: number } {
  const slashIndex = section.runs.findIndex((run) => run.kind === 'literal' && (run.text ?? '').includes('/'));
  const before = slashIndex < 0 ? '' : section.runs[slashIndex - 1]?.placeholder ?? '';
  const after = slashIndex < 0 ? '' : section.runs[slashIndex + 1]?.placeholder ?? '';
  return {
    numerator: before.replace(/[^0#?]/g, '').length,
    denominator: after.replace(/[^0#?]/g, '').length,
  };
}

const FRACTION_MAX_DENOMINATOR = 64;

/**
 * Mixed-number rendering for a fraction pattern: `2.75` with `# ?/?` becomes `2 3/4`.
 * The denominator search steps ascending and is bounded by the pattern width, so a
 * pathological input cannot turn into unbounded work.
 */
export function formatGridNumberFormatFraction(value: number, section: GridNumberFormatSection): string {
  const widths = fractionSlotWidths(section);
  const maxDenominator = Math.max(1, Math.min(FRACTION_MAX_DENOMINATOR, 10 ** Math.max(1, widths.denominator) - 1));
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const fraction = absolute - whole;
  if (fraction < 1e-9) return `${sign}${whole}`;

  let bestNumerator = 0;
  let bestDenominator = 1;
  let bestError = Number.POSITIVE_INFINITY;
  for (let denominator = 1; denominator <= maxDenominator; denominator++) {
    const numerator = Math.round(fraction * denominator);
    const error = Math.abs(fraction - numerator / denominator);
    if (error < bestError) {
      bestError = error;
      bestNumerator = numerator;
      bestDenominator = denominator;
      if (error < 1e-9) break;
    }
  }
  const fractionText = `${bestNumerator}/${bestDenominator}`;
  return whole > 0 ? `${sign}${whole} ${fractionText}` : `${sign}${fractionText}`;
}

/**
 * Scientific rendering for an `E+`/`E-` pattern, honouring the exponent-digit count of the
 * pattern. `0.00E+00` renders `12500` as `1.25E+04`.
 */
export function formatGridNumberFormatScientific(value: number, section: GridNumberFormatSection): string | null {
  const placeholder = section.runs.find((run) => run.kind === 'digits')?.placeholder;
  if (!placeholder) return null;
  const exponentMatch = /E([+-])(0+)/i.exec(section.raw);
  if (!exponentMatch) return null;
  const anatomy = parseGridNumberFormatPlaceholder(placeholder.split(/E/i)[0] ?? placeholder);
  const negative = value < 0;
  const exponent = value === 0 ? 0 : Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value === 0 ? 0 : Math.abs(value) / 10 ** exponent;
  const digits = Math.min(20, Math.max(anatomy.minFractionDigits, anatomy.maxFractionDigits));
  const renderedMantissa = mantissa.toFixed(digits);
  const exponentDigits = Math.max(1, exponentMatch[2].length);
  const exponentText = String(Math.abs(exponent)).padStart(exponentDigits, '0');
  const sign = exponentMatch[1] === '+' ? (exponent < 0 ? '-' : '+') : exponent < 0 ? '-' : '';
  return `${negative ? '-' : ''}${renderedMantissa}E${sign}${exponentText}`;
}
