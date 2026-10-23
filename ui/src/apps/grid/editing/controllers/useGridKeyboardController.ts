// STATUS: DIAMANT VGT SUPREME
// Astraea Grid keyboard controller. The controller itself owns no key semantics:
// every decision comes from the pure navigation resolver.

import { isImeCompositionEvent } from '../../../../shared/accessibility/accessibilityPlatform';
import { useCallback, type KeyboardEvent } from 'react';
import type { GridCell } from '../../../../shared/contracts/workspace';
import { resolveGridNavigation, type GridNavigationCommand } from '../gridNavigation';

interface KeyboardControllerArgs {
  isEditing: boolean;
  selectedCell: string;
  selectionAnchor: string;
  formulaInput: string;
  cells: Record<string, GridCell>;
  rowCount: number;
  colCount: number;
  pageRows?: number;
  setFormulaInput: (value: string) => void;
  setIsEditing: (value: boolean) => void;
  setSelectedCell: (coord: string) => void;
  setSelectionAnchor: (coord: string) => void;
  setSelectionFocus: (coord: string) => void;
  handleCommitValue: (coord: string, rawInput: string) => Promise<void>;
  onGlobalUndo?: () => boolean;
  onGlobalRedo?: () => boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: (mode?: 'all' | 'values' | 'formats' | 'transpose') => Promise<unknown>;
  /** Ctrl+A selects the whole active table through the same selection state as the corner. */
  selectAll?: () => void;
  pushUndo: (cells: Record<string, GridCell>) => void;
  clearSelection: (mode?: 'all' | 'contents' | 'formats') => void;
  /**
   * GR-002/GR-004 (M1) — Escape also drops the additive (Ctrl-click) extra ranges.
   *
   * Measured by `gridMultiRangeSelection`: a click reset them, Escape did not, so a keyboard user
   * stayed in a stale multi-range selection. Clearing them is a pure selection action and runs
   * before the resolver, which keeps handling the edit/dismiss semantics of Escape.
   */
  clearDisjointRanges?: () => void;
}

export function useGridKeyboardController(args: KeyboardControllerArgs) {
  return useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && !args.isEditing) args.clearDisjointRanges?.();
    const outcome = resolveGridNavigation(
      {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        isComposing: isImeCompositionEvent({ isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode, key: event.key }),
      },
      {
        isEditing: args.isEditing,
        selectedCell: args.selectedCell,
        selectionAnchor: args.selectionAnchor,
        rowCount: args.rowCount,
        colCount: args.colCount,
        cells: args.cells,
        pageRows: args.pageRows,
      },
    );

    if (!outcome.handled) return;
    event.preventDefault();

    const runCommand = (command: GridNavigationCommand): void => {
      switch (command) {
        case 'undo':
          if (!(args.onGlobalUndo?.())) args.handleUndo();
          return;
        case 'redo':
          if (!(args.onGlobalRedo?.())) args.handleRedo();
          return;
        case 'copy':
          args.copySelection();
          return;
        case 'cut':
          args.cutSelection();
          return;
        case 'paste':
          void args.pasteSelection('all');
          return;
        case 'paste-values':
          void args.pasteSelection('values');
          return;
        case 'select-all':
          args.selectAll?.();
          return;
        default: {
          const exhaustive: never = command;
          throw new Error(`Unreachable Grid navigation command: ${String(exhaustive)}`);
        }
      }
    };

    if (outcome.command) {
      runCommand(outcome.command);
      return;
    }

    if (outcome.commitPendingEdit) void args.handleCommitValue(args.selectedCell, args.formulaInput);

    if (outcome.restoreInputFromCell) {
      const cell = args.cells[args.selectedCell];
      args.setFormulaInput(cell?.formula ?? String(cell?.value ?? ''));
    }

    if (outcome.clearSelectionContents) {
      args.pushUndo(args.cells);
      args.clearSelection('contents');
      args.setFormulaInput('');
    }

    if (outcome.formulaSeed !== null) args.setFormulaInput(outcome.formulaSeed);

    args.setIsEditing(outcome.isEditing);
    args.setSelectedCell(outcome.selectedCell);
    args.setSelectionAnchor(outcome.selectionAnchor);
    args.setSelectionFocus(outcome.selectionFocus);
  }, [args]);
}
