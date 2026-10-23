// STATUS: DIAMANT VGT SUPREME
// Explicit serial-date and timezone rules for the Grid date functions.
//
// Every conversion here is integer arithmetic on the proleptic Gregorian calendar.
// No `Date` object, no local timezone, no implicit DST: the 1900 serial epoch, the
// 1900 leap-year bug, negative serials, the pre-1900 year shift and the timezone
// transition table are all explicit, inspectable policy.

import type { FormulaError } from './gridFormulaTypes';
import {
  GRID_FORMULA_LIMITS,
  GridFormulaLimitError,
  type GridFormulaLimits,
} from './gridFormulaLimits';

// --- Proleptic Gregorian civil-date arithmetic (Howard Hinnant's algorithms) ---

export function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function civilFromDays(days: number): CivilDate {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  return { year: year + (month <= 2 ? 1 : 0), month, day };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

export function isoFromCivil(date: CivilDate): string {
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(iso: string): CivilDate | null {
  const match = ISO_DATE_PATTERN.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 0 = Sunday .. 6 = Saturday, independent of any host timezone. */
export function isoWeekday(iso: string): number {
  const parsed = parseIsoDate(iso);
  if (!parsed) return -1;
  const days = daysFromCivil(parsed.year, parsed.month, parsed.day);
  return (((days + 4) % 7) + 7) % 7;
}

// --- 1900 serial system -------------------------------------------------------

export type GridFormulaLeapBugPolicy = 'error' | 'as-text';
export type GridFormulaNegativeSerialPolicy = 'error' | 'clamp-zero';

export interface GridFormulaSerialPolicy {
  readonly id: 'excel-1900';
  /** `1899-12-30`, the day Excel serial 1 is offset from for serials >= 61. */
  readonly epochIso: string;
  /** `1899-12-31`, the correct base for serials 1..59 (pre leap-bug). */
  readonly preLeapEpochIso: string;
  readonly leapBugSerial: number;
  readonly leapBugIso: string;
  readonly leapBug: GridFormulaLeapBugPolicy;
  readonly negativeSerials: GridFormulaNegativeSerialPolicy;
  /** Lowest year the 1900 system can represent. */
  readonly minYear: number;
  /** Highest serial the 1900 system can represent (`9999-12-31`). */
  readonly maxSerial: number;
  /** `DATE(year, ...)` adds 1900 for years 0..1899, matching Excel. */
  readonly shiftYearsBelow1900: boolean;
}

export const GRID_FORMULA_SERIAL_POLICY: GridFormulaSerialPolicy = Object.freeze({
  id: 'excel-1900',
  epochIso: '1899-12-30',
  preLeapEpochIso: '1899-12-31',
  leapBugSerial: 60,
  leapBugIso: '1900-02-29',
  leapBug: 'error',
  negativeSerials: 'error',
  minYear: 1900,
  maxSerial: 2_958_465,
  shiftYearsBelow1900: true,
});

export type GridFormulaSerialResult =
  | { readonly kind: 'date'; readonly iso: string; readonly serial: number }
  | { readonly kind: 'leap-bug'; readonly iso: string; readonly serial: number }
  | { readonly kind: 'error'; readonly code: FormulaError; readonly reason: string };

function epochDays(iso: string): number {
  const parsed = parseIsoDate(iso);
  if (!parsed) throw new Error(`grid_formula_epoch_invalid:${iso}`);
  return daysFromCivil(parsed.year, parsed.month, parsed.day);
}

const EPOCH_DAYS = epochDays(GRID_FORMULA_SERIAL_POLICY.epochIso);
const PRE_LEAP_EPOCH_DAYS = epochDays(GRID_FORMULA_SERIAL_POLICY.preLeapEpochIso);

/**
 * Converts an Excel 1900 serial number into an ISO date, honouring the explicit
 * leap-bug, negative-serial and range policies. Serial 60 (`1900-02-29`) does not
 * exist in the Gregorian calendar and is reported as such instead of being silently
 * mapped to 1900-02-28 or 1900-03-01.
 */
export function serialToSerialResult(
  serial: number,
  policy: GridFormulaSerialPolicy = GRID_FORMULA_SERIAL_POLICY,
): GridFormulaSerialResult {
  if (!Number.isFinite(serial)) {
    return { kind: 'error', code: '#VALUE!', reason: 'serial_not_finite' };
  }
  const whole = Math.floor(serial);
  if (whole < 1) {
    if (policy.negativeSerials === 'clamp-zero') {
      return { kind: 'date', iso: '1900-01-01', serial: 1 };
    }
    return { kind: 'error', code: '#NUM!', reason: 'serial_out_of_range' };
  }
  if (whole === policy.leapBugSerial) {
    return policy.leapBug === 'as-text'
      ? { kind: 'leap-bug', iso: policy.leapBugIso, serial: whole }
      : { kind: 'error', code: '#VALUE!', reason: 'serial_leap_bug_day' };
  }
  if (whole > policy.maxSerial) {
    return { kind: 'error', code: '#NUM!', reason: 'serial_out_of_range' };
  }
  const base = whole < policy.leapBugSerial ? PRE_LEAP_EPOCH_DAYS : EPOCH_DAYS;
  return { kind: 'date', iso: isoFromCivil(civilFromDays(base + whole)), serial: whole };
}

/** ISO date for a serial, or the typed error the cell should display. */
export function serialToIsoDate(
  serial: number,
  policy: GridFormulaSerialPolicy = GRID_FORMULA_SERIAL_POLICY,
): string | FormulaError {
  const result = serialToSerialResult(serial, policy);
  return result.kind === 'error' ? result.code : result.iso;
}

/** Serial number for an ISO date, or the typed error the cell should display. */
export function isoDateToSerial(
  iso: string,
  policy: GridFormulaSerialPolicy = GRID_FORMULA_SERIAL_POLICY,
): number | FormulaError {
  const trimmed = iso.trim();
  if (trimmed === policy.leapBugIso) return policy.leapBugSerial;
  const parsed = parseIsoDate(trimmed);
  if (!parsed) return '#VALUE!';
  if (parsed.year < policy.minYear) {
    return policy.negativeSerials === 'clamp-zero' ? 1 : '#NUM!';
  }
  const days = daysFromCivil(parsed.year, parsed.month, parsed.day);
  // Raw offset from 1899-12-30. Dates up to and including 1900-02-28 sit one day
  // earlier in the 1900 system because serial 60 is the non-existent 1900-02-29.
  const raw = days - EPOCH_DAYS;
  const serial = raw <= policy.leapBugSerial ? raw - 1 : raw;
  if (serial < 1) {
    return policy.negativeSerials === 'clamp-zero' ? 1 : '#NUM!';
  }
  if (serial > policy.maxSerial) return '#NUM!';
  return serial;
}

/**
 * Excel's `DATE` year normalisation: years 0..1899 shift by 1900, negative years and
 * years above 9999 are out of range.
 */
export function normalizeFormulaDateYear(year: number): number | FormulaError {
  if (!Number.isFinite(year)) return '#VALUE!';
  const whole = Math.trunc(year);
  if (whole < 0) return '#NUM!';
  if (whole > 9999) return '#NUM!';
  return whole < GRID_FORMULA_SERIAL_POLICY.minYear ? whole + 1900 : whole;
}

// --- Month and weekday helpers (EDATE / EOMONTH / WEEKDAY) --------------------

function monthsToIndex(iso: string): { year: number; month: number; day: number } | null {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  return { year: parsed.year, month: parsed.month, day: parsed.day };
}

function addMonthsCore(iso: string, months: number, endOfMonth: boolean): string | FormulaError {
  const parts = monthsToIndex(iso);
  if (!parts || !Number.isFinite(months)) return '#VALUE!';
  const total = parts.month - 1 + Math.trunc(months);
  const year = parts.year + Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const targetMonth = monthIndex + 1;
  if (year < 1 || year > 9999) return '#NUM!';
  const lastDay = daysInMonth(year, targetMonth);
  const day = endOfMonth ? lastDay : Math.min(parts.day, lastDay);
  return isoFromCivil({ year, month: targetMonth, day });
}

/** `EDATE`: shifts by whole months, clamping the day to the target month length. */
export function addMonthsClampedIso(iso: string, months: number): string | FormulaError {
  return addMonthsCore(iso, months, false);
}

/** `EOMONTH`: last day of the month `months` away. */
export function endOfMonthIso(iso: string, months: number): string | FormulaError {
  return addMonthsCore(iso, months, true);
}

const WEEKDAY_STARTS: Readonly<Record<number, number>> = Object.freeze({
  1: 0,
  2: 1,
  11: 1,
  12: 2,
  13: 3,
  14: 4,
  15: 5,
  16: 6,
  17: 0,
});

/**
 * `WEEKDAY` with explicit return-type validation. Returns `#NUM!` for unsupported
 * return types instead of silently falling back to type 1. Return types 1 and 3 are
 * 1-based and 0-based Sunday systems; 2 and 11..17 are 1-based systems starting at the
 * weekday named by the type.
 */
export function weekdayNumber(iso: string, returnType = 1): number | FormulaError {
  const weekday = isoWeekday(iso);
  if (weekday < 0) return '#VALUE!';
  if (returnType === 1) return weekday + 1;
  if (returnType === 3) return (weekday + 6) % 7;
  const start = WEEKDAY_STARTS[returnType];
  if (start === undefined) return '#NUM!';
  return ((weekday - start + 7) % 7) + 1;
}

export function isWeekendIso(iso: string): boolean {
  const weekday = isoWeekday(iso);
  return weekday === 0 || weekday === 6;
}

// --- Bounded working-day arithmetic (WORKDAY / NETWORKDAYS) -------------------

/**
 * Day number for a serial (days since the civil epoch), or `null` for the
 * non-existent leap-bug serial and out-of-range input.
 */
function serialToDays(serial: number): number | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (whole < 1 || whole > GRID_FORMULA_SERIAL_POLICY.maxSerial) return null;
  if (whole === GRID_FORMULA_SERIAL_POLICY.leapBugSerial) return null;
  const base = whole < GRID_FORMULA_SERIAL_POLICY.leapBugSerial ? PRE_LEAP_EPOCH_DAYS : EPOCH_DAYS;
  return base + whole;
}

/** 0 = Sunday .. 6 = Saturday for a serial number. */
export function serialWeekday(serial: number): number {
  const days = serialToDays(serial);
  if (days === null) return -1;
  return (((days + 4) % 7) + 7) % 7;
}

export function isWeekendSerial(serial: number): boolean {
  const weekday = serialWeekday(serial);
  return weekday === 0 || weekday === 6;
}

function normalizeHolidaySerials(holidays: Iterable<unknown>): Set<number> {
  const result = new Set<number>();
  for (const holiday of holidays) {
    if (holiday === null || holiday === undefined || holiday === '') continue;
    const serial = typeof holiday === 'number' ? holiday : isoDateToSerial(String(holiday).trim());
    if (typeof serial !== 'number') continue;
    if (serialToDays(serial) === null) continue;
    result.add(serial);
  }
  return result;
}

/**
 * `WORKDAY`. Two bounds make non-termination impossible:
 *  1. a serial-range pre-check proves the request cannot fit in the 1900 system;
 *  2. the walk is pure integer arithmetic over the serial range with an iteration cap.
 * The walk therefore never parses text per day and never grows with the host timezone.
 */
export function addWorkdaysIso(
  startIso: string,
  days: number,
  holidays: Iterable<unknown> = [],
  limits: GridFormulaLimits = GRID_FORMULA_LIMITS,
): string | FormulaError {
  const startSerial = isoDateToSerial(startIso);
  if (typeof startSerial !== 'number' || !Number.isFinite(days)) return '#VALUE!';
  const whole = Math.trunc(days);
  if (whole === 0) return startIso;

  const step = whole > 0 ? 1 : -1;
  const magnitude = Math.abs(whole);
  // Best case (every day is a working day) already leaves the representable range.
  if (step > 0 && startSerial + magnitude > GRID_FORMULA_SERIAL_POLICY.maxSerial) return '#NUM!';
  if (step < 0 && startSerial - magnitude < 1) return '#NUM!';
  if (magnitude > limits.maxDateSpanDays) return '#NUM!';

  const holidaySet = normalizeHolidaySerials(holidays);
  let cursor = startSerial;
  let remaining = magnitude;
  let iterations = 0;
  const iterationCap = Math.min(limits.maxDateSpanDays, magnitude * 8 + 8);
  while (remaining > 0) {
    if (iterations >= iterationCap) {
      throw new GridFormulaLimitError('evaluation-steps', iterationCap, iterations + 1);
    }
    iterations++;
    cursor += step;
    if (cursor < 1 || cursor > GRID_FORMULA_SERIAL_POLICY.maxSerial) return '#NUM!';
    if (!isWeekendSerial(cursor) && !holidaySet.has(cursor)) remaining--;
  }
  return serialToIsoDate(cursor);
}

/**
 * `NETWORKDAYS`. Counts inclusive working days over the serial range; a reversed range
 * yields the negated count, matching Excel.
 */
export function countWorkdaysIso(
  startIso: string,
  endIso: string,
  holidays: Iterable<unknown> = [],
  limits: GridFormulaLimits = GRID_FORMULA_LIMITS,
): number | FormulaError {
  const startSerial = isoDateToSerial(startIso);
  const endSerial = isoDateToSerial(endIso);
  if (typeof startSerial !== 'number' || typeof endSerial !== 'number') return '#VALUE!';
  const span = Math.abs(endSerial - startSerial) + 1;
  if (span > limits.maxDateSpanDays) {
    throw new GridFormulaLimitError('evaluation-steps', limits.maxDateSpanDays, span);
  }
  const holidaySet = normalizeHolidaySerials(holidays);
  const sign = startSerial <= endSerial ? 1 : -1;
  const from = sign === 1 ? startSerial : endSerial;
  const to = sign === 1 ? endSerial : startSerial;
  let workdays = 0;
  for (let cursor = from; cursor <= to; cursor++) {
    if (!isWeekendSerial(cursor) && !holidaySet.has(cursor)) workdays++;
  }
  return sign * workdays;
}

// --- Explicit timezone rules --------------------------------------------------

export interface GridFormulaTimeZoneTransition {
  /** UTC instant at which the offset becomes effective. */
  readonly fromUtcMs: number;
  readonly offsetMinutes: number;
}

export interface GridFormulaTimeZoneRule {
  readonly id: string;
  /** UTC offset in minutes for a given instant. */
  offsetMinutesAt(utcMs: number): number;
}

export const GRID_FORMULA_UTC_RULE: GridFormulaTimeZoneRule = Object.freeze({
  id: 'UTC',
  offsetMinutesAt: () => 0,
});

export function createFixedOffsetRule(id: string, offsetMinutes: number): GridFormulaTimeZoneRule {
  if (!Number.isFinite(offsetMinutes)) throw new Error('grid_formula_timezone_offset_invalid');
  const frozen = Math.trunc(offsetMinutes);
  if (frozen === 0) return Object.freeze({ id, offsetMinutesAt: () => 0 });
  return Object.freeze({ id, offsetMinutesAt: () => frozen });
}

/**
 * Creates a DST-aware rule from an explicit, sorted transition table. There is no
 * implicit database lookup: the caller supplies the instants, so tests assert exact
 * behaviour at and around the transition.
 *
 * `initialOffsetMinutes` is the offset that applies *before* the first transition.
 * When omitted the first transition's offset is used for all earlier instants, which is
 * the only guess-free default available from a table alone; callers that model a real
 * zone should pass it explicitly.
 */
export function createTransitionRule(
  id: string,
  transitions: readonly GridFormulaTimeZoneTransition[],
  initialOffsetMinutes?: number,
): GridFormulaTimeZoneRule {
  if (transitions.length === 0) throw new Error('grid_formula_timezone_transitions_empty');
  const sorted = [...transitions].sort((left, right) => left.fromUtcMs - right.fromUtcMs);
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index].fromUtcMs === sorted[index - 1].fromUtcMs) {
      throw new Error('grid_formula_timezone_transition_duplicate');
    }
    if (!Number.isFinite(sorted[index].offsetMinutes)) {
      throw new Error('grid_formula_timezone_offset_invalid');
    }
  }
  const first = sorted[0];
  if (initialOffsetMinutes !== undefined && !Number.isFinite(initialOffsetMinutes)) {
    throw new Error('grid_formula_timezone_offset_invalid');
  }
  const beforeFirst = initialOffsetMinutes === undefined ? first.offsetMinutes : Math.trunc(initialOffsetMinutes);
  const frozen = Object.freeze(sorted);
  return Object.freeze({
    id,
    offsetMinutesAt(utcMs: number) {
      let result = beforeFirst;
      for (const transition of frozen) {
        if (transition.fromUtcMs > utcMs) break;
        result = transition.offsetMinutes;
      }
      return result;
    },
  });
}

export interface GridFormulaZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly weekday: number;
  readonly offsetMinutes: number;
}

export function zonedParts(
  utcMs: number,
  rule: GridFormulaTimeZoneRule = GRID_FORMULA_UTC_RULE,
): GridFormulaZonedParts {
  if (!Number.isFinite(utcMs)) throw new Error('grid_formula_instant_invalid');
  const offsetMinutes = rule.offsetMinutesAt(utcMs);
  const shifted = utcMs + offsetMinutes * 60_000;
  const localDays = Math.floor(shifted / 86_400_000);
  let remainder = shifted - localDays * 86_400_000;
  const civil = civilFromDays(localDays);
  const hour = Math.floor(remainder / 3_600_000);
  remainder -= hour * 3_600_000;
  const minute = Math.floor(remainder / 60_000);
  remainder -= minute * 60_000;
  const second = Math.floor(remainder / 1000);
  const weekday = (((localDays + 4) % 7) + 7) % 7;
  return { ...civil, hour, minute, second, weekday, offsetMinutes };
}

/** Local calendar date in a zone, as the ISO date the Grid displays. */
export function zonedIsoDate(
  utcMs: number,
  rule: GridFormulaTimeZoneRule = GRID_FORMULA_UTC_RULE,
): string {
  const parts = zonedParts(utcMs, rule);
  return isoFromCivil(parts);
}

/** Local date and time in a zone: `2026-09-12 14:30:15`. */
export function zonedIsoDateTime(
  utcMs: number,
  rule: GridFormulaTimeZoneRule = GRID_FORMULA_UTC_RULE,
): string {
  const parts = zonedParts(utcMs, rule);
  return `${isoFromCivil(parts)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/** Day-fraction time component (0 <= value < 1) used by `TIME` and `HOUR`. */
export function timeFractionFromParts(hours: number, minutes: number, seconds: number): number {
  const totalSeconds = Math.trunc(hours) * 3600 + Math.trunc(minutes) * 60 + Math.trunc(seconds);
  const positive = ((totalSeconds % 86_400) + 86_400) % 86_400;
  return positive / 86_400;
}

export function timeStringFromFraction(fraction: number): string {
  const totalSeconds = Math.round((((fraction % 1) + 1) % 1) * 86_400) % 86_400;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
