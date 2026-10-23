// STATUS: PLATIN
import { GridCell, GridNamedRange } from '../../../shared/contracts/workspace';
import { parseCoord } from '../compat/gridUtils';
import { toA1 } from '../formulas/formula';
import { parseGridRange } from '../compat/gridProfessional';

export function normalizeGridSelection(anchor: string, focus: string): string {
  const a = parseCoord(anchor.toUpperCase());
  const b = parseCoord(focus.toUpperCase());
  const start = toA1(Math.min(a.colIdx, b.colIdx), Math.min(a.rowIdx, b.rowIdx));
  const end = toA1(Math.max(a.colIdx, b.colIdx), Math.max(a.rowIdx, b.rowIdx));
  return start === end ? start : `${start}:${end}`;
}

export function gridRangeCoordinates(range: string): string[] {
  const bounds = parseGridRange(range);
  if (!bounds) return [];
  const coords: string[] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row++) {
    for (let col = bounds.startCol; col <= bounds.endCol; col++) coords.push(toA1(col, row));
  }
  return coords;
}

function isIdentifierChar(value: string | undefined): boolean {
  return !!value && /[A-Za-z0-9_.]/.test(value);
}

/**
 * Shifts A1 references while deliberately leaving quoted strings, sheet names,
 * function-like identifiers and absolute row/column components untouched.
 */
export function shiftFormulaReferences(formula: string, deltaCol: number, deltaRow: number): string {
  let output = '';
  let i = 0;
  let inString = false;

  while (i < formula.length) {
    const char = formula[i];
    if (char === '"') {
      // Spreadsheet strings escape a quote by doubling it ("").
      if (inString && formula[i + 1] === '"') {
        output += '""';
        i += 2;
        continue;
      }
      inString = !inString;
      output += char;
      i += 1;
      continue;
    }

    if (!inString) {
      const remaining = formula.slice(i);
      const match = remaining.match(/^(\$?)([A-Z]+)(\$?)([1-9]\d*)/i);
      if (match) {
        const [full, absCol, colLettersRaw, absRow, rowText] = match;
        const previous = i > 0 ? formula[i - 1] : undefined;
        const next = formula[i + full.length];
        // Do not reinterpret a fragment of an identifier, a sheet qualifier
        // (Sheet1!A1) or a function identifier such as LOG10(...).
        if (!isIdentifierChar(previous) && !isIdentifierChar(next) && next !== '!' && next !== '(') {
          const colLetters = colLettersRaw.toUpperCase();
          const parsed = parseCoord(`${colLetters}${rowText}`);
          const nextCol = absCol ? parsed.colIdx : parsed.colIdx + deltaCol;
          const nextRow = absRow ? parsed.rowIdx : parsed.rowIdx + deltaRow;
          if (nextCol < 0 || nextRow < 0) output += '#REF!';
          else {
            const shifted = toA1(nextCol, nextRow);
            const shiftedMatch = shifted.match(/^([A-Z]+)(\d+)$/);
            output += shiftedMatch ? `${absCol}${shiftedMatch[1]}${absRow}${shiftedMatch[2]}` : '#REF!';
          }
          i += full.length;
          continue;
        }
      }
    }

    output += char;
    i += 1;
  }

  return output;
}

/**
 * Rewrites named ranges to their canonical A1 ranges before the formula is sent
 * to the authoritative Rust evaluator. It does not evaluate formulas in JS.
 */
export function resolveNamedRangesInFormula(
  formula: string,
  namedRanges: GridNamedRange[],
  activeSheetId: string,
): string {
  const activeNames = namedRanges
    .filter((named) => named.sheetId === activeSheetId)
    .sort((a, b) => b.name.length - a.name.length);
  if (!activeNames.length) return formula;

  let output = '';
  let token = '';
  let inString = false;
  const flushToken = () => {
    if (!token) return;
    const match = activeNames.find((named) => named.name.toLocaleLowerCase() === token.toLocaleLowerCase());
    output += match ? match.range : token;
    token = '';
  };

  for (let i = 0; i < formula.length; i++) {
    const char = formula[i];
    if (char === '"') {
      if (inString && formula[i + 1] === '"') {
        flushToken();
        output += '""';
        i += 1;
        continue;
      }
      flushToken();
      inString = !inString;
      output += char;
      continue;
    }
    if (!inString && /[A-Za-z0-9_.]/.test(char)) token += char;
    else {
      flushToken();
      output += char;
    }
  }
  flushToken();
  return output;
}

export function fillRangeFromSource(
  cells: Record<string, GridCell>,
  sourceCoord: string,
  targetRange: string,
): Record<string, GridCell> {
  const source = cells[sourceCoord];
  if (!source) return { ...cells };
  const sourcePos = parseCoord(sourceCoord);
  const output = { ...cells };
  for (const coord of gridRangeCoordinates(targetRange)) {
    const targetPos = parseCoord(coord);
    output[coord] = {
      ...source,
      formula: source.formula
        ? shiftFormulaReferences(source.formula, targetPos.colIdx - sourcePos.colIdx, targetPos.rowIdx - sourcePos.rowIdx)
        : undefined,
    };
  }
  return output;
}

export function applyCellFormatToRange(
  cells: Record<string, GridCell>,
  range: string,
  patch: Partial<Pick<GridCell, 'format' | 'bold' | 'italic' | 'underline' | 'alignment' | 'wrap' | 'background' | 'text_color'>>,
): Record<string, GridCell> {
  const output = { ...cells };
  for (const coord of gridRangeCoordinates(range)) {
    output[coord] = { ...(output[coord] ?? { value: '' }), ...patch };
  }
  return output;
}

export function isValidGridNamedRangeName(name: string): boolean {
  const normalized = name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(normalized)) return false;
  // Names that are indistinguishable from A1/R1C1 references are rejected.
  if (/^[A-Za-z]{1,3}[1-9]\d*$/.test(normalized)) return false;
  if (/^R\d+C\d+$/i.test(normalized)) return false;
  return true;
}

export function clearGridRangeValues(cells: Record<string, GridCell>, range: string): Record<string, GridCell> {
  const output = { ...cells };
  for (const coord of gridRangeCoordinates(range)) {
    const current = output[coord];
    if (current) output[coord] = { ...current, value: '', formula: undefined };
  }
  return output;
}

export function fillSeriesFromSource(
  cells: Record<string, GridCell>,
  sourceCoord: string,
  targetRange: string,
  mode: 'copy' | 'series' = 'series'
): Record<string, GridCell> {
  const source = cells[sourceCoord];
  if (!source) return { ...cells };
  const sourcePos = parseCoord(sourceCoord);
  const output = { ...cells };
  const coords = gridRangeCoordinates(targetRange);

  const numVal = typeof source.value === 'number' ? source.value : Number(source.value);
  const isNum = !isNaN(numVal) && source.value !== '' && source.value !== null;

  let step = 0;
  for (const coord of coords) {
    if (coord === sourceCoord) continue;
    step++;
    const targetPos = parseCoord(coord);

    if (source.formula) {
      output[coord] = {
        ...source,
        formula: shiftFormulaReferences(source.formula, targetPos.colIdx - sourcePos.colIdx, targetPos.rowIdx - sourcePos.rowIdx),
      };
    } else if (mode === 'series' && isNum) {
      output[coord] = {
        ...source,
        value: numVal + step,
      };
    } else {
      output[coord] = { ...source };
    }
  }
  return output;
}

export function pasteSpecialToRange(
  targetCells: Record<string, GridCell>,
  copiedCells: Record<string, GridCell>,
  targetCoord: string,
  mode: 'all' | 'values' | 'formats' | 'transpose' = 'all'
): Record<string, GridCell> {
  const copiedCoords = Object.keys(copiedCells);
  if (!copiedCoords.length) return { ...targetCells };

  const bounds = parseGridRange(
    copiedCoords.length === 1 ? copiedCoords[0] : `${copiedCoords[0]}:${copiedCoords[copiedCoords.length - 1]}`
  );
  const baseTarget = parseCoord(targetCoord);
  const baseSource = bounds ? { colIdx: bounds.startCol, rowIdx: bounds.startRow } : parseCoord(copiedCoords[0]);
  const output = { ...targetCells };

  for (const [sourceKey, cell] of Object.entries(copiedCells)) {
    const sPos = parseCoord(sourceKey);
    const dCol = sPos.colIdx - baseSource.colIdx;
    const dRow = sPos.rowIdx - baseSource.rowIdx;

    const targetPos = mode === 'transpose'
      ? { colIdx: baseTarget.colIdx + dRow, rowIdx: baseTarget.rowIdx + dCol }
      : { colIdx: baseTarget.colIdx + dCol, rowIdx: baseTarget.rowIdx + dRow };

    const destKey = toA1(targetPos.colIdx, targetPos.rowIdx);
    const existing = output[destKey] ?? { value: '' };

    if (mode === 'values') {
      output[destKey] = { ...existing, value: cell.value };
    } else if (mode === 'formats') {
      output[destKey] = {
        ...existing,
        format: cell.format,
        bold: cell.bold,
        italic: cell.italic,
        underline: cell.underline,
        alignment: cell.alignment,
        wrap: cell.wrap,
        background: cell.background,
        text_color: cell.text_color,
        border: cell.border,
      };
    } else if (mode === 'transpose') {
      output[destKey] = { ...cell, formula: undefined };
    } else {
      output[destKey] = {
        ...cell,
        formula: cell.formula
          ? shiftFormulaReferences(cell.formula, targetPos.colIdx - sPos.colIdx, targetPos.rowIdx - sPos.rowIdx)
          : undefined,
      };
    }
  }

  return output;
}

export function mergeGridCells(
  cells: Record<string, GridCell>,
  range: string
): { updatedCells: Record<string, GridCell>; warnedLoss: boolean; primaryCoord: string } {
  const coords = gridRangeCoordinates(range);
  if (coords.length <= 1) {
    return { updatedCells: cells, warnedLoss: false, primaryCoord: coords[0] || 'A1' };
  }

  const primaryCoord = coords[0];
  const primaryCell = cells[primaryCoord] ?? { value: '' };
  const updated = { ...cells };

  // Check if non-primary cells contain data (warn data loss)
  let warnedLoss = false;
  for (let i = 1; i < coords.length; i++) {
    const c = coords[i];
    const val = cells[c]?.value;
    if (val !== undefined && val !== null && val !== '' && val !== 0) {
      warnedLoss = true;
    }
    // Clear other cells in the merge range
    delete updated[c];
  }

  updated[primaryCoord] = {
    ...primaryCell,
  };

  return { updatedCells: updated, warnedLoss, primaryCoord };
}

export function unmergeGridCells(
  cells: Record<string, GridCell>,
  mergedRange: string
): Record<string, GridCell> {
  const coords = gridRangeCoordinates(mergedRange);
  const updated = { ...cells };
  for (const c of coords) {
    if (!updated[c]) {
      updated[c] = { value: '' };
    }
  }
  return updated;
}
