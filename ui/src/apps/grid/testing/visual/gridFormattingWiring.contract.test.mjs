// Astraea Grid — source contract for the wiring that cannot be exercised headless.
//
// The border paint path lives inside Canvas2D/React render calls that need a DOM, and the
// state wiring lives inside a hook that needs a React runtime. Reading the sources and
// asserting on the *wiring* is the honest check available here; the pure decisions those
// call sites delegate to are covered by real unit tests.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

/** Removes block and line comments so a removed behaviour is not "found" in a comment. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const tableCanvas = stripComments(read('../../canvas/GridTableCanvas.tsx'));
const canvasRenderer = stripComments(read('../../canvas/gridVirtualCanvasRenderer.ts'));
const gridSheet = stripComments(read('../../GridSheet.tsx'));
const stateHook = stripComments(read('../../state/useGridState.ts'));
const panel = stripComments(read('../../formatting/GridFormattingPanel.tsx'));
const toolbar = stripComments(read('../../toolbar/GridFormulaBar.tsx'));
const formatContract = stripComments(read('../../formatting/gridToolbarFormatContract.ts'));
const adaptiveToolbar = stripComments(read('../../../../shell/adaptive-toolbar/AdaptiveToolbar.tsx'));
const workspaceFrame = stripComments(read('../../../../app/WorkspaceApplicationFrame.tsx'));

describe('Grid border rendering contract (Paket 17)', () => {
  it('paints the stored border in the DOM table instead of dropping it', () => {
    expect(tableCanvas).toContain('gridBorderStyleProperties');
    expect(tableCanvas).toMatch(/gridBorderStyleProperties\(cell\?\.border, coord, borderedRange, borderColour\)/);
  });

  it('paints the stored border on the canvas, above the gridline', () => {
    expect(canvasRenderer).toContain('resolveGridBorderSides');
    // The user border must be stroked after `strokeRect`, otherwise the gridline covers it.
    const gridlineIndex = canvasRenderer.indexOf('ctx.strokeRect(x, y, paintWidth, paintHeight)');
    const borderIndex = canvasRenderer.indexOf('resolveGridBorderSides(cell?.border, coord, borderedRange)');
    expect(gridlineIndex).toBeGreaterThan(-1);
    expect(borderIndex).toBeGreaterThan(gridlineIndex);
  });

  it('draws underline and strikethrough on the canvas too', () => {
    expect(canvasRenderer).toContain('cell?.underline');
    expect(canvasRenderer).toContain('cell?.strikethrough');
  });
});

describe('Grid formatting wiring contract (Paket 15–19)', () => {
  it('routes the dialog through the reviewed, fail-closed formatting entry', () => {
    expect(gridSheet).toContain('onApplyFormat={state.applyReviewedFormatToSelection}');
    expect(gridSheet).toContain('onApplyNumberFormat={applyNumberFormatToSelection}');
    expect(gridSheet).toContain('onApplyTableStyle={applyTableStyleToSelection}');
    // The unreviewed entry stays for the toolbar toggles, but the dialog must not use it.
    expect(panel).not.toContain('onApplyFormat: (patch: Partial<GridCell>) => void');
  });

  it('keeps both standard-format surfaces on the canonical preset list', () => {
    expect(toolbar).toContain('GRID_TOOLBAR_NUMBER_FORMAT_IDS');
    expect(toolbar).toContain('findGridNumberFormatPreset');
    expect(stateHook).toContain('gridNumberFormatPatch');
    expect(panel).toContain('GRID_NUMBER_FORMAT_PRESETS');
    // The old inline preset table must be gone: it was a second definition of the same fact.
    expect(panel).not.toContain('NUMBER_FORMATS:');
    // The button list itself must be the canonical one, not a hand-written subset.
    expect(toolbar).toMatch(/\{GRID_TOOLBAR_NUMBER_FORMAT_IDS\.map\(/);
    expect(toolbar).not.toMatch(/\{\(\['currency', 'percent', 'number'\] as const\)\.map\(/);
  });

  it('validates colours, borders and format codes before they reach a cell', () => {
    expect(stateHook).toContain('normalizeGridColour');
    expect(stateHook).toContain('isGridBorder');
    expect(stateHook).toContain('checkGridNumberFormatCode');
  });

  it('records formatting-only edits in the document history diff', () => {
    expect(stateHook).toContain('collectChangedGridCoordinates');
    // The value/formula-only diff must no longer be the history driver.
    expect(stateHook).not.toMatch(/before\?\.value !== after\?\.value \|\| before\?\.formula !== after\?\.formula/);
  });

  it('wires the four shell quick formats and the full preset catalogue into the Grid', () => {
    // The one contract file names the fourth quick format and the two real operations.
    expect(formatContract).toContain("export type GridToolbarQuickFormat = 'number' | 'currency' | 'percent' | 'date'");
    expect(formatContract).toContain('applyQuickFormat');
    expect(formatContract).toContain('applyNumberFormat');
    // The shell toolbar renders four visible quick actions and a real menu, not a dummy.
    expect(adaptiveToolbar).toContain('data-adaptive-format-action');
    expect(adaptiveToolbar).toContain('numberFormatPresets');
    expect(adaptiveToolbar).toContain('onApplyNumberFormat');
    expect(adaptiveToolbar).toContain('role="menu"');
    // Runde 41: the dropdown must be a body portal above every Grid stacking context.
    expect(adaptiveToolbar).toContain('createPortal');
    expect(adaptiveToolbar).toContain("position: 'fixed'");
    expect(adaptiveToolbar).toContain('2_147_483_000');
    expect(adaptiveToolbar).toContain("'number'");
    expect(adaptiveToolbar).toContain("'currency'");
    expect(adaptiveToolbar).toContain("'percent'");
    expect(adaptiveToolbar).toContain("'date'");
    // Frame passes the canonical catalogue and the action handle; GridSheet executes it.
    expect(workspaceFrame).toContain('GRID_NUMBER_FORMAT_PRESETS');
    expect(workspaceFrame).toContain('gridToolbarFormatActionsRef');
    expect(workspaceFrame).toContain('applyQuickFormat');
    expect(workspaceFrame).toContain('applyNumberFormat');
    expect(gridSheet).toContain('gridToolbarFormatActionsRef');
    expect(gridSheet).toContain('applyNumberFormatToSelection(format)');
  });

  it('applies a structured-table theme as a real cell patch', () => {
    expect(stateHook).toContain('gridStructuredTableStylePatch');
    // The themed cell map must be the one that is persisted, and the table object with it.
    expect(stateHook).toMatch(/const updatedCells = gridStructuredTableStylePatch\(themed, cells\);/);
    expect(stateHook).toMatch(/persistCellChanges\(updatedCells, coordinates, \{\s*tables:/);
  });

  it('gives the conditional-format dialog a preview and a visible error path', () => {
    // The preview must come from the pure builder, and its availability must be observable
    // in the DOM — a hard-coded marker would hide a broken rule.
    expect(panel).toContain('buildGridConditionalPreview');
    expect(panel).toContain('checkGridConditionalDraft');
    expect(panel).toMatch(/data-grid-cf-preview=\{preview\.available \? 'available' : 'blocked'\}/);
    expect(panel).toMatch(/data-grid-cf-sample=\{cell\.coord\}/);
    expect(panel).toContain('role={status.kind === \'error\' ? \'alert\' : \'status\'}');
  });
});
