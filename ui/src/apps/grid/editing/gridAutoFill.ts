// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative AutoFill & Series Generation Engine
// Full Excel/Calc parity: Linear, Growth, Date (Day/Weekday/Month/Year), Day-of-week, Month names, Formula Reference Shifting

import { GridCell, GridSeriesType } from '../../../shared/contracts/grid/workspaceGrid';
import { parseA1, toA1 } from '../formulas/formula';
import { shiftFormulaReferences as shiftCanonicalA1References } from './gridSelection';

export const WEEKDAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS_EN_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WEEKDAYS_DE_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'October', 'November', 'Dezember',
];

export interface AutoFillResult {
  updatedCells: Record<string, GridCell>;
  filledCoords: string[];
}

/**
 * Shifts formula references by row and col delta.
 * E.g., "=A1+$B$1+C$2" with rowDelta=+1, colDelta=+2 becomes "=C2+$B$1+E$2"
 *
 * Delegates to the canonical A1 shifter in the selection engine. The former
 * private implementation here was blind to string literals and identifiers
 * (it rewrote LOG10(...) and Sheet1!A1 fragments) and clamped negative offsets
 * to A1 instead of reporting #REF!.
 */
export function shiftFormulaReferences(formula: string, rowDelta: number, colDelta: number): string {
  if (!formula.startsWith('=')) return formula;
  return shiftCanonicalA1References(formula, colDelta, rowDelta);
}

export function executeAutoFill(
  sourceCoords: string[],
  targetCoord: string,
  cells: Record<string, GridCell>,
  seriesType: GridSeriesType = 'auto'
): AutoFillResult {
  if (sourceCoords.length === 0) {
    return { updatedCells: cells, filledCoords: [] };
  }

  const parsedSources = sourceCoords
    .map((c) => ({ coord: c, ...parseA1(c)! }))
    .filter((p) => p.col !== undefined);

  const parsedTarget = parseA1(targetCoord);
  if (!parsedTarget || parsedSources.length === 0) {
    return { updatedCells: cells, filledCoords: [] };
  }

  // Determine direction
  const minCol = Math.min(...parsedSources.map((s) => s.col));
  const maxCol = Math.max(...parsedSources.map((s) => s.col));
  const minRow = Math.min(...parsedSources.map((s) => s.row));
  const maxRow = Math.max(...parsedSources.map((s) => s.row));

  const isVertical = parsedTarget.row > maxRow || parsedTarget.row < minRow;
  const isHorizontal = parsedTarget.col > maxCol || parsedTarget.col < minCol;

  const updated: Record<string, GridCell> = { ...cells };
  const filledCoords: string[] = [];

  if (isVertical && !isHorizontal) {
    // Fill vertically column by column
    const stepDirection = parsedTarget.row > maxRow ? 1 : -1;
    const startRow = stepDirection > 0 ? maxRow + 1 : minRow - 1;
    const endRow = parsedTarget.row;

    for (let c = minCol; c <= maxCol; c++) {
      // Gather source values in this column
      const colSources = parsedSources
        .filter((s) => s.col === c)
        .sort((a, b) => a.row - b.row);

      const sourceValues = colSources.map((s) => cells[s.coord] || { value: '' });
      let stepIndex = 1;

      for (let r = startRow; stepDirection > 0 ? r <= endRow : r >= endRow; r += stepDirection) {
        const destCoord = toA1(c, r);
        const nextCell = generateNextCell(sourceValues, stepIndex, stepDirection, seriesType, r - colSources[0].row, 0);
        updated[destCoord] = nextCell;
        filledCoords.push(destCoord);
        stepIndex++;
      }
    }
  } else if (isHorizontal) {
    // Fill horizontally row by row
    const stepDirection = parsedTarget.col > maxCol ? 1 : -1;
    const startCol = stepDirection > 0 ? maxCol + 1 : minCol - 1;
    const endCol = parsedTarget.col;

    for (let r = minRow; r <= maxRow; r++) {
      const rowSources = parsedSources
        .filter((s) => s.row === r)
        .sort((a, b) => a.col - b.col);

      const sourceValues = rowSources.map((s) => cells[s.coord] || { value: '' });
      let stepIndex = 1;

      for (let c = startCol; stepDirection > 0 ? c <= endCol : c >= endCol; c += stepDirection) {
        const destCoord = toA1(c, r);
        const nextCell = generateNextCell(sourceValues, stepIndex, stepDirection, seriesType, 0, c - rowSources[0].col);
        updated[destCoord] = nextCell;
        filledCoords.push(destCoord);
        stepIndex++;
      }
    }
  }

  return { updatedCells: updated, filledCoords };
}

function generateNextCell(
  sources: GridCell[],
  stepIndex: number,
  direction: number,
  seriesType: GridSeriesType,
  rowDelta: number,
  colDelta: number
): GridCell {
  const lastSource = sources[sources.length - 1] || { value: '' };

  // 1. Formula Shifting
  if (lastSource.formula) {
    return {
      ...lastSource,
      formula: shiftFormulaReferences(lastSource.formula, rowDelta, colDelta),
    };
  }

  // 2. Numeric Series
  const numericValues = sources.map((s) => Number(s.value)).filter((n) => !isNaN(n));
  if (numericValues.length === sources.length && numericValues.length > 0) {
    let nextValue: number;
    if (numericValues.length === 1) {
      if (seriesType === 'linear') {
        nextValue = numericValues[0] + direction * stepIndex;
      } else {
        nextValue = numericValues[0]; // Repeat by default
      }
    } else {
      if (seriesType === 'growth') {
        const ratio = numericValues[numericValues.length - 1] / (numericValues[numericValues.length - 2] || 1);
        nextValue = numericValues[numericValues.length - 1] * Math.pow(ratio, stepIndex);
      } else {
        // Linear difference
        const diff = (numericValues[numericValues.length - 1] - numericValues[0]) / (numericValues.length - 1);
        nextValue = numericValues[numericValues.length - 1] + diff * stepIndex * direction;
      }
    }
    return {
      ...lastSource,
      value: Math.round(nextValue * 1e8) / 1e8,
    };
  }

  // 3. Day of week lists
  const lastStr = String(lastSource.value).trim();
  const dayIndexEn = WEEKDAYS_EN.findIndex((d) => d.toLowerCase() === lastStr.toLowerCase());
  if (dayIndexEn !== -1) {
    const nextIdx = (dayIndexEn + direction * stepIndex) % 7;
    const normalizedIdx = nextIdx < 0 ? nextIdx + 7 : nextIdx;
    return { ...lastSource, value: WEEKDAYS_EN[normalizedIdx] };
  }

  const dayIndexDe = WEEKDAYS_DE.findIndex((d) => d.toLowerCase() === lastStr.toLowerCase());
  if (dayIndexDe !== -1) {
    const nextIdx = (dayIndexDe + direction * stepIndex) % 7;
    const normalizedIdx = nextIdx < 0 ? nextIdx + 7 : nextIdx;
    return { ...lastSource, value: WEEKDAYS_DE[normalizedIdx] };
  }

  // 4. Month names
  const monthIdxEn = MONTHS_EN.findIndex((m) => m.toLowerCase() === lastStr.toLowerCase());
  if (monthIdxEn !== -1) {
    const nextIdx = (monthIdxEn + direction * stepIndex) % 12;
    const normalizedIdx = nextIdx < 0 ? nextIdx + 12 : nextIdx;
    return { ...lastSource, value: MONTHS_EN[normalizedIdx] };
  }

  const monthIdxDe = MONTHS_DE.findIndex((m) => m.toLowerCase() === lastStr.toLowerCase());
  if (monthIdxDe !== -1) {
    const nextIdx = (monthIdxDe + direction * stepIndex) % 12;
    const normalizedIdx = nextIdx < 0 ? nextIdx + 12 : nextIdx;
    return { ...lastSource, value: MONTHS_DE[normalizedIdx] };
  }

  // 5. ISO Date series. UTC-only to avoid host timezone/DST drift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastStr)) {
    const date = new Date(`${lastStr}T00:00:00Z`);
    if (!isNaN(date.getTime())) {
      if (seriesType === 'date-month') {
        const day = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + direction * stepIndex);
        const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(day, lastDay));
      } else if (seriesType === 'date-year') {
        const month = date.getUTCMonth(), day = date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCFullYear(date.getUTCFullYear() + direction * stepIndex);
        date.setUTCMonth(month);
        const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(day, lastDay));
      } else if (seriesType === 'date-weekday') {
        let remaining = stepIndex;
        while (remaining > 0) {
          date.setUTCDate(date.getUTCDate() + direction);
          const weekday = date.getUTCDay();
          if (weekday !== 0 && weekday !== 6) remaining -= 1;
        }
      } else {
        date.setUTCDate(date.getUTCDate() + direction * stepIndex);
      }
      return { ...lastSource, value: date.toISOString().slice(0, 10), format: lastSource.format ?? 'date', dataType: lastSource.dataType ?? 'date' };
    }
  }

  // 6. Cyclic list fallback (repeat sources cyclically)
  const cyclicIndex = (stepIndex - 1) % sources.length;
  return { ...sources[cyclicIndex] };
}
