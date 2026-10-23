// STATUS: DIAMANT VGT SUPREME
// Canonical function catalogue for the Grid formula surface.
//
// One catalogue serves three consumers that previously had none:
//   1. formula-bar autocomplete (`suggestFormulaFunctions`)
//   2. the function assistant / argument wizard (`getFormulaFunctionEntry`,
//      `formulaFunctionSignature`, `buildFormulaCall`)
//   3. pre-flight validation with typed spreadsheet errors
//      (`validateFormulaFunctionArity`)
//
// The names and arities are aligned with the authoritative Rust registry
// (`open-core/crates/vgt-formula/src/functions.rs`). A function that the native
// core does not implement must not be advertised as available.

import type { FormulaError } from './gridFormulaTypes';

export type GridFormulaFunctionCategory =
  | 'math'
  | 'statistics'
  | 'logical'
  | 'lookup'
  | 'date'
  | 'text'
  | 'array'
  | 'information'
  | 'financial';

export type GridFormulaArgumentKind =
  | 'number'
  | 'text'
  | 'logical'
  | 'criteria'
  | 'reference'
  | 'array'
  | 'date'
  | 'lambda'
  | 'any';

export interface GridFormulaFunctionParameter {
  readonly name: string;
  readonly kind: GridFormulaArgumentKind;
  readonly required: boolean;
  readonly description: string;
}

export interface GridFormulaFunctionEntry {
  readonly name: string;
  readonly category: GridFormulaFunctionCategory;
  readonly summary: string;
  readonly parameters: readonly GridFormulaFunctionParameter[];
  /** Required argument count. `SUM` needs at least one number argument. */
  readonly minArgs: number;
  /** Maximum argument count, or `null` for variadic tails. */
  readonly maxArgs: number | null;
  /** True when the result may be a 2-D dynamic array that spills. */
  readonly dynamicArrayResult: boolean;
  /** Only meaningful when `dynamicArrayResult` is true. */
  readonly spillOrigin: 'first-cell' | 'not-applicable';
}

function p(
  name: string,
  kind: GridFormulaArgumentKind,
  required: boolean,
  description: string,
): GridFormulaFunctionParameter {
  return { name, kind, required, description };
}

interface CatalogSeed {
  readonly name: string;
  readonly category: GridFormulaFunctionCategory;
  readonly summary: string;
  readonly parameters: readonly GridFormulaFunctionParameter[];
  readonly minArgs?: number;
  readonly maxArgs?: number | null;
  readonly dynamicArrayResult?: boolean;
}

function seed(
  name: string,
  category: GridFormulaFunctionCategory,
  summary: string,
  parameters: readonly GridFormulaFunctionParameter[],
  options: { minArgs?: number; maxArgs?: number | null; dynamicArrayResult?: boolean } = {},
): GridFormulaFunctionEntry {
  const required = parameters.filter((parameter) => parameter.required).length;
  return {
    name,
    category,
    summary,
    parameters,
    minArgs: options.minArgs ?? required,
    maxArgs: options.maxArgs === undefined ? parameters.length : options.maxArgs,
    dynamicArrayResult: options.dynamicArrayResult ?? false,
    spillOrigin: options.dynamicArrayResult ? 'first-cell' : 'not-applicable',
  };
}

const RANGE = (name: string, required: boolean, description: string) => p(name, 'reference', required, description);

const SEEDS: readonly CatalogSeed[] = [
  // --- Package 20: SUM / AVERAGE with autocomplete ---
  {
    name: 'SUM',
    category: 'math',
    summary: 'Addiert alle Zahlen der Argumente und Bereiche.',
    parameters: [p('number1', 'any', true, 'Erste Zahl oder erster Bereich.'), p('number2', 'any', false, 'Weitere Zahl oder weiterer Bereich.')],
    maxArgs: null,
  },
  {
    name: 'AVERAGE',
    category: 'statistics',
    summary: 'Bildet den arithmetischen Mittelwert der Zahlen.',
    parameters: [p('number1', 'any', true, 'Erste Zahl oder erster Bereich.'), p('number2', 'any', false, 'Weitere Zahl oder weiterer Bereich.')],
    maxArgs: null,
  },
  { name: 'MIN', category: 'statistics', summary: 'Kleinster numerischer Wert.', parameters: [p('number1', 'any', true, 'Zahl oder Bereich.'), p('number2', 'any', false, 'Weitere Zahl oder weiterer Bereich.')], maxArgs: null },
  { name: 'MAX', category: 'statistics', summary: 'Groesster numerischer Wert.', parameters: [p('number1', 'any', true, 'Zahl oder Bereich.'), p('number2', 'any', false, 'Weitere Zahl oder weiterer Bereich.')], maxArgs: null },
  { name: 'COUNT', category: 'statistics', summary: 'Zaehlt numerische Zellen.', parameters: [p('value1', 'any', true, 'Zahl oder Bereich.'), p('value2', 'any', false, 'Weiterer Wert oder Bereich.')], maxArgs: null },
  { name: 'COUNTA', category: 'statistics', summary: 'Zaehlt nicht leere Zellen.', parameters: [p('value1', 'any', true, 'Wert oder Bereich.'), p('value2', 'any', false, 'Weiterer Wert oder Bereich.')], maxArgs: null },
  {
    name: 'SUMIF',
    category: 'math',
    summary: 'Summiert Zellen, die ein Kriterium erfuellen.',
    parameters: [RANGE('range', true, 'Zu pruefender Bereich.'), p('criteria', 'criteria', true, 'Zahl, Text oder Vergleich wie ">10".'), RANGE('sum_range', false, 'Optionaler Bereich der Summanden.')],
  },
  {
    name: 'SUMIFS',
    category: 'math',
    summary: 'Summiert Zellen ueber mehrere Kriterien.',
    parameters: [RANGE('sum_range', true, 'Bereich der Summanden.'), RANGE('criteria_range1', true, 'Erster Kriterienbereich.'), p('criteria1', 'criteria', true, 'Erstes Kriterium.'), RANGE('criteria_range2', true, 'Weiteres Kriterienpaar.'), p('criteria2', 'criteria', true, 'Weiteres Kriterium.')],
    maxArgs: null,
  },
  { name: 'AVERAGEIF', category: 'statistics', summary: 'Mittelwert der Zellen, die ein Kriterium erfuellen.', parameters: [RANGE('range', true, 'Zu pruefender Bereich.'), p('criteria', 'criteria', true, 'Kriterium.'), RANGE('average_range', false, 'Optionaler Auswertungsbereich.')] },
  { name: 'AVERAGEIFS', category: 'statistics', summary: 'Mittelwert ueber mehrere Kriterien.', parameters: [RANGE('average_range', true, 'Auswertungsbereich.'), RANGE('criteria_range1', true, 'Erster Kriterienbereich.'), p('criteria1', 'criteria', true, 'Erstes Kriterium.'), RANGE('criteria_range2', true, 'Weiteres Kriterienpaar.'), p('criteria2', 'criteria', true, 'Weiteres Kriterium.')], maxArgs: null },
  {
    name: 'SUBTOTAL',
    category: 'math',
    summary: 'Aggregiert einen Bereich und ignoriert optional verschachtelte Teilergebnisse.',
    parameters: [p('function_num', 'number', true, '1..11 oder 101..111.'), RANGE('ref1', true, 'Erster Bereich.'), RANGE('ref2', false, 'Weiterer Bereich.')],
    maxArgs: null,
  },
  {
    name: 'AGGREGATE',
    category: 'math',
    summary: 'Aggregiert mit Fehler- und Ausblendoptionen.',
    parameters: [p('function_num', 'number', true, 'Aggregat 1..19.'), p('options', 'number', true, 'Option 0..7.'), RANGE('ref1', true, 'Erster Bereich.'), p('ref2', 'any', false, 'Weiterer Bereich oder k-Parameter.')],
    maxArgs: null,
  },
  { name: 'ROUND', category: 'math', summary: 'Rundet auf die angegebene Stellenzahl.', parameters: [p('number', 'number', true, 'Zahl.'), p('num_digits', 'number', true, 'Stellen.')] },
  { name: 'ROUNDUP', category: 'math', summary: 'Rundet von Null weg auf.', parameters: [p('number', 'number', true, 'Zahl.'), p('num_digits', 'number', true, 'Stellen.')] },
  { name: 'ROUNDDOWN', category: 'math', summary: 'Rundet gegen Null ab.', parameters: [p('number', 'number', true, 'Zahl.'), p('num_digits', 'number', true, 'Stellen.')] },
  { name: 'ABS', category: 'math', summary: 'Betrag einer Zahl.', parameters: [p('number', 'number', true, 'Zahl.')] },
  { name: 'MOD', category: 'math', summary: 'Rest einer Division.', parameters: [p('number', 'number', true, 'Dividend.'), p('divisor', 'number', true, 'Divisor ungleich 0.')] },
  { name: 'POWER', category: 'math', summary: 'Potenz.', parameters: [p('number', 'number', true, 'Basis.'), p('power', 'number', true, 'Exponent.')] },
  { name: 'SQRT', category: 'math', summary: 'Quadratwurzel.', parameters: [p('number', 'number', true, 'Nicht negative Zahl.')] },

  // --- Package 21: IF and nested functions ---
  {
    name: 'IF',
    category: 'logical',
    summary: 'Verzweigt abhaengig von einer Bedingung.',
    parameters: [p('logical_test', 'logical', true, 'Bedingung, die wahr oder falsch ergibt.'), p('value_if_true', 'any', true, 'Ergebnis bei wahr.'), p('value_if_false', 'any', false, 'Ergebnis bei falsch, sonst FALSCH.')],
  },
  {
    name: 'IFS',
    category: 'logical',
    summary: 'Prueft Bedingungen der Reihe nach und liefert zum ersten wahren Wert das Ergebnis.',
    parameters: [p('logical_test1', 'logical', true, 'Erste Bedingung.'), p('value_if_true1', 'any', true, 'Ergebnis der ersten Bedingung.'), p('logical_test2', 'logical', false, 'Weitere Bedingung.'), p('value_if_true2', 'any', false, 'Weiteres Ergebnis.')],
    maxArgs: null,
  },
  {
    name: 'SWITCH',
    category: 'logical',
    summary: 'Vergleicht einen Ausdruck mit Werteliste und liefert das passende Ergebnis.',
    parameters: [p('expression', 'any', true, 'Vergleichsausdruck.'), p('value1', 'any', true, 'Erster Vergleichswert.'), p('result1', 'any', true, 'Ergebnis zum ersten Wert.'), p('default', 'any', false, 'Rueckfallwert.')],
    maxArgs: null,
  },
  { name: 'IFERROR', category: 'logical', summary: 'Ersetzt jeden Fehlerwert durch einen Ersatzwert.', parameters: [p('value', 'any', true, 'Ausdruck.'), p('value_if_error', 'any', true, 'Ersatzwert.')] },
  { name: 'IFNA', category: 'logical', summary: 'Ersetzt nur #N/A durch einen Ersatzwert.', parameters: [p('value', 'any', true, 'Ausdruck.'), p('value_if_na', 'any', true, 'Ersatzwert fuer #N/A.')] },
  { name: 'AND', category: 'logical', summary: 'Wahr, wenn alle Bedingungen wahr sind.', parameters: [p('logical1', 'logical', true, 'Erste Bedingung.'), p('logical2', 'logical', false, 'Weitere Bedingung.')], maxArgs: null },
  { name: 'OR', category: 'logical', summary: 'Wahr, wenn mindestens eine Bedingung wahr ist.', parameters: [p('logical1', 'logical', true, 'Erste Bedingung.'), p('logical2', 'logical', false, 'Weitere Bedingung.')], maxArgs: null },
  { name: 'XOR', category: 'logical', summary: 'Wahr bei ungerader Anzahl wahrer Bedingungen.', parameters: [p('logical1', 'logical', true, 'Erste Bedingung.'), p('logical2', 'logical', false, 'Weitere Bedingung.')], maxArgs: null },
  { name: 'NOT', category: 'logical', summary: 'Kehrt einen Wahrheitswert um.', parameters: [p('logical', 'logical', true, 'Bedingung.')] },

  // --- Package 22: XLOOKUP and INDEX/MATCH ---
  {
    name: 'XLOOKUP',
    category: 'lookup',
    summary: 'Sucht einen Wert in einem Suchvektor und liefert den Treffer aus dem Ergebnisvektor.',
    parameters: [
      p('lookup_value', 'any', true, 'Suchwert.'),
      p('lookup_array', 'array', true, 'Suchvektor.'),
      p('return_array', 'array', true, 'Ergebnisvektor oder -matrix.'),
      p('if_not_found', 'any', false, 'Rueckfallwert, Standard #N/A.'),
      p('match_mode', 'number', false, '0 exakt, -1 naechstkleiner, 1 naechstgroesser, 2 Platzhalter.'),
      p('search_mode', 'number', false, '1 vorwaerts, -1 rueckwaerts.'),
    ],
    dynamicArrayResult: true,
  },
  {
    name: 'XMATCH',
    category: 'lookup',
    summary: 'Liefert die relative Position eines Suchwerts.',
    parameters: [p('lookup_value', 'any', true, 'Suchwert.'), p('lookup_array', 'array', true, 'Suchvektor.'), p('match_mode', 'number', false, '0, -1, 1 oder 2.'), p('search_mode', 'number', false, '1 oder -1.')],
  },
  {
    name: 'INDEX',
    category: 'lookup',
    summary: 'Liefert den Wert an Zeilen- und Spaltenposition einer Matrix.',
    parameters: [p('array', 'array', true, 'Matrix oder Vektor.'), p('row_num', 'number', true, 'Zeilennummer, 0 fuer ganze Spalte.'), p('column_num', 'number', false, 'Spaltennummer, 0 fuer ganze Zeile.')],
    dynamicArrayResult: true,
  },
  {
    name: 'MATCH',
    category: 'lookup',
    summary: 'Position eines Suchwerts in einem Vektor.',
    parameters: [p('lookup_value', 'any', true, 'Suchwert.'), p('lookup_array', 'array', true, 'Suchvektor.'), p('match_type', 'number', false, '0 exakt, 1 kleiner-gleich, -1 groesser-gleich.')],
  },
  {
    name: 'VLOOKUP',
    category: 'lookup',
    summary: 'Sucht in der ersten Spalte und liefert einen Wert rechts davon.',
    parameters: [p('lookup_value', 'any', true, 'Suchwert.'), p('table_array', 'array', true, 'Tabelle.'), p('col_index_num', 'number', true, 'Spaltenindex ab 1.'), p('range_lookup', 'logical', false, 'FALSCH fuer exakte Suche.')],
  },
  {
    name: 'HLOOKUP',
    category: 'lookup',
    summary: 'Sucht in der ersten Zeile und liefert einen Wert darunter.',
    parameters: [p('lookup_value', 'any', true, 'Suchwert.'), p('table_array', 'array', true, 'Tabelle.'), p('row_index_num', 'number', true, 'Zeilenindex ab 1.'), p('range_lookup', 'logical', false, 'FALSCH fuer exakte Suche.')],
  },
  {
    name: 'CHOOSE',
    category: 'lookup',
    summary: 'Waehlt einen Wert anhand eines Index.',
    parameters: [p('index_num', 'number', true, 'Index ab 1.'), p('value1', 'any', true, 'Erster Wert.'), p('value2', 'any', false, 'Weiterer Wert.')],
    maxArgs: null,
  },

  // --- Package 25: dynamic array functions ---
  {
    name: 'UNIQUE',
    category: 'array',
    summary: 'Liefert die eindeutigen Werte eines Bereichs.',
    parameters: [p('array', 'array', true, 'Quellbereich.'), p('by_col', 'logical', false, 'WAHR vergleicht Spalten.'), p('exactly_once', 'logical', false, 'WAHR liefert nur einmal vorkommende Werte.')],
    dynamicArrayResult: true,
  },
  {
    name: 'SORT',
    category: 'array',
    summary: 'Sortiert einen Bereich.',
    parameters: [p('array', 'array', true, 'Quellbereich.'), p('sort_index', 'number', false, 'Sortierschluessel ab 1.'), p('sort_order', 'number', false, '1 aufsteigend, -1 absteigend.'), p('by_col', 'logical', false, 'WAHR sortiert Spalten.')],
    dynamicArrayResult: true,
  },
  {
    name: 'SORTBY',
    category: 'array',
    summary: 'Sortiert einen Bereich nach einem zweiten Vektor.',
    parameters: [p('array', 'array', true, 'Quellbereich.'), p('by_array', 'array', true, 'Sortierschluessel.'), p('sort_order', 'number', false, '1 oder -1.')],
    dynamicArrayResult: true,
  },
  {
    name: 'FILTER',
    category: 'array',
    summary: 'Filtert einen Bereich nach einer Wahrheitsmaske.',
    parameters: [p('array', 'array', true, 'Quellbereich.'), p('include', 'array', true, 'Wahrheitsmaske.'), p('if_empty', 'any', false, 'Ergebnis ohne Treffer, Standard #CALC!.')],
    dynamicArrayResult: true,
  },
  {
    name: 'SEQUENCE',
    category: 'array',
    summary: 'Erzeugt eine Zahlenfolge als Matrix.',
    parameters: [p('rows', 'number', false, 'Zeilenzahl.'), p('columns', 'number', false, 'Spaltenzahl.'), p('start', 'number', false, 'Startwert.'), p('step', 'number', false, 'Schrittweite.')],
    dynamicArrayResult: true,
  },
  { name: 'TAKE', category: 'array', summary: 'Entnimmt die ersten oder letzten Zeilen/Spalten.', parameters: [p('array', 'array', true, 'Quellbereich.'), p('rows', 'number', true, 'Zeilenzahl, negativ von hinten.'), p('columns', 'number', false, 'Spaltenzahl.')], dynamicArrayResult: true },
  { name: 'DROP', category: 'array', summary: 'Verwirft die ersten oder letzten Zeilen/Spalten.', parameters: [p('array', 'array', true, 'Quellbereich.'), p('rows', 'number', true, 'Zu verwerfende Zeilen.'), p('columns', 'number', false, 'Zu verwerfende Spalten.')], dynamicArrayResult: true },
  { name: 'CHOOSECOLS', category: 'array', summary: 'Waehlt Spalten aus einer Matrix.', parameters: [p('array', 'array', true, 'Quellbereich.'), p('col_num1', 'number', true, 'Spaltenindex.'), p('col_num2', 'number', false, 'Weiterer Spaltenindex.')], maxArgs: null, dynamicArrayResult: true },
  { name: 'CHOOSEROWS', category: 'array', summary: 'Waehlt Zeilen aus einer Matrix.', parameters: [p('array', 'array', true, 'Quellbereich.'), p('row_num1', 'number', true, 'Zeilenindex.'), p('row_num2', 'number', false, 'Weiterer Zeilenindex.')], maxArgs: null, dynamicArrayResult: true },
  { name: 'TRANSPOSE', category: 'array', summary: 'Vertauscht Zeilen und Spalten.', parameters: [p('array', 'array', true, 'Quellbereich.')], dynamicArrayResult: true },
  { name: 'VSTACK', category: 'array', summary: 'Stapelt Bereiche vertikal.', parameters: [p('array1', 'array', true, 'Erster Bereich.'), p('array2', 'array', true, 'Weiterer Bereich.')], maxArgs: null, dynamicArrayResult: true },
  { name: 'HSTACK', category: 'array', summary: 'Stapelt Bereiche horizontal.', parameters: [p('array1', 'array', true, 'Erster Bereich.'), p('array2', 'array', true, 'Weiterer Bereich.')], maxArgs: null, dynamicArrayResult: true },
  { name: 'TOCOL', category: 'array', summary: 'Schreibt eine Matrix in eine Spalte.', parameters: [p('array', 'array', true, 'Quellbereich.')], dynamicArrayResult: true },
  { name: 'TOROW', category: 'array', summary: 'Schreibt eine Matrix in eine Zeile.', parameters: [p('array', 'array', true, 'Quellbereich.')], dynamicArrayResult: true },

  // --- Package 26: LET / LAMBDA / higher-order functions ---
  {
    name: 'LET',
    category: 'logical',
    summary: 'Bindet benannte Zwischenwerte und wertet dann den Ausdruck aus.',
    parameters: [p('name1', 'text', true, 'Erster Name.'), p('value1', 'any', true, 'Erster Wert.'), p('calculation', 'any', true, 'Auswertung; weitere Name/Wert-Paare sind optional.')],
    maxArgs: null,
  },
  {
    name: 'LAMBDA',
    category: 'logical',
    summary: 'Definiert eine anonyme Funktion mit Parametern und Ausdruck.',
    parameters: [p('parameter1', 'text', true, 'Erster Parameter.'), p('calculation', 'any', true, 'Funktionskoerper; weitere Parameter sind optional.')],
    maxArgs: null,
  },
  { name: 'MAP', category: 'array', summary: 'Wendet eine LAMBDA auf jedes Element an.', parameters: [p('array1', 'array', true, 'Quellbereich.'), p('array2', 'array', false, 'Weiterer gleich grosser Bereich.'), p('lambda', 'lambda', true, 'LAMBDA mit einem Parameter je Bereich.')], maxArgs: null, dynamicArrayResult: true },
  { name: 'REDUCE', category: 'array', summary: 'Faltet einen Bereich auf einen Akkumulator.', parameters: [p('initial_value', 'any', true, 'Startwert.'), p('array', 'array', true, 'Quellbereich.'), p('lambda', 'lambda', true, 'LAMBDA(acc, wert).')] },
  { name: 'SCAN', category: 'array', summary: 'Liefert alle Zwischenwerte einer Faltung.', parameters: [p('initial_value', 'any', true, 'Startwert.'), p('array', 'array', true, 'Quellbereich.'), p('lambda', 'lambda', true, 'LAMBDA(acc, wert).')], dynamicArrayResult: true },
  { name: 'BYROW', category: 'array', summary: 'Wendet eine LAMBDA je Zeile an.', parameters: [p('array', 'array', true, 'Quellbereich.'), p('lambda', 'lambda', true, 'LAMBDA(zeile).')], dynamicArrayResult: true },
  { name: 'BYCOL', category: 'array', summary: 'Wendet eine LAMBDA je Spalte an.', parameters: [p('array', 'array', true, 'Quellbereich.'), p('lambda', 'lambda', true, 'LAMBDA(spalte).')], dynamicArrayResult: true },

  // --- Package 24: date and timezone rules ---
  { name: 'DATE', category: 'date', summary: 'Setzt ein Datum aus Jahr, Monat und Tag zusammen.', parameters: [p('year', 'number', true, 'Jahr 1900..9999, kleinere Werte werden um 1900 versetzt.'), p('month', 'number', true, 'Monat, ueber 12 laeuft ins Folgejahr.'), p('day', 'number', true, 'Tag, ueber Monatsende laeuft weiter.')] },
  { name: 'TIME', category: 'date', summary: 'Setzt eine Uhrzeit aus Stunden, Minuten und Sekunden zusammen.', parameters: [p('hour', 'number', true, 'Stunden.'), p('minute', 'number', true, 'Minuten.'), p('second', 'number', true, 'Sekunden.')] },
  { name: 'TODAY', category: 'date', summary: 'Aktuelles Datum in der konfigurierten Zeitzonenregel.', parameters: [] },
  { name: 'NOW', category: 'date', summary: 'Aktueller Zeitpunkt in der konfigurierten Zeitzonenregel.', parameters: [] },
  { name: 'YEAR', category: 'date', summary: 'Jahr eines Datums.', parameters: [p('serial_number', 'date', true, 'Datum oder Seriennummer.')] },
  { name: 'MONTH', category: 'date', summary: 'Monat eines Datums.', parameters: [p('serial_number', 'date', true, 'Datum oder Seriennummer.')] },
  { name: 'DAY', category: 'date', summary: 'Tag eines Datums.', parameters: [p('serial_number', 'date', true, 'Datum oder Seriennummer.')] },
  { name: 'HOUR', category: 'date', summary: 'Stunde einer Uhrzeit.', parameters: [p('serial_number', 'date', true, 'Uhrzeit oder Seriennummer.')] },
  { name: 'MINUTE', category: 'date', summary: 'Minute einer Uhrzeit.', parameters: [p('serial_number', 'date', true, 'Uhrzeit oder Seriennummer.')] },
  { name: 'SECOND', category: 'date', summary: 'Sekunde einer Uhrzeit.', parameters: [p('serial_number', 'date', true, 'Uhrzeit oder Seriennummer.')] },
  {
    name: 'WEEKDAY',
    category: 'date',
    summary: 'Wochentagsnummer eines Datums.',
    parameters: [p('serial_number', 'date', true, 'Datum oder Seriennummer.'), p('return_type', 'number', false, '1, 2, 3, 11..17.')],
  },
  { name: 'WEEKNUM', category: 'date', summary: 'Kalenderwoche eines Datums.', parameters: [p('serial_number', 'date', true, 'Datum oder Seriennummer.'), p('return_type', 'number', false, '1 oder 2.')] },
  { name: 'DAYS', category: 'date', summary: 'Anzahl Tage zwischen zwei Datumswerten.', parameters: [p('end_date', 'date', true, 'Enddatum.'), p('start_date', 'date', true, 'Startdatum.')] },
  { name: 'EDATE', category: 'date', summary: 'Verschiebt ein Datum um ganze Monate.', parameters: [p('start_date', 'date', true, 'Startdatum.'), p('months', 'number', true, 'Monate, auch negativ.')] },
  { name: 'EOMONTH', category: 'date', summary: 'Letzter Tag eines Monats mit Versatz.', parameters: [p('start_date', 'date', true, 'Startdatum.'), p('months', 'number', true, 'Monatsversatz, auch negativ.')] },
  { name: 'DATEDIF', category: 'date', summary: 'Differenz zweier Datumswerte in der angegebenen Einheit.', parameters: [p('start_date', 'date', true, 'Startdatum.'), p('end_date', 'date', true, 'Enddatum.'), p('unit', 'text', true, 'Y, M, D, MD, YM oder YD.')] },
  {
    name: 'WORKDAY',
    category: 'date',
    summary: 'Verschiebt ein Datum um Arbeitstage und beruecksichtigt Feiertage.',
    parameters: [p('start_date', 'date', true, 'Startdatum.'), p('days', 'number', true, 'Arbeitstage, auch negativ.'), p('holidays', 'array', false, 'Feiertage.')],
  },
  {
    name: 'NETWORKDAYS',
    category: 'date',
    summary: 'Zaehlt Arbeitstage zwischen zwei Datumswerten ohne Feiertage.',
    parameters: [p('start_date', 'date', true, 'Startdatum.'), p('end_date', 'date', true, 'Enddatum.'), p('holidays', 'array', false, 'Feiertage.')],
  },

  // --- text ---
  { name: 'TEXT', category: 'text', summary: 'Formatiert eine Zahl mit einem Formatcode.', parameters: [p('value', 'any', true, 'Wert.'), p('format_text', 'text', true, 'Formatcode.')] },
  { name: 'CONCAT', category: 'text', summary: 'Verbindet Werte zu Text.', parameters: [p('text1', 'any', true, 'Erster Wert.'), p('text2', 'any', false, 'Weiterer Wert.')], maxArgs: null },
  { name: 'CONCATENATE', category: 'text', summary: 'Verbindet Werte zu Text.', parameters: [p('text1', 'any', true, 'Erster Wert.'), p('text2', 'any', false, 'Weiterer Wert.')], maxArgs: null },
  { name: 'TEXTJOIN', category: 'text', summary: 'Verbindet Werte mit Trennzeichen.', parameters: [p('delimiter', 'text', true, 'Trennzeichen.'), p('ignore_empty', 'logical', true, 'Leere Werte ueberspringen.'), p('text1', 'any', true, 'Erster Wert.'), p('text2', 'any', false, 'Weiterer Wert.')], maxArgs: null },
  { name: 'LEN', category: 'text', summary: 'Laenge eines Textes.', parameters: [p('text', 'text', true, 'Text.')] },
  { name: 'LEFT', category: 'text', summary: 'Linke Zeichen eines Textes.', parameters: [p('text', 'text', true, 'Text.'), p('num_chars', 'number', false, 'Anzahl Zeichen.')] },
  { name: 'RIGHT', category: 'text', summary: 'Rechte Zeichen eines Textes.', parameters: [p('text', 'text', true, 'Text.'), p('num_chars', 'number', false, 'Anzahl Zeichen.')] },
  { name: 'MID', category: 'text', summary: 'Teilzeichenkette ab Position.', parameters: [p('text', 'text', true, 'Text.'), p('start_num', 'number', true, 'Startposition ab 1.'), p('num_chars', 'number', true, 'Anzahl Zeichen.')] },
  { name: 'TRIM', category: 'text', summary: 'Entfernt ueberzaehlige Leerzeichen.', parameters: [p('text', 'text', true, 'Text.')] },
  { name: 'UPPER', category: 'text', summary: 'Wandelt in Grossbuchstaben.', parameters: [p('text', 'text', true, 'Text.')] },
  { name: 'LOWER', category: 'text', summary: 'Wandelt in Kleinbuchstaben.', parameters: [p('text', 'text', true, 'Text.')] },
  { name: 'PROPER', category: 'text', summary: 'Schreibt Woerter gross an.', parameters: [p('text', 'text', true, 'Text.')] },
  { name: 'SUBSTITUTE', category: 'text', summary: 'Ersetzt Textteile.', parameters: [p('text', 'text', true, 'Text.'), p('old_text', 'text', true, 'Suchtext.'), p('new_text', 'text', true, 'Ersatztext.'), p('instance_num', 'number', false, 'Nur das n-te Vorkommen.')] },
  { name: 'REPLACE', category: 'text', summary: 'Ersetzt Zeichen an einer Position.', parameters: [p('old_text', 'text', true, 'Text.'), p('start_num', 'number', true, 'Startposition.'), p('num_chars', 'number', true, 'Anzahl Zeichen.'), p('new_text', 'text', true, 'Ersatztext.')] },
  { name: 'FIND', category: 'text', summary: 'Position eines Textes, Gross-/Kleinschreibung beachtet.', parameters: [p('find_text', 'text', true, 'Suchtext.'), p('within_text', 'text', true, 'Text.'), p('start_num', 'number', false, 'Startposition.')] },
  { name: 'SEARCH', category: 'text', summary: 'Position eines Textes, Platzhalter erlaubt.', parameters: [p('find_text', 'text', true, 'Suchtext.'), p('within_text', 'text', true, 'Text.'), p('start_num', 'number', false, 'Startposition.')] },
  { name: 'REPT', category: 'text', summary: 'Wiederholt Text.', parameters: [p('text', 'text', true, 'Text.'), p('number_times', 'number', true, 'Wiederholungen.')] },

  // --- information ---
  { name: 'ISBLANK', category: 'information', summary: 'Wahr bei leerer Zelle.', parameters: [p('value', 'any', true, 'Wert.')] },
  { name: 'ISNUMBER', category: 'information', summary: 'Wahr bei Zahl.', parameters: [p('value', 'any', true, 'Wert.')] },
  { name: 'ISTEXT', category: 'information', summary: 'Wahr bei Text.', parameters: [p('value', 'any', true, 'Wert.')] },
  { name: 'ISERROR', category: 'information', summary: 'Wahr bei jedem Fehlerwert.', parameters: [p('value', 'any', true, 'Wert.')] },
  { name: 'ISERR', category: 'information', summary: 'Wahr bei jedem Fehler ausser #N/A.', parameters: [p('value', 'any', true, 'Wert.')] },
  { name: 'ISNA', category: 'information', summary: 'Wahr bei #N/A.', parameters: [p('value', 'any', true, 'Wert.')] },
  { name: 'ISLOGICAL', category: 'information', summary: 'Wahr bei Wahrheitswert.', parameters: [p('value', 'any', true, 'Wert.')] },
  { name: 'TYPE', category: 'information', summary: 'Typcode eines Werts.', parameters: [p('value', 'any', true, 'Wert.')] },
  { name: 'ERROR.TYPE', category: 'information', summary: 'Numerischer Code eines Fehlerwerts.', parameters: [p('error_val', 'any', true, 'Fehlerwert.')] },
  { name: 'NA', category: 'information', summary: 'Liefert #N/A.', parameters: [] },

  // --- reference ---
  { name: 'INDIRECT', category: 'lookup', summary: 'Wandelt Text in einen Zellbezug um.', parameters: [p('ref_text', 'text', true, 'Bezugstext wie "A1" oder "Sheet2!B2".'), p('a1', 'logical', false, 'Nur A1-Notation wird unterstuetzt.')] },
  { name: 'OFFSET', category: 'lookup', summary: 'Verschiebt einen Bezug.', parameters: [p('reference', 'reference', true, 'Basizbezug.'), p('rows', 'number', true, 'Zeilenversatz.'), p('cols', 'number', true, 'Spaltenversatz.'), p('height', 'number', false, 'Hoehe.'), p('width', 'number', false, 'Breite.')], dynamicArrayResult: true },
  { name: 'ROW', category: 'lookup', summary: 'Zeilennummer eines Bezugs.', parameters: [p('reference', 'reference', false, 'Bezug.')] },
  { name: 'COLUMN', category: 'lookup', summary: 'Spaltennummer eines Bezugs.', parameters: [p('reference', 'reference', false, 'Bezug.')] },
  { name: 'ROWS', category: 'lookup', summary: 'Zeilenzahl eines Bereichs.', parameters: [p('array', 'array', true, 'Bereich.')] },
  { name: 'COLUMNS', category: 'lookup', summary: 'Spaltenzahl eines Bereichs.', parameters: [p('array', 'array', true, 'Bereich.')] },

  // --- financial ---
  { name: 'PV', category: 'financial', summary: 'Barwert einer Zahlungsreihe.', parameters: [p('rate', 'number', true, 'Zinssatz je Periode.'), p('nper', 'number', true, 'Periodenzahl.'), p('pmt', 'number', true, 'Zahlung je Periode.'), p('fv', 'number', false, 'Endwert.'), p('type', 'number', false, '0 nachschuessig, 1 vorschuessig.')] },
  { name: 'FV', category: 'financial', summary: 'Endwert einer Zahlungsreihe.', parameters: [p('rate', 'number', true, 'Zinssatz je Periode.'), p('nper', 'number', true, 'Periodenzahl.'), p('pmt', 'number', true, 'Zahlung je Periode.'), p('pv', 'number', false, 'Barwert.'), p('type', 'number', false, '0 oder 1.')] },
  { name: 'PMT', category: 'financial', summary: 'Konstante Zahlung eines Annuitae tendarlehens.', parameters: [p('rate', 'number', true, 'Zinssatz je Periode.'), p('nper', 'number', true, 'Periodenzahl.'), p('pv', 'number', true, 'Barwert.'), p('fv', 'number', false, 'Endwert.'), p('type', 'number', false, '0 oder 1.')] },
  { name: 'NPV', category: 'financial', summary: 'Kapitalwert einer Zahlungsreihe.', parameters: [p('rate', 'number', true, 'Zinssatz.'), p('value1', 'number', true, 'Erste Zahlung.'), p('value2', 'number', false, 'Weitere Zahlung.')], maxArgs: null },
  { name: 'IRR', category: 'financial', summary: 'Interner Zinsfuss einer Zahlungsreihe.', parameters: [p('values', 'array', true, 'Zahlungsreihe.'), p('guess', 'number', false, 'Startschaetzung.')] },
];

/**
 * Long tail of functions the engine already implements but which had no catalogue
 * entry, so the autocomplete and the assistant were blind to them. Metadata here is
 * deliberately conservative: only the arity is contractual, the parameter names are
 * positional because upstream documentation does not name them uniformly.
 */
interface BriefSeed {
  readonly name: string;
  readonly category: GridFormulaFunctionCategory;
  readonly summary: string;
  readonly minArgs: number;
  readonly maxArgs: number | null;
  readonly dynamicArrayResult?: boolean;
}

const BRIEF_SEEDS: readonly BriefSeed[] = [
  { name: 'ACOS', category: 'math', summary: 'Arkuskosinus.', minArgs: 1, maxArgs: 1 },
  { name: 'ASIN', category: 'math', summary: 'Arkussinus.', minArgs: 1, maxArgs: 1 },
  { name: 'ATAN', category: 'math', summary: 'Arkustangens.', minArgs: 1, maxArgs: 1 },
  { name: 'CEILING', category: 'math', summary: 'Rundet auf ein Vielfaches auf.', minArgs: 1, maxArgs: 2 },
  { name: 'COMBIN', category: 'math', summary: 'Binomialkoeffizient.', minArgs: 2, maxArgs: 2 },
  { name: 'COS', category: 'math', summary: 'Kosinus im Bogenmass.', minArgs: 1, maxArgs: 1 },
  { name: 'DEGREES', category: 'math', summary: 'Bogenmass in Grad.', minArgs: 1, maxArgs: 1 },
  { name: 'EXP', category: 'math', summary: 'Exponentialfunktion zur Basis e.', minArgs: 1, maxArgs: 1 },
  { name: 'FACT', category: 'math', summary: 'Fakultaet.', minArgs: 1, maxArgs: 1 },
  { name: 'FLOOR', category: 'math', summary: 'Rundet auf ein Vielfaches ab.', minArgs: 1, maxArgs: 2 },
  { name: 'INT', category: 'math', summary: 'Rundet auf die naechstkleinere Ganzzahl ab.', minArgs: 1, maxArgs: 1 },
  { name: 'LN', category: 'math', summary: 'Natuerlicher Logarithmus.', minArgs: 1, maxArgs: 1 },
  { name: 'LOG', category: 'math', summary: 'Logarithmus zu einer Basis.', minArgs: 1, maxArgs: 2 },
  { name: 'LOG10', category: 'math', summary: 'Zehnerlogarithmus.', minArgs: 1, maxArgs: 1 },
  { name: 'MROUND', category: 'math', summary: 'Rundet auf ein Vielfaches.', minArgs: 2, maxArgs: 2 },
  { name: 'PI', category: 'math', summary: 'Kreiszahl Pi.', minArgs: 0, maxArgs: 0 },
  { name: 'PRODUCT', category: 'math', summary: 'Multipliziert alle Zahlen.', minArgs: 1, maxArgs: null },
  { name: 'RADIANS', category: 'math', summary: 'Grad in Bogenmass.', minArgs: 1, maxArgs: 1 },
  { name: 'SIGN', category: 'math', summary: 'Vorzeichen einer Zahl.', minArgs: 1, maxArgs: 1 },
  { name: 'SIN', category: 'math', summary: 'Sinus im Bogenmass.', minArgs: 1, maxArgs: 1 },
  { name: 'TAN', category: 'math', summary: 'Tangens im Bogenmass.', minArgs: 1, maxArgs: 1 },
  { name: 'TRUNC', category: 'math', summary: 'Schneidet Nachkommastellen ab.', minArgs: 1, maxArgs: 2 },

  { name: 'COUNTBLANK', category: 'statistics', summary: 'Zaehlt leere Zellen.', minArgs: 1, maxArgs: 1 },
  { name: 'COUNTIF', category: 'statistics', summary: 'Zaehlt Zellen mit einem Kriterium.', minArgs: 2, maxArgs: 2 },
  { name: 'COUNTIFS', category: 'statistics', summary: 'Zaehlt Zellen ueber mehrere Kriterien.', minArgs: 2, maxArgs: null },
  { name: 'LARGE', category: 'statistics', summary: 'Der k-groesste Wert.', minArgs: 2, maxArgs: 2 },
  { name: 'MEDIAN', category: 'statistics', summary: 'Median der Werte.', minArgs: 1, maxArgs: null },
  { name: 'MODE', category: 'statistics', summary: 'Haeufigster Wert.', minArgs: 1, maxArgs: null },
  { name: 'MODE.SNGL', category: 'statistics', summary: 'Haeufigster Wert.', minArgs: 1, maxArgs: null },
  { name: 'PERCENTILE', category: 'statistics', summary: 'Perzentil einschliesslich.', minArgs: 2, maxArgs: 2 },
  { name: 'PERCENTILE.INC', category: 'statistics', summary: 'Perzentil einschliesslich.', minArgs: 2, maxArgs: 2 },
  { name: 'QUARTILE', category: 'statistics', summary: 'Quartil einschliesslich.', minArgs: 2, maxArgs: 2 },
  { name: 'QUARTILE.INC', category: 'statistics', summary: 'Quartil einschliesslich.', minArgs: 2, maxArgs: 2 },
  { name: 'RANK', category: 'statistics', summary: 'Rang einer Zahl in einer Liste.', minArgs: 2, maxArgs: 3 },
  { name: 'SMALL', category: 'statistics', summary: 'Der k-kleinste Wert.', minArgs: 2, maxArgs: 2 },
  { name: 'STDEV', category: 'statistics', summary: 'Standardabweichung der Stichprobe.', minArgs: 1, maxArgs: null },
  { name: 'STDEV.P', category: 'statistics', summary: 'Standardabweichung der Grundgesamtheit.', minArgs: 1, maxArgs: null },
  { name: 'STDEV.S', category: 'statistics', summary: 'Standardabweichung der Stichprobe.', minArgs: 1, maxArgs: null },
  { name: 'STDEVP', category: 'statistics', summary: 'Standardabweichung der Grundgesamtheit.', minArgs: 1, maxArgs: null },
  { name: 'VAR', category: 'statistics', summary: 'Varianz der Stichprobe.', minArgs: 1, maxArgs: null },
  { name: 'VAR.P', category: 'statistics', summary: 'Varianz der Grundgesamtheit.', minArgs: 1, maxArgs: null },
  { name: 'VAR.S', category: 'statistics', summary: 'Varianz der Stichprobe.', minArgs: 1, maxArgs: null },
  { name: 'VARP', category: 'statistics', summary: 'Varianz der Grundgesamtheit.', minArgs: 1, maxArgs: null },

  { name: 'CHAR', category: 'text', summary: 'Zeichen zu einem Zeichencode.', minArgs: 1, maxArgs: 1 },
  { name: 'CLEAN', category: 'text', summary: 'Entfernt nicht druckbare Zeichen.', minArgs: 1, maxArgs: 1 },
  { name: 'CODE', category: 'text', summary: 'Zeichencode des ersten Zeichens.', minArgs: 1, maxArgs: 1 },
  { name: 'EXACT', category: 'text', summary: 'Vergleicht zwei Texte exakt.', minArgs: 2, maxArgs: 2 },
  { name: 'REGEXEXTRACT', category: 'text', summary: 'Extrahiert einen Treffer eines regulaeren Ausdrucks.', minArgs: 2, maxArgs: 3 },
  { name: 'REGEXMATCH', category: 'text', summary: 'Prueft einen regulaeren Ausdruck.', minArgs: 2, maxArgs: 3 },
  { name: 'REGEXREPLACE', category: 'text', summary: 'Ersetzt Treffer eines regulaeren Ausdrucks.', minArgs: 3, maxArgs: 4 },
  { name: 'T', category: 'text', summary: 'Liefert Text unveraendert, sonst leer.', minArgs: 1, maxArgs: 1 },
  { name: 'VALUE', category: 'text', summary: 'Wandelt Text in eine Zahl um.', minArgs: 1, maxArgs: 1 },

  { name: 'ISNONTEXT', category: 'information', summary: 'Wahr, wenn der Wert kein Text ist.', minArgs: 1, maxArgs: 1 },

  { name: 'RAND', category: 'math', summary: 'Zufallszahl zwischen 0 und 1.', minArgs: 0, maxArgs: 0 },
  { name: 'RANDBETWEEN', category: 'math', summary: 'Ganzzahlige Zufallszahl in einem Bereich.', minArgs: 2, maxArgs: 2 },
  {
    name: 'RANDARRAY',
    category: 'array',
    summary: 'Matrix von Zufallszahlen.',
    minArgs: 0,
    maxArgs: 5,
    dynamicArrayResult: true,
  },
  { name: 'DAVERAGE', category: 'statistics', summary: 'Mittelwert gefilterter Datenbankzeilen.', minArgs: 3, maxArgs: 3 },
  { name: 'DCOUNT', category: 'statistics', summary: 'Zaehlt numerische Datenbankzeilen.', minArgs: 3, maxArgs: 3 },
  { name: 'DCOUNTA', category: 'statistics', summary: 'Zaehlt nicht leere Datenbankzeilen.', minArgs: 3, maxArgs: 3 },
  { name: 'DMAX', category: 'statistics', summary: 'Groesster Wert gefilterter Datenbankzeilen.', minArgs: 3, maxArgs: 3 },
  { name: 'DMIN', category: 'statistics', summary: 'Kleinster Wert gefilterter Datenbankzeilen.', minArgs: 3, maxArgs: 3 },
  { name: 'DSUM', category: 'math', summary: 'Summe gefilterter Datenbankzeilen.', minArgs: 3, maxArgs: 3 },
  { name: 'MDETERM', category: 'math', summary: 'Determinante einer quadratischen Matrix.', minArgs: 1, maxArgs: 1 },
  { name: 'MINVERSE', category: 'math', summary: 'Inverse einer quadratischen Matrix.', minArgs: 1, maxArgs: 1, dynamicArrayResult: true },
  { name: 'MMULT', category: 'math', summary: 'Matrizenprodukt.', minArgs: 2, maxArgs: 2, dynamicArrayResult: true },

  { name: 'IPMT', category: 'financial', summary: 'Zinsanteil einer Zahlung.', minArgs: 4, maxArgs: 6 },
  { name: 'PPMT', category: 'financial', summary: 'Tilgungsanteil einer Zahlung.', minArgs: 4, maxArgs: 6 },
  { name: 'NPER', category: 'financial', summary: 'Anzahl der Perioden.', minArgs: 3, maxArgs: 5 },
  { name: 'RATE', category: 'financial', summary: 'Zinssatz je Periode.', minArgs: 3, maxArgs: 6 },
  { name: 'SLN', category: 'financial', summary: 'Lineare Abschreibung je Periode.', minArgs: 3, maxArgs: 3 },
  { name: 'XIRR', category: 'financial', summary: 'Interner Zinsfuss unregelmaessiger Zahlungen.', minArgs: 2, maxArgs: 3 },
  { name: 'XNPV', category: 'financial', summary: 'Kapitalwert unregelmaessiger Zahlungen.', minArgs: 2, maxArgs: 3 },

  { name: 'VGTREF', category: 'lookup', summary: 'Liest ein Objekt einer Workspace-Dokumentreferenz.', minArgs: 2, maxArgs: 2 },
  { name: 'TRUE', category: 'logical', summary: 'Wahrheitswert WAHR.', minArgs: 0, maxArgs: 0 },
  { name: 'FALSE', category: 'logical', summary: 'Wahrheitswert FALSCH.', minArgs: 0, maxArgs: 0 },

  // Regression and covariance family implemented by the statistics toolpak.
  { name: 'CORREL', category: 'statistics', summary: 'Korrelationskoeffizient zweier Datenreihen.', minArgs: 2, maxArgs: 2 },
  { name: 'COVARIANCE.P', category: 'statistics', summary: 'Kovarianz der Grundgesamtheit.', minArgs: 2, maxArgs: 2 },
  { name: 'COVARIANCE.S', category: 'statistics', summary: 'Kovarianz der Stichprobe.', minArgs: 2, maxArgs: 2 },
  { name: 'COVARIANCEP', category: 'statistics', summary: 'Kovarianz der Grundgesamtheit.', minArgs: 2, maxArgs: 2 },
  { name: 'COVARIANCES', category: 'statistics', summary: 'Kovarianz der Stichprobe.', minArgs: 2, maxArgs: 2 },
  { name: 'FORECAST', category: 'statistics', summary: 'Linearer Prognosewert.', minArgs: 3, maxArgs: 3 },
  { name: 'FORECAST.LINEAR', category: 'statistics', summary: 'Linearer Prognosewert.', minArgs: 3, maxArgs: 3 },
  { name: 'GROWTH', category: 'statistics', summary: 'Exponentielle Trendwerte.', minArgs: 1, maxArgs: 4, dynamicArrayResult: true },
  { name: 'INTERCEPT', category: 'statistics', summary: 'Achsenabschnitt der Regressionsgeraden.', minArgs: 2, maxArgs: 2 },
  { name: 'KURT', category: 'statistics', summary: 'Wolbung einer Verteilung.', minArgs: 1, maxArgs: null },
  { name: 'RSQ', category: 'statistics', summary: 'Bestimmtheitsmass einer Regression.', minArgs: 2, maxArgs: 2 },
  { name: 'SKEW', category: 'statistics', summary: 'Schiefe einer Verteilung.', minArgs: 1, maxArgs: null },
  { name: 'SKEW.P', category: 'statistics', summary: 'Schiefe der Grundgesamtheit.', minArgs: 1, maxArgs: null },
  { name: 'SLOPE', category: 'statistics', summary: 'Steigung der Regressionsgeraden.', minArgs: 2, maxArgs: 2 },
  { name: 'TREND', category: 'statistics', summary: 'Lineare Trendwerte.', minArgs: 1, maxArgs: 4, dynamicArrayResult: true },
];

function briefParameters(minArgs: number, maxArgs: number | null): readonly GridFormulaFunctionParameter[] {
  const total = maxArgs === null ? Math.max(minArgs, 1) : Math.max(minArgs, maxArgs);
  const parameters: GridFormulaFunctionParameter[] = [];
  for (let index = 0; index < total; index++) {
    parameters.push(p(`arg${index + 1}`, 'any', index < minArgs, 'Positionsargument.'));
  }
  return parameters;
}

/** Deterministically ordered catalogue (name ascending, ASCII). */
export const GRID_FORMULA_FUNCTIONS: readonly GridFormulaFunctionEntry[] = Object.freeze(
  [
    ...SEEDS.map((entry) =>
      seed(entry.name, entry.category, entry.summary, entry.parameters, {
        minArgs: entry.minArgs,
        maxArgs: entry.maxArgs,
        dynamicArrayResult: entry.dynamicArrayResult,
      }),
    ),
    ...BRIEF_SEEDS.map((entry) =>
      seed(entry.name, entry.category, entry.summary, briefParameters(entry.minArgs, entry.maxArgs), {
        minArgs: entry.minArgs,
        maxArgs: entry.maxArgs,
        dynamicArrayResult: entry.dynamicArrayResult,
      }),
    ),
  ].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)),
);

const BY_NAME = new Map<string, GridFormulaFunctionEntry>(
  GRID_FORMULA_FUNCTIONS.map((entry) => [entry.name, entry]),
);

export function normalizeFormulaFunctionName(name: string): string {
  return name.trim().toUpperCase();
}

export function getFormulaFunctionEntry(name: string): GridFormulaFunctionEntry | null {
  return BY_NAME.get(normalizeFormulaFunctionName(name)) ?? null;
}

export function isKnownFormulaFunction(name: string): boolean {
  return BY_NAME.has(normalizeFormulaFunctionName(name));
}

export function listFormulaFunctions(
  category?: GridFormulaFunctionCategory,
): readonly GridFormulaFunctionEntry[] {
  if (!category) return GRID_FORMULA_FUNCTIONS;
  return GRID_FORMULA_FUNCTIONS.filter((entry) => entry.category === category);
}

export function listFormulaFunctionCategories(): readonly GridFormulaFunctionCategory[] {
  const categories = new Set<GridFormulaFunctionCategory>();
  for (const entry of GRID_FORMULA_FUNCTIONS) categories.add(entry.category);
  return Object.freeze(
    Array.from(categories).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

/**
 * Formula-bar autocomplete. Ranking is deterministic: exact match first, then prefix
 * matches ordered by length (closest completion first) and finally substring matches.
 */
export function suggestFormulaFunctions(
  query: string,
  limit = 8,
): readonly GridFormulaFunctionEntry[] {
  const needle = normalizeFormulaFunctionName(query);
  const capped = Number.isFinite(limit) ? Math.max(0, Math.min(Math.trunc(limit), 500)) : 8;
  if (capped === 0) return [];
  if (!needle) return GRID_FORMULA_FUNCTIONS.slice(0, capped);

  const byCloseness = (left: GridFormulaFunctionEntry, right: GridFormulaFunctionEntry): number =>
    left.name.length - right.name.length || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

  const exact: GridFormulaFunctionEntry[] = [];
  const prefix: GridFormulaFunctionEntry[] = [];
  const contains: GridFormulaFunctionEntry[] = [];
  for (const entry of GRID_FORMULA_FUNCTIONS) {
    if (entry.name === needle) exact.push(entry);
    else if (entry.name.startsWith(needle)) prefix.push(entry);
    else if (entry.name.includes(needle)) contains.push(entry);
  }
  return [...exact, ...prefix.sort(byCloseness), ...contains.sort(byCloseness)].slice(0, capped);
}

export function formulaFunctionSignature(entry: GridFormulaFunctionEntry): string {
  const parts = entry.parameters.map((parameter) =>
    parameter.required ? parameter.name : `[${parameter.name}]`,
  );
  if (entry.maxArgs === null && parts.length > 0) parts[parts.length - 1] = `[${parts[parts.length - 1].replace(/^\[|\]$/g, '')}, ...]`;
  return `${entry.name}(${parts.join('; ')})`;
}

export interface GridFormulaArityViolation {
  readonly code: FormulaError;
  readonly name: string;
  readonly message: string;
  readonly expected: string;
  readonly actual: number;
}

/**
 * Pre-flight arity check used by the function assistant and by `diagnoseFormula`.
 * Returns `null` when the call is well-formed, otherwise a typed violation whose
 * `code` is the spreadsheet error the cell would show.
 */
export function validateFormulaFunctionArity(
  name: string,
  argCount: number,
): GridFormulaArityViolation | null {
  const normalized = normalizeFormulaFunctionName(name);
  const entry = BY_NAME.get(normalized);
  const actual = Math.max(0, Math.trunc(argCount));
  if (!entry) {
    return {
      code: '#NAME?',
      name: normalized,
      message: `Unbekannte Funktion ${normalized}.`,
      expected: '0',
      actual,
    };
  }
  const rationale = `${entry.name} erwartet ${entry.minArgs}${entry.maxArgs === null ? ' oder mehr' : `..${entry.maxArgs}`} Argumente, erhalten ${actual}.`;
  if (actual < entry.minArgs) {
    return {
      code: '#VALUE!',
      name: entry.name,
      message: rationale,
      expected: formulaFunctionSignature(entry),
      actual,
    };
  }
  if (entry.maxArgs !== null && actual > entry.maxArgs) {
    // Excel reports surplus LOGICAL/IF arguments such as `IF` as a value error.
    return {
      code: '#VALUE!',
      name: entry.name,
      message: rationale,
      expected: formulaFunctionSignature(entry),
      actual,
    };
  }
  return null;
}

/**
 * Assembles a formula for the function assistant. Arguments are inserted verbatim;
 * blank optional arguments stay blank (`SUM(1;)`) which the engine reads as an
 * omitted argument. The returned text is always a valid `=`-prefixed formula and is
 * length-checked against the canonical limit.
 */
export function buildFormulaCall(
  name: string,
  args: readonly string[],
  options: { maxLength?: number } = {},
): { readonly formula: string; readonly violation: GridFormulaArityViolation | null } {
  const normalized = normalizeFormulaFunctionName(name);
  const violation = validateFormulaFunctionArity(normalized, args.length);
  const trimmedArgs = args.map((arg) => arg.trim());
  // Trailing blank arguments are omitted optional parameters, not empty arguments.
  // Interior blanks are preserved because Excel treats `SUM(1;;2)` as an omitted
  // middle argument, which must not shift the remaining arguments.
  let lastProvided = trimmedArgs.length - 1;
  while (lastProvided >= 0 && trimmedArgs[lastProvided] === '') lastProvided--;
  const collapsed = trimmedArgs.slice(0, lastProvided + 1);
  const formula = `=${normalized}(${collapsed.join(', ')})`;
  const maxLength = options.maxLength ?? 16 * 1024;
  if (formula.length > maxLength) {
    return {
      formula: '#CALC!',
      violation: {
        code: '#CALC!',
        name: normalized,
        message: 'Die zusammengesetzte Formel ueberschreitet die maximale Formellaenge.',
        expected: `<= ${maxLength} Zeichen`,
        actual: formula.length,
      },
    };
  }
  return { formula, violation };
}
