// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Advanced Formula Engine Domain
// Parity for Array Constants, Matrix Operations, Database Functions, Volatile Functions & Dynamic Array Transformations

import {
  FormulaValue,
  SingleFormulaValue,
  FormulaArray,
  isFormulaArray,
  toSingleValue,
} from './gridFormulaTypes';
import { matchesCriteria } from './gridFormulaMath';

/**
 * Parses an array constant string like "{1, 2, 3; 4, 5, 6}" into a 2D FormulaArray.
 */
export function parseArrayConstant(expr: string): FormulaArray | null {
  const trimmed = expr.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [[]];

  const rows: FormulaArray = [];
  const rawRows: string[] = [];

  let depth = 0;
  let inQuote = false;
  let current = '';

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === ';' && depth === 0) {
        rawRows.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim() || rawRows.length > 0) rawRows.push(current.trim());

  for (const rowStr of rawRows) {
    const rowValues: SingleFormulaValue[] = [];
    const elements: string[] = [];
    let elemCurrent = '';
    let elemInQuote = false;
    let elemDepth = 0;

    for (let j = 0; j < rowStr.length; j++) {
      const c = rowStr[j];
      if (c === '"') elemInQuote = !elemInQuote;
      if (!elemInQuote) {
        if (c === '(' || c === '{') elemDepth++;
        else if (c === ')' || c === '}') elemDepth--;
        else if (c === ',' && elemDepth === 0) {
          elements.push(elemCurrent.trim());
          elemCurrent = '';
          continue;
        }
      }
      elemCurrent += c;
    }
    if (elemCurrent.trim() || elements.length > 0) elements.push(elemCurrent.trim());

    for (const el of elements) {
      if (el.startsWith('"') && el.endsWith('"')) {
        rowValues.push(el.slice(1, -1).replace(/""/g, '"'));
      } else if (el.toUpperCase() === 'TRUE') {
        rowValues.push(true);
      } else if (el.toUpperCase() === 'FALSE') {
        rowValues.push(false);
      } else if (el === '' || el.toUpperCase() === 'NULL') {
        rowValues.push(null);
      } else {
        const num = Number(el);
        rowValues.push(!isNaN(num) ? num : el);
      }
    }
    rows.push(rowValues);
  }

  return rows;
}

/**
 * Matrix Transpose
 */
export function matrixTranspose(arg: FormulaValue): FormulaArray {
  if (!isFormulaArray(arg)) {
    return [[toSingleValue(arg)]];
  }
  const rows = arg.length;
  if (rows === 0) return [[]];
  const cols = arg[0].length;
  const result: FormulaArray = [];

  for (let c = 0; c < cols; c++) {
    const newRow: SingleFormulaValue[] = [];
    for (let r = 0; r < rows; r++) {
      newRow.push(arg[r][c] ?? null);
    }
    result.push(newRow);
  }
  return result;
}

/**
 * Matrix Multiplication (MMULT)
 */
export function matrixMultiply(a: FormulaValue, b: FormulaValue): FormulaValue {
  const matA: FormulaArray = isFormulaArray(a) ? a : [[toSingleValue(a)]];
  const matB: FormulaArray = isFormulaArray(b) ? b : [[toSingleValue(b)]];

  const rA = matA.length;
  const cA = rA > 0 ? matA[0].length : 0;
  const rB = matB.length;
  const cB = rB > 0 ? matB[0].length : 0;

  if (cA !== rB || rA === 0 || cB === 0) {
    return '#VALUE!';
  }

  const result: FormulaArray = [];
  for (let i = 0; i < rA; i++) {
    const row: SingleFormulaValue[] = [];
    for (let j = 0; j < cB; j++) {
      let sum = 0;
      for (let k = 0; k < cA; k++) {
        const valA = Number(matA[i][k] ?? 0);
        const valB = Number(matB[k][j] ?? 0);
        if (isNaN(valA) || isNaN(valB)) return '#VALUE!';
        sum += valA * valB;
      }
      row.push(sum);
    }
    result.push(row);
  }

  return result.length === 1 && result[0].length === 1 ? result[0][0] : result;
}

/**
 * Matrix Determinant (MDETERM) via LU decomposition with partial pivoting
 */
export function matrixDeterminant(arg: FormulaValue): FormulaValue {
  if (!isFormulaArray(arg)) return '#VALUE!';
  const n = arg.length;
  if (n === 0 || arg.some((row) => row.length !== n)) return '#VALUE!';

  // Copy matrix to float array
  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const v = Number(arg[i][j]);
      if (isNaN(v)) return '#VALUE!';
      row.push(v);
    }
    A.push(row);
  }

  let det = 1;
  let pivotSign = 1;

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    let maxVal = Math.abs(A[i][i]);
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > maxVal) {
        maxVal = Math.abs(A[r][i]);
        maxRow = r;
      }
    }

    if (maxVal < 1e-12) return 0;

    if (maxRow !== i) {
      const tmp = A[i];
      A[i] = A[maxRow];
      A[maxRow] = tmp;
      pivotSign = -pivotSign;
    }

    det *= A[i][i];

    for (let r = i + 1; r < n; r++) {
      const factor = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) {
        A[r][c] -= factor * A[i][c];
      }
    }
  }

  return Math.round(det * pivotSign * 1e10) / 1e10;
}

/**
 * Matrix Inversion (MINVERSE) via Gauss-Jordan elimination
 */
export function matrixInverse(arg: FormulaValue): FormulaValue {
  if (!isFormulaArray(arg)) return '#VALUE!';
  const n = arg.length;
  if (n === 0 || arg.some((row) => row.length !== n)) return '#VALUE!';

  // Augmented matrix [A | I]
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const v = Number(arg[i][j]);
      if (isNaN(v)) return '#VALUE!';
      row.push(v);
    }
    for (let j = 0; j < n; j++) {
      row.push(i === j ? 1 : 0);
    }
    M.push(row);
  }

  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    let maxVal = Math.abs(M[i][i]);
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > maxVal) {
        maxVal = Math.abs(M[r][i]);
        maxRow = r;
      }
    }

    if (maxVal < 1e-12) return '#NUM!'; // Singular matrix

    if (maxRow !== i) {
      const tmp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = tmp;
    }

    const diag = M[i][i];
    for (let c = 0; c < 2 * n; c++) {
      M[i][c] /= diag;
    }

    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = M[r][i];
      for (let c = 0; c < 2 * n; c++) {
        M[r][c] -= factor * M[i][c];
      }
    }
  }

  const result: FormulaArray = [];
  for (let i = 0; i < n; i++) {
    const row: SingleFormulaValue[] = [];
    for (let j = 0; j < n; j++) {
      row.push(Math.round(M[i][n + j] * 1e10) / 1e10);
    }
    result.push(row);
  }
  return result;
}

/**
 * Resolves column index for database functions from field parameter
 */
function resolveDatabaseFieldCol(
  field: SingleFormulaValue,
  headers: SingleFormulaValue[]
): number {
  if (typeof field === 'number') {
    const idx = Math.floor(field) - 1;
    return idx >= 0 && idx < headers.length ? idx : -1;
  }
  const fStr = String(field ?? '').toLowerCase().trim();
  return headers.findIndex((h) => String(h ?? '').toLowerCase().trim() === fStr);
}

/**
 * Evaluates whether a database row satisfies a criteria range.
 * Multiple criteria rows are OR'ed; criteria within a row are AND'ed.
 */
function matchDatabaseCriteria(
  rowValues: SingleFormulaValue[],
  headers: SingleFormulaValue[],
  criteriaMat: FormulaArray
): boolean {
  if (criteriaMat.length < 2) return true;
  const critHeaders = criteriaMat[0];

  for (let r = 1; r < criteriaMat.length; r++) {
    let rowMatch = true;
    for (let c = 0; c < critHeaders.length; c++) {
      const critVal = criteriaMat[r][c];
      if (critVal === null || critVal === undefined || critVal === '') continue;

      const colIdx = resolveDatabaseFieldCol(critHeaders[c], headers);
      if (colIdx === -1) {
        rowMatch = false;
        break;
      }

      if (!matchesCriteria(rowValues[colIdx], critVal)) {
        rowMatch = false;
        break;
      }
    }
    if (rowMatch) return true;
  }

  return false;
}

/**
 * Excel Database Functions: DSUM, DAVERAGE, DCOUNT, DCOUNTA, DMIN, DMAX
 */
export function evalDatabaseFunction(
  fnName: string,
  args: FormulaValue[]
): FormulaValue {
  if (args.length < 3) return '#VALUE!';
  const db = args[0];
  const field = toSingleValue(args[1]);
  const crit = args[2];

  if (!isFormulaArray(db) || db.length < 2) return '#VALUE!';
  if (!isFormulaArray(crit) || crit.length < 2) return '#VALUE!';

  const headers = db[0];
  const colIdx = resolveDatabaseFieldCol(field, headers);
  if (colIdx === -1) return '#VALUE!';

  const matchedValues: SingleFormulaValue[] = [];
  for (let r = 1; r < db.length; r++) {
    if (matchDatabaseCriteria(db[r], headers, crit)) {
      matchedValues.push(db[r][colIdx]);
    }
  }

  const nums = matchedValues
    .map((v) => (v !== null && v !== '' ? Number(v) : NaN))
    .filter((n) => !isNaN(n));

  switch (fnName.toUpperCase()) {
    case 'DSUM':
      return nums.reduce((a, b) => a + b, 0);
    case 'DAVERAGE':
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : '#DIV/0!';
    case 'DCOUNT':
      return nums.length;
    case 'DCOUNTA':
      return matchedValues.filter((v) => v !== null && v !== undefined && v !== '').length;
    case 'DMIN':
      return nums.length ? Math.min(...nums) : 0;
    case 'DMAX':
      return nums.length ? Math.max(...nums) : 0;
    default:
      return '#VALUE!';
  }
}

/**
 * Volatile Functions: NOW, TODAY, RAND, RANDBETWEEN
 */
export function evalVolatileFunction(fnName: string, args: FormulaValue[], policy: 'runtime'|'disabled' = 'runtime', random: () => number = Math.random): FormulaValue | undefined {
  if (policy === 'disabled' && ['RAND','RANDBETWEEN'].includes(fnName.toUpperCase())) return '#N/A';
  switch (fnName.toUpperCase()) {
    case 'RAND': {
      return random();
    }
    case 'RANDBETWEEN': {
      if (args.length < 2) return '#VALUE!';
      const min = Math.ceil(Number(toSingleValue(args[0])));
      const max = Math.floor(Number(toSingleValue(args[1])));
      if (isNaN(min) || isNaN(max)) return '#VALUE!';
      if (min > max) return '#NUM!';
      return Math.floor(random() * (max - min + 1)) + min;
    }
    default:
      return undefined;
  }
}

/**
 * Array shaping functions: SEQUENCE, CHOOSECOLS, CHOOSEROWS, TOCOL, TOROW, VSTACK, HSTACK
 */
export function evalArrayShapingFunction(fnName: string, args: FormulaValue[]): FormulaValue | undefined {
  switch (fnName.toUpperCase()) {
    case 'SEQUENCE': {
      const rows = Math.max(1, Math.floor(Number(toSingleValue(args[0]) ?? 1)));
      const cols = Math.max(1, Math.floor(Number(toSingleValue(args[1]) ?? 1)));
      if (rows * cols > 100_000) return '#CALC!';
      const start = Number(toSingleValue(args[2]) ?? 1);
      const step = Number(toSingleValue(args[3]) ?? 1);

      const grid: FormulaArray = [];
      let val = start;
      for (let r = 0; r < rows; r++) {
        const row: SingleFormulaValue[] = [];
        for (let c = 0; c < cols; c++) {
          row.push(val);
          val += step;
        }
        grid.push(row);
      }
      return grid;
    }

    case 'VSTACK': {
      const result: FormulaArray = [];
      for (const arg of args) {
        if (isFormulaArray(arg)) {
          result.push(...arg);
        } else {
          result.push([toSingleValue(arg)]);
        }
      }
      // Normalize row widths
      const maxCols = Math.max(...result.map((r) => r.length), 0);
      for (const row of result) {
        while (row.length < maxCols) row.push('#N/A');
      }
      return result;
    }

    case 'HSTACK': {
      const arrays: FormulaArray[] = args.map((arg) =>
        isFormulaArray(arg) ? arg : [[toSingleValue(arg)]]
      );
      const maxRows = Math.max(...arrays.map((a) => a.length), 0);
      const result: FormulaArray = [];

      for (let r = 0; r < maxRows; r++) {
        const combinedRow: SingleFormulaValue[] = [];
        for (const arr of arrays) {
          const row = arr[r];
          if (row) {
            combinedRow.push(...row);
          } else {
            const width = arr[0]?.length || 1;
            for (let w = 0; w < width; w++) combinedRow.push('#N/A');
          }
        }
        result.push(combinedRow);
      }
      return result;
    }

    case 'TOCOL': {
      if (!args.length) return '#VALUE!';
      const mat = isFormulaArray(args[0]) ? args[0] : [[toSingleValue(args[0])]];
      const col: FormulaArray = [];
      for (const row of mat) {
        for (const item of row) {
          col.push([item]);
        }
      }
      return col;
    }

    case 'TOROW': {
      if (!args.length) return '#VALUE!';
      const mat = isFormulaArray(args[0]) ? args[0] : [[toSingleValue(args[0])]];
      const row: SingleFormulaValue[] = [];
      for (const r of mat) {
        for (const item of r) {
          row.push(item);
        }
      }
      return [row];
    }

    default:
      return undefined;
  }
}
