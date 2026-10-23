import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const localDirectory = new URL('./', import.meta.url);
const css = readFileSync(new URL('../../toolbar/GridFormulaBar.css', localDirectory), 'utf8');
const parsedCss = postcss.parse(css);
const rules = [];
parsedCss.walkRules((rule) => rules.push(rule));

const findRule = (selector) => rules.find((rule) => rule.selector === selector);
const findRuleContaining = (selectorPart) => rules.find((rule) => rule.selector.includes(selectorPart));
const declarations = (rule) => {
  const values = new Map();
  rule?.walkDecls((decl) => values.set(decl.prop, decl.value));
  return values;
};

describe('Grid formula toolbar responsive disclosure', () => {
  it('keeps the toolbar row unclipped and places its disclosure outside Grid scroll clipping', () => {
    expect(() => postcss.parse(css)).not.toThrow();
    const toolbar = findRule('.vgt-grid-formula-toolbar[data-grid-formula-toolbar="true"]');
    expect(declarations(toolbar).get('overflow')).toBe('visible');
    expect(declarations(toolbar).get('width')).toBe('100%');
    expect(css).not.toMatch(/overflow-x\s*:\s*(?:auto|hidden|scroll)/);

    const panel = findRule('.vgt-grid-toolbar-more-panel');
    expect(declarations(panel).get('position')).toBe('fixed');
    expect(declarations(panel).get('z-index')).toBe('1000');
    expect(declarations(panel).get('max-height')).toContain('dvh');
    expect(declarations(panel).get('overflow')).toBe('auto');
  });

  it('moves primary formatting and shortcuts into the disclosure on compact workspaces', () => {
    expect(findRuleContaining('.vgt-grid-formula-toolbar[data-compact-layout="true"] .vgt-grid-format-inline')).toBeDefined();
    expect(findRuleContaining('.vgt-grid-formula-toolbar[data-compact-layout="true"] .vgt-grid-primary-action')).toBeDefined();
    expect(findRule('.vgt-grid-toolbar-more-panel[data-compact-layout="true"] .vgt-grid-toolbar-responsive-format-group')).toBeDefined();
    expect(findRule('.vgt-grid-toolbar-more-panel[data-compact-layout="true"] .vgt-grid-toolbar-responsive-shortcuts')).toBeDefined();
    expect(findRule('.vgt-grid-toolbar-more-panel[data-compact-layout="true"] .vgt-grid-toolbar-menu-common-action')).toBeDefined();

    const hidden = findRule('.vgt-grid-toolbar-menu-common-action,\n.vgt-grid-toolbar-responsive-format-group,\n.vgt-grid-toolbar-responsive-shortcuts');
    expect(declarations(hidden).get('display')).toBe('none');
  });

  it('uses active Workspace tokens for menu surfaces, controls, focus, and scrollbar', () => {
    expect(css).toContain('--vgt-module-panel-surface');
    expect(css).toContain('--vgt-control-border');
    expect(css).toContain('--vgt-control-text');
    expect(css).toContain('--vgt-control-hover');
    expect(css).toContain('--vgt-accent-strong');
    expect(css).toContain('--vgt-scrollbar-thumb');
  });
});
