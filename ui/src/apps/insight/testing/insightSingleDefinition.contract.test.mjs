// STATUS: PLATIN — BATCH-INSIGHT-1 source contract: ONE aggregation definition for Astraea Insight.
//
// Measured before this test existed (see BATCH-INSIGHT/INVENTORY.md):
//  - `queries/insightQueryEngine.ts:8` carried the bounded `agg()` switch (COUNT/COUNT_DISTINCT/
//    SUM/AVG/MIN/MAX).
//  - `components/InsightPivotTable.tsx:44-51` carried a SECOND, hand-written aggregation switch
//    over the same six function names, with different weights: it had no COUNT_DISTINCT (silent 0)
//    and it accumulated totals as the sum of already-aggregated cells.
// Two definitions of one fact is the defect this contract removes. Comments are stripped first so
// documentation can never satisfy the contract.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const strip = (source) => {
  let out = '';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 1; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; continue; }
    if (ch === '/' && next === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? source.length : end + 1; continue; }
    if (ch === '/' && next === '/') { const end = source.indexOf('\n', i); i = end === -1 ? source.length : end; continue; }
    out += ch;
  }
  return out;
};

const root = new URL('../', import.meta.url);
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const entry = new URL(name, dir);
  if (statSync(entry).isDirectory()) return walk(new URL(`${name}/`, dir));
  return /\.(?:ts|tsx)$/.test(name) ? [entry] : [];
});
const sources = walk(root)
  .filter((entry) => !entry.pathname.includes('/testing/'))
  .map((entry) => ({ path: decodeURIComponent(entry.pathname).split('/insight/').at(-1), raw: readFileSync(entry, 'utf8') }))
  .map((file) => ({ ...file, code: strip(file.raw) }));

const read = (relative) => strip(readFileSync(new URL(relative, import.meta.url), 'utf8'));

describe('Insight single aggregation definition', () => {
  it('implements every aggregation function in exactly one module', () => {
    // Only core/insightCore.ts may switch on an aggregation function.
    const switches = sources.filter((file) => /case\s*'COUNT_DISTINCT'/.test(file.code)).map((file) => file.path);
    expect(switches).toEqual(['core/insightCore.ts']);
    // Everywhere else the name may only be declared (domain type), named (locale) or listed
    // (the pivot's button list). A fourth implementation site would appear here.
    const mentions = sources.filter((file) => file.code.includes('COUNT_DISTINCT')).map((file) => file.path);
    expect(mentions.sort()).toEqual([
      'core/insightCore.ts',
      'domain/types.ts',
      'locale/insightLocale.ts',
      'pivot/insightPivotCore.ts',
    ]);
  });

  it('has both the executor and the visible matrix call that one definition', () => {
    const engine = read('../queries/insightQueryEngine.ts');
    expect(engine).toContain('const agg=aggregateInsightScalars;');
    expect(engine).not.toContain('case\'COUNT_DISTINCT\'');
    const pivot = read('../components/InsightPivotTable.tsx');
    expect(pivot).toContain('buildInsightPivot(');
    expect(pivot).not.toMatch(/aggFunc\s*===\s*'AVG'/);
    expect(pivot).not.toMatch(/aggFunc\s*===\s*'SUM'/);
    expect(pivot).not.toContain('COUNT_DISTINCT');  });

  it('keeps the shared aggregation bounded and fail-closed on an unknown function', () => {
    const core = read('../core/insightCore.ts');
    expect(core).toContain('export function aggregateInsightScalars(');
    expect(core).toContain("throw new InsightError('insight-aggregate-invalid')");
  });

  it('keeps the pivot geometry in its own pure module, not inside the component', () => {
    const pivot = read('../components/InsightPivotTable.tsx');
    expect(pivot).toContain("from '../pivot/insightPivotCore'");
    // No inline group-by loops in the component: the geometry is pure and separately testable.
    for (const forbidden of ['for (const rVal of', 'rowTotals[rVal] =', 'const matrix: Record<string, Record<string, number>> = {}']) {
      expect(pivot).not.toContain(forbidden);
    }
  });

  it('has no second aggregation left in the semantic expression engine (D-INSIGHT-AGG-02)', () => {
    const semantic = read('../semantic/insightSemanticEngine.ts');
    expect(semantic).toContain('aggregateInsightScalars(');
    // The removed switch had one branch per function name; none of them may come back.
    for (const forbidden of ["if(fn==='SUM')", "if(fn==='AVG')", "if(fn==='MIN')", "if(fn==='MAX')", "if(fn==='COUNT')"]) {
      expect(semantic).not.toContain(forbidden);
    }
    // The export engine must reach the shared chart stack instead of rendering its own chart. The only
    // permitted SVG mention is the guard that checks the shared renderer's output.
    const exportEngine = read('../export/insightExportEngine.ts');
    expect(exportEngine).toContain("from '../../../shared/charts/chartSvgRenderer'");
    expect(exportEngine).toContain("from '../../../shared/charts/export/chartVectorPdf'");
    for (const ownMarkup of ['<svg xmlns', '<rect', '<path', '<circle', '<polygon']) {
      expect(exportEngine).not.toContain(ownMarkup);
    }
  });
});
