// STATUS: DIAMANT VGT SUPREME
// Source contract: every function the engine implements must be advertised by the
// canonical function catalogue (gridFormulaCatalog.ts).
//
// A drift between the two is a product defect in both directions: autocomplete and the
// function assistant would hide a working function, and `diagnoseFormula` would report a
// false `#NAME?` for it. This is a source-contract test, read with node:fs, because the
// catalogue and the engine modules cannot be imported without a TypeScript transform.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const formulasDir = resolve(here, '../../formulas');

/** Engine modules whose `case 'NAME':` labels are function implementations. */
const ENGINE_MODULES = [
  'gridFormulaMath.ts',
  'gridFormulaStats.ts',
  'gridFormulaText.ts',
  'gridFormulaDate.ts',
  'gridFormulaFinance.ts',
  'gridFormulaInfoLookup.ts',
  'gridFormulaDynamicLookup.ts',
  'gridFormulaAdvanced.ts',
  'gridFormulaFunctionDispatcher.ts',
  'legacy/gridStatisticsToolpak.ts',
];

/** `case` labels in these modules that are not function names. */
const NON_FUNCTION_LABELS = new Set([
  'Y',
  'M',
  'D',
  'MD',
  'YM',
  'YD',
]);

function readModule(relativePath) {
  return readFileSync(join(formulasDir, relativePath), 'utf8');
}

function engineFunctionNames() {
  const names = new Set();
  for (const modulePath of ENGINE_MODULES) {
    const source = readModule(modulePath);
    const pattern = /^\s*case\s+'([^']+)'/gm;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const label = match[1];
      if (NON_FUNCTION_LABELS.has(label)) continue;
      if (!/^[A-Z][A-Z0-9.]*$/.test(label)) continue;
      names.add(label);
    }
  }
  return names;
}

function catalogueNames() {
  const source = readModule('gridFormulaCatalog.ts');
  const names = new Set();
  const pattern = /name:\s*'([A-Z][A-Z0-9.]*)'/g;
  let match;
  while ((match = pattern.exec(source)) !== null) names.add(match[1]);
  return names;
}

describe('formula catalogue coverage (source contract)', () => {
  it('parses both sides of the contract', () => {
    const engine = engineFunctionNames();
    const catalogue = catalogueNames();
    // Sanity floors so a broken extraction cannot make the assertion vacuous.
    expect(engine.size).toBeGreaterThan(100);
    expect(catalogue.size).toBeGreaterThan(100);
    expect(engine.has('SUM')).toBe(true);
    expect(engine.has('XLOOKUP')).toBe(true);
    expect(catalogue.has('SUM')).toBe(true);
    expect(catalogue.has('XLOOKUP')).toBe(true);
  });

  it('advertises every function the engine implements', () => {
    const engine = engineFunctionNames();
    const catalogue = catalogueNames();
    const missing = [...engine].filter((name) => !catalogue.has(name)).sort();
    expect(missing).toEqual([]);
  });

  it('does not advertise functions the engine cannot dispatch', () => {
    const engine = engineFunctionNames();
    const catalogue = catalogueNames();
    // Dispatcher-handled names are added to the engine side explicitly, because the
    // dispatcher uses `if (name === ...)` rather than `case` labels for most of them.
    const dispatcherNames = [
      'IF', 'IFS', 'SWITCH', 'IFERROR', 'IFNA', 'AND', 'OR', 'XOR', 'NOT',
      'LET', 'LAMBDA', 'MAP', 'REDUCE', 'SCAN', 'BYROW', 'BYCOL', 'TRUE', 'FALSE',
      'INDIRECT', 'VGTREF', 'OFFSET', 'ROW', 'COLUMN', 'ROWS', 'COLUMNS',
      'TRANSPOSE', 'MMULT', 'MDETERM', 'MINVERSE',
    ];
    for (const name of dispatcherNames) engine.add(name);
    const unavailable = [...catalogue].filter((name) => !engine.has(name)).sort();
    expect(unavailable).toEqual([]);
  });
});
