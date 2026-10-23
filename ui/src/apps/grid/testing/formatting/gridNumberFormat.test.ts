// Astraea Grid — Paket 15/16: standard and custom number formats.
//
// These tests pin the *single canonical* definition of a standard number format, so the
// toolbar button and the dialog entry can never store different cells for the same format.

import { describe, expect, it } from 'vitest';
import {
  GRID_NUMBER_FORMAT_MAX_CODE_LENGTH,
  GRID_NUMBER_FORMAT_MAX_SECTIONS,
  GRID_NUMBER_FORMAT_PRESETS,
  GRID_TOOLBAR_NUMBER_FORMAT_IDS,
  checkGridNumberFormatCode,
  describeGridNumberFormatSection,
  formatGridNumberFormatDate,
  formatGridNumberFormatScientific,
  gridNumberFormatDateValue,
  gridNumberFormatPatch,
  gridNumberFormatScalesByHundred,
  isValidGridNumberFormatCode,
  parseGridNumberFormatPlaceholder,
  parseGridNumberFormatSections,
} from '../../formatting/gridNumberFormat';
import { applyCustomNumberFormat, formatCellValue } from '../../compat/gridUtils';

describe('Grid standard number formats (Paket 15)', () => {
  it('offers every required standard format with a complete type/format operation', () => {
    const ids = GRID_NUMBER_FORMAT_PRESETS.map((preset) => preset.id);
    for (const required of ['general', 'number', 'currency', 'date', 'percent', 'time', 'fraction', 'scientific', 'text'] as const) {
      expect(ids, required).toContain(required);
    }
    for (const preset of GRID_NUMBER_FORMAT_PRESETS) {
      if (preset.id === 'general') continue;
      expect(preset.code, preset.id).toBeTypeOf('string');
      expect(checkGridNumberFormatCode(preset.code ?? '').valid, `${preset.id} code must be valid`).toBe(true);
    }
  });

  it('exposes currency, percent, number and date on the always-visible toolbar', () => {
    expect([...GRID_TOOLBAR_NUMBER_FORMAT_IDS]).toEqual(['currency', 'percent', 'number', 'date']);
    for (const id of GRID_TOOLBAR_NUMBER_FORMAT_IDS) {
      expect(GRID_NUMBER_FORMAT_PRESETS.some((preset) => preset.id === id), id).toBe(true);
    }
  });

  it('resolves a preset to both halves of the operation instead of only the semantic type', () => {
    expect(gridNumberFormatPatch('currency')).toEqual({ format: 'currency', numberFormatCode: '$#,##0.00' });
    expect(gridNumberFormatPatch('percent')).toEqual({ format: 'percent', numberFormatCode: '0.00%' });
    expect(gridNumberFormatPatch('number')).toEqual({ format: 'number', numberFormatCode: '#,##0.00' });
    expect(gridNumberFormatPatch('date')).toEqual({ format: 'date', numberFormatCode: 'yyyy-mm-dd' });
    // General must clear both halves, otherwise a stale code would survive the reset.
    expect(gridNumberFormatPatch('general')).toEqual({ format: undefined, numberFormatCode: undefined });
  });

  it('renders each preset through the one shared renderer', () => {
    expect(formatCellValue({ value: 1234.5, ...gridNumberFormatPatch('number') })).toBe('1,234.50');
    expect(formatCellValue({ value: 1234.5, ...gridNumberFormatPatch('currency') })).toBe('$1,234.50');
    expect(formatCellValue({ value: 0.185, ...gridNumberFormatPatch('percent') })).toBe('18.50%');
    expect(formatCellValue({ value: 12500, ...gridNumberFormatPatch('scientific') })).toBe('1.25E+04');
    expect(formatCellValue({ value: 2.75, ...gridNumberFormatPatch('fraction') })).toBe('2 3/4');
    expect(formatCellValue({ value: 2026, ...gridNumberFormatPatch('date') })).toBe('1905-07-18');
  });

  it('renders a date code from an ISO string and from an Excel serial', () => {
    expect(formatCellValue({ value: '2026-10-10', numberFormatCode: 'yyyy-mm-dd' })).toBe('2026-10-10');
    // 2026-10-10 is serial 46305 in the 1900 date system.
    expect(formatCellValue({ value: 46305, numberFormatCode: 'yyyy-mm-dd' })).toBe('2026-10-10');
    expect(formatCellValue({ value: 46305, numberFormatCode: 'dd.mm.yyyy' })).toBe('10.10.2026');
    expect(formatCellValue({ value: '2026-10-10', numberFormatCode: 'ddd, dd mmm yyyy' })).toBe('Sat, 10 Oct 2026');
  });

  it('throws for an unknown preset instead of silently storing nothing', () => {
    expect(() => gridNumberFormatPatch('nope' as never)).toThrow(/Unknown Grid number format preset/);
  });
});

describe('Grid custom number formats (Paket 16)', () => {
  it('honours the decimal places the user typed', () => {
    expect(applyCustomNumberFormat(1.23456, '0.000')).toBe('1.235');
    expect(applyCustomNumberFormat(1.5, '0.0000')).toBe('1.5000');
    expect(applyCustomNumberFormat(1234.5, '#,##0.00')).toBe('1,234.50');
    expect(applyCustomNumberFormat(1234567, '#,##0')).toBe('1,234,567');
  });

  it('selects the positive, negative, zero and text sections', () => {
    expect(applyCustomNumberFormat(5, '0.00;(0.00);"—";"text "@')).toBe('5.00');
    expect(applyCustomNumberFormat(-5, '0.00;(0.00);"—";"text "@')).toBe('(5.00)');
    expect(applyCustomNumberFormat(0, '0.00;(0.00);"—";"text "@')).toBe('—');
    expect(applyCustomNumberFormat('abc', '0.00;(0.00);"—";"text "@')).toBe('text abc');
  });

  it('renders percentage codes by scaling and keeping the sign', () => {
    expect(applyCustomNumberFormat(0.185, '0.00%')).toBe('18.50%');
    expect(applyCustomNumberFormat(-0.185, '0.00%')).toBe('-18.50%');
    expect(gridNumberFormatScalesByHundred(describeGridNumberFormatSection('0.00%'))).toBe(true);
    // A `%` that only lives inside a quoted literal must not scale the value.
    expect(gridNumberFormatScalesByHundred(describeGridNumberFormatSection('0.00"%"'))).toBe(false);
  });

  it('renders literals, quoted text and currency suffixes', () => {
    expect(applyCustomNumberFormat(1250.5, '#,##0.00 "€"')).toBe('1,250.50 €');
    expect(applyCustomNumberFormat(1250.5, '"USD "#,##0.00')).toBe('USD 1,250.50');
    expect(applyCustomNumberFormat(3, '0" Stück"')).toBe('3 Stück');
  });

  it('keeps the stored value untouched', () => {
    const cell = { value: 0.185, numberFormatCode: '0.00%' };
    const before = JSON.stringify(cell);
    expect(formatCellValue(cell)).toBe('18.50%');
    expect(JSON.stringify(cell)).toBe(before);
  });

  it('fails closed for a code that cannot be interpreted', () => {
    expect(checkGridNumberFormatCode('').error).toBe('empty');
    expect(checkGridNumberFormatCode('0.00"unterminated').error).toBe('unterminated-quote');
    expect(checkGridNumberFormatCode('0;0;0;0;0').error).toBe('too-many-sections');
    expect(checkGridNumberFormatCode('0'.repeat(GRID_NUMBER_FORMAT_MAX_CODE_LENGTH + 1)).error).toBe('code-too-long');
    expect(isValidGridNumberFormatCode('0.00"%"')).toBe(true);
    expect(checkGridNumberFormatCode('0;0;0;0').valid).toBe(true);
    expect(GRID_NUMBER_FORMAT_MAX_SECTIONS).toBe(4);
  });

  it('falls back to the semantic format when the stored code is invalid', () => {
    expect(formatCellValue({ value: 0.185, format: 'percent', numberFormatCode: '0.00"broken' })).toBe('18.5%');
    // A code beyond the length bound is not interpreted either: the semantic type wins.
    // Without the validity check the custom renderer would be handed the oversized code and
    // silently print the raw number with no percentage at all.
    const oversized = `${'0'.repeat(300)}%`;
    expect(checkGridNumberFormatCode(oversized).valid).toBe(false);
    expect(formatCellValue({ value: 0.185, format: 'percent', numberFormatCode: oversized })).toBe('18.5%');
  });
});

describe('Grid number-format code anatomy', () => {
  it('separates the digit placeholder from the surrounding literals', () => {
    const section = describeGridNumberFormatSection('#,##0.00 "€"');
    expect(section.runs).toEqual([
      { kind: 'digits', placeholder: '#,##0.00' },
      { kind: 'literal', text: ' €' },
    ]);
  });

  it('counts required and optional fraction digits', () => {
    expect(parseGridNumberFormatPlaceholder('#,##0.00')).toEqual({
      minIntegerDigits: 1, minFractionDigits: 2, maxFractionDigits: 2, useGrouping: true, spaceForInsignificantZeros: false,
    });
    // Without a dot the whole run is integral, so `00` still means two integer digits.
    expect(parseGridNumberFormatPlaceholder('00')).toEqual({
      minIntegerDigits: 2, minFractionDigits: 0, maxFractionDigits: 0, useGrouping: false, spaceForInsignificantZeros: false,
    });
    expect(parseGridNumberFormatPlaceholder('#,##0.##').maxFractionDigits).toBe(2);
    expect(parseGridNumberFormatPlaceholder('#,##0.##').minFractionDigits).toBe(0);
  });

  it('bounds the number of interpreted sections', () => {
    expect(parseGridNumberFormatSections('0;0;0;0;0')).toHaveLength(GRID_NUMBER_FORMAT_MAX_SECTIONS);
  });

  it('resolves month and minute tokens by context', () => {
    const date = new Date(Date.UTC(2026, 9, 10, 14, 35, 7));
    expect(formatGridNumberFormatDate(date, describeGridNumberFormatSection('hh:mm:ss'))).toBe('14:35:07');
    expect(formatGridNumberFormatDate(date, describeGridNumberFormatSection('dd.mm.yyyy'))).toBe('10.10.2026');
    expect(formatGridNumberFormatDate(date, describeGridNumberFormatSection('h:mm AM/PM'))).toBe('2:35 PM');
  });

  it('refuses to invent a date it cannot derive', () => {
    const section = describeGridNumberFormatSection('yyyy-mm-dd');
    expect(gridNumberFormatDateValue('not a date', section)).toBeNull();
    expect(gridNumberFormatDateValue(Number.NaN, section)).toBeNull();
    expect(gridNumberFormatDateValue(undefined, section)).toBeNull();
  });

  it('pads the exponent to the digit count of the pattern', () => {
    expect(formatGridNumberFormatScientific(12500, describeGridNumberFormatSection('0.00E+00'))).toBe('1.25E+04');
    expect(formatGridNumberFormatScientific(12500, describeGridNumberFormatSection('0.00E+0'))).toBe('1.25E+4');
    expect(formatGridNumberFormatScientific(0, describeGridNumberFormatSection('0.00E+00'))).toBe('0.00E+00');
    expect(formatGridNumberFormatScientific(12500, describeGridNumberFormatSection('0.00'))).toBeNull();
  });
});
