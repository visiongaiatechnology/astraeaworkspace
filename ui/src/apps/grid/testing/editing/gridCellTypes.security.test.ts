import { describe, expect, it } from 'vitest';
import { mergeGridCellInput, parseGridCellInput } from '../../editing/gridCellTypes';

describe('Grid cell input numeric integrity', () => {
  it('preserves unsafe integer literals instead of silently rounding them', () => {
    const parsed = parseGridCellInput('9007199254740993');

    expect(parsed).toEqual({ value: '9007199254740993', dataType: 'text' });
  });

  it('preserves unsafe integral decimal literals instead of silently rounding them', () => {
    const parsed = parseGridCellInput('9007199254740993.0');

    expect(parsed).toEqual({ value: '9007199254740993.0', dataType: 'text' });
  });

  it('keeps integer and decimal overflow out of numeric cells', () => {
    const integer = '9'.repeat(400);
    const decimal = `${'9'.repeat(400)}.5`;

    expect(parseGridCellInput(integer)).toEqual({ value: integer, dataType: 'text' });
    expect(parseGridCellInput(decimal)).toEqual({ value: decimal, dataType: 'text' });
  });

  it('preserves nonzero decimals and percentages that underflow to zero', () => {
    const decimal = `0.${'0'.repeat(400)}1`;
    const percent = `${decimal}%`;

    expect(parseGridCellInput(decimal)).toEqual({ value: decimal, dataType: 'text' });
    expect(parseGridCellInput(percent)).toEqual({ value: percent, dataType: 'text' });
  });

  it('preserves currency values that would lose integer precision', () => {
    const currency = '$9007199254740993';

    expect(parseGridCellInput(currency)).toEqual({ value: currency, dataType: 'text' });
  });

  it('keeps an overflowing percentage out of numeric cells', () => {
    const percent = `${'9'.repeat(400)}%`;

    expect(parseGridCellInput(percent)).toEqual({ value: percent, dataType: 'text' });
  });

  it('preserves an existing currency format when a plain number is committed', () => {
    const currentCell = { value: 120000, format: 'currency' as const, dataType: 'currency' as const, numberFormatCode: '$#,##0.00' };
    const parsedInput = parseGridCellInput('654321');

    expect(mergeGridCellInput(currentCell, parsedInput)).toMatchObject({
      value: 654321,
      format: 'currency',
      dataType: 'integer',
      numberFormatCode: '$#,##0.00',
    });
    expect(mergeGridCellInput(currentCell, parseGridCellInput('654321.25'))).toMatchObject({
      value: 654321.25,
      format: 'currency',
      dataType: 'decimal',
      numberFormatCode: '$#,##0.00',
    });
  });

  it('uses an explicitly inferred format for currency and percentage input', () => {
    const currentCell = { value: 120000, format: 'currency' as const, dataType: 'currency' as const };

    expect(mergeGridCellInput(currentCell, parseGridCellInput('12%'))).toMatchObject({
      value: 0.12,
      format: 'percent',
      dataType: 'percent',
    });
    expect(mergeGridCellInput(currentCell, parseGridCellInput('$42'))).toMatchObject({
      value: 42,
      format: 'currency',
      dataType: 'currency',
    });
  });
});
