// STATUS: DIAMANT VGT SUPREME
// Astraea Grid navigation, clipboard-move and fill-handle decision tests.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import {
  resolveGridEdgeTarget,
  resolveGridNavigation,
  resolveGridUsedBounds,
  type GridNavigationContext,
} from '../../editing/gridNavigation';
import { applyGridClipboardPaste, captureGridClipboard, resolveGridPasteDestinations } from '../../editing/gridClipboard';
import { resolveGridFillDrop } from '../../editing/gridFillDrag';
import { executeAutoFill, shiftFormulaReferences } from '../../editing/gridAutoFill';

const context = (overrides: Partial<GridNavigationContext> = {}): GridNavigationContext => ({
  isEditing: false,
  selectedCell: 'B2',
  selectionAnchor: 'B2',
  rowCount: 25,
  colCount: 10,
  cells: {},
  pageRows: 25,
  ...overrides,
});

describe('Grid navigation decisions', () => {
  it('moves one cell right on Tab and left on Shift+Tab in navigation mode', () => {
    expect(resolveGridNavigation({ key: 'Tab' }, context()).selectedCell).toBe('C2');
    expect(resolveGridNavigation({ key: 'Tab', shiftKey: true }, context()).selectedCell).toBe('A2');
  });

  it('clamps Tab at the grid edge instead of leaving the grid', () => {
    const atLastColumn = resolveGridNavigation({ key: 'Tab' }, context({ selectedCell: 'J2' }));
    expect(atLastColumn.selectedCell).toBe('J2');
    expect(atLastColumn.handled).toBe(true);
  });

  it('extends the selection with Shift+Arrow while keeping the anchor', () => {
    const down = resolveGridNavigation({ key: 'ArrowDown', shiftKey: true }, context({ selectionAnchor: 'A1' }));
    expect(down.selectedCell).toBe('B3');
    expect(down.selectionAnchor).toBe('A1');
    expect(down.selectionFocus).toBe('B3');
  });

  it('collapses the selection back to the moved cell without Shift', () => {
    const down = resolveGridNavigation({ key: 'ArrowDown' }, context({ selectionAnchor: 'A1' }));
    expect(down.selectedCell).toBe('B3');
    expect(down.selectionAnchor).toBe('B3');
  });

  it('jumps to the block edge on Ctrl+Arrow', () => {
    const cells: Record<string, GridCell> = { A1: { value: 1 }, A2: { value: 2 }, A3: { value: 3 } };
    expect(resolveGridEdgeTarget(cells, 'A1', 0, 1, 25, 10)).toBe('A4');
    expect(resolveGridEdgeTarget(cells, 'A2', 0, -1, 25, 10)).toBe('A1');
    expect(resolveGridEdgeTarget({ A1: { value: 1 }, A5: { value: 2 } }, 'A1', 0, 1, 25, 10)).toBe('A2');
  });

  it('resolves Home, Ctrl+Home, End and Ctrl+End', () => {
    const cells: Record<string, GridCell> = { B2: { value: 1 }, D7: { value: 2 } };
    expect(resolveGridNavigation({ key: 'Home' }, context({ cells })).selectedCell).toBe('A2');
    expect(resolveGridNavigation({ key: 'Home', ctrlKey: true }, context({ cells })).selectedCell).toBe('A1');
    expect(resolveGridNavigation({ key: 'End' }, context({ cells })).selectedCell).toBe('B2');
    expect(resolveGridNavigation({ key: 'End', ctrlKey: true }, context({ cells })).selectedCell).toBe('D7');
    expect(resolveGridUsedBounds(cells)).toMatchObject({ lastCol: 3, lastRow: 6 });
  });

  it('pages by the viewport row count and reports the shift modifier', () => {
    expect(resolveGridNavigation({ key: 'PageDown' }, context()).selectedCell).toBe('B25');
    expect(resolveGridNavigation({ key: 'PageUp' }, context()).selectedCell).toBe('B1');
    const extended = resolveGridNavigation({ key: 'PageDown', shiftKey: true }, context({ selectionAnchor: 'A1' }));
    expect(extended.selectionAnchor).toBe('A1');
    expect(extended.selectedCell).toBe('B25');
  });

  it('commits the edit and moves on Enter/Tab while editing', () => {
    const enter = resolveGridNavigation({ key: 'Enter' }, context({ isEditing: true }));
    expect(enter.commitPendingEdit).toBe(true);
    expect(enter.isEditing).toBe(false);
    expect(enter.selectedCell).toBe('B3');

    const shiftEnter = resolveGridNavigation({ key: 'Enter', shiftKey: true }, context({ isEditing: true }));
    expect(shiftEnter.selectedCell).toBe('B1');

    const tab = resolveGridNavigation({ key: 'Tab' }, context({ isEditing: true }));
    expect(tab.commitPendingEdit).toBe(true);
    expect(tab.selectedCell).toBe('C2');
  });

  it('cancels an edit on Escape and asks for the input to be re-synchronised', () => {
    const escape = resolveGridNavigation({ key: 'Escape' }, context({ isEditing: true }));
    expect(escape.isEditing).toBe(false);
    expect(escape.restoreInputFromCell).toBe(true);
    expect(escape.commitPendingEdit).toBe(false);
  });

  it('starts editing with the typed character as seed and never double interprets it', () => {
    const typed = resolveGridNavigation({ key: 'x' }, context());
    expect(typed.isEditing).toBe(true);
    expect(typed.formulaSeed).toBe('x');
    expect(typed.selectedCell).toBe('B2');
  });

  it('clears the selection contents on Delete and Backspace only', () => {
    expect(resolveGridNavigation({ key: 'Delete' }, context()).clearSelectionContents).toBe(true);
    expect(resolveGridNavigation({ key: 'Backspace' }, context()).clearSelectionContents).toBe(true);
    expect(resolveGridNavigation({ key: 'Enter' }, context()).clearSelectionContents).toBe(false);
  });

  it('moves the selection down on Enter and opens the editor on F2 (GR-003)', () => {
    // Excel/Calc default direction: Enter in navigation mode continues in the same column,
    // one row down. It used to open an editor, which is what F2 and the double click are for.
    const enter = resolveGridNavigation({ key: 'Enter' }, context());
    expect(enter.isEditing).toBe(false);
    expect(enter.selectedCell).toBe('B3');
    expect(enter.formulaSeed).toBeNull();
    // Shift+Enter is the opposite direction, but a **move**, not a range extension.
    const shiftEnterNav = resolveGridNavigation({ key: 'Enter', shiftKey: true }, context());
    expect(shiftEnterNav.selectedCell).toBe('B1');
    expect(shiftEnterNav.selectionAnchor, 'Shift+Enter darf die Auswahl nicht erweitern').toBe('B1');
    // Editing mode still commits and moves down, so the workflow does not lose a keystroke.
    expect(resolveGridNavigation({ key: 'Enter' }, context({ isEditing: true })).commitPendingEdit).toBe(true);
    // F2 is the explicit "edit this cell" key.
    expect(resolveGridNavigation({ key: 'F2' }, context()).isEditing).toBe(true);
  });

  it('maps clipboard shortcuts and ignores unknown or modified combinations', () => {
    expect(resolveGridNavigation({ key: 'z', ctrlKey: true }, context()).command).toBe('undo');
    expect(resolveGridNavigation({ key: 'Z', ctrlKey: true, shiftKey: true }, context()).command).toBe('redo');
    expect(resolveGridNavigation({ key: 'y', metaKey: true }, context()).command).toBe('redo');
    expect(resolveGridNavigation({ key: 'c', ctrlKey: true }, context()).command).toBe('copy');
    expect(resolveGridNavigation({ key: 'x', ctrlKey: true }, context()).command).toBe('cut');
    expect(resolveGridNavigation({ key: 'v', ctrlKey: true }, context()).command).toBe('paste');
    expect(resolveGridNavigation({ key: 'v', ctrlKey: true, shiftKey: true }, context()).command).toBe('paste-values');
    expect(resolveGridNavigation({ key: 'a', ctrlKey: true }, context()).command).toBe('select-all');
    expect(resolveGridNavigation({ key: 's', ctrlKey: true }, context()).handled).toBe(false);
    expect(resolveGridNavigation({ key: 'ArrowDown', altKey: true }, context()).handled).toBe(false);
    expect(resolveGridNavigation({ key: 'F5' }, context()).handled).toBe(false);
  });

  it('never interprets an IME composition keystroke as navigation', () => {
    expect(resolveGridNavigation({ key: 'Enter', isComposing: true }, context()).handled).toBe(false);
    expect(resolveGridNavigation({ key: 'Tab', isComposing: true }, context({ isEditing: true })).handled).toBe(false);
  });
});

describe('Grid clipboard move semantics', () => {
  const cells: Record<string, GridCell> = {
    A1: { value: 1 },
    A2: { value: 2 },
    C1: { value: 'keep' },
  };

  it('empties the source of a cut payload after pasting elsewhere', () => {
    const payload = captureGridClipboard(cells, 'A1:A2', true);
    const outcome = applyGridClipboardPaste({ cells, payload, targetAnchor: 'C3', mode: 'all' });
    expect(outcome.cells.A1).toBeUndefined();
    expect(outcome.cells.A2).toBeUndefined();
    expect(outcome.cells.C3?.value).toBe(1);
    expect(outcome.cells.C4?.value).toBe(2);
    expect(outcome.cells.C1?.value).toBe('keep');
    expect(outcome.clipboardAfter).toBeNull();
    expect(outcome.changedCoords).toContain('A1');
    expect(outcome.changedCoords).toContain('C3');
  });

  it('keeps the source of a copy payload and keeps the clipboard available', () => {
    const payload = captureGridClipboard(cells, 'A1:A2', false);
    const outcome = applyGridClipboardPaste({ cells, payload, targetAnchor: 'C3', mode: 'all' });
    expect(outcome.cells.A1?.value).toBe(1);
    expect(outcome.cells.A2?.value).toBe(2);
    expect(outcome.cells.C3?.value).toBe(1);
    expect(outcome.clipboardAfter?.isCut).toBe(false);
  });

  it('does not clear a cut source that is also a paste target', () => {
    const payload = captureGridClipboard(cells, 'A1:A2', true);
    const outcome = applyGridClipboardPaste({ cells, payload, targetAnchor: 'A1', mode: 'all' });
    expect(outcome.cells.A1?.value).toBe(1);
    expect(outcome.cells.A2?.value).toBe(2);
    expect(outcome.changedCoords).toEqual([]);
  });

  it('resolves destinations including transpose', () => {
    const payload = captureGridClipboard(cells, 'A1:A2', false);
    expect([...resolveGridPasteDestinations(payload, 'B1', 'all').values()]).toEqual(['B1', 'B2']);
    expect([...resolveGridPasteDestinations(payload, 'B1', 'transpose').values()]).toEqual(['B1', 'C1']);
  });

  it('shifts relative formula references on paste and keeps absolute anchors', () => {
    const withFormula: Record<string, GridCell> = { A1: { formula: '=B1+$C$1', value: 3 } };
    const payload = captureGridClipboard(withFormula, 'A1', false);
    const outcome = applyGridClipboardPaste({ cells: withFormula, payload, targetAnchor: 'C3', mode: 'all' });
    expect(outcome.cells.C3?.formula).toBe('=D3+$C$1');
  });

  it('pastes only values in values mode', () => {
    const source: Record<string, GridCell> = { A1: { formula: '=1+1', value: 2, bold: true } };
    const payload = captureGridClipboard(source, 'A1', false);
    const outcome = applyGridClipboardPaste({ cells: {}, payload, targetAnchor: 'D4', mode: 'values' });
    expect(outcome.cells.D4?.value).toBe(2);
    expect(outcome.cells.D4?.formula).toBeUndefined();
    expect(outcome.cells.D4?.bold).toBeUndefined();
  });
});

describe('Grid fill handle decisions', () => {
  it('runs the series engine when the handle is dragged beyond the selection', () => {
    expect(resolveGridFillDrop({ dragCoord: 'A1', dragAsFill: true, targetCoord: 'A5', sourceRange: 'A1:A2', copyModifier: false }))
      .toEqual({ kind: 'fill', targetCoord: 'A5' });
  });

  it('rejects a fill that stays inside the selection instead of failing silently', () => {
    const resolution = resolveGridFillDrop({ dragCoord: 'A1', dragAsFill: true, targetCoord: 'A2', sourceRange: 'A1:A3', copyModifier: false });
    expect(resolution.kind).toBe('rejected');
    if (resolution.kind === 'rejected') expect(resolution.reason).toContain('Rand der Auswahl');
  });

  it('distinguishes move and copy transfers', () => {
    expect(resolveGridFillDrop({ dragCoord: 'A1', dragAsFill: false, targetCoord: 'C1', sourceRange: 'A1', copyModifier: false }))
      .toEqual({ kind: 'transfer', targetCoord: 'C1', mode: 'move' });
    expect(resolveGridFillDrop({ dragCoord: 'A1', dragAsFill: false, targetCoord: 'C1', sourceRange: 'A1', copyModifier: true }))
      .toEqual({ kind: 'transfer', targetCoord: 'C1', mode: 'copy' });
  });

  it('rejects drops without a drag source or onto the same cell', () => {
    expect(resolveGridFillDrop({ dragCoord: null, dragAsFill: true, targetCoord: 'A5', sourceRange: 'A1', copyModifier: false }).kind).toBe('rejected');
    expect(resolveGridFillDrop({ dragCoord: 'A1', dragAsFill: true, targetCoord: 'A1', sourceRange: 'A1', copyModifier: false }).kind).toBe('rejected');
  });
});

describe('Grid AutoFill formula shifting uses the canonical A1 shifter', () => {
  it('shifts relative references and keeps absolute anchors over a 200 row fill', () => {
    const cells: Record<string, GridCell> = { A1: { formula: '=B1*$C$1', value: 2 } };
    const result = executeAutoFill(['A1'], 'A201', cells, 'auto');
    expect(result.filledCoords).toHaveLength(200);
    expect(result.updatedCells.A201?.formula).toBe('=B201*$C$1');
  });

  it('never rewrites identifiers or text literals', () => {
    expect(shiftFormulaReferences('=LOG10(A1)', 1, 0)).toBe('=LOG10(A2)');
    expect(shiftFormulaReferences('="A1"&B1', 1, 0)).toBe('="A1"&B2');
  });

  it('reports #REF! instead of silently clamping to row 1', () => {
    expect(shiftFormulaReferences('=A1', -1, 0)).toBe('=#REF!');
    expect(shiftFormulaReferences('=A2', -1, 0)).toBe('=A1');
  });

  it('keeps the documented linear, growth, weekday and month series', () => {
    expect(executeAutoFill(['A1', 'A2'], 'A4', { A1: { value: 10 }, A2: { value: 20 } }, 'linear').updatedCells.A4?.value).toBe(40);
    expect(executeAutoFill(['A1', 'A2'], 'A3', { A1: { value: 2 }, A2: { value: 4 } }, 'growth').updatedCells.A3?.value).toBe(8);
    expect(executeAutoFill(['A1'], 'A2', { A1: { value: 'Monday' } }, 'auto').updatedCells.A2?.value).toBe('Tuesday');
    expect(executeAutoFill(['A1'], 'A2', { A1: { value: 'January' } }, 'auto').updatedCells.A2?.value).toBe('February');
  });
});
