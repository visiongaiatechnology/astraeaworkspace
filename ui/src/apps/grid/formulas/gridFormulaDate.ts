// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Date & Time formula domain
// Excel/Calc parity across WORKDAY, NETWORKDAYS, EDATE, EOMONTH, DATEDIF, DATE, TIME, TODAY, NOW, YEAR, MONTH, DAY, HOUR, MINUTE, SECOND
//
// Serial conversion, the 1900 leap-year bug, the pre-1900 year shift, the working-day
// bounds and the timezone/DST rule all live in `gridFormulaSerialDate.ts`. This module
// only maps argument shapes onto those explicit rules; it must not consult the host
// clock or the host timezone directly.

import { FormulaValue, toSingleValue, type FormulaError } from './gridFormulaTypes';
import { flattenToScalars } from './gridFormulaMath';
import {
  GRID_FORMULA_SERIAL_POLICY,
  GRID_FORMULA_UTC_RULE,
  addMonthsClampedIso,
  addWorkdaysIso,
  countWorkdaysIso,
  daysInMonth,
  endOfMonthIso,
  isWeekendIso,
  isoDateToSerial,
  isoFromCivil,
  normalizeFormulaDateYear,
  parseIsoDate,
  serialToIsoDate,
  timeFractionFromParts,
  timeStringFromFraction,
  weekdayNumber,
  zonedIsoDate,
  zonedIsoDateTime,
  type GridFormulaTimeZoneRule,
} from './gridFormulaSerialDate';
import { GridFormulaLimitError, formulaErrorForLimit } from './gridFormulaLimits';

/**
 * Resolves any supported date/time argument to an ISO calendar date. Serial numbers go
 * through the explicit 1900 policy; text must be a full ISO date. Returns `null` when
 * the value is not a date, so callers can emit the correct typed error.
 */
export function parseDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    const iso = serialToIsoDate(val);
    return typeof iso === 'string' && !iso.startsWith('#') ? iso : null;
  }
  const text = String(val).trim();
  const direct = parseIsoDate(text);
  if (direct) return isoFromCivil(direct);
  // Date-time text keeps only the calendar day; the time is handled by HOUR/MINUTE/SECOND.
  const datePart = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(text);
  if (datePart) {
    const parsed = parseIsoDate(datePart[1]);
    return parsed ? isoFromCivil(parsed) : null;
  }
  return null;
}

/** Extracts `HH:MM[:SS]` from a text or serial argument, if present. */
function parseTimeParts(val: unknown): { hour: number; minute: number; second: number } | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    const fraction = ((val % 1) + 1) % 1;
    const totalSeconds = Math.round(fraction * 86_400) % 86_400;
    return {
      hour: Math.floor(totalSeconds / 3600),
      minute: Math.floor((totalSeconds % 3600) / 60),
      second: totalSeconds % 60,
    };
  }
  const text = String(val ?? '');
  const match = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]), second: match[3] ? Number(match[3]) : 0 };
}

/** Kept for API compatibility: ISO text for a resolved date. */
export function formatDateISO(iso: string): string {
  return iso;
}

export function evalDateFunction(
  name: string,
  args: FormulaValue[],
  nowOverride?: Date,
  timeZoneRule: GridFormulaTimeZoneRule = GRID_FORMULA_UTC_RULE
): FormulaValue | undefined {
  const currentInstantMs = nowOverride ? nowOverride.getTime() : Date.now();
  try {
    switch (name) {
      case 'TODAY':
        return zonedIsoDate(currentInstantMs, timeZoneRule);

      case 'NOW':
        return zonedIsoDateTime(currentInstantMs, timeZoneRule);

      case 'DATE': {
        if (args.length < 3) return '#VALUE!';
        const rawYear = Number(toSingleValue(args[0]));
        const month = Number(toSingleValue(args[1]));
        const day = Number(toSingleValue(args[2]));
        if (isNaN(rawYear) || isNaN(month) || isNaN(day)) return '#VALUE!';
        const year = normalizeFormulaDateYear(rawYear);
        if (typeof year === 'string') return year;
        // Month and day overflow rolls into following months/years, as in Excel.
        const baseMonthIndex = Math.trunc(month) - 1;
        const yearShift = Math.floor(baseMonthIndex / 12);
        const monthIndex = ((baseMonthIndex % 12) + 12) % 12;
        const targetYear = year + yearShift;
        if (targetYear < 1 || targetYear > 9999) return '#NUM!';
        const totalDays = Math.trunc(day);
        const resultMs = daysInMonthValue(targetYear, monthIndex + 1);
        if (totalDays < 1) {
          const previousMonthDays = daysInMonthValue(
            monthIndex === 0 ? targetYear - 1 : targetYear,
            monthIndex === 0 ? 12 : monthIndex,
          );
          return isoFromCivil(shiftCivil(targetYear, monthIndex + 1, 1, totalDays - 1, previousMonthDays));
        }
        if (totalDays > resultMs) {
          return isoFromCivil(shiftCivil(targetYear, monthIndex + 1, 1, totalDays - 1, resultMs));
        }
        return isoFromCivil({ year: targetYear, month: monthIndex + 1, day: totalDays });
      }

      case 'TIME': {
        if (args.length < 3) return '#VALUE!';
        const h = Number(toSingleValue(args[0]) ?? 0);
        const m = Number(toSingleValue(args[1]) ?? 0);
        const s = Number(toSingleValue(args[2]) ?? 0);
        if (isNaN(h) || isNaN(m) || isNaN(s)) return '#VALUE!';
        return timeStringFromFraction(timeFractionFromParts(h, m, s));
      }

      case 'YEAR': {
        const iso = parseDate(toSingleValue(args[0]));
        const parsed = iso ? parseIsoDate(iso) : null;
        return parsed ? parsed.year : '#VALUE!';
      }

      case 'MONTH': {
        const iso = parseDate(toSingleValue(args[0]));
        const parsed = iso ? parseIsoDate(iso) : null;
        return parsed ? parsed.month : '#VALUE!';
      }

      case 'DAY': {
        const iso = parseDate(toSingleValue(args[0]));
        const parsed = iso ? parseIsoDate(iso) : null;
        return parsed ? parsed.day : '#VALUE!';
      }

      case 'HOUR': {
        const parts = parseTimeParts(toSingleValue(args[0]));
        return parts ? parts.hour : '#VALUE!';
      }

      case 'MINUTE': {
        const parts = parseTimeParts(toSingleValue(args[0]));
        return parts ? parts.minute : '#VALUE!';
      }

      case 'SECOND': {
        const parts = parseTimeParts(toSingleValue(args[0]));
        return parts ? parts.second : '#VALUE!';
      }

      case 'DAYS': {
        if (args.length < 2) return '#VALUE!';
        const endIso = parseDate(toSingleValue(args[0]));
        const startIso = parseDate(toSingleValue(args[1]));
        if (!endIso || !startIso) return '#VALUE!';
        const endSerial = isoDateToSerial(endIso);
        const startSerial = isoDateToSerial(startIso);
        if (typeof endSerial !== 'number' || typeof startSerial !== 'number') return '#VALUE!';
        return endSerial - startSerial;
      }

      case 'WEEKDAY': {
        const iso = parseDate(toSingleValue(args[0]));
        if (!iso) return '#VALUE!';
        const returnType = args.length > 1 ? Number(toSingleValue(args[1])) : 1;
        return weekdayNumber(iso, returnType);
      }

      case 'WEEKNUM': {
        const iso = parseDate(toSingleValue(args[0]));
        if (!iso) return '#VALUE!';
        const parsed = parseIsoDate(iso);
        if (!parsed) return '#VALUE!';
        const returnType = args.length > 1 ? Number(toSingleValue(args[1])) : 1;
        if (returnType !== 1 && returnType !== 2) return '#NUM!';
        const firstOfYear = isoFromCivil({ year: parsed.year, month: 1, day: 1 });
        const firstSerial = isoDateToSerial(firstOfYear);
        const targetSerial = isoDateToSerial(iso);
        if (typeof firstSerial !== 'number' || typeof targetSerial !== 'number') return '#VALUE!';
        const offset = targetSerial - firstSerial;
        const startWeekday = weekdayNumber(firstOfYear, returnType);
        if (typeof startWeekday !== 'number') return '#NUM!';
        return Math.floor((offset + startWeekday - 1) / 7) + 1;
      }

      case 'EDATE': {
        if (args.length < 2) return '#VALUE!';
        const iso = parseDate(toSingleValue(args[0]));
        const months = Number(toSingleValue(args[1]));
        if (!iso || !Number.isFinite(months)) return '#VALUE!';
        return addMonthsClampedIso(iso, months);
      }

      case 'EOMONTH': {
        if (args.length < 2) return '#VALUE!';
        const iso = parseDate(toSingleValue(args[0]));
        const months = Number(toSingleValue(args[1]));
        if (!iso || !Number.isFinite(months)) return '#VALUE!';
        return endOfMonthIso(iso, months);
      }

      case 'DATEDIF': {
        if (args.length < 3) return '#VALUE!';
        const startIso = parseDate(toSingleValue(args[0]));
        const endIso = parseDate(toSingleValue(args[1]));
        const unit = String(toSingleValue(args[2]) ?? 'D').toUpperCase();
        if (!startIso || !endIso) return '#VALUE!';
        const startSerial = isoDateToSerial(startIso);
        const endSerial = isoDateToSerial(endIso);
        if (typeof startSerial !== 'number' || typeof endSerial !== 'number') return '#VALUE!';
        if (startSerial > endSerial) return '#NUM!';
        const start = parseIsoDate(startIso);
        const end = parseIsoDate(endIso);
        if (!start || !end) return '#VALUE!';

        switch (unit) {
          case 'Y': {
            let years = end.year - start.year;
            if (end.month < start.month || (end.month === start.month && end.day < start.day)) years--;
            return years;
          }
          case 'M': {
            let months = (end.year - start.year) * 12 + (end.month - start.month);
            if (end.day < start.day) months--;
            return months;
          }
          case 'D':
            return endSerial - startSerial;
          case 'YM': {
            let months = end.month - start.month;
            if (months < 0) months += 12;
            if (end.day < start.day) months = (months - 1 + 12) % 12;
            return months;
          }
          case 'YD': {
            let adjustedYear = end.year;
            if (start.month > end.month || (start.month === end.month && start.day > end.day)) adjustedYear--;
            const adjusted = isoDateToSerial(
              isoFromCivil({ year: adjustedYear, month: start.month, day: Math.min(start.day, daysInMonthValue(adjustedYear, start.month)) }),
            );
            return typeof adjusted === 'number' ? endSerial - adjusted : '#VALUE!';
          }
          case 'MD': {
            if (end.day >= start.day) return end.day - start.day;
            const previousMonthIndex = end.month === 1 ? 12 : end.month - 1;
            const previousYear = end.month === 1 ? end.year - 1 : end.year;
            return daysInMonthValue(previousYear, previousMonthIndex) - start.day + end.day;
          }
          default:
            return '#NUM!';
        }
      }

      case 'NETWORKDAYS': {
        if (args.length < 2) return '#VALUE!';
        const startIso = parseDate(toSingleValue(args[0]));
        const endIso = parseDate(toSingleValue(args[1]));
        if (!startIso || !endIso) return '#VALUE!';
        return countWorkdaysIso(startIso, endIso, holidayIsos(args, timeZoneRule));
      }

      case 'WORKDAY': {
        if (args.length < 2) return '#VALUE!';
        const startIso = parseDate(toSingleValue(args[0]));
        const days = Number(toSingleValue(args[1]));
        if (!startIso || !Number.isFinite(days)) return '#VALUE!';
        return addWorkdaysIso(startIso, days, holidayIsos(args, timeZoneRule));
      }

      default:
        return undefined;
    }
  } catch (error) {
    if (error instanceof GridFormulaLimitError) return formulaErrorForLimit(error.kind);
    throw error;
  }
}

function holidayIsos(args: FormulaValue[], _rule: GridFormulaTimeZoneRule): string[] {
  if (args.length <= 2) return [];
  const holidays: string[] = [];
  for (const scalar of flattenToScalars(args.slice(2))) {
    const iso = parseDate(scalar);
    if (iso) holidays.push(iso);
  }
  return holidays;
}

function daysInMonthValue(year: number, month: number): ReturnType<typeof daysInMonth> {
  return daysInMonth(year, month);
}

/**
 * Shifts a civil date by `dayOffset - 1` days from the first of the given month, used
 * to roll month/day overflow exactly like Excel's `DATE`.
 */
function shiftCivil(
  year: number,
  month: number,
  day: number,
  dayOffset: number,
  _monthLength: number,
): { year: number; month: number; day: number } {
  const base: FormulaError | number = isoDateToSerial(isoFromCivil({ year, month, day }));
  if (typeof base === 'string') return { year, month, day };
  const shifted = serialToIsoDate(base + dayOffset);
  const parsed = typeof shifted === 'string' ? parseIsoDate(shifted) : null;
  return parsed ?? { year, month, day };
}

export { GRID_FORMULA_SERIAL_POLICY, isWeekendIso, GRID_FORMULA_UTC_RULE };