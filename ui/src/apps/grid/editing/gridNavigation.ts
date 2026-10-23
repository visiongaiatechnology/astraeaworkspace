// STATUS: DIAMANT VGT SUPREME
// Astraea Grid single navigation decision point. Pure and React-free on purpose:
// navigation mode vs. edit mode, selection anchoring, IME safety and clipboard
// shortcuts are resolved here once and only consumed by the keyboard controller.

import type { GridCell } from '../../../shared/contracts/workspace';
import { toA1 } from '../formulas/formula';
import { parseCoord } from '../compat/gridUtils';

/** Bounded scan ceiling: 1,048,576 rows + 16,384 columns plus head-room. */
const MAX_EDGE_STEPS = 1_065_000;
const DEFAULT_PAGE_ROWS = 25;

export interface GridKeyDescriptor {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  /** Browser/IME composition flag. A composing keystroke is never a navigation intent. */
  readonly isComposing?: boolean;
}

export type GridNavigationCommand = 'undo' | 'redo' | 'copy' | 'cut' | 'paste' | 'paste-values' | 'select-all';

export interface GridNavigationContext {
  readonly isEditing: boolean;
  readonly selectedCell: string;
  readonly selectionAnchor: string;
  readonly rowCount: number;
  readonly colCount: number;
  readonly cells: Readonly<Record<string, GridCell>>;
  readonly pageRows?: number;
}

export interface GridNavigationOutcome {
  /** false means: leave every piece of Grid state untouched. */
  readonly handled: boolean;
  readonly selectedCell: string;
  readonly selectionAnchor: string;
  readonly selectionFocus: string;
  readonly isEditing: boolean;
  /** Commit the pending inline/formula-bar input before the selection moves. */
  readonly commitPendingEdit: boolean;
  readonly clearSelectionContents: boolean;
  readonly formulaSeed: string | null;
  /** Escape cancelled an edit: the input must be re-synchronised from the cell. */
  readonly restoreInputFromCell: boolean;
  readonly command: GridNavigationCommand | null;
}

const UNHANDLED: Omit<GridNavigationOutcome, 'selectedCell' | 'selectionAnchor' | 'selectionFocus' | 'isEditing'> = {
  handled: false,
  commitPendingEdit: false,
  clearSelectionContents: false,
  formulaSeed: null,
  restoreInputFromCell: false,
  command: null,
};

function unhandled(context: GridNavigationContext): GridNavigationOutcome {
  return {
    ...UNHANDLED,
    selectedCell: context.selectedCell,
    selectionAnchor: context.selectionAnchor,
    selectionFocus: context.selectedCell,
    isEditing: context.isEditing,
  };
}

function clampIndex(value: number, upperBound: number): number {
  return Math.max(0, Math.min(Math.max(0, upperBound), value));
}

function moveTo(context: GridNavigationContext, colIdx: number, rowIdx: number, extend: boolean): GridNavigationOutcome {
  const coord = toA1(clampIndex(colIdx, context.colCount - 1), clampIndex(rowIdx, context.rowCount - 1));
  return {
    ...UNHANDLED,
    handled: true,
    selectedCell: coord,
    selectionAnchor: extend ? context.selectionAnchor : coord,
    selectionFocus: coord,
    isEditing: false,
  };
}

function beginEdit(context: GridNavigationContext, seed: string | null): GridNavigationOutcome {
  return {
    ...UNHANDLED,
    handled: true,
    selectedCell: context.selectedCell,
    selectionAnchor: context.selectionAnchor,
    selectionFocus: context.selectedCell,
    isEditing: true,
    formulaSeed: seed,
  };
}

function command(context: GridNavigationContext, name: GridNavigationCommand): GridNavigationOutcome {
  return {
    ...UNHANDLED,
    handled: true,
    selectedCell: context.selectedCell,
    selectionAnchor: context.selectionAnchor,
    selectionFocus: context.selectedCell,
    isEditing: context.isEditing,
    command: name,
  };
}

function commitAndMove(context: GridNavigationContext, dCol: number, dRow: number): GridNavigationOutcome {
  const from = parseCoord(context.selectedCell);
  return {
    ...moveTo(context, from.colIdx + dCol, from.rowIdx + dRow, false),
    commitPendingEdit: true,
  };
}

function isBlankCell(cells: Readonly<Record<string, GridCell>>, coord: string): boolean {
  const cell = cells[coord];
  if (!cell) return true;
  if (cell.formula) return false;
  const value = cell.value;
  return value === '' || value === null || value === undefined;
}

/**
 * Excel parity for Ctrl+Arrow: jump across the contiguous non-empty block of the
 * current cell; if the neighbour is empty, jump to the next non-empty cell.
 * Bounded by MAX_EDGE_STEPS so user data can never cause an unbounded loop.
 */
export function resolveGridEdgeTarget(
  cells: Readonly<Record<string, GridCell>>,
  coord: string,
  dCol: number,
  dRow: number,
  rowCount: number,
  colCount: number,
): string {
  const start = parseCoord(coord);
  let colIdx = start.colIdx;
  let rowIdx = start.rowIdx;
  const startedBlank = isBlankCell(cells, toA1(colIdx, rowIdx));
  let steps = 0;
  while (steps < MAX_EDGE_STEPS) {
    const nextCol = clampIndex(colIdx + dCol, colCount - 1);
    const nextRow = clampIndex(rowIdx + dRow, rowCount - 1);
    if (nextCol === colIdx && nextRow === rowIdx) break;
    colIdx = nextCol;
    rowIdx = nextRow;
    steps += 1;
    if (isBlankCell(cells, toA1(colIdx, rowIdx)) !== startedBlank) break;
  }
  return toA1(colIdx, rowIdx);
}

/** Last used column in a row (End) and the last used cell of the sheet (Ctrl+End). */
export function resolveGridUsedBounds(cells: Readonly<Record<string, GridCell>>): { lastCol: number; lastRow: number; lastColInRow: (rowIdx: number) => number } {
  let lastCol = 0;
  let lastRow = 0;
  const perRow = new Map<number, number>();
  for (const coord of Object.keys(cells)) {
    if (isBlankCell(cells, coord)) continue;
    const parsed = parseCoord(coord);
    if (parsed.colIdx < 0 || parsed.rowIdx < 0) continue;
    if (parsed.colIdx > lastCol) lastCol = parsed.colIdx;
    if (parsed.rowIdx > lastRow) lastRow = parsed.rowIdx;
    const rowMax = perRow.get(parsed.rowIdx);
    if (rowMax === undefined || parsed.colIdx > rowMax) perRow.set(parsed.rowIdx, parsed.colIdx);
  }
  return { lastCol, lastRow, lastColInRow: (rowIdx: number) => perRow.get(rowIdx) ?? 0 };
}

function arrowOutcome(
  context: GridNavigationContext,
  from: { readonly colIdx: number; readonly rowIdx: number },
  dCol: number,
  dRow: number,
  jumpToEdge: boolean,
  extend: boolean,
): GridNavigationOutcome {
  const target = jumpToEdge
    ? resolveGridEdgeTarget(context.cells, context.selectedCell, dCol, dRow, context.rowCount, context.colCount)
    : toA1(clampIndex(from.colIdx + dCol, context.colCount - 1), clampIndex(from.rowIdx + dRow, context.rowCount - 1));
  const parsed = parseCoord(target);
  return moveTo(context, parsed.colIdx, parsed.rowIdx, extend);
}

/**
 * Resolves one key press into a fully described navigation outcome.
 * The controller must not re-interpret keys on its own; every branch ends in a
 * concrete outcome or in `handled: false`.
 */
export function resolveGridNavigation(key: GridKeyDescriptor, context: GridNavigationContext): GridNavigationOutcome {
  // A composition (IME) keystroke belongs to the input method, never to the grid.
  if (key.isComposing) return unhandled(context);

  const ctrl = key.ctrlKey === true || key.metaKey === true;
  const shift = key.shiftKey === true;
  const pageRows = Math.max(1, Math.floor(context.pageRows ?? DEFAULT_PAGE_ROWS));

  if (context.isEditing) {
    switch (key.key) {
      case 'Enter':
        return commitAndMove(context, 0, shift ? -1 : 1);
      case 'Tab':
        return commitAndMove(context, shift ? -1 : 1, 0);
      case 'Escape':
        return { ...unhandled(context), handled: true, isEditing: false, restoreInputFromCell: true };
      default:
        return unhandled(context);
    }
  }

  if (ctrl) {
    switch (key.key.toLowerCase()) {
      case 'z':
        return command(context, shift ? 'redo' : 'undo');
      case 'y':
        return command(context, 'redo');
      case 'c':
        return command(context, 'copy');
      case 'x':
        return command(context, 'cut');
      case 'v':
        return command(context, shift ? 'paste-values' : 'paste');
      case 'a':
        return command(context, 'select-all');
      default:
        // Not a clipboard/undo shortcut: Ctrl+Home, Ctrl+End and Ctrl+Arrow are
        // navigation and must stay reachable with the modifier held.
        break;
    }
  } else if (key.altKey === true) {
    return unhandled(context);
  }

  const from = parseCoord(context.selectedCell);
  const used = resolveGridUsedBounds(context.cells);

  switch (key.key) {
    case 'Tab':
      // Navigation mode: Tab moves one cell to the right (Shift+Tab to the left).
      return moveTo(context, from.colIdx + (shift ? -1 : 1), from.rowIdx, false);
    case 'ArrowUp':
      return arrowOutcome(context, from, 0, -1, ctrl, shift);
    case 'ArrowDown':
      return arrowOutcome(context, from, 0, 1, ctrl, shift);
    case 'ArrowLeft':
      return arrowOutcome(context, from, -1, 0, ctrl, shift);
    case 'ArrowRight':
      return arrowOutcome(context, from, 1, 0, ctrl, shift);
    case 'PageDown':
      return moveTo(context, from.colIdx, from.rowIdx + pageRows, shift);
    case 'PageUp':
      return moveTo(context, from.colIdx, from.rowIdx - pageRows, shift);
    case 'Home':
      return ctrl ? moveTo(context, 0, 0, shift) : moveTo(context, 0, from.rowIdx, shift);
    case 'End':
      return ctrl
        ? moveTo(context, used.lastCol, used.lastRow, shift)
        : moveTo(context, used.lastColInRow(from.rowIdx), from.rowIdx, shift);
    case 'Enter':
      /**
       * GR-003 (M1) — Enter continues **downward**, it does not open an editor.
       *
       * Measured with the DOM witness `gridSheetDirectEntryWitness`: Enter in navigation mode
       * called `beginEdit`, so a user who clicked a cell and pressed Enter started editing the
       * next row instead of moving to it — the opposite of the Excel/Calc default direction.
       * Editing mode is handled earlier in this resolver: there Enter commits and moves down.
       * F2 remains the "edit this cell" key.
       *
       * The `shift` modifier only selects the **direction** (up), it must not extend the
       * selection: measured by `gridKeyboardOnlyM1`, passing `shift` as the `extend` flag turned
       * Shift+Enter into the range `A1:A2`. Range extension stays with Shift+Arrow.
       */
      return moveTo(context, from.colIdx, from.rowIdx + (shift ? -1 : 1), false);
    case 'F2':
      return beginEdit(context, null);
    case 'Delete':
    case 'Backspace':
      return { ...unhandled(context), handled: true, clearSelectionContents: true };
    default:
      // A plain printable character starts an edit; modified characters never do.
      if (!ctrl && key.key.length === 1) return beginEdit(context, key.key);
      return unhandled(context);
  }
}
