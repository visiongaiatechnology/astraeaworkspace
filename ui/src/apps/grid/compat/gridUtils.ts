// STATUS: DIAMANT VGT SUPREME
import { GridCell } from '../../../shared/contracts/workspace';
import {
  describeGridNumberFormatSection,
  formatGridNumberFormatDate,
  formatGridNumberFormatFraction,
  formatGridNumberFormatScientific,
  gridNumberFormatDateValue,
  gridNumberFormatIsFraction,
  gridNumberFormatScalesByHundred,
  isValidGridNumberFormatCode,
  parseGridNumberFormatPlaceholder,
  type GridNumberFormatSection,
} from '../formatting/gridNumberFormat';

/**
 * Legacy compatibility wrapper. New code should use gridCsv.ts directly so
 * serialization can be unit-tested independently of browser download behavior.
 */
export const exportGridToCsv = async (
  cells: Record<string, GridCell>,
  colCount: number,
  rowCount: number,
  filename: string = 'Sovereign_Grid_Export.csv'
) => {
  const [{ buildGridCsv }, { downloadGridCsv }] = await Promise.all([
    import('../interchange/gridCsvSerialization'),
    import('../interchange/gridCsvDownload'),
  ]);
  await downloadGridCsv(buildGridCsv(cells, colCount, rowCount), filename);
};export { parseCoord } from '../core/gridCoordinate';

export function toFractionString(val: number, maxDenominator: number = 64): string {
  if (Number.isInteger(val)) return String(val);
  const sign = val < 0 ? '-' : '';
  const absVal = Math.abs(val);
  const whole = Math.floor(absVal);
  const frac = absVal - whole;
  if (frac < 1e-6) return `${sign}${whole}`;

  let bestNum = 1;
  let bestDen = 1;
  let minError = Math.abs(frac - bestNum / bestDen);
  for (let den = 2; den <= maxDenominator; den++) {
    const num = Math.round(frac * den);
    const err = Math.abs(frac - num / den);
    if (err < minError) {
      minError = err;
      bestNum = num;
      bestDen = den;
      if (err < 1e-5) break;
    }
  }
  if (whole > 0) {
    return `${sign}${whole} ${bestNum}/${bestDen}`;
  }
  return `${sign}${bestNum}/${bestDen}`;
}

const NUMBER_LOCALE = 'en-US';

function formatAbsoluteNumber(absolute: number, placeholder: string): string {
  const anatomy = parseGridNumberFormatPlaceholder(placeholder);
  if (!Number.isFinite(absolute)) return String(absolute);
  // A format whose fraction slots carry no required digits (`# ?/?`) must not be padded
  // with trailing zeros, so the minimum is clamped to the available slots.
  const maximumFractionDigits = Math.max(anatomy.minFractionDigits, anatomy.maxFractionDigits);
  const minimumFractionDigits = Math.min(anatomy.minFractionDigits, maximumFractionDigits);
  try {
    return new Intl.NumberFormat(NUMBER_LOCALE, {
      useGrouping: anatomy.useGrouping,
      // Negative values are always routed through the negative section, so the sign is
      // added by the caller and never by the number formatter.
      signDisplay: 'never',
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(absolute);
  } catch {
    return String(absolute);
  }
}

function renderGridNumberFormatSection(value: number, section: GridNumberFormatSection, negate: boolean): string {
  const placeholderRun = section.runs.find((run) => run.kind === 'digits');
  const placeholder = placeholderRun?.placeholder ?? '#,##0';
  const scaled = gridNumberFormatScalesByHundred(section) ? Math.abs(value) * 100 : Math.abs(value);
  const rendered = formatAbsoluteNumber(scaled, placeholder);
  const body = section.runs
    .map((run) => (run.kind === 'digits' ? rendered : (run.text ?? '')))
    .join('');
  // The sign is only added when the caller selected a fallback section. An explicit
  // negative section such as `(0.00)` or `-0.00` already expresses the sign itself.
  return negate ? `-${body}` : body;
}

function renderGridNumberFormatText(value: number | string | boolean, section: GridNumberFormatSection): string {
  return section.runs
    .map((run) => (run.kind === 'digits' ? String(value) : (run.text ?? '').replace(/@/g, String(value))))
    .join('');
}

function renderGridNumberFormat(value: number | string | boolean, code: string): string {
  const sections = code.split(';').map((section) => describeGridNumberFormatSection(section));
  const fallbackSection = sections[0] ?? describeGridNumberFormatSection('General');
  const isNumber = typeof value === 'number';
  const explicitNegative = isNumber && sections.length > 1 && value < 0 ? sections[1] : undefined;
  const explicitZero = isNumber && sections.length > 2 && value === 0 ? sections[2] : undefined;
  const selected = isNumber
    ? explicitNegative ?? explicitZero ?? fallbackSection
    : sections[3] ?? fallbackSection;
  // Only a fallback section needs the sign supplied, and never for a value of zero.
  const negate = isNumber && explicitNegative === undefined && value < 0;

  // A date code applies to date text as well as to date serials.
  if (selected.isDatePattern) {
    const date = gridNumberFormatDateValue(value, selected);
    if (date) {
      const rendered = formatGridNumberFormatDate(date, selected);
      return negate ? `-${rendered}` : rendered;
    }
  }

  if (!isNumber) {
    // `@` is the text placeholder; a text section without it prints a constant.
    if (selected.hasTextPlaceholder || selected.runs.some((run) => (run.text ?? '').includes('@'))) {
      return renderGridNumberFormatText(value, selected);
    }
    return String(value);
  }

  const scientific = formatGridNumberFormatScientific(value, selected);
  if (scientific !== null) return scientific;
  if (gridNumberFormatIsFraction(selected)) {
    const rendered = formatGridNumberFormatFraction(value, selected);
    return negate ? `-${rendered}` : rendered;
  }
  if (!selected.runs.some((run) => run.kind === 'digits')) {
    // A literal-only section is printed verbatim (for example a zero-value dash).
    return selected.runs.map((run) => run.text ?? '').join('');
  }
  return renderGridNumberFormatSection(value, selected, negate);
}

export function applyCustomNumberFormat(val: number | string | boolean, code: string): string {
  return renderGridNumberFormat(val, code);
}

/**
 * Format a cell value according to currency, percent, date, number, accounting,
 * scientific, fraction, text, or a user-supplied number-format code.
 *
 * A `numberFormatCode` always wins because it is the finer-grained statement of the same
 * fact. A code that fails `checkGridNumberFormatCode` is not interpreted at all: the cell
 * falls back to its semantic `format` instead of rendering arbitrary garbage.
 */
export const formatCellValue = (cell?: GridCell): string => {
  if (!cell || cell.value === undefined || cell.value === null) return '';

  if (cell.numberFormatCode && isValidGridNumberFormatCode(cell.numberFormatCode)) {
    return applyCustomNumberFormat(cell.value, cell.numberFormatCode);
  }

  if (cell.format === 'number' && typeof cell.value === 'number') {
    return cell.value.toLocaleString(NUMBER_LOCALE);
  }
  if (cell.format === 'currency' && typeof cell.value === 'number') {
    return `$${cell.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (cell.format === 'accounting' && typeof cell.value === 'number') {
    const formatted = Math.abs(cell.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return cell.value < 0 ? `($ ${formatted})` : `$ ${formatted} `;
  }
  if (cell.format === 'scientific' && typeof cell.value === 'number') {
    // The semantic type and the `0.00E+00` preset must render identically, so both go
    // through the same scientific formatter.
    return formatGridNumberFormatScientific(cell.value, describeGridNumberFormatSection('0.00E+00'))
      ?? cell.value.toExponential(2).toUpperCase();
  }
  if (cell.format === 'fraction' && typeof cell.value === 'number') {
    return toFractionString(cell.value);
  }
  if (cell.format === 'percent' && typeof cell.value === 'number') {
    return `${(cell.value * 100).toFixed(1)}%`;
  }
  if (cell.format === 'date') {
    const date = new Date(cell.value as string | number);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString();
  }
  if (cell.format === 'datetime') {
    const date = new Date(cell.value as string | number);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  if (cell.format === 'time') return String(cell.value);
  if (cell.format === 'duration') return String(cell.value);
  if (cell.format === 'text') {
    return String(cell.value);
  }
  if (typeof cell.value === 'number') {
    return cell.value.toLocaleString();
  }
  return String(cell.value);
};
