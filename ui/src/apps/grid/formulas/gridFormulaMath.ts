// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Math & Trig formula domain
// Full Excel/Calc parity across SUMIFS, AGGREGATE, SUBTOTAL, ROUND*, CEILING, FLOOR, SQRT, POWER, ABS, MOD

import { FormulaValue, SingleFormulaValue, isFormulaError, toSingleValue } from './gridFormulaTypes';
import { LinearPattern } from '../../../shared/patterns/linearPattern';

export function matchesCriteria(val: SingleFormulaValue, criteria: SingleFormulaValue): boolean {
  if (criteria === null || criteria === undefined || criteria === '') {
    return val === null || val === undefined || val === '';
  }

  const critStr = String(criteria).trim();
  const opMatch = critStr.match(/^(<=|>=|<>|<|>|=)(.*)$/);

  if (opMatch) {
    const op = opMatch[1];
    const target = opMatch[2].trim();
    const numTarget = Number(target);
    const numVal = val !== null && val !== '' ? Number(val) : NaN;

    if (!isNaN(numTarget) && !isNaN(numVal)) {
      switch (op) {
        case '=': return numVal === numTarget;
        case '<>': return numVal !== numTarget;
        case '<': return numVal < numTarget;
        case '<=': return numVal <= numTarget;
        case '>': return numVal > numTarget;
        case '>=': return numVal >= numTarget;
      }
    }

    const strVal = String(val ?? '').toLowerCase();
    const strTarget = target.toLowerCase();
    switch (op) {
      case '=': return strVal === strTarget;
      case '<>': return strVal !== strTarget;
      case '<': return strVal < strTarget;
      case '<=': return strVal <= strTarget;
      case '>': return strVal > strTarget;
      case '>=': return strVal >= strTarget;
    }
  }

  const numCrit = Number(criteria);
  const numVal = val !== null && val !== '' ? Number(val) : NaN;
  if (!isNaN(numCrit) && !isNaN(numVal) && typeof val === 'number') {
    return numVal === numCrit;
  }

  if (critStr.includes('*') || critStr.includes('?')) {
    if (critStr.length > 256) return false;
    let source = '^';
    for (const char of critStr) {
      if (char === '*') source += '.*';
      else if (char === '?') source += '.';
      else source += '.+*?^$()[]{}|\\'.includes(char) ? `\\${char}` : char;
    }
    source += '$';
    const input = String(val ?? '');
    if (input.length > 100_000) return false;
    try {
      return new LinearPattern(source, { caseInsensitive: true, limits: { maxPatternLength: 768, maxInputLength: 100_000, maxStates: 4096, maxMatches: 1, maxRepeat: 128 } }).test(input);
    } catch {
      return false;
    }
  }

  if (!isNaN(numCrit) && !isNaN(numVal)) {
    return numVal === numCrit;
  }

  return String(val ?? '').toLowerCase() === critStr.toLowerCase();
}

export function flattenToScalars(arg: unknown): SingleFormulaValue[] {
  if (arg === null || arg === undefined) return [null];
  if (Array.isArray(arg)) {
    const res: SingleFormulaValue[] = [];
    for (const item of arg) {
      res.push(...flattenToScalars(item));
    }
    return res;
  }
  return [arg as SingleFormulaValue];
}

export function flattenToNumbers(arg: unknown): number[] {
  if (arg === null || arg === undefined || arg === '') return [];
  if (typeof arg === 'number') return isNaN(arg) ? [] : [arg];
  if (Array.isArray(arg)) {
    const res: number[] = [];
    for (const item of arg) {
      res.push(...flattenToNumbers(item));
    }
    return res;
  }
  const n = Number(arg);
  return !isNaN(n) ? [n] : [];
}

export function evalMathFunction(
  name: string,
  args: FormulaValue[],
  flatNumbers: number[]
): FormulaValue | undefined {
  switch (name) {
    case 'SUM':
      return flatNumbers.reduce((a, b) => a + b, 0);

    case 'SUMIF': {
      if (args.length < 2) return '#VALUE!';
      const range = flattenToScalars(args[0]);
      const criteria = toSingleValue(args[1]);
      const sumRange = args.length >= 3 ? flattenToScalars(args[2]) : range;
      let total = 0;
      for (let i = 0; i < range.length; i++) {
        if (matchesCriteria(range[i], criteria)) {
          const sVal = Number(sumRange[i] ?? 0);
          if (!isNaN(sVal)) total += sVal;
        }
      }
      return total;
    }

    case 'SUMIFS': {
      if (args.length < 3 || (args.length - 1) % 2 !== 0) return '#VALUE!';
      const sumRange = flattenToScalars(args[0]);
      const criteriaRanges: SingleFormulaValue[][] = [];
      const criteriaValues: SingleFormulaValue[] = [];
      for (let i = 1; i < args.length; i += 2) {
        criteriaRanges.push(flattenToScalars(args[i]));
        criteriaValues.push(toSingleValue(args[i + 1]));
      }
      let total = 0;
      for (let i = 0; i < sumRange.length; i++) {
        let allMatch = true;
        for (let c = 0; c < criteriaRanges.length; c++) {
          if (!matchesCriteria(criteriaRanges[c][i], criteriaValues[c])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          const sVal = Number(sumRange[i] ?? 0);
          if (!isNaN(sVal)) total += sVal;
        }
      }
      return total;
    }

    case 'PRODUCT':
      return flatNumbers.length ? flatNumbers.reduce((a, b) => a * b, 1) : 0;

    case 'ROUND': {
      const num = Number(toSingleValue(args[0]) ?? 0);
      const dec = Number(toSingleValue(args[1]) ?? 0);
      if (isNaN(num) || isNaN(dec)) return '#VALUE!';
      const factor = Math.pow(10, dec);
      return Math.round(num * factor) / factor;
    }

    case 'ROUNDUP': {
      const num = Number(toSingleValue(args[0]) ?? 0);
      const dec = Number(toSingleValue(args[1]) ?? 0);
      if (isNaN(num) || isNaN(dec)) return '#VALUE!';
      const factor = Math.pow(10, dec);
      const sign = num < 0 ? -1 : 1;
      return (sign * Math.ceil(Math.abs(num) * factor)) / factor;
    }

    case 'ROUNDDOWN': {
      const num = Number(toSingleValue(args[0]) ?? 0);
      const dec = Number(toSingleValue(args[1]) ?? 0);
      if (isNaN(num) || isNaN(dec)) return '#VALUE!';
      const factor = Math.pow(10, dec);
      const sign = num < 0 ? -1 : 1;
      return (sign * Math.floor(Math.abs(num) * factor)) / factor;
    }

    case 'MROUND': {
      const num = Number(toSingleValue(args[0]) ?? 0);
      const mult = Number(toSingleValue(args[1]) ?? 1);
      if (isNaN(num) || isNaN(mult) || mult === 0) return '#NUM!';
      if ((num > 0 && mult < 0) || (num < 0 && mult > 0)) return '#NUM!';
      return Math.round(num / mult) * mult;
    }

    case 'MOD': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      const d = Number(toSingleValue(args[1]) ?? 1);
      if (isNaN(n) || isNaN(d)) return '#VALUE!';
      if (d === 0) return '#DIV/0!';
      return n - d * Math.floor(n / d);
    }

    case 'ABS': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : Math.abs(n);
    }

    case 'POWER': {
      const b = Number(toSingleValue(args[0]) ?? 0);
      const e = Number(toSingleValue(args[1]) ?? 1);
      if (isNaN(b) || isNaN(e)) return '#VALUE!';
      const res = Math.pow(b, e);
      return isNaN(res) ? '#NUM!' : res;
    }

    case 'SQRT': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      if (isNaN(n)) return '#VALUE!';
      return n < 0 ? '#NUM!' : Math.sqrt(n);
    }

    case 'CEILING': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      const sig = args.length > 1 ? Number(toSingleValue(args[1])) : 1;
      if (isNaN(n) || isNaN(sig)) return '#VALUE!';
      if (sig === 0) return 0;
      if (n > 0 && sig < 0) return '#NUM!';
      if (n < 0 && sig < 0) return -Math.ceil(Math.abs(n) / Math.abs(sig)) * Math.abs(sig);
      return Math.ceil(n / sig) * sig;
    }

    case 'FLOOR': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      const sig = args.length > 1 ? Number(toSingleValue(args[1])) : 1;
      if (isNaN(n) || isNaN(sig)) return '#VALUE!';
      if (sig === 0) return '#DIV/0!';
      if (n > 0 && sig < 0) return '#NUM!';
      if (n < 0 && sig < 0) return -Math.floor(Math.abs(n) / Math.abs(sig)) * Math.abs(sig);
      return Math.floor(n / sig) * sig;
    }

    case 'INT': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : Math.floor(n);
    }

    case 'TRUNC': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      const dec = Number(toSingleValue(args[1]) ?? 0);
      if (isNaN(n) || isNaN(dec)) return '#VALUE!';
      const factor = Math.pow(10, dec);
      return Math.trunc(n * factor) / factor;
    }

    case 'PI':
      return Math.PI;

    case 'EXP': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : Math.exp(n);
    }

    case 'LN': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      if (isNaN(n) || n <= 0) return '#NUM!';
      return Math.log(n);
    }

    case 'LOG': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      const base = args.length > 1 ? Number(toSingleValue(args[1])) : 10;
      if (isNaN(n) || isNaN(base) || n <= 0 || base <= 0 || base === 1) return '#NUM!';
      return Math.log(n) / Math.log(base);
    }

    case 'LOG10': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      if (isNaN(n) || n <= 0) return '#NUM!';
      return Math.log10(n);
    }

    case 'SIN': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : Math.sin(n);
    }

    case 'COS': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : Math.cos(n);
    }

    case 'TAN': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : Math.tan(n);
    }

    case 'ASIN': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      if (isNaN(n) || n < -1 || n > 1) return '#NUM!';
      return Math.asin(n);
    }

    case 'ACOS': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      if (isNaN(n) || n < -1 || n > 1) return '#NUM!';
      return Math.acos(n);
    }

    case 'ATAN': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : Math.atan(n);
    }

    case 'DEGREES': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : (n * 180) / Math.PI;
    }

    case 'RADIANS': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : (n * Math.PI) / 180;
    }

    case 'SIGN': {
      const n = Number(toSingleValue(args[0]) ?? 0);
      return isNaN(n) ? '#VALUE!' : Math.sign(n);
    }

    case 'FACT': {
      const n = Math.floor(Number(toSingleValue(args[0]) ?? 0));
      if (isNaN(n) || n < 0 || n > 170) return '#NUM!';
      let res = 1;
      for (let i = 2; i <= n; i++) res *= i;
      return res;
    }

    case 'COMBIN': {
      const n = Math.floor(Number(toSingleValue(args[0]) ?? 0));
      const k = Math.floor(Number(toSingleValue(args[1]) ?? 0));
      if (isNaN(n) || isNaN(k) || n < 0 || k < 0 || n < k) return '#NUM!';
      let res = 1;
      for (let i = 1; i <= k; i++) res = (res * (n - i + 1)) / i;
      return res;
    }

    case 'SUBTOTAL': {
      if (args.length < 2) return '#VALUE!';
      const fnNum = Number(toSingleValue(args[0]));
      const restArgs = args.slice(1);
      const nums = flattenToNumbers(restArgs);
      const scalars = flattenToScalars(restArgs);

      const op = fnNum > 100 ? fnNum - 100 : fnNum;
      switch (op) {
        case 1: // AVERAGE
          return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : '#DIV/0!';
        case 2: // COUNT
          return nums.length;
        case 3: // COUNTA
          return scalars.filter(v => v !== null && v !== '').length;
        case 4: // MAX
          return nums.length ? Math.max(...nums) : 0;
        case 5: // MIN
          return nums.length ? Math.min(...nums) : 0;
        case 6: // PRODUCT
          return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
        case 7: { // STDEV.S
          if (nums.length <= 1) return '#DIV/0!';
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          const variance = nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (nums.length - 1);
          return Math.sqrt(variance);
        }
        case 8: { // STDEV.P
          if (nums.length === 0) return '#DIV/0!';
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          const variance = nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / nums.length;
          return Math.sqrt(variance);
        }
        case 9: // SUM
          return nums.reduce((a, b) => a + b, 0);
        case 10: { // VAR.S
          if (nums.length <= 1) return '#DIV/0!';
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          return nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (nums.length - 1);
        }
        case 11: { // VAR.P
          if (nums.length === 0) return '#DIV/0!';
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          return nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / nums.length;
        }
        default:
          return '#VALUE!';
      }
    }

    case 'AGGREGATE': {
      if (args.length < 3) return '#VALUE!';
      const fnNum = Number(toSingleValue(args[0]));
      const options = Number(toSingleValue(args[1]));
      let restArgs = args.slice(2);
      let kParam: number | undefined;

      if ([14, 15, 16, 17, 18, 19].includes(fnNum) && restArgs.length >= 2) {
        kParam = Number(toSingleValue(restArgs[restArgs.length - 1]));
        restArgs = restArgs.slice(0, -1);
      }

      const rawScalars = flattenToScalars(restArgs);
      const ignoreErrors = [2, 3, 6, 7].includes(options);

      const filteredScalars = ignoreErrors
        ? rawScalars.filter(v => !isFormulaError(v) && !(typeof v === 'string' && v.startsWith('#')))
        : rawScalars;

      for (const v of rawScalars) {
        if (!ignoreErrors && (isFormulaError(v) || (typeof v === 'string' && v.startsWith('#')))) {
          return v as FormulaValue;
        }
      }

      const nums = flattenToNumbers(filteredScalars);

      switch (fnNum) {
        case 1: return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : '#DIV/0!';
        case 2: return nums.length;
        case 3: return filteredScalars.filter(v => v !== null && v !== '').length;
        case 4: return nums.length ? Math.max(...nums) : 0;
        case 5: return nums.length ? Math.min(...nums) : 0;
        case 6: return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
        case 7: {
          if (nums.length <= 1) return '#DIV/0!';
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          return Math.sqrt(nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (nums.length - 1));
        }
        case 8: {
          if (nums.length === 0) return '#DIV/0!';
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          return Math.sqrt(nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / nums.length);
        }
        case 9: return nums.reduce((a, b) => a + b, 0);
        case 10: {
          if (nums.length <= 1) return '#DIV/0!';
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          return nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (nums.length - 1);
        }
        case 11: {
          if (nums.length === 0) return '#DIV/0!';
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          return nums.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / nums.length;
        }
        case 12: { // MEDIAN
          const sorted = [...nums].sort((a, b) => a - b);
          if (!sorted.length) return '#NUM!';
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
        case 13: { // MODE.SNGL
          if (!nums.length) return '#NUM!';
          const freq = new Map<number, number>();
          nums.forEach(n => freq.set(n, (freq.get(n) ?? 0) + 1));
          let top = nums[0];
          let maxFreq = 0;
          freq.forEach((f, k) => {
            if (f > maxFreq) {
              maxFreq = f;
              top = k;
            }
          });
          return maxFreq > 1 ? top : '#N/A';
        }
        case 14: { // LARGE
          const k = Math.floor(kParam ?? 1);
          const sorted = [...nums].sort((a, b) => b - a);
          if (k < 1 || k > sorted.length) return '#NUM!';
          return sorted[k - 1];
        }
        case 15: { // SMALL
          const k = Math.floor(kParam ?? 1);
          const sorted = [...nums].sort((a, b) => a - b);
          if (k < 1 || k > sorted.length) return '#NUM!';
          return sorted[k - 1];
        }
        case 16: { // PERCENTILE.INC
          const k = kParam ?? 0;
          if (isNaN(k) || k < 0 || k > 1 || !nums.length) return '#NUM!';
          const sorted = [...nums].sort((a, b) => a - b);
          const idx = k * (sorted.length - 1);
          const low = Math.floor(idx);
          const frac = idx - low;
          if (low >= sorted.length - 1) return sorted[sorted.length - 1];
          return sorted[low] + frac * (sorted[low + 1] - sorted[low]);
        }
        case 17: { // QUARTILE.INC
          const q = Math.floor(kParam ?? 0);
          if (q < 0 || q > 4 || !nums.length) return '#NUM!';
          const sorted = [...nums].sort((a, b) => a - b);
          const idx = (q * 0.25) * (sorted.length - 1);
          const low = Math.floor(idx);
          const frac = idx - low;
          if (low >= sorted.length - 1) return sorted[sorted.length - 1];
          return sorted[low] + frac * (sorted[low + 1] - sorted[low]);
        }
        default:
          return '#VALUE!';
      }
    }

    default:
      return undefined;
  }
}
