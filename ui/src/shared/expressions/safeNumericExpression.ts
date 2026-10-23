// STATUS: DIAMANT VGT SUPREME
// Shared deterministic numeric-expression subset for Database/Grid transforms.
// This deliberately is NOT a second spreadsheet formula engine.

export interface SafeNumericExpressionOptions {
  maxLength?: number;
  maxTokens?: number;
  maxDepth?: number;
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '%' | '^' }
  | { type: 'lparen' | 'rparen' | 'comma' };

const DEFAULT_MAX_LENGTH = 1024;
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_MAX_DEPTH = 32;
const SAFE_FUNCTIONS: Readonly<Record<string, (...args: number[]) => number>> = Object.freeze({
  ABS: Math.abs,
  MIN: (...args) => Math.min(...args),
  MAX: (...args) => Math.max(...args),
  ROUND: (value, digits = 0) => {
    const factor = 10 ** Math.trunc(digits);
    return Math.round(value * factor) / factor;
  },
  FLOOR: Math.floor,
  CEIL: Math.ceil,
  SQRT: Math.sqrt,
  POW: Math.pow,
  EXP: Math.exp,
  LOG: Math.log,
  LOG10: Math.log10,
});

function isIdentifierStart(ch: string): boolean { return /[\p{L}_]/u.test(ch); }
function isIdentifierPart(ch: string): boolean { return /[\p{L}\p{N}_.]/u.test(ch); }

function tokenize(expression: string, maxTokens: number): Token[] {
  const tokens: Token[] = [];
  const push = (token: Token) => {
    if (tokens.length >= maxTokens) throw new Error('expression_token_limit');
    tokens.push(token);
  };
  for (let i = 0; i < expression.length;) {
    const ch = expression[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const start = i++;
      while (i < expression.length && /[0-9eE+\-.]/.test(expression[i])) {
        const prev = expression[i - 1];
        const current = expression[i];
        if ((current === '+' || current === '-') && prev !== 'e' && prev !== 'E') break;
        i++;
      }
      const value = Number(expression.slice(start, i));
      if (!Number.isFinite(value)) throw new Error('expression_number_invalid');
      push({ type: 'number', value });
      continue;
    }
    if (ch === '[') {
      const end = expression.indexOf(']', i + 1);
      if (end < 0 || end - i > 130) throw new Error('expression_identifier_invalid');
      const value = expression.slice(i + 1, end).trim();
      if (!value) throw new Error('expression_identifier_invalid');
      push({ type: 'identifier', value });
      i = end + 1;
      continue;
    }
    if (isIdentifierStart(ch)) {
      const start = i++;
      while (i < expression.length && isIdentifierPart(expression[i])) i++;
      push({ type: 'identifier', value: expression.slice(start, i) });
      continue;
    }
    if ('+-*/%^'.includes(ch)) { push({ type: 'operator', value: ch as '+' | '-' | '*' | '/' | '%' | '^' }); i++; continue; }
    if (ch === '(') { push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { push({ type: 'rparen' }); i++; continue; }
    if (ch === ',') { push({ type: 'comma' }); i++; continue; }
    throw new Error('expression_character_blocked');
  }
  return tokens;
}

class Parser {
  private index = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[], private readonly variables: Record<string, number>, private readonly maxDepth: number) {}
  parse(): number {
    const value = this.parseAddSub();
    if (this.index !== this.tokens.length) throw new Error('expression_trailing_tokens');
    return this.finite(value);
  }
  private parseAddSub(): number {
    let value = this.parseMulDiv();
    while (this.matchOperator('+') || this.matchOperator('-')) {
      const op = (this.tokens[this.index - 1] as Extract<Token, { type: 'operator' }>).value;
      const rhs = this.parseMulDiv(); value = op === '+' ? value + rhs : value - rhs;
    }
    return this.finite(value);
  }
  private parseMulDiv(): number {
    let value = this.parseUnary();
    while (this.matchOperator('*') || this.matchOperator('/') || this.matchOperator('%')) {
      const op = (this.tokens[this.index - 1] as Extract<Token, { type: 'operator' }>).value;
      const rhs = this.parseUnary();
      if ((op === '/' || op === '%') && rhs === 0) throw new Error('expression_div_zero');
      value = op === '*' ? value * rhs : op === '/' ? value / rhs : value % rhs;
    }
    return this.finite(value);
  }
  private parseUnary(): number {
    if (this.matchOperator('+')) return this.parseUnary();
    if (this.matchOperator('-')) return -this.parseUnary();
    return this.parsePower();
  }
  private parsePower(): number {
    let value = this.parsePrimary();
    if (this.matchOperator('^')) value = Math.pow(value, this.parseUnary());
    return this.finite(value);
  }
  private parsePrimary(): number {
    const token = this.tokens[this.index++];
    if (!token) throw new Error('expression_operand_missing');
    if (token.type === 'number') return token.value;
    if (token.type === 'lparen') {
      if (++this.depth > this.maxDepth) throw new Error('expression_depth_limit');
      const value = this.parseAddSub();
      if (this.tokens[this.index]?.type !== 'rparen') throw new Error('expression_parenthesis_mismatch');
      this.index++; this.depth--; return value;
    }
    if (token.type === 'identifier') {
      if (this.tokens[this.index]?.type === 'lparen') return this.parseFunction(token.value);
      const key = Object.keys(this.variables).find((name) => name.toLocaleLowerCase() === token.value.toLocaleLowerCase());
      if (!key) throw new Error('expression_unknown_identifier');
      return this.finite(this.variables[key]);
    }
    throw new Error('expression_operand_invalid');
  }
  private parseFunction(name: string): number {
    const fn = SAFE_FUNCTIONS[name.toUpperCase()];
    if (!fn) throw new Error('expression_function_blocked');
    this.index++;
    if (++this.depth > this.maxDepth) throw new Error('expression_depth_limit');
    const args: number[] = [];
    if (this.tokens[this.index]?.type !== 'rparen') {
      while (true) {
        args.push(this.parseAddSub());
        if (args.length > 32) throw new Error('expression_argument_limit');
        if (this.tokens[this.index]?.type !== 'comma') break;
        this.index++;
      }
    }
    if (this.tokens[this.index]?.type !== 'rparen') throw new Error('expression_parenthesis_mismatch');
    this.index++; this.depth--; return this.finite(fn(...args));
  }
  private matchOperator(op: Extract<Token, { type: 'operator' }>['value']): boolean {
    const token = this.tokens[this.index];
    if (token?.type !== 'operator' || token.value !== op) return false;
    this.index++; return true;
  }
  private finite(value: number): number {
    if (!Number.isFinite(value)) throw new Error('expression_non_finite');
    return value;
  }
}

export function evaluateSafeNumericExpression(
  expression: string,
  variables: Record<string, number> = {},
  options: SafeNumericExpressionOptions = {},
): number {
  const maxLength = Math.max(32, Math.min(4096, options.maxLength ?? DEFAULT_MAX_LENGTH));
  if (!expression || expression.length > maxLength) throw new Error('expression_length_limit');
  if (Object.keys(variables).length > 256) throw new Error('expression_variable_limit');
  for (const value of Object.values(variables)) if (!Number.isFinite(value)) throw new Error('expression_variable_invalid');
  const tokens = tokenize(expression, Math.max(16, Math.min(2048, options.maxTokens ?? DEFAULT_MAX_TOKENS)));
  return new Parser(tokens, variables, Math.max(4, Math.min(64, options.maxDepth ?? DEFAULT_MAX_DEPTH))).parse();
}
