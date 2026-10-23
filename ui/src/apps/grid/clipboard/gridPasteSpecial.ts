// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Paste Special Engine
// Full Excel/Calc parity: Values, Formulas, Formats, Transpose, Arithmetic Operations

import { GridCell, GridPasteSpecialOptions } from '../../../shared/contracts/grid/workspaceGrid';
import { parseA1, toA1 } from '../formulas/formula';
import { shiftFormulaReferences } from '../editing/gridSelection';

export interface PasteSpecialResult {
  updatedCells: Record<string, GridCell>;
  affectedCoords: string[];
}

export function applyPasteSpecial(
  sourceCells: Record<string, GridCell>,
  sourceCoords: string[],
  targetAnchorCoord: string,
  existingCells: Record<string, GridCell>,
  options: GridPasteSpecialOptions
): PasteSpecialResult {
  const targetAnchor = parseA1(targetAnchorCoord);
  if (!targetAnchor || sourceCoords.length === 0) {
    return { updatedCells: existingCells, affectedCoords: [] };
  }

  // Determine source bounding box
  const parsedSources = sourceCoords
    .map((c) => ({
      coord: c,
      parsed: parseA1(c)!,
      cell: sourceCells[c] || existingCells[c],
    }))
    .filter((s) => s.parsed !== null);

  if (parsedSources.length === 0) {
    return { updatedCells: existingCells, affectedCoords: [] };
  }

  const minCol = Math.min(...parsedSources.map((s) => s.parsed.col));
  const minRow = Math.min(...parsedSources.map((s) => s.parsed.row));

  const updated: Record<string, GridCell> = { ...existingCells };
  const affected: string[] = [];

  for (const item of parsedSources) {
    const relCol = item.parsed.col - minCol;
    const relRow = item.parsed.row - minRow;

    // Transpose switches relative column and row offsets
    const destCol = options.transpose
      ? targetAnchor.col + relRow
      : targetAnchor.col + relCol;
    const destRow = options.transpose
      ? targetAnchor.row + relCol
      : targetAnchor.row + relRow;

    const destCoord = toA1(destCol, destRow);
    const existing = existingCells[destCoord];

    // Skip blanks if requested and source cell is empty
    if (options.skipBlanks) {
      const isBlank = !item.cell || (item.cell.value === '' && !item.cell.formula);
      if (isBlank) continue;
    }

    const sourceCell = item.cell || { value: '' };
    let newCell: GridCell = existing ? { ...existing } : { value: '' };
    const deltaCol = destCol - item.parsed.col;
    const deltaRow = destRow - item.parsed.row;

    switch (options.mode) {
      case 'values':
        newCell.value = sourceCell.value;
        delete newCell.formula;
        break;

      case 'formulas':
        if (sourceCell.formula) {
          newCell.formula = shiftFormulaReferences(sourceCell.formula, deltaCol, deltaRow);
          newCell.value = sourceCell.value;
        } else {
          delete newCell.formula;
          newCell.value = sourceCell.value;
        }
        break;

      case 'formats':
        newCell = {
          ...newCell,
          format: sourceCell.format,
          bold: sourceCell.bold,
          italic: sourceCell.italic,
          underline: sourceCell.underline,
          strikethrough: sourceCell.strikethrough,
          fontSize: sourceCell.fontSize,
          fontFamily: sourceCell.fontFamily,
          alignment: sourceCell.alignment,
          verticalAlignment: sourceCell.verticalAlignment,
          indent: sourceCell.indent,
          wrap: sourceCell.wrap,
          background: sourceCell.background,
          text_color: sourceCell.text_color,
          border: sourceCell.border,
          numberFormatCode: sourceCell.numberFormatCode,
        };
        break;

      case 'all-except-borders':
        newCell = {
          ...sourceCell,
          formula: sourceCell.formula ? shiftFormulaReferences(sourceCell.formula, deltaCol, deltaRow) : undefined,
          border: existing?.border,
        };
        break;

      case 'column-widths':
        // Column widths are sheet metadata, not cell content: nothing is written
        // into the grid. Previously this mode fell through to a full paste and
        // overwrote the target cells with the clipboard content.
        continue;

      case 'all':
        newCell = {
          ...sourceCell,
          formula: sourceCell.formula ? shiftFormulaReferences(sourceCell.formula, deltaCol, deltaRow) : undefined,
        };
        break;

      default: {
        const exhaustive: never = options.mode;
        throw new Error(`Unsupported Grid paste mode: ${String(exhaustive)}`);
      }
    }

    // Apply arithmetic operations if specified
    if (options.operation !== 'none') {
      const existingNum = typeof existing?.value === 'number' ? existing.value : Number(existing?.value ?? 0);
      const sourceNum = typeof sourceCell.value === 'number' ? sourceCell.value : Number(sourceCell.value ?? 0);

      if (!isNaN(existingNum) && !isNaN(sourceNum)) {
        switch (options.operation) {
          case 'add':
            newCell.value = existingNum + sourceNum;
            break;
          case 'subtract':
            newCell.value = existingNum - sourceNum;
            break;
          case 'multiply':
            newCell.value = existingNum * sourceNum;
            break;
          case 'divide':
            newCell.value = sourceNum !== 0 ? existingNum / sourceNum : '#DIV/0!';
            break;
          default: {
            const exhaustive: never = options.operation;
            throw new Error(`Unsupported Grid paste operation: ${String(exhaustive)}`);
          }
        }
        delete newCell.formula;
      }
    }

    updated[destCoord] = newCell;
    affected.push(destCoord);
  }

  return { updatedCells: updated, affectedCoords: affected };
}
