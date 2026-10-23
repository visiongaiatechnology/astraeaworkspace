// STATUS: DIAMANT VGT SUPREME
// Bounded Thompson-NFA style matcher for untrusted patterns.
// Deliberately supports a conservative regex subset and never delegates user patterns to RegExp.

export interface LinearPatternLimits {
  maxPatternLength: number;
  maxInputLength: number;
  maxStates: number;
  maxMatches: number;
  maxRepeat: number;
}

export interface LinearPatternOptions {
  caseInsensitive?: boolean;
  anchored?: boolean;
  wholeWord?: boolean;
  limits?: Partial<LinearPatternLimits>;
}

export interface LinearMatch {
  start: number;
  end: number;
  text: string;
}

const DEFAULT_LIMITS: LinearPatternLimits = Object.freeze({
  maxPatternLength: 256,
  maxInputLength: 4096,
  maxStates: 2048,
  maxMatches: 4096,
  maxRepeat: 128,
});

export class LinearPatternError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'LinearPatternError';
  }
}

type CharTest = (char: string) => boolean;
interface Atom { test: CharTest; min: number; max: number | null; }
type State =
  | { kind: 'char'; test: CharTest; out: number }
  | { kind: 'split'; out1: number; out2: number }
  | { kind: 'match' };

interface CompiledLinearPattern {
  states: State[];
  startState: number;
  matchState: number;
  startAnchored: boolean;
  endAnchored: boolean;
  wholeWord: boolean;
  limits: LinearPatternLimits;
}

function limitsFor(options?: LinearPatternOptions): LinearPatternLimits {
  const merged = { ...DEFAULT_LIMITS, ...(options?.limits ?? {}) };
  for (const [name, value] of Object.entries(merged)) {
    if (!Number.isInteger(value) || value <= 0) throw new LinearPatternError(`linear-pattern-invalid-limit:${name}`);
  }
  return merged;
}

function fold(value: string, insensitive: boolean): string {
  return insensitive ? value.toLocaleLowerCase('en-US') : value;
}

function isAsciiDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x30 && code <= 0x39;
}
function isAsciiWord(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x30 && code <= 0x39)
    || (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || code === 0x5f;
}
function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f' || char === '\v' || char === '\u00a0';
}
function isBoundaryWord(char: string): boolean {
  return char === '_' || /[\p{L}\p{N}]/u.test(char);
}
function isWordBoundary(text: string, index: number): boolean {
  const left = index > 0 ? isBoundaryWord(text[index - 1]) : false;
  const right = index < text.length ? isBoundaryWord(text[index]) : false;
  return left !== right;
}

function escapedPredicate(code: string, insensitive: boolean): { test: CharTest; literal?: string } {
  switch (code) {
    case 'd': return { test: isAsciiDigit };
    case 'D': return { test: (char) => !isAsciiDigit(char) };
    case 'w': return { test: isAsciiWord };
    case 'W': return { test: (char) => !isAsciiWord(char) };
    case 's': return { test: isWhitespace };
    case 'S': return { test: (char) => !isWhitespace(char) };
    case 'n': return { literal: '\n', test: (char) => char === '\n' };
    case 'r': return { literal: '\r', test: (char) => char === '\r' };
    case 't': return { literal: '\t', test: (char) => char === '\t' };
    case 'f': return { literal: '\f', test: (char) => char === '\f' };
    case 'v': return { literal: '\v', test: (char) => char === '\v' };
    case 'b':
    case 'B':
      throw new LinearPatternError('linear-pattern-word-boundary-escape-unsupported');
    case 'p':
    case 'P':
    case 'k':
      throw new LinearPatternError('linear-pattern-advanced-escape-unsupported');
    default:
      if (code >= '1' && code <= '9') throw new LinearPatternError('linear-pattern-backreference-unsupported');
      return {
        literal: code,
        test: (char) => fold(char, insensitive) === fold(code, insensitive),
      };
  }
}

interface ClassTerm {
  test: CharTest;
  literal?: string;
}

function parseClass(pattern: string, start: number, insensitive: boolean): { test: CharTest; next: number } {
  let index = start + 1;
  let negated = false;
  if (pattern[index] === '^') { negated = true; index += 1; }
  const terms: CharTest[] = [];
  let sawAny = false;

  const readTerm = (): ClassTerm => {
    if (index >= pattern.length) throw new LinearPatternError('linear-pattern-class-unclosed');
    if (pattern[index] === '\\') {
      index += 1;
      if (index >= pattern.length) throw new LinearPatternError('linear-pattern-class-escape');
      const term = escapedPredicate(pattern[index], insensitive);
      index += 1;
      return term;
    }
    const literal = pattern[index];
    index += 1;
    return {
      literal,
      test: (char) => fold(char, insensitive) === fold(literal, insensitive),
    };
  };

  while (index < pattern.length) {
    if (pattern[index] === ']' && sawAny) {
      index += 1;
      if (!terms.length) throw new LinearPatternError('linear-pattern-class-empty');
      const classTest: CharTest = (char) => terms.some((test) => test(char));
      return { test: negated ? (char) => !classTest(char) : classTest, next: index };
    }
    const lower = readTerm();
    sawAny = true;
    if (pattern[index] === '-' && pattern[index + 1] !== ']' && pattern[index + 1] !== undefined) {
      index += 1;
      const upper = readTerm();
      if (lower.literal === undefined || upper.literal === undefined) throw new LinearPatternError('linear-pattern-class-range-set');
      const lo = fold(lower.literal, insensitive).codePointAt(0) ?? 0;
      const hi = fold(upper.literal, insensitive).codePointAt(0) ?? 0;
      if (lo > hi) throw new LinearPatternError('linear-pattern-class-range-order');
      terms.push((char) => {
        const value = fold(char, insensitive).codePointAt(0) ?? -1;
        return value >= lo && value <= hi;
      });
    } else {
      terms.push(lower.test);
    }
  }
  throw new LinearPatternError('linear-pattern-class-unclosed');
}

function parseUnsigned(pattern: string, start: number, maxDigits = 4): { value: number; next: number } {
  let index = start;
  let digits = '';
  while (index < pattern.length && pattern[index] >= '0' && pattern[index] <= '9' && digits.length < maxDigits) {
    digits += pattern[index];
    index += 1;
  }
  if (!digits) throw new LinearPatternError('linear-pattern-quantifier-invalid');
  if (index < pattern.length && pattern[index] >= '0' && pattern[index] <= '9') throw new LinearPatternError('linear-pattern-quantifier-too-large');
  return { value: Number(digits), next: index };
}

function parseQuantifier(pattern: string, start: number, maxRepeat: number): { min: number; max: number | null; next: number } {
  const char = pattern[start];
  if (char === '?') return { min: 0, max: 1, next: start + 1 };
  if (char === '*') return { min: 0, max: null, next: start + 1 };
  if (char === '+') return { min: 1, max: null, next: start + 1 };
  if (char !== '{') return { min: 1, max: 1, next: start };
  let index = start + 1;
  const minResult = parseUnsigned(pattern, index);
  const min = minResult.value;
  index = minResult.next;
  let max: number | null = min;
  if (pattern[index] === ',') {
    index += 1;
    if (pattern[index] === '}') max = null;
    else {
      const maxResult = parseUnsigned(pattern, index);
      max = maxResult.value;
      index = maxResult.next;
    }
  }
  if (pattern[index] !== '}') throw new LinearPatternError('linear-pattern-quantifier-invalid');
  index += 1;
  if (min > maxRepeat || (max !== null && max > maxRepeat)) throw new LinearPatternError('linear-pattern-quantifier-limit');
  if (max !== null && max < min) throw new LinearPatternError('linear-pattern-quantifier-order');
  return { min, max, next: index };
}

function parseAtoms(pattern: string, insensitive: boolean, limits: LinearPatternLimits): { atoms: Atom[]; startAnchored: boolean; endAnchored: boolean } {
  if (!pattern || pattern.length > limits.maxPatternLength) throw new LinearPatternError('linear-pattern-length');
  let index = 0;
  let startAnchored = false;
  let endAnchored = false;
  if (pattern[index] === '^') { startAnchored = true; index += 1; }
  const atoms: Atom[] = [];
  while (index < pattern.length) {
    if (pattern[index] === '$' && index === pattern.length - 1) { endAnchored = true; index += 1; break; }
    const char = pattern[index];
    if (char === '(' || char === ')' || char === '|' || char === '^' || char === '$') throw new LinearPatternError('linear-pattern-construct-unsupported');
    if (char === '?' || char === '*' || char === '+' || char === '{' || char === '}') throw new LinearPatternError('linear-pattern-quantifier-without-atom');
    let test: CharTest;
    if (char === '[') {
      const parsed = parseClass(pattern, index, insensitive);
      test = parsed.test;
      index = parsed.next;
    } else if (char === '\\') {
      index += 1;
      if (index >= pattern.length) throw new LinearPatternError('linear-pattern-escape');
      test = escapedPredicate(pattern[index], insensitive).test;
      index += 1;
    } else if (char === '.') {
      test = (value) => value !== '\n' && value !== '\r';
      index += 1;
    } else {
      const expected = fold(char, insensitive);
      test = (value) => fold(value, insensitive) === expected;
      index += 1;
    }
    const quantifier = parseQuantifier(pattern, index, limits.maxRepeat);
    index = quantifier.next;
    if (pattern[index] === '?') throw new LinearPatternError('linear-pattern-lazy-quantifier-unsupported');
    atoms.push({ test, min: quantifier.min, max: quantifier.max });
    if (atoms.length > limits.maxPatternLength) throw new LinearPatternError('linear-pattern-atom-limit');
  }
  return { atoms, startAnchored, endAnchored };
}

function compile(pattern: string, options: LinearPatternOptions = {}): CompiledLinearPattern {
  const limits = limitsFor(options);
  const parsed = parseAtoms(pattern, Boolean(options.caseInsensitive), limits);
  const states: State[] = [{ kind: 'match' }];
  const matchState = 0;
  let current = matchState;
  const push = (state: State): number => {
    if (states.length >= limits.maxStates) throw new LinearPatternError('linear-pattern-state-limit');
    states.push(state);
    return states.length - 1;
  };

  for (let atomIndex = parsed.atoms.length - 1; atomIndex >= 0; atomIndex -= 1) {
    const atom = parsed.atoms[atomIndex];
    if (atom.max === null) {
      const split = push({ kind: 'split', out1: current, out2: -1 });
      const loopChar = push({ kind: 'char', test: atom.test, out: split });
      (states[split] as Extract<State, { kind: 'split' }>).out2 = loopChar;
      current = split;
    } else {
      for (let optional = atom.max - atom.min; optional > 0; optional -= 1) {
        const consume = push({ kind: 'char', test: atom.test, out: current });
        current = push({ kind: 'split', out1: current, out2: consume });
      }
    }
    for (let required = atom.min; required > 0; required -= 1) current = push({ kind: 'char', test: atom.test, out: current });
  }

  const startState = current;
  const closure = new Map<number, number>();
  addClosure(states, closure, startState, 0);
  if (closure.has(matchState)) throw new LinearPatternError('linear-pattern-empty-match-denied');
  return {
    states,
    startState,
    matchState,
    startAnchored: Boolean(options.anchored) || parsed.startAnchored,
    endAnchored: Boolean(options.anchored) || parsed.endAnchored,
    wholeWord: Boolean(options.wholeWord),
    limits,
  };
}

function addClosure(states: State[], target: Map<number, number>, stateIndex: number, start: number): void {
  const stack: number[] = [stateIndex];
  while (stack.length) {
    const index = stack.pop()!;
    const previous = target.get(index);
    if (previous !== undefined && previous <= start) continue;
    target.set(index, start);
    const state = states[index];
    if (state.kind === 'split') {
      stack.push(state.out1, state.out2);
    }
  }
}

function minLiveOrigin(active: Map<number, number>, states: State[], matchState: number): number | null {
  let min: number | null = null;
  for (const [index, start] of active) {
    if (index === matchState || states[index].kind === 'match') continue;
    if (min === null || start < min) min = start;
  }
  return min;
}

function matchAllowed(text: string, start: number, end: number, compiled: CompiledLinearPattern): boolean {
  if (compiled.endAnchored && end !== text.length) return false;
  if (compiled.wholeWord && (!isWordBoundary(text, start) || !isWordBoundary(text, end))) return false;
  return end > start;
}

function findFirstCompiled(text: string, from: number, compiled: CompiledLinearPattern): LinearMatch | null {
  if (text.length > compiled.limits.maxInputLength) throw new LinearPatternError('linear-pattern-input-limit');
  if (from < 0 || from > text.length) throw new LinearPatternError('linear-pattern-offset');
  if (compiled.startAnchored && from > 0) return null;

  let active = new Map<number, number>();
  let candidate: { start: number; end: number } | null = null;
  const seed = (position: number): void => {
    if (compiled.startAnchored && position !== 0) return;
    if (!compiled.startAnchored && position < from) return;
    if (compiled.wholeWord && !isWordBoundary(text, position)) return;
    addClosure(compiled.states, active, compiled.startState, position);
  };

  seed(from);
  for (let position = from; position < text.length; position += 1) {
    if (!compiled.startAnchored && position > from) seed(position);
    const next = new Map<number, number>();
    const char = text[position];
    for (const [stateIndex, start] of active) {
      const state = compiled.states[stateIndex];
      if (state.kind === 'char' && state.test(char)) addClosure(compiled.states, next, state.out, start);
    }
    const end = position + 1;
    const matchStart = next.get(compiled.matchState);
    if (matchStart !== undefined && matchAllowed(text, matchStart, end, compiled)) {
      if (!candidate || matchStart < candidate.start || (matchStart === candidate.start && end > candidate.end)) candidate = { start: matchStart, end };
    }
    active = next;
    if (candidate) {
      const minOrigin = minLiveOrigin(active, compiled.states, compiled.matchState);
      if (minOrigin === null || minOrigin > candidate.start) {
        return { ...candidate, text: text.slice(candidate.start, candidate.end) };
      }
    }
    if (compiled.startAnchored && active.size === 0 && !candidate) return null;
  }
  if (candidate) return { ...candidate, text: text.slice(candidate.start, candidate.end) };
  return null;
}

export class LinearPattern {
  private readonly compiled: CompiledLinearPattern;
  constructor(readonly source: string, readonly options: LinearPatternOptions = {}) {
    this.compiled = compile(source, options);
  }
  test(input: string): boolean {
    return findFirstCompiled(input, 0, this.compiled) !== null;
  }
  findFirst(input: string, from = 0): LinearMatch | null {
    return findFirstCompiled(input, from, this.compiled);
  }
  findAll(input: string): LinearMatch[] {
    if (input.length > this.compiled.limits.maxInputLength) throw new LinearPatternError('linear-pattern-input-limit');
    const matches: LinearMatch[] = [];
    let from = 0;
    while (from < input.length) {
      const match = findFirstCompiled(input, from, this.compiled);
      if (!match) break;
      matches.push(match);
      if (matches.length >= this.compiled.limits.maxMatches) throw new LinearPatternError('linear-pattern-match-limit');
      from = Math.max(match.end, match.start + 1);
      if (this.compiled.startAnchored) break;
    }
    return matches;
  }
  replace(input: string, replacement: string, all = true): { text: string; count: number } {
    if (replacement.length > this.compiled.limits.maxInputLength) throw new LinearPatternError('linear-pattern-replacement-limit');
    const matches = all ? this.findAll(input) : (() => { const one = this.findFirst(input); return one ? [one] : []; })();
    if (!matches.length) return { text: input, count: 0 };
    let output = '';
    let cursor = 0;
    for (const match of matches) {
      output += input.slice(cursor, match.start) + replacement;
      cursor = match.end;
    }
    output += input.slice(cursor);
    return { text: output, count: matches.length };
  }
}

export function linearPatternTest(input: string, pattern: string, options: LinearPatternOptions = {}): boolean {
  return new LinearPattern(pattern, options).test(input);
}
