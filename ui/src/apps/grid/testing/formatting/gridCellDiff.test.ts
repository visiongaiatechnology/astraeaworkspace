// Astraea Grid — WOM/Persistenz: a formatting edit must be a *real* document change.
//
// The document history, the collaboration diff and every undo stack are driven by the
// changed-coordinate list. Before this leaf existed the list was computed from `value` and
// `formula` only, so a colour, border, number-format or style edit produced an empty diff:
// the cell was written, but it was invisible to history and could not be undone.

import { describe, expect, it } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import { collectChangedGridCoordinates, collectContentOnlyChangedGridCoordinates, gridCellSignature, gridCellsDiffer } from '../../formatting/gridCellDiff';

describe('Grid cell diff (WOM/Persistenz)', () => {
  it('treats a formatting-only change as a change', () => {
    const before: GridCell = { value: 42 };
    expect(gridCellsDiffer(before, { value: 42, bold: true })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, background: '#123456' })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, text_color: '#ffffff' })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, border: 'outline' })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, numberFormatCode: '#,##0.00' })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, format: 'currency' })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, fontFamily: 'Georgia' })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, fontSize: 18 })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, wrap: true })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, alignment: 'center' })).toBe(true);
    expect(gridCellsDiffer(before, { value: 42, locked: true })).toBe(true);
  });

  it('does not report an unchanged cell', () => {
    const cell: GridCell = { value: 'x', bold: true, background: '#fff' };
    expect(gridCellsDiffer(cell, { ...cell })).toBe(false);
    expect(gridCellsDiffer(undefined, undefined)).toBe(false);
    expect(gridCellSignature(undefined)).toBe('');
    // A key that is merely re-declared as undefined is not a change.
    expect(gridCellsDiffer({ value: 1 }, { value: 1, formula: undefined })).toBe(false);
  });

  it('separates a real content change from a formatting change', () => {
    expect(gridCellsDiffer({ value: 1 }, { value: 2 })).toBe(true);
    expect(gridCellsDiffer({ value: 1 }, { value: 1, formula: '=A2' })).toBe(true);
    expect(gridCellsDiffer({ value: 1 }, { value: 1, dataType: 'integer' })).toBe(true);
    expect(gridCellsDiffer({ value: 1 }, { value: 1, richTextRuns: [{ text: 'a', bold: true }] })).toBe(true);
  });

  it('collects exactly the coordinates that changed, including added and removed ones', () => {
    const before: Record<string, GridCell> = {
      A1: { value: 'keep' },
      A2: { value: 1 },
      A3: { value: 'gone' },
    };
    const after: Record<string, GridCell> = {
      A1: { value: 'keep' },
      A2: { value: 1, bold: true },
      A4: { value: 'new' },
    };
    expect(collectChangedGridCoordinates(before, after)).toEqual(['A2', 'A3', 'A4']);
  });

  it('is driven by every persisted field, not by value and formula alone', () => {
    // This is the regression the previous implementation had: a style-only edit produced no
    // changed coordinate at all, so `buildGridHistoryEntries` recorded nothing.
    const before: Record<string, GridCell> = { A1: { value: 10 } };
    const after: Record<string, GridCell> = { A1: { value: 10, background: '#0f172a', text_color: '#e2e8f0', bold: true } };
    expect(collectContentOnlyChangedGridCoordinates(before, after)).toEqual([]);
    expect(collectChangedGridCoordinates(before, after)).toEqual(['A1']);
  });

  it('agrees with the content-only definition whenever the content really changed', () => {
    const before: Record<string, GridCell> = { A1: { value: 1 }, A2: { value: 'x' } };
    const after: Record<string, GridCell> = { A1: { value: 2 }, A2: { value: 'x' } };
    expect(collectChangedGridCoordinates(before, after)).toEqual(collectContentOnlyChangedGridCoordinates(before, after));
  });

  it('produces a deterministic signature regardless of key order', () => {
    const a: GridCell = { value: 1, bold: true, background: '#fff', sparkline: [1, 2, 3] };
    const b: GridCell = { background: '#fff', sparkline: [1, 2, 3], bold: true, value: 1 };
    expect(gridCellSignature(a)).toBe(gridCellSignature(b));
    expect(gridCellSignature(a)).not.toBe(gridCellSignature({ ...a, background: '#000' }));
    // A different order inside an array is a different value.
    expect(gridCellSignature({ value: 1, sparkline: [1, 2] })).not.toBe(gridCellSignature({ value: 1, sparkline: [2, 1] }));
  });
});
