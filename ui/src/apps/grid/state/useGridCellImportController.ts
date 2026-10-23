// STATUS: PLATIN — Grid import mutation controller isolated from the workbook state composition hook.

import type { GridCell, GridQueryDefinition, GridSheetModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { evaluateFormula, parseA1, type FormulaEvaluationContext } from '../formulas/formula';
import { FORMULA_MAX_LENGTH } from '../formulas/formulaContract';
import { resolveCustomValidationFormula, validateCellValue } from '../validation/gridValidation';
import { parseGridRange } from '../compat/gridProfessional';
import { autoExpandStructuredTablesForEdits } from '../tables/gridStructuredTables';
import { collectDirtyFormulaCells, recalculateGridDeterministically } from '../formulas/gridFormulaRecalc';
import { parseGridCellInput } from '../editing/gridCellTypes';
import {
  GRID_IMPORT_MAX_CELLS,
  GRID_IMPORT_MAX_CELL_CHARS,
  GRID_IMPORT_MAX_COLUMNS,
  GRID_IMPORT_MAX_ROWS,
} from '../interchange/gridXlsxOdsRoundtrip';

type GridTableCollection = GridSheetModel['tables'];

export interface GridCellImportControllerDependencies {
  hasActiveTable: boolean;
  primaryTableId: string | undefined;
  canEditCoordinates: (coordinates: readonly string[]) => boolean;
  cells: Record<string, GridCell>;
  document: WorkspaceDocument;
  activeSheetModel: GridSheetModel | undefined;
  setValidationError: (message: string | null) => void;
  formulaEvaluationContext: (coordinate: string, tables?: GridTableCollection) => FormulaEvaluationContext;
  persistCellChanges: (
    updatedCells: Record<string, GridCell>,
    editCoordinates: readonly string[],
    sheetPatch?: Partial<GridSheetModel>,
    gridDataPatch?: Partial<NonNullable<WorkspaceDocument['gridData']>>,
  ) => boolean;
  prepareFormulaForEvaluation: (formula: string, coordinate: string, tables?: GridTableCollection) => string;
  shouldRecalculateDependent: (coordinate: string) => boolean;
  evaluateFormula: typeof evaluateFormula;
}

export async function importGridCells(
  dependencies: GridCellImportControllerDependencies,
  incoming: Record<string, string>,
  queryDefinition?: GridQueryDefinition,
): Promise<boolean> {
  const {
    hasActiveTable,
    primaryTableId,
    canEditCoordinates,
    cells,
    document,
    activeSheetModel,
    setValidationError,
    formulaEvaluationContext,
    persistCellChanges,
    prepareFormulaForEvaluation,
    shouldRecalculateDependent,
    evaluateFormula: evaluate,
  } = dependencies;
  if (!hasActiveTable || !primaryTableId) return false;
  const rawEntries = Object.entries(incoming);
  if (rawEntries.length === 0) return true;
  if (rawEntries.length > GRID_IMPORT_MAX_CELLS) {
    setValidationError('Der Import überschreitet die erlaubte Zellzahl.');
    return false;
  }

  const normalized = rawEntries.map(([rawCoord, rawValue]) => {
    if (typeof rawValue !== 'string' || rawValue.length > GRID_IMPORT_MAX_CELL_CHARS || !/^[A-Za-z]{1,3}[1-9]\d{0,5}$/u.test(rawCoord)) {
      throw new Error('grid_import_cell_invalid');
    }
    const point = parseA1(rawCoord);
    if (!point || point.row >= GRID_IMPORT_MAX_ROWS || point.col >= GRID_IMPORT_MAX_COLUMNS) throw new Error('grid_import_coordinate_limit');
    return { coord: rawCoord.toUpperCase(), row: point.row, col: point.col, rawValue };
  }).sort((left, right) => left.row - right.row || left.col - right.col);

  const seen = new Set<string>();
  for (const entry of normalized) {
    if (seen.has(entry.coord)) throw new Error('grid_import_duplicate_coordinate');
    seen.add(entry.coord);
  }
  const editCoords = normalized.map((entry) => entry.coord);
  if (!canEditCoordinates(editCoords)) return false;

  try {
    const tableEdits = normalized.map(({ coord, rawValue }) => {
      const trimmed = rawValue.trim();
      const isFormula = trimmed.startsWith('=');
      if (isFormula && trimmed.length > FORMULA_MAX_LENGTH) throw new Error('grid_import_formula_limit');
      const currentCell = cells[coord] ?? { value: '' };
      const cell = isFormula
        ? { ...currentCell, formula: trimmed, dataType: 'formula' as const }
        : { ...currentCell, ...parseGridCellInput(rawValue), formula: undefined };
      return { coord, cell };
    });

    const expanded = autoExpandStructuredTablesForEdits(activeSheetModel?.tables ?? [], cells, tableEdits);
    let updatedCells = expanded.cells;
    const formulaCoords = new Set(tableEdits.filter(({ cell }) => !!cell.formula).map(({ coord }) => coord));
    const dirty = collectDirtyFormulaCells(editCoords, updatedCells);
    const recalcTargets = new Set([...formulaCoords, ...dirty]);
    if (recalcTargets.size > 0) {
      const mode = document.gridData?.calculationMode ?? 'automatic';
      const recalculated = await recalculateGridDeterministically(
        updatedCells,
        async (targetCoord, targetFormula, snapshot) => evaluate(
          prepareFormulaForEvaluation(targetFormula, targetCoord, expanded.tables),
          snapshot,
          formulaEvaluationContext(targetCoord, expanded.tables),
        ),
        (targetCoord) => formulaCoords.has(targetCoord)
          || (mode !== 'manual' && dirty.has(targetCoord) && shouldRecalculateDependent(targetCoord)),
      );
      updatedCells = recalculated.cells;
      for (const cyclicCoord of recalculated.cyclic) updatedCells[cyclicCoord] = { ...updatedCells[cyclicCoord], value: '#CIRCULAR!' };
    }

    const validationRules = activeSheetModel?.validations ?? [];
    for (const coord of editCoords) {
      const customRule = validationRules.find((rule) => rule.kind === 'custom' && rule.range && (() => {
        const bounds = parseGridRange(rule.range);
        const point = parseA1(coord);
        return !!bounds && !!point && point.row >= bounds.startRow && point.row <= bounds.endRow && point.col >= bounds.startCol && point.col <= bounds.endCol;
      })());
      const customFormula = customRule ? resolveCustomValidationFormula(customRule, coord) : null;
      const customFormulaResult = customFormula
        ? await evaluate(prepareFormulaForEvaluation(customFormula, coord, expanded.tables), updatedCells, formulaEvaluationContext(coord, expanded.tables))
        : undefined;
      const validation = validateCellValue(
        coord,
        updatedCells[coord],
        validationRules,
        updatedCells,
        {
          namedRanges: document.gridData?.namedRanges ?? [],
          tables: expanded.tables,
          sheetId: activeSheetModel?.id,
          customFormulaResult,
        },
      );
      if (!validation.isValid) {
        setValidationError(validation.errorMessage || `${coord} failed data validation.`);
        return false;
      }
    }

    setValidationError(null);
    const queryPatch = queryDefinition
      ? {
          queries: [
            ...(document.gridData?.queries ?? []).filter((query) => query.id !== queryDefinition.id),
            queryDefinition,
          ].slice(-128),
        }
      : undefined;
    return persistCellChanges(updatedCells, editCoords, { tables: expanded.tables }, queryPatch);
  } catch {
    setValidationError('Der Tabellenimport konnte nicht sicher angewendet werden.');
    return false;
  }
}
