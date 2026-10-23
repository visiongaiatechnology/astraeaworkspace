// STATUS: DIAMANT VGT SUPREME
// Explicit 1900 serial, calendar and timezone/DST rules: Paket 24 (AST-0356..0360).
//
// Oracles are hand-written from the Excel 1900 date system plus the published
// Europe/Berlin transition instants for 2026. No expectation is derived from the code
// under test.

import { describe, expect, it } from 'vitest';
import {
  GRID_FORMULA_SERIAL_POLICY,
  GRID_FORMULA_UTC_RULE,
  addMonthsClampedIso,
  addWorkdaysIso,
  countWorkdaysIso,
  createFixedOffsetRule,
  createTransitionRule,
  daysInMonth,
  endOfMonthIso,
  isoDateToSerial,
  isoWeekday,
  normalizeFormulaDateYear,
  serialToIsoDate,
  serialToSerialResult,
  weekdayNumber,
  zonedIsoDate,
  zonedIsoDateTime,
  zonedParts,
} from '../../formulas/gridFormulaSerialDate';
import { evaluateGridFormulaLocal } from '../../formulas/gridFormulaEngine';
import type { FormulaEngineOptions } from '../../formulas/gridFormulaEngineTypes';
import { GRID_FORMULA_LIMITS } from '../../formulas/gridFormulaLimits';

const BERLIN_2026 = createTransitionRule(
  'Europe/Berlin-2026',
  [
    { fromUtcMs: Date.UTC(2026, 2, 29, 1, 0, 0), offsetMinutes: 120 },
    { fromUtcMs: Date.UTC(2026, 9, 25, 1, 0, 0), offsetMinutes: 60 },
  ],
  60,
);

describe('Paket 24 — 1900 serial system', () => {
  it('maps the serial anchors of the Excel 1900 system', () => {
    expect(serialToIsoDate(1)).toBe('1900-01-01');
    expect(serialToIsoDate(2)).toBe('1900-01-02');
    expect(serialToIsoDate(59)).toBe('1900-02-28');
    expect(serialToIsoDate(61)).toBe('1900-03-01');
    expect(serialToIsoDate(45292)).toBe('2024-01-01');
    expect(serialToIsoDate(45658)).toBe('2025-01-01');
    expect(serialToIsoDate(2_958_465)).toBe('9999-12-31');
  });

  it('round-trips every serial across leap and century boundaries', () => {
    for (const iso of ['1900-01-01', '1900-02-28', '1900-03-01', '2000-02-29', '2024-02-29', '2026-12-31', '9999-12-31']) {
      const serial = isoDateToSerial(iso);
      expect(typeof serial).toBe('number');
      expect(serialToIsoDate(serial as number)).toBe(iso);
    }
    expect(isoDateToSerial('1900-02-29')).toBe(60);
  });

  it('reports the 1900 leap-bug day as an explicit policy decision', () => {
    expect(GRID_FORMULA_SERIAL_POLICY.leapBugSerial).toBe(60);
    expect(serialToIsoDate(60)).toBe('#VALUE!');
    const result = serialToSerialResult(60, { ...GRID_FORMULA_SERIAL_POLICY, leapBug: 'as-text' });
    expect(result).toEqual({ kind: 'leap-bug', iso: '1900-02-29', serial: 60 });
  });

  it('refuses negative, zero and out-of-range serials fail-closed', () => {
    expect(serialToIsoDate(-1)).toBe('#NUM!');
    expect(serialToIsoDate(0)).toBe('#NUM!');
    expect(serialToIsoDate(2_958_466)).toBe('#NUM!');
    expect(serialToIsoDate(Number.NaN)).toBe('#VALUE!');
    expect(isoDateToSerial('1899-12-31')).toBe('#NUM!');
    expect(isoDateToSerial('not a date')).toBe('#VALUE!');
    expect(isoDateToSerial('2026-02-30')).toBe('#VALUE!');
  });

  it('shifts years below 1900 exactly like Excel DATE', () => {
    expect(normalizeFormulaDateYear(100)).toBe(2000);
    expect(normalizeFormulaDateYear(1899)).toBe(3799);
    expect(normalizeFormulaDateYear(1900)).toBe(1900);
    expect(normalizeFormulaDateYear(9999)).toBe(9999);
    expect(normalizeFormulaDateYear(10000)).toBe('#NUM!');
    expect(normalizeFormulaDateYear(-1)).toBe('#NUM!');
  });

  it('knows month lengths including the century leap rule', () => {
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('derives weekdays without the host timezone', () => {
    // 2026-09-04 is a Friday; 2026-09-12 is a Saturday.
    expect(isoWeekday('2026-09-04')).toBe(5);
    expect(isoWeekday('2026-09-12')).toBe(6);
  });
});

describe('Paket 24 — month arithmetic and working days', () => {
  it('clamps EDATE to the target month length', () => {
    expect(addMonthsClampedIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClampedIso('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsClampedIso('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsClampedIso('2026-01-15', 12)).toBe('2027-01-15');
    expect(addMonthsClampedIso('2026-01-15', 0)).toBe('2026-01-15');
  });

  it('computes EOMONTH across year boundaries', () => {
    expect(endOfMonthIso('2026-01-15', 0)).toBe('2026-01-31');
    expect(endOfMonthIso('2026-01-15', 1)).toBe('2026-02-28');
    expect(endOfMonthIso('2024-01-15', 1)).toBe('2024-02-29');
    expect(endOfMonthIso('2026-01-15', -1)).toBe('2025-12-31');
    expect(endOfMonthIso('2026-12-01', 1)).toBe('2027-01-31');
  });

  it('validates WEEKDAY return types instead of silently defaulting', () => {
    expect(weekdayNumber('2026-09-12', 1)).toBe(7);
    expect(weekdayNumber('2026-09-12', 2)).toBe(6);
    expect(weekdayNumber('2026-09-12', 3)).toBe(5);
    expect(weekdayNumber('2026-09-12', 11)).toBe(6);
    expect(weekdayNumber('2026-09-12', 12)).toBe(5);
    expect(weekdayNumber('2026-09-12', 17)).toBe(7);
    expect(weekdayNumber('2026-09-12', 4)).toBe('#NUM!');
    expect(weekdayNumber('nonsense', 1)).toBe('#VALUE!');
  });

  it('walks working days across weekends and holidays', () => {
    expect(addWorkdaysIso('2026-09-04', 0)).toBe('2026-09-04');
    expect(addWorkdaysIso('2026-09-04', 1)).toBe('2026-09-07');
    expect(addWorkdaysIso('2026-09-04', 2)).toBe('2026-09-08');
    expect(addWorkdaysIso('2026-09-04', 2, ['2026-09-07'])).toBe('2026-09-09');
    expect(addWorkdaysIso('2026-09-08', -2)).toBe('2026-09-04');
    expect(addWorkdaysIso('2026-09-04', -1)).toBe('2026-09-03');
  });

  it('counts working days inclusively and signed', () => {
    expect(countWorkdaysIso('2026-09-07', '2026-09-11')).toBe(5);
    expect(countWorkdaysIso('2026-09-11', '2026-09-07')).toBe(-5);
    expect(countWorkdaysIso('2026-09-07', '2026-09-13')).toBe(5);
    expect(countWorkdaysIso('2026-09-07', '2026-09-11', ['2026-09-09'])).toBe(4);
    expect(countWorkdaysIso('2026-09-05', '2026-09-06')).toBe(0);
  });

  it('bounds hostile day counts and day spans instead of iterating forever', () => {
    expect(addWorkdaysIso('2026-09-04', 5_000_000)).toBe('#NUM!');
    expect(() => countWorkdaysIso('1900-01-01', '9999-12-31', [], {
      ...GRID_FORMULA_LIMITS,
      maxDateSpanDays: 1_000,
    })).toThrow(/grid_formula_limit/);
  });
});

describe('Paket 24 — explicit timezone and DST rules', () => {
  it('UTC is the default rule and needs no host configuration', () => {
    expect(GRID_FORMULA_UTC_RULE.offsetMinutesAt(Date.UTC(2026, 6, 1))).toBe(0);
    expect(zonedIsoDateTime(Date.UTC(2026, 8, 12, 14, 30, 15))).toBe('2026-09-12 14:30:15');
    expect(zonedIsoDate(Date.UTC(2026, 8, 12, 23, 59, 59))).toBe('2026-09-12');
  });

  it('applies fixed offsets deterministically', () => {
    const plusTwo = createFixedOffsetRule('UTC+02:00', 120);
    expect(zonedIsoDateTime(Date.UTC(2026, 8, 12, 22, 0, 0), plusTwo)).toBe('2026-09-13 00:00:00');
    const minusFive = createFixedOffsetRule('UTC-05:00', -300);
    expect(zonedIsoDate(Date.UTC(2026, 8, 12, 2, 0, 0), minusFive)).toBe('2026-09-11');
  });

  it('resolves the DST transition to the minute', () => {
    // The clock jumps from 01:59 to 03:00 local at 2026-03-29T01:00Z.
    expect(zonedIsoDateTime(Date.UTC(2026, 2, 29, 0, 59, 0), BERLIN_2026)).toBe('2026-03-29 01:59:00');
    expect(zonedIsoDateTime(Date.UTC(2026, 2, 29, 1, 0, 0), BERLIN_2026)).toBe('2026-03-29 03:00:00');
    // The autumn transition repeats 02:59 local at 2026-10-25T01:00Z.
    expect(zonedIsoDateTime(Date.UTC(2026, 9, 25, 0, 59, 0), BERLIN_2026)).toBe('2026-10-25 02:59:00');
    expect(zonedIsoDateTime(Date.UTC(2026, 9, 25, 1, 0, 0), BERLIN_2026)).toBe('2026-10-25 02:00:00');
  });

  it('keeps the local calendar day correct across a DST boundary', () => {
    // 2026-03-29T23:30Z is still 2026-03-29 in UTC but already 2026-03-30 in Berlin.
    expect(zonedIsoDate(Date.UTC(2026, 2, 29, 23, 30, 0), GRID_FORMULA_UTC_RULE)).toBe('2026-03-29');
    expect(zonedIsoDate(Date.UTC(2026, 2, 29, 23, 30, 0), BERLIN_2026)).toBe('2026-03-30');
    expect(zonedParts(Date.UTC(2026, 2, 29, 23, 30, 0), BERLIN_2026).offsetMinutes).toBe(120);
  });

  it('rejects malformed transition tables instead of guessing', () => {
    expect(() => createTransitionRule('empty', [])).toThrow(/grid_formula_timezone_transitions_empty/);
    expect(() =>
      createTransitionRule('duplicate', [
        { fromUtcMs: 0, offsetMinutes: 60 },
        { fromUtcMs: 0, offsetMinutes: 120 },
      ]),
    ).toThrow(/grid_formula_timezone_transition_duplicate/);
    expect(() => createFixedOffsetRule('bad', Number.NaN)).toThrow(/grid_formula_timezone_offset_invalid/);
  });
});

describe('Paket 24 — date functions through the engine', () => {
  const grid = {};

  it('evaluates TODAY/NOW from the injected instant and rule, not the host clock', () => {
    const options: FormulaEngineOptions = {
      now: new Date(Date.UTC(2026, 8, 12, 22, 30, 0)),
      timeZoneRule: BERLIN_2026,
    };
    expect(evaluateGridFormulaLocal('=TODAY()', grid, new Set(), undefined, 'Sheet1', {}, options)).toBe('2026-09-13');
    expect(evaluateGridFormulaLocal('=NOW()', grid, new Set(), undefined, 'Sheet1', {}, options)).toBe('2026-09-13 00:30:00');
    expect(evaluateGridFormulaLocal('=TODAY()', grid, new Set(), undefined, 'Sheet1', {}, { now: new Date(Date.UTC(2026, 8, 12, 22, 30, 0)) })).toBe('2026-09-12');
  });

  it('evaluates the DATE rollover rules', () => {
    expect(evaluateGridFormulaLocal('=DATE(2026, 9, 12)', grid)).toBe('2026-09-12');
    expect(evaluateGridFormulaLocal('=DATE(2024, 2, 30)', grid)).toBe('2024-03-01');
    expect(evaluateGridFormulaLocal('=DATE(2024, 1, 0)', grid)).toBe('2023-12-31');
    expect(evaluateGridFormulaLocal('=DATE(2024, 13, 1)', grid)).toBe('2025-01-01');
    expect(evaluateGridFormulaLocal('=DATE(2024, 0, 1)', grid)).toBe('2023-12-01');
    expect(evaluateGridFormulaLocal('=DATE(100, 1, 1)', grid)).toBe('2000-01-01');
    expect(evaluateGridFormulaLocal('=DATE(10000, 1, 1)', grid)).toBe('#NUM!');
  });

  it('reads serial arguments through the 1900 policy', () => {
    expect(evaluateGridFormulaLocal('=YEAR(45292)', grid)).toBe(2024);
    expect(evaluateGridFormulaLocal('=MONTH(45292)', grid)).toBe(1);
    expect(evaluateGridFormulaLocal('=DAY(45292)', grid)).toBe(1);
    expect(evaluateGridFormulaLocal('=YEAR(1)', grid)).toBe(1900);
    expect(evaluateGridFormulaLocal('=YEAR(60)', grid)).toBe('#VALUE!');
    expect(evaluateGridFormulaLocal('=DAY(-5)', grid)).toBe('#VALUE!');
  });

  it('keeps WORKDAY/EOMONTH/NETWORKDAYS behaviour at the boundaries', () => {
    expect(evaluateGridFormulaLocal('=WORKDAY("2026-09-04", 2)', grid)).toBe('2026-09-08');
    expect(evaluateGridFormulaLocal('=WORKDAY("2026-09-04", 2, "2026-09-07")', grid)).toBe('2026-09-09');
    expect(evaluateGridFormulaLocal('=NETWORKDAYS("2026-09-07", "2026-09-11")', grid)).toBe(5);
    expect(evaluateGridFormulaLocal('=EOMONTH("2024-01-15", 1)', grid)).toBe('2024-02-29');
    expect(evaluateGridFormulaLocal('=WEEKDAY("2026-09-12", 2)', grid)).toBe(6);
    expect(evaluateGridFormulaLocal('=WEEKDAY("2026-09-12", 4)', grid)).toBe('#NUM!');
  });

  it('rejects a hostile WORKDAY span with a typed limit error rather than hanging', () => {
    const start = Date.now();
    const result = evaluateGridFormulaLocal('=WORKDAY("2026-09-04", 4000000)', grid);
    expect(result).toBe('#NUM!');
    expect(Date.now() - start).toBeLessThan(1_000);
  });
});
