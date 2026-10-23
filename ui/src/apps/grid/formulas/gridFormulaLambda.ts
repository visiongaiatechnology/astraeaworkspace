// STATUS: DIAMANT VGT SUPREME
// LAMBDA parsing, arity validation and invocation for the reference engine.
//
// Before this module the dispatcher matched `LAMBDA` with an ad-hoc regular
// expression, ignored the parameter list beyond the first name and silently accepted
// wrong arities: `MAP({1,2}, LAMBDA(x, y, x))` returned the *text* `y` instead of an
// error. The parser below owns the grammar, validates parameter counts against the
// call site, and makes named LAMBDAs (`namedFormulas: { DOUBLE: '=LAMBDA(x, x*2)' }`)
// and immediately-invoked LAMBDAs (`=LAMBDA(x, x*2)(5)`) work — including recursion,
// which the evaluation budget stops instead of the JavaScript stack.

import type { FormulaValue, FormulaError } from './gridFormulaTypes';
import { splitArgs } from './gridFormulaExpressionUtils';
import { parseA1ReferenceToken } from './gridFormulaReferences';

export interface ParsedLambda {
  /** Parameter names, upper-cased, in declaration order. */
  readonly parameters: readonly string[];
  /** The body expression, verbatim. */
  readonly body: string;
}

const LAMBDA_HEAD = /^LAMBDA\s*\(/i;
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/** Finds the index just past the parenthesis that closes the one at `openIndex`. */
function matchingParenthesis(text: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (inString && text[index + 1] === '"') {
        index++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function parameterError(name: string): FormulaError | null {
  if (!NAME_PATTERN.test(name)) return '#VALUE!';
  // A parameter must not shadow a cell address; Excel rejects names such as `A1`.
  if (parseA1ReferenceToken(name) !== null) return '#VALUE!';
  return null;
}

/**
 * Parses `LAMBDA(p1, p2, ..., calculation)`. Returns `null` for malformed
 * definitions and a `FormulaError` for structurally valid but illegal parameter lists.
 */
export function parseLambda(expression: string): ParsedLambda | FormulaError | null {
  const trimmed = expression.trim();
  if (!LAMBDA_HEAD.test(trimmed)) return null;
  const openIndex = trimmed.indexOf('(');
  const closeIndex = matchingParenthesis(trimmed, openIndex);
  if (closeIndex < 0) return '#VALUE!';
  if (closeIndex !== trimmed.length) return null;
  const inner = trimmed.slice(openIndex + 1, closeIndex - 1);
  const parts = splitArgs(inner);
  if (parts.length < 2) return '#VALUE!';
  const parameters: string[] = [];
  for (let index = 0; index < parts.length - 1; index++) {
    const raw = parts[index].trim();
    if (raw === '') return '#VALUE!';
    const error = parameterError(raw);
    if (error) return error;
    const upper = raw.toUpperCase();
    if (parameters.includes(upper)) return '#VALUE!';
    parameters.push(upper);
  }
  const body = parts[parts.length - 1].trim();
  if (body === '') return '#VALUE!';
  return { parameters: Object.freeze(parameters), body };
}

/**
 * Splits `LAMBDA(param, body)(arg1, arg2)` into the definition and the call arguments.
 * Returns `null` when the expression is not an immediately-invoked LAMBDA.
 */
export function splitImmediateLambdaCall(
  expression: string,
): { readonly lambda: ParsedLambda; readonly callArgs: readonly string[] } | FormulaError | null {
  const trimmed = expression.trim();
  if (!LAMBDA_HEAD.test(trimmed)) return null;
  const openIndex = trimmed.indexOf('(');
  const closeIndex = matchingParenthesis(trimmed, openIndex);
  if (closeIndex < 0) return '#VALUE!';
  const remainder = trimmed.slice(closeIndex).trim();
  if (!remainder.startsWith('(')) return null;
  const callClose = matchingParenthesis(remainder, 0);
  if (callClose !== remainder.length) return '#VALUE!';
  const parsed = parseLambda(trimmed.slice(0, closeIndex));
  if (parsed === null) return null;
  if (typeof parsed === 'string') return parsed;
  return { lambda: parsed, callArgs: Object.freeze(splitArgs(remainder.slice(1, callClose - 1))) };
}

/** Looks up a named LAMBDA definition in `namedFormulas`, case-insensitively. */
export function resolveNamedLambda(
  namedFormulas: Record<string, string> | undefined,
  name: string,
): ParsedLambda | FormulaError | null {
  if (!namedFormulas) return null;
  const target = name.trim().toUpperCase();
  let definition: string | undefined;
  for (const [key, value] of Object.entries(namedFormulas)) {
    if (key.trim().toUpperCase() === target) {
      definition = value;
      break;
    }
  }
  if (definition === undefined) return null;
  return parseLambda(definition.replace(/^=/, ''));
}

/**
 * Argument-count validation. A LAMBDA has no optional parameters: the call must supply
 * exactly as many arguments as declared parameters.
 */
export function validateLambdaArity(parsed: ParsedLambda, argCount: number): FormulaError | null {
  return parsed.parameters.length === argCount ? null : '#VALUE!';
}

export interface LambdaInvocationContext {
  /** Evaluates an expression with the supplied local variable scope. */
  readonly evaluate: (expression: string, variables: Record<string, FormulaValue>) => FormulaValue;
  /** Outer scope the lambda closes over. */
  readonly variables: Record<string, FormulaValue>;
  /** Raw argument expressions at the call site. */
  readonly rawArgs: readonly string[];
  /** Evaluates one raw argument in the caller's scope. */
  readonly evaluateArgument: (expression: string) => FormulaValue;
}

/**
 * Invokes a parsed LAMBDA whose arguments are ordinary expressions (scalar call, not a
 * higher-order function). Arguments are evaluated in the caller's scope before the
 * parameter scope is created, so a LAMBDA body can never observe a partially bound
 * parameter of its own invocation.
 */
export function invokeLambda(
  parsed: ParsedLambda,
  context: LambdaInvocationContext,
): FormulaValue | FormulaError {
  const bound = bindLambdaParameters(
    parsed,
    context.rawArgs.map((raw) => context.evaluateArgument(raw)),
    context.variables,
  );
  if (typeof bound === 'string') return bound;
  return context.evaluate(parsed.body, bound);
}

/**
 * Binds already-evaluated argument values to the declared parameters. Returns the
 * typed error the call would produce instead of a scope when the arity is wrong.
 */
export function bindLambdaParameters(
  parsed: ParsedLambda,
  argValues: readonly FormulaValue[],
  outerVariables: Record<string, FormulaValue>,
): Record<string, FormulaValue> | FormulaError {
  const arityError = validateLambdaArity(parsed, argValues.length);
  if (arityError) return arityError;
  const locals: Record<string, FormulaValue> = { ...outerVariables };
  for (let index = 0; index < parsed.parameters.length; index++) {
    locals[parsed.parameters[index]] = argValues[index];
  }
  return locals;
}

/**
 * Resolves the function argument of a higher-order function (`MAP`, `REDUCE`,
 * `BYROW`, ...). Accepts an inline LAMBDA literal or the name of a named LAMBDA.
 */
export function resolveLambdaArgument(
  rawArgument: string,
  namedFormulas: Record<string, string> | undefined,
): ParsedLambda | FormulaError | null {
  const trimmed = rawArgument.trim();
  const inline = parseLambda(trimmed);
  if (inline !== null) return inline;
  if (NAME_PATTERN.test(trimmed)) return resolveNamedLambda(namedFormulas, trimmed);
  return null;
}

