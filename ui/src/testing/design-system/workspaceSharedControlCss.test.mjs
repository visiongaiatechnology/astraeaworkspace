// STATUS: PLATIN — shared theme CSS contract and content-surface boundaries.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = [
  '../../design-system/styles/index.css',
  '../../design-system/styles/foundation.css',
  '../../design-system/styles/app-primitives.css',
  '../../design-system/styles/app-accessibility.css',
  '../../design-system/styles/theme-layer.css',
  '../../design-system/styles/module-accessibility.css',
  '../../design-system/styles/workspace-interaction.css',
  '../../design-system/styles/shell-surfaces.css',
  '../../design-system/styles/shared-controls.css',
  '../../design-system/styles/content-color-policy.css',
  '../../design-system/styles/module-shells.css',
].map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
const parsedCss = postcss.parse(css);
const rules = [];
parsedCss.walkRules((rule) => { rules.push(rule); });

function findRule(predicate) {
  return rules.find(predicate);
}

function declarations(rule) {
  const values = new Map();
  rule?.walkDecls((declaration) => { values.set(declaration.prop, declaration.value); });
  return values;
}

describe('shared Workspace theme CSS', () => {
  it('parses as valid PostCSS and keeps the primary foreground dynamically palette-bound', () => {
    expect(() => { postcss.parse(css); }).not.toThrow();
    expect(css).not.toMatch(/--vgt-on-accent\s*:\s*#fff\s*;/i);
    expect(css).toContain('color: var(--vgt-on-accent, #fff);');
  });

  it('themes all module outer surfaces while leaving document/canvas colors to their own content', () => {
    const shellRule = findRule((rule) =>
      rule.selector.includes('.writer-a11y-root')
      && rule.selector.includes('[data-vgt-connect-root="true"]')
      && rule.nodes?.some((node) => node.type === 'decl' && node.prop === 'background-color' && node.value.includes('--vgt-module-shell-surface')) === true,
    );
    expect(shellRule).toBeDefined();
    for (const root of [
      '[data-vgt-admin-policy="true"]', '[data-vgt-search-hub="true"]',
      '[data-vgt-automate-root="true"]', '[data-vgt-connect-root="true"]', '[data-vgt-database-root="true"]',
      '[data-vgt-draw-root="true"]', '[data-vgt-forms-root="true"]', '[data-vgt-gaiacom-root="true"]',
      '[data-vgt-grid-root="true"]', '[data-vgt-insight-root="true"]', '[data-vgt-notes-root="true"]',
      '[data-vgt-pdf-root="true"]', '[data-vgt-planner-root="true"]', '[data-vgt-present-root="true"]',
      '[data-vgt-projects-root="true"]', '[data-vgt-publish-root="true"]', '[data-vgt-spaces-root="true"]',
      '[data-vgt-tasks-root="true"]', '[data-vgt-vault-root="true"]', '[data-vgt-whiteboard-root="true"]',
    ]) expect(shellRule?.selector).toContain(root);
    expect(shellRule?.selector).not.toContain(' *');
    expect(declarations(shellRule).get('color')).toBeUndefined();

    const appPanelRule = findRule((rule) =>
      rule.selector.includes('[data-vgt-connect-root="true"]')
      && rule.selector.includes('[class~="bg-slate-950"]')
      && rule.nodes?.some((node) => node.type === 'decl' && node.prop === 'background-color' && node.value.includes('--vgt-module-panel-surface')) === true,
    );
    expect(appPanelRule).toBeDefined();
    expect(appPanelRule?.selector).not.toMatch(/data-vgt-(?:admin-policy|draw|grid|pdf|present|publish|whiteboard)-root/);
    expect(appPanelRule?.selector).toContain(':not([data-color])');
    expect(appPanelRule?.selector).toContain(':not([data-swatch])');
    expect(appPanelRule?.selector).toContain(':not([contenteditable="true"])');
  });

  it('keeps Sovereign Gold work areas graphite and confines metallic treatment to shell edges', () => {
    const themeSurfaceBridge = findRule((rule) =>
      rule.selector === ':root'
      && rule.nodes?.some((node) => node.type === 'decl' && node.prop === '--vgt-module-shell-surface') === true,
    );
    const surfaceTokens = declarations(themeSurfaceBridge);
    expect(surfaceTokens.get('--vgt-module-shell-surface')).toContain('--as-bg-environment');
    expect(surfaceTokens.get('--vgt-module-panel-surface')).toContain('--as-bg-workbench');
    expect(surfaceTokens.get('--vgt-module-control-surface')).toContain('--as-bg-control');
    expect(surfaceTokens.get('--vgt-module-control-hover')).toContain('--as-bg-control-hover');
    expect(findRule((rule) => rule.selector.includes('[data-vgt-theme="sovereign-gold"]'))).toBeUndefined();

    const chromeRule = findRule((rule) =>
      rule.selector.includes('[data-vgt-connect-root="true"]')
      && rule.selector.includes(':where([role="toolbar"]')
      && rule.nodes?.some((node) => node.type === 'decl' && node.prop === 'background-color' && node.value.includes('--vgt-module-panel-surface')) === true,
    );
    expect(chromeRule).toBeDefined();
    expect(declarations(chromeRule).get('box-shadow')).toContain('--vgt-metal-highlight');
    expect(declarations(chromeRule).get('border-color')).toBe('var(--vgt-control-border)');
  });

  it('keeps hover, focus, disabled, scrollbar and forced-colors contracts active', () => {
    expect(css).toContain('.vgt-input:hover:not(:disabled)');
    expect(css).toContain('.vgt-button-primary:hover:not(:disabled)');
    expect(css).toContain('[aria-disabled="true"]');
    expect(css).toContain('[data-astraea-shell-root="true"] :focus-visible');
    expect(css).toContain('.vgt-horizontal-scroll {');
    expect(css).toContain('scrollbar-color: var(--as-scroll-thumb');
    expect(css).toContain('var(--as-selection-contrast');
    expect(css).toContain('outline-width: 3px !important');
    expect(css).not.toContain('filter: contrast(1.12)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).not.toMatch(/\[class\*=["']\/["']\]/);
  });
});
