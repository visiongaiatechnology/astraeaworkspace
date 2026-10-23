// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Text formula domain
// Excel/Calc parity across TEXTJOIN, TEXT, PROPER, REPT, SEARCH, REPLACE, CONCAT, CONCATENATE, TRIM, LEFT, RIGHT, MID, LEN

import { FormulaValue, SingleFormulaValue, toSingleValue } from './gridFormulaTypes';
import { flattenToScalars } from './gridFormulaMath';
import { LinearPattern } from '../../../shared/patterns/linearPattern';

export function formatWithPattern(val: SingleFormulaValue, pattern: string): string {
  if (val === null || val === undefined || val === '') return '';

  const cleanPattern = pattern.trim();
  if (cleanPattern === '' || cleanPattern.toUpperCase() === 'GENERAL' || cleanPattern === '@') {
    return String(val);
  }

  // Date/Time formatting
  const dateTest = new Date(String(val));
  const isDatePattern = /[yYdDhHmMsS]/.test(cleanPattern) && !/[#0]/.test(cleanPattern);
  if (isDatePattern && !isNaN(dateTest.getTime())) {
    const yyyy = String(dateTest.getUTCFullYear());
    const mm = String(dateTest.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dateTest.getUTCDate()).padStart(2, '0');
    const hh = String(dateTest.getUTCHours()).padStart(2, '0');
    const min = String(dateTest.getUTCMinutes()).padStart(2, '0');
    const ss = String(dateTest.getUTCSeconds()).padStart(2, '0');

    return cleanPattern
      .replace(/yyyy/gi, yyyy)
      .replace(/yy/gi, yyyy.slice(-2))
      .replace(/mm/gi, mm)
      .replace(/dd/gi, dd)
      .replace(/hh/gi, hh)
      .replace(/nn/gi, min)
      .replace(/ss/gi, ss);
  }

  // Numeric formatting
  const num = Number(val);
  if (isNaN(num)) return String(val);

  // Percentage
  if (cleanPattern.includes('%')) {
    const pctVal = num * 100;
    const decMatch = cleanPattern.match(/\.(0+)/);
    const decimals = decMatch ? decMatch[1].length : 0;
    return `${pctVal.toFixed(decimals)}%`;
  }

  // Currency
  const hasCurrency = cleanPattern.startsWith('$') || cleanPattern.startsWith('€') || cleanPattern.startsWith('£');
  const currencySymbol = hasCurrency ? cleanPattern[0] : '';
  const numPattern = hasCurrency ? cleanPattern.slice(1).trim() : cleanPattern;

  const hasCommas = numPattern.includes(',');
  const decMatch = numPattern.match(/\.(0+)/);
  const decimals = decMatch ? decMatch[1].length : 0;

  let formattedNum = decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
  if (hasCommas) {
    const parts = formattedNum.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    formattedNum = parts.join('.');
  }

  return `${currencySymbol}${formattedNum}`;
}

export function toProperCase(text: string): string {
  return text.toLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, prefix, letter) => prefix + letter.toUpperCase());
}

function compileSafeGridRegex(pattern: string, flags = ''): LinearPattern | null {
  if (!pattern || pattern.length > 256 || /[^gi]/.test(flags)) return null;
  try {
    return new LinearPattern(pattern, {
      caseInsensitive: flags.includes('i'),
      limits: { maxPatternLength: 256, maxInputLength: 100_000, maxStates: 4096, maxMatches: 10_000, maxRepeat: 128 },
    });
  } catch {
    return null;
  }
}

function escapeLinearLiteral(value: string): string {
  let out = '';
  for (const char of value) out += '.+*?^$()[]{}|\\'.includes(char) ? `\\${char}` : char;
  return out;
}

function compileGridWildcard(pattern: string): LinearPattern | null {
  if (!pattern || pattern.length > 256) return null;
  let source = '';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else source += escapeLinearLiteral(char);
  }
  try {
    return new LinearPattern(source, {
      caseInsensitive: true,
      limits: { maxPatternLength: 768, maxInputLength: 100_000, maxStates: 4096, maxMatches: 10_000, maxRepeat: 128 },
    });
  } catch {
    return null;
  }
}

export function evalTextFunction(
  name: string,
  args: FormulaValue[]
): FormulaValue | undefined {
  switch (name) {
    case 'CONCAT':
    case 'CONCATENATE': {
      const scalars = flattenToScalars(args);
      return scalars.map(a => (a === null || a === undefined ? '' : String(a))).join('');
    }

    case 'TEXTJOIN': {
      if (args.length < 3) return '#VALUE!';
      const delim = String(toSingleValue(args[0]) ?? '');
      const skipEmpty = Boolean(toSingleValue(args[1]));
      const rawPieces = flattenToScalars(args.slice(2));
      const pieces = rawPieces.map(a => (a === null || a === undefined ? '' : String(a)));
      const filtered = skipEmpty ? pieces.filter(s => s.trim() !== '') : pieces;
      return filtered.join(delim);
    }

    case 'TEXT': {
      if (args.length < 2) return '#VALUE!';
      const val = toSingleValue(args[0]);
      const formatStr = String(toSingleValue(args[1]) ?? '');
      return formatWithPattern(val, formatStr);
    }

    case 'LEFT': {
      const s = String(toSingleValue(args[0]) ?? '');
      const n = args.length > 1 ? Number(toSingleValue(args[1])) : 1;
      if (isNaN(n) || n < 0) return '#VALUE!';
      return s.slice(0, Math.floor(n));
    }

    case 'RIGHT': {
      const s = String(toSingleValue(args[0]) ?? '');
      const n = args.length > 1 ? Number(toSingleValue(args[1])) : 1;
      if (isNaN(n) || n < 0) return '#VALUE!';
      const count = Math.floor(n);
      return s.slice(Math.max(0, s.length - count));
    }

    case 'MID': {
      if (args.length < 3) return '#VALUE!';
      const s = String(toSingleValue(args[0]) ?? '');
      const start = Number(toSingleValue(args[1])) - 1;
      const len = Number(toSingleValue(args[2]));
      if (isNaN(start) || isNaN(len) || start < 0 || len < 0) return '#VALUE!';
      return s.slice(start, start + Math.floor(len));
    }

    case 'LEN': {
      const s = String(toSingleValue(args[0]) ?? '');
      return s.length;
    }

    case 'TRIM': {
      const s = String(toSingleValue(args[0]) ?? '');
      return s.trim().replace(/\s+/g, ' ');
    }

    case 'UPPER':
      return String(toSingleValue(args[0]) ?? '').toUpperCase();

    case 'LOWER':
      return String(toSingleValue(args[0]) ?? '').toLowerCase();

    case 'PROPER': {
      const s = String(toSingleValue(args[0]) ?? '');
      return toProperCase(s);
    }

    case 'FIND': {
      if (args.length < 2) return '#VALUE!';
      const find = String(toSingleValue(args[0]) ?? '');
      const within = String(toSingleValue(args[1]) ?? '');
      const start = args.length > 2 ? Number(toSingleValue(args[2])) - 1 : 0;
      if (isNaN(start) || start < 0) return '#VALUE!';
      const pos = within.indexOf(find, start);
      return pos >= 0 ? pos + 1 : '#VALUE!';
    }

    case 'SEARCH': {
      if (args.length < 2) return '#VALUE!';
      const find = String(toSingleValue(args[0]) ?? '');
      const within = String(toSingleValue(args[1]) ?? '');
      const start = args.length > 2 ? Number(toSingleValue(args[2])) - 1 : 0;
      if (isNaN(start) || start < 0) return '#VALUE!';

      if (find.includes('*') || find.includes('?')) {
        const wildcard = compileGridWildcard(find);
        if (!wildcard) return '#VALUE!';
        const sub = within.slice(start);
        const match = wildcard.findFirst(sub);
        return match ? start + match.start + 1 : '#VALUE!';
      }

      const pos = within.toLowerCase().indexOf(find.toLowerCase(), start);
      return pos >= 0 ? pos + 1 : '#VALUE!';
    }

    case 'SUBSTITUTE': {
      if (args.length < 3) return '#VALUE!';
      const text = String(toSingleValue(args[0]) ?? '');
      const oldT = String(toSingleValue(args[1]) ?? '');
      const newT = String(toSingleValue(args[2]) ?? '');
      if (args.length > 3) {
        const instance = Math.floor(Number(toSingleValue(args[3])));
        if (isNaN(instance) || instance < 1) return '#VALUE!';
        let current = 0;
        let pos = 0;
        while ((pos = text.indexOf(oldT, pos)) !== -1) {
          current++;
          if (current === instance) {
            return text.slice(0, pos) + newT + text.slice(pos + oldT.length);
          }
          pos += oldT.length;
        }
        return text;
      }
      return text.split(oldT).join(newT);
    }

    case 'REPLACE': {
      if (args.length < 4) return '#VALUE!';
      const oldText = String(toSingleValue(args[0]) ?? '');
      const startNum = Number(toSingleValue(args[1])) - 1;
      const numChars = Number(toSingleValue(args[2]));
      const newText = String(toSingleValue(args[3]) ?? '');
      if (isNaN(startNum) || isNaN(numChars) || startNum < 0 || numChars < 0) return '#VALUE!';
      return oldText.slice(0, startNum) + newText + oldText.slice(startNum + Math.floor(numChars));
    }

    case 'EXACT':
      return String(toSingleValue(args[0]) ?? '') === String(toSingleValue(args[1]) ?? '');

    case 'REPT': {
      const text = String(toSingleValue(args[0]) ?? '');
      const count = Number(toSingleValue(args[1]) ?? 0);
      if (isNaN(count) || count < 0) return '#VALUE!';
      return text.repeat(Math.floor(count));
    }

    case 'VALUE': {
      const s = String(toSingleValue(args[0]) ?? '').trim().replace(/[^0-9.-]/g, '');
      const num = Number(s);
      return isNaN(num) ? '#VALUE!' : num;
    }

    case 'T':
      return typeof toSingleValue(args[0]) === 'string' ? toSingleValue(args[0]) : '';

    case 'CHAR': {
      const code = Number(toSingleValue(args[0]) ?? 0);
      if (isNaN(code) || code < 1 || code > 255) return '#VALUE!';
      return String.fromCharCode(code);
    }

    case 'CODE': {
      const s = String(toSingleValue(args[0]) ?? '');
      return s.length ? s.charCodeAt(0) : '#VALUE!';
    }

    case 'CLEAN':
      return String(toSingleValue(args[0]) ?? '').replace(/[\x00-\x1F\x7F]/g, '');

    case 'REGEXEXTRACT': {
      const text = String(toSingleValue(args[0]) ?? '');
      const pattern = String(toSingleValue(args[1]) ?? '');
      if (text.length > 100_000) return '#VALUE!';
      const regex = compileSafeGridRegex(pattern);
      if (!regex) return '#VALUE!';
      const match = regex.findFirst(text);
      return match ? match.text : '#N/A';
    }

    case 'REGEXMATCH': {
      const text = String(toSingleValue(args[0]) ?? '');
      const pattern = String(toSingleValue(args[1]) ?? '');
      if (text.length > 100_000) return '#VALUE!';
      const regex = compileSafeGridRegex(pattern);
      return regex ? regex.test(text) : '#VALUE!';
    }

    case 'REGEXREPLACE': {
      const text = String(toSingleValue(args[0]) ?? '');
      const pattern = String(toSingleValue(args[1]) ?? '');
      const replacement = String(toSingleValue(args[2]) ?? '');
      if (text.length > 100_000 || replacement.length > 10_000) return '#VALUE!';
      const regex = compileSafeGridRegex(pattern, 'g');
      return regex ? regex.replace(text, replacement, true).text : '#VALUE!';
    }

    default:
      return undefined;
  }
}
