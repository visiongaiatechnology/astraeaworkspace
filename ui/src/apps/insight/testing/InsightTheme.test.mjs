// STATUS: PLATIN — theme regression contract for Insight-owned analytics chrome.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../theme/insightTheme.css');
const source = read('../views/InsightView.tsx');
const cards = read('../components/InsightKpiCards.tsx');
const table = read('../components/InsightPivotTable.tsx');
const queryBuilder = read('../components/InsightQueryBuilder.tsx');
const rules = [];
postcss.parse(css).walkRules((rule) => rules.push(rule));

describe('Insight Workspace theme contract', () => {
  it('scopes every theme rule to the Insight root and consumes shared surface/text tokens', () => {
    expect(rules.length).toBeGreaterThan(10);
    for (const rule of rules) expect(rule.selector).toContain('[data-vgt-insight-root="true"]');
    expect(css).toContain('background-color: var(--vgt-surface-z0');
    expect(css).toContain('background-color: var(--vgt-surface-z1');
    expect(css).toContain('background-color: var(--vgt-surface-z2');
    expect(css).toContain('color: var(--vgt-text-primary');
    expect(css).toContain('color: var(--vgt-accent-strong');
    expect(css).toContain('background-color: var(--vgt-accent-solid');
  });

  it('themes region filters, controls and total hierarchy with contrast-aware active text', () => {
    expect(source).toContain("import '../theme/insightTheme.css';");
    expect(source).toContain('className={`insight-region-segment');
    expect(css).toContain('.insight-region-segment:nth-child(odd)');
    expect(css).toContain('.insight-region-segment:nth-child(even)');
    expect(css).toContain('color: var(--vgt-on-accent');
    expect(css).toContain('var(--vgt-control-surface');
    expect(css).toContain('var(--vgt-control-hover');
    expect(table).toContain('text-[var(--vgt-accent-strong)]');
    expect(cards).toContain('text-rose-400 font-semibold');
  });

  it('builds the query pipeline from theme-owned materials and stacks it at narrow widths', () => {
    expect(source).toContain('className="insight-data-layout"');
    expect(queryBuilder).toContain('className="insight-query-panel"');
    expect(queryBuilder).toContain('className="insight-query-step"');
    expect(queryBuilder).not.toContain('bg-[#0c0817]');
    expect(queryBuilder).not.toContain('border-purple-500');
    expect(css).toContain('.insight-query-panel');
    expect(css).toContain('var(--vgt-surface-z1');
    expect(css).toContain('var(--vgt-metal-edge');
    expect(css).toContain('@media (max-width: 900px)');
  });

  it('preserves semantic positive trends and accessibility preferences', () => {
    expect(cards).toContain('text-emerald-400 font-semibold');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(':focus-visible');
  });

  it('reflows KPI cards at maximum Workspace scale and bounds long values within each card', () => {
    expect(cards).toContain('className="insight-kpi-grid');
    expect(cards).toContain('className="insight-kpi-card');
    expect(cards).toContain('className="insight-kpi-value');
    expect(css).toContain(':root[data-astraea-scale-band="maximum"] [data-vgt-insight-root="true"] .insight-kpi-grid');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(css).toContain('container-type: inline-size');
    expect(css).toContain('overflow-wrap: anywhere');
  });
});
