// STATUS: PLATIN — Dynamic Formula Evaluation Engine for Writer Table Cells
import type { WriterTableBlockData } from '../../../../shared/contracts/workspace';

export interface EvaluatedTableResult {
  table: WriterTableBlockData;
  evaluatedValues: Record<string, string>; // cellId -> computed display value
}

/**
 * Extracts numeric value from a cell string, tolerating German comma, currency signs and spaces.
 */
export function parseCellNumber(val: string): number | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed.startsWith('=')) return null;

  const cleaned = trimmed.replace(/[^0-9,.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;

  let normalized = cleaned;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  if (hasDot && hasComma) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }

  const num = Number.parseFloat(normalized);
  return Number.isNaN(num) ? null : num;
}

/**
 * Collects numeric values above, left, below, or right of a cell.
 */
function collectDirectionalNumbers(
  table: WriterTableBlockData,
  currentRow: number,
  currentCol: number,
  direction: 'ABOVE' | 'LEFT' | 'BELOW' | 'RIGHT',
  resolvedValues: Record<string, string>
): number[] {
  const numbers: number[] = [];

  if (direction === 'ABOVE') {
    for (let r = currentRow - 1; r >= 0; r--) {
      const cell = table.rows[r]?.cells[currentCol];
      if (!cell) continue;
      const raw = resolvedValues[cell.id] ?? cell.content;
      const num = parseCellNumber(raw);
      if (num !== null) {
        numbers.unshift(num);
      } else if (cell.content.trim() && !cell.content.startsWith('=')) {
        // Stop at non-numeric header/label text when scanning upwards
        break;
      }
    }
  } else if (direction === 'LEFT') {
    for (let c = currentCol - 1; c >= 0; c--) {
      const cell = table.rows[currentRow]?.cells[c];
      if (!cell) continue;
      const raw = resolvedValues[cell.id] ?? cell.content;
      const num = parseCellNumber(raw);
      if (num !== null) {
        numbers.unshift(num);
      } else if (cell.content.trim() && !cell.content.startsWith('=')) {
        break;
      }
    }
  } else if (direction === 'BELOW') {
    for (let r = currentRow + 1; r < table.rows.length; r++) {
      const cell = table.rows[r]?.cells[currentCol];
      if (!cell) continue;
      const raw = resolvedValues[cell.id] ?? cell.content;
      const num = parseCellNumber(raw);
      if (num !== null) numbers.push(num);
    }
  } else if (direction === 'RIGHT') {
    for (let c = currentCol + 1; c < table.columns.length; c++) {
      const cell = table.rows[currentRow]?.cells[c];
      if (!cell) continue;
      const raw = resolvedValues[cell.id] ?? cell.content;
      const num = parseCellNumber(raw);
      if (num !== null) numbers.push(num);
    }
  }

  return numbers;
}

/**
 * Parses coordinate A1, B2 to row/col index (0-based).
 */
function parseCoordinate(coord: string): { row: number; col: number } | null {
  const match = coord.trim().toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
  if (!match) return null;
  const letters = match[1];
  const rowNum = parseInt(match[2], 10) - 1;

  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { row: rowNum, col: col - 1 };
}

/**
 * Computes the aggregate function result.
 */
function computeAggregate(fn: string, numbers: number[]): number {
  if (numbers.length === 0) return 0;

  switch (fn.toUpperCase()) {
    case 'SUM':
      return numbers.reduce((a, b) => a + b, 0);
    case 'AVERAGE':
    case 'AVG':
      return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    case 'COUNT':
      return numbers.length;
    case 'MIN':
      return Math.min(...numbers);
    case 'MAX':
      return Math.max(...numbers);
    case 'PRODUCT':
      return numbers.reduce((a, b) => a * b, 1);
    default:
      return 0;
  }
}

/**
 * Evaluates a single formula expression for a cell at (rIdx, cIdx).
 */
export function evaluateSingleFormula(
  formulaExpr: string,
  table: WriterTableBlockData,
  rIdx: number,
  cIdx: number,
  resolvedValues: Record<string, string>
): string {
  const expr = formulaExpr.trim().replace(/^=/, '').trim();
  if (!expr) return '';

  // 1. Check directional aggregate: FUNCTION(ABOVE|LEFT|BELOW|RIGHT)
  const dirMatch = expr.match(/^(SUM|AVERAGE|AVG|COUNT|MIN|MAX|PRODUCT)\((ABOVE|LEFT|BELOW|RIGHT)\)$/i);
  if (dirMatch) {
    const fn = dirMatch[1].toUpperCase();
    const dir = dirMatch[2].toUpperCase() as 'ABOVE' | 'LEFT' | 'BELOW' | 'RIGHT';
    const nums = collectDirectionalNumbers(table, rIdx, cIdx, dir, resolvedValues);
    const result = computeAggregate(fn, nums);
    return Number.isInteger(result) ? result.toString() : result.toFixed(2);
  }

  // 2. Check range aggregate: FUNCTION(A1:B3)
  const rangeMatch = expr.match(/^(SUM|AVERAGE|AVG|COUNT|MIN|MAX|PRODUCT)\(([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)$/i);
  if (rangeMatch) {
    const fn = rangeMatch[1].toUpperCase();
    const startCoord = parseCoordinate(rangeMatch[2]);
    const endCoord = parseCoordinate(rangeMatch[3]);
    if (startCoord && endCoord) {
      const minR = Math.min(startCoord.row, endCoord.row);
      const maxR = Math.max(startCoord.row, endCoord.row);
      const minC = Math.min(startCoord.col, endCoord.col);
      const maxC = Math.max(startCoord.col, endCoord.col);

      const nums: number[] = [];
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const cell = table.rows[r]?.cells[c];
          if (cell) {
            const raw = resolvedValues[cell.id] ?? cell.content;
            const num = parseCellNumber(raw);
            if (num !== null) nums.push(num);
          }
        }
      }
      const result = computeAggregate(fn, nums);
      return Number.isInteger(result) ? result.toString() : result.toFixed(2);
    }
  }

  // 3. Check simple arithmetic: A1 + B1 or A1 * B1
  const arithMatch = expr.match(/^([A-Z]+[0-9]+)\s*([+\-*/])\s*([A-Z]+[0-9]+)$/i);
  if (arithMatch) {
    const c1 = parseCoordinate(arithMatch[1]);
    const op = arithMatch[2];
    const c2 = parseCoordinate(arithMatch[3]);
    if (c1 && c2) {
      const cell1 = table.rows[c1.row]?.cells[c1.col];
      const cell2 = table.rows[c2.row]?.cells[c2.col];
      const n1 = cell1 ? parseCellNumber(resolvedValues[cell1.id] ?? cell1.content) ?? 0 : 0;
      const n2 = cell2 ? parseCellNumber(resolvedValues[cell2.id] ?? cell2.content) ?? 0 : 0;
      let res = 0;
      if (op === '+') res = n1 + n2;
      else if (op === '-') res = n1 - n2;
      else if (op === '*') res = n1 * n2;
      else if (op === '/' && n2 !== 0) res = n1 / n2;
      return Number.isInteger(res) ? res.toString() : res.toFixed(2);
    }
  }

  return expr;
}

/**
 * Scans all cells in the table and evaluates any formula cells.
 * Returns both the updated table (with formula output) and a fast lookup map.
 */
export function evaluateWriterTableFormulas(table: WriterTableBlockData): EvaluatedTableResult {
  const evaluatedValues: Record<string, string> = {};

  // Pass 1: populate non-formula values
  table.rows.forEach((row) => {
    row.cells.forEach((cell) => {
      const raw = cell.formula || cell.content;
      if (!raw.startsWith('=')) {
        evaluatedValues[cell.id] = cell.content;
      }
    });
  });

  // Pass 2: evaluate formulas (up to 3 passes to resolve dependencies)
  for (let pass = 0; pass < 3; pass++) {
    table.rows.forEach((row, rIdx) => {
      row.cells.forEach((cell, cIdx) => {
        const raw = (cell.formula || cell.content).trim();
        if (raw.startsWith('=')) {
          const val = evaluateSingleFormula(raw, table, rIdx, cIdx, evaluatedValues);
          evaluatedValues[cell.id] = val;
        }
      });
    });
  }

  // Generate updated table where cells with formulas display their computed values
  const nextRows = table.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => {
      const raw = (cell.formula || cell.content).trim();
      if (raw.startsWith('=')) {
        return {
          ...cell,
          formula: raw,
          content: evaluatedValues[cell.id] ?? cell.content,
        };
      }
      return cell;
    }),
  }));

  return {
    table: { ...table, rows: nextRows },
    evaluatedValues,
  };
}
