// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Info, Lookup & Dynamic Array formula domain
// Full Excel/Calc parity across XLOOKUP, XMATCH, INDEX, MATCH, VLOOKUP, HLOOKUP, OFFSET, CHOOSE,
// FILTER, SORT, SORTBY, UNIQUE, SEQUENCE, RANDARRAY, TAKE, DROP, CHOOSECOLS, CHOOSEROWS

import { FormulaValue, isFormulaArray, toSingleValue, formulaErrorTypeCode, type SingleFormulaValue } from './gridFormulaTypes';
import { flattenToScalars, matchesCriteria } from './gridFormulaMath';
import { formulaStrictEquals } from './gridFormulaExpressionUtils';

export { normalizeToArray2D } from './gridFormulaArrayUtils';
import { normalizeToArray2D } from './gridFormulaArrayUtils';
import { evalDynamicArrayInfoFunction } from './gridFormulaDynamicLookup';

/**
 * Exact-match comparison for lookup functions. Type-strict: the number 1 does not match
 * the text "1", matching Excel's lookup semantics (unlike `SUMIF` criteria).
 */
function exactLookupMatch(candidate: SingleFormulaValue, lookup: SingleFormulaValue): boolean {
  return formulaStrictEquals(candidate, lookup);
}

/** Wildcard-aware comparison used by `match_mode`/`match_type` 2. */
function wildcardLookupMatch(candidate: SingleFormulaValue, pattern: SingleFormulaValue): boolean {
  return typeof pattern === 'string' && (pattern.includes('*') || pattern.includes('?'))
    ? matchesCriteria(candidate, pattern)
    : formulaStrictEquals(candidate, pattern);
}

interface ApproximateMatch {
  readonly index: number;
}

/**
 * Selects the result of a successful `XLOOKUP` from the return array. The axis is
 * chosen by the lookup vector's orientation: horizontal lookups take the matching
 * column of a 2-D return matrix, vertical lookups take the matching row.
 */
function selectXlookupResult(
  returnArray: readonly (readonly SingleFormulaValue[])[],
  lookupIsHorizontal: boolean,
  foundIdx: number,
  ifNotFound: SingleFormulaValue,
): FormulaValue {
  const height = returnArray.length;
  const width = height > 0 ? returnArray[0].length : 0;
  if (lookupIsHorizontal) {
    if (foundIdx >= width) return ifNotFound;
    if (height === 1) return returnArray[0][foundIdx];
    return returnArray.map((row) => [row[foundIdx]]);
  }
  if (foundIdx >= height) return ifNotFound;
  const row = returnArray[foundIdx];
  return row.length === 1 ? row[0] : [[...row]];
}

/**
 * Finds the best approximate match over the whole vector instead of returning the first
 * value that satisfies the inequality. Excel's `XLOOKUP`/`XMATCH` with `match_mode`
 * -1/1 return the *largest value <= lookup* / *smallest value >= lookup*; the previous
 * first-hit scan silently returned an arbitrary entry on unsorted data.
 */
function findApproximateMatch(
  values: readonly SingleFormulaValue[],
  lookup: SingleFormulaValue,
  direction: -1 | 1,
  reverse: boolean,
): ApproximateMatch | null {
  const target = typeof lookup === 'number' ? lookup : Number(lookup);
  if (!Number.isFinite(target)) return null;
  const order = reverse
    ? Array.from({ length: values.length }, (_, i) => values.length - 1 - i)
    : Array.from({ length: values.length }, (_, i) => i);

  let exact: number | null = null;
  let best: number | null = null;
  let bestValue = direction === -1 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;

  for (const index of order) {
    const numeric = Number(values[index]);
    if (!Number.isFinite(numeric)) continue;
    if (numeric === target && exact === null) {
      exact = index;
      continue;
    }
    if (direction === -1) {
      if (numeric <= target && numeric >= bestValue) {
        bestValue = numeric;
        best = index;
      }
    } else if (numeric >= target && numeric <= bestValue) {
      bestValue = numeric;
      best = index;
    }
    void best;
  }

  const chosen = exact !== null ? exact : best;
  return chosen === null ? null : { index: chosen };
}


export function evalInfoFunction(
  name: string,
  args: FormulaValue[],
  options?: { volatilePolicy?: 'runtime' | 'disabled'; random?: () => number }
): FormulaValue | undefined {
  switch (name) {
    // --- Information Functions ---
    case 'ISBLANK': {
      const v = toSingleValue(args[0]);
      return v === null || v === undefined || v === '';
    }

    case 'ISNUMBER': {
      const v = toSingleValue(args[0]);
      return typeof v === 'number' && !isNaN(v);
    }

    case 'ISTEXT': {
      const v = toSingleValue(args[0]);
      return typeof v === 'string' && !v.startsWith('#');
    }

    case 'ISNONTEXT': {
      const v = toSingleValue(args[0]);
      return typeof v !== 'string';
    }

    case 'ISERROR': {
      const v = toSingleValue(args[0]);
      return typeof v === 'string' && v.startsWith('#');
    }

    case 'ISERR': {
      const v = toSingleValue(args[0]);
      return typeof v === 'string' && v.startsWith('#') && v !== '#N/A' && v !== '#N/A!';
    }

    case 'ISNA': {
      const v = toSingleValue(args[0]);
      return v === '#N/A' || v === '#N/A!';
    }

    case 'ISLOGICAL': {
      const v = toSingleValue(args[0]);
      return typeof v === 'boolean';
    }

    case 'TYPE': {
      const v = args[0];
      if (isFormulaArray(v)) return 64; // Array
      if (typeof v === 'number') return 1; // Number
      if (typeof v === 'string') return v.startsWith('#') ? 16 : 2; // Error or Text
      if (typeof v === 'boolean') return 4; // Logical
      return 1;
    }

    case 'ERROR.TYPE': {
      const value = toSingleValue(args[0]);
      return formulaErrorTypeCode(value) || '#N/A';
    }

    case 'NA':
      return '#N/A';

    // --- Lookup & Choice Functions ---
    case 'CHOOSE': {
      if (args.length < 2) return '#VALUE!';
      const idx = Math.floor(Number(toSingleValue(args[0])));
      if (isNaN(idx) || idx < 1 || idx >= args.length) return '#VALUE!';
      return args[idx];
    }

    case 'INDEX': {
      if (args.length < 1) return '#VALUE!';
      const matrix = normalizeToArray2D(args[0]);
      if (args.length === 1) return matrix;
      const rows = matrix.length;
      const cols = rows > 0 ? matrix[0].length : 0;

      let rowNumber = Math.trunc(Number(toSingleValue(args[1])));
      let columnNumber = args.length > 2 ? Math.trunc(Number(toSingleValue(args[2]))) : undefined;
      if (!Number.isFinite(rowNumber)) return '#VALUE!';
      if (columnNumber !== undefined && !Number.isFinite(columnNumber)) return '#VALUE!';

      // Vector form: a single row or single column accepts the index in row_num and
      // returns the nth element. Only a true 2-D matrix requires both indices.
      if (columnNumber === undefined && rows === 1 && cols > 1) {
        columnNumber = rowNumber;
        rowNumber = 1;
      }
      if (rowNumber < 0 || (columnNumber !== undefined && columnNumber < 0)) return '#VALUE!';

      if (rowNumber === 0) {
        if (columnNumber === undefined) return matrix;
        if (columnNumber === 0) return matrix;
        if (columnNumber > cols) return '#REF!';
        return matrix.map((row) => [row[columnNumber - 1]]);
      }
      if (rowNumber > rows) return '#REF!';
      const row = matrix[rowNumber - 1];
      if (columnNumber === undefined || columnNumber === 0) {
        return row.length === 1 ? row[0] : [row];
      }
      if (columnNumber > row.length) return '#REF!';
      return row[columnNumber - 1];
    }

    case 'MATCH': {
      if (args.length < 2) return '#VALUE!';
      const lookupVal = toSingleValue(args[0]);
      const list = flattenToScalars(args[1]);
      const matchType = args.length > 2 ? Number(toSingleValue(args[2])) : 1;

      if (matchType === 0) {
        for (let i = 0; i < list.length; i++) {
          if (exactLookupMatch(list[i], lookupVal)) return i + 1;
        }
        return '#N/A';
      }

      if (matchType === 1) {
        // Largest value <= lookup (ascending data), never a first-hit guess.
        const found = findApproximateMatch(list, lookupVal, -1, false);
        return found ? found.index + 1 : '#N/A';
      }

      if (matchType === -1) {
        // Smallest value >= lookup (descending data).
        const found = findApproximateMatch(list, lookupVal, 1, false);
        return found ? found.index + 1 : '#N/A';
      }

      return '#N/A';
    }

    case 'XMATCH': {
      if (args.length < 2) return '#VALUE!';
      const lookupVal = toSingleValue(args[0]);
      const list = flattenToScalars(args[1]);
      const matchMode = args.length > 2 ? Number(toSingleValue(args[2])) : 0;
      const searchMode = args.length > 3 ? Number(toSingleValue(args[3])) : 1;
      const reverse = searchMode === -1;
      const indices = reverse
        ? Array.from({ length: list.length }, (_, i) => list.length - 1 - i)
        : Array.from({ length: list.length }, (_, i) => i);

      if (matchMode === 2) {
        for (const i of indices) if (wildcardLookupMatch(list[i], lookupVal)) return i + 1;
        return '#N/A';
      }
      if (matchMode === 0) {
        for (const i of indices) if (exactLookupMatch(list[i], lookupVal)) return i + 1;
        return '#N/A';
      }
      if (matchMode === -1 || matchMode === 1) {
        const found = findApproximateMatch(list, lookupVal, matchMode, reverse);
        return found ? found.index + 1 : '#N/A';
      }
      return '#VALUE!';
    }

    case 'VLOOKUP': {
      if (args.length < 3) return '#VALUE!';
      const lookupVal = toSingleValue(args[0]);
      const table = normalizeToArray2D(args[1]);
      const colIdx = Math.floor(Number(toSingleValue(args[2]))) - 1;
      const rangeLookup = args.length > 3 ? Boolean(toSingleValue(args[3])) : true;

      if (colIdx < 0 || (table.length > 0 && colIdx >= table[0].length)) return '#REF!';

      if (!rangeLookup) {
        for (let r = 0; r < table.length; r++) {
          if (matchesCriteria(table[r][0], lookupVal)) {
            return table[r][colIdx];
          }
        }
        return '#N/A';
      }

      let bestRow = -1;
      const targetNum = Number(lookupVal);
      for (let r = 0; r < table.length; r++) {
        const first = table[r][0];
        const fNum = Number(first);
        if (!isNaN(fNum) && !isNaN(targetNum)) {
          if (fNum <= targetNum) bestRow = r;
        } else if (String(first ?? '').toLowerCase() <= String(lookupVal ?? '').toLowerCase()) {
          bestRow = r;
        }
      }
      return bestRow >= 0 ? table[bestRow][colIdx] : '#N/A';
    }

    case 'HLOOKUP': {
      if (args.length < 3) return '#VALUE!';
      const lookupVal = toSingleValue(args[0]);
      const table = normalizeToArray2D(args[1]);
      const rowIdx = Math.floor(Number(toSingleValue(args[2]))) - 1;
      const rangeLookup = args.length > 3 ? Boolean(toSingleValue(args[3])) : true;

      if (rowIdx < 0 || rowIdx >= table.length) return '#REF!';
      const numCols = table[0]?.length ?? 0;

      if (!rangeLookup) {
        for (let c = 0; c < numCols; c++) {
          if (matchesCriteria(table[0][c], lookupVal)) {
            return table[rowIdx][c];
          }
        }
        return '#N/A';
      }

      let bestCol = -1;
      const targetNum = Number(lookupVal);
      for (let c = 0; c < numCols; c++) {
        const top = table[0][c];
        const tNum = Number(top);
        if (!isNaN(tNum) && !isNaN(targetNum)) {
          if (tNum <= targetNum) bestCol = c;
        } else if (String(top ?? '').toLowerCase() <= String(lookupVal ?? '').toLowerCase()) {
          bestCol = c;
        }
      }
      return bestCol >= 0 ? table[rowIdx][bestCol] : '#N/A';
    }

    case 'XLOOKUP': {
      if (args.length < 3) return '#VALUE!';
      const lookupVal = toSingleValue(args[0]);
      const lookupMatrix = normalizeToArray2D(args[1]);
      // The lookup vector's orientation decides which axis of the return array is
      // indexed: a horizontal lookup returns the matching *column*, a vertical lookup
      // the matching *row*. Indexing rows unconditionally made every horizontal
      // XLOOKUP return #N/A / the if_not_found value.
      const lookupIsHorizontal = lookupMatrix.length === 1 && (lookupMatrix[0]?.length ?? 0) > 1;
      const lookupArray: SingleFormulaValue[] = lookupIsHorizontal
        ? [...lookupMatrix[0]]
        : lookupMatrix.map((row) => row[0] ?? null);
      const returnArray = normalizeToArray2D(args[2]);
      const ifNotFound = args.length > 3 ? toSingleValue(args[3]) : '#N/A';
      const matchMode = args.length > 4 ? Number(toSingleValue(args[4])) : 0;
      const searchMode = args.length > 5 ? Number(toSingleValue(args[5])) : 1;
      const reverse = searchMode === -1;
      const indices = reverse
        ? Array.from({ length: lookupArray.length }, (_, i) => lookupArray.length - 1 - i)
        : Array.from({ length: lookupArray.length }, (_, i) => i);

      let foundIdx = -1;
      if (matchMode === 0) {
        for (const i of indices) {
          if (exactLookupMatch(lookupArray[i], lookupVal)) {
            foundIdx = i;
            break;
          }
        }
      } else if (matchMode === 2) {
        for (const i of indices) {
          if (wildcardLookupMatch(lookupArray[i], lookupVal)) {
            foundIdx = i;
            break;
          }
        }
      } else if (matchMode === -1 || matchMode === 1) {
        const found = findApproximateMatch(lookupArray, lookupVal, matchMode, reverse);
        foundIdx = found ? found.index : -1;
      } else {
        return '#VALUE!';
      }

      if (foundIdx < 0) return ifNotFound;
      return selectXlookupResult(returnArray, lookupIsHorizontal, foundIdx, ifNotFound);
    }

    default:
      return evalDynamicArrayInfoFunction(name, args, options);

  }
}
