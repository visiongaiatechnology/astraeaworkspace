// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Data Validation Engine
// Validation Rules, dependent dropdown sources, Input Tooltips, Error Alerts, and Circle Invalid Data.

import {
  GridCell,
  GridDataValidationRule,
  GridNamedRange,
  GridStructuredTable,
} from '../../../shared/contracts/grid/workspaceGrid';
import { coordInGridRange, parseGridRange } from '../compat/gridProfessional';
import { translateFormulaReferences } from '../formulas/gridFormulaReferences';
import { parseCoord } from '../compat/gridUtils';
import { toA1 } from '../formulas/formula';

export interface ValidationEvaluationResult {
  isValid: boolean;
  rule?: GridDataValidationRule;
  errorMessage?: string;
}

export interface GridValidationContext {
  namedRanges?: GridNamedRange[];
  tables?: GridStructuredTable[];
  sheetId?: string;
  customFormulaResult?: string | number | boolean;
}

const MAX_LIST_OPTIONS = 10_000;

function valuesFromA1Range(range: string, cells: Record<string, GridCell>): string[] {
  const bounds = parseGridRange(range);
  if (!bounds) return [];
  const cellCount = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
  if (cellCount > MAX_LIST_OPTIONS) return [];
  const values: string[] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row++) {
    for (let col = bounds.startCol; col <= bounds.endCol; col++) {
      const raw = cells[toA1(col, row)]?.value;
      const value = String(raw ?? '').trim();
      if (value) values.push(value);
    }
  }
  return [...new Set(values)].slice(0, MAX_LIST_OPTIONS);
}

function tableColumnRange(source: string, tables: GridStructuredTable[]): string | null {
  const match = source.match(/^([A-Za-z_][A-Za-z0-9_]*)\[([^\]\r\n]{1,128})\]$/);
  if (!match) return null;
  const table = tables.find((candidate) => candidate.name.toLocaleLowerCase() === match[1].toLocaleLowerCase());
  if (!table) return null;
  const bounds = parseGridRange(table.range);
  if (!bounds) return null;
  const columnIndex = table.columns.findIndex((column) => column.name.toLocaleLowerCase() === match[2].trim().toLocaleLowerCase());
  if (columnIndex < 0) return null;
  const startRow = table.hasHeaders ? bounds.startRow + 1 : bounds.startRow;
  const endRow = table.hasTotalsRow ? bounds.endRow - 1 : bounds.endRow;
  const col = bounds.startCol + columnIndex;
  return `${toA1(col, startRow)}:${toA1(col, endRow)}`;
}

export function resolveValidationListOptions(
  rule: GridDataValidationRule,
  cells: Record<string, GridCell>,
  context: GridValidationContext = {},
  coord?: string,
): string[] {
  if (rule.kind !== 'list') return [];
  const direct = (rule.options ?? []).map((value) => value.trim()).filter(Boolean);
  if (!rule.listSource?.trim()) return [...new Set(direct)].slice(0, MAX_LIST_OPTIONS);

  let source = rule.listSource.trim().replace(/^=/, '');
  if (!source) return [...new Set(direct)].slice(0, MAX_LIST_OPTIONS);

  const indirect = source.match(/^INDIRECT\(\s*(\$?[A-Za-z]+\$?[1-9]\d*)\s*\)$/i);
  if (indirect && coord) {
    const bounds = parseGridRange(rule.range);
    const current = parseCoord(coord);
    if (!bounds || current.rowIdx < 0 || current.colIdx < 0) return [];
    const translated = translateFormulaReferences(
      `=${indirect[1]}`,
      current.rowIdx - bounds.startRow,
      current.colIdx - bounds.startCol,
    ).replace(/^=/, '');
    const selectorValue = String(cells[translated.toUpperCase()]?.value ?? '').trim();
    if (!selectorValue || selectorValue.length > 128) return [];
    source = selectorValue;
  }

  const named = (context.namedRanges ?? []).find((candidate) =>
    candidate.name.toLocaleLowerCase() === source.toLocaleLowerCase()
      && (!context.sheetId || candidate.sheetId === context.sheetId)
  );
  if (named) return valuesFromA1Range(named.range, cells);

  const tableRange = tableColumnRange(source, context.tables ?? []);
  if (tableRange) return valuesFromA1Range(tableRange, cells);

  if (parseGridRange(source)) return valuesFromA1Range(source, cells);
  return [];
}

export function resolveCustomValidationFormula(rule: GridDataValidationRule, coord: string): string | null {
  if (!rule.formula?.trim()) return null;
  const bounds = parseGridRange(rule.range);
  if (!bounds) return rule.formula;
  const current = parseCoord(coord);
  if (current.rowIdx < 0 || current.colIdx < 0) return rule.formula;
  return translateFormulaReferences(
    rule.formula,
    current.rowIdx - bounds.startRow,
    current.colIdx - bounds.startCol,
  );
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

export function validateCellValue(
  coord: string,
  cell: GridCell | undefined,
  rules: GridDataValidationRule[],
  cells: Record<string, GridCell>,
  context: GridValidationContext = {},
): ValidationEvaluationResult {
  const normCoord = coord.toUpperCase();
  const matchingRule = rules.find((rule) => coordInGridRange(normCoord, rule.range));
  if (!matchingRule) return { isValid: true };

  const rawVal = cell?.value;
  if (rawVal === undefined || rawVal === null || rawVal === '') {
    if (matchingRule.allowBlank !== false) return { isValid: true, rule: matchingRule };
  }

  const strVal = String(rawVal ?? '').trim();
  const numVal = Number(rawVal);
  const fail = (message: string): ValidationEvaluationResult => ({
    isValid: false,
    rule: matchingRule,
    errorMessage: matchingRule.errorMessage || message,
  });

  switch (matchingRule.kind) {
    case 'whole-number': {
      if (!Number.isFinite(numVal) || !Number.isInteger(numVal)) return fail('Muss eine ganze Zahl sein.');
      if (matchingRule.min !== undefined && numVal < matchingRule.min) return fail(`Wert muss mindestens ${matchingRule.min} sein.`);
      if (matchingRule.max !== undefined && numVal > matchingRule.max) return fail(`Wert darf maximal ${matchingRule.max} sein.`);
      return { isValid: true, rule: matchingRule };
    }
    case 'number':
    case 'decimal': {
      if (!Number.isFinite(numVal)) return fail('Muss eine gültige Zahl sein.');
      if (matchingRule.min !== undefined && numVal < matchingRule.min) return fail(`Wert muss mindestens ${matchingRule.min} sein.`);
      if (matchingRule.max !== undefined && numVal > matchingRule.max) return fail(`Wert darf maximal ${matchingRule.max} sein.`);
      return { isValid: true, rule: matchingRule };
    }
    case 'list': {
      const options = resolveValidationListOptions(matchingRule, cells, context, normCoord);
      const allowed = options.some((option) => option.toLocaleLowerCase() === strVal.toLocaleLowerCase());
      return allowed
        ? { isValid: true, rule: matchingRule }
        : fail(options.length ? `Wert muss einer der vorgegebenen Optionen entsprechen (${options.join(', ')}).` : 'Die Listenquelle ist leer oder ungültig.');
    }
    case 'text-length': {
      if (matchingRule.min !== undefined && strVal.length < matchingRule.min) return fail(`Textlänge muss mindestens ${matchingRule.min} Zeichen betragen.`);
      if (matchingRule.max !== undefined && strVal.length > matchingRule.max) return fail(`Textlänge darf maximal ${matchingRule.max} Zeichen betragen.`);
      return { isValid: true, rule: matchingRule };
    }
    case 'date': {
      if (Number.isNaN(Date.parse(strVal))) return fail('Muss ein gültiges Datum sein (z.B. YYYY-MM-DD).');
      return { isValid: true, rule: matchingRule };
    }
    case 'time': {
      if (!validTime(strVal)) return fail('Muss eine gültige Uhrzeit sein (HH:MM oder HH:MM:SS).');
      return { isValid: true, rule: matchingRule };
    }
    case 'custom': {
      const formula = resolveCustomValidationFormula(matchingRule, normCoord);
      if (!formula) return { isValid: true, rule: matchingRule };
      const evalRes = context.customFormulaResult;
      if (evalRes === undefined) return fail('Benutzerdefinierte Formelvalidierung benötigt den kanonischen Formula Core.');
      if (evalRes === false || evalRes === 0 || String(evalRes).startsWith('#')) return fail('Benutzerdefinierte Formelvalidierung fehlgeschlagen.');
      return { isValid: true, rule: matchingRule };
    }
    default:
      return { isValid: true, rule: matchingRule };
  }
}

export function findInvalidCellCoordinates(
  cells: Record<string, GridCell>,
  rules: GridDataValidationRule[],
  context: GridValidationContext = {},
): Set<string> {
  const invalid = new Set<string>();
  if (rules.length === 0) return invalid;
  for (const [coord, cell] of Object.entries(cells)) {
    const result = validateCellValue(coord, cell, rules, cells, context);
    if (!result.isValid) invalid.add(coord.toUpperCase());
  }
  return invalid;
}
