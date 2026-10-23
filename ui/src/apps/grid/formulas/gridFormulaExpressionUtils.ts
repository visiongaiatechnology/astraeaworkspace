// STATUS: DIAMANT VGT SUPREME
import { isFormulaArray, isFormulaError, toSingleValue, type FormulaValue, type FormulaError, type SingleFormulaValue } from './gridFormulaTypes';
import { parseSheetReference } from './gridFormulaReferenceParsing';

export function splitArgs(argStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inQuote = false;
  let current = '';
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === '(' || ch === '{') depth++;
      else if (ch === ')' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

export function unwrapOuterParentheses(expr: string): string | null {
  if (!expr.startsWith('(') || !expr.endsWith(')')) return null;
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '"') {
      if (inQuote && expr[i + 1] === '"') { i++; continue; }
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && i < expr.length - 1) return null;
    if (depth < 0) return null;
  }
  return depth === 0 && !inQuote ? expr.slice(1, -1).trim() : null;
}

/**
 * Locates the right-most top-level binary operator.
 *
 * Two-character comparison operators are matched *before* their one-character
 * prefixes. With `=` tried first, `n <= 1` was split as `(n <) = 1` and `a <> b` as
 * `(a <) > b`, so every `<=`, `>=` and `<>` comparison silently produced a wrong
 * boolean instead of an error.
 */
export function findBinaryOperator(expr: string): { op: string; left: string; right: string } | null {
  const ops = ['<=', '>=', '<>', '=', '<', '>', '&', '+', '-', '*', '/', '^'];
  let depth = 0;
  let inQuote = false;
  for (const op of ops) {
    for (let i = expr.length - 1; i >= 0; i--) {
      const ch = expr[i];
      if (ch === '"') inQuote = !inQuote;
      if (!inQuote) {
        if (ch === ')' || ch === '}') depth++;
        else if (ch === '(' || ch === '{') depth--;
        else if (depth === 0) {
          if (expr.substring(i, i + op.length) === op) {
            if (op === '-' && (i === 0 || '(=<>+-*/^&,{'.includes(expr[i - 1]))) continue;
            return {
              op,
              left: expr.substring(0, i).trim(),
              right: expr.substring(i + op.length).trim(),
            };
          }
        }
      }
    }
  }
  return null;
}

export function applyOperator(op: string, a: FormulaValue, b: FormulaValue): FormulaValue {
  const sA = toSingleValue(a);
  const sB = toSingleValue(b);

  if (isFormulaError(sA)) return sA;
  if (isFormulaError(sB)) return sB;

  if (op === '&') return `${sA ?? ''}${sB ?? ''}`;
  if (op === '=') return sA === sB || String(sA ?? '').toLowerCase() === String(sB ?? '').toLowerCase();
  if (op === '<>') return sA !== sB && String(sA ?? '').toLowerCase() !== String(sB ?? '').toLowerCase();

  const numA = Number(sA ?? 0);
  const numB = Number(sB ?? 0);
  if (isNaN(numA) || isNaN(numB)) return '#VALUE!';

  switch (op) {
    case '+': return numA + numB;
    case '-': return numA - numB;
    case '*': return numA * numB;
    case '/': return numB === 0 ? '#DIV/0!' : numA / numB;
    case '^': return Math.pow(numA, numB);
    case '<': return numA < numB;
    case '<=': return numA <= numB;
    case '>': return numA > numB;
    case '>=': return numA >= numB;
    default: return '#VALUE!';
  }
}

export function isCellRange(arg: string): boolean {
  const trimmed = arg.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith('{')) return false;
  const parsedSheet = parseSheetReference(trimmed);
  if (parsedSheet) {
    if (parsedSheet.endSheet) return true;
    return /^(?:\$?[A-Z]+\$?[1-9]\d*\s*:\s*\$?[A-Z]+\$?[1-9]\d*|\$?[A-Z]+\s*:\s*\$?[A-Z]+|\$?[1-9]\d*\s*:\s*\$?[1-9]\d*)$/i.test(parsedSheet.cellOrRange);
  }
  return /^(?:\$?[A-Z]+\$?[1-9]\d*\s*:\s*\$?[A-Z]+\$?[1-9]\d*|\$?[A-Z]+\s*:\s*\$?[A-Z]+|\$?[1-9]\d*\s*:\s*\$?[1-9]\d*)$/i.test(trimmed);
}

export function firstFormulaError(values: FormulaValue[]): FormulaError | null {
  for (const value of values) {
    if (isFormulaArray(value)) {
      for (const row of value) for (const item of row) if (isFormulaError(item)) return item;
    } else if (isFormulaError(value)) return value;
  }
  return null;
}

/**
 * Spreadsheet truthiness. Numbers are true when non-zero, empty cells are false, and
 * only the text literals TRUE/FALSE convert. Any other text is `#VALUE!` — this is why
 * `=AND("abc")` must not silently behave like `TRUE`.
 */
export function coerceFormulaLogical(value: SingleFormulaValue): boolean | FormulaError {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === null) return false;
  const text = String(value).trim().toUpperCase();
  if (text === 'TRUE') return true;
  if (text === 'FALSE') return false;
  return '#VALUE!';
}

/**
 * Type-strict equality for exact-match lookups (`MATCH(...,0)`, `XLOOKUP`/`XMATCH`
 * match mode 0). Unlike `matchesCriteria` there is no cross-type coercion: the number
 * 1 does not match the text "1", matching Excel's lookup semantics.
 */
export function formulaStrictEquals(left: SingleFormulaValue, right: SingleFormulaValue): boolean {
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return left === right;
  if (typeof left === 'string' && typeof right === 'string') {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }
  if (left === null && right === null) return true;
  return false;
}


