// STATUS: PLATIN — source contract: every capability of Pakete 20–30 has a caller in the app.
//
// W-313 in this project was "logic built, tested, and imported by nothing". These assertions are the
// counter-measure: they read the real production files and fail when a capability loses its caller.
// Behaviour is verified by the unit tests; this file only verifies *reachability*.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const grid = resolve(here, '..', '..');

function read(relativePath) {
  return readFileSync(resolve(grid, relativePath), 'utf8');
}

/** Removes `//` and `/* *\/` comments so "removed behaviour" cannot satisfy an assertion. */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('Grid formula assistant is reachable from the real surface', () => {
  const bar = withoutComments(read('toolbar/GridFormulaBar.tsx'));
  const sheet = withoutComments(read('GridSheet.tsx'));

  it('mounts the assistant in the formula bar and imports its decision layer', () => {
    expect(bar).toContain("from '../formulas/GridFormulaAssistant'");
    expect(bar).toContain('<GridFormulaAssistant');
    expect(bar).toContain("from '../formulas/gridFormulaAssist'");
    expect(bar).toContain('toggleGridFormulaReferenceAbsolute');
  });

  it('offers a discoverable trigger and binds it to the assistant state', () => {
    expect(bar).toContain('data-grid-primary-action="formula-assistant"');
    expect(bar).toContain('assistantAvailable');
    expect(bar).toContain('setAssistantOpen');
    expect(bar).toContain('aria-haspopup="dialog"');
    // The assistant must be guarded by the real availability expression, not by a constant. A
    // `{false && (` guard would keep every string above present while making the surface unreachable.
    expect(bar).toContain('{assistantAvailable && (');
    expect(bar).not.toContain('{false && (');
    expect(bar).toContain('const assistantAvailable = Boolean(cells)');
  });

  it('keeps keyboard operation wired: F4 toggles the absolute reference', () => {
    expect(bar).toContain("event.key === 'F4'");
    expect(bar).toContain('onReplaceFormula(toggled.formula, toggled.caret)');
  });

  it('supplies the cell map, the time zone and the bounded output check from the sheet', () => {
    expect(sheet).toContain('<GridFormulaBar');
    expect(sheet).toContain('cells={cells}');
    expect(sheet).toContain('onCheckFormulaOutput={handleCheckFormulaOutput}');
    expect(sheet).toContain('onReplaceFormula={');
    expect(sheet).toContain("from './formulas/gridFormulaAssist'");
    expect(sheet).toContain('planGridFormulaInsertion');
  });

  it('evaluates the output check through the same engine the commit path uses', () => {
    expect(sheet).toContain('prepareFormulaForEvaluation');
    expect(sheet).toContain('formulaEvaluationContext');
    expect(sheet).toContain('evaluateFormula(');
    const state = withoutComments(read('state/useGridState.ts'));
    // The two helpers must be part of the state surface, otherwise the check cannot reuse them.
    expect(state).toContain('prepareFormulaForEvaluation,');
    expect(state).toContain('formulaEvaluationContext,');
  });

  it('delegates every assistant decision to the shared engines instead of a second implementation', () => {
    const assist = withoutComments(read('formulas/gridFormulaAssist.ts'));
    expect(assist).toContain("from './gridFormulaCatalog'");
    expect(assist).toContain("from './gridFormulaDiagnostics'");
    expect(assist).toContain("from './gridFormulaSpill'");
    expect(assist).toContain("from './gridFormulaCycle'");
    expect(assist).toContain("from './gridFormulaReferences'");
    expect(assist).toContain("from './gridFormulaLambda'");
    // No private function catalogue, no private error table, no private A1 regex parser.
    expect(assist).not.toMatch(/const\s+\w*FUNCTION\w*\s*=\s*\[/);
    expect(assist).not.toMatch(/'#NAME\?'/);
  });
});

describe('Grid multi-level sort is reachable and validated on the real surface', () => {
  const panel = withoutComments(read('panels/GridDataPanel.tsx'));
  const professional = withoutComments(read('panels/GridProfessionalPanel.tsx'));
  const sheet = withoutComments(read('GridSheet.tsx'));

  it('validates a new level before writing it and reports the reason', () => {
    expect(panel).toContain("from '../data/gridSortDialog'");
    expect(panel).toContain('validateGridSortLevels(candidate, sortColumnCount)');
    expect(panel).toContain('setSortIssues(issues)');
    expect(panel).toContain('role="alert"');
    expect(panel).toContain('copy.sortRejected');
  });

  it('previews the sort from the real cell map instead of claiming behaviour it cannot show', () => {
    expect(panel).toContain('previewGridSort({');
    expect(panel).toContain('describeGridSortPreview(sortPreview)');
    expect(panel).toContain('aria-live="polite"');
  });

  it('keeps the sort-level list keyboard operable with bounded reordering', () => {
    expect(panel).toContain('moveGridSortLevel(sorts, index, -1)');
    expect(panel).toContain('moveGridSortLevel(sorts, index, 1)');
    expect(panel).toContain('removeGridSortLevel(sorts, index)');
    expect(panel).toContain('setGridSortLevelDirection(sorts, index');
    expect(panel).toContain('copy.moveSortLevelUp');
    expect(panel).toContain('copy.moveSortLevelDown');
  });

  it('receives cells, column count and row count through the professional panel', () => {
    expect(professional).toContain('cells={cells}');
    expect(professional).toContain('columnCount={colCount}');
    expect(professional).toContain('rowCount={rowCount}');
    expect(sheet).toContain('rowCount={rowCount}');
    expect(sheet).toContain('colCount={colCount}');
  });

  it('delegates ordering and validation to the canonical planner instead of a second comparator', () => {
    const dialog = withoutComments(read('data/gridSortDialog.ts'));
    expect(dialog).toContain("from './gridDataProjection'");
    expect(dialog).toContain('validateProjectionRequest');
    expect(dialog).toContain('planGridProjection');
    expect(dialog).toContain('projectionPreservesSourceRows');
    // No locale-aware comparator of its own.
    expect(dialog).not.toContain('localeCompare');
    expect(dialog).not.toMatch(/\.sort\(\(/);
  });

  it('keeps the renderer path on the sheet model so the sort is actually visible', () => {
    // The row projection the canvas honours must still be derived from the sheet's sort rules.
    expect(sheet).toContain('buildGridRowProjection');
    expect(sheet).toContain('sortRules:');
    expect(sheet).toContain('rowProjection={rowProjection}');
  });
});

describe('Grid locale copy stays complete for the new surfaces', () => {
  it('provides the sort-dialog keys in all seven locales', () => {
    const locale = withoutComments(read('locale/gridDataLocale.ts'));
    const occurrences = (needle) => locale.split(needle).length - 1;
    expect(occurrences('moveSortLevelUp:')).toBeGreaterThanOrEqual(8); // interface + 7 locales
    expect(occurrences('moveSortLevelDown:')).toBeGreaterThanOrEqual(8);
    expect(occurrences('sortRejected:')).toBeGreaterThanOrEqual(8);
  });

  it('provides the formula-assistant copy in all seven locales', () => {
    const locale = withoutComments(read('locale/gridFormulaAssistantLocale.ts'));
    for (const key of ['de-DE', 'en-US', 'ru-RU', 'it-IT', 'es-ES', 'ja-JP', 'zh-CN']) {
      expect(locale).toContain(`'${key}': {`);
    }
  });
});
