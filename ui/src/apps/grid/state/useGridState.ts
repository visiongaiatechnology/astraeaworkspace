// W-426: die Zone des Nutzers fuer die Formelauswertung.
import { createIntlZoneOffsetLookup } from '../formulas/gridFormulaTimeContext';
// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative state hook: selection, formulas, formatting, clipboard, navigation

import { useState, useEffect, useRef, useCallback } from 'react';
import { WorkspaceDocument, TableObject, GridCell, GridQueryDefinition, GridScenario, GridStructuredTable } from '../../../shared/contracts/workspace';
import { evaluateFormula } from '../formulas/formula';
import { parseCoord } from '../compat/gridUtils';
import {
  gridRangeCoordinates,
  normalizeGridSelection,
  resolveNamedRangesInFormula,
} from '../editing/gridSelection';
import { resolveCustomValidationFormula, validateCellValue } from '../validation/gridValidation';
import { parseGridRange } from '../compat/gridProfessional';
import { useGridWorkbook } from '../workbook/useGridWorkbook';
import { autoExpandStructuredTables, resolveStructuredReference, resolveStructuredReferencesInFormula } from '../tables/gridStructuredTables';
import { collectDirtyFormulaCells, recalculateGridDeterministically } from '../formulas/gridFormulaRecalc';
import { resolveWorkspaceGridFormulaReference } from '../formulas/gridWorkspaceFormulaResolver';
import { appendGridHistory, buildGridHistoryEntries, validateGridEditAccess } from '../collaboration/gridReviewCollaboration';
import { mergeGridCellInput, parseGridCellInput } from '../editing/gridCellTypes';
import { prepareScenarioCellUpdate } from '../what-if/gridScenarios';
import { importGridCells } from './useGridCellImportController';
import { uniqueGridRangeCoordinates } from '../editing/gridAdvancedEditing';
import { collectChangedGridCoordinates } from '../formatting/gridCellDiff';
import {
  checkGridNumberFormatCode,
  gridNumberFormatPatch,
  type GridNumberFormatId,
} from '../formatting/gridNumberFormat';
import {
  describeGridNumberFormatCodeError,
  isGridBorder,
  normalizeGridColour,
  type GridFormatIssue,
} from '../formatting/gridFormatValidation';
import { gridStructuredTableStylePatch, type GridStructuredTableTheme } from '../formatting/gridFormattingEngine';
import { useGridSelectionController } from '../editing/controllers/useGridSelectionController';
import { useGridRangeEditingController } from '../editing/controllers/useGridRangeEditingController';
import { useGridAdvancedController } from '../controllers/useGridAdvancedController';
import { useGridKeyboardController } from '../editing/controllers/useGridKeyboardController';

interface UseGridStateProps {
  document: WorkspaceDocument;
  workspaceDocuments?: Record<string, WorkspaceDocument>;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  onSelectSelectionType: (type: 'text' | 'cell' | 'shape' | 'chart') => void;
  reviewUserId?: string;
  reviewRoles?: string[];
  reviewAuthor?: string;
  onGlobalUndo?: () => boolean;
  onGlobalRedo?: () => boolean;
}

export function useGridState({
  document,
  workspaceDocuments = {},
  onUpdateDocument,
  onSelectSelectionType,
  reviewUserId = 'local-user',
  reviewRoles = ['editor'],
  reviewAuthor = 'Local Editor',
  onGlobalUndo,
  onGlobalRedo,
}: UseGridStateProps) {
  const fallbackPrimaryTableId = (Array.isArray(document.root_object_ids) ? document.root_object_ids : []).find(
    (id) => typeof id === 'string' && document.objects[id]?.type === 'Table'
  );
  /**
   * GR-001 / GR-006 (M1) — malformed **entries** inside the sheet list.
   *
   * The document-level guards accept the sheet array, but a corrupted container can contain a
   * `null` entry: `useGridWorkbook` then threw `Cannot read properties of null (reading 'id')`
   * during render, so the grid never mounted and no controlled rejection was shown. Entries are
   * filtered to objects with a string id and table id; the document itself is left untouched.
   */
  const rawSheets = document.gridData?.sheets;
  const validSheets = Array.isArray(rawSheets)
    ? rawSheets.filter((sheet) => {
        if (!sheet || typeof sheet !== 'object') return false;
        const candidate = sheet as unknown as { id?: unknown; tableObjectId?: unknown };
        return typeof candidate.id === 'string' && typeof candidate.tableObjectId === 'string';
      })
    : [];
  const workbookSheets = validSheets.length
    ? validSheets
    : fallbackPrimaryTableId
      ? [{ id: 'sheet-fallback', name: 'Sheet 1', tableObjectId: fallbackPrimaryTableId }]
      : [];

  const initialSheetId = document.gridData?.activeSheetId ?? workbookSheets[0]?.id ?? 'sheet-fallback';
  const [activeSheetId, setActiveSheetId] = useState<string>(initialSheetId);
  const [validationError, setValidationError] = useState<string | null>(null);

  /**
   * GR-044 / M1 — the **document** is the authority for the active sheet.
   *
   * Measured by `gridSelectionCoherenceAfterStructure`: deleting the active sheet moved the
   * local state to a remaining sheet, but an undo restored `gridData.activeSheetId` in the
   * document while the local state stayed on the other sheet — the hook and the document then
   * disagreed about which sheet the user is on. Following the document (only when it points at
   * an existing sheet and actually changed) keeps the two in sync for undo/redo and restores.
   */
  const documentActiveSheetId = document.gridData?.activeSheetId;
  useEffect(() => {
    if (!documentActiveSheetId || documentActiveSheetId === activeSheetId) return;
    if (!workbookSheets.some((sheet) => sheet.id === documentActiveSheetId)) return;
    setActiveSheetId(documentActiveSheetId);
  }, [activeSheetId, documentActiveSheetId, workbookSheets]);

  const {
    activeSheetModel,
    updateActiveSheet,
    handleAddSheet,
    handleRenameSheet,
    handleDuplicateSheet,
    handleDeleteSheet,
    handleReorderSheet,
    handleChangeTabColor,
    handleSetSheetVisibility,
  } = useGridWorkbook({
    document,
    workbookSheets,
    activeSheetId,
    setActiveSheetId,
    onUpdateDocument,
    onWorkbookError: setValidationError,
  });

  const primaryTableId = activeSheetModel?.tableObjectId ?? fallbackPrimaryTableId;
  const tableObj = primaryTableId ? (document.objects[primaryTableId]?.data as TableObject) : null;

  const [selectedCell, setSelectedCell] = useState<string>('A1');
  const [selectionAnchor, setSelectionAnchor] = useState<string>('A1');
  const [selectionFocus, setSelectionFocus] = useState<string>('A1');
  const [disjointRanges, setDisjointRanges] = useState<string[]>([]);
  const [formulaInput, setFormulaInput] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isRangeSelecting, setIsRangeSelecting] = useState<boolean>(false);
  const [draggedCoord, setDraggedCoord] = useState<string | null>(null);
  const [draggedAsFill, setDraggedAsFill] = useState<boolean>(false);
  const [dragOverCoord, setDragOverCoord] = useState<string | null>(null);
  const [colCount, setColCount] = useState<number>(10);
  const [rowCount, setRowCount] = useState<number>(25);

  const inlineInputRef = useRef<HTMLInputElement>(null);
  /**
   * GR-001 (M1) — `cells` may be a string or array in a corrupted container; `cells || {}` kept
   * the hostile value and silently hid every value. Only a plain object is used as the cell map.
   */
  const cells = tableObj?.cells && typeof tableObj.cells === 'object' && !Array.isArray(tableObj.cells)
    ? tableObj.cells
    : {};

  const canEditCoordinates = useCallback((coords: readonly string[]): boolean => {
    for (const coord of coords) {
      const access = validateGridEditAccess({
        coord,
        userId: reviewUserId,
        userRoles: reviewRoles,
        cell: cells[coord],
        sheetProtection: activeSheetModel?.protection,
        rangeRules: activeSheetModel?.rangePermissions ?? [],
      });
      if (!access.allowed) {
        setValidationError(access.reason ?? `Editing ${coord} is not permitted.`);
        return false;
      }
    }
    return true;
  }, [activeSheetModel?.protection, activeSheetModel?.rangePermissions, cells, reviewRoles, reviewUserId]);

  const persistCellChanges = useCallback((
    updatedCells: Record<string, GridCell>,
    editCoords: readonly string[],
    sheetPatch: Partial<NonNullable<typeof activeSheetModel>> = {},
    gridDataPatch?: Partial<NonNullable<WorkspaceDocument['gridData']>>,
  ): boolean => {
    if (!tableObj || !primaryTableId || !canEditCoordinates(editCoords)) return false;
    // Formatting edits leave value and formula untouched, so the diff must consider every
    // persisted cell field — otherwise a colour or number-format change never reaches the
    // document history, the collaboration diff, or an undo.
    const changedCoords = collectChangedGridCoordinates(cells, updatedCells);
    const additions = buildGridHistoryEntries(cells, updatedCells, changedCoords.slice(0, 10_000), reviewAuthor);
    const nextSheets = document.gridData?.sheets.map((sheet) => sheet.id === activeSheetModel?.id
      ? { ...sheet, ...sheetPatch, history: appendGridHistory(sheet.history ?? [], additions) }
      : sheet);
    const nextGridData = document.gridData
      ? { ...document.gridData, ...(nextSheets ? { sheets: nextSheets } : {}), ...gridDataPatch }
      : gridDataPatch
        ? { sheets: workbookSheets, ...gridDataPatch }
        : undefined;
    onUpdateDocument({
      ...document,
      version: document.version + 1,
      modified_at: Date.now(),
      objects: { ...document.objects, [primaryTableId]: { type: 'Table', data: { ...tableObj, cells: updatedCells } } },
      ...(nextGridData ? { gridData: nextGridData } : {}),
    });
    return true;
  }, [activeSheetModel?.id, canEditCoordinates, cells, document, onUpdateDocument, primaryTableId, reviewAuthor, tableObj, workbookSheets]);

  /**
   * GR-001 (M1) — non-numeric sizes must not produce an unusable grid.
   *
   * Measured (`gridMalformedEntries`): `rows: NaN` produced `aria-rowcount="NaN"` and a grid with
   * zero cells; a string was silently coerced. Only finite numbers are accepted, otherwise the
   * previous/default count stays.
   */
  useEffect(() => {
    if (!tableObj) return;
    /**
     * GR-001 (M1) — non-numeric sizes must not produce an unusable grid.
     *
     * Measured (`gridMalformedEntries`): `rows: NaN` produced `aria-rowcount="NaN"` and a grid with
     * zero cells; a string was silently coerced. Invalid values fall back to the contract minimum
     * of one row/column (the same rule the existing startup witness pins for rows=0).
     */
    const boundedDimension = (value: unknown): number => {
      const numeric = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : Number.NaN;
      return Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 1;
    };
    setColCount(boundedDimension(tableObj.cols));
    setRowCount(boundedDimension(tableObj.rows));
  }, [primaryTableId, tableObj, tableObj?.cols, tableObj?.rows]);

  useEffect(() => {
    const cell = cells[selectedCell];
    setFormulaInput(cell ? (cell.formula ? cell.formula : String(cell.value ?? '')) : '');
  }, [selectedCell, cells]);

  useEffect(() => {
    if (isEditing && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const stopRangeSelection = () => setIsRangeSelecting(false);
    window.addEventListener('mouseup', stopRangeSelection);
    return () => window.removeEventListener('mouseup', stopRangeSelection);
  }, []);

  const selectedRange = normalizeGridSelection(selectionAnchor, selectionFocus);
  const selectionRanges = [...disjointRanges.filter((range) => range !== selectedRange), selectedRange];

  const resizeActiveTable = useCallback(
    (nextRows: number, nextCols: number) => {
      if (!tableObj || !primaryTableId) return;
      const rows = Math.max(1, nextRows);
      const cols = Math.max(1, Math.min(256, nextCols));
      setRowCount(rows);
      setColCount(cols);
      onUpdateDocument({
        ...document,
        version: document.version + 1,
        modified_at: Date.now(),
        objects: { ...document.objects, [primaryTableId]: { type: 'Table', data: { ...tableObj, rows, cols } } },
      });
    },
    [document, tableObj, primaryTableId, onUpdateDocument]
  );

  const formulaEvaluationContext = useCallback((coord: string, tableOverride?: typeof activeSheetModel.tables) => ({
    namedFormulas: Object.fromEntries((document.gridData?.namedFormulas ?? []).map((entry) => [entry.name, entry.formula])),
    currentCellCoord: coord,
    structuredReferenceResolver: (reference: string, currentCoord?: string) =>
      resolveStructuredReference(reference, tableOverride ?? activeSheetModel?.tables ?? [], currentCoord),
    workspaceReferenceResolver: (uri: string, reference: string) =>
      resolveWorkspaceGridFormulaReference(workspaceDocuments, uri, reference),
    // **W-426: die Zone des Nutzers** — der letzte Schritt zwischen einer **bewiesenen** und einer **ausgelieferten**
    // Fähigkeit ✓. `TODAY`/`NOW` folgen damit **dieser** Zone statt der des Rechners.
    //
    // **Beides entsteht im Rumpf, nicht in der Abhängigkeitsliste** ✓ — und das ist Absicht ✓:
    //   * `Date.now()` wird bei **jeder** Auswertung gelesen ✓. Als eingefrorener Wert wäre der erste Aufruf der
    //     Zeitpunkt für alle weiteren ✗ ✓ — *genau die Klasse, die diese Sitzung bei vier Apps als P1 gefunden hat.*
    //   * `Intl.DateTimeFormat().resolvedOptions().timeZone` ist je Umgebung **konstant** ✓; im Rumpf gelesen kostet
    //     es nichts Messbares und kann **nicht** veralten ✓ ✓.
    //   * Der Lookup ist eine **neue** Funktion je Aufruf ✓ — leicht verschwenderisch ✓ und **beweisbar richtig** ✓.
    //     *Eine Ersparnis, die eine Veraltungsmöglichkeit einführt, ist keine Ersparnis.*
    // Ohne diese drei Felder verhält sich alles **genau wie vorher** ✓ (der Payload ist dann byte-identisch ✓).
    timeZone: typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined,
    timeZoneOffsetLookup: createIntlZoneOffsetLookup(),
    nowMs: Date.now(),
  }), [document.gridData?.namedFormulas, activeSheetModel?.tables, workspaceDocuments]);

  const prepareFormulaForEvaluation = useCallback((formula: string, coord: string, tableOverride?: typeof activeSheetModel.tables) => {
    const named = resolveNamedRangesInFormula(formula, document.gridData?.namedRanges ?? [], activeSheetModel?.id ?? '');
    return resolveStructuredReferencesInFormula(named, tableOverride ?? activeSheetModel?.tables ?? [], coord);
  }, [document.gridData?.namedRanges, activeSheetModel?.id, activeSheetModel?.tables]);

  const shouldRecalculateDependent = useCallback((coord: string) => {
    const mode = document.gridData?.calculationMode ?? 'automatic';
    if (mode === 'manual') return false;
    if (mode !== 'automatic-except-data-tables') return true;
    const parsed = parseCoord(coord);
    if (parsed.rowIdx < 0 || parsed.colIdx < 0) return false;
    return !(activeSheetModel?.dataTables ?? []).some((dataTable) => {
      const bounds = parseGridRange(dataTable.range);
      return !!bounds && parsed.rowIdx >= bounds.startRow && parsed.rowIdx <= bounds.endRow && parsed.colIdx >= bounds.startCol && parsed.colIdx <= bounds.endCol;
    });
  }, [document.gridData?.calculationMode, activeSheetModel?.dataTables]);

  const handleCommitValue = useCallback(
    async (coord: string, rawInput: string) => {
      if (!tableObj || !primaryTableId || !canEditCoordinates([coord])) return;
      const trimmed = rawInput.trim();
      const isFormula = trimmed.startsWith('=');
      const parsedInput = parseGridCellInput(rawInput);
      let computedValue: string | number | boolean = trimmed;
      let formulaStr: string | undefined = undefined;

      if (isFormula) {
        formulaStr = trimmed;
        const resolved = prepareFormulaForEvaluation(trimmed, coord);
        computedValue = await evaluateFormula(resolved, cells, formulaEvaluationContext(coord));
      } else {
        computedValue = parsedInput.value;
      }

      const currentCell = cells[coord] || { value: '' };
      let updatedCells: Record<string, GridCell> = {
        ...cells,
        [coord]: isFormula
          ? { ...currentCell, value: computedValue, formula: formulaStr, dataType: 'formula' }
          : { ...mergeGridCellInput(currentCell, parsedInput), formula: undefined },
      };
      const validationRules = activeSheetModel?.validations ?? [];
      const customRule = validationRules.find((rule) => rule.kind === 'custom' && rule.range && (() => {
        const bounds = parseGridRange(rule.range);
        const point = parseCoord(coord);
        return !!bounds && point.rowIdx >= bounds.startRow && point.rowIdx <= bounds.endRow && point.colIdx >= bounds.startCol && point.colIdx <= bounds.endCol;
      })());
      const customFormula = customRule ? resolveCustomValidationFormula(customRule, coord) : null;
      const customFormulaResult = customFormula
        ? await evaluateFormula(prepareFormulaForEvaluation(customFormula, coord), updatedCells, formulaEvaluationContext(coord))
        : undefined;
      const validation = validateCellValue(
        coord,
        updatedCells[coord],
        validationRules,
        updatedCells,
        {
          namedRanges: document.gridData?.namedRanges ?? [],
          tables: activeSheetModel?.tables ?? [],
          sheetId: activeSheetModel?.id,
          customFormulaResult,
        },
      );
      if (!validation.isValid) {
        setValidationError(validation.errorMessage || `${coord} failed data validation.`);
        return;
      }
      setValidationError(null);
      const expandedTables = autoExpandStructuredTables(activeSheetModel?.tables ?? [], updatedCells, coord);
      updatedCells = expandedTables.cells;
      const nextTables = expandedTables.tables;

      const dirty = collectDirtyFormulaCells([coord], updatedCells);
      if ((document.gridData?.calculationMode ?? 'automatic') !== 'manual' && dirty.size > 0) {
        const recalculated = await recalculateGridDeterministically(
          updatedCells,
          async (targetCoord, targetFormula, snapshot) => evaluateFormula(
            prepareFormulaForEvaluation(targetFormula, targetCoord, nextTables),
            snapshot,
            formulaEvaluationContext(targetCoord, nextTables)
          ),
          (targetCoord) => dirty.has(targetCoord) && shouldRecalculateDependent(targetCoord)
        );
        updatedCells = recalculated.cells;
        if (recalculated.cyclic.length > 0) {
          // Iterative circular calculation is intentionally fail-closed until the canonical
          // Rust Formula Core exposes an iterative policy. UI code must not become a second engine.
          for (const cyclicCoord of recalculated.cyclic) {
            updatedCells[cyclicCoord] = { ...updatedCells[cyclicCoord], value: '#CIRCULAR!' };
          }
        }
      }

      persistCellChanges(updatedCells, [coord], { tables: nextTables });
    },
    [cells, tableObj, primaryTableId, document, activeSheetModel, prepareFormulaForEvaluation, formulaEvaluationContext, shouldRecalculateDependent, canEditCoordinates, persistCellChanges]
  );

  const handleImportCells = useCallback((incoming: Record<string, string>, queryDefinition?: GridQueryDefinition): Promise<boolean> => importGridCells({
    hasActiveTable: !!tableObj,
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
    evaluateFormula,
  }, incoming, queryDefinition), [activeSheetModel, canEditCoordinates, cells, document, evaluateFormula, formulaEvaluationContext, persistCellChanges, prepareFormulaForEvaluation, primaryTableId, shouldRecalculateDependent, tableObj]);

  const handleApplyScenario = useCallback((scenario: GridScenario): boolean => {
    if (!tableObj || !primaryTableId || !activeSheetModel) return false;
    try {
      const { updatedCells, editCoords } = prepareScenarioCellUpdate(scenario, cells, activeSheetModel.id);
      if (editCoords.length === 0) {
        setValidationError(null);
        return true;
      }
      if (!canEditCoordinates(editCoords)) return false;
      const committed = persistCellChanges(updatedCells, editCoords);
      if (committed) setValidationError(null);
      return committed;
    } catch {
      setValidationError('Das Szenario ist ungültig oder kann nicht sicher angewendet werden.');
      return false;
    }
  }, [activeSheetModel, canEditCoordinates, cells, persistCellChanges, primaryTableId, tableObj]);

  const applyFormatToSelection = useCallback(
    (patch: Partial<GridCell>) => {
      if (!tableObj || !primaryTableId) return;
      const coords = uniqueGridRangeCoordinates(selectionRanges);
      if (!canEditCoordinates(coords)) return;
      const updatedCells = { ...cells };
      for (const coord of coords) updatedCells[coord] = { ...(updatedCells[coord] ?? { value:'' }), ...patch };
      persistCellChanges(updatedCells, coords);
    },
    [cells, selectionRanges, tableObj, primaryTableId, canEditCoordinates, persistCellChanges]
  );

  /**
   * Reviewed formatting entry used by the formatting dialog. Fail-closed: an unknown colour
   * or border style is rejected visibly instead of being written into the document.
   */
  const applyReviewedFormatToSelection = useCallback(
    (patch: Partial<GridCell>): GridFormatIssue | null => {
      if (!tableObj || !primaryTableId) return { code: 'invalid-value', message: 'No active sheet is available.' };
      const coords = uniqueGridRangeCoordinates(selectionRanges);
      if (!canEditCoordinates(coords)) return null;
      if (patch.background !== undefined) {
        const normalised = normalizeGridColour(patch.background);
        if (normalised === null) return { code: 'invalid-colour', detail: 'background', message: `${patch.background} is not a valid fill colour.` };
        patch = { ...patch, background: normalised };
      }
      if (patch.text_color !== undefined) {
        const normalised = normalizeGridColour(patch.text_color);
        if (normalised === null) return { code: 'invalid-colour', detail: 'text_color', message: `${patch.text_color} is not a valid font colour.` };
        patch = { ...patch, text_color: normalised };
      }
      if (patch.border !== undefined && !isGridBorder(patch.border)) {
        return { code: 'invalid-border', detail: String(patch.border), message: `Unknown border style: ${String(patch.border)}.` };
      }
      if (patch.numberFormatCode !== undefined) {
        const check = checkGridNumberFormatCode(patch.numberFormatCode);
        if (!check.valid) {
          return { code: 'invalid-number-format', detail: check.error, message: describeGridNumberFormatCodeError(check.error) };
        }
        patch = { ...patch, numberFormatCode: check.code };
      }
      const updatedCells = { ...cells };
      for (const coord of coords) updatedCells[coord] = { ...(updatedCells[coord] ?? { value:'' }), ...patch };
      setValidationError(null);
      persistCellChanges(updatedCells, coords);
      return null;
    },
    [cells, selectionRanges, tableObj, primaryTableId, canEditCoordinates, persistCellChanges],
  );

  /**
   * Applies a complete standard number-format operation to the selection. Both halves of
   * the operation (semantic type and format code) come from one canonical preset list, so
   * the toolbar and the dialog cannot store different cells for the same button.
   */
  const applyNumberFormatToSelection = useCallback(
    (id: GridNumberFormatId) => {
      const patch = gridNumberFormatPatch(id);
      if (patch.numberFormatCode !== undefined) {
        const check = checkGridNumberFormatCode(patch.numberFormatCode);
        if (!check.valid) {
          setValidationError(describeGridNumberFormatCodeError(check.error));
          return;
        }
      }
      setValidationError(applyReviewedFormatToSelection(patch)?.message ?? null);
    },
    [applyReviewedFormatToSelection],
  );

  /** Paints a structured table's visible style theme onto its cells as one reviewable edit. */
  const applyTableStyleToSelection = useCallback(
    (tableId: string, theme: GridStructuredTableTheme) => {
      const table = (activeSheetModel?.tables ?? []).find((candidate) => candidate.id === tableId);
      if (!table || !tableObj || !primaryTableId) return;
      const coordinates = gridRangeCoordinates(table.range);
      if (!canEditCoordinates(coordinates)) return;
      try {
        const themed: GridStructuredTable = { ...table, styleTheme: theme };
        const updatedCells = gridStructuredTableStylePatch(themed, cells);
        persistCellChanges(updatedCells, coordinates, {
          tables: (activeSheetModel?.tables ?? []).map((candidate) => (candidate.id === tableId ? themed : candidate)),
        });
        setValidationError(null);
      } catch (error) {
        setValidationError(error instanceof Error ? error.message : 'The table style could not be applied.');
      }
    },
    [activeSheetModel?.tables, canEditCoordinates, cells, persistCellChanges, primaryTableId, tableObj],
  );


  const selectionController = useGridSelectionController({
    selectedCell, setSelectedCell, selectionAnchor, setSelectionAnchor, selectionFocus, setSelectionFocus,
    setDisjointRanges, selectedRange, isEditing, setIsEditing, formulaInput, handleCommitValue,
    isRangeSelecting, setIsRangeSelecting, colCount, rowCount, onSelectSelectionType,
  });

  const rangeEditing = useGridRangeEditingController({
    document, activeSheetModel, hasActiveTable: !!tableObj && !!primaryTableId, cells, selectedCell, selectedRange,
    selectionRanges, setSelectedCell, setDisjointRanges, setValidationError, canEditCoordinates, persistCellChanges,
    prepareFormulaForEvaluation, formulaEvaluationContext, shouldRecalculateDependent, updateActiveSheet,
  });

  const advanced = useGridAdvancedController({
    document, activeSheetModel, cells, rowCount, colCount, selectionRanges, selectedRange,
    hasActiveTable: !!tableObj && !!primaryTableId, setSelectedCell, setSelectionAnchor, setSelectionFocus,
    setDisjointRanges, setValidationError, onSelectSelectionType, onUpdateDocument, updateActiveSheet,
    canEditCoordinates, pushUndo: rangeEditing.pushUndo, persistCellChanges, resizeActiveTable,
  });

  const handleKeyDownGrid = useGridKeyboardController({
    isEditing, selectedCell, selectionAnchor, formulaInput, cells, rowCount, colCount,
    setFormulaInput, setIsEditing, setSelectedCell, setSelectionAnchor, setSelectionFocus,
    handleCommitValue, onGlobalUndo, onGlobalRedo,
    handleUndo: rangeEditing.handleUndo, handleRedo: rangeEditing.handleRedo,
    copySelection: rangeEditing.copySelection, cutSelection: rangeEditing.cutSelection,
    pasteSelection: rangeEditing.pasteSelection, pushUndo: rangeEditing.pushUndo,
    selectAll: selectionController.handleSelectAll,
    clearSelection: rangeEditing.clearSelection,
    clearDisjointRanges: rangeEditing.clearDisjointSelections,
  });


  return {
    workbookSheets,
    activeSheetId,
    setActiveSheetId,
    activeSheetModel,
    primaryTableId,
    tableObj,
    cells,
    rowCount,
    colCount,
    selectedCell,
    setSelectedCell,
    selectionAnchor,
    setSelectionAnchor,
    selectionFocus,
    setSelectionFocus,
    selectedRange,
    disjointRanges,
    selectionRanges,
    formulaInput,
    setFormulaInput,
    isEditing,
    setIsEditing,
    inlineInputRef,
    validationError,
    setValidationError,
    draggedCoord,
    setDraggedCoord,
    draggedAsFill,
    setDraggedAsFill,
    dragOverCoord,
    setDragOverCoord,
    clipboard: rangeEditing.clipboard,
    updateActiveSheet,
    resizeActiveTable,
    handleCommitValue,
    persistCellChanges,
    // Exposed for the formula assistant's bounded output check, which must evaluate through exactly
    // the same preparation and context the commit path uses.
    prepareFormulaForEvaluation,
    formulaEvaluationContext,
    handleImportCells,
    handleApplyScenario,
    applyFormatToSelection,
    applyReviewedFormatToSelection,
    applyNumberFormatToSelection,
    applyTableStyleToSelection,
    moveActiveCell: selectionController.moveActiveCell,
    handleCellClick: selectionController.handleCellClick,
    handleCellMouseDown: selectionController.handleCellMouseDown,
    handleCellMouseEnter: selectionController.handleCellMouseEnter,
    handleSelectColumn: selectionController.handleSelectColumn,
    handleSelectRow: selectionController.handleSelectRow,
    handleSelectAll: selectionController.handleSelectAll,
    copySelection: rangeEditing.copySelection,
    cutSelection: rangeEditing.cutSelection,
    pasteSelection: rangeEditing.pasteSelection,
    clearSelection: rangeEditing.clearSelection,
    handleSetRichTextCell: rangeEditing.handleSetRichTextCell,
    addCurrentSelectionToDisjoint: rangeEditing.addCurrentSelectionToDisjoint,
    clearDisjointSelections: rangeEditing.clearDisjointSelections,
    handleFillSelection: rangeEditing.handleFillSelection,
    handleUndo: rangeEditing.handleUndo,
    handleRedo: rangeEditing.handleRedo,
    applyPasteSpecialOptions: rangeEditing.applyPasteSpecialOptions,
    previewPasteSpecial: rangeEditing.previewPasteSpecial,
    handleAutoFillCommit: rangeEditing.handleAutoFillCommit,
    handleMergeSelection: rangeEditing.handleMergeSelection,
    handleUnmergeSelection: rangeEditing.handleUnmergeSelection,
    toggleCircleInvalid: rangeEditing.toggleCircleInvalid,
    isCirclingInvalid: rangeEditing.isCirclingInvalid,
    invalidCoords: rangeEditing.invalidCoords,
    viewMode: activeSheetModel?.viewMode ?? 'normal',
    setViewMode: advanced.setViewMode,
    zoom: activeSheetModel?.zoom ?? 100,
    setZoom: advanced.setZoom,
    selectGridRanges: advanced.selectGridRanges,
    handleGoTo: advanced.handleGoTo,
    handleGoToSpecial: advanced.handleGoToSpecial,
    handleTransferSelection: advanced.handleTransferSelection,
    handleFlashFill: advanced.handleFlashFill,
    handleStructureEdit: advanced.handleStructureEdit,
    handleSetAxisHidden: advanced.handleSetAxisHidden,
    handleGroupAxis: advanced.handleGroupAxis,
    handlePatchWorkbook: advanced.handlePatchWorkbook,
    formatPainterSource: rangeEditing.formatPainterSource,
    handleApplyCellStyle: rangeEditing.handleApplyCellStyle,
    handleToggleFormatPainter: rangeEditing.handleToggleFormatPainter,
    handleApplyFormatPainter: rangeEditing.handleApplyFormatPainter,
    handleAutoFitSelection: rangeEditing.handleAutoFitSelection,
    handleAxisResize: rangeEditing.handleAxisResize,
    handleAxisAutoFit: rangeEditing.handleAxisAutoFit,
    handleAddSheet,
    handleRenameSheet,
    handleDuplicateSheet,
    handleDeleteSheet,
    handleReorderSheet,
    handleChangeTabColor,
    handleSetSheetVisibility,
    handleKeyDownGrid,
  };
}

export type GridStateController = ReturnType<typeof useGridState>;
