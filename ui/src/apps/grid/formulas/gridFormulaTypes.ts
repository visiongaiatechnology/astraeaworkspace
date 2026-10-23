// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative formula type definitions
// Full Excel/Calc parity supporting dynamic arrays, 2D matrices, and standard error types

export type FormulaError =
  | '#NULL!'
  | '#DIV/0!'
  | '#VALUE!'
  | '#REF!'
  | '#NAME?'
  | '#NUM!'
  | '#N/A'
  | '#N/A!'
  | '#SPILL!'
  | '#CALC!'
  | '#CIRCULAR!';

export type SingleFormulaValue = string | number | boolean | null;
export type FormulaArray = SingleFormulaValue[][];
export type FormulaValue = SingleFormulaValue | FormulaArray;

export interface RangeBounds {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
}

export const FORMULA_ERRORS: ReadonlySet<string> = new Set([
  '#NULL!',
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#NUM!',
  '#N/A',
  '#N/A!',
  '#SPILL!',
  '#CALC!',
  '#CIRCULAR!',
]);

export function isFormulaError(val: unknown): val is FormulaError {
  return typeof val === 'string' && FORMULA_ERRORS.has(val);
}

export function isFormulaArray(val: unknown): val is FormulaArray {
  return Array.isArray(val) && (val.length === 0 || Array.isArray(val[0]));
}

/**
 * **Die eine Regel fuer den flachen Vektor.** Runde 243, nach
 * `DECISION_FLAT_VECTOR_IN_SCALAR_POSITION.md`.
 *
 * Ein **flacher** Vektor ist ein Array, dessen erstes Element **kein** Array ist —
 * `[100, 200, 300]`. Er ist **kein** `FormulaValue`: `FormulaArray` ist
 * `SingleFormulaValue[][]`, also zweidimensional. Er entsteht zur **Laufzeit** aus
 * dynamischen Ergebnissen, nicht durch eine typisierte Zuweisung, und `as any` war
 * bis Runde 228 das einzige, was die Deklaration wahr machte.
 *
 * **Warum eine eigene Funktion und nicht `Array.isArray(val) && !isFormulaArray(val)`
 * an jeder Stelle.** Die Entscheidung nennt drei Stellen, an denen ein flacher Vektor
 * ankommt, und zwei davon beantworteten dieselbe Frage **verschieden**. Eine zweite
 * Regel fuer dieselbe Sache war der Befund, nicht die Loesung. Diese Funktion ist die
 * erste und einzige Regel; die drei Stellen rufen sie auf.
 */
export function isFlatVector(val: unknown): val is SingleFormulaValue[] {
  return Array.isArray(val) && !isFormulaArray(val);
}

/**
 * Die kanonische Antwort auf die Array-Frage. Runde 243.
 *
 * Stand bis Runde 242 in `gridFormulaArrayUtils.ts` und wurde dort **anders**
 * beantwortet als in `toFormulaArray`: hier `ein Element pro Zeile`, dort `[[vector]]`.
 * Die Entscheidung hat `normalizeToArray2D` als die **Referenz** benannt. Damit der
 * Widerspruch verschwindet, statt dass eine der beiden Antworten gewinnt, steht die
 * Regel jetzt **einmal** hier; `gridFormulaArrayUtils.ts` reicht sie durch.
 */
export function normalizeToArray2D(arg: FormulaValue): FormulaArray {
  if (isFormulaArray(arg)) return arg;
  if (isFlatVector(arg)) return arg.map((v) => [v]);
  return [[arg]];
}

/**
 * Ein flacher Vektor an einer **Skalarstelle** ist ein Fehler. Runde 243.
 *
 * Vorher gab diese Funktion den Vektor unveraendert zurueck — die Entscheidung nennt
 * das „Identitaet — ein Vektor kommt als Vektor heraus". Der Aufrufer behandelte ihn
 * als Skalar, also entstand ein **stiller falscher Wert**: der Benutzer sieht `100`
 * und weiss nicht, dass `100, 200, 300` da waren.
 *
 * `#VALUE!` ist ehrlich: es sagt, dass an dieser Stelle kein Skalar steht. `#REF!`
 * waere falsch, weil die Referenz gueltig ist; das erste Element waere die stille
 * Reduktion, die die Entscheidung ausdruecklich verbietet.
 */
export function toSingleValue(val: FormulaValue): SingleFormulaValue {
  if (isFormulaArray(val)) {
    if (val.length === 0 || val[0].length === 0) return null;
    return val[0][0];
  }
  if (isFlatVector(val)) return '#VALUE!';
  return val;
}

/**
 * Die Array-Form eines Wertes. Runde 243.
 *
 * Stand bis Runde 242 auf `[[val]]` fuer alles, was kein `FormulaArray` ist — auch fuer
 * einen **flachen Vektor**. Dann steckte der ganze Vektor in **einer** Zelle:
 * `toFormulaArray([100,200,300])` ergab `[[[100,200,300]]]`, waehrend das Geschwister
 * `normalizeToArray2D` fuer dieselbe Eingabe `[[100],[200],[300]]` ergab. Zwei
 * exportierte Funktionen, eine Frage, zwei Antworten.
 *
 * Die Entscheidung hat `normalizeToArray2D` als die **Referenz** benannt und
 * ausdruecklich gesagt, dass der Widerspruch verschwinden soll, **statt dass eine der
 * beiden Antworten gewinnt**. Beide Funktionen rufen deshalb jetzt dieselbe Regel auf.
 */
export function toFormulaArray(val: FormulaValue): FormulaArray {
  return normalizeToArray2D(val);
}

/**
 * Numeric codes returned by `ERROR.TYPE`. The classic Excel codes 1..7 are preserved;
 * the project's dynamic-array and cycle codes get explicit codes so `ERROR.TYPE` never
 * silently reports `#N/A` for an error this engine can produce.
 */
export const FORMULA_ERROR_TYPE_CODES: Readonly<Record<FormulaError, number>> = Object.freeze({
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
  return isFormulaError(value) ? FORMULA_ERROR_TYPE_CODES[value] : 0;
}

