// STATUS: DIAMANT VGT SUPREME
// Formula function dispatch isolated from expression parsing and recalculation.
import type { GridCell } from '../../../shared/contracts/workspace';
import { toA1 } from './formula';
import { parseCoord } from '../compat/gridUtils';
import { parseGridRange } from '../compat/gridProfessional';
import { type FormulaValue, type FormulaArray, type SingleFormulaValue, type FormulaError, isFormulaArray, toSingleValue } from './gridFormulaTypes';
import type { FormulaEngineOptions } from './gridFormulaEngineTypes';
import { isCellRange, firstFormulaError, coerceFormulaLogical } from './gridFormulaExpressionUtils';
import { parseSheetReference } from './gridFormulaReferenceParsing';
import { parseA1ReferenceToken } from './gridFormulaReferences';
import { evalMathFunction } from './gridFormulaMath';
import { evalStatsFunction } from './gridFormulaStats';
import { evalTextFunction } from './gridFormulaText';
import { evalDateFunction } from './gridFormulaDate';
import { evalFinanceFunction } from './gridFormulaFinance';
import { evalInfoFunction } from './gridFormulaInfoLookup';
import { matrixTranspose, matrixMultiply, matrixDeterminant, matrixInverse, evalDatabaseFunction, evalVolatileFunction, evalArrayShapingFunction } from './gridFormulaAdvanced';
import { evalStatisticsToolpakFunction } from './legacy/gridStatisticsToolpak';
import {
  bindLambdaParameters,
  resolveLambdaArgument,
  resolveNamedLambda,
  invokeLambda,
  type ParsedLambda,
} from './gridFormulaLambda';

export interface GridFormulaDispatchCallbacks {
  evaluateExpression: (expr:string,cells:Record<string,GridCell>,visited:Set<string>,allSheets?:Record<string,Record<string,GridCell>>,currentSheetName?:string,variables?:Record<string,FormulaValue>,options?:FormulaEngineOptions)=>FormulaValue;
  resolveRange2D: (range:string,cells:Record<string,GridCell>,visited:Set<string>,allSheets?:Record<string,Record<string,GridCell>>,currentSheetName?:string,variables?:Record<string,FormulaValue>,options?:FormulaEngineOptions)=>FormulaArray;
  resolveCell: (coord:string,cells:Record<string,GridCell>,visited:Set<string>,allSheets?:Record<string,Record<string,GridCell>>,currentSheetName?:string,variables?:Record<string,FormulaValue>,options?:FormulaEngineOptions)=>FormulaValue;
  flattenNumbers: (args:string[],cells:Record<string,GridCell>,visited:Set<string>,allSheets?:Record<string,Record<string,GridCell>>,currentSheetName?:string,variables?:Record<string,FormulaValue>,options?:FormulaEngineOptions)=>number[];
  /** Reports `#VALUE!` for text literals fed to numeric aggregates. */
  firstLiteralTextError: (args:string[],cells:Record<string,GridCell>,visited:Set<string>,allSheets?:Record<string,Record<string,GridCell>>,currentSheetName?:string,variables?:Record<string,FormulaValue>,options?:FormulaEngineOptions)=>FormulaError|null;
}

export function executeGridFunction(
  name: string,
  rawArgs: string[],
  cells: Record<string, GridCell>,
  visited: Set<string>,
  allSheets: Record<string, Record<string, GridCell>> | undefined,
  currentSheetName: string,
  variables: Record<string, FormulaValue>,
  options: FormulaEngineOptions | undefined,
  callbacks: GridFormulaDispatchCallbacks,
): FormulaValue {
  const { evaluateExpression, resolveRange2D, resolveCell, flattenNumbers, firstLiteralTextError } = callbacks;
  const evalArg = (idx: number, customVars = variables): FormulaValue =>
    rawArgs[idx] ? evaluateExpression(rawArgs[idx], cells, visited, allSheets, currentSheetName, customVars, options) : null;

  // Named LAMBDA invocation. `namedFormulas: { DOUBLE: '=LAMBDA(x, x*2)' }` makes
  // `=DOUBLE(5)` work, including recursion, which the evaluation budget bounds.
  const namedLambda = resolveNamedLambda(options?.namedFormulas, name);
  if (typeof namedLambda === 'string') return namedLambda;
  if (namedLambda) {
    return invokeLambda(namedLambda, {
      evaluate: (expression, scope) =>
        evaluateExpression(expression, cells, visited, allSheets, currentSheetName, scope, options),
      variables,
      rawArgs,
      evaluateArgument: (expression) =>
        evaluateExpression(expression, cells, visited, allSheets, currentSheetName, variables, options),
    });
  }

  const lambdaArgument = (raw: string): ParsedLambda | FormulaError | null =>
    resolveLambdaArgument(raw, options?.namedFormulas);

  // A LAMBDA that is never invoked has no value; Excel reports #CALC!.
  if (name === 'LAMBDA') return '#CALC!';
  // `TRUE()` / `FALSE()` are the call forms of the boolean literals.
  if (name === 'TRUE') return true;
  if (name === 'FALSE') return false;

  const matrixOf = (raw: string): FormulaArray => {
    const value = isCellRange(raw)
      ? resolveRange2D(raw, cells, visited, allSheets, currentSheetName, variables, options)
      : evaluateExpression(raw, cells, visited, allSheets, currentSheetName, variables, options);
    return isFormulaArray(value) ? value : [[toSingleValue(value)]];
  };

  // Functional LET: LET(var1, val1, var2, val2, ..., calculation)
  if (name === 'LET') {
    if (rawArgs.length < 3 || rawArgs.length % 2 === 0) return '#VALUE!';
    const localVars = { ...variables };
    const declared = new Set<string>();
    for (let i = 0; i < rawArgs.length - 1; i += 2) {
      const rawName = rawArgs[i].trim();
      const varName = rawName.toUpperCase();
      // LET names must be real names: not a cell address and not a duplicate.
      if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(rawName)) return '#VALUE!';
      if (parseA1ReferenceToken(rawName) !== null) return '#VALUE!';
      if (declared.has(varName)) return '#VALUE!';
      declared.add(varName);
      const varVal = evaluateExpression(rawArgs[i + 1], cells, visited, allSheets, currentSheetName, localVars, options);
      const varError = firstFormulaError([varVal]);
      if (varError) return varError;
      localVars[varName] = varVal;
    }
    return evaluateExpression(rawArgs[rawArgs.length - 1], cells, visited, allSheets, currentSheetName, localVars, options);
  }

  // Functional MAP, REDUCE, SCAN, BYROW, BYCOL
  if (name === 'MAP') {
    if (rawArgs.length < 2) return '#VALUE!';
    const parsed = lambdaArgument(rawArgs[rawArgs.length - 1]);
    if (typeof parsed === 'string') return parsed;
    if (!parsed) return '#VALUE!';
    const arrays = rawArgs.slice(0, -1).map(matrixOf);
    if (parsed.parameters.length !== arrays.length) return '#VALUE!';
    const rowCount = arrays[0].length;
    const colCount = arrays[0][0]?.length ?? 0;
    for (const array of arrays) {
      if (array.length !== rowCount) return '#VALUE!';
      for (const row of array) if (row.length !== colCount) return '#VALUE!';
    }
    const result: FormulaArray = [];
    for (let r = 0; r < rowCount; r++) {
      const row: SingleFormulaValue[] = [];
      for (let c = 0; c < colCount; c++) {
        const scope = bindLambdaParameters(parsed, arrays.map((array) => array[r][c]), variables);
        if (typeof scope === 'string') return scope;
        row.push(toSingleValue(evaluateExpression(parsed.body, cells, visited, allSheets, currentSheetName, scope, options)));
      }
      result.push(row);
    }
    return result;
  }

  if (name === 'BYROW') {
    if (rawArgs.length < 2) return '#VALUE!';
    const parsed = lambdaArgument(rawArgs[1]);
    if (typeof parsed === 'string') return parsed;
    if (!parsed || parsed.parameters.length !== 1) return '#VALUE!';
    const matrix = matrixOf(rawArgs[0]);
    const result: FormulaArray = [];
    for (const row of matrix) {
      const scope = bindLambdaParameters(parsed, [[row]], variables);
      if (typeof scope === 'string') return scope;
      result.push([toSingleValue(evaluateExpression(parsed.body, cells, visited, allSheets, currentSheetName, scope, options))]);
    }
    return result;
  }

  if (name === 'BYCOL') {
    if (rawArgs.length < 2) return '#VALUE!';
    const parsed = lambdaArgument(rawArgs[1]);
    if (typeof parsed === 'string') return parsed;
    if (!parsed || parsed.parameters.length !== 1) return '#VALUE!';
    const matrix = matrixOf(rawArgs[0]);
    const cols = matrix[0]?.length ?? 0;
    const resultRow: SingleFormulaValue[] = [];
    for (let c = 0; c < cols; c++) {
      const column: FormulaArray = matrix.map((row) => [row[c]]);
      const scope = bindLambdaParameters(parsed, [column], variables);
      if (typeof scope === 'string') return scope;
      resultRow.push(toSingleValue(evaluateExpression(parsed.body, cells, visited, allSheets, currentSheetName, scope, options)));
    }
    return [resultRow];
  }

  if (name === 'REDUCE') {
    if (rawArgs.length < 3) return '#VALUE!';
    const parsed = lambdaArgument(rawArgs[2]);
    if (typeof parsed === 'string') return parsed;
    if (!parsed || parsed.parameters.length !== 2) return '#VALUE!';
    let acc: FormulaValue = evalArg(0);
    const matrix = matrixOf(rawArgs[1]);
    for (const row of matrix) {
      for (const item of row) {
        const scope = bindLambdaParameters(parsed, [acc, item], variables);
        if (typeof scope === 'string') return scope;
        acc = evaluateExpression(parsed.body, cells, visited, allSheets, currentSheetName, scope, options);
      }
    }
    return acc;
  }

  if (name === 'SCAN') {
    if (rawArgs.length < 3) return '#VALUE!';
    const parsed = lambdaArgument(rawArgs[2]);
    if (typeof parsed === 'string') return parsed;
    if (!parsed || parsed.parameters.length !== 2) return '#VALUE!';
    let acc: FormulaValue = evalArg(0);
    const matrix = matrixOf(rawArgs[1]);
    const result: FormulaArray = [];
    for (const row of matrix) {
      const outputRow: SingleFormulaValue[] = [];
      for (const item of row) {
        const scope = bindLambdaParameters(parsed, [acc, item], variables);
        if (typeof scope === 'string') return scope;
        acc = evaluateExpression(parsed.body, cells, visited, allSheets, currentSheetName, scope, options);
        outputRow.push(toSingleValue(acc));
      }
      result.push(outputRow);
    }
    return result;
  }

  // Logic/error-control functions are intentionally lazy. Do not pre-evaluate
  // unused branches because they may contain errors or volatile functions.
  // Conditions are still type-checked: an error or non-logical text condition
  // propagates instead of being coerced by JavaScript truthiness.
  if (name === 'IF') {
    if (rawArgs.length < 2) return '#VALUE!';
    const conditionValue = evalArg(0);
    const conditionError = firstFormulaError([conditionValue]);
    if (conditionError) return conditionError;
    const logical = coerceFormulaLogical(toSingleValue(conditionValue));
    if (typeof logical !== 'boolean') return logical;
    return logical ? evalArg(1) : rawArgs.length > 2 ? evalArg(2) : false;
  }
  if (name === 'IFS') {
    if (rawArgs.length < 2) return '#VALUE!';
    for (let i = 0; i + 1 < rawArgs.length; i += 2) {
      const conditionValue = evalArg(i);
      const conditionError = firstFormulaError([conditionValue]);
      if (conditionError) return conditionError;
      const logical = coerceFormulaLogical(toSingleValue(conditionValue));
      if (typeof logical !== 'boolean') return logical;
      if (logical) return evalArg(i + 1);
    }
    return '#N/A';
  }
  if (name === 'SWITCH') {
    if (rawArgs.length < 3) return '#VALUE!';
    const targetValue = evalArg(0);
    const targetError = firstFormulaError([targetValue]);
    if (targetError) return targetError;
    const target = toSingleValue(targetValue);
    const lastIndex = rawArgs.length % 2 === 0 ? rawArgs.length - 1 : rawArgs.length;
    for (let i = 1; i + 1 < lastIndex; i += 2) {
      const candidate = evalArg(i);
      const candidateError = firstFormulaError([candidate]);
      if (candidateError) return candidateError;
      if (toSingleValue(candidate) === target) return evalArg(i + 1);
    }
    return rawArgs.length % 2 === 0 ? evalArg(rawArgs.length - 1) : '#N/A';
  }
  if (name === 'IFERROR' || name === 'IFNA') {
    const value = evalArg(0);
    const scalar = toSingleValue(value);
    const isError = typeof scalar === 'string' && scalar.startsWith('#');
    const catches = name === 'IFERROR' ? isError : scalar === '#N/A' || scalar === '#N/A!';
    return catches ? evalArg(1) : value;
  }
  if (name === 'AND' || name === 'OR' || name === 'XOR') {
    // Excel does not short-circuit AND/OR: every argument is evaluated and the first
    // error wins, so `=AND(FALSE, 1/0)` reports #DIV/0! instead of FALSE.
    let truthy = 0;
    let allTrue = true;
    for (const arg of rawArgs) {
      const value = evaluateExpression(arg, cells, visited, allSheets, currentSheetName, variables, options);
      const valueError = firstFormulaError([value]);
      if (valueError) return valueError;
      const logical = coerceFormulaLogical(toSingleValue(value));
      if (typeof logical !== 'boolean') return logical;
      if (logical) truthy++;
      else allTrue = false;
    }
    if (name === 'AND') return allTrue;
    if (name === 'OR') return truthy > 0;
    return truthy % 2 === 1;
  }
  if (name === 'NOT') {
    const value = evalArg(0);
    const valueError = firstFormulaError([value]);
    if (valueError) return valueError;
    const logical = coerceFormulaLogical(toSingleValue(value));
    return typeof logical === 'boolean' ? !logical : logical;
  }

  const evaluatedArgs: FormulaValue[] = [];
  for (const a of rawArgs) {
    if (isCellRange(a)) {
      evaluatedArgs.push(resolveRange2D(a, cells, visited, allSheets, currentSheetName, variables, options));
    } else {
      evaluatedArgs.push(evaluateExpression(a, cells, visited, allSheets, currentSheetName, variables, options));
    }
  }

  const flatNums = flattenNumbers(rawArgs, cells, visited, allSheets, currentSheetName, variables, options);

  const argumentError = firstFormulaError(evaluatedArgs);

  // 1. Math Functions
  const errorInspectionFunctions = new Set(['ISBLANK','ISNUMBER','ISTEXT','ISNONTEXT','ISERROR','ISERR','ISNA','ISLOGICAL','TYPE','ERROR.TYPE','NA','COUNT','COUNTA','COUNTBLANK','COUNTIF','COUNTIFS','AGGREGATE']);
  if (argumentError && !errorInspectionFunctions.has(name)) return argumentError;

  // Excel rejects text literals in numeric aggregates while ignoring text that is
  // reached through a reference. `COUNT` counts only numbers and never errors on text.
  const numericAggregates = new Set(['SUM','AVERAGE','MIN','MAX','PRODUCT','MEDIAN','MODE','MODE.SNGL','STDEV','STDEV.S','STDEV.P','STDEVP','VAR','VAR.S','VAR.P','VARP','LARGE','SMALL','PERCENTILE','PERCENTILE.INC','QUARTILE','QUARTILE.INC','RANK']);
  if (numericAggregates.has(name)) {
    const literalTextError = firstLiteralTextError(rawArgs, cells, visited, allSheets, currentSheetName, variables, options);
    if (literalTextError) return literalTextError;
  }

  const mathRes = evalMathFunction(name, evaluatedArgs, flatNums);
  if (mathRes !== undefined) return mathRes;

  // 2. Stats Functions
  const statsRes = evalStatsFunction(name, evaluatedArgs, flatNums, rawArgs.length);
  if (statsRes !== undefined) return statsRes;

  // 3. Statistics Toolpak & Regression
  const toolpakRes = evalStatisticsToolpakFunction(name, evaluatedArgs);
  if (toolpakRes !== undefined) return toolpakRes;

  // 4. Matrix & Database & Volatile & Array Shaping
  if (name === 'TRANSPOSE') return matrixTranspose(evaluatedArgs[0]);
  if (name === 'MMULT') return matrixMultiply(evaluatedArgs[0], evaluatedArgs[1]);
  if (name === 'MDETERM') return matrixDeterminant(evaluatedArgs[0]);
  if (name === 'MINVERSE') return matrixInverse(evaluatedArgs[0]);

  if (['DSUM', 'DAVERAGE', 'DCOUNT', 'DCOUNTA', 'DMIN', 'DMAX'].includes(name)) {
    return evalDatabaseFunction(name, evaluatedArgs);
  }

  const volRes = evalVolatileFunction(name, evaluatedArgs, options?.volatilePolicy, options?.random);
  if (volRes !== undefined) return volRes;

  const arrayShapeRes = evalArrayShapingFunction(name, evaluatedArgs);
  if (arrayShapeRes !== undefined) return arrayShapeRes;

  // 5. Text Functions
  const textRes = evalTextFunction(name, evaluatedArgs);
  if (textRes !== undefined) return textRes;

  // 6. Date Functions
  const dateRes = evalDateFunction(name, evaluatedArgs, options?.now, options?.timeZoneRule);
  if (dateRes !== undefined) return dateRes;

  // 7. Finance Functions
  const finRes = evalFinanceFunction(name, evaluatedArgs);
  if (finRes !== undefined) return finRes;

  // 8. Info & Lookup Functions
  const infoRes = evalInfoFunction(name, evaluatedArgs, { volatilePolicy: options?.volatilePolicy, random: options?.random });
  if (infoRes !== undefined) return infoRes;

  // 9. Logic & Grid Reference Functions
  switch (name) {
    case 'INDIRECT': {
      if (!rawArgs.length) return '#VALUE!';
      const ref = String(toSingleValue(evalArg(0)) ?? '').trim();
      if (!ref || ref.length > 128 || /[\[\]{};]|:\/\//.test(ref)) return '#REF!';
      const sheetRef = parseSheetReference(ref);
      const coreRef = sheetRef?.cellOrRange ?? ref;
      if (!/^(?:\$?[A-Z]+\$?[1-9]\d*|\$?[A-Z]+\$?[1-9]\d*:\$?[A-Z]+\$?[1-9]\d*|\$?[A-Z]+:\$?[A-Z]+|\$?[1-9]\d*:\$?[1-9]\d*)$/i.test(coreRef)) return '#REF!';
      return isCellRange(ref)
        ? resolveRange2D(ref, cells, visited, allSheets, currentSheetName, variables, options)
        : resolveCell(ref, cells, visited, allSheets, currentSheetName, variables, options);
    }
    case 'VGTREF': {
      if (rawArgs.length < 2 || !options?.workspaceReferenceResolver) return '#REF!';
      const uri = String(toSingleValue(evalArg(0)) ?? '');
      const reference = String(toSingleValue(evalArg(1)) ?? '');
      if (!/^vgt:\/\/workspace\/document\/[A-Za-z0-9._-]+\/object\/[A-Za-z0-9._-]+$/.test(uri) || reference.length > 128) return '#REF!';
      return options.workspaceReferenceResolver(uri, reference);
    }

    case 'OFFSET': {
      if (rawArgs.length < 3) return '#VALUE!';
      const baseCoord = rawArgs[0].toUpperCase().replace(/\$/g, '');
      const baseBounds = parseGridRange(baseCoord);
      const startCol = baseBounds ? baseBounds.startCol : parseCoord(baseCoord).colIdx;
      const startRow = baseBounds ? baseBounds.startRow : parseCoord(baseCoord).rowIdx;
      const rowOffset = Number(toSingleValue(evalArg(1)) ?? 0);
      const colOffset = Number(toSingleValue(evalArg(2)) ?? 0);
      const height = rawArgs.length > 3 ? Math.floor(Number(toSingleValue(evalArg(3)) ?? 1)) : (baseBounds ? baseBounds.endRow - baseBounds.startRow + 1 : 1);
      const width = rawArgs.length > 4 ? Math.floor(Number(toSingleValue(evalArg(4)) ?? 1)) : (baseBounds ? baseBounds.endCol - baseBounds.startCol + 1 : 1);

      const targetCol = startCol + colOffset;
      const targetRow = startRow + rowOffset;
      if (targetCol < 0 || targetRow < 0 || height <= 0 || width <= 0) return '#REF!';
      if (height * width > Math.max(1, options?.maxReferenceCells ?? 100_000)) return '#REF!';

      if (height === 1 && width === 1) {
        return resolveCell(toA1(targetCol, targetRow), cells, visited, allSheets, currentSheetName, variables, options);
      }

      const grid: FormulaArray = [];
      for (let r = 0; r < height; r++) {
        const row: SingleFormulaValue[] = [];
        for (let c = 0; c < width; c++) {
          row.push(toSingleValue(resolveCell(toA1(targetCol + c, targetRow + r), cells, visited, allSheets, currentSheetName, variables, options)));
        }
        grid.push(row);
      }
      return grid;
    }

    case 'ROW': {
      if (!rawArgs.length) return 1;
      const bounds = parseGridRange(rawArgs[0].replace(/\$/g, ''));
      if (bounds) return bounds.startRow + 1;
      const { rowIdx } = parseCoord(rawArgs[0].replace(/\$/g, ''));
      return rowIdx >= 0 ? rowIdx + 1 : 1;
    }
    case 'COLUMN': {
      if (!rawArgs.length) return 1;
      const bounds = parseGridRange(rawArgs[0].replace(/\$/g, ''));
      if (bounds) return bounds.startCol + 1;
      const { colIdx } = parseCoord(rawArgs[0].replace(/\$/g, ''));
      return colIdx >= 0 ? colIdx + 1 : 1;
    }
    case 'ROWS': {
      if (!rawArgs.length) return 1;
      const bounds = parseGridRange(rawArgs[0].replace(/\$/g, ''));
      if (bounds) return bounds.endRow - bounds.startRow + 1;
      const argVal = evalArg(0);
      if (isFormulaArray(argVal)) return argVal.length;
      return 1;
    }
    case 'COLUMNS': {
      if (!rawArgs.length) return 1;
      const bounds = parseGridRange(rawArgs[0].replace(/\$/g, ''));
      if (bounds) return bounds.endCol - bounds.startCol + 1;
      const argVal = evalArg(0);
      if (isFormulaArray(argVal)) return argVal[0]?.length ?? 0;
      return 1;
    }

    default:
      return `#NAME?`;
  }
}

