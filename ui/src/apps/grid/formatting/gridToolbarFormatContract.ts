// STATUS: DIAMANT — one explicit contract between the shell toolbar and the Grid formatter.
//
// The adaptive shell toolbar lives outside the Grid route. It therefore cannot call the Grid
// state hook directly; it receives a mutable action handle through `AppWorkspaceView` →
// `GridSheet`. This file is the single definition of that handle, so the shell never learns
// Grid internals and the Grid never reads shell state.
//
// The **quick formats** are a deliberate subset of `GRID_TOOLBAR_NUMBER_FORMAT_IDS`; the
// **preset catalogue** is `GRID_NUMBER_FORMAT_PRESETS` (both live in `gridNumberFormat.ts`).
import type { GridNumberFormatId } from './gridNumberFormat';

/** Four always-visible one-click formats (number, currency, percent, date). */
export type GridToolbarQuickFormat = 'number' | 'currency' | 'percent' | 'date';

/**
 * Actions the shell may invoke on the active Grid worksheet. Both operations are complete
 * number-format operations (semantic type + format code) through the canonical state action
 * `applyNumberFormatToSelection`; no shell-side format patch is assembled.
 */
export interface GridToolbarFormatActions {
  readonly applyQuickFormat: (format: GridToolbarQuickFormat) => void;
  readonly applyNumberFormat: (id: GridNumberFormatId) => void;
}

/** The four quick formats are exactly this ordered subset of the canonical toolbar ids. */
export const GRID_TOOLBAR_QUICK_FORMATS: readonly GridToolbarQuickFormat[] = [
  'number',
  'currency',
  'percent',
  'date',
] as const;
