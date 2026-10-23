// STATUS: DIAMANT VGT SUPREME
// Dynamic-array lookup domain isolated from scalar info/lookup functions.
import { FormulaValue, SingleFormulaValue, FormulaArray, toSingleValue } from './gridFormulaTypes';
import { flattenToScalars } from './gridFormulaMath';
import { normalizeToArray2D } from './gridFormulaArrayUtils';

export function evalDynamicArrayInfoFunction(name:string,args:FormulaValue[],options?:{volatilePolicy?:'runtime'|'disabled';random?:()=>number}):FormulaValue|undefined {
  switch(name) {
    case 'SEQUENCE': {
      const rows = Math.max(1, Math.floor(Number(toSingleValue(args[0]) ?? 1)));
      const cols = Math.max(1, Math.floor(Number(toSingleValue(args[1]) ?? 1)));
      const start = Number(toSingleValue(args[2]) ?? 1);
      const step = Number(toSingleValue(args[3]) ?? 1);

      const grid: FormulaArray = [];
      let current = start;
      for (let r = 0; r < rows; r++) {
        const row: SingleFormulaValue[] = [];
        for (let c = 0; c < cols; c++) {
          row.push(current);
          current += step;
        }
        grid.push(row);
      }
      return grid;
    }

    case 'RANDARRAY': {
      if (options?.volatilePolicy === 'disabled') return '#N/A';
      const rows = Math.max(1, Math.floor(Number(toSingleValue(args[0]) ?? 1)));
      const cols = Math.max(1, Math.floor(Number(toSingleValue(args[1]) ?? 1)));
      if (rows * cols > 100_000) return '#CALC!';
      const min = Number(toSingleValue(args[2]) ?? 0);
      const max = Number(toSingleValue(args[3]) ?? 1);
      const whole = Boolean(toSingleValue(args[4]));
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return '#NUM!';
      const random = options?.random ?? Math.random;

      const grid: FormulaArray = [];
      for (let r = 0; r < rows; r++) {
        const row: SingleFormulaValue[] = [];
        for (let c = 0; c < cols; c++) {
          const rand = random() * (max - min) + min;
          row.push(whole ? Math.round(rand) : rand);
        }
        grid.push(row);
      }
      return grid;
    }

    case 'UNIQUE': {
      if (!args.length) return '#VALUE!';
      const matrix = normalizeToArray2D(args[0]);
      const byCol = Boolean(toSingleValue(args[1]));
      const exactlyOnce = Boolean(toSingleValue(args[2]));

      if (!byCol) {
        const counts = new Map<string, { row: SingleFormulaValue[]; count: number }>();
        for (const row of matrix) {
          const key = JSON.stringify(row);
          const entry = counts.get(key);
          if (entry) entry.count++;
          else counts.set(key, { row, count: 1 });
        }
        const result: FormulaArray = [];
        counts.forEach(e => {
          if (!exactlyOnce || e.count === 1) result.push(e.row);
        });
        return result.length ? result : '#CALC!';
      } else {
        const numCols = matrix[0]?.length ?? 0;
        const colVectors: SingleFormulaValue[][] = [];
        for (let c = 0; c < numCols; c++) {
          colVectors.push(matrix.map(r => r[c]));
        }
        const counts = new Map<string, { col: SingleFormulaValue[]; count: number }>();
        for (const col of colVectors) {
          const key = JSON.stringify(col);
          const entry = counts.get(key);
          if (entry) entry.count++;
          else counts.set(key, { col, count: 1 });
        }
        const filteredCols: SingleFormulaValue[][] = [];
        counts.forEach(e => {
          if (!exactlyOnce || e.count === 1) filteredCols.push(e.col);
        });
        if (!filteredCols.length) return '#CALC!';
        const numRows = matrix.length;
        const result: FormulaArray = [];
        for (let r = 0; r < numRows; r++) {
          result.push(filteredCols.map(c => c[r]));
        }
        return result;
      }
    }

    case 'SORT': {
      if (!args.length) return '#VALUE!';
      const matrix = normalizeToArray2D(args[0]);
      const sortIdx = Math.max(1, Math.floor(Number(toSingleValue(args[1]) ?? 1))) - 1;
      const sortOrder = Number(toSingleValue(args[2]) ?? 1) >= 0 ? 1 : -1;
      const byCol = Boolean(toSingleValue(args[3]));

      if (!byCol) {
        const cloned = matrix.map(r => [...r]);
        cloned.sort((a, b) => {
          const valA = a[sortIdx];
          const valB = b[sortIdx];
          const numA = Number(valA);
          const numB = Number(valB);
          if (!isNaN(numA) && !isNaN(numB)) {
            return (numA - numB) * sortOrder;
          }
          return String(valA ?? '').localeCompare(String(valB ?? '')) * sortOrder;
        });
        return cloned;
      } else {
        const numCols = matrix[0]?.length ?? 0;
        const colIndices = Array.from({ length: numCols }, (_, i) => i);
        colIndices.sort((c1, c2) => {
          const valA = matrix[sortIdx]?.[c1];
          const valB = matrix[sortIdx]?.[c2];
          const numA = Number(valA);
          const numB = Number(valB);
          if (!isNaN(numA) && !isNaN(numB)) {
            return (numA - numB) * sortOrder;
          }
          return String(valA ?? '').localeCompare(String(valB ?? '')) * sortOrder;
        });
        return matrix.map(row => colIndices.map(c => row[c]));
      }
    }

    case 'SORTBY': {
      if (args.length < 2) return '#VALUE!';
      const matrix = normalizeToArray2D(args[0]);
      const byList = flattenToScalars(args[1]);
      const sortOrder = args.length > 2 && Number(toSingleValue(args[2])) < 0 ? -1 : 1;

      const items = matrix.map((row, idx) => ({ row, key: byList[idx] }));
      items.sort((a, b) => {
        const numA = Number(a.key);
        const numB = Number(b.key);
        if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * sortOrder;
        return String(a.key ?? '').localeCompare(String(b.key ?? '')) * sortOrder;
      });
      return items.map(item => item.row);
    }

    case 'FILTER': {
      if (args.length < 2) return '#VALUE!';
      const matrix = normalizeToArray2D(args[0]);
      const includes = flattenToScalars(args[1]);
      const ifEmpty = args.length > 2 ? toSingleValue(args[2]) : '#CALC!';

      const filtered: FormulaArray = [];
      for (let r = 0; r < matrix.length; r++) {
        if (Boolean(includes[r])) {
          filtered.push(matrix[r]);
        }
      }
      return filtered.length > 0 ? filtered : ifEmpty;
    }

    case 'TAKE': {
      if (args.length < 2) return '#VALUE!';
      const matrix = normalizeToArray2D(args[0]);
      const numRows = Math.floor(Number(toSingleValue(args[1])));
      const numCols = args.length > 2 ? Math.floor(Number(toSingleValue(args[2]))) : undefined;

      let rowsTaken: FormulaArray;
      if (isNaN(numRows) || numRows === 0) return '#VALUE!';
      if (numRows > 0) {
        rowsTaken = matrix.slice(0, numRows);
      } else {
        rowsTaken = matrix.slice(Math.max(0, matrix.length + numRows));
      }

      if (numCols === undefined || isNaN(numCols)) return rowsTaken;
      if (numCols === 0) return '#VALUE!';

      return rowsTaken.map(row => {
        if (numCols > 0) return row.slice(0, numCols);
        return row.slice(Math.max(0, row.length + numCols));
      });
    }

    case 'DROP': {
      if (args.length < 2) return '#VALUE!';
      const matrix = normalizeToArray2D(args[0]);
      const dropRows = Math.floor(Number(toSingleValue(args[1])));
      const dropCols = args.length > 2 ? Math.floor(Number(toSingleValue(args[2]))) : 0;

      if (isNaN(dropRows)) return '#VALUE!';
      let rowsRemaining: FormulaArray;
      if (dropRows > 0) {
        rowsRemaining = matrix.slice(dropRows);
      } else if (dropRows < 0) {
        rowsRemaining = matrix.slice(0, Math.max(0, matrix.length + dropRows));
      } else {
        rowsRemaining = matrix;
      }

      if (rowsRemaining.length === 0) return '#CALC!';
      if (dropCols === 0) return rowsRemaining;

      const result = rowsRemaining.map(row => {
        if (dropCols > 0) return row.slice(dropCols);
        return row.slice(0, Math.max(0, row.length + dropCols));
      });
      return result[0]?.length ? result : '#CALC!';
    }

    case 'CHOOSECOLS': {
      if (args.length < 2) return '#VALUE!';
      const matrix = normalizeToArray2D(args[0]);
      const totalCols = matrix[0]?.length ?? 0;
      const colIndices: number[] = [];

      for (let i = 1; i < args.length; i++) {
        const c = Math.floor(Number(toSingleValue(args[i])));
        if (isNaN(c) || c === 0 || Math.abs(c) > totalCols) return '#VALUE!';
        colIndices.push(c > 0 ? c - 1 : totalCols + c);
      }

      return matrix.map(row => colIndices.map(ci => row[ci]));
    }

    case 'CHOOSEROWS': {
      if (args.length < 2) return '#VALUE!';
      const matrix = normalizeToArray2D(args[0]);
      const totalRows = matrix.length;
      const rowIndices: number[] = [];

      for (let i = 1; i < args.length; i++) {
        const r = Math.floor(Number(toSingleValue(args[i])));
        if (isNaN(r) || r === 0 || Math.abs(r) > totalRows) return '#VALUE!';
        rowIndices.push(r > 0 ? r - 1 : totalRows + r);
      }

      return rowIndices.map(ri => matrix[ri]);
    }

    default:
      return undefined;
  }
}
