// STATUS: DIAMANT VGT SUPREME
// Typed formula error diagnosis for the Grid raster.
//
// The raster needs more than the raw error token: it needs a stable code, a German
// explanation, an actionable hint and the reference path that produced the error so
// the UI can draw trace arrows. This module is the single source for that data and
// never evaluates a formula itself, so it cannot diverge from the evaluator.

import type { GridCell } from '../../../shared/contracts/workspace';
import { FORMULA_ERRORS, isFormulaError, type FormulaError } from './gridFormulaTypes';
import {
  getFormulaFunctionEntry,
  isKnownFormulaFunction,
  validateFormulaFunctionArity,
  normalizeFormulaFunctionName,
  type GridFormulaFunctionEntry,
} from './gridFormulaCatalog';
import {
  GRID_FORMULA_LIMITS,
  type GridFormulaLimits,
} from './gridFormulaLimits';
import { extractReferencesFromFormula } from './gridFormulaReferences';

export type GridFormulaDiagnosticSeverity = 'error' | 'warning' | 'info';

export type GridFormulaDiagnosticKind =
  | 'error-value'
  | 'unterminated-string'
  | 'unbalanced-parentheses'
  | 'unknown-function'
  | 'argument-count'
  | 'invalid-reference'
  | 'circular-reference'
  | 'formula-too-long'
  | 'empty-formula'
  | 'volatile-disabled';

export interface GridFormulaDiagnostic {
  readonly kind: GridFormulaDiagnosticKind;
  readonly severity: GridFormulaDiagnosticSeverity;
  /** Spreadsheet error the cell will display, or `null` for non-fatal findings. */
  readonly code: FormulaError | null;
  readonly title: string;
  readonly message: string;
  readonly hint: string;
  readonly coord?: string;
  /** Offending formula fragment (function name, token) when known. */
  readonly token?: string;
}

interface ErrorDocumentation {
  readonly title: string;
  readonly message: string;
  readonly hint: string;
}

/**
 * Exhaustive documentation for every typed spreadsheet error the project emits.
 * `Record<FormulaError, ...>` makes a new error code a compile error here.
 */
export const GRID_FORMULA_ERROR_DOCS: Readonly<Record<FormulaError, ErrorDocumentation>> = Object.freeze({
  '#NULL!': {
    title: 'Leere Schnittmenge',
    message: 'Zwei Bereiche schneiden sich nicht oder es wurde ein Leerwert erwartet.',
    hint: 'Pruefen Sie den Schnittmengenoperator und die Bereichsgrenzen.',
  },
  '#DIV/0!': {
    title: 'Division durch Null',
    message: 'Ein Divisor ist 0 oder verweist auf eine leere Zelle.',
    hint: 'Fangen Sie den Fall mit WENN oder WENNFEHLER ab, z. B. =WENNFEHLER(A1/B1;0).',
  },
  '#VALUE!': {
    title: 'Falscher Werttyp',
    message: 'Ein Argument hat den falschen Typ, z. B. Text in einem Zahlenargument.',
    hint: 'Wandeln Sie den Wert mit WERT, ZAHLENWERT oder TEXT um, bevor Sie rechnen.',
  },
  '#REF!': {
    title: 'Ungueltiger Bezug',
    message: 'Ein Zell- oder Bereichsbezug zeigt auf eine geloeschte oder ungueltige Stelle.',
    hint: 'Pruefen Sie die Bezuege mit dem Formelpruefer oder korrigieren Sie die Referenz.',
  },
  '#NAME?': {
    title: 'Unbekannter Name',
    message: 'Ein Funktions- oder Bereichsname ist nicht bekannt.',
    hint: 'Pruefen Sie die Schreibweise und verwenden Sie den Funktionsassistenten.',
  },
  '#NUM!': {
    title: 'Ungueltige Zahl',
    message: 'Ein numerisches Ergebnis ist nicht darstellbar, z. B. Wurzel aus einer negativen Zahl.',
    hint: 'Pruefen Sie Wertebereich und Vorzeichen der Argumente.',
  },
  '#N/A': {
    title: 'Wert nicht verfuegbar',
    message: 'Eine Suche hat keinen Treffer geliefert.',
    hint: 'Nutzen Sie den If-not-found-Parameter, z. B. =XVERWEIS(...;"nicht gefunden").',
  },
  '#N/A!': {
    title: 'Wert nicht verfuegbar',
    message: 'Eine Suche hat keinen Treffer geliefert.',
    hint: 'Nutzen Sie den If-not-found-Parameter, z. B. =XVERWEIS(...;"nicht gefunden").',
  },
  '#SPILL!': {
    title: 'Auslaufbereich blockiert',
    message: 'Eine dynamische Matrix kann sich nicht ausbreiten, weil Zielzellen belegt sind.',
    hint: 'Leeren Sie den Zielbereich oder verkleinern Sie die Matrix mit INDEX oder FILTER.',
  },
  '#CALC!': {
    title: 'Berechnung nicht moeglich',
    message: 'Die Berechnung wurde abgebrochen, z. B. weil ein Ergebnis leer ist oder ein Limit greift.',
    hint: 'Vereinfachen Sie die Formel oder verkleinern Sie die Eingabebereiche.',
  },
  '#CIRCULAR!': {
    title: 'Zirkulaerer Bezug',
    message: 'Die Formel haengt mittelbar oder unmittelbar von sich selbst ab.',
    hint: 'Brechen Sie den Zyklus auf oder aktivieren Sie die iterative Berechnung mit Limit.',
  },
});

export function isKnownFormulaErrorCode(value: unknown): value is FormulaError {
  return isFormulaError(value);
}

/** Returns documentation for an error value, or `null` for non-error values. */
export function describeFormulaError(value: unknown): GridFormulaDiagnostic | null {
  if (!isFormulaError(value)) return null;
  const docs = GRID_FORMULA_ERROR_DOCS[value];
  return {
    kind: 'error-value',
    severity: 'error',
    code: value,
    title: docs.title,
    message: docs.message,
    hint: docs.hint,
  };
}

/**
 * Numeric codes for `ERROR.TYPE`. Extends the classic mapping with the project's
 * dynamic-array and cycle codes so `=ERROR.TYP(#SPILL!)` is well defined instead of
 * silently returning `#N/A`.
 */
export const GRID_FORMULA_ERROR_TYPE_CODES: Readonly<Record<FormulaError, number>> = Object.freeze({
  '#NULL!': 1,
  '#DIV/0!': 2,
  '#VALUE!': 3,
  '#REF!': 4,
  '#NAME?': 5,
  '#NUM!': 6,
  '#N/A': 7,
  '#N/A!': 7,
  '#SPILL!': 8,
  '#CALC!': 9,
  '#CIRCULAR!': 10,
});

export function formulaErrorTypeCode(value: unknown): number {
  return isFormulaError(value) ? GRID_FORMULA_ERROR_TYPE_CODES[value] : 0;
}

/** Removes double-quoted literals so static checks never inspect string content. */
export function stripFormulaStringLiterals(formula: string): string {
  let output = '';
  let inString = false;
  for (let index = 0; index < formula.length; index++) {
    const char = formula[index];
    if (char === '"') {
      if (inString && formula[index + 1] === '"') {
        index++;
        continue;
      }
      inString = !inString;
      output += ' ';
      continue;
    }
    output += inString ? ' ' : char;
  }
  return output;
}

function hasUnterminatedString(formula: string): boolean {
  let inString = false;
  for (let index = 0; index < formula.length; index++) {
    if (formula[index] !== '"') continue;
    if (inString && formula[index + 1] === '"') {
      index++;
      continue;
    }
    inString = !inString;
  }
  return inString;
}

export interface FormulaCallSite {
  readonly name: string;
  readonly argCount: number;
  readonly start: number;
}

function countArguments(body: string): number {
  if (body.trim() === '') return 0;
  let depth = 0;
  let inString = false;
  let count = 1;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === '"') {
      if (inString && body[index + 1] === '"') {
        index++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '(' || char === '{') depth++;
    else if (char === ')' || char === '}') depth--;
    else if (char === ',' && depth === 0) count++;
  }
  return count;
}

/** Enumerates `NAME(` call sites with a balanced-argument count, outside literals. */
export function scanFormulaCallSites(formula: string): readonly FormulaCallSite[] {
  const source = stripFormulaStringLiterals(formula);
  const sites: FormulaCallSite[] = [];
  const pattern = /([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1];
    let depth = 1;
    let cursor = pattern.lastIndex;
    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      cursor++;
    }
    const body = source.slice(pattern.lastIndex, depth === 0 ? cursor - 1 : source.length);
    sites.push({ name, argCount: countArguments(body), start: match.index });
  }
  return sites;
}

export interface DiagnoseFormulaOptions {
  readonly coord?: string;
  /** Named ranges / named formulas that are legal identifiers. */
  readonly namedIdentifiers?: readonly string[];
  /** Extra function names accepted beyond the canonical catalogue. */
  readonly extraFunctions?: readonly string[];
  readonly limits?: GridFormulaLimits;
  /** When provided together with `coord`, self references are reported as cycles. */
  readonly cells?: Record<string, GridCell>;
}

const MAX_COLUMN_INDEX = 16_384;
const MAX_ROW_INDEX = 1_048_576;

function columnLettersToIndex(letters: string): number {
  let index = 0;
  for (let i = 0; i < letters.length; i++) index = index * 26 + (letters.charCodeAt(i) - 64);
  return index;
}

/**
 * Static, side-effect-free diagnosis of a formula. Reports every finding it can
 * prove from the text plus the optional cell context; it never guesses.
 */
export function diagnoseFormula(
  formula: string,
  options: DiagnoseFormulaOptions = {},
): readonly GridFormulaDiagnostic[] {
  const limits = options.limits ?? GRID_FORMULA_LIMITS;
  const coord = options.coord;
  const findings: GridFormulaDiagnostic[] = [];
  const trimmed = formula.trim();

  if (trimmed === '') {
    findings.push({
      kind: 'empty-formula',
      severity: 'info',
      code: null,
      title: 'Leere Formel',
      message: 'Es wurde kein Ausdruck eingegeben.',
      hint: 'Beginnen Sie mit "=" und waehlen Sie eine Funktion aus dem Assistenten.',
      ...(coord ? { coord } : {}),
    });
    return findings;
  }

  if (!trimmed.startsWith('=')) return findings;

  if (trimmed.length > limits.maxFormulaLength) {
    findings.push({
      kind: 'formula-too-long',
      severity: 'error',
      code: '#CALC!',
      title: 'Formel zu lang',
      message: `Die Formel hat ${trimmed.length} Zeichen, erlaubt sind ${limits.maxFormulaLength}.`,
      hint: 'Teilen Sie die Berechnung in Hilfszellen oder benannte Formeln auf.',
      ...(coord ? { coord } : {}),
    });
    return findings;
  }

  if (hasUnterminatedString(trimmed)) {
    findings.push({
      kind: 'unterminated-string',
      severity: 'error',
      code: '#VALUE!',
      title: 'Nicht abgeschlossener Text',
      message: 'Ein Textliteral wurde nicht mit einem Anfuehrungszeichen beendet.',
      hint: 'Schliessen Sie den Text oder verdoppeln Sie innere Anfuehrungszeichen.',
      ...(coord ? { coord } : {}),
    });
  }

  const source = stripFormulaStringLiterals(trimmed);
  let depth = 0;
  for (const char of source) {
    if (char === '(' || char === '{') depth++;
    else if (char === ')' || char === '}') {
      depth--;
      if (depth < 0) break;
    }
  }
  if (depth !== 0) {
    findings.push({
      kind: 'unbalanced-parentheses',
      severity: 'error',
      code: '#VALUE!',
      title: 'Klammern unausgeglichen',
      message: 'Die Anzahl oeffnender und schliessender Klammern stimmt nicht ueberein.',
      hint: 'Ergaenzen oder entfernen Sie die fehlende Klammer.',
      ...(coord ? { coord } : {}),
    });
  }

  // Error literals are matched with a longest-first alternation: splitting on
  // punctuation would cut `#REF!` into the meaningless token `#REF`.
  const errorLiteralPattern = new RegExp(
    [...FORMULA_ERRORS]
      .sort((left, right) => right.length - left.length)
      .map((code) => code.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
      .join('|'),
    'g',
  );
  const reportedErrorLiterals = new Set<string>();
  let errorLiteral: RegExpExecArray | null;
  while ((errorLiteral = errorLiteralPattern.exec(source)) !== null) {
    const code = errorLiteral[0].toUpperCase();
    if (reportedErrorLiterals.has(code)) continue;
    reportedErrorLiterals.add(code);
    findings.push({
      kind: 'error-value',
      severity: 'error',
      code: code as FormulaError,
      title: GRID_FORMULA_ERROR_DOCS[code as FormulaError].title,
      message: `Die Formel enthaelt den Fehlerwert ${code} als Literal.`,
      hint: 'Ersetzen Sie den Fehlerwert durch einen gueltigen Bezug oder Wert.',
      token: code,
      ...(coord ? { coord } : {}),
    });
  }

  const referencePattern = /(?<![A-Za-z0-9_$])\$?([A-Z]{1,3})\$?([0-9]{1,7})(?![0-9A-Za-z_])/g;
  let referenceMatch: RegExpExecArray | null;
  const invalidReferences = new Set<string>();
  while ((referenceMatch = referencePattern.exec(source)) !== null) {
    const letters = referenceMatch[1];
    const digits = referenceMatch[2];
    const columnIndex = columnLettersToIndex(letters);
    const rowNumber = Number(digits);
    if (columnIndex > MAX_COLUMN_INDEX || rowNumber < 1 || rowNumber > MAX_ROW_INDEX) {
      invalidReferences.add(`${letters}${digits}`);
    }
  }
  for (const token of invalidReferences) {
    findings.push({
      kind: 'invalid-reference',
      severity: 'error',
      code: '#REF!',
      title: 'Bezug ausserhalb des Rasters',
      message: `Der Bezug ${token} liegt ausserhalb des gueltigen Rasterbereichs.`,
      hint: 'Verwenden Sie Bezuege zwischen A1 und XFD1048576.',
      token,
      ...(coord ? { coord } : {}),
    });
  }

  const acceptedIdentifiers = new Set<string>(
    (options.namedIdentifiers ?? []).map(normalizeFormulaFunctionName),
  );
  for (const identifier of options.extraFunctions ?? []) {
    acceptedIdentifiers.add(normalizeFormulaFunctionName(identifier));
  }

  for (const site of scanFormulaCallSites(trimmed)) {    const name = normalizeFormulaFunctionName(site.name);
    if (acceptedIdentifiers.has(name)) continue;
    if (!isKnownFormulaFunction(name)) {
      findings.push({
        kind: 'unknown-function',
        severity: 'error',
        code: '#NAME?',
        title: 'Unbekannte Funktion',
        message: `Die Funktion ${name} ist dem Formelkatalog nicht bekannt.`,
        hint: 'Suchen Sie die Funktion im Funktionsassistenten oder pruefen Sie die Schreibweise.',
        token: name,
        ...(coord ? { coord } : {}),
      });
      continue;
    }
    const violation = validateFormulaFunctionArity(name, site.argCount);
    if (violation) {
      findings.push({
        kind: 'argument-count',
        severity: 'error',
        code: violation.code,
        title: 'Falsche Argumentanzahl',
        message: violation.message,
        hint: `Erwartete Signatur: ${violation.expected}`,
        token: name,
        ...(coord ? { coord } : {}),
      });
    }
  }

  if (coord && options.cells) {
    const normalized = coord.trim().toUpperCase().replace(/\$/g, '');
    const referenced = new Set(extractReferencesFromFormula(trimmed));
    if (referenced.has(normalized)) {
      findings.push({
        kind: 'circular-reference',
        severity: 'error',
        code: '#CIRCULAR!',
        title: 'Zirkulaerer Bezug',
        message: `${normalized} verweist direkt auf sich selbst.`,
        hint: 'Entfernen Sie den Selbstbezug oder nutzen Sie eine Hilfszelle.',
        token: normalized,
        coord: normalized,
      });
    }
  }

  return findings;
}

export interface GridFormulaReferenceArrow {
  readonly from: string;
  readonly to: string;
  readonly kind: 'precedent' | 'dependent';
}

export interface GridFormulaReferenceArrows {
  readonly coord: string;
  readonly arrows: readonly GridFormulaReferenceArrow[];
  readonly truncated: boolean;
}

/**
 * Builds the reference arrows the raster overlays. Precedents come from this cell's
 * formula, dependents from the reverse index. The result is bounded by the canonical
 * node budget so a huge workbook cannot stall the UI thread.
 */
export function buildGridFormulaReferenceArrows(
  coord: string,
  cells: Record<string, GridCell>,
  limits: GridFormulaLimits = GRID_FORMULA_LIMITS,
): GridFormulaReferenceArrows {
  const normalized = coord.trim().toUpperCase().replace(/\$/g, '');
  const arrows: GridFormulaReferenceArrow[] = [];
  let truncated = false;

  const push = (from: string, to: string, kind: GridFormulaReferenceArrow['kind']): boolean => {
    if (arrows.length >= limits.maxDependencyNodes) {
      truncated = true;
      return false;
    }
    arrows.push({ from, to, kind });
    return true;
  };

  const cell = cells[normalized];
  if (cell?.formula) {
    for (const precedent of extractReferencesFromFormula(cell.formula)) {
      if (!push(precedent, normalized, 'precedent')) break;
    }
  }

  if (!truncated) {
    for (const [rawCoord, candidate] of Object.entries(cells)) {
      if (!candidate.formula) continue;
      const dependent = rawCoord.toUpperCase().replace(/\$/g, '');
      if (dependent === normalized) continue;
      if (!extractReferencesFromFormula(candidate.formula).includes(normalized)) continue;
      if (!push(normalized, dependent, 'dependent')) break;
    }
  }

  return { coord: normalized, arrows, truncated };
}

/** Screen-reader text for a diagnostic list; empty string when there is nothing to say. */
export function summarizeFormulaDiagnostics(
  diagnostics: readonly GridFormulaDiagnostic[],
): string {
  if (diagnostics.length === 0) return '';
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const primary = errors[0] ?? diagnostics[0];
  const parts = [primary.title, primary.message];
  if (primary.coord) parts.unshift(`Zelle ${primary.coord}:`);
  if (primary.hint) parts.push(`Hinweis: ${primary.hint}`);
  if (diagnostics.length > 1) parts.push(`${diagnostics.length - 1} weitere Hinweise.`);
  return parts.join(' ');
}

/** Catalogue entry for a function name, re-exported for assistant call sites. */
export function formulaFunctionDocumentation(name: string): GridFormulaFunctionEntry | null {
  return getFormulaFunctionEntry(name);
}
