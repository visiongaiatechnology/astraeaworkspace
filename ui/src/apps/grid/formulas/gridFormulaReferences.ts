// STATUS: DIAMANT VGT SUPREME
// Canonical reference semantics for the Grid formula surface.
//
// This module owns *one* A1-reference grammar used by reference translation
// (`translateFormulaReferences`), precedent/dependent extraction
// (`extractReferencesFromFormula`) and spill planning. Earlier the translation used a
// loose `[A-Za-z]+[0-9]+` pattern which mis-read `Sheet2!A1` as the cell `Sheet2` and
// `Table1[Amount]` as the cell `Table1`. The grammar below validates every candidate
// against the real raster (A1..XFD1048576) and understands sheet qualifiers, whole
// column/row references and structured table references.

import type { GridCell } from '../../../shared/contracts/workspace';
import { toA1 } from './formula';
import { parseCoord } from '../compat/gridUtils';
import {
  isFormulaArray,
  type FormulaError,
  type FormulaValue,
  type SingleFormulaValue,
} from './gridFormulaTypes';
import { planGridFormulaSpill, type GridFormulaSpillPlanOptions } from './gridFormulaSpill';

export const GRID_FORMULA_MAX_COLUMN_INDEX = 16_383;
export const GRID_FORMULA_MAX_ROW_INDEX = 1_048_575;

export interface ParsedA1Reference {
  readonly colIdx: number;
  readonly rowIdx: number;
  readonly colAbsolute: boolean;
  readonly rowAbsolute: boolean;
  /** The matched text, exactly as written. */
  readonly text: string;
}

function columnLettersToIndex(letters: string): number {
  let index = 0;
  for (let position = 0; position < letters.length; position++) {
    index = index * 26 + (letters.charCodeAt(position) - 64);
  }
  return index - 1;
}

function isReferenceBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  return !/[A-Za-z0-9_.$]/.test(text[index - 1]);
}

/**
 * Parses a single (`$A$1`, `A1`, `$A1`, `A$1`) reference token. Returns `null` for
 * anything that is not a valid in-raster A1 reference, including names such as
 * `Sheet1`, `Table1` and out-of-range columns such as `XFE1`.
 */
export function parseA1ReferenceToken(token: string): ParsedA1Reference | null {
  const match = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6})$/.exec(token.trim());
  if (!match) return null;
  const colIdx = columnLettersToIndex(match[2].toUpperCase());
  const rowIdx = Number(match[4]) - 1;
  if (colIdx < 0 || colIdx > GRID_FORMULA_MAX_COLUMN_INDEX) return null;
  if (rowIdx < 0 || rowIdx > GRID_FORMULA_MAX_ROW_INDEX) return null;
  return {
    colIdx,
    rowIdx,
    colAbsolute: match[1] === '$',
    rowAbsolute: match[3] === '$',
    text: token.trim(),
  };
}

export function formatA1Reference(
  colIdx: number,
  rowIdx: number,
  colAbsolute = false,
  rowAbsolute = false,
): string {
  return `${colAbsolute ? '$' : ''}${toA1(colIdx, rowIdx).replace(/\d+$/, '')}${rowAbsolute ? '$' : ''}${rowIdx + 1}`;
}

const SHEET_PREFIX = /(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!/y;
const STRUCTURED_REFERENCE = /[A-Za-z_][A-Za-z0-9_.]*(?:\[[^\]]*\])+/y;
const WHOLE_COLUMN_RANGE = /(\$?)([A-Za-z]{1,3})\s*:\s*(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_])/y;
const WHOLE_ROW_RANGE = /(\$?)([1-9]\d{0,6})\s*:\s*(\$?)([1-9]\d{0,6})(?![0-9])/y;
const CELL_REFERENCE = /(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6})(?![A-Za-z0-9_]|\s*\()/y;

function stickyMatch(pattern: RegExp, text: string, index: number): RegExpExecArray | null {
  pattern.lastIndex = index;
  const match = pattern.exec(text);
  return match && match.index === index ? match : null;
}

function shiftReference(
  colIdx: number,
  rowIdx: number,
  colAbsolute: boolean,
  rowAbsolute: boolean,
  rowOffset: number,
  colOffset: number,
): string {
  const newCol = colAbsolute ? colIdx : colIdx + colOffset;
  const newRow = rowAbsolute ? rowIdx : rowIdx + rowOffset;
  if (newCol < 0 || newRow < 0) return '#REF!';
  if (newCol > GRID_FORMULA_MAX_COLUMN_INDEX || newRow > GRID_FORMULA_MAX_ROW_INDEX) return '#REF!';
  return formatA1Reference(newCol, newRow, colAbsolute, rowAbsolute);
}

/**
 * Translates relative formula cell references when a formula is copied, filled or
 * moved. Anchored references (`$A$1`, `$A1`, `A$1`) keep their anchored dimension.
 * Sheet qualifiers (`Sheet2!`, `'My Sheet'!`), structured table references
 * (`Table1[Amount]`) and string literals are preserved verbatim.
 */
export function translateFormulaReferences(
  formula: string,
  rowOffset: number,
  colOffset: number,
): string {
  if (!formula.startsWith('=')) return formula;
  if (rowOffset === 0 && colOffset === 0) return formula;
  const body = formula.slice(1);
  let output = '=';

  let index = 0;
  while (index < body.length) {
    const char = body[index];

    if (char === '"') {
      output += char;
      index++;
      while (index < body.length) {
        if (body[index] === '"') {
          if (body[index + 1] === '"') {
            output += '""';
            index += 2;
            continue;
          }
          output += '"';
          index++;
          break;
        }
        output += body[index];
        index++;
      }
      continue;
    }

    if (isReferenceBoundary(body, index)) {
      const sheet = stickyMatch(SHEET_PREFIX, body, index);
      if (sheet) {
        output += sheet[0];
        index += sheet[0].length;
        continue;
      }

      const structured = stickyMatch(STRUCTURED_REFERENCE, body, index);
      if (structured) {
        output += structured[0];
        index += structured[0].length;
        continue;
      }

      const wholeColumn = stickyMatch(WHOLE_COLUMN_RANGE, body, index);
      if (wholeColumn) {
        const startCol = columnLettersToIndex(wholeColumn[2].toUpperCase());
        const endCol = columnLettersToIndex(wholeColumn[4].toUpperCase());
        if (startCol >= 0 && endCol >= 0 && startCol <= GRID_FORMULA_MAX_COLUMN_INDEX && endCol <= GRID_FORMULA_MAX_COLUMN_INDEX) {
          const startAbs = wholeColumn[1] === '$';
          const endAbs = wholeColumn[3] === '$';
          const newStart = startAbs ? startCol : startCol + colOffset;
          const newEnd = endAbs ? endCol : endCol + colOffset;
          output +=
            newStart < 0 || newEnd < 0 || newStart > GRID_FORMULA_MAX_COLUMN_INDEX || newEnd > GRID_FORMULA_MAX_COLUMN_INDEX
              ? '#REF!'
              : `${startAbs ? '$' : ''}${toA1(newStart, 0).replace(/\d+$/, '')}:${endAbs ? '$' : ''}${toA1(newEnd, 0).replace(/\d+$/, '')}`;
          index += wholeColumn[0].length;
          continue;
        }
      }

      const wholeRow = stickyMatch(WHOLE_ROW_RANGE, body, index);
      if (wholeRow) {
        const startRow = Number(wholeRow[2]) - 1;
        const endRow = Number(wholeRow[4]) - 1;
        const startAbs = wholeRow[1] === '$';
        const endAbs = wholeRow[3] === '$';
        const newStart = startAbs ? startRow : startRow + rowOffset;
        const newEnd = endAbs ? endRow : endRow + rowOffset;
        output +=
          newStart < 0 || newEnd < 0 || newStart > GRID_FORMULA_MAX_ROW_INDEX || newEnd > GRID_FORMULA_MAX_ROW_INDEX
            ? '#REF!'
            : `${startAbs ? '$' : ''}${newStart + 1}:${endAbs ? '$' : ''}${newEnd + 1}`;
        index += wholeRow[0].length;
        continue;
      }

      const cell = stickyMatch(CELL_REFERENCE, body, index);
      if (cell) {
        const colIdx = columnLettersToIndex(cell[2].toUpperCase());
        const rowIdx = Number(cell[4]) - 1;
        if (colIdx >= 0 && colIdx <= GRID_FORMULA_MAX_COLUMN_INDEX && rowIdx <= GRID_FORMULA_MAX_ROW_INDEX) {
          output += shiftReference(colIdx, rowIdx, cell[1] === '$', cell[3] === '$', rowOffset, colOffset);
          index += cell[0].length;
          continue;
        }
      }
    }

    output += char;
    index++;
  }

  return output;
}

export interface ExtractedFormulaReferences {
  readonly cells: readonly string[];
  /** Ranges that exceeded the expansion budget; reported as their two corners. */
  readonly truncatedRanges: readonly string[];
}

interface RangeExpansion {
  readonly cells: string[];
  readonly truncated: boolean;
}

function expandRange(startA1: string, endA1: string, maxCells: number): RangeExpansion {
  const start = parseA1ReferenceToken(startA1);
  const end = parseA1ReferenceToken(endA1);
  if (!start || !end) return { cells: [], truncated: false };
  const minCol = Math.min(start.colIdx, end.colIdx);
  const maxCol = Math.max(start.colIdx, end.colIdx);
  const minRow = Math.min(start.rowIdx, end.rowIdx);
  const maxRow = Math.max(start.rowIdx, end.rowIdx);
  const area = (maxRow - minRow + 1) * (maxCol - minCol + 1);
  if (area > maxCells) {
    return { cells: [toA1(minCol, minRow), toA1(maxCol, maxRow)], truncated: true };
  }
  const cells: string[] = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) cells.push(toA1(col, row));
  }
  return { cells, truncated: false };
}

const RANGE_PATTERN = /(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})\s*:\s*(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})/g;
const SINGLE_REFERENCE_PATTERN = /(?<![A-Za-z0-9_.$])(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})(?![A-Za-z0-9_]|\s*\()/g;

/** Strips double-quoted literals so reference scanning never reads string content. */
function stripStringLiterals(formula: string): string {
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
      continue;
    }
    output += inString ? ' ' : char;
  }
  return output;
}

/**
 * Extracts every cell coordinate referenced by a formula, expanding ranges up to
 * `maxCells` and degrading gracefully to range corners beyond that budget.
 */
export function extractReferencesFromFormulaDetailed(
  formula: string,
  maxCells = 100_000,
): ExtractedFormulaReferences {
  if (!formula.startsWith('=')) return { cells: [], truncatedRanges: [] };
  const source = stripStringLiterals(formula);
  const cells: string[] = [];
  const truncatedRanges: string[] = [];

  const withoutRanges = source.replace(RANGE_PATTERN, (match, startA1: string, endA1: string) => {
    const expansion = expandRange(startA1.replace(/\$/g, '').toUpperCase(), endA1.replace(/\$/g, '').toUpperCase(), maxCells);
    if (expansion.truncated) truncatedRanges.push(match.trim());
    for (const cell of expansion.cells) cells.push(cell);
    return ' ';
  });

  let match: RegExpExecArray | null;
  SINGLE_REFERENCE_PATTERN.lastIndex = 0;
  while ((match = SINGLE_REFERENCE_PATTERN.exec(withoutRanges)) !== null) {
    const parsed = parseA1ReferenceToken(match[1].replace(/\$/g, '').toUpperCase());
    if (parsed) cells.push(toA1(parsed.colIdx, parsed.rowIdx));
  }

  return {
    cells: Object.freeze(Array.from(new Set(cells))),
    truncatedRanges: Object.freeze(Array.from(new Set(truncatedRanges))),
  };
}

/**
 * Extracts all cell coordinates referenced by a formula.
 */
export function extractReferencesFromFormula(formula: string): string[] {
  return [...extractReferencesFromFormulaDetailed(formula).cells];
}

/**
 * Precedents: Cells that this cell's formula depends upon directly or via ranges.
 */
export function getPrecedents(coord: string, cells: Record<string, GridCell>): string[] {
  const norm = coord.toUpperCase().replace(/\$/g, '');
  const cell = cells[norm];
  if (!cell || !cell.formula) return [];
  return extractReferencesFromFormula(cell.formula);
}

/**
 * Dependents: Cells across the worksheet that depend upon this coordinate.
 */
export function getDependents(coord: string, cells: Record<string, GridCell>): string[] {
  const target = coord.toUpperCase().replace(/\$/g, '');
  const dependents: string[] = [];

  for (const [cKey, cell] of Object.entries(cells)) {
    if (!cell.formula) continue;
    const prec = extractReferencesFromFormula(cell.formula);
    if (prec.includes(target)) {
      dependents.push(cKey.toUpperCase().replace(/\$/g, ''));
    }
  }

  return Array.from(new Set(dependents));
}

export interface SpillResult {
  originCoord: string;
  value: FormulaValue;
  spilledCells: Record<string, SingleFormulaValue>;
  error?: FormulaError;
  /** Cells that blocked the spill; present when `error === '#SPILL!'`. */
  blockedBy?: readonly string[];
}

/**
 * Dynamic array spill semantics: places matrix results into adjacent cells, or flags
 * a `#SPILL!` when the footprint is blocked or leaves the raster. Delegates to the
 * canonical bounded planner, so an array at the sheet edge yields `#SPILL!` instead of
 * throwing a coordinate-range error out of the recalculation loop.
 */
export function applySpill(
  originCoord: string,
  formulaValue: FormulaValue,
  cells: Record<string, GridCell>,
  options: GridFormulaSpillPlanOptions = {},
): SpillResult {
  const plan = planGridFormulaSpill(originCoord, formulaValue, cells, options);
  if (plan.kind === 'scalar') {
    return { originCoord: plan.originCoord, value: plan.value, spilledCells: {} };
  }
  if (plan.error) {
    return {
      originCoord: plan.originCoord,
      value: plan.error,
      spilledCells: {},
      error: plan.error,
      ...(plan.blockedBy.length > 0 ? { blockedBy: plan.blockedBy } : {}),
    };
  }
  return {
    originCoord: plan.originCoord,
    value: plan.value,
    spilledCells: { ...plan.spilled },
  };
}

/** Re-exported for callers that only need the containment check. */
export function isSingleCellReference(value: FormulaValue): boolean {
  return !isFormulaArray(value);
}

export function referenceBoundsOf(coord: string): { colIdx: number; rowIdx: number } {
  return parseCoord(coord.toUpperCase().replace(/\$/g, ''));
}
