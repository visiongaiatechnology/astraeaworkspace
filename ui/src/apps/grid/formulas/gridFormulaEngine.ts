// STATUS: DIAMANT VGT SUPREME
// Legacy/test compatibility formula evaluator. Production calculation routes through Rust vgt-formula via core/formula.ts.
// Kept for regression/import fixtures and reference utilities only; do not use for persisted calculation results.

import { GridCell } from '../../../shared/contracts/workspace';
import { toA1 } from './formula';
import { parseCoord } from '../compat/gridUtils';
import { parseGridRange } from '../compat/gridProfessional';
import {
  FormulaValue,
  SingleFormulaValue,
  FormulaArray,
  FormulaError,
  isFormulaArray,
  toSingleValue,
} from './gridFormulaTypes';
import { parseArrayConstant } from './gridFormulaAdvanced';
import { splitArgs, unwrapOuterParentheses, findBinaryOperator, applyOperator, isCellRange, firstFormulaError as firstFormulaErrorValue } from './gridFormulaExpressionUtils';
import { executeGridFunction } from './gridFormulaFunctionDispatcher';
import {
  GRID_FORMULA_LIMITS,
  GridFormulaLimitError,
  clampGridFormulaLimit,
  createGridFormulaBudget,
  formulaErrorForLimit,
  isGridFormulaLimitError,
  type GridFormulaBudget,
} from './gridFormulaLimits';
import { assertReferenceCellBudget } from './gridFormulaLimits';
import { diffSpillProvenance, spillOwnershipIndex, type GridFormulaSpillProvenance } from './gridFormulaSpill';
import { invokeLambda, splitImmediateLambdaCall } from './gridFormulaLambda';

export type { FormulaValue, SingleFormulaValue, FormulaArray, FormulaError };

export type { FormulaEngineOptions, ParsedSheetRef } from './gridFormulaEngineTypes';
import type { FormulaEngineOptions } from './gridFormulaEngineTypes';
export { parseSheetReference } from './gridFormulaReferenceParsing';
import { parseSheetReference, findSheetCells, getSheetsInRange } from './gridFormulaReferenceParsing';

/**
 * Synchronous evaluation session.
 *
 * The engine is re-entrant through `resolveCell`, so a single budget must survive the
 * whole recursion instead of being recreated per cell. All evaluation is synchronous
 * (the asynchronous production path goes to the Rust core through `formula.ts`), so one
 * module-level session is safe; it is created when the outermost call starts and
 * dropped when that call returns. Depth is measured in nested evaluations, which is
 * exactly the recursion depth a hostile `=A1+A2+...` chain or a self-nesting LAMBDA
 * would try to blow up.
 */
interface GridEvaluationSession {
  /** Nested `evaluateGridFormulaLocal` entries: one per cell hop. */
  depth: number;
  /** Nested expression evaluations inside one formula. */
  expressionDepth: number;
  budget: GridFormulaBudget;
}

let activeSession: GridEvaluationSession | null = null;

function beginEvaluation(options?: FormulaEngineOptions): GridEvaluationSession {
  if (!activeSession) {
    activeSession = { depth: 0, expressionDepth: 0, budget: createGridFormulaBudget({ limits: options?.limits }) };
  }
  const session = activeSession;
  session.depth += 1;
  try {
    // Cell chains (a running balance down 500 rows) are legitimate and long; nested
    // *expressions* are bounded much tighter inside `evaluateExpression`.
    session.budget.enterCellDepth(session.depth);
  } catch (error) {
    session.depth -= 1;
    if (session.depth === 0) activeSession = null;
    throw error;
  }
  return session;
}

function endEvaluation(session: GridEvaluationSession): void {
  if (!activeSession || activeSession !== session) return;
  session.depth -= 1;
  if (session.depth <= 0) activeSession = null;
}

/** Consumes one evaluation step. A no-op outside a session (direct helper calls). */
function spend(count = 1): void {
  activeSession?.budget.spend(count);
}

function limitsOf(options?: FormulaEngineOptions) {
  return options?.limits
    ? createGridFormulaBudget({ limits: options.limits }).limits
    : GRID_FORMULA_LIMITS;
}

export function evaluateGridFormulaLocal(
  formula: string,
  cells: Record<string, GridCell>,
  visited: Set<string> = new Set(),
  allSheets?: Record<string, Record<string, GridCell>>,
  currentSheetName: string = 'Sheet1',
  variables: Record<string, FormulaValue> = {},
  options?: FormulaEngineOptions
): FormulaValue {
  const limits = limitsOf(options);
  if (formula.length > limits.maxFormulaLength) return '#CALC!';

  let session: GridEvaluationSession;
  try {
    session = beginEvaluation(options);
  } catch (error) {
    return isGridFormulaLimitError(error) ? formulaErrorForLimit(error.kind) : '#VALUE!';
  }

  // Expression nesting is measured per formula, not per cell chain: a 500-row running
  // balance must not consume the nesting budget of the row above it.
  const outerExpressionDepth = session.expressionDepth;
  session.expressionDepth = 0;

  try {
    const trimmed = formula.trim();
    if (!trimmed.startsWith('=')) {
      const num = Number(trimmed);
      return !isNaN(num) && trimmed !== '' ? num : trimmed;
    }
    const expr = trimmed.slice(1).trim();
    if (!expr) return '';
    return evaluateExpression(expr, cells, visited, allSheets, currentSheetName, variables, options);
  } catch (err) {
    if (err instanceof GridFormulaLimitError) return formulaErrorForLimit(err.kind);
    // A runaway cell chain exhausts the JavaScript stack before any step budget can
    // fire; surface it as a typed calculation error instead of leaking a RangeError.
    if (err instanceof RangeError) return '#CALC!';
    if (err instanceof Error && err.message.includes('CIRCULAR')) return '#CIRCULAR!';
    return '#VALUE!';
  } finally {
    session.expressionDepth = outerExpressionDepth;
    endEvaluation(session);
  }
}


function resolveCell(
  coord: string,
  cells: Record<string, GridCell>,
  visited: Set<string>,
  allSheets?: Record<string, Record<string, GridCell>>,
  currentSheetName: string = 'Sheet1',
  variables: Record<string, FormulaValue> = {},
  options?: FormulaEngineOptions
): FormulaValue {
  const trimmed = coord.trim();
  const parsedSheet = parseSheetReference(trimmed);

  if (parsedSheet) {
    if (parsedSheet.endSheet) {
      const sheets = getSheetsInRange(parsedSheet.startSheet, parsedSheet.endSheet, allSheets);
      if (sheets.length === 0) return '#REF!';
      const vals: FormulaValue[] = [];
      for (const s of sheets) {
        vals.push(resolveCell(parsedSheet.cellOrRange, s.cells, visited, allSheets, s.name, variables, options));
      }
      // Runde 228: Hier stand `return vals.length === 1 ? vals[0] : (vals as any);`.
      //
      // Der Cast verdeckte einen echten Widerspruch: `resolveCell` gibt
      // `FormulaValue` zurueck — EINEN Skalar. Bei mehreren Blaettern wurde
      // aber `vals` selbst zurueckgegeben, ein ARRAY. Der Aufrufer behandelt
      // den Rueckgabewert als Skalar, also entstand ein STILLER falscher Wert.
      //
      // Der kanonische 3D-Pfad liegt in `resolveRange2D` (Zeile 250-260): er
      // stapelt die Rechtecke jedes Blattes, damit `SUM` und direkte Arithmetik
      // dieselben Werte sehen. Genau dafuer ist er da, und genau deshalb gehen
      // alle drei Tests ueber `SUM(Sheet1:Sheet3!…)` — sie treffen diesen Zweig
      // nie.
      //
      // Hier, in einer SKALAR-Position, gibt es keinen einzelnen Wert, den
      // diese Funktion zurueckgeben koennte. Also fail-closed: `#VALUE!` ist
      // ein SICHTBARER Fehler und ersetzt einen stillen falschen Wert.
      // `#REF!` waere falsch — die Blaetter existieren. `vals[0]` waere
      // willkuerlich und lieferte einen falschen Wert.
      if (vals.length !== 1) return '#VALUE!';
      return vals[0];
    }

    const targetCells = findSheetCells(parsedSheet.startSheet, allSheets);
    if (!targetCells) return '#REF!';
    return resolveCell(parsedSheet.cellOrRange, targetCells, visited, allSheets, parsedSheet.startSheet, variables, options);
  }

  const norm = trimmed.toUpperCase().replace(/\$/g, '');
  const cycleKey = `${currentSheetName}!${norm}`;
  spend();
  if (visited.has(cycleKey)) {
    if (options?.circularReferencePolicy === 'use-current-value') return cells[norm]?.value ?? 0;
    throw new Error('CIRCULAR');
  }

  const cell = cells[norm];
  if (!cell) return null;
  if (cell.formula) {
    visited.add(cycleKey);
    const res = evaluateGridFormulaLocal(cell.formula, cells, visited, allSheets, currentSheetName, variables, options);
    visited.delete(cycleKey);
    return res;
  }
  return cell.value ?? null;
}

function usedExtent(cells: Record<string, GridCell>): { maxRow: number; maxCol: number } {
  let maxRow = 0, maxCol = 0;
  for (const coord of Object.keys(cells)) {
    const p = parseCoord(coord);
    if (p.rowIdx >= 0) maxRow = Math.max(maxRow, p.rowIdx);
    if (p.colIdx >= 0) maxCol = Math.max(maxCol, p.colIdx);
  }
  return { maxRow, maxCol };
}

function parseExtendedRange(range: string, cells: Record<string, GridCell>) {
  const normal = parseGridRange(range);
  if (normal) return normal;
  const text = range.toUpperCase().replace(/\$/g, '').trim();
  const cols = /^([A-Z]+):([A-Z]+)$/.exec(text);
  if (cols) {
    const a = parseCoord(`${cols[1]}1`), b = parseCoord(`${cols[2]}1`); const extent = usedExtent(cells);
    return { startCol: Math.min(a.colIdx,b.colIdx), endCol: Math.max(a.colIdx,b.colIdx), startRow: 0, endRow: extent.maxRow };
  }
  const rows = /^([1-9]\d*):([1-9]\d*)$/.exec(text);
  if (rows) {
    const extent = usedExtent(cells); const a=Number(rows[1])-1,b=Number(rows[2])-1;
    return { startCol: 0, endCol: extent.maxCol, startRow: Math.min(a,b), endRow: Math.max(a,b) };
  }
  return null;
}

/**
 * Flat value list for a range. Delegates to `resolveRange2D` so range values are
 * resolved through the *same* path as every other reference (formula cells are
 * evaluated, not read from their cached value). One canonical resolution path is the
 * only way `=SUM(A1:A3)` and `=A1+A2+A3` can agree.
 */
export function resolveRangeValues(
  rangeStr: string,
  cells: Record<string, GridCell>,
  allSheets?: Record<string, Record<string, GridCell>>,
  currentSheetName: string = 'Sheet1',
  visited: Set<string> = new Set(),
  variables: Record<string, FormulaValue> = {},
  options?: FormulaEngineOptions
): FormulaValue[] {
  const grid = resolveRange2D(rangeStr, cells, visited, allSheets, currentSheetName, variables, options);
  const values: FormulaValue[] = [];
  for (const row of grid) for (const item of row) values.push(item);
  return values;
}

export function resolveRange2D(
  rangeStr: string,
  cells: Record<string, GridCell>,
  visited: Set<string>,
  allSheets?: Record<string, Record<string, GridCell>>,
  currentSheetName: string = 'Sheet1',
  variables: Record<string, FormulaValue> = {},
  options?: FormulaEngineOptions
): FormulaArray {
  const trimmed = rangeStr.trim();
  const parsedSheet = parseSheetReference(trimmed);

  if (parsedSheet && parsedSheet.endSheet) {
    // 3D sheet range: the canonical path stacks every sheet's rectangle, so `SUM` and
    // direct arithmetic see exactly the same values.
    const sheets = getSheetsInRange(parsedSheet.startSheet, parsedSheet.endSheet, allSheets);
    if (sheets.length === 0) return [['#REF!']];
    const combined: FormulaArray = [];
    for (const sheet of sheets) {
      const grid = resolveRange2D(parsedSheet.cellOrRange, sheet.cells, visited, allSheets, sheet.name, variables, options);
      for (const row of grid) combined.push(row);
    }
    return combined;
  }

  if (parsedSheet && !parsedSheet.endSheet) {
    const targetCells = findSheetCells(parsedSheet.startSheet, allSheets);
    if (!targetCells) return [['#REF!']];
    return resolveRange2D(parsedSheet.cellOrRange, targetCells, visited, allSheets, parsedSheet.startSheet, variables, options);
  }

  const norm = trimmed.toUpperCase().replace(/\$/g, '');
  const bounds = parseExtendedRange(norm, cells);
  if (!bounds) {
    const single = resolveCell(norm, cells, visited, allSheets, currentSheetName, variables, options);
    return [[toSingleValue(single)]];
  }
  const area = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
  // Bounded before allocation: `=SUM(A:A)` on a sheet with a value in the last row
  // spans the whole column grid and must fail closed instead of materialising it.
  assertReferenceCellBudget(area, limitsOf(options));
  spend(area);
  const grid: FormulaArray = [];
  for (let r = bounds.startRow; r <= bounds.endRow; r++) {
    const row: SingleFormulaValue[] = [];
    for (let c = bounds.startCol; c <= bounds.endCol; c++) {
      const coord = toA1(c, r);
      const val = resolveCell(coord, cells, visited, allSheets, currentSheetName, variables, options);
      row.push(toSingleValue(val));
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Expression nesting guard. `evaluateExpression` is the only recursive descent point of
 * the reference engine, so bounding it here bounds `=SUM(IF(IF(...)))`-style nesting
 * without punishing long cell chains.
 */
function evaluateExpression(
  expr: string,
  cells: Record<string, GridCell>,
  visited: Set<string>,
  allSheets?: Record<string, Record<string, GridCell>>,
  currentSheetName: string = 'Sheet1',
  variables: Record<string, FormulaValue> = {},
  options?: FormulaEngineOptions
): FormulaValue {
  const session = activeSession;
  if (!session) {
    return evaluateExpressionInner(expr, cells, visited, allSheets, currentSheetName, variables, options);
  }
  session.expressionDepth += 1;
  try {
    if (session.expressionDepth > session.budget.limits.maxRecursionDepth) {
      throw new GridFormulaLimitError(
        'recursion-depth',
        session.budget.limits.maxRecursionDepth,
        session.expressionDepth,
      );
    }
    return evaluateExpressionInner(expr, cells, visited, allSheets, currentSheetName, variables, options);
  } finally {
    session.expressionDepth -= 1;
  }
}

function evaluateExpressionInner(
  expr: string,
  cells: Record<string, GridCell>,
  visited: Set<string>,
  allSheets?: Record<string, Record<string, GridCell>>,
  currentSheetName: string = 'Sheet1',
  variables: Record<string, FormulaValue> = {},
  options?: FormulaEngineOptions
): FormulaValue {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  spend();

  const unwrapped = unwrapOuterParentheses(trimmed);
  if (unwrapped !== null) return evaluateExpression(unwrapped, cells, visited, allSheets, currentSheetName, variables, options);

  // 1. Array Constants {1, 2; 3, 4}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const arr = parseArrayConstant(trimmed);
    if (arr) return arr;
  }

  // 2. Bound Variables (from LET / LAMBDA)
  const varKey = trimmed.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(variables, varKey)) {
    return variables[varKey];
  }
  const namedFormula = options?.namedFormulas?.[varKey] ?? Object.entries(options?.namedFormulas ?? {}).find(([key]) => key.toUpperCase() === varKey)?.[1];
  if (namedFormula) {
    const cycleKey = `@NAME:${varKey}`;
    if (visited.has(cycleKey)) return '#CIRCULAR!';
    visited.add(cycleKey);
    const result = evaluateExpression(namedFormula.replace(/^=/, ''), cells, visited, allSheets, currentSheetName, variables, options);
    visited.delete(cycleKey);
    return result;
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*\[[^\]\r\n]{1,128}\]$/.test(trimmed) && options?.structuredReferenceResolver) {
    const resolved = options.structuredReferenceResolver(trimmed, options.currentCellCoord);
    if (!resolved) return '#REF!';
    return isCellRange(resolved)
      ? resolveRange2D(resolved, cells, visited, allSheets, currentSheetName, variables, options)
      : resolveCell(resolved, cells, visited, allSheets, currentSheetName, variables, options);
  }

  // 3. Binary Operators
  const binaryOp = findBinaryOperator(trimmed);
  if (binaryOp) {
    const leftVal = evaluateExpression(binaryOp.left, cells, visited, allSheets, currentSheetName, variables, options);
    const rightVal = evaluateExpression(binaryOp.right, cells, visited, allSheets, currentSheetName, variables, options);
    return applyOperator(binaryOp.op, leftVal, rightVal);
  }

  if (trimmed.endsWith('%') && !trimmed.endsWith('%%')) {
    const percentBase = evaluateExpression(trimmed.slice(0, -1), cells, visited, allSheets, currentSheetName, variables, options);
    const scalar = toSingleValue(percentBase);
    const numericPercent = Number(scalar);
    return Number.isFinite(numericPercent) ? numericPercent / 100 : '#VALUE!';
  }

  if ((trimmed.startsWith('+') || trimmed.startsWith('-')) && trimmed.length > 1) {
    const unary = evaluateExpression(trimmed.slice(1), cells, visited, allSheets, currentSheetName, variables, options);
    const numeric = Number(toSingleValue(unary));
    if (!Number.isFinite(numeric)) return '#VALUE!';
    return trimmed[0] === '-' ? -numeric : numeric;
  }

  // 3b. Immediately-invoked LAMBDA: =LAMBDA(x, x * 2)(5)
  const immediateLambda = splitImmediateLambdaCall(trimmed);
  if (typeof immediateLambda === 'string') return immediateLambda;
  if (immediateLambda) {
    return invokeLambda(immediateLambda.lambda, {
      evaluate: (expression, scope) =>
        evaluateExpression(expression, cells, visited, allSheets, currentSheetName, scope, options),
      variables,
      rawArgs: immediateLambda.callArgs,
      evaluateArgument: (expression) =>
        evaluateExpression(expression, cells, visited, allSheets, currentSheetName, variables, options),
    });
  }

  // 4. Function Call
  const fnMatch = trimmed.match(/^([A-Z0-9_.]+)\s*\((.*)\)$/i);
  if (fnMatch) {
    const fnName = fnMatch[1].toUpperCase();
    const argsRaw = splitArgs(fnMatch[2]);
    return executeGridFunction(fnName, argsRaw, cells, visited, allSheets, currentSheetName, variables, options, { evaluateExpression, resolveRange2D, resolveCell, flattenNumbers, firstLiteralTextError });
  }
  // 5. String Literal
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }

  // 6. Numbers
  const numeric = Number(trimmed);
  if (!isNaN(numeric) && trimmed !== '') return numeric;

  // 7. Booleans
  if (trimmed.toUpperCase() === 'TRUE') return true;
  if (trimmed.toUpperCase() === 'FALSE') return false;

  // 8. Cell Reference A1 or Sheet1!A1 or Sheet1:Sheet3!A1
  //
  // Runde 231: Der zweite Ausdruck kannte den 3D-BLATTBEREICH nicht. Sein
  // Blattname war `[A-Za-z0-9_]+` VOR dem `!` — ein Doppelpunkt passte nicht
  // hinein. `Sheet1:Sheet3!A1` fiel damit bis zum Fallback `return trimmed`
  // und wurde als **Text** zurueckgegeben: die Zelle zeigte den Formeltext an,
  // statt einen Wert oder einen Fehler zu liefern.
  //
  // `parseSheetReference` kennt den 3D-Fall sehr wohl — `Sheet1:Sheet3!A1:B10`
  // liefert `endSheet: 'Sheet3'`. Nur diese Vorpruefung kannte ihn nicht.
  //
  // Der zweite Blattname ist deshalb OPTIONAL ergaenzt. Damit erreicht der Fall
  // `resolveCell`, und dort greift die fail-closed Behandlung aus Runde 228:
  // ein Blattbereich in SKALAR-Position hat keinen einzelnen Wert, also
  // `#VALUE!`.
  //
  // Die Bereichsform `SUM(Sheet1:Sheet3!A1)` geht weiterhin ueber den
  // Funktionspfad und `resolveRange2D` (Zeile 250-263) und ist unberuehrt.
  if (
    /^\$?[A-Z]+\$?[1-9]\d*$/i.test(trimmed)
    || /^(?:'[^']+'|[A-Za-z0-9_]+)(?::(?:'[^']+'|[A-Za-z0-9_]+))?!(?:\$?[A-Z]+\$?[1-9]\d*)$/i.test(trimmed)
  ) {
    return resolveCell(trimmed, cells, visited, allSheets, currentSheetName, variables, options);
  }

  return trimmed;
}

/**
 * Excel rejects text *literals* in numeric aggregates (`=SUM("abc")` is `#VALUE!`)
 * while silently skipping text found through a reference (`=SUM(A1)` with text in A1 is
 * `0`). `flattenNumbers` intentionally skips both, so the dispatcher needs this
 * separate check to keep the distinction.
 */
export function firstLiteralTextError(
  args: string[],
  cells: Record<string, GridCell>,
  visited: Set<string>,
  allSheets?: Record<string, Record<string, GridCell>>,
  currentSheetName: string = 'Sheet1',
  variables: Record<string, FormulaValue> = {},
  options?: FormulaEngineOptions
): FormulaError | null {
  for (const arg of args) {
    if (isCellRange(arg)) continue;
    const value = evaluateExpression(arg, cells, visited, allSheets, currentSheetName, variables, options);
    const error = firstFormulaErrorValue([value]);
    if (error) return error;
    if (isFormulaArray(value)) {
      for (const row of value) {
        for (const item of row) {
          if (typeof item === 'string' && item.trim() !== '' && isNaN(Number(item))) return '#VALUE!';
        }
      }
    } else if (typeof value === 'string' && value.trim() !== '' && isNaN(Number(value))) {
      return '#VALUE!';
    }
  }
  return null;
}

function flattenNumbers(
  args: string[],
  cells: Record<string, GridCell>,
  visited: Set<string>,
  allSheets?: Record<string, Record<string, GridCell>>,
  currentSheetName: string = 'Sheet1',
  variables: Record<string, FormulaValue> = {},
  options?: FormulaEngineOptions
): number[] {
  const result: number[] = [];
  for (const arg of args) {
    if (isCellRange(arg)) {
      // Formula-aware range resolution: a formula cell contributes its calculated
      // value, not the value last persisted in the cell record. Booleans reached
      // through a reference are ignored by numeric aggregates, exactly as in Excel,
      // while boolean *literals* still count as 1.
      for (const val of resolveRangeValues(arg, cells, allSheets, currentSheetName, visited, variables, options)) {
        const single = toSingleValue(val);
        if (typeof single === 'boolean') continue;
        const n = Number(single);
        if (!isNaN(n) && single !== null && single !== '') result.push(n);
      }
    } else {
      const val = evaluateExpression(arg, cells, visited, allSheets, currentSheetName, variables, options);
      if (isFormulaArray(val)) {
        for (const row of val) {
          for (const item of row) {
            const n = Number(item);
            if (!isNaN(n) && item !== null && item !== '') result.push(n);
          }
        }
      } else {
        const n = Number(toSingleValue(val));
        if (!isNaN(n) && val !== null && val !== '') result.push(n);
      }
    }
  }
  return result;
}

export { translateFormulaReferences, extractReferencesFromFormula, getPrecedents, getDependents, applySpill } from './gridFormulaReferences';
export type { SpillResult } from './gridFormulaReferences';
import { applySpill } from './gridFormulaReferences';

export function recalculateGridWithSpill(
  cells: Record<string, GridCell>,
  options?: FormulaEngineOptions,
  previousSpillProvenance: readonly GridFormulaSpillProvenance[] = []
): {
  updatedCells: Record<string, GridCell>;
  spillErrors: string[];
  /** Cells cleared because their owning dynamic array shrank. */
  clearedSpillCells: string[];
  /** Spill ownership after this recalculation; pass back in to clear stale spills. */
  spillProvenance: readonly GridFormulaSpillProvenance[];
} {
  const updated: Record<string, GridCell> = {};
  for (const [k, v] of Object.entries(cells)) {
    updated[k] = { ...v };
  }

  const spillErrors: string[] = [];

  // Iterative calculation loops are clamped to the canonical ceiling so a caller
  // cannot request an unbounded number of rounds on user input.
  const maxIters = options?.enableIterativeCalculation
    ? clampGridFormulaLimit(options.maxIterations, 100, GRID_FORMULA_LIMITS.maxIterations)
    : 1;
  const requestedChange = options?.maxChange;
  const maxChange =
    requestedChange !== undefined && Number.isFinite(requestedChange) && requestedChange >= 0
      ? requestedChange
      : 0.001;

  let provenance: readonly GridFormulaSpillProvenance[] = previousSpillProvenance;
  let clearedSpillCells: string[] = [];

  for (let iter = 0; iter < maxIters; iter++) {
    let maxDelta = 0;
    const nextProvenance: GridFormulaSpillProvenance[] = [];
    const occupied = spillOwnershipIndex(provenance);

    for (const [coord, cell] of Object.entries(cells)) {
      if (!cell.formula) continue;
      const prevVal = Number(updated[coord]?.value);
      const res = evaluateGridFormulaLocal(cell.formula, updated, new Set(), undefined, 'Sheet1', {}, {
        ...options,
        currentCellCoord: coord,
        circularReferencePolicy: options?.enableIterativeCalculation ? 'use-current-value' : 'error',
      });
      // A spill is never blocked by the cells it owns itself.
      const ownCells = new Set(provenance.find((entry) => entry.owner === coord)?.cells ?? []);
      const blocked = new Set<string>();
      for (const owned of occupied.keys()) if (!ownCells.has(owned)) blocked.add(owned);

      const spill = applySpill(coord, res, updated, { occupiedBySpill: blocked });

      if (spill.error === '#SPILL!') {
        updated[coord] = { ...updated[coord], value: '#SPILL!' };
        if (!spillErrors.includes(coord)) spillErrors.push(coord);
      } else {
        const nextVal = spill.value as string | number | boolean;
        updated[coord] = { ...updated[coord], value: nextVal ?? '' };
        for (const [sCoord, sVal] of Object.entries(spill.spilledCells)) {
          updated[sCoord] = {
            ...(updated[sCoord] || {}),
            value: (sVal as string | number | boolean) ?? '',
          };
        }
        const spilledCoords = Object.keys(spill.spilledCells).sort();
        if (spilledCoords.length > 0) {
          nextProvenance.push({ owner: coord, cells: Object.freeze(spilledCoords) });
        }

        const nextNum = Number(nextVal);
        if (!isNaN(prevVal) && !isNaN(nextNum)) {
          const delta = Math.abs(nextNum - prevVal);
          if (delta > maxDelta) maxDelta = delta;
        }
      }
    }

    const stale = diffSpillProvenance(provenance, nextProvenance);
    for (const coord of stale) {
      const existing = updated[coord];
      if (!existing || existing.formula) continue;
      updated[coord] = { ...existing, value: '' };
      if (!clearedSpillCells.includes(coord)) clearedSpillCells.push(coord);
    }
    clearedSpillCells = [...new Set(clearedSpillCells)].sort();
    provenance = nextProvenance;

    if (options?.enableIterativeCalculation && maxDelta < maxChange && iter > 0) {
      break;
    }
  }

  return { updatedCells: updated, spillErrors, clearedSpillCells, spillProvenance: provenance };
}
